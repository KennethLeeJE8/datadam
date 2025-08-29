import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { setupPersonalDataTools } from './tools/index.js';
import { setupPersonalDataResources } from './resources/index.js';
import { setupPersonalDataPrompts } from './prompts/index.js';
import { initializeDatabase, supabaseAdmin } from '../database/client.js';
import { logger, ErrorCategory } from '../utils/logger.js';
import { CategoryManager } from '../services/CategoryManager.js';

export class PersonalDataMCPServer {
  private server: Server;
  private categoryManager: CategoryManager;

  constructor() {
    this.server = new Server(
      {
        name: 'personal-data-server',
        version: '2.0.0', // Bumped for dynamic categories
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.categoryManager = new CategoryManager(supabaseAdmin);
    this.setupRequestHandlers();
  }

  private setupRequestHandlers(): void {
    // Dynamic tools handler - updates based on available data categories
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const activeCategories = await this.categoryManager.getActiveCategories();
        const activeCategoryNames = activeCategories.map(c => c.name);
        const dataSummary = await this.categoryManager.generateActiveDataSummary();
        const triggerHints = await this.categoryManager.generateTriggerWordHints();

        return {
          tools: [
            {
              name: 'extract_personal_data',
              description: activeCategories.length > 0 
                ? `Extract personal data from your database. ${dataSummary}. ${triggerHints}`
                : 'No personal data available yet. Start adding data to enable extraction.',
              inputSchema: {
                type: 'object',
                properties: {
                  user_id: {
                    type: 'string',
                    description: 'User identifier',
                  },
                  data_types: activeCategories.length > 0 ? {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: activeCategoryNames,
                    },
                    description: `Categories to extract: ${activeCategories.map(c => `${c.name} (${c.displayName})`).join(', ')}`,
                  } : {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'No data categories available yet',
                  },
                  filters: {
                    type: 'object',
                    description: 'Optional filtering criteria',
                  },
                  limit: {
                    type: 'number',
                    default: 50,
                    description: 'Maximum number of records',
                  },
                  offset: {
                    type: 'number',
                    default: 0,
                    description: 'Pagination offset',
                  },
                },
                required: ['user_id'],
              },
            },
            {
              name: 'create_personal_data',
              description: 'Create new personal data record with automatic category detection. Categories activate when first data is added.',
              inputSchema: {
                type: 'object',
                properties: {
                  user_id: {
                    type: 'string',
                    description: 'User identifier',
                  },
                  data_type: {
                    type: 'string',
                    enum: ['contact', 'document', 'preference', 'custom', 'book', 'author', 'interest', 'software'],
                    description: 'Type of data - will be auto-mapped to appropriate category',
                  },
                  title: {
                    type: 'string',
                    description: 'Record title',
                  },
                  content: {
                    type: 'object',
                    description: 'Record content',
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorization',
                  },
                  classification: {
                    type: 'string',
                    enum: ['public', 'personal', 'sensitive', 'confidential'],
                    default: 'personal',
                    description: 'Data classification level',
                  },
                },
                required: ['user_id', 'data_type', 'title', 'content'],
              },
            },
            {
              name: 'search_personal_data',
              description: activeCategories.length > 0
                ? `Search through your personal data. ${dataSummary}. ${triggerHints}`
                : 'No personal data available to search yet.',
              inputSchema: {
                type: 'object',
                properties: {
                  user_id: {
                    type: 'string',
                    description: 'User identifier',
                  },
                  query: {
                    type: 'string',
                    description: 'Search query',
                  },
                  data_types: activeCategories.length > 0 ? {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: activeCategoryNames,
                    },
                    description: `Limit search to specific categories: ${activeCategoryNames.join(', ')}`,
                  } : {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'No categories available to search',
                  },
                  limit: {
                    type: 'number',
                    default: 20,
                    description: 'Maximum results',
                  },
                },
                required: ['user_id', 'query'],
              },
            },
            {
              name: 'update_personal_data',
              description: 'Update existing personal data records',
              inputSchema: {
                type: 'object',
                properties: {
                  record_id: {
                    type: 'string',
                    description: 'Record identifier',
                  },
                  updates: {
                    type: 'object',
                    description: 'Fields to update',
                  },
                },
                required: ['record_id', 'updates'],
              },
            },
            {
              name: 'delete_personal_data',
              description: 'Delete personal data records',
              inputSchema: {
                type: 'object',
                properties: {
                  record_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Record identifiers to delete',
                  },
                  hard_delete: {
                    type: 'boolean',
                    default: false,
                    description: 'Permanent deletion for GDPR compliance',
                  },
                },
                required: ['record_ids'],
              },
            },
            {
              name: 'add_personal_data_field',
              description: 'Add a new personal data field type definition',
              inputSchema: {
                type: 'object',
                properties: {
                  field_name: {
                    type: 'string',
                    description: 'Unique field identifier',
                  },
                  data_type: {
                    type: 'string',
                    enum: ['string', 'number', 'date', 'json', 'encrypted'],
                    description: 'Field data type',
                  },
                  validation_rules: {
                    type: 'object',
                    description: 'JSON schema validation rules',
                  },
                  is_required: {
                    type: 'boolean',
                    default: false,
                    description: 'Whether field is mandatory',
                  },
                  default_value: {
                    description: 'Default value for the field',
                  },
                },
                required: ['field_name', 'data_type'],
              },
            },
            {
              name: 'search',
              description: 'Search through personal data for ChatGPT. Returns search results with id, title, and url for citation.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Search query string',
                  },
                },
                required: ['query'],
              },
            },
            {
              name: 'fetch',
              description: 'Retrieve the full content of a specific document by ID for ChatGPT. Returns complete document with text and metadata.',
              inputSchema: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Unique document ID from search results',
                  },
                },
                required: ['id'],
              },
            },
          ],
        };
      } catch (error) {
        logger.error('Error generating dynamic tool list', error as Error, ErrorCategory.SYSTEM);
        
        // Fallback to static tools if dynamic generation fails
        return {
          tools: [
            {
              name: 'extract_personal_data',
              description: 'Extract personal data with optional filtering',
              inputSchema: {
                type: 'object',
                properties: {
                  user_id: { type: 'string', description: 'User identifier' },
                  data_types: { type: 'array', items: { type: 'string' }, description: 'Types of data to extract' },
                  limit: { type: 'number', default: 50, description: 'Maximum number of records' },
                  offset: { type: 'number', default: 0, description: 'Pagination offset' },
                },
                required: ['user_id'],
              },
            },
            {
              name: 'create_personal_data',
              description: 'Create new personal data record',
              inputSchema: {
                type: 'object',
                properties: {
                  user_id: { type: 'string', description: 'User identifier' },
                  data_type: { type: 'string', description: 'Type of data' },
                  title: { type: 'string', description: 'Record title' },
                  content: { type: 'object', description: 'Record content' },
                  classification: { type: 'string', default: 'personal', description: 'Data classification level' },
                },
                required: ['user_id', 'data_type', 'title', 'content'],
              },
            },
            {
              name: 'search',
              description: 'Search through personal data for ChatGPT',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query string' },
                },
                required: ['query'],
              },
            },
            {
              name: 'fetch',
              description: 'Retrieve full document content by ID for ChatGPT',
              inputSchema: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Document ID from search results' },
                },
                required: ['id'],
              },
            },
          ],
        };
      }
    });

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'schema://personal_data_types',
            mimeType: 'application/json',
            name: 'Personal Data Schema',
            description: 'Available data field types, active categories, and trigger words',
          },
          {
            uri: 'categories://available_data',
            mimeType: 'application/json',
            name: 'Available Data Categories',
            description: 'Current personal data categories and when to query them',
          },
          {
            uri: 'stats://usage_patterns',
            mimeType: 'application/json',
            name: 'Usage Statistics',
            description: 'Data access and usage patterns',
          },
          {
            uri: 'config://privacy_settings',
            mimeType: 'application/json',
            name: 'Privacy Configuration',
            description: 'User privacy settings and preferences',
          },
        ],
      };
    });

    // List prompts handler
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'analyze_personal_data',
            description: 'Structured analysis of personal data',
            arguments: [
              {
                name: 'user_id',
                description: 'User identifier',
                required: true,
              },
              {
                name: 'analysis_type',
                description: 'Type of analysis to perform',
                required: true,
              },
            ],
          },
          {
            name: 'privacy_assessment',
            description: 'Evaluate data privacy impact',
            arguments: [
              {
                name: 'data_changes',
                description: 'Changes to assess for privacy impact',
                required: true,
              },
            ],
          },
          {
            name: 'data_migration',
            description: 'Guide for data migration workflows',
            arguments: [
              {
                name: 'source_format',
                description: 'Source data format',
                required: true,
              },
              {
                name: 'target_format',
                description: 'Target data format',
                required: true,
              },
            ],
          },
        ],
      };
    });

    // Setup tool handlers
    setupPersonalDataTools(this.server);

    // Setup resource handlers
    setupPersonalDataResources(this.server);

    // Setup prompt handlers
    setupPersonalDataPrompts(this.server);
  }

  async initializeDatabase(): Promise<void> {
    await initializeDatabase();
    await this.categoryManager.initialize();
    logger.info('Database and CategoryManager initialized successfully');
  }

  getServer(): Server {
    return this.server;
  }
}