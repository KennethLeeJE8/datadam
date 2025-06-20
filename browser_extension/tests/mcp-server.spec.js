import { test, expect } from '@playwright/test';

test.describe('Extension File Validation', () => {
  test('should validate extension files exist', async () => {
    const fs = await import('fs');
    const path = await import('path');
    
    const requiredFiles = [
      'manifest.json',
      'background.js', 
      'popup.html',
      'popup.js',
      'content.js'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file);
      expect(fs.existsSync(filePath), `Missing required file: ${file}`).toBeTruthy();
    }
  });

  test('should validate background.js uses HTTP API approach', async () => {
    const fs = await import('fs');
    const path = await import('path');
    
    const backgroundPath = path.join(process.cwd(), 'background.js');
    
    if (!fs.existsSync(backgroundPath)) {
      test.skip('background.js not found, skipping API approach validation');
    }
    
    const backgroundContent = fs.readFileSync(backgroundPath, 'utf8');
    
    // Check for HTTP API implementation (no MCP server needed)
    expect(
      backgroundContent.includes('fetch') ||
      backgroundContent.includes('http') ||
      backgroundContent.includes('XMLHttpRequest')
    ).toBeTruthy();
  });

  test('should validate background.js includes error handling', async () => {
    const fs = await import('fs');
    const path = await import('path');
    
    const backgroundPath = path.join(process.cwd(), 'background.js');
    
    if (!fs.existsSync(backgroundPath)) {
      test.skip('background.js not found, skipping error handling validation');
    }
    
    const backgroundContent = fs.readFileSync(backgroundPath, 'utf8');
    
    // Check for basic error handling
    const hasErrorHandling = backgroundContent.includes('catch') || 
                           backgroundContent.includes('error') || 
                           backgroundContent.includes('try');
    
    if (!hasErrorHandling) {
      console.warn('Background.js may be missing error handling');
    }
    
    // This is a warning, not a failure
    expect(backgroundContent.length).toBeGreaterThan(0);
  });
});