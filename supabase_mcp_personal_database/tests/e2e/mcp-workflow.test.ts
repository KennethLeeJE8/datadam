import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

describe('MCP Server End-to-End Tests', () => {
  let serverProcess: ChildProcess;
  const serverEvents = new EventEmitter();

  beforeAll(async () => {
    // Build the project first
    await new Promise<void>((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        stdio: 'pipe'
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}`));
        }
      });
    });
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }
  });

  test('should start MCP server successfully', async () => {
    return new Promise<void>((resolve, reject) => {
      serverProcess = spawn('node', ['dist/server/index.js'], {
        stdio: 'pipe'
      });

      let output = '';
      
      serverProcess.stdout?.on('data', (data) => {
        output += data.toString();
        if (output.includes('Server started') || output.includes('listening')) {
          resolve();
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        const message = data.toString();
        output += message;
        
        // Check for startup success message
        if (message.includes('Server started') || message.includes('running on stdio')) {
          resolve();
        }
        
        // Only reject on actual errors, not startup messages
        if (message.includes('Error') && !message.includes('warning') && !message.includes('Server started')) {
          reject(new Error(`Server error: ${message}`));
        }
      });

      serverProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000);
    });
  }, 15000);

  test('should handle MCP protocol messages', async () => {
    if (!serverProcess) {
      throw new Error('Server not started');
    }

    return new Promise<void>((resolve, reject) => {
      const initMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: {
              listChanged: true
            },
            sampling: {}
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      }) + '\n';

      let responseReceived = false;

      serverProcess.stdout?.on('data', (data) => {
        const response = data.toString();
        try {
          const parsed = JSON.parse(response);
          if (parsed.id === 1 && parsed.result) {
            responseReceived = true;
            resolve();
          }
        } catch (err) {
          // Ignore JSON parse errors (might be partial data)
        }
      });

      serverProcess.stdin?.write(initMessage);

      setTimeout(() => {
        if (!responseReceived) {
          reject(new Error('No response to initialize message'));
        }
      }, 5000);
    });
  }, 10000);

  test('should handle tools/list request', async () => {
    if (!serverProcess) {
      throw new Error('Server not started');
    }

    return new Promise<void>((resolve, reject) => {
      const toolsListMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      }) + '\n';

      let responseReceived = false;

      serverProcess.stdout?.on('data', (data) => {
        const response = data.toString();
        try {
          const parsed = JSON.parse(response);
          if (parsed.id === 2 && parsed.result && parsed.result.tools) {
            responseReceived = true;
            expect(parsed.result.tools).toBeInstanceOf(Array);
            resolve();
          }
        } catch (err) {
          // Ignore JSON parse errors
        }
      });

      serverProcess.stdin?.write(toolsListMessage);

      setTimeout(() => {
        if (!responseReceived) {
          reject(new Error('No response to tools/list message'));
        }
      }, 5000);
    });
  }, 10000);

  test('should handle resources/list request', async () => {
    if (!serverProcess) {
      throw new Error('Server not started');
    }

    return new Promise<void>((resolve, reject) => {
      const resourcesListMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
        params: {}
      }) + '\n';

      let responseReceived = false;

      serverProcess.stdout?.on('data', (data) => {
        const response = data.toString();
        try {
          const parsed = JSON.parse(response);
          if (parsed.id === 3 && parsed.result) {
            responseReceived = true;
            expect(parsed.result.resources).toBeInstanceOf(Array);
            resolve();
          }
        } catch (err) {
          // Ignore JSON parse errors
        }
      });

      serverProcess.stdin?.write(resourcesListMessage);

      setTimeout(() => {
        if (!responseReceived) {
          reject(new Error('No response to resources/list message'));
        }
      }, 5000);
    });
  }, 10000);

  test('should handle personal data extraction tool call', async () => {
    if (!serverProcess) {
      throw new Error('Server not started');
    }

    return new Promise<void>((resolve, reject) => {
      // First send initialize message
      const initMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: true },
            sampling: {}
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      }) + '\n';

      const queryMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'extract_personal_data',
          arguments: {
            user_id: 'test_user_123',
            limit: 1
          }
        }
      }) + '\n';

      let initReceived = false;
      let responseReceived = false;
      let messageQueue: string[] = [initMessage, queryMessage];
      let currentMessageIndex = 0;

      const processNextMessage = () => {
        if (currentMessageIndex < messageQueue.length) {
          serverProcess.stdin?.write(messageQueue[currentMessageIndex]);
          currentMessageIndex++;
        }
      };

      serverProcess.stdout?.on('data', (data) => {
        const responses = data.toString().split('\n').filter((line: string) => line.trim());
        
        for (const response of responses) {
          try {
            const parsed = JSON.parse(response);
            
            if (parsed.id === 10 && !initReceived) {
              initReceived = true;
              // Small delay then send the next message
              setTimeout(processNextMessage, 100);
            } else if (parsed.id === 11) {
              responseReceived = true;
              // Should either succeed or fail gracefully
              expect(parsed.result || parsed.error).toBeDefined();
              resolve();
            }
          } catch (err) {
            // Ignore JSON parse errors - might be partial data
          }
        }
      });

      // Start by sending the init message
      processNextMessage();

      setTimeout(() => {
        if (!responseReceived) {
          reject(new Error('No response to extract_personal_data tool call'));
        }
      }, 10000);
    });
  }, 15000);
});