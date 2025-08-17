import { spawn } from 'child_process';

async function testCreateTool() {
  return new Promise((resolve, reject) => {
    const serverProcess = spawn('node', ['dist/server/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let step = 0;
    
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
            user_id: 'test-user-123',
            data_type: 'contact',
            title: 'Test Contact',
            content: { name: 'John Doe', email: 'john@example.com' }
          }
        },
        id: 2
      }
    ];

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Raw output:', output);
      
      const lines = output.split('\n').filter(line => line.trim());
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            console.log(`Response ${response.id}:`, JSON.stringify(response, null, 2));
            
            if (response.id === 1) {
              console.log('\n→ Sending create tool request...');
              serverProcess.stdin.write(JSON.stringify(requests[1]) + '\n');
            } else if (response.id === 2) {
              serverProcess.kill();
              resolve(response);
            }
          } catch (parseError) {
            // Skip non-JSON lines (log messages)
          }
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.log('Server stderr:', data.toString());
    });

    serverProcess.on('close', (code) => {
      console.log('Server closed with code:', code);
    });

    // Start with initialize
    console.log('→ Sending initialize request...');
    serverProcess.stdin.write(JSON.stringify(requests[0]) + '\n');

    setTimeout(() => {
      serverProcess.kill();
      reject(new Error('Test timed out'));
    }, 15000);
  });
}

console.log('🧪 Testing create_personal_data tool...\n');
testCreateTool()
  .then(result => {
    console.log('\n✅ Tool test completed');
  })
  .catch(error => {
    console.log('\n❌ Tool test failed:', error.message);
  });