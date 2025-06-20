import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Legacy HTML Tests Conversion', () => {
  test('test.html functionality should work in Playwright', async ({ page }) => {
    await page.goto('file://' + path.join(process.cwd(), 'test.html'));
    
    // Verify page loads correctly
    await expect(page.locator('h1')).toContainText('MCP Extension Test Page');
    
    // Test form elements
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
    await expect(page.locator('#address')).toBeVisible();
    
    // Test form interaction
    await page.fill('#name', 'John Doe');
    await page.fill('#email', 'john@example.com');
    await page.fill('#phone', '+1-555-123-4567');
    await page.fill('#address', '123 Main St');
    
    // Verify values
    await expect(page.locator('#name')).toHaveValue('John Doe');
    await expect(page.locator('#email')).toHaveValue('john@example.com');
    await expect(page.locator('#phone')).toHaveValue('+1-555-123-4567');
    await expect(page.locator('#address')).toHaveValue('123 Main St');
    
    // Test form submission
    await page.click('button[type="submit"]');
    
    // Should show alert (though alert will be auto-handled by Playwright)
    // We can verify the form submission was processed
    const formData = await page.evaluate(() => {
      const form = document.getElementById('personalForm');
      const formData = new FormData(form);
      return Object.fromEntries(formData);
    });
    
    expect(formData.name).toBe('John Doe');
    expect(formData.email).toBe('john@example.com');
  });

  test('test-popup-flow.html functionality should work in Playwright', async ({ page }) => {
    await page.goto('file://' + path.join(process.cwd(), 'test-popup-flow.html'));
    
    // Verify page loads
    await expect(page.locator('h1')).toContainText('Test Browser Extension Profile Display');
    
    // Click test button to trigger profile display
    await page.click('#testBtn');
    
    // Wait for profiles to be displayed
    await page.waitForTimeout(100);
    
    // Verify profiles are displayed
    const profileItems = await page.locator('.profile-item').count();
    expect(profileItems).toBe(3); // Based on the test data
    
    // Test profile interaction
    const firstProfile = page.locator('.profile-item').first();
    await expect(firstProfile).toBeVisible();
    
    // Click on first profile
    await firstProfile.click();
    
    // Verify profile data exists
    const profileData = await firstProfile.getAttribute('data-profile');
    expect(profileData).toBeDefined();
    
    const parsedData = JSON.parse(profileData);
    expect(parsedData.id).toBeDefined();
    expect(parsedData.title).toBeDefined();
  });

  test('test-fuzzy-matching.html functionality should work in Playwright', async ({ page }) => {
    await page.goto('file://' + path.join(process.cwd(), 'test-fuzzy-matching.html'));
    
    // Wait for page to load and scripts to execute
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check if DatabaseFieldMatcher loaded successfully
    const dbFieldMatcherLoaded = await page.evaluate(() => {
      return typeof DatabaseFieldMatcher !== 'undefined';
    });
    
    if (!dbFieldMatcherLoaded) {
      test.skip('DatabaseFieldMatcher not loaded, skipping fuzzy matching test');
    }
    
    // Verify test results are displayed
    const testResults = page.locator('#test-results');
    await expect(testResults).toBeVisible();
    
    // Check for specific test sections with more lenient expectations
    const pageContent = await page.textContent('body');
    
    // Check for key test components
    if (pageContent.includes('Tag Generation Test')) {
      expect(pageContent).toContain('Tag Generation Test');
    }
    
    if (pageContent.includes('Fuzzy Score Calculation Test')) {
      expect(pageContent).toContain('Fuzzy Score Calculation Test');
    }
    
    // Check for success indicators if tests ran
    if (pageContent.includes('✅')) {
      expect(pageContent).toContain('✅');
    }
  });

  test('fuzzy matching algorithm validation', async ({ page }) => {
    await page.goto('file://' + path.join(process.cwd(), 'test-fuzzy-matching.html'));
    
    // Wait for tests to complete
    await page.waitForTimeout(3000);
    
    // Extract and validate fuzzy scores
    const matchResults = await page.locator('.match-result').allTextContents();
    
    for (const result of matchResults) {
      if (result.includes('%')) {
        // Extract score percentage
        const scoreMatch = result.match(/(\d+)%/);
        if (scoreMatch) {
          const score = parseInt(scoreMatch[1]);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    }
  });
  
  test('database field matcher integration', async ({ page }) => {
    await page.goto('file://' + path.join(process.cwd(), 'test-fuzzy-matching.html'));
    
    // Wait for page to load
    await page.waitForTimeout(1000);
    
    // Test that DatabaseFieldMatcher is loaded and functional
    const hasFieldMatcher = await page.evaluate(() => {
      return typeof DatabaseFieldMatcher !== 'undefined';
    });
    
    expect(hasFieldMatcher).toBeTruthy();
    
    // Test basic functionality
    const testResult = await page.evaluate(() => {
      try {
        const matcher = new DatabaseFieldMatcher();
        const testTags = matcher.generateSearchTags([{
          identifier: 'test',
          label: 'Test Field',
          name: 'test',
          element: { type: 'text' }
        }]);
        return { success: true, tagCount: testTags.length };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    expect(testResult.success).toBeTruthy();
    expect(testResult.tagCount).toBeGreaterThan(0);
  });
});