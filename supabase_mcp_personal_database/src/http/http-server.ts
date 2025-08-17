#!/usr/bin/env node

import express from 'express';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

import { PersonalDataMCPServer } from '../server/PersonalDataMCPServer.js';
import { logger, ErrorCategory } from '../utils/logger.js';
import { errorMonitoring } from '../utils/monitoring.js';
import { validateApiKey, rateLimit, requestTimeout, connectionLimit, AuthenticatedRequest } from './auth-middleware.js';

dotenv.config();

class HTTPMCPServer {
  private app: express.Application;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private server: any;

  constructor() {
    this.app = express();
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

  private setupRoutes(): void {
    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      const authEnabled = !!process.env.MCP_API_KEY;
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
          authenticationEnabled: authEnabled,
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

    // Metrics endpoint (no auth required)
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

    // MCP endpoints with authentication
    this.app.post('/mcp', validateApiKey, this.handleMCPPost.bind(this));
    this.app.get('/mcp', validateApiKey, this.handleMCPGet.bind(this));
    this.app.delete('/mcp', validateApiKey, this.handleMCPDelete.bind(this));
  }

  private async handleMCPPost(req: AuthenticatedRequest, res: express.Response): Promise<void> {
    logger.info('Received MCP POST request', { 
      body: req.body,
      authenticated: req.auth?.isAuthenticated || false,
      ip: req.ip,
      requestId: (req as any).requestId
    });

    try {
      const sessionId = req.headers['mcp-session-id'] as string;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.has(sessionId)) {
        // Reuse existing transport
        transport = this.transports.get(sessionId)!;
        logger.info('Reusing existing transport', { sessionId });
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        logger.info('Creating new transport for initialization');
        
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

        // Create and connect MCP server
        const mcpServer = new PersonalDataMCPServer();
        await mcpServer.initializeDatabase();
        await mcpServer.getServer().connect(transport);
        await transport.handleRequest(req as any, res, req.body);
        return;
      } else {
        // Invalid request
        logger.warn('Invalid MCP request - no session ID or not initialization', 
          ErrorCategory.VALIDATION, 
          { metadata: { hasSessionId: !!sessionId, isInit: isInitializeRequest(req.body) } });
        
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or not initialization request',
            data: {
              requestId: (req as any).requestId,
              timestamp: new Date().toISOString()
            }
          },
          id: null,
        });
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

  private async handleMCPGet(req: AuthenticatedRequest, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;
    
    logger.info('Received MCP GET request (SSE)', { 
      sessionId,
      authenticated: req.auth?.isAuthenticated || false,
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

  private async handleMCPDelete(req: AuthenticatedRequest, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;
    
    logger.info('Received session termination request', { 
      sessionId,
      authenticated: req.auth?.isAuthenticated || false,
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

  async start(): Promise<void> {
    try {
      const port = process.env.PORT || 3000;
      
      this.server = this.app.listen(port, () => {
        logger.info(`HTTP MCP Server listening on port ${port}`);
        console.log(`HTTP MCP Server listening on port ${port}`);
        console.log(`Health check: http://localhost:${port}/health`);
        console.log(`MCP endpoint: http://localhost:${port}/mcp`);
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