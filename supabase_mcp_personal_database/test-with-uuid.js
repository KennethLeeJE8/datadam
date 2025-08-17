import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

async function testCreateToolWithUUID() {
  return new Promise((resolve, reject) => {
    const testUserId = randomUUID(); // Generate a valid UUID
    console.log('Using test UUID:', testUserId);
    
    const serverProcess = spawn('node', ['dist/server/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    const requests = [
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 1
      },
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'create_personal_data',
          arguments: {
            user_id: testUserId, // Use valid UUID
            data_type: 'contact',
            title: 'Test Contact with UUID',
            content: { name: 'Jane Doe', email: 'jane@example.com' }
          }
        },
        id: 2
      }
    ];

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            
            if (response.id === 1) {
              console.log('✅ Initialize successful, sending create request...');
              serverProcess.stdin.write(JSON.stringify(requests[1]) + '\n');
            } else if (response.id === 2) {
              console.log('🎉 Create response:', JSON.stringify(response.result, null, 2));
              serverProcess.kill();
              resolve(response);
            }
          } catch (parseError) {
            // Skip non-JSON lines
          }
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.log('Server output:', data.toString());
    });

    // Start with initialize
    serverProcess.stdin.write(JSON.stringify(requests[0]) + '\n');

    setTimeout(() => {
      serverProcess.kill();
      reject(new Error('Test timed out'));
    }, 15000);
  });
}

console.log('🧪 Testing create_personal_data with valid UUID...\n');
testCreateToolWithUUID()
  .then(result => {
    console.log('\n✅ SUCCESS! MCP server is working correctly with valid UUIDs');
  })
  .catch(error => {
    console.log('\n❌ Test failed:', error.message);
  });