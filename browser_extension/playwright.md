# Playwright Testing Documentation

## Overview

This browser extension project uses Playwright for comprehensive end-to-end testing, providing automated browser testing for all extension functionality, API endpoints, and user interactions.

## Architecture

### Test Structure
```
tests/
├── api.spec.js                 # API endpoint testing
├── extension.spec.js           # Browser extension functionality
├── mcp-server.spec.js         # MCP server communication
├── browser-flow.spec.js       # End-to-end user flows
└── legacy-html-tests.spec.js  # Converted HTML tests
```

### Configuration Files
- `playwright.config.js` - Main Playwright configuration
- `package.json` - Test scripts and dependencies
- `.gitignore` - Playwright artifacts exclusion

## Test Categories

### 1. API Testing (`api.spec.js`)

Tests all HTTP API endpoints used by the browser extension:

**Health & Tools Endpoints:**
```javascript
test('health endpoint should return ok status', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.ok()).toBeTruthy();
});
```

**Data Operations:**
- Extract personal data
- Search functionality  
- CRUD operations (Create, Read, Update, Delete)
- Field definitions management
- Generic tool calls

**Test Coverage:**
- ✅ API connectivity
- ✅ Response validation
- ✅ Error handling
- ✅ Data structure verification

### 2. Browser Extension Testing (`extension.spec.js`)

Tests the actual Chrome extension in a real browser environment:

**Extension Loading:**
```javascript
test.beforeAll(async () => {
  const pathToExtension = path.join(__dirname, '..');
  browser = await chromium.launch({
    args: [`--load-extension=${pathToExtension}`],
  });
});
```

**Test Coverage:**
- ✅ Extension installation and loading
- ✅ Popup interface functionality
- ✅ Form field detection and autofill
- ✅ Profile data display
- ✅ Chrome API integration
- ✅ Background script communication

### 3. MCP Server Testing (`mcp-server.spec.js`)

Tests the Model Context Protocol server communication:

**stdio Communication:**
```javascript
test('should spawn MCP server and communicate via stdio', async () => {
  const mcpProcess = spawn('node', ['dist/server/index.js'], {
    cwd: mcpServerPath,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  // Test JSON-RPC communication
});
```

**Test Coverage:**
- ✅ Server spawn and initialization
- ✅ JSON-RPC protocol communication
- ✅ Tool execution (extract_personal_data)
- ✅ Error handling and timeouts
- ✅ File structure validation

### 4. Browser Flow Testing (`browser-flow.spec.js`)

Tests complete user workflows end-to-end:

**Complete Flow Testing:**
```javascript
test('should test complete browser extension flow', async ({ request, page }) => {
  await test.step('test API connection', async () => {
    // API connectivity test
  });
  
  await test.step('extract personal data via API', async () => {
    // Data extraction test
  });
  
  await test.step('test frontend form interaction', async () => {
    // Form interaction test
  });
});
```

**Test Coverage:**
- ✅ API to frontend data flow
- ✅ Form field detection and interaction
- ✅ Profile data transformation
- ✅ Error scenario handling
- ✅ Data processing validation

### 5. Legacy HTML Tests (`legacy-html-tests.spec.js`)

Converts existing HTML test files to Playwright:

**HTML Test Conversion:**
```javascript
test('test.html functionality should work in Playwright', async ({ page }) => {
  await page.goto('file://' + path.join(process.cwd(), 'test.html'));
  // Test form interactions
});
```

**Test Coverage:**
- ✅ Form autofill functionality (`test.html`)
- ✅ Profile display logic (`test-popup-flow.html`)
- ✅ Fuzzy matching algorithms (`test-fuzzy-matching.html`)
- ✅ Database field matcher integration

## Configuration Details

### playwright.config.js

```javascript
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  
  // Multi-browser testing
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'chrome-extension', use: { channel: 'chrome' } },
  ],
  
  // Auto-start API server
  webServer: {
    command: 'node standalone-enhanced-api.js',
    port: 3001,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Key Features:
- **Multi-browser Support:** Chrome, Firefox, Safari
- **Automatic Server Management:** API server auto-starts
- **CI/CD Ready:** Configurable for continuous integration
- **Rich Reporting:** HTML reports with screenshots
- **Extension Testing:** Chrome extension loading support

## Running Tests

### Command Line Options

```bash
# Basic test execution
npm test                    # Run all tests
npm run test:headed         # Run with visible browser
npm run test:ui            # Interactive test runner
npm run test:report        # View HTML report

# Advanced options
npx playwright test --project=chromium     # Specific browser
npx playwright test --grep="API"          # Filter tests
npx playwright test --debug              # Debug mode
npx playwright test --trace=on           # Enable tracing
```

### Test Execution Flow

1. **Setup Phase:**
   - API server starts automatically
   - Browser instances launch
   - Extension loads (for extension tests)

2. **Test Execution:**
   - Parallel test execution
   - Real browser interactions
   - API endpoint validation
   - Screenshot capture on failures

3. **Cleanup Phase:**
   - Browser instances close
   - Server shutdown
   - Report generation

## Debugging and Development

### Debug Mode
```bash
npx playwright test --debug
```
- Opens Playwright Inspector
- Step through tests interactively
- Inspect page elements
- Modify test code on-the-fly

### Trace Viewer
```bash
npx playwright show-trace test-results/trace.zip
```
- Visual timeline of test execution
- Network requests inspection
- Console logs and errors
- DOM snapshots at each step

### Screenshots and Videos
- Automatic failure screenshots
- Optional video recording
- Custom screenshot capture in tests

## Best Practices

### Test Organization
```javascript
test.describe('Feature Group', () => {
  test.beforeAll(async () => {
    // Setup once for all tests
  });
  
  test('specific functionality', async ({ page }) => {
    await test.step('step description', async () => {
      // Organized test steps
    });
  });
});
```

### Page Object Pattern
```javascript
class ExtensionPopup {
  constructor(page) {
    this.page = page;
    this.getProfilesBtn = page.locator('#getProfilesBtn');
    this.profileList = page.locator('#recentDataList');
  }
  
  async loadProfiles() {
    await this.getProfilesBtn.click();
    await this.page.waitForSelector('.profile-item');
  }
}
```

### Data Management
```javascript
// Test data fixtures
const testData = {
  validUser: { id: '399aa002-cb10-40fc-abfe-d2656eea0199' },
  testProfiles: [/* test data */],
  formFields: [/* field definitions */]
};
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Install dependencies
  run: npm ci
  
- name: Install Playwright browsers
  run: npx playwright install --with-deps
  
- name: Run Playwright tests
  run: npm test
  
- name: Upload test results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

## Troubleshooting

### Common Issues

**Extension Loading Failures:**
- Verify manifest.json validity
- Check file permissions
- Ensure all required files exist

**API Connection Issues:**
- Confirm server is running on port 3001
- Check CORS configuration
- Verify database connectivity

**MCP Server Communication:**
- Validate server path configuration
- Check Node.js version compatibility
- Verify stdio communication setup

**Test Flakiness:**
- Add proper wait conditions
- Use stable selectors
- Implement retry mechanisms

### Performance Optimization

**Parallel Execution:**
```javascript
// Enable in playwright.config.js
fullyParallel: true,
workers: process.env.CI ? 1 : undefined,
```

**Test Isolation:**
```javascript
// Use test-specific data
test.use({ storageState: 'clean-state.json' });
```

**Resource Management:**
```javascript
// Cleanup after tests
test.afterEach(async ({ page }) => {
  await page.close();
});
```

## Migration from Legacy Tests

### Before (Node.js Manual Tests)
```javascript
// test-extension-simple.js
console.log('🧪 MCP Personal Data Browser Extension Test');
// Manual validation and console logging
```

### After (Playwright Automated Tests)
```javascript
// tests/mcp-server.spec.js
test('should spawn MCP server and communicate via stdio', async () => {
  // Automated validation with assertions
  expect(testPassed).toBeTruthy();
});
```

### Migration Benefits
- ✅ **Automated Execution:** No manual intervention required
- ✅ **Real Browser Testing:** Actual extension testing in Chrome
- ✅ **Comprehensive Coverage:** API, UI, and integration testing
- ✅ **CI/CD Ready:** Automated testing in pipelines
- ✅ **Rich Reporting:** Visual test results and debugging
- ✅ **Cross-browser Testing:** Multi-browser validation

## Future Enhancements

### Planned Improvements
- Visual regression testing
- Performance benchmarking
- Mobile browser testing
- Accessibility testing integration
- API contract testing
- Load testing scenarios

### Custom Test Utilities
```javascript
// utils/test-helpers.js
export class ExtensionTestHelper {
  static async loadExtension(context, extensionPath) {
    // Reusable extension loading logic
  }
  
  static async mockChromeAPI(page) {
    // Chrome API mocking utilities
  }
}
```

This comprehensive Playwright setup ensures robust, maintainable, and scalable testing for the browser extension project.