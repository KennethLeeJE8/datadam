#!/usr/bin/env node

import express from 'express';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

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

    // MCP endpoints
    this.app.post('/mcp', this.handleMCPPost.bind(this));
    this.app.get('/mcp', this.handleMCPGet.bind(this));
    this.app.delete('/mcp', this.handleMCPDelete.bind(this));

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
      const sessionId = req.headers['mcp-session-id'] as string;
      let transport: StreamableHTTPServerTransport;

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
        await transport.handleRequest(req as any, res, req.body);
        return;
      }

      // Handle request with existing transport
      await transport.handleRequest(req as any, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP POST request', error as Error, ErrorCategory.NETWORK);
      
      if (!res.headersSent) {
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
    const sessionId = req.headers['mcp-session-id'] as string;
    
    logger.info('Received MCP GET request (SSE)', { 
      sessionId,
      ip: req.ip,
      requestId: (req as any).requestId
    });

    if (!sessionId || !this.transports.has(sessionId)) {
      logger.warn('Invalid session ID for SSE request', ErrorCategory.VALIDATION, { sessionId });
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const lastEventId = req.headers['last-event-id'] as string;
    if (lastEventId) {
      logger.info('Client reconnecting with Last-Event-ID', { sessionId, lastEventId });
    }

    try {
      const transport = this.transports.get(sessionId)!;
      await transport.handleRequest(req as any, res);
    } catch (error) {
      logger.error('Error handling MCP GET request', error as Error, ErrorCategory.NETWORK);
      if (!res.headersSent) {
        res.status(500).send('Error establishing SSE stream');
      }
    }
  }

  private async handleMCPDelete(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;
    
    logger.info('Received session termination request', { 
      sessionId,
      ip: req.ip,
      requestId: (req as any).requestId
    });

    if (!sessionId || !this.transports.has(sessionId)) {
      logger.warn('Invalid session ID for termination request', ErrorCategory.VALIDATION, { sessionId });
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    try {
      const transport = this.transports.get(sessionId)!;
      await transport.handleRequest(req as any, res);
    } catch (error) {
      logger.error('Error handling session termination', error as Error, ErrorCategory.NETWORK);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  }

  private async handleListTools(req: express.Request, res: express.Response): Promise<void> {
    logger.info('Received REST API request for tools list', { 
      ip: req.ip,
      requestId: (req as any).requestId
    });

    try {
      // Ensure MCP server is initialized
      await this.getMCPServer();
      
      const tools = this.toolRegistry.getTools();
      
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
          mcp_endpoint: 'POST /mcp-public',
          documentation: 'GET /',
          health: 'GET /health'
        },
        usage_examples: {
          list_tools: `curl ${req.protocol}://${req.get('host')}/tools`,
          execute_tool: `curl -X POST ${req.protocol}://${req.get('host')}/tools/search_personal_data -H "Content-Type: application/json" -d '{"user_id": "user123", "query": "example"}'`
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error handling tools list request', error as Error, ErrorCategory.NETWORK);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve tools list',
        timestamp: new Date().toISOString()
      });
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
        res.status(400).json({
          error: 'Validation Error',
          message: errorMessage,
          tool_schema: this.toolRegistry.getTool(toolName)?.inputSchema,
          timestamp: new Date().toISOString(),
          requestId: requestId
        });
      } else if (errorMessage.includes('Database error') || errorMessage.includes('connection')) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: 'Database connection issue. Please try again.',
          timestamp: new Date().toISOString(),
          requestId: requestId
        });
      } else {
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