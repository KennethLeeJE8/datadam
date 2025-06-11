#!/usr/bin/env node

/**
 * Comprehensive API Test Suite for Browser Extension Personal Data Management
 * 
 * This script tests all the new API endpoints and browser extension functionality
 * for personal data management including CRUD operations, search, and field management.
 */

// Test configuration
const config = {
  httpApiUrl: 'http://localhost:3001',
  userId: '60767eca-63eb-43be-a861-fc0fbf46f468',
  timeout: 5000
};

// Test data
const testData = {
  personalData: [
    {
      data_type: 'contact',
      title: 'Test Emergency Contact',
      content: { name: 'Jane Doe', phone: '+1-555-0199', relationship: 'Emergency' },
      tags: ['emergency', 'contact', 'test'],
      classification: 'personal'
    },
    {
      data_type: 'document',
      title: 'Test ID Document',
      content: { document_type: 'passport', number: 'TEST123456', expiry: '2026-01-01' },
      tags: ['document', 'identity', 'test'],
      classification: 'sensitive'
    }
  ],
  fieldDefinitions: [
    {
      field_name: 'test_field_string',
      data_type: 'string',
      validation_rules: { min_length: 1, max_length: 100 },
      is_required: false
    },
    {
      field_name: 'test_field_number',
      data_type: 'number',
      validation_rules: { min: 0, max: 999 },
      is_required: true
    }
  ]
};

let testResults = {
  passed: 0,
  failed: 0,
  errors: [],
  details: []
};

// Utility functions
function logTest(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} ${name}: ${status}${details ? ' - ' + details : ''}`);
  
  testResults.details.push({ name, status, details });
  if (status === 'PASS') {
    testResults.passed++;
  } else {
    testResults.failed++;
    testResults.errors.push(`${name}: ${details}`);
  }
}

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      timeout: config.timeout,
      ...options
    });
    
    const data = await response.json();
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Test functions
async function testHealthEndpoint() {
  console.log('\n🔍 Testing Health Endpoint...');
  
  const result = await makeRequest(`${config.httpApiUrl}/health`);
  if (result.success && result.data.status === 'ok') {
    logTest('Health endpoint', 'PASS', `Status: ${result.data.status}`);
  } else {
    logTest('Health endpoint', 'FAIL', result.error || `Status: ${result.status}`);
  }
}

async function testExtractPersonalData() {
  console.log('\n📤 Testing Extract Personal Data...');
  
  const result = await makeRequest(`${config.httpApiUrl}/api/extract_personal_data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: config.userId,
      limit: 10
    })
  });
  
  if (result.success) {
    logTest('Extract personal data', 'PASS', `Retrieved data structure`);
  } else {
    logTest('Extract personal data', 'FAIL', result.error || `Status: ${result.status}`);
  }
  
  return result.success ? result.data : null;
}

async function testCreatePersonalData() {
  console.log('\n➕ Testing Create Personal Data...');
  
  const createdRecords = [];
  
  for (const [index, testRecord] of testData.personalData.entries()) {
    const result = await makeRequest(`${config.httpApiUrl}/api/create_personal_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: config.userId,
        ...testRecord
      })
    });
    
    if (result.success) {
      logTest(`Create record ${index + 1}`, 'PASS', `Type: ${testRecord.data_type}`);
      // Try to extract record ID from response
      if (result.data && result.data.record && result.data.record.id) {
        createdRecords.push(result.data.record.id);
      }
    } else {
      logTest(`Create record ${index + 1}`, 'FAIL', result.error || `Status: ${result.status}`);
    }
  }
  
  return createdRecords;
}

async function testUpdatePersonalData(recordIds) {
  console.log('\n📝 Testing Update Personal Data...');
  
  if (recordIds.length === 0) {
    logTest('Update personal data', 'SKIP', 'No records to update');
    return;
  }
  
  const recordId = recordIds[0];
  const updates = {
    tags: ['updated', 'test'],
    content: { ...testData.personalData[0].content, updated: true }
  };
  
  const result = await makeRequest(`${config.httpApiUrl}/api/update_personal_data/${recordId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  
  if (result.success) {
    logTest('Update personal data', 'PASS', `Record ID: ${recordId}`);
  } else {
    logTest('Update personal data', 'FAIL', result.error || `Status: ${result.status}`);
  }
}

async function testSearchPersonalData() {
  console.log('\n🔍 Testing Search Personal Data...');
  
  const searchQuery = 'test';
  const result = await makeRequest(`${config.httpApiUrl}/api/search_personal_data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: config.userId,
      query: searchQuery,
      limit: 10
    })
  });
  
  if (result.success) {
    logTest('Search personal data', 'PASS', `Query: "${searchQuery}"`);
  } else {
    logTest('Search personal data', 'FAIL', result.error || `Status: ${result.status}`);
  }
}

async function testAddPersonalDataField() {
  console.log('\n🏷️ Testing Add Personal Data Field...');
  
  for (const [index, fieldDef] of testData.fieldDefinitions.entries()) {
    const result = await makeRequest(`${config.httpApiUrl}/api/add_personal_data_field`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fieldDef)
    });
    
    if (result.success) {
      logTest(`Add field ${index + 1}`, 'PASS', `Field: ${fieldDef.field_name}`);
    } else {
      logTest(`Add field ${index + 1}`, 'FAIL', result.error || `Status: ${result.status}`);
    }
  }
}

async function testDeletePersonalData(recordIds) {
  console.log('\n🗑️ Testing Delete Personal Data...');
  
  if (recordIds.length === 0) {
    logTest('Delete personal data', 'SKIP', 'No records to delete');
    return;
  }
  
  // Test soft delete first
  const softDeleteResult = await makeRequest(`${config.httpApiUrl}/api/delete_personal_data`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      record_ids: [recordIds[0]],
      hard_delete: false
    })
  });
  
  if (softDeleteResult.success) {
    logTest('Soft delete', 'PASS', `Record ID: ${recordIds[0]}`);
  } else {
    logTest('Soft delete', 'FAIL', softDeleteResult.error || `Status: ${softDeleteResult.status}`);
  }
  
  // Test hard delete if we have more records
  if (recordIds.length > 1) {
    const hardDeleteResult = await makeRequest(`${config.httpApiUrl}/api/delete_personal_data`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record_ids: recordIds.slice(1),
        hard_delete: true
      })
    });
    
    if (hardDeleteResult.success) {
      logTest('Hard delete', 'PASS', `Records: ${recordIds.slice(1).length}`);
    } else {
      logTest('Hard delete', 'FAIL', hardDeleteResult.error || `Status: ${hardDeleteResult.status}`);
    }
  }
}

async function testToolsEndpoint() {
  console.log('\n🛠️ Testing Tools Endpoint...');
  
  const result = await makeRequest(`${config.httpApiUrl}/api/tools`);
  
  if (result.success && result.data.tools) {
    const toolCount = result.data.tools.length;
    logTest('List tools', 'PASS', `Found ${toolCount} tools`);
    
    // Log available tools
    console.log('   Available tools:');
    result.data.tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });
  } else {
    logTest('List tools', 'FAIL', result.error || `Status: ${result.status}`);
  }
}

async function testGenericToolCall() {
  console.log('\n⚙️ Testing Generic Tool Call...');
  
  const result = await makeRequest(`${config.httpApiUrl}/api/tools/extract_personal_data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: config.userId,
      limit: 5
    })
  });
  
  if (result.success) {
    logTest('Generic tool call', 'PASS', 'extract_personal_data via tools endpoint');
  } else {
    logTest('Generic tool call', 'FAIL', result.error || `Status: ${result.status}`);
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Comprehensive API Test Suite');
  console.log(`📡 Testing API at: ${config.httpApiUrl}`);
  console.log(`👤 User ID: ${config.userId}`);
  console.log('=' * 60);
  
  // Run tests in sequence
  await testHealthEndpoint();
  await testToolsEndpoint();
  
  const extractedData = await testExtractPersonalData();
  const createdRecords = await testCreatePersonalData();
  
  await testUpdatePersonalData(createdRecords);
  await testSearchPersonalData();
  await testAddPersonalDataField();
  await testGenericToolCall();
  
  // Clean up - delete test records
  await testDeletePersonalData(createdRecords);
  
  // Print summary
  console.log('\n' + '=' * 60);
  console.log('📊 Test Summary');
  console.log('=' * 60);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.errors.forEach(error => console.log(`   - ${error}`));
  }
  
  console.log('\n🎯 Test completed!');
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Add error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testResults,
  config
};