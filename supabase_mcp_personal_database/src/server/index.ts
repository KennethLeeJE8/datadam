#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

import { setupPersonalDataTools } from './tools/index.js';
import { setupPersonalDataResources } from './resources/index.js';
import { setupPersonalDataPrompts } from './prompts/index.js';
import { initializeDatabase } from '../database/client.js';
import { logger, ErrorCategory } from '../utils/logger.js';
import { errorMonitoring } from '../utils/monitoring.js';

dotenv.config();

class PersonalDataMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'personal-data-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupRequestHandlers();
  }

  private setupRequestHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'extract_personal_data',
            description: 'Extract personal data with optional filtering',
            inputSchema: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  description: 'User identifier',
                },
                data_types: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['contact', 'document', 'preference', 'custom'],
                  },
                  description: 'Types of data to extract',
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
            name: 'add_personal_data_field',
            description: 'Add a new personal data field type',
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
            name: 'update_personal_data',
            description: 'Update existing personal data',
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
            name: 'search_personal_data',
            description: 'Search personal data with full-text search',
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
                data_types: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Data types to search within',
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
            name: 'create_personal_data',
            description: 'Create new personal data record',
            inputSchema: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  description: 'User identifier',
                },
                data_type: {
                  type: 'string',
                  enum: ['contact', 'document', 'preference', 'custom'],
                  description: 'Type of data',
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
        ],
      };
    });

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'schema://personal_data_types',
            mimeType: 'application/json',
            name: 'Personal Data Schema',
            description: 'Available data field types and schemas',
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

  async run(): Promise<void> {
    try {
      logger.info('Starting Personal Data MCP Server');
      
      // Initialize database connection
      await initializeDatabase();
      logger.info('Database initialized successfully');

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      logger.info('Personal Data MCP Server running on stdio');
      console.error('Server started - Personal Data MCP Server running on stdio');
    } catch (error) {
      logger.critical(
        'Failed to start Personal Data MCP Server',
        error as Error,
        ErrorCategory.SYSTEM
      );
      throw error;
    }
  }
}

// Run the server
const server = new PersonalDataMCPServer();
server.run().catch((error) => {
  logger.critical(
    'Server startup failed',
    error,
    ErrorCategory.SYSTEM
  );
  console.error(error);
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  errorMonitoring.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  errorMonitoring.stop();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.critical(
    'Unhandled Promise Rejection',
    reason as Error,
    ErrorCategory.SYSTEM,
    { promise: promise.toString() }
  );
});

process.on('uncaughtException', (error) => {
  logger.critical(
    'Uncaught Exception',
    error,
    ErrorCategory.SYSTEM
  );
  process.exit(1);
});