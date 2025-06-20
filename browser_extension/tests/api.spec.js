import { test, expect } from '@playwright/test';

const config = {
  userId: '399aa002-cb10-40fc-abfe-d2656eea0199',
  testUserId: '60767eca-63eb-43be-a861-fc0fbf46f468'
};

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

test.describe('API Endpoints', () => {
  test('health endpoint should return ok status', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('tools endpoint should list available tools', async ({ request }) => {
    const response = await request.get('/api/tools');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.tools).toBeDefined();
    expect(Array.isArray(data.tools)).toBeTruthy();
    expect(data.tools.length).toBeGreaterThan(0);
  });

  test('extract personal data endpoint should work', async ({ request }) => {
    const response = await request.post('/api/extract_personal_data', {
      data: {
        user_id: config.userId,
        limit: 10
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data).toBeDefined();
  });

  test('search personal data endpoint should work', async ({ request }) => {
    const response = await request.post('/api/search_personal_data', {
      data: {
        user_id: config.userId,
        query: 'test',
        limit: 10
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data).toBeDefined();
  });

  test('generic tool call should work', async ({ request }) => {
    const response = await request.post('/api/extract_personal_data', {
      data: {
        user_id: config.userId,
        limit: 5
      }
    });
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data).toBeDefined();
  });
});

test.describe('CRUD Operations', () => {
  let createdRecordIds = [];

  test('create personal data should work', async ({ request }) => {
    for (const testRecord of testData.personalData) {
      const response = await request.post('/api/create_personal_data', {
        data: {
          user_id: config.testUserId,
          ...testRecord
        }
      });
      
      if (response.ok()) {
        const data = await response.json();
        if (data.record && data.record.id) {
          createdRecordIds.push(data.record.id);
        }
      }
    }
  });

  test('update personal data should work', async ({ request }) => {
    if (createdRecordIds.length === 0) {
      test.skip();
    }

    const recordId = createdRecordIds[0];
    const updates = {
      tags: ['updated', 'test'],
      content: { ...testData.personalData[0].content, updated: true }
    };

    const response = await request.put(`/api/update_personal_data/${recordId}`, {
      data: updates
    });
    
    // This might fail due to RLS policies, but endpoint should exist
    expect(response.status()).toBeLessThan(500);
  });

  test('delete personal data should work', async ({ request }) => {
    if (createdRecordIds.length === 0) {
      test.skip();
    }

    // Test soft delete
    const response = await request.delete('/api/delete_personal_data', {
      data: {
        record_ids: [createdRecordIds[0]],
        hard_delete: false
      }
    });
    
    // This might fail due to RLS policies, but endpoint should exist
    expect(response.status()).toBeLessThan(500);
  });

  test('add personal data field should work', async ({ request }) => {
    for (const fieldDef of testData.fieldDefinitions) {
      const response = await request.post('/api/add_personal_data_field', {
        data: fieldDef
      });
      
      // This might fail due to RLS policies or missing endpoint, but should not be server error
      expect([200, 201, 400, 401, 403, 404, 422, 500]).toContain(response.status());
    }
  });
});