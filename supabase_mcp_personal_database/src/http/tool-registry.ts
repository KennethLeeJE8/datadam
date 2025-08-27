import { PersonalDataMCPServer } from '../server/PersonalDataMCPServer.js';
import { logger, ErrorCategory } from '../utils/logger.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  examples?: any[];
}

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: ToolDefinition[] = [];
  private initialized = false;

  private constructor() {}

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Define tools directly from the known implementations
      this.tools = [
        {
          name: 'extract_personal_data',
          description: 'Extract personal data by tags. Use relationship tags like ["family", "close-friend"] for contacts, or genre/author tags like ["sci-fi", "stephen-king"] for books.',
          inputSchema: {
            type: 'object',
            properties: {
              tags: { 
                type: 'array', 
                items: { type: 'string' },
                minItems: 1,
                description: 'Tags to search for (e.g., ["family", "close-friend"] for contacts, ["sci-fi", "fantasy"] for books). At least one tag is required.'
              },
              user_id: { type: 'string', format: 'uuid', description: 'Optional: Valid UUID format if filtering by specific user' },
              data_types: {
                type: 'array',
                items: { type: 'string', enum: ['contact', 'document', 'preference', 'custom'] },
                description: 'Optional: Types of data to include'
              },
              filters: { type: 'object', description: 'Optional: Additional filtering criteria' },
              limit: { type: 'number', default: 50, description: 'Maximum number of records' },
              offset: { type: 'number', default: 0, description: 'Pagination offset' }
            },
            required: ['tags']
          },
          examples: this.getToolExamples('extract_personal_data')
        },
        {
          name: 'create_personal_data',
          description: 'Create new personal data records',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'User identifier' },
              data_type: { type: 'string', enum: ['contact', 'document', 'preference', 'custom'] },
              title: { type: 'string', description: 'Record title' },
              content: { type: 'object', description: 'Record content data' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
              classification: {
                type: 'string',
                enum: ['public', 'personal', 'sensitive', 'confidential'],
                default: 'personal'
              }
            },
            required: ['user_id', 'data_type', 'title', 'content']
          },
          examples: this.getToolExamples('create_personal_data')
        },
        {
          name: 'update_personal_data',
          description: 'Update existing personal data records',
          inputSchema: {
            type: 'object',
            properties: {
              record_id: { type: 'string', description: 'Record identifier to update' },
              updates: { type: 'object', description: 'Fields to update' }
            },
            required: ['record_id', 'updates']
          },
          examples: this.getToolExamples('update_personal_data')
        },
        {
          name: 'delete_personal_data',
          description: 'Delete personal data records (soft or hard delete)',
          inputSchema: {
            type: 'object',
            properties: {
              record_ids: { type: 'array', items: { type: 'string' }, description: 'Record IDs to delete' },
              hard_delete: { type: 'boolean', default: false, description: 'Permanent deletion flag' }
            },
            required: ['record_ids']
          },
          examples: this.getToolExamples('delete_personal_data')
        },
        {
          name: 'search_personal_data',
          description: 'Search personal data by title. Enter keywords to find matching titles in your data entries.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search keywords to find in data titles (e.g., "mom birthday contact", "dune frank herbert")' },
              user_id: { type: 'string', format: 'uuid', description: 'Optional: Valid UUID format if searching for specific user' },
              data_types: { 
                type: 'array', 
                items: { type: 'string', enum: ['contact', 'document', 'preference', 'custom'] }, 
                description: 'Optional: Types of data to include in search'
              },
              limit: { type: 'number', default: 20, description: 'Maximum results' }
            },
            required: ['query']
          },
          examples: this.getToolExamples('search_personal_data')
        },
        {
          name: 'add_personal_data_field',
          description: 'Add a new personal data field type definition',
          inputSchema: {
            type: 'object',
            properties: {
              field_name: { type: 'string', description: 'Unique field identifier' },
              data_type: { type: 'string', enum: ['string', 'number', 'date', 'json', 'encrypted'] },
              validation_rules: { type: 'object', description: 'JSON schema validation rules' },
              is_required: { type: 'boolean', default: false },
              default_value: { description: 'Default field value' }
            },
            required: ['field_name', 'data_type']
          },
          examples: this.getToolExamples('add_personal_data_field')
        }
      ];

      this.initialized = true;
      logger.info('Tool registry initialized', { toolCount: this.tools.length });
    } catch (error) {
      logger.error('Failed to initialize tool registry', error as Error, ErrorCategory.SYSTEM);
      throw error;
    }
  }

  public getTools(): ToolDefinition[] {
    return this.tools;
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.find(tool => tool.name === name);
  }

  public async executeTool(name: string, args: any): Promise<any> {
    // For now, we'll delegate tool execution back to the MCP endpoint
    // This ensures consistency with the existing implementation
    throw new Error('REST tool execution should be handled through MCP transport layer');
  }

  private getToolExamples(toolName: string): any[] {
    const examples: Record<string, any[]> = {
      extract_personal_data: [
        {
          description: "Extract contacts by relationship",
          input: {
            tags: ["family", "close-friend"],
            data_types: ["contact"],
            limit: 10
          }
        },
        {
          description: "Extract books by genre",
          input: {
            tags: ["sci-fi", "dystopian"],
            data_types: ["document"],
            limit: 20
          }
        }
      ],
      create_personal_data: [
        {
          description: "Create a new contact record",
          input: {
            user_id: "user123",
            data_type: "contact",
            title: "John Doe Contact",
            content: {
              name: "John Doe",
              email: "john@example.com",
              phone: "+1-555-0123"
            },
            tags: ["work", "client"],
            classification: "personal"
          }
        }
      ],
      search_personal_data: [
        {
          description: "Search for a specific contact by name",
          input: {
            query: "mom birthday contact",
            data_types: ["contact"],
            limit: 10
          }
        },
        {
          description: "Search for a specific book",
          input: {
            query: "dune frank herbert",
            data_types: ["document"],
            limit: 20
          }
        }
      ],
      update_personal_data: [
        {
          description: "Update a contact's phone number",
          input: {
            record_id: "rec_12345",
            updates: {
              content: {
                phone: "+1-555-9999"
              }
            }
          }
        }
      ],
      delete_personal_data: [
        {
          description: "Soft delete records (GDPR compliant)",
          input: {
            record_ids: ["rec_12345", "rec_67890"],
            hard_delete: false
          }
        },
        {
          description: "Hard delete for complete removal",
          input: {
            record_ids: ["rec_12345"],
            hard_delete: true
          }
        }
      ],
      add_personal_data_field: [
        {
          description: "Add a new field type for social media profiles",
          input: {
            field_name: "social_profile",
            data_type: "json",
            validation_rules: {
              type: "object",
              properties: {
                platform: { type: "string" },
                username: { type: "string" },
                url: { type: "string", format: "uri" }
              },
              required: ["platform", "username"]
            },
            is_required: false
          }
        }
      ]
    };

    return examples[toolName] || [];
  }
}