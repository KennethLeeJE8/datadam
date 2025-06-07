import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { supabaseAdmin } from '../../database/client.js';
import { logDataAccess } from '../../security/audit.js';
import { createRequestLogger, ErrorCategory } from '../../utils/logger.js';
import { errorRecovery } from '../../utils/errorRecovery.js';

// Input validation schemas
const ExtractPersonalDataSchema = z.object({
  user_id: z.string(),
  data_types: z.array(z.enum(['contact', 'document', 'preference', 'custom'])).optional(),
  filters: z.record(z.unknown()).optional(),
  limit: z.number().min(1).max(500).default(50),
  offset: z.number().min(0).default(0),
});

const CreatePersonalDataSchema = z.object({
  user_id: z.string(),
  data_type: z.enum(['contact', 'document', 'preference', 'custom']),
  title: z.string().min(1).max(255),
  content: z.record(z.unknown()),
  tags: z.array(z.string()).optional(),
  classification: z.enum(['public', 'personal', 'sensitive', 'confidential']).default('personal'),
});

const UpdatePersonalDataSchema = z.object({
  record_id: z.string(),
  updates: z.record(z.unknown()),
});

const DeletePersonalDataSchema = z.object({
  record_ids: z.array(z.string()),
  hard_delete: z.boolean().default(false),
});

const SearchPersonalDataSchema = z.object({
  user_id: z.string(),
  query: z.string().min(1),
  data_types: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(20),
});

const AddPersonalDataFieldSchema = z.object({
  field_name: z.string().min(1),
  data_type: z.enum(['string', 'number', 'date', 'json', 'encrypted']),
  validation_rules: z.record(z.unknown()).default({}),
  is_required: z.boolean().default(false),
  default_value: z.unknown().optional(),
});

export function setupPersonalDataTools(server: Server): void {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionId = (args as any)?.session_id || 'default';
    const requestLogger = createRequestLogger(requestId, sessionId);
    
    requestLogger.info(`Tool request started: ${name}`, {
      toolName: name,
      operation: 'tool_call',
    });

    try {
      let result;
      const startTime = Date.now();

      switch (name) {
        case 'extract_personal_data':
          result = await handleExtractPersonalData(args, requestLogger);
          break;

        case 'create_personal_data':
          result = await handleCreatePersonalData(args, requestLogger);
          break;

        case 'update_personal_data':
          result = await handleUpdatePersonalData(args, requestLogger);
          break;

        case 'delete_personal_data':
          result = await handleDeletePersonalData(args, requestLogger);
          break;

        case 'search_personal_data':
          result = await handleSearchPersonalData(args, requestLogger);
          break;

        case 'add_personal_data_field':
          result = await handleAddPersonalDataField(args, requestLogger);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      const duration = Date.now() - startTime;
      requestLogger.info(`Tool request completed: ${name}`, {
        toolName: name,
        operation: 'tool_call',
        duration,
      });

      return result;
    } catch (error) {
      const toolError = error as Error;
      requestLogger.error(
        `Tool request failed: ${name}`,
        toolError,
        ErrorCategory.BUSINESS_LOGIC,
        {
          toolName: name,
          operation: 'tool_call',
        }
      );

      // Attempt error recovery
      const recoveryResult = await errorRecovery.attemptRecovery(
        toolError,
        {
          toolName: name,
          operation: 'tool_call',
          requestId,
          sessionId,
          metadata: { args },
        },
        requestLogger.getCorrelationId()
      );

      if (recoveryResult.success && recoveryResult.data) {
        requestLogger.info(`Error recovery succeeded for tool: ${name}`, {
          toolName: name,
          recoveryStrategy: 'auto_recovery',
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                warning: 'Request completed with fallback data',
                data: recoveryResult.data,
                message: recoveryResult.message,
              }, null, 2),
            },
          ],
          isError: false,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${toolError.message}`,
          },
        ],
        isError: true,
      };
    }
  });
}

async function handleExtractPersonalData(args: unknown, requestLogger: any) {
  try {
    const params = ExtractPersonalDataSchema.parse(args);
    requestLogger.debug('Validation passed for extract_personal_data', {
      userId: params.user_id,
    });
    
    let query = supabaseAdmin
      .from('personal_data')
      .select('*')
      .eq('user_id', params.user_id);

    if (params.data_types && params.data_types.length > 0) {
      query = query.in('data_type', params.data_types);
    }

    if (params.filters) {
      Object.entries(params.filters).forEach(([key, value]) => {
        if (key === 'tags') {
          query = query.contains('tags', [value]);
        } else if (key === 'classification') {
          query = query.eq('classification', value);
        } else if (key === 'date_from') {
          query = query.gte('created_at', value);
        } else if (key === 'date_to') {
          query = query.lte('created_at', value);
        }
      });
    }

    const { data, error, count } = await query
      .range(params.offset, params.offset + params.limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      requestLogger.error(
        'Database query failed in extract_personal_data',
        error as Error,
        ErrorCategory.DATABASE,
        { userId: params.user_id }
      );
      throw new Error(`Database error: ${error.message}`);
    }

    // Log the data access
    await logDataAccess(params.user_id, 'READ', 'personal_data');
    
    requestLogger.info('Data extraction completed', {
      userId: params.user_id,
      recordCount: data?.length || 0,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            data,
            pagination: {
              offset: params.offset,
              limit: params.limit,
              total: count,
            },
            extracted_at: new Date().toISOString(),
          }, null, 2),
        },
      ],
    };
  } catch (validationError) {
    requestLogger.error(
      'Validation failed for extract_personal_data',
      validationError as Error,
      ErrorCategory.VALIDATION
    );
    throw validationError;
  }
}

async function handleCreatePersonalData(args: unknown, requestLogger: any) {
  const params = CreatePersonalDataSchema.parse(args);

  const { data, error } = await supabaseAdmin
    .from('personal_data')
    .insert({
      user_id: params.user_id,
      data_type: params.data_type,
      title: params.title,
      content: params.content,
      tags: params.tags || [],
      classification: params.classification,
    })
    .select()
    .single();

  if (error) throw new Error(`Database error: ${error.message}`);

  // Log the data creation
  await logDataAccess(params.user_id, 'CREATE', 'personal_data', data.id, data);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          record: data,
          created_at: new Date().toISOString(),
        }, null, 2),
      },
    ],
  };
}

async function handleUpdatePersonalData(args: unknown, requestLogger: any) {
  const params = UpdatePersonalDataSchema.parse(args);

  // First, get the current record to log changes
  const { data: currentRecord, error: fetchError } = await supabaseAdmin
    .from('personal_data')
    .select('*')
    .eq('id', params.record_id)
    .single();

  if (fetchError) throw new Error(`Record not found: ${fetchError.message}`);

  const { data, error } = await supabaseAdmin
    .from('personal_data')
    .update({
      ...params.updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.record_id)
    .select()
    .single();

  if (error) throw new Error(`Database error: ${error.message}`);

  // Log the data update with changes
  await logDataAccess(
    currentRecord.user_id,
    'UPDATE',
    'personal_data',
    params.record_id,
    { before: currentRecord, after: data, changes: params.updates }
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          record: data,
          updated_at: new Date().toISOString(),
        }, null, 2),
      },
    ],
  };
}

async function handleDeletePersonalData(args: unknown, requestLogger: any) {
  const params = DeletePersonalDataSchema.parse(args);

  // Get records before deletion for audit logging
  const { data: records, error: fetchError } = await supabaseAdmin
    .from('personal_data')
    .select('*')
    .in('id', params.record_ids);

  if (fetchError) throw new Error(`Error fetching records: ${fetchError.message}`);

  let result;
  if (params.hard_delete) {
    // Permanent deletion for GDPR compliance
    const { error } = await supabaseAdmin
      .from('personal_data')
      .delete()
      .in('id', params.record_ids);

    if (error) throw new Error(`Database error: ${error.message}`);
    result = { deleted_count: params.record_ids.length, hard_delete: true };
  } else {
    // Soft delete - mark as deleted but keep in database
    const { data, error } = await supabaseAdmin
      .from('personal_data')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', params.record_ids)
      .select();

    if (error) throw new Error(`Database error: ${error.message}`);
    result = { soft_deleted: data, hard_delete: false };
  }

  // Log the deletion for each record
  for (const record of records || []) {
    await logDataAccess(
      record.user_id,
      'DELETE',
      'personal_data',
      record.id,
      { record, hard_delete: params.hard_delete }
    );
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          ...result,
          deleted_at: new Date().toISOString(),
        }, null, 2),
      },
    ],
  };
}

async function handleSearchPersonalData(args: unknown, requestLogger: any) {
  const params = SearchPersonalDataSchema.parse(args);

  let query = supabaseAdmin
    .from('personal_data')
    .select('*')
    .eq('user_id', params.user_id)
    .textSearch('content', params.query);

  if (params.data_types && params.data_types.length > 0) {
    query = query.in('data_type', params.data_types);
  }

  const { data, error } = await query
    .limit(params.limit)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Database error: ${error.message}`);

  // Log the search operation
  await logDataAccess(
    params.user_id,
    'READ',
    'personal_data',
    undefined,
    { search_query: params.query, results_count: data?.length || 0 }
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          query: params.query,
          results: data,
          count: data?.length || 0,
          searched_at: new Date().toISOString(),
        }, null, 2),
      },
    ],
  };
}

async function handleAddPersonalDataField(args: unknown, requestLogger: any) {
  const params = AddPersonalDataFieldSchema.parse(args);

  const { data, error } = await supabaseAdmin
    .from('data_field_definitions')
    .insert({
      field_name: params.field_name,
      data_type: params.data_type,
      validation_rules: params.validation_rules,
      is_required: params.is_required,
      default_value: params.default_value,
    })
    .select()
    .single();

  if (error) throw new Error(`Database error: ${error.message}`);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          field_definition: data,
          created_at: new Date().toISOString(),
        }, null, 2),
      },
    ],
  };
}