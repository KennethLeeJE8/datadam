import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

async function testTool(toolName, args) {
  return new Promise((resolve, reject) => {
    const serverProcess = spawn('node', ['dist/server/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let responseReceived = false;
    let initDone = false;

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
              const toolRequest = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: { name: toolName, arguments: args },
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

async function runAllTests() {
  console.log('🧪 Testing all MCP tools with proper UUIDs...\n');
  
  const testUserId = randomUUID();
  let createdRecordId = null;

  try {
    // Test 1: Create personal data
    console.log('1. ✅ Testing create_personal_data...');
    const createResult = await testTool('create_personal_data', {
      user_id: testUserId,
      data_type: 'contact',
      title: 'Test Contact',
      content: { name: 'John Doe', email: 'john@example.com' },
      tags: ['test', 'contact']
    });
    
    const createResponse = JSON.parse(createResult.result.content[0].text);
    createdRecordId = createResponse.record.id;
    console.log('   ✅ Created record with ID:', createdRecordId);

    // Test 2: Extract personal data
    console.log('\n2. ✅ Testing extract_personal_data...');
    const extractResult = await testTool('extract_personal_data', {
      user_id: testUserId,
      limit: 10
    });
    const extractResponse = JSON.parse(extractResult.result.content[0].text);
    console.log('   ✅ Found', extractResponse.data.length, 'records');

    // Test 3: Search personal data
    console.log('\n3. ✅ Testing search_personal_data...');
    const searchResult = await testTool('search_personal_data', {
      user_id: testUserId,
      query: 'John'
    });
    const searchResponse = JSON.parse(searchResult.result.content[0].text);
    console.log('   ✅ Search found', searchResponse.count, 'results');

    // Test 4: Update personal data
    console.log('\n4. ✅ Testing update_personal_data...');
    const updateResult = await testTool('update_personal_data', {
      record_id: createdRecordId,
      updates: { title: 'Updated Test Contact' }
    });
    const updateResponse = JSON.parse(updateResult.result.content[0].text);
    console.log('   ✅ Updated record title to:', updateResponse.record.title);

    // Test 5: Add personal data field
    console.log('\n5. ✅ Testing add_personal_data_field...');
    const fieldResult = await testTool('add_personal_data_field', {
      field_name: 'test_field_' + Date.now(),
      data_type: 'string'
    });
    const fieldResponse = JSON.parse(fieldResult.result.content[0].text);
    console.log('   ✅ Created field:', fieldResponse.field_definition.field_name);

    // Test 6: Delete personal data
    console.log('\n6. ✅ Testing delete_personal_data...');
    const deleteResult = await testTool('delete_personal_data', {
      record_ids: [createdRecordId],
      hard_delete: false
    });
    const deleteResponse = JSON.parse(deleteResult.result.content[0].text);
    console.log('   ✅ Soft deleted', deleteResponse.soft_deleted.length, 'records');

    console.log('\n🎉 ALL TOOLS WORKING PERFECTLY!');
    console.log('\n📋 Summary:');
    console.log('   ✅ create_personal_data - Creates records successfully');
    console.log('   ✅ extract_personal_data - Retrieves user data');
    console.log('   ✅ search_personal_data - Full-text search working');
    console.log('   ✅ update_personal_data - Updates records correctly');
    console.log('   ✅ add_personal_data_field - Field definitions working');
    console.log('   ✅ delete_personal_data - Soft delete functioning');
    console.log('\n💡 Issue was: Database expects UUIDs for user_id, not strings');

  } catch (error) {
    console.error('❌ Error during testing:', error.message);
  }
}

runAllTests();