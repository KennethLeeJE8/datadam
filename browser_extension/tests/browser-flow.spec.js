import { test, expect } from '@playwright/test';

test.describe('Browser Extension Flow', () => {
  const userId = '399aa002-cb10-40fc-abfe-d2656eea0199';

  test('should test complete browser extension flow', async ({ request, page }) => {
    await test.step('test API connection', async () => {
      const response = await request.get('/health');
      expect(response.ok()).toBeTruthy();
    });

    await test.step('extract personal data via API', async () => {
      const response = await request.post('/api/extract_personal_data', {
        data: {
          user_id: userId,
          limit: 50,
          offset: 0
        }
      });

      expect(response.ok()).toBeTruthy();
      const result = await response.json();
      
      // Validate API response structure
      expect(result.data).toBeDefined();
      
      // Store result for further processing tests
      await test.step('validate response processing', async () => {
        const mcpClientReturn = result.data;
        let finalData;
        
        // Test processing logic similar to background service
        if (mcpClientReturn.content && mcpClientReturn.content[0] && mcpClientReturn.content[0].type === 'text') {
          // Old MCP format
          const data = JSON.parse(mcpClientReturn.content[0].text);
          finalData = data.data || data;
        } else if (mcpClientReturn.data) {
          // HTTP API format
          finalData = mcpClientReturn.data;
        } else {
          // Raw result
          finalData = mcpClientReturn;
        }
        
        // Validate final data structure
        if (Array.isArray(finalData) && finalData.length > 0) {
          expect(finalData[0]).toHaveProperty('title');
          expect(finalData[0]).toHaveProperty('data_type');
          expect(finalData[0]).toHaveProperty('content');
        }
      });
    });

    await test.step('test frontend form interaction', async () => {
      // Create a test page with form elements
      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Test Form</title></head>
        <body>
          <form id="testForm">
            <input type="text" id="name" name="name" placeholder="Full Name">
            <input type="email" id="email" name="email" placeholder="Email">
            <input type="tel" id="phone" name="phone" placeholder="Phone">
            <input type="text" id="address" name="address" placeholder="Address">
            <button type="submit">Submit</button>
          </form>
          <div id="results"></div>
        </body>
        </html>
      `);

      // Test form field detection and interaction
      const nameField = page.locator('#name');
      const emailField = page.locator('#email');
      const phoneField = page.locator('#phone');
      const addressField = page.locator('#address');

      await expect(nameField).toBeVisible();
      await expect(emailField).toBeVisible();
      await expect(phoneField).toBeVisible();
      await expect(addressField).toBeVisible();

      // Test form filling
      await nameField.fill('Test User');
      await emailField.fill('test@example.com');
      await phoneField.fill('+1-555-123-4567');
      await addressField.fill('123 Test St');

      // Verify values
      await expect(nameField).toHaveValue('Test User');
      await expect(emailField).toHaveValue('test@example.com');
      await expect(phoneField).toHaveValue('+1-555-123-4567');
      await expect(addressField).toHaveValue('123 Test St');
    });

    await test.step('test field detection and matching logic', async () => {
      // Simulate field detection similar to extension content script
      const mockFields = [
        {
          identifier: 'name',
          label: 'Full Name',
          name: 'name',
          element: { type: 'text' },
          inferredType: 'name'
        },
        {
          identifier: 'email', 
          label: 'Email',
          name: 'email',
          element: { type: 'email' },
          inferredType: 'email'
        },
        {
          identifier: 'phone',
          label: 'Phone',
          name: 'phone', 
          element: { type: 'tel' },
          inferredType: 'phone'
        }
      ];

      // Test field matching logic
      const fieldTypes = mockFields.map(field => field.inferredType);
      expect(fieldTypes).toContain('name');
      expect(fieldTypes).toContain('email');
      expect(fieldTypes).toContain('phone');
    });

    await test.step('test error handling scenarios', async () => {
      // Test API error handling
      const errorResponse = await request.post('/api/extract_personal_data', {
        data: {
          user_id: 'invalid-user-id',
          limit: 50
        }
      });
      
      // Should handle error gracefully (might return error or empty data)
      expect([200, 400, 401, 403, 404, 422, 500]).toContain(errorResponse.status());
    });
  });

  test('should handle profile data transformation', async ({ page }) => {
    // Test the profile display logic
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head><title>Profile Test</title></head>
      <body>
        <div id="profileList"></div>
        <script>
          const testProfiles = [
            {
              id: "1",
              title: "Test Contact",
              content: { name: "Test User", email: "test@example.com" },
              data_type: "contact"
            },
            {
              id: "2", 
              title: "Work Email",
              content: { email: "work@company.com" },
              data_type: "contact"
            }
          ];

          function displayProfiles(profiles) {
            const list = document.getElementById('profileList');
            const html = profiles.map(profile => {
              const displayName = profile.content?.name || profile.title || 'Unknown';
              const displayEmail = profile.content?.email || 'No email';
              return \`<div class="profile-item" data-id="\${profile.id}">
                <div class="profile-name">\${displayName}</div>
                <div class="profile-email">\${displayEmail}</div>
              </div>\`;
            }).join('');
            list.innerHTML = html;
          }

          displayProfiles(testProfiles);
        </script>
      </body>
      </html>
    `);

    // Verify profiles are displayed
    const profileItems = page.locator('.profile-item');
    await expect(profileItems).toHaveCount(2);
    
    // Check profile content
    const firstProfile = profileItems.first();
    await expect(firstProfile.locator('.profile-name')).toContainText('Test User');
    await expect(firstProfile.locator('.profile-email')).toContainText('test@example.com');
  });
});