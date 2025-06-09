class SimpleMCPClient {
  constructor() {
    this.mcpServerPath = '/Users/kenne/github/datadam/supabase_mcp_personal_database';
    this.mcpProcess = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.isInitialized = false;
  }

  async connect() {
    if (this.mcpProcess) return;

    console.log('Starting MCP server process...');
    
    // Spawn the MCP server directly
    this.mcpProcess = new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      let serverStarted = false;
      let serverError = null;
      
      const process = spawn('node', ['dist/server/index.js'], {
        cwd: this.mcpServerPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Handle stdout (responses from MCP server)
      process.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('MCP Server output:', output);
        
        // Check if server started successfully
        if (output.includes('MCP Server running') || output.includes('Server started')) {
          serverStarted = true;
        }
        
        // Parse JSON responses line by line
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim() && line.includes('{')) {
            try {
              const response = JSON.parse(line.trim());
              this.handleMCPResponse(response);
            } catch (e) {
              // Not valid JSON, skip
            }
          }
        }
      });

      process.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        console.log('MCP Server stderr:', errorOutput);
        
        // Check for common server startup errors
        if (errorOutput.includes('ECONNREFUSED') || 
            errorOutput.includes('Database connection failed') ||
            errorOutput.includes('Error:') ||
            errorOutput.includes('Cannot find module')) {
          serverError = errorOutput;
        }
      });

      process.on('error', (error) => {
        console.error('MCP Server spawn error:', error);
        if (error.code === 'ENOENT') {
          reject(new Error(`MCP Server not found. Check that Node.js is installed and the server exists at: ${this.mcpServerPath}`));
        } else {
          reject(new Error(`Failed to start MCP server: ${error.message}`));
        }
      });

      process.on('close', (code) => {
        console.log('MCP Server closed with code:', code);
        if (code !== 0 && !serverStarted) {
          const errorMsg = serverError || `MCP server exited with code ${code}`;
          reject(new Error(`MCP Server failed to start: ${errorMsg}`));
        }
      });

      // Timeout if server doesn't start within 10 seconds
      setTimeout(() => {
        if (!serverStarted) {
          process.kill();
          reject(new Error('MCP Server startup timeout. The server may not be properly configured or dependencies are missing.'));
        }
      }, 10000);

      resolve(process);
    });

    try {
      this.mcpProcess = await this.mcpProcess;
      
      // Wait a moment for server to fully initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Initialize the MCP server
      await this.initialize();
    } catch (error) {
      this.mcpProcess = null;
      throw new Error(`MCP Server connection failed: ${error.message}`);
    }
  }

  async initialize() {
    const initRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '1.0.0',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'browser-extension',
          version: '1.0.0'
        }
      },
      id: this.messageId++
    };

    console.log('Sending initialize request:', initRequest);
    const result = await this.sendRequest(initRequest);
    this.isInitialized = true;
    console.log('MCP server initialized:', result);
    return result;
  }

  async extractPersonalData(userId) {
    if (!this.isInitialized) {
      await this.connect();
    }

    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'extract_personal_data',
        arguments: {
          user_id: userId
        }
      },
      id: this.messageId++
    };

    console.log('Sending extract_personal_data request:', request);
    return this.sendRequest(request);
  }

  sendRequest(request) {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.id, { resolve, reject });
      
      // Send the request to MCP server stdin
      this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
      
      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  handleMCPResponse(response) {
    console.log('Received MCP response:', response);
    
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      
      if (response.error) {
        pending.reject(new Error(response.error.message || 'MCP error'));
      } else {
        pending.resolve(response.result);
      }
    }
  }

  disconnect() {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.mcpProcess = null;
    }
  }
}

// Background service
class SimpleBackgroundService {
  constructor() {
    this.mcpClient = new SimpleMCPClient();
    this.setupMessageListeners();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep the message channel open for async response
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getProfiles':
          const profiles = await this.getProfiles();
          sendResponse({ success: true, profiles });
          break;

        case 'getConnectionStatus':
          sendResponse({ 
            success: true, 
            connected: this.mcpClient.isInitialized 
          });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background service error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async getProfiles() {
    try {
      const result = await this.mcpClient.extractPersonalData('60767eca-63eb-43be-a861-fc0fbf46f468');
      
      // Parse the text content from MCP response
      if (result.content && result.content[0] && result.content[0].type === 'text') {
        const data = JSON.parse(result.content[0].text);
        return data.data || [];
      }
      
      return [];
    } catch (error) {
      console.error('Failed to get profiles:', error);
      
      // Check if it's a server connection error
      if (error.message.includes('MCP Server') || 
          error.message.includes('connection failed') ||
          error.message.includes('not found') ||
          error.message.includes('timeout')) {
        // Re-throw server errors to be handled by the UI
        throw error;
      }
      
      // For other errors, return mock data as fallback
      return [
        {
          id: 1,
          name: 'John Doe',
          email: 'john.doe@example.com',
          phone: '+1-555-123-4567'
        }
      ];
    }
  }
}

// Start the background service
const backgroundService = new SimpleBackgroundService();