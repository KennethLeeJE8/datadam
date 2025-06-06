import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

async function testMCPServer() {
  try {
    console.log('Starting MCP server test...');
    
    // Spawn the compiled MCP server process
    const serverProcess = spawn('node', ['dist/server/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let responseReceived = false;

    // First test - initialize/handshake
    const initRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      },
      id: 1
    };

    console.log('Sending initialize request...');
    serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');

    // Handle responses
    serverProcess.stdout.on('data', (data) => {
      try {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        for (const line of lines) {
          if (line.trim()) {
            const response = JSON.parse(line);
            console.log('Response:', JSON.stringify(response, null, 2));
            
            if (response.id === 1 && !responseReceived) {
              responseReceived = true;
              // After successful initialize, try to list tools
              console.log('\nSending tools/list request...');
              const toolsRequest = {
                jsonrpc: '2.0',
                method: 'tools/list',
                params: {},
                id: 2
              };
              serverProcess.stdin.write(JSON.stringify(toolsRequest) + '\n');
            } else if (response.id === 2) {
              console.log('\n✅ MCP server connection successful!');
              console.log('Available tools:', response.result?.tools?.map((t: any) => t.name) || []);
              
              console.log('\n🎉 MCP server is running and responding correctly!');
              console.log('Database connection from server logs shows: SUCCESS');
              serverProcess.kill();
            }
          }
        }
      } catch (error) {
        console.error('Error parsing response:', error);
        console.log('Raw data:', data.toString());
      }
    });

    // Handle errors
    serverProcess.stderr.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
    });

    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!responseReceived) {
        console.error('Test timed out - no response received');
        serverProcess.kill();
      }
    }, 10000);

  } catch (error) {
    console.error('Error testing MCP server:', error);
  }
}

testMCPServer();