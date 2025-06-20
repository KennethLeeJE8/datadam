import { test, expect } from '@playwright/test';

test.describe('Performance Requirements', () => {
  test('field detection should complete within 100ms', async ({ page }) => {
    await page.goto('data:text/html,<html><body>' +
      '<form>' +
      '<input type="email" name="email" placeholder="Email">' +
      '<input type="tel" name="phone" placeholder="Phone">' +
      '<input type="text" name="name" placeholder="Full Name">' +
      '<input type="text" name="address" placeholder="Address">' +
      '<input type="text" name="city" placeholder="City">' +
      '</form>' +
      '</body></html>');
    
    const startTime = Date.now();
    
    // Simulate field detection
    const fields = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      return Array.from(inputs).map(input => ({
        type: input.type,
        name: input.name,
        placeholder: input.placeholder
      }));
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(fields).toHaveLength(5);
    expect(duration).toBeLessThan(100); // < 100ms requirement
  });

  test('API response should be under reasonable time', async ({ request }) => {
    const startTime = Date.now();
    
    const response = await request.post('/api/extract_personal_data', {
      data: {
        user_id: '399aa002-cb10-40fc-abfe-d2656eea0199',
        data_types: ['contact'],
        filters: { classification: ['personal'] }
      }
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(response.ok()).toBeTruthy();
    expect(duration).toBeLessThan(2000); // < 2s reasonable timeout for testing
  });

  test('memory usage should stay under limits', async ({ page }) => {
    await page.goto('data:text/html,<html><body><div>Memory test</div></body></html>');
    
    // Get memory usage
    const memoryInfo = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
        };
      }
      return null;
    });
    
    if (memoryInfo) {
      // Memory should be reasonable (under 50MB for basic operations)
      expect(memoryInfo.usedJSHeapSize).toBeLessThan(50 * 1024 * 1024);
    }
  });
});

test.describe('Scalability Tests', () => {
  test('should handle large forms with 100+ fields', async ({ page }) => {
    // Generate large form
    const largeFormHTML = '<form>' + 
      Array.from({length: 100}, (_, i) => 
        `<input type="text" name="field${i}" placeholder="Field ${i}">`
      ).join('') + 
      '</form>';
    
    await page.goto(`data:text/html,<html><body>${largeFormHTML}</body></html>`);
    
    const startTime = Date.now();
    
    const fieldCount = await page.evaluate(() => {
      return document.querySelectorAll('input').length;
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(fieldCount).toBe(100);
    expect(duration).toBeLessThan(500); // Should handle large forms efficiently
  });

  test('concurrent API requests should not degrade performance', async ({ request }) => {
    const concurrentRequests = 10;
    const startTime = Date.now();
    
    const promises = Array.from({length: concurrentRequests}, () =>
      request.get('/health')
    );
    
    const responses = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // All requests should succeed
    responses.forEach(response => {
      expect(response.ok()).toBeTruthy();
    });
    
    // Average response time should still be reasonable
    const avgDuration = duration / concurrentRequests;
    expect(avgDuration).toBeLessThan(100);
  });
});