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
      output: process.stderr, // Use stderr for logging to avoid interfering with stdout
      terminal: false
    });
    
    // Enable verbose logging if DEBUG environment variable is set
    this.debug = process.env.DEBUG === 'true';
    
    this.log('MCP Bridge starting...', { serverUrl });
    this.setupEventHandlers();
  }

  log(message, data = {}) {
    if (this.debug) {
      process.stderr.write(`[MCP-Bridge] ${message} ${JSON.stringify(data)}\n`);
    }
  }

  setupEventHandlers() {
    // Handle incoming JSON-RPC requests from Claude Desktop
    this.rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line.trim());
        this.log('Received request from Claude Desktop', { request });
        
        const response = await this.handleRequest(request);
        
        // Only send response if it's not null (notifications don't need responses)
        if (response !== null) {
          // Validate response structure - must have jsonrpc and either result OR error
          if (!response.jsonrpc || response.jsonrpc !== '2.0') {
            process.stderr.write(`[ERROR] Invalid jsonrpc version: ${JSON.stringify(response)}\n`);
            return;
          }
          
          if (!response.hasOwnProperty('result') && !response.hasOwnProperty('error')) {
            process.stderr.write(`[ERROR] Response missing result or error: ${JSON.stringify(response)}\n`);
            return;
          }
          
          // Ensure id field is present (required for all responses except notifications)
          if (!response.hasOwnProperty('id')) {
            process.stderr.write(`[ERROR] Response missing id field: ${JSON.stringify(response)}\n`);
            return;
          }
          
          this.log('Sending response to Claude Desktop', { response });
          
          // Send response to Claude Desktop via stdout
          const responseStr = JSON.stringify(response);
          process.stdout.write(responseStr + '\n');
          
          // Ensure it's flushed immediately
          if (process.stdout.cork) {
            process.stdout.uncork();
          }
        } else {
          this.log('Notification processed, no response needed');
        }
      } catch (error) {
        process.stderr.write(`[ERROR] Request failed: ${error.message}\n`);
        
        // Try to extract request ID for error response
        let requestId = null;
        try {
          const request = JSON.parse(line.trim());
          requestId = request.id || null;
        } catch (parseError) {
          // If we can't parse the request, use null ID
          requestId = null;
        }
        
        // Send error response back to Claude Desktop  
        const errorResponse = {
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error',
            data: error.message
          },
          id: requestId
        };
        const errorStr = JSON.stringify(errorResponse);
        process.stdout.write(errorStr + '\n');
        
        // Ensure it's flushed immediately
        if (process.stdout.cork) {
          process.stdout.uncork();
        }
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
          return await this.handleListTools(id);
        
        case 'tools/call':
          return await this.handleCallTool(params, id);
        
        case 'resources/list':
          return {
            jsonrpc: '2.0',
            result: {
              resources: []
            },
            id
          };
        
        case 'resources/read':
          return {
            jsonrpc: '2.0',
            result: {
              contents: []
            },
            id
          };
        
        case 'prompts/list':
          return {
            jsonrpc: '2.0',
            result: {
              prompts: []
            },
            id
          };
        
        case 'prompts/get':
          return {
            jsonrpc: '2.0',
            result: {
              description: '',
              messages: []
            },
            id
          };
        
        case 'notifications/initialized':
          // Notification - no response needed
          return null;
        
        default:
          return {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            },
            id: id || null
          };
      }
    } catch (error) {
      process.stderr.write(`[ERROR] ${method} failed: ${error.message}\n`);
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        },
        id: id || null
      };
    }
  }

  async handleInitialize(request) {
    try {
      this.log('Handling initialize request', { requestId: request.id });
      
      // Test connection to HTTP server by checking health endpoint
      const healthResponse = await this.makeRestRequest('GET', '/health');
      
      if (healthResponse.status !== 'healthy') {
        throw new Error('Server health check failed');
      }
      
      this.log('Server health check passed', { healthResponse });
      
      const response = {
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
      
      this.log('Initialize response prepared', { response });
      return response;
    } catch (error) {
      process.stderr.write(`[ERROR] Init failed: ${error.message}\n`);
      const errorResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Initialization failed',
          data: error.message
        },
        id: request.id || null
      };
      this.log('Initialize error response prepared', { errorResponse });
      return errorResponse;
    }
  }

  async handleListTools(id) {
    try {
      // Use the /tools endpoint to get the list
      const toolsData = await this.makeRestRequest('GET', '/tools');
      
      this.log('Retrieved tools list', { toolsCount: toolsData.tools?.length });
      
      // Clean up tools to only include MCP-expected fields
      const cleanedTools = (toolsData.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));
      
      return {
        jsonrpc: '2.0',
        result: {
          tools: cleanedTools
        },
        id
      };
    } catch (error) {
      this.log('Error listing tools', { error: error.message });
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Failed to list tools',
          data: error.message
        },
        id
      };
    }
  }

  async handleCallTool(params, id) {
    try {
      const { name, arguments: args } = params;
      
      this.log('Calling tool', { toolName: name, args });
      
      // Use the /tools/{toolName} endpoint with MCP format
      const result = await this.makeRestRequest('POST', `/tools/${name}`, {
        arguments: args
      });
      
      this.log('Tool call completed', { toolName: name, result: !!result });
      
      // Extract the actual result content from our server response
      let toolResult;
      if (result.result && result.result.content) {
        // Server returned MCP-style result
        toolResult = result.result.content;
      } else if (result.content) {
        // Direct content
        toolResult = result.content;
      } else {
        // Fallback to the whole result
        toolResult = [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }];
      }
      
      return {
        jsonrpc: '2.0',
        result: {
          content: toolResult
        },
        id: id || null
      };
    } catch (error) {
      process.stderr.write(`[ERROR] Tool ${params.name} failed: ${error.message}\n`);
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Tool execution failed',
          data: error.message
        },
        id: id || null
      };
    }
  }

  async makeRestRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.serverUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-Bridge/1.0.0'
        }
      };

      let postData = '';
      if (body) {
        postData = JSON.stringify(body);
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      this.log('Making REST request', { method, path, body });

      const req = httpModule.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            this.log('Received REST response', { response });
            
            if (res.statusCode >= 400) {
              reject(new Error(response.message || `HTTP ${res.statusCode}`));
            } else {
              resolve(response);
            }
          } catch (error) {
            this.log('Error parsing REST response', { error: error.message, data });
            reject(new Error(`Invalid JSON response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        process.stderr.write(`[ERROR] REST ${method} ${path} failed: ${error.message}\n`);
        reject(new Error(`REST request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        process.stderr.write(`[ERROR] REST ${method} ${path} timeout\n`);
        req.destroy();
        reject(new Error('REST request timeout'));
      });

      // Set timeout (45 seconds for tool calls)
      req.setTimeout(45000);

      if (postData) {
        req.write(postData);
      }
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
    process.stderr.write('Usage: node mcp-bridge.js <server-url>\n');
    process.stderr.write('Example: node mcp-bridge.js https://datadam-mcp.onrender.com\n');
    process.exit(1);
  }
  
  const serverUrl = args[0];
  
  // Validate URL
  try {
    new URL(serverUrl);
  } catch (error) {
    process.stderr.write(`Invalid server URL: ${serverUrl}\n`);
    process.exit(1);
  }
  
  // Start the bridge
  new MCPBridge(serverUrl);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  process.stderr.write(`Unhandled Rejection at: ${promise} reason: ${reason}\n`);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  process.stderr.write(`Uncaught Exception: ${error}\n`);
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default MCPBridge;