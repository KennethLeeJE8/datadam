#!/usr/bin/env node

/**
 * MCP Bridge Client
 * 
 * This script acts as a bridge between Claude Desktop (which expects stdio MCP protocol)
 * and the HTTP MCP server deployed on Render.com.
 * 
 * Usage:
 *   node mcp-bridge.js <server-url>
 * 
 * Claude Desktop Configuration:
 * {
 *   "mcpServers": {
 *     "personal-data": {
 *       "command": "node",
 *       "args": ["path/to/mcp-bridge.js", "https://datadam-mcp.onrender.com"]
 *     }
 *   }
 * }
 */

import readline from 'readline';
import https from 'https';
import http from 'http';
import { URL } from 'url';

class MCPBridge {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.sessionId = null;
    this.requestIdCounter = 1;
    
    // Setup readline interface for stdin/stdout
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    
    // Enable verbose logging if DEBUG environment variable is set
    this.debug = process.env.DEBUG === 'true';
    
    this.log('MCP Bridge starting...', { serverUrl });
    this.setupEventHandlers();
  }

  log(message, data = {}) {
    if (this.debug) {
      console.error(`[MCP-Bridge] ${message}`, JSON.stringify(data, null, 2));
    }
  }

  setupEventHandlers() {
    // Handle incoming JSON-RPC requests from Claude Desktop
    this.rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line.trim());
        this.log('Received request from Claude Desktop', { request });
        
        const response = await this.handleRequest(request);
        
        this.log('Sending response to Claude Desktop', { response });
        console.log(JSON.stringify(response));
      } catch (error) {
        this.log('Error processing request', { error: error.message });
        
        // Send error response back to Claude Desktop
        const errorResponse = {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          },
          id: null
        };
        console.log(JSON.stringify(errorResponse));
      }
    });

    // Handle process shutdown gracefully
    process.on('SIGINT', () => {
      this.log('Received SIGINT, shutting down...');
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.log('Received SIGTERM, shutting down...');
      this.cleanup();
      process.exit(0);
    });
  }

  async handleRequest(request) {
    const { method, params, id } = request;
    
    try {
      switch (method) {
        case 'initialize':
          return await this.handleInitialize(request);
        
        case 'tools/list':
        case 'tools/call':
        case 'resources/list':
        case 'resources/read':
        case 'prompts/list':
        case 'prompts/get':
          return await this.forwardToHTTPServer(request);
        
        default:
          return {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            },
            id
          };
      }
    } catch (error) {
      this.log('Error in handleRequest', { error: error.message, method });
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        },
        id
      };
    }
  }

  async handleInitialize(request) {
    try {
      // Forward initialization to HTTP server
      const response = await this.forwardToHTTPServer(request);
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      this.log('Initialization successful', { response });
      
      return {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          serverInfo: {
            name: 'personal-data-bridge',
            version: '1.0.0'
          }
        },
        id: request.id
      };
    } catch (error) {
      this.log('Initialization failed', { error: error.message });
      return {
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Initialization failed',
          data: error.message
        },
        id: request.id
      };
    }
  }

  async forwardToHTTPServer(request) {
    return new Promise((resolve, reject) => {
      const url = new URL('/mcp-public', this.serverUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const postData = JSON.stringify(request);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'MCP-Bridge/1.0.0'
        }
      };

      // Add session ID header if we have one
      if (this.sessionId) {
        options.headers['mcp-session-id'] = this.sessionId;
      }

      this.log('Forwarding request to HTTP server', { url: url.toString(), options: { ...options, headers: options.headers } });

      const req = httpModule.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            // Extract session ID from response headers
            const sessionId = res.headers['mcp-session-id'];
            if (sessionId && !this.sessionId) {
              this.sessionId = sessionId;
              this.log('Session ID established', { sessionId });
            }
            
            const response = JSON.parse(data);
            this.log('Received response from HTTP server', { response });
            resolve(response);
          } catch (error) {
            this.log('Error parsing HTTP response', { error: error.message, data });
            reject(new Error(`Invalid JSON response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        this.log('HTTP request error', { error: error.message });
        reject(new Error(`HTTP request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        this.log('HTTP request timeout');
        req.destroy();
        reject(new Error('HTTP request timeout'));
      });

      // Set timeout (30 seconds)
      req.setTimeout(30000);

      req.write(postData);
      req.end();
    });
  }

  cleanup() {
    this.log('Cleaning up bridge client...');
    
    if (this.rl) {
      this.rl.close();
    }
    
    // TODO: Send session termination request to HTTP server if needed
    if (this.sessionId) {
      this.log('Terminating session', { sessionId: this.sessionId });
      // Could send DELETE request to /mcp-public with session ID
    }
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: node mcp-bridge.js <server-url>');
    console.error('Example: node mcp-bridge.js https://datadam-mcp.onrender.com');
    process.exit(1);
  }
  
  const serverUrl = args[0];
  
  // Validate URL
  try {
    new URL(serverUrl);
  } catch (error) {
    console.error(`Invalid server URL: ${serverUrl}`);
    process.exit(1);
  }
  
  // Start the bridge
  new MCPBridge(serverUrl);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default MCPBridge;