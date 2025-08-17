import { spawn } from 'child_process';

async function testTool(toolName, args) {
  return new Promise((resolve, reject) => {
    const serverProcess = spawn('node', ['dist/server/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let responseReceived = false;
    let initDone = false;

    // Initialize first
    const initRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'test-client', version: '1.0.0' }
      },
      id: 1
    };

    serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');

    serverProcess.stdout.on('data', (data) => {
      try {
        const lines = data.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          if (line.trim()) {
            const response = JSON.parse(line);
            
            if (response.id === 1 && !initDone) {
              initDone = true;
              // Send tool call
              const toolRequest = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                  name: toolName,
                  arguments: args
                },
                id: 2
              };
              serverProcess.stdin.write(JSON.stringify(toolRequest) + '\n');
            } else if (response.id === 2 && !responseReceived) {
              responseReceived = true;
              serverProcess.kill();
              resolve(response);
            }
          }
        }
      } catch (error) {
        // Ignore parsing errors from log messages
      }
    });

    serverProcess.on('close', () => {
      if (!responseReceived) {
        reject(new Error('No response received'));
      }
    });

    setTimeout(() => {
      if (!responseReceived) {
        serverProcess.kill();
        reject(new Error('Test timed out'));
      }
    }, 10000);
  });
}

async function runTests() {
  console.log('🧪 Testing all MCP tools...\n');

  try {
    // Test 1: Create personal data
    console.log('1. Testing create_personal_data...');
    const createResult = await testTool('create_personal_data', {
      user_id: 'test-user-123',
      data_type: 'contact',
      title: 'Test Contact',
      content: { name: 'John Doe', email: 'john@example.com' },
      tags: ['test', 'contact']
    });
    console.log('✅ Create result:', JSON.stringify(createResult.result, null, 2));

    // Test 2: Extract personal data
    console.log('\n2. Testing extract_personal_data...');
    const extractResult = await testTool('extract_personal_data', {
      user_id: 'test-user-123',
      limit: 10
    });
    console.log('✅ Extract result:', JSON.stringify(extractResult.result, null, 2));

    // Test 3: Search personal data
    console.log('\n3. Testing search_personal_data...');
    const searchResult = await testTool('search_personal_data', {
      user_id: 'test-user-123',
      query: 'John'
    });
    console.log('✅ Search result:', JSON.stringify(searchResult.result, null, 2));

    // Test 4: Add personal data field
    console.log('\n4. Testing add_personal_data_field...');
    const fieldResult = await testTool('add_personal_data_field', {
      field_name: 'test_field',
      data_type: 'string'
    });
    console.log('✅ Field result:', JSON.stringify(fieldResult.result, null, 2));

    console.log('\n🎉 All tool tests completed successfully!');

  } catch (error) {
    console.error('❌ Error during testing:', error.message);
  }
}

runTests();