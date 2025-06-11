#!/usr/bin/env node

const apiUrl = 'http://localhost:3001';
const userId = '399aa002-cb10-40fc-abfe-d2656eea0199';

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testEndpoints() {
  console.log('🧪 Testing Enhanced HTTP API Endpoints\n');

  // Test health
  console.log('1. Testing Health Endpoint...');
  const health = await makeRequest(`${apiUrl}/health`);
  console.log(health.success ? '✅ Health OK' : '❌ Health Failed:', health.data || health.error);

  // Test tools list
  console.log('\n2. Testing Tools List...');
  const tools = await makeRequest(`${apiUrl}/api/tools`);
  console.log(tools.success ? `✅ Tools OK (${tools.data.tools?.length} tools)` : '❌ Tools Failed:', tools.data || tools.error);

  // Test extract
  console.log('\n3. Testing Extract Personal Data...');
  const extract = await makeRequest(`${apiUrl}/api/extract_personal_data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, limit: 5 })
  });
  console.log(extract.success ? `✅ Extract OK (${extract.data.data?.data?.length || 0} records)` : '❌ Extract Failed:', extract.data || extract.error);

  // Test create (will likely fail due to RLS but endpoint should work)
  console.log('\n4. Testing Create Personal Data...');
  const create = await makeRequest(`${apiUrl}/api/create_personal_data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      data_type: 'contact',
      title: 'Test Contact',
      content: { name: 'Test User', email: 'test@example.com' },
      tags: ['test'],
      classification: 'personal'
    })
  });
  console.log(create.success ? '✅ Create OK' : '❌ Create Failed (expected due to RLS):', create.data?.error || create.error);

  // Test search (might have syntax issues)
  console.log('\n5. Testing Search Personal Data...');
  const search = await makeRequest(`${apiUrl}/api/search_personal_data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      query: 'test',
      limit: 5
    })
  });
  console.log(search.success ? `✅ Search OK (${search.data.data?.count || 0} results)` : '❌ Search Failed:', search.data?.error || search.error);

  // Test update (get a real record ID first)
  console.log('\n6. Testing Update Personal Data...');
  let updateResult;
  if (extract.success && extract.data.data?.data?.length > 0) {
    const recordId = extract.data.data.data[0].id;
    updateResult = await makeRequest(`${apiUrl}/api/update_personal_data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record_id: recordId,
        updates: { title: 'Updated Title - Test', tags: ['updated', 'test'] }
      })
    });
    console.log(updateResult.success ? '✅ Update OK' : '❌ Update Failed:', updateResult.data?.error || updateResult.error);
  } else {
    console.log('❌ Update Skipped: No records available to update');
  }

  // Test delete (use real record ID if available)
  console.log('\n7. Testing Delete Personal Data...');
  let deleteResult;
  if (extract.success && extract.data.data?.data?.length > 1) {
    // Use the second record for deletion test
    const recordId = extract.data.data.data[1].id;
    deleteResult = await makeRequest(`${apiUrl}/api/delete_personal_data`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record_ids: [recordId],
        hard_delete: false
      })
    });
    console.log(deleteResult.success ? '✅ Delete OK (soft delete)' : '❌ Delete Failed:', deleteResult.data?.error || deleteResult.error);
  } else {
    console.log('❌ Delete Skipped: Not enough records available to test delete');
  }

  // Test add field
  console.log('\n8. Testing Add Personal Data Field...');
  const addField = await makeRequest(`${apiUrl}/api/add_personal_data_field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      field_name: 'test_field',
      data_type: 'string',
      validation_rules: { min_length: 1 },
      is_required: false
    })
  });
  console.log(addField.success ? '✅ Add Field OK' : '❌ Add Field Failed:', addField.data?.error || addField.error);

  console.log('\n🎯 API Test Complete!');
  console.log('Note: Some failures are expected due to RLS policies and missing data.');
}

testEndpoints().catch(console.error);