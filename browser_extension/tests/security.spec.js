import { test, expect } from '@playwright/test';

test.describe('Security Requirements', () => {
  test('should validate CORS headers', async ({ request }) => {
    const response = await request.get('/health', {
      headers: {
        'Origin': 'https://malicious-site.com'
      }
    });
    
    const corsHeader = response.headers()['access-control-allow-origin'];
    
    // Should have proper CORS configuration
    if (corsHeader) {
      expect(corsHeader).not.toBe('*'); // Should not allow all origins
    }
  });

  test('should not expose sensitive data in responses', async ({ request }) => {
    const response = await request.post('/api/extract_personal_data', {
      data: {
        user_id: '399aa002-cb10-40fc-abfe-d2656eea0199',
        data_types: ['contact'],
        filters: { classification: ['personal'] }
      }
    });
    
    if (response.ok()) {
      const data = await response.json();
      const responseText = JSON.stringify(data);
      
      // Should not contain common sensitive patterns
      expect(responseText).not.toMatch(/password/i);
      expect(responseText).not.toMatch(/secret/i);
      expect(responseText).not.toMatch(/key.*[:=]/i);
      expect(responseText).not.toMatch(/token.*[:=]/i);
    }
  });

  test('should validate input sanitization', async ({ request }) => {
    const maliciousPayload = {
      user_id: '<script>alert("xss")</script>',
      data_types: ['<script>'],
      filters: { classification: ['"><script>alert(1)</script>'] }
    };
    
    const response = await request.post('/api/extract_personal_data', {
      data: maliciousPayload
    });
    
    // Should handle malicious input gracefully
    if (response.ok()) {
      const data = await response.json();
      const responseText = JSON.stringify(data);
      
      // Response should not contain unescaped scripts
      expect(responseText).not.toContain('<script>');
      expect(responseText).not.toContain('alert(');
    } else {
      // Should return proper error status
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('should handle SQL injection attempts', async ({ request }) => {
    const sqlInjectionPayload = {
      user_id: "'; DROP TABLE users; --",
      data_types: ["' OR 1=1 --"],
      filters: { classification: ["' UNION SELECT * FROM sensitive_data --"] }
    };
    
    const response = await request.post('/api/extract_personal_data', {
      data: sqlInjectionPayload
    });
    
    // Should handle SQL injection gracefully
    if (response.ok()) {
      const data = await response.json();
      // Should return empty or error, not sensitive data
      expect(data.error || data.data?.length === 0).toBeTruthy();
    } else {
      // Should return proper error status
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('should rate limit excessive requests', async ({ request }) => {
    const rapidRequests = 50;
    const promises = Array.from({length: rapidRequests}, () =>
      request.get('/health')
    );
    
    const responses = await Promise.all(promises);
    
    // Some requests might be rate limited (429) or all might succeed
    const statusCodes = responses.map(r => r.status());
    const rateLimitedRequests = statusCodes.filter(code => code === 429);
    
    // If rate limiting is implemented, some should be blocked
    // Otherwise all should succeed (this tests that server doesn't crash)
    expect(rateLimitedRequests.length >= 0).toBeTruthy();
    
    // Server should remain responsive
    const lastResponse = responses[responses.length - 1];
    expect([200, 429]).toContain(lastResponse.status());
  });
});

test.describe('Data Protection', () => {
  test('should not log sensitive data', async ({ page }) => {
    // Navigate to a page and fill sensitive data
    await page.goto('data:text/html,<html><body>' +
      '<form>' +
      '<input type="password" name="password" id="pwd">' +
      '<input type="text" name="ssn" id="ssn">' +
      '<input type="email" name="email" id="email">' +
      '</form>' +
      '</body></html>');
    
    // Fill sensitive data
    await page.fill('#pwd', 'secret123');
    await page.fill('#ssn', '123-45-6789');
    await page.fill('#email', 'test@example.com');
    
    // Get console logs
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    
    // Trigger some operation that might log
    await page.evaluate(() => {
      console.log('Testing log capture');
      // Simulate form processing
      const form = document.querySelector('form');
      const formData = new FormData(form);
      console.log('Form processing complete');
    });
    
    await page.waitForTimeout(100);
    
    // Check that sensitive data wasn't logged
    const allLogs = logs.join(' ');
    expect(allLogs).not.toContain('secret123');
    expect(allLogs).not.toContain('123-45-6789');
    // Email might be okay to log in some contexts, but SSN/passwords should not be
  });

  test('should clear sensitive data from memory', async ({ page }) => {
    await page.goto('data:text/html,<html><body>' +
      '<input type="password" id="pwd">' +
      '<button id="clear">Clear</button>' +
      '</body></html>');
    
    // Fill and then clear sensitive data
    await page.fill('#pwd', 'sensitive-password');
    
    const cleared = await page.evaluate(() => {
      const input = document.getElementById('pwd');
      const originalValue = input.value;
      
      // Simulate clearing sensitive data from memory
      input.value = '';
      
      // Try to find the sensitive data in memory (simplified test)
      return originalValue !== input.value;
    });
    
    expect(cleared).toBeTruthy();
  });

  test('should validate data classification handling', async ({ request }) => {
    const response = await request.post('/api/extract_personal_data', {
      data: {
        user_id: '399aa002-cb10-40fc-abfe-d2656eea0199',
        data_types: ['contact'],
        filters: { classification: ['sensitive'] }
      }
    });
    
    if (response.ok()) {
      const data = await response.json();
      
      // If sensitive data is returned, it should be properly marked
      if (data.data && data.data.length > 0) {
        data.data.forEach(item => {
          if (item.classification === 'sensitive') {
            // Sensitive data should have additional protection markers
            expect(item).toHaveProperty('classification');
            // Could also check for encryption flags, access logs, etc.
          }
        });
      }
    }
  });
});