import { supabaseAdmin } from '../database/client.js';

interface AuditLogEntry {
  user_id: string;
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  table_name: string;
  record_id?: string;
  changes?: object;
  ip_address?: string;
  user_agent?: string;
}

export async function logDataAccess(
  userId: string,
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE',
  tableName: string,
  recordId?: string,
  changes?: object
): Promise<void> {
  try {
    const auditEntry: AuditLogEntry = {
      user_id: userId,
      operation,
      table_name: tableName,
      record_id: recordId,
      changes,
      // In a real implementation, these would come from the request context
      ip_address: '127.0.0.1', // placeholder
      user_agent: 'MCP-Server/1.0.0', // placeholder
    };

    const { error } = await supabaseAdmin
      .from('data_access_log')
      .insert(auditEntry);

    if (error) {
      console.error('Failed to log audit entry:', error);
      // Don't throw here to avoid breaking the main operation
    }
  } catch (error) {
    console.error('Audit logging error:', error);
    // Don't throw here to avoid breaking the main operation
  }
}

export async function getAuditLog(
  userId: string,
  options: {
    operation?: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
    tableName?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  let query = supabaseAdmin
    .from('data_access_log')
    .select('*')
    .eq('user_id', userId);

  if (options.operation) {
    query = query.eq('operation', options.operation);
  }

  if (options.tableName) {
    query = query.eq('table_name', options.tableName);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(options.offset || 0, (options.offset || 0) + (options.limit || 100) - 1);

  if (error) {
    throw new Error(`Failed to retrieve audit log: ${error.message}`);
  }

  return data;
}