import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { supabaseAdmin } from '../../database/client.js';
import { CategoryManager } from '../../services/CategoryManager.js';

export function setupPersonalDataResources(server: Server): void {
  // Initialize category manager for resource handlers
  const categoryManager = new CategoryManager(supabaseAdmin);

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      switch (true) {
        case uri.startsWith('schema://'):
          return await handleSchemaResource(uri, categoryManager);

        case uri.startsWith('categories://'):
          return await handleCategoriesResource(uri, categoryManager);

        case uri.startsWith('stats://'):
          return await handleStatsResource(uri);

        case uri.startsWith('config://'):
          return await handleConfigResource(uri);

        default:
          throw new Error(`Unknown resource URI: ${uri}`);
      }
    } catch (error) {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };
    }
  });
}

async function handleSchemaResource(uri: string, categoryManager: CategoryManager) {
  const resourceType = uri.split('://')[1];

  switch (resourceType) {
    case 'personal_data_types': {
      // Get available data field definitions
      const { data: fieldDefinitions, error } = await supabaseAdmin
        .from('data_field_definitions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Database error: ${error.message}`);

      // Get data type statistics
      const { data: typeStats, error: statsError } = await supabaseAdmin
        .rpc('get_data_type_stats');

      // Get category information
      const categoryStats = await categoryManager.getCategoryStats();
      const contextualHints = await categoryManager.getContextualHints();

      const schema = {
        available_data_types: [
          'contact',
          'document', 
          'preference',
          'custom',
          'book',
          'author', 
          'interest',
          'software'
        ],
        classification_levels: [
          'public',
          'personal',
          'sensitive', 
          'confidential'
        ],
        field_definitions: fieldDefinitions || [],
        data_type_statistics: typeStats || [],
        
        // New: Dynamic category information
        active_categories: categoryStats.activeCategoryList,
        category_context: {
          summary: `${categoryStats.activeCategories} active categories with ${categoryStats.totalItems} total items`,
          contextual_hints: contextualHints,
          usage_guidance: 'Query categories when user mentions associated trigger words or asks about related topics'
        },
        
        schema_version: '2.0.0', // Bumped for dynamic categories
        last_updated: new Date().toISOString(),
      };

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown schema resource: ${resourceType}`);
  }
}

async function handleCategoriesResource(uri: string, categoryManager: CategoryManager) {
  const resourceType = uri.split('://')[1];

  switch (resourceType) {
    case 'available_data': {
      const categoryStats = await categoryManager.getCategoryStats();
      const contextualHints = await categoryManager.getContextualHints();

      const response = {
        summary: categoryStats.activeCategories > 0
          ? `You have ${categoryStats.totalItems} items across ${categoryStats.activeCategories} active categories`
          : 'No personal data available yet. Start adding data to activate categories.',
        
        active_categories: categoryStats.activeCategoryList.map(category => ({
          name: category.name,
          display_name: category.displayName,
          description: category.description,
          item_count: category.itemCount,
          trigger_words: category.triggerWords,
          query_hint: category.queryHint,
          example_queries: category.exampleQueries,
          last_modified: category.lastModified
        })),
        
        inactive_categories: categoryStats.allCategories
          .filter(c => !c.isActive)
          .map(category => ({
            name: category.name,
            display_name: category.displayName,
            description: category.description,
            trigger_words: category.triggerWords,
            query_hint: category.queryHint
          })),
        
        contextual_guidance: {
          when_to_query: 'Query the personal database when the user mentions any trigger words or asks about topics related to active categories',
          trigger_examples: categoryStats.activeCategoryList.length > 0 
            ? categoryStats.activeCategoryList.flatMap(c => c.triggerWords.slice(0, 2)).slice(0, 8)
            : [],
          usage_patterns: contextualHints.map(hint => ({
            category: hint.displayName,
            when_to_use: hint.queryHint,
            sample_triggers: hint.triggerWords.slice(0, 3)
          }))
        },
        
        statistics: {
          total_categories: categoryStats.totalCategories,
          active_categories: categoryStats.activeCategories,
          total_items: categoryStats.totalItems,
          last_updated: categoryStats.lastUpdated
        },
        
        ai_agent_instructions: categoryStats.activeCategories > 0 
          ? `This user has active personal data. Query when they mention: ${categoryStats.activeCategoryList.flatMap(c => c.triggerWords.slice(0, 2)).slice(0, 6).join(', ')}`
          : 'No personal data available yet. Inform user they can start adding data to enable personal queries.'
      };

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown categories resource: ${resourceType}`);
  }
}

async function handleStatsResource(uri: string) {
  const resourceType = uri.split('://')[1];

  switch (resourceType) {
    case 'usage_patterns': {
      // Get usage statistics from audit logs
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: accessStats, error } = await supabaseAdmin
        .from('data_access_log')
        .select('operation, table_name, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (error) throw new Error(`Database error: ${error.message}`);

      // Get personal data statistics
      const { data: recordCounts, error: countError } = await supabaseAdmin
        .from('personal_data')
        .select('data_type, classification')
        .is('deleted_at', null);

      if (countError) throw new Error(`Database error: ${countError.message}`);

      // Process statistics
      const operationCounts = (accessStats || []).reduce((acc, log) => {
        acc[log.operation] = (acc[log.operation] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const typeCounts = (recordCounts || []).reduce((acc, record) => {
        acc[record.data_type] = (acc[record.data_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const classificationCounts = (recordCounts || []).reduce((acc, record) => {
        acc[record.classification] = (acc[record.classification] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const stats = {
        period: '30_days',
        access_operations: operationCounts,
        data_type_distribution: typeCounts,
        classification_distribution: classificationCounts,
        total_records: recordCounts?.length || 0,
        total_access_events: accessStats?.length || 0,
        generated_at: new Date().toISOString(),
      };

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown stats resource: ${resourceType}`);
  }
}

async function handleConfigResource(uri: string) {
  const resourceType = uri.split('://')[1];

  switch (resourceType) {
    case 'privacy_settings': {
      // Get system privacy configuration
      const privacyConfig = {
        data_retention_policies: {
          personal: '7_years',
          sensitive: '7_years',
          confidential: '7_years',
          public: 'indefinite',
        },
        encryption_settings: {
          field_level_encryption: {
            enabled: true,
            algorithms: ['AES-256-GCM'],
            key_rotation_period: '90_days',
          },
          data_at_rest: {
            enabled: true,
            provider: 'supabase',
          },
          data_in_transit: {
            enabled: true,
            min_tls_version: '1.3',
          },
        },
        compliance_features: {
          gdpr: {
            enabled: true,
            features: [
              'right_to_access',
              'right_to_rectification',
              'right_to_erasure',
              'data_portability',
              'consent_management',
            ],
          },
          audit_logging: {
            enabled: true,
            retention_period: '7_years',
            log_levels: ['all_data_access', 'modifications', 'deletions'],
          },
        },
        access_controls: {
          authentication_required: true,
          authorization_model: 'rbac_with_abac',
          session_timeout: '15_minutes',
          mfa_required_for_sensitive: true,
        },
        data_classification: {
          auto_classification: true,
          classification_levels: [
            {
              level: 'public',
              description: 'Data that can be freely shared',
              encryption_required: false,
            },
            {
              level: 'personal',
              description: 'Standard personal information',
              encryption_required: false,
            },
            {
              level: 'sensitive',
              description: 'Sensitive personal data requiring protection',
              encryption_required: true,
            },
            {
              level: 'confidential',
              description: 'Highly sensitive data with strict access controls',
              encryption_required: true,
            },
          ],
        },
        last_updated: new Date().toISOString(),
        version: '1.0.0',
      };

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(privacyConfig, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown config resource: ${resourceType}`);
  }
}