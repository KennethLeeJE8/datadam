#!/usr/bin/env node

import express from 'express';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

// Helper function to get header value case-insensitively
function getHeaderCaseInsensitive(headers: any, headerName: string): string | undefined {
  const lowerHeaderName = headerName.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === lowerHeaderName) {
      return headers[key] as string;
    }
  }
  return undefined;
}

// Helper function to check if request is a notification (no id field)
function isNotification(requestBody: any): boolean {
  return !requestBody || requestBody.id === undefined || requestBody.id === null;
}

// Helper function to set proper Content-Type based on Accept header
function setContentType(req: express.Request, res: express.Response, isStream: boolean = false): void {
  const acceptHeader = getHeaderCaseInsensitive(req.headers, 'accept') || '';
  
  if (isStream && acceptHeader.includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  } else {
    res.setHeader('Content-Type', 'application/json');
  }
}

import { PersonalDataMCPServer } from '../server/PersonalDataMCPServer.js';
import { logger, ErrorCategory } from '../utils/logger.js';
import { errorMonitoring } from '../utils/monitoring.js';
import { rateLimit, requestTimeout, connectionLimit } from './auth-middleware.js';
import { ToolRegistry } from './tool-registry.js';

// Import the tool handlers directly
import { executePersonalDataTool } from '../server/tools/index.js';

dotenv.config();

class HTTPMCPServer {
  private app: express.Application;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private server: any;
  private toolRegistry: ToolRegistry;
  private mcpServer: PersonalDataMCPServer | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.app = express();
    this.toolRegistry = ToolRegistry.getInstance();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Request ID tracking
    this.app.use((req: any, res, next) => {
      req.requestId = randomUUID();
      res.set('X-Request-ID', req.requestId);
      next();
    });

    // Security headers
    this.app.use((req, res, next) => {
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      next();
    });

    // Connection limit (Render tier restriction)
    this.app.use(connectionLimit);

    // Request timeout
    this.app.use(requestTimeout);

    // Rate limiting
    this.app.use(rateLimit);

    // JSON parsing with size limit
    this.app.use(express.json({ 
      limit: process.env.MAX_REQUEST_SIZE || '100kb',
      type: 'application/json'
    }));

    // Enhanced CORS configuration
    const corsOrigins = process.env.CORS_ORIGINS;
    const allowedOrigins = corsOrigins 
      ? corsOrigins.split(',').map(origin => origin.trim())
      : ['http://localhost:*', 'https://localhost:*', 'chrome-extension://*'];

    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Check against allowed origins with wildcard support
        const isAllowed = allowedOrigins.some(allowed => {
          if (allowed === '*') return true;
          if (allowed.endsWith('*')) {
            const basePattern = allowed.slice(0, -1);
            return origin.startsWith(basePattern);
          }
          return origin === allowed;
        });
        
        callback(null, isAllowed);
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization',
        'mcp-session-id', 
        'last-event-id',
        'X-Requested-With'
      ],
      exposedHeaders: [
        'mcp-session-id',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining', 
        'X-RateLimit-Reset'
      ],
      credentials: true,
      maxAge: 86400 // 24 hours preflight cache
    }));
  }

  private async initializeMCPServer(): Promise<void> {
    if (this.isInitialized && this.mcpServer) {
      return;
    }

    try {
      logger.info('Initializing singleton MCP server...');
      this.mcpServer = new PersonalDataMCPServer();
      await this.mcpServer.initializeDatabase();
      await this.toolRegistry.initialize();
      this.isInitialized = true;
      logger.info('MCP server initialization completed successfully');
    } catch (error) {
      logger.error('Failed to initialize MCP server', error as Error, ErrorCategory.SYSTEM);
      this.isInitialized = false;
      this.mcpServer = null;
      throw error;
    }
  }

  private async getMCPServer(): Promise<PersonalDataMCPServer> {
    if (!this.isInitialized || !this.mcpServer) {
      await this.initializeMCPServer();
    }
    return this.mcpServer!;
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const rateLimitConfig = {
        requests: parseInt(process.env.RATE_LIMIT_REQUESTS || '50'),
        window: parseInt(process.env.RATE_LIMIT_WINDOW || '900000')
      };
      const connectionConfig = {
        maxConnections: parseInt(process.env.MAX_CONNECTIONS || '3'),
        cacheSize: parseInt(process.env.CACHE_SIZE || '100')
      };

      setContentType(req, res);
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'personal-data-mcp-server',
        transport: 'http',
        security: {
          authenticationEnabled: false,
          rateLimitEnabled: true,
          corsEnabled: true,
          securityHeadersEnabled: true
        },
        configuration: {
          rateLimit: rateLimitConfig,
          connections: connectionConfig,
          requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000'),
          maxRequestSize: process.env.MAX_REQUEST_SIZE || '100kb'
        },
        sessions: {
          active: this.transports.size
        }
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const memoryUsage = process.memoryUsage();
      setContentType(req, res);
      res.status(200).json({
        timestamp: new Date().toISOString(),
        service: 'personal-data-mcp-server',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        sessions: {
          active: this.transports.size,
          total: this.transports.size
        },
        system: {
          uptime: Math.floor(process.uptime()),
          memory: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            external: Math.round(memoryUsage.external / 1024 / 1024) // MB
          },
          cpu: process.cpuUsage(),
          platform: process.platform,
          nodeVersion: process.version
        },
        http: {
          port: process.env.PORT || 3000,
          transport: 'http',
          maxRequestSize: process.env.MAX_REQUEST_SIZE || '1mb',
          requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000')
        }
      });
    });

    // Debug endpoint for MCP server status
    this.app.get('/debug/mcp', (req, res) => {
      setContentType(req, res);
      res.status(200).json({
        timestamp: new Date().toISOString(),
        mcp_server: {
          is_initialized: this.isInitialized,
          has_mcp_server_instance: !!this.mcpServer,
          active_transports: this.transports.size,
          transport_sessions: Array.from(this.transports.keys())
        },
        tool_registry: {
          is_initialized: this.toolRegistry ? true : false,
          tools_count: this.toolRegistry ? this.toolRegistry.getTools().length : 0
        },
        environment: {
          MCP_TRANSPORT: process.env.MCP_TRANSPORT,
          NODE_ENV: process.env.NODE_ENV,
          DATABASE_URL: !!process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
          SUPABASE_URL: !!process.env.SUPABASE_URL ? 'SET' : 'NOT_SET',
          SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT_SET'
        }
      });
    });

    // Debug endpoint to force MCP initialization and show detailed error
    this.app.post('/debug/mcp/init', async (req, res) => {
      setContentType(req, res);
      try {
        logger.info('Manual MCP initialization requested via debug endpoint');
        await this.initializeMCPServer();
        res.status(200).json({
          success: true,
          message: 'MCP server initialized successfully',
          timestamp: new Date().toISOString(),
          is_initialized: this.isInitialized,
          has_mcp_server_instance: !!this.mcpServer
        });
      } catch (error) {
        const err = error as Error;
        logger.error('Manual MCP initialization failed', err, ErrorCategory.SYSTEM);
        res.status(500).json({
          success: false,
          error: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString(),
          is_initialized: this.isInitialized,
          has_mcp_server_instance: !!this.mcpServer
        });
      }
    });

    // MCP endpoints
    this.app.post('/mcp', this.handleMCPPost.bind(this));
    this.app.get('/mcp', this.handleMCPGet.bind(this));
    this.app.delete('/mcp', this.handleMCPDelete.bind(this));
    
    // ChatGPT-compatible SSE endpoint
    this.app.get('/sse', this.handleSSE.bind(this));

    // REST API endpoints for easy AI agent integration
    this.app.get('/tools', this.handleListTools.bind(this));
    this.app.post('/tools/:toolName', this.handleExecuteToolMCP.bind(this));
    
    // Traditional API endpoints for standard REST clients
    this.app.get('/api', this.handleListTools.bind(this));
    this.app.post('/api/:toolName', this.handleExecuteToolAPI.bind(this));
    
    this.app.get('/', this.handleApiDocumentation.bind(this));
  }

  private async handleMCPPost(req: express.Request, res: express.Response): Promise<void> {
    logger.info('Received MCP POST request', { 
      body: req.body,
      ip: req.ip,
      requestId: (req as any).requestId,
      endpoint: req.path
    });

    try {
      const sessionId = getHeaderCaseInsensitive(req.headers, 'mcp-session-id');
      let transport: StreamableHTTPServerTransport;
      
      // Set proper Content-Type header
      setContentType(req, res);

      if (sessionId && this.transports.has(sessionId)) {
        // Reuse existing transport
        transport = this.transports.get(sessionId)!;
        logger.info('Reusing existing transport', { sessionId });
      } else {
        // Create new transport for any request without valid session
        logger.info('Creating new transport', { 
          hasSessionId: !!sessionId, 
          isInit: isInitializeRequest(req.body),
          requestMethod: req.body?.method 
        });
        
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId: string) => {
            logger.info('Session initialized', { sessionId });
            this.transports.set(sessionId, transport);
            // Add session ID to response headers
            res.setHeader('Mcp-Session-Id', sessionId);
          }
        });

        // Set up cleanup handler
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.transports.has(sid)) {
            logger.info('Transport closed, cleaning up', { sessionId: sid });
            this.transports.delete(sid);
          }
        };

        // Connect singleton MCP server to transport
        const mcpServer = await this.getMCPServer();
        await mcpServer.getServer().connect(transport);
        
        // Capture the response to check if it's a notification
        const originalResponse = req.body;
        await transport.handleRequest(req as any, res, originalResponse);
        
        // Handle notification responses (202 Accepted)
        if (isNotification(originalResponse) && !res.headersSent) {
          res.status(202).end();
        }
        return;
      }

      // Handle request with existing transport
      // Add session ID to response headers if available
      if (sessionId) {
        res.setHeader('Mcp-Session-Id', sessionId);
      }
      
      await transport.handleRequest(req as any, res, req.body);
      
      // Handle notification responses (202 Accepted)
      if (isNotification(req.body) && !res.headersSent) {
        res.status(202).end();
      }
    } catch (error) {
      logger.error('Error handling MCP POST request', error as Error, ErrorCategory.NETWORK);
      
      if (!res.headersSent) {
        setContentType(req, res);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: {
              requestId: (req as any).requestId,
              timestamp: new Date().toISOString()
            }
          },
          id: null,
        });
      }
    }
  }

  private async handleMCPGet(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = getHeaderCaseInsensitive(req.headers, 'mcp-session-id');
    
    logger.info('Received MCP GET request (SSE)', { 
      sessionId,
      ip: req.ip,
      requestId: (req as any).requestId
    });

    if (!sessionId || !this.transports.has(sessionId)) {
      logger.warn('Invalid session ID for SSE request', ErrorCategory.VALIDATION, { sessionId });
      setContentType(req, res);
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: 'Invalid or missing session ID'
        },
        id: null
      });
      return;
    }

    const lastEventId = getHeaderCaseInsensitive(req.headers, 'last-event-id');
    if (lastEventId) {
      logger.info('Client reconnecting with Last-Event-ID', { sessionId, lastEventId });
    }

    try {
      // Set proper SSE headers
      setContentType(req, res, true);
      res.setHeader('Mcp-Session-Id', sessionId);
      
      const transport = this.transports.get(sessionId)!;
      
      // Send initial data promptly to prevent client timeout
      res.write(': MCP SSE stream established\n\n');
      
      await transport.handleRequest(req as any, res);
    } catch (error) {
      logger.error('Error handling MCP GET request', error as Error, ErrorCategory.NETWORK);
      if (!res.headersSent) {
        setContentType(req, res);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Error establishing SSE stream'
          },
          id: null
        });
      }
    }
  }

  private async handleMCPDelete(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = getHeaderCaseInsensitive(req.headers, 'mcp-session-id');
    
    logger.info('Received session termination request', { 
      sessionId,
      ip: req.ip,
      requestId: (req as any).requestId
    });

    if (!sessionId || !this.transports.has(sessionId)) {
      logger.warn('Invalid session ID for termination request', ErrorCategory.VALIDATION, { sessionId });
      setContentType(req, res);
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: 'Invalid or missing session ID'
        },
        id: null
      });
      return;
    }

    try {
      setContentType(req, res);
      res.setHeader('Mcp-Session-Id', sessionId);
      
      const transport = this.transports.get(sessionId)!;
      await transport.handleRequest(req as any, res);
    } catch (error) {
      logger.error('Error handling session termination', error as Error, ErrorCategory.NETWORK);
      if (!res.headersSent) {
        setContentType(req, res);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Error processing session termination'
          },
          id: null
        });
      }
    }
  }

  private async handleSSE(req: express.Request, res: express.Response): Promise<void> {
    logger.info('Received SSE request from ChatGPT', { 
      ip: req.ip,
      requestId: (req as any).requestId,
      userAgent: req.headers['user-agent']
    });

    try {
      // Check Accept header to ensure client can handle SSE
      const acceptHeader = getHeaderCaseInsensitive(req.headers, 'accept') || '';
      if (!acceptHeader.includes('text/event-stream')) {
        logger.warn('Client does not accept text/event-stream', ErrorCategory.VALIDATION, { 
          acceptHeader,
          ip: req.ip 
        });
        setContentType(req, res);
        return res.status(406).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Not Acceptable: Client must accept text/event-stream'
          },
          id: null
        });
      }

      // Generate new session for SSE connection
      const sessionId = randomUUID();
      logger.info('Creating new SSE session', { sessionId });

      // Set proper SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
      res.setHeader('Mcp-Session-Id', sessionId);

      // Create new transport for this SSE connection
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        onsessioninitialized: (sid: string) => {
          logger.info('SSE session initialized', { sessionId: sid });
          this.transports.set(sid, transport);
        }
      });

      // Set up cleanup handler
      transport.onclose = () => {
        if (this.transports.has(sessionId)) {
          logger.info('SSE transport closed, cleaning up', { sessionId });
          this.transports.delete(sessionId);
        }
      };

      // Handle connection close
      req.on('close', () => {
        if (this.transports.has(sessionId)) {
          logger.info('SSE connection closed by client', { sessionId });
          this.transports.delete(sessionId);
        }
      });

      // Connect MCP server to transport
      const mcpServer = await this.getMCPServer();
      await mcpServer.getServer().connect(transport);

      // Send initial SSE comment to establish connection
      res.write(': MCP SSE stream established for ChatGPT\n\n');

      // Handle the SSE streaming
      await transport.handleRequest(req as any, res);
    } catch (error) {
      logger.error('Error handling SSE request', error as Error, ErrorCategory.NETWORK);
      if (!res.headersSent) {
        setContentType(req, res);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Error establishing SSE stream'
          },
          id: null
        });
      }
    }
  }

  private async handleListTools(req: express.Request, res: express.Response): Promise<void> {
    logger.info('Received REST API request for tools list', { 
      ip: req.ip,
      requestId: (req as any).requestId,
      endpoint: req.path
    });

    try {
      // Determine which tools to return based on endpoint
      const isApiEndpoint = req.path.startsWith('/api');
      
      if (isApiEndpoint) {
        // Traditional API: Return static tools from ToolRegistry
        await this.getMCPServer(); // Ensure initialized
        const tools = this.toolRegistry.getTools();
        
        setContentType(req, res);
        res.status(200).json({
          tools: tools,
          server_info: {
            name: 'personal-data-server',
            version: '1.0.0',
            capabilities: ['tools', 'resources', 'prompts']
          },
          endpoints: {
            list_tools: 'GET /tools',
            execute_tool: 'POST /tools/{tool_name}',
            mcp_endpoint: 'POST /mcp',
            documentation: 'GET /',
            health: 'GET /health'
          },
          usage_examples: {
            list_tools: `curl ${req.protocol}://${req.get('host')}/tools`,
            execute_tool: `curl -X POST ${req.protocol}://${req.get('host')}/tools/search_personal_data -H "Content-Type: application/json" -d '{"user_id": "user123", "query": "example"}'`
          },
          timestamp: new Date().toISOString()
        });
      } else {
        // AI Agent/MCP endpoint: Return dynamic tools 
        const dynamicTools = await this.getDynamicTools();
        
        setContentType(req, res);
        res.status(200).json({
          tools: dynamicTools,
          server_info: {
            name: 'personal-data-server',
            version: '2.0.0', // Updated version for dynamic features
            capabilities: ['tools', 'resources', 'prompts'],
            features: ['dynamic_categories', 'contextual_hints', 'trigger_words']
          },
          endpoints: {
            list_tools: 'GET /tools',
            execute_tool: 'POST /tools/{tool_name}',
            mcp_endpoint: 'POST /mcp',
            documentation: 'GET /',
            health: 'GET /health'
          },
          usage_examples: {
            list_tools: `curl ${req.protocol}://${req.get('host')}/tools`,
            execute_tool: `curl -X POST ${req.protocol}://${req.get('host')}/tools/search_personal_data -H "Content-Type: application/json" -d '{"user_id": "user123", "query": "example"}'`
          },
          dynamic_features: {
            category_discovery: 'Tools show only active data categories',
            contextual_hints: 'Descriptions include trigger words for when to query',
            real_time_updates: 'Categories activate/deactivate based on data presence'
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Error handling tools list request', error as Error, ErrorCategory.NETWORK);
      setContentType(req, res);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve tools list',
        timestamp: new Date().toISOString()
      });
    }
  }

  private async getDynamicTools(): Promise<any[]> {
    try {
      const mcpServer = await this.getMCPServer();
      
      // Simulate a tools/list request to get dynamic tools
      // We'll use the same logic as the MCP server's ListToolsRequestSchema handler
      const { CategoryManager } = await import('../services/CategoryManager.js');
      const { supabaseAdmin } = await import('../database/client.js');
      
      const categoryManager = new CategoryManager(supabaseAdmin);
      const activeCategories = await categoryManager.getActiveCategories();
      const activeCategoryNames = activeCategories.map(c => c.name);
      const dataSummary = await categoryManager.generateActiveDataSummary();
      const triggerHints = await categoryManager.generateTriggerWordHints();

      return [
        {
          name: 'extract_personal_data',
          description: 'Extract groups of similar entries by tags from a specific user profile or all profiles. Use when looking for ambiguous categories like "family members", "work contacts", "sci-fi books", or "health records". Perfect for discovering related entries you might not remember specifically.',
          inputSchema: {
            type: 'object',
            properties: {
              tags: { 
                type: 'array', 
                items: { type: 'string' },
                minItems: 1,
                description: 'Category tags to find groups of entries (e.g., ["family"] for all family members, ["work"] for work contacts, ["sci-fi"] for science fiction books). Use for broad categories, not specific names.'
              },
              user_id: {
                type: 'string',
                format: 'uuid',
                description: 'Optional: Specify which user profile to extract from. If omitted, searches all profiles.',
              },
              data_types: {
                type: 'array',
                items: { type: 'string', enum: ['contact', 'document', 'preference', 'custom'] },
                description: 'Optional: Types of data to include',
              },
              filters: {
                type: 'object',
                description: 'Optional: Additional filtering criteria',
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
            required: ['tags'],
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
          description: 'Search for specific entries by title within a user profile or all profiles. Use when you know exactly what you\'re looking for, like "Joanne Wong", "mom birthday contact", "Dune book", or "dentist appointment notes". Perfect for finding a particular person, document, or item.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Specific keywords or names to find exact entries (e.g., "Joanne Wong", "dentist appointment", "iPhone charger location"). Use actual names, not categories.',
              },
              user_id: {
                type: 'string',
                format: 'uuid',
                description: 'Optional: Specify which user profile to search within. If omitted, searches all profiles.',
              },
              data_types: {
                type: 'array',
                items: { type: 'string', enum: ['contact', 'document', 'preference', 'custom'] },
                description: 'Optional: Types of data to include in search',
              },
              limit: {
                type: 'number',
                default: 20,
                description: 'Maximum results',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'update_personal_data',
          description: activeCategories.length > 0
            ? `Update existing personal data records. ${dataSummary}. ${triggerHints}`
            : 'Update personal data records. No data available yet.',
          inputSchema: {
            type: 'object',
            properties: {
              record_id: {
                type: 'string',
                description: 'Record identifier to update',
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
          description: activeCategories.length > 0
            ? `Delete personal data records. ${dataSummary}. Use with caution - supports both soft and hard deletion for GDPR compliance.`
            : 'Delete personal data records. No data available yet.',
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
          description: 'Add a new personal data field type definition to extend the data schema dynamically.',
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
        }
      ];
    } catch (error) {
      logger.error('Error generating dynamic tools', error as Error, ErrorCategory.SYSTEM);
      // Fallback to static tools
      return this.toolRegistry.getTools(); // Return all static tools as fallback
    }
  }

  private async handleExecuteToolMCP(req: express.Request, res: express.Response): Promise<void> {
    const toolName = req.params.toolName;
    const toolArgs = req.body;
    const requestId = (req as any).requestId;
    
    logger.info('Received REST API tool execution request', { 
      toolName,
      args: toolArgs,
      ip: req.ip,
      requestId
    });

    try {
      // Ensure MCP server is initialized
      const mcpServer = await this.getMCPServer();
      
      // Check if tool exists
      const toolDef = this.toolRegistry.getTool(toolName);
      if (!toolDef) {
        setContentType(req, res);
        res.status(404).json({
          error: 'Tool not found',
          message: `Tool '${toolName}' is not available`,
          available_tools: this.toolRegistry.getTools().map(t => t.name),
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Expect MCP format: { "arguments": { ... } }
      if (!toolArgs.arguments) {
        setContentType(req, res);
        res.status(400).json({
          error: 'Invalid MCP format',
          message: 'Expected { "arguments": {...} } format for MCP tool endpoint',
          timestamp: new Date().toISOString(),
          requestId: requestId
        });
        return;
      }
      
      const toolArguments = toolArgs.arguments;
      logger.debug('Using MCP format arguments', { toolName, requestId });
      
      // Execute tool directly using exported function
      const result = await executePersonalDataTool(toolName, toolArguments);
      
      logger.info('Tool execution completed successfully', { 
        toolName, 
        requestId,
        hasResult: !!result
      });
      
      setContentType(req, res);
      res.status(200).json({
        tool: toolName,
        success: true,
        result: result,
        timestamp: new Date().toISOString(),
        requestId: requestId
      });
    } catch (error) {
      const toolError = error as Error;
      logger.error('Error executing tool via REST API', toolError, ErrorCategory.BUSINESS_LOGIC, { 
        toolName,
        requestId,
        errorType: toolError.constructor.name
      });
      
      const errorMessage = toolError.message;
      
      // Handle different types of errors appropriately
      if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('required')) {
        setContentType(req, res);
        res.status(400).json({
          error: 'Validation Error',
          message: errorMessage,
          tool_schema: this.toolRegistry.getTool(toolName)?.inputSchema,
          timestamp: new Date().toISOString(),
          requestId: requestId
        });
      } else if (errorMessage.includes('Database error') || errorMessage.includes('connection')) {
        setContentType(req, res);
        res.status(503).json({
          error: 'Service Unavailable',
          message: 'Database connection issue. Please try again.',
          timestamp: new Date().toISOString(),
          requestId: requestId
        });
      } else {
        setContentType(req, res);
        res.status(500).json({
          error: 'Internal Server Error',
          message: `Tool execution failed: ${errorMessage}`,
          timestamp: new Date().toISOString(),
          requestId: requestId
        });
      }
    }
  }

  private async handleExecuteToolAPI(req: express.Request, res: express.Response): Promise<void> {
    const toolName = req.params.toolName;
    const toolArgs = req.body;
    const requestId = (req as any).requestId;
    
    logger.info('Received traditional API tool execution request', { 
      toolName,
      args: toolArgs,
      ip: req.ip,
      requestId
    });

    try {
      // Ensure MCP server is initialized
      const mcpServer = await this.getMCPServer();
      
      // Check if tool exists
      const toolDef = this.toolRegistry.getTool(toolName);
      if (!toolDef) {
        setContentType(req, res);
        res.status(404).json({
          error: 'Tool not found',
          message: `Tool '${toolName}' is not available`,
          available_tools: this.toolRegistry.getTools().map(t => t.name)
        });
        return;
      }
      
      // Use direct arguments format for traditional API
      const toolArguments = toolArgs;
      logger.debug('Using traditional API format arguments', { toolName, requestId });
      
      // Execute tool directly using exported function
      const result = await executePersonalDataTool(toolName, toolArguments);
      
      logger.info('Tool execution completed successfully', { 
        toolName, 
        requestId,
        hasResult: !!result
      });
      
      // Return just the result data for traditional API clients
      setContentType(req, res);
      if (result && result.content && result.content[0] && result.content[0].text) {
        try {
          const parsedResult = JSON.parse(result.content[0].text);
          res.status(200).json(parsedResult);
        } catch (parseError) {
          res.status(200).json({ data: result.content[0].text });
        }
      } else {
        res.status(200).json({ result: result });
      }
      
    } catch (error) {
      const toolError = error as Error;
      logger.error('Error executing tool via traditional API', toolError, ErrorCategory.BUSINESS_LOGIC, { 
        toolName,
        requestId,
        errorType: toolError.constructor.name
      });
      
      const errorMessage = toolError.message;
      
      // Return simple error format for traditional API clients
      setContentType(req, res);
      if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('required')) {
        res.status(400).json({
          error: 'Validation Error',
          message: errorMessage
        });
      } else if (errorMessage.includes('Database error') || errorMessage.includes('connection')) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: 'Database connection issue. Please try again.'
        });
      } else {
        setContentType(req, res);
        res.status(500).json({
          error: 'Internal Server Error',
          message: `Tool execution failed: ${errorMessage}`
        });
      }
    }
  }



  private async handleApiDocumentation(req: express.Request, res: express.Response): Promise<void> {
    logger.info('Received API documentation request', { 
      ip: req.ip,
      requestId: (req as any).requestId
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const htmlDoc = `
<!DOCTYPE html>
<html>
<head>
    <title>Personal Data MCP Server API</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .method { font-weight: bold; color: #007acc; }
        .url { font-family: monospace; background: #e8e8e8; padding: 2px 4px; }
        pre { background: #f8f8f8; padding: 10px; border-radius: 3px; overflow-x: auto; }
        .claude-config { background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>Personal Data MCP Server API</h1>
    
    <h2>Overview</h2>
    <p>This server provides both MCP (Model Context Protocol) and REST API access to personal data management tools.</p>
    
    <h2>REST API Endpoints</h2>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/tools</span></div>
        <p>List all available tools with their schemas and descriptions.</p>
        <pre>curl ${baseUrl}/tools</pre>
    </div>
    
    <div class="endpoint">
        <div><span class="method">POST</span> <span class="url">/tools/{tool_name}</span></div>
        <p><strong>AI Agent/MCP Format:</strong> Execute tools with MCP-style argument wrapping.</p>
        <pre>curl -X POST ${baseUrl}/tools/create_personal_data \\
  -H "Content-Type: application/json" \\
  -d '{
    "arguments": {
      "user_id": "123e4567-e89b-12d3-a456-426614174000",
      "data_type": "contact",
      "title": "John Doe Contact",
      "content": {"name": "John", "email": "john@example.com"}
    }
  }'</pre>
    </div>

    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/api</span></div>
        <p>List all available tools (same as /tools).</p>
        <pre>curl ${baseUrl}/api</pre>
    </div>
    
    <div class="endpoint">
        <div><span class="method">POST</span> <span class="url">/api/{tool_name}</span></div>
        <p><strong>Traditional API Format:</strong> Execute tools with direct arguments.</p>
        <pre>curl -X POST ${baseUrl}/api/create_personal_data \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_id": "123e4567-e89b-12d3-a456-426614174000",
    "data_type": "contact",
    "title": "John Doe Contact",
    "content": {"name": "John", "email": "john@example.com"}
  }'</pre>
    </div>
    
    <div class="endpoint">
        <div><span class="method">GET</span> <span class="url">/health</span></div>
        <p>Health check endpoint for monitoring.</p>
        <pre>curl ${baseUrl}/health</pre>
    </div>
    
    <h2>MCP Protocol Endpoints</h2>
    
    <div class="endpoint">
        <div><span class="method">POST</span> <span class="url">/mcp</span></div>
        <p>Standard MCP JSON-RPC endpoint.</p>
        <pre>curl -X POST ${baseUrl}/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'</pre>
    </div>
    
    <h2>Claude Desktop Integration</h2>
    <div class="claude-config">
        <h3>Setup Instructions</h3>
        <p>1. Create a bridge client script (see repository)</p>
        <p>2. Configure Claude Desktop with:</p>
        <pre>{
  "mcpServers": {
    "personal-data": {
      "command": "node",
      "args": ["path/to/mcp-bridge.js", "${baseUrl}"]
    }
  }
}</pre>
    </div>
    
    <h2>Available Tools</h2>
    <ul>
        <li><strong>extract_personal_data</strong> - Extract personal data with filtering</li>
        <li><strong>create_personal_data</strong> - Create new personal data records</li>
        <li><strong>update_personal_data</strong> - Update existing records</li>
        <li><strong>delete_personal_data</strong> - Delete records (soft or hard)</li>
        <li><strong>search_personal_data</strong> - Search through personal data</li>
        <li><strong>add_personal_data_field</strong> - Add new field definitions</li>
    </ul>
    
    <h2>Integration Examples</h2>
    <h3>JavaScript/Node.js</h3>
    <pre>const response = await fetch('${baseUrl}/tools/search_personal_data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user123',
    query: 'documents'
  })
});
const result = await response.json();</pre>
    
    <h3>Python</h3>
    <pre>import requests

response = requests.post('${baseUrl}/tools/search_personal_data', 
    json={'user_id': 'user123', 'query': 'documents'})
result = response.json()</pre>
    
    <h3>curl</h3>
    <pre>curl -X POST ${baseUrl}/tools/search_personal_data \\
  -H "Content-Type: application/json" \\
  -d '{"user_id": "user123", "query": "documents"}'</pre>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlDoc);
  }

  async start(): Promise<void> {
    try {
      const port = process.env.PORT || 3000;
      
      // Initialize MCP server at startup to avoid cold start delays
      logger.info('Pre-initializing MCP server...');
      await this.initializeMCPServer();
      
      this.server = this.app.listen(port, () => {
        logger.info(`HTTP MCP Server listening on port ${port}`);
        console.log(`HTTP MCP Server listening on port ${port}`);
        console.log(`API Documentation: http://localhost:${port}/`);
        console.log(`AI Agent Endpoints:`);
        console.log(`  Tools List: http://localhost:${port}/tools`);
        console.log(`  Execute Tool: http://localhost:${port}/tools/{tool_name}`);
        console.log(`Traditional API Endpoints:`);
        console.log(`  Tools List: http://localhost:${port}/api`);
        console.log(`  Execute Tool: http://localhost:${port}/api/{tool_name}`);
        console.log(`Other Endpoints:`);
        console.log(`  Health check: http://localhost:${port}/health`);
        console.log(`  MCP endpoint: http://localhost:${port}/mcp`);
      });

      // Graceful shutdown handling
      process.on('SIGINT', this.shutdown.bind(this));
      process.on('SIGTERM', this.shutdown.bind(this));
      
    } catch (error) {
      logger.critical('Failed to start HTTP MCP Server', error as Error, ErrorCategory.SYSTEM);
      throw error;
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down HTTP MCP Server...');
    
    // Close all active transports
    for (const [sessionId, transport] of this.transports) {
      try {
        logger.info('Closing transport', { sessionId });
        await transport.close();
      } catch (error) {
        logger.error('Error closing transport', error as Error, ErrorCategory.SYSTEM, { sessionId });
      }
    }
    
    this.transports.clear();
    errorMonitoring.stop();
    
    if (this.server) {
      this.server.close(() => {
        logger.info('HTTP Server shutdown complete');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}

export { HTTPMCPServer };