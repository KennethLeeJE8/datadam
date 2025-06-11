#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupPersonalDataTools } from '../supabase_mcp_personal_database/src/server/tools/index.js';
import { initializeDatabase } from '../supabase_mcp_personal_database/src/database/client.js';
import { logger } from '../supabase_mcp_personal_database/src/utils/logger.js';

dotenv.config();

class MCPHttpApiServer {
  private app: express.Application;
  private port: number;
  private tools: any;

  constructor(port: number = 3001) {
    this.app = express();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Enable CORS for browser extension
    this.app.use(cors({
      origin: ['chrome-extension://*', 'moz-extension://*', 'http://localhost:*'],
      credentials: true
    }));

    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, { 
        body: req.body,
        query: req.query 
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'MCP Personal Data HTTP API',
        timestamp: new Date().toISOString()
      });
    });

    // Status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        status: 'running',
        service: 'MCP HTTP API Server',
        port: this.port,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Send message endpoint
    this.app.post('/send-message', async (req, res) => {
      try {
        const { message } = req.body;

        if (!message) {
          return res.status(400).json({
            error: 'message is required',
            code: 'MISSING_MESSAGE'
          });
        }

        // Simple echo response for now - you can extend this to actually communicate with MCP server
        const response = {
          success: true,
          received_message: message,
          response: `MCP server received: ${message}`,
          timestamp: new Date().toISOString()
        };

        res.json(response);

      } catch (error) {
        logger.error('Error in send-message endpoint', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          code: 'MESSAGE_FAILED'
        });
      }
    });

    // Extract personal data endpoint
    this.app.post('/api/extract_personal_data', async (req, res) => {
      try {
        const { user_id, data_types, filters, limit } = req.body;

        if (!user_id) {
          return res.status(400).json({
            error: 'user_id is required',
            code: 'MISSING_USER_ID'
          });
        }

        // Call the MCP tool directly
        const result = await this.callMCPTool('extract_personal_data', {
          user_id,
          data_types,
          filters,
          limit
        });

        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Error in extract_personal_data endpoint', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          code: 'EXTRACTION_FAILED'
        });
      }
    });

    // Create personal data endpoint
    this.app.post('/api/create_personal_data', async (req, res) => {
      try {
        const { user_id, data_type, title, content, tags, classification } = req.body;

        if (!user_id || !data_type || !title || !content) {
          return res.status(400).json({
            error: 'user_id, data_type, title, and content are required',
            code: 'MISSING_REQUIRED_FIELDS'
          });
        }

        const result = await this.callMCPTool('create_personal_data', {
          user_id,
          data_type,
          title,
          content,
          tags,
          classification
        });

        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Error in create_personal_data endpoint', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          code: 'CREATION_FAILED'
        });
      }
    });

    // Update personal data endpoint
    this.app.put('/api/update_personal_data/:recordId', async (req, res) => {
      try {
        const { recordId } = req.params;
        const updates = req.body;

        if (!recordId) {
          return res.status(400).json({
            error: 'record_id is required',
            code: 'MISSING_RECORD_ID'
          });
        }

        const result = await this.callMCPTool('update_personal_data', {
          record_id: recordId,
          updates
        });

        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Error in update_personal_data endpoint', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          code: 'UPDATE_FAILED'
        });
      }
    });

    // Delete personal data endpoint
    this.app.delete('/api/delete_personal_data', async (req, res) => {
      try {
        const { record_ids, hard_delete = false } = req.body;

        if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
          return res.status(400).json({
            error: 'record_ids array is required',
            code: 'MISSING_RECORD_IDS'
          });
        }

        const result = await this.callMCPTool('delete_personal_data', {
          record_ids,
          hard_delete
        });

        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Error in delete_personal_data endpoint', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          code: 'DELETION_FAILED'
        });
      }
    });

    // Search personal data endpoint
    this.app.post('/api/search_personal_data', async (req, res) => {
      try {
        const { user_id, query, data_types, limit } = req.body;

        if (!user_id || !query) {
          return res.status(400).json({
            error: 'user_id and query are required',
            code: 'MISSING_REQUIRED_FIELDS'
          });
        }

        const result = await this.callMCPTool('search_personal_data', {
          user_id,
          query,
          data_types,
          limit
        });

        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Error in search_personal_data endpoint', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          code: 'SEARCH_FAILED'
        });
      }
    });

    // Add personal data field endpoint
    this.app.post('/api/add_personal_data_field', async (req, res) => {
      try {
        const { field_name, data_type, validation_rules, is_required, default_value } = req.body;

        if (!field_name || !data_type) {
          return res.status(400).json({
            error: 'field_name and data_type are required',
            code: 'MISSING_REQUIRED_FIELDS'
          });
        }

        const result = await this.callMCPTool('add_personal_data_field', {
          field_name,
          data_type,
          validation_rules,
          is_required,
          default_value
        });

        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Error in add_personal_data_field endpoint', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          code: 'FIELD_CREATION_FAILED'
        });
      }
    });

    // List available tools
    this.app.get('/api/tools', async (req, res) => {
      try {
        const tools = await this.listMCPTools();
        res.json({
          success: true,
          tools,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error listing tools', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to list tools'
        });
      }
    });

    // Generic tool call endpoint
    this.app.post('/api/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body;

        const result = await this.callMCPTool(toolName, args);

        res.json({
          success: true,
          tool: toolName,
          result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error(`Error calling tool ${req.params.toolName}`, error);
        res.status(500).json({
          success: false,
          error: error.message || 'Tool call failed',
          tool: req.params.toolName
        });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        available_endpoints: [
          'GET /health',
          'GET /status',
          'POST /send-message',
          'POST /api/extract_personal_data',
          'POST /api/create_personal_data',
          'PUT /api/update_personal_data/:recordId',
          'DELETE /api/delete_personal_data',
          'POST /api/search_personal_data',
          'POST /api/add_personal_data_field',
          'GET /api/tools',
          'POST /api/tools/:toolName'
        ]
      });
    });
  }

  private async callMCPTool(toolName: string, args: any): Promise<any> {
    // Since we can't import the tools directly in browser extension context,
    // we'll make HTTP requests to the MCP server running on localhost
    const mcpServerUrl = 'http://localhost:3000';
    
    try {
      const response = await fetch(`${mcpServerUrl}/api/tools/${toolName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args)
      });

      if (!response.ok) {
        throw new Error(`MCP server responded with status: ${response.status}`);
      }

      const result = await response.json();
      return result.result || result.data || result;
    } catch (error) {
      logger.error(`Failed to call MCP tool ${toolName}`, error);
      throw new Error(`MCP tool call failed: ${error.message}`);
    }
  }

  private async listMCPTools(): Promise<any[]> {
    // Return the list of available MCP tools
    return [
      {
        name: 'extract_personal_data',
        description: 'Extract personal data with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User identifier' },
            data_types: { type: 'array', items: { type: 'string', enum: ['contact', 'document', 'preference', 'custom'] } },
            filters: { type: 'object', description: 'Additional filtering options' },
            limit: { type: 'number', description: 'Maximum number of results', default: 50 }
          },
          required: ['user_id']
        }
      },
      {
        name: 'create_personal_data',
        description: 'Create new personal data record',
        inputSchema: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User identifier' },
            data_type: { type: 'string', enum: ['contact', 'document', 'preference', 'custom'] },
            title: { type: 'string', description: 'Record title' },
            content: { type: 'object', description: 'Record content as JSON' },
            tags: { type: 'array', items: { type: 'string' } },
            classification: { type: 'string', enum: ['public', 'personal', 'sensitive', 'confidential'], default: 'personal' }
          },
          required: ['user_id', 'data_type', 'title', 'content']
        }
      },
      {
        name: 'update_personal_data',
        description: 'Update existing personal data record',
        inputSchema: {
          type: 'object',
          properties: {
            record_id: { type: 'string', description: 'Record identifier' },
            updates: { type: 'object', description: 'Fields to update' }
          },
          required: ['record_id', 'updates']
        }
      },
      {
        name: 'delete_personal_data',
        description: 'Delete personal data records',
        inputSchema: {
          type: 'object',
          properties: {
            record_ids: { type: 'array', items: { type: 'string' }, description: 'Array of record IDs to delete' },
            hard_delete: { type: 'boolean', default: false, description: 'Whether to permanently delete records' }
          },
          required: ['record_ids']
        }
      },
      {
        name: 'search_personal_data',
        description: 'Search personal data records',
        inputSchema: {
          type: 'object',
          properties: {
            user_id: { type: 'string', description: 'User identifier' },
            query: { type: 'string', description: 'Search query' },
            data_types: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number', default: 20, description: 'Maximum results' }
          },
          required: ['user_id', 'query']
        }
      },
      {
        name: 'add_personal_data_field',
        description: 'Add new field definition for personal data',
        inputSchema: {
          type: 'object',
          properties: {
            field_name: { type: 'string', description: 'Field name' },
            data_type: { type: 'string', enum: ['string', 'number', 'date', 'json', 'encrypted'] },
            validation_rules: { type: 'object', default: {} },
            is_required: { type: 'boolean', default: false },
            default_value: { description: 'Default field value' }
          },
          required: ['field_name', 'data_type']
        }
      }
    ];
  }

  public async start(): Promise<void> {
    try {
      // Initialize database connection
      await initializeDatabase();
      logger.info('Database initialized successfully');

      // Initialize MCP tools
      this.tools = await setupPersonalDataTools();
      logger.info('MCP tools initialized');

      // Start HTTP server
      this.app.listen(this.port, () => {
        logger.info(`MCP HTTP API Server running on port ${this.port}`);
        console.log(`🚀 MCP HTTP API Server started at http://localhost:${this.port}`);
        console.log(`📋 Available endpoints:`);
        console.log(`   GET    http://localhost:${this.port}/health`);
        console.log(`   GET    http://localhost:${this.port}/status`);
        console.log(`   POST   http://localhost:${this.port}/send-message`);
        console.log(`   POST   http://localhost:${this.port}/api/extract_personal_data`);
        console.log(`   POST   http://localhost:${this.port}/api/create_personal_data`);
        console.log(`   PUT    http://localhost:${this.port}/api/update_personal_data/:recordId`);
        console.log(`   DELETE http://localhost:${this.port}/api/delete_personal_data`);
        console.log(`   POST   http://localhost:${this.port}/api/search_personal_data`);
        console.log(`   POST   http://localhost:${this.port}/api/add_personal_data_field`);
        console.log(`   GET    http://localhost:${this.port}/api/tools`);
        console.log(`   POST   http://localhost:${this.port}/api/tools/:toolName`);
      });

    } catch (error) {
      logger.error('Failed to start MCP HTTP API Server', error);
      console.error('❌ Failed to start server:', error.message);
      process.exit(1);
    }
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MCPHttpApiServer();
  server.start().catch(console.error);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down MCP HTTP API Server...');
    process.exit(0);
  });
}

export { MCPHttpApiServer };