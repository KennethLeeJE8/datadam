# Playwright Testing Setup

This project has been converted from manual Node.js tests to comprehensive Playwright tests for better browser automation and testing.

## Test Structure

- `tests/api.spec.js` - API endpoint testing
- `tests/extension.spec.js` - Browser extension functionality testing
- `tests/mcp-server.spec.js` - MCP server communication testing
- `tests/browser-flow.spec.js` - End-to-end browser flow testing
- `tests/legacy-html-tests.spec.js` - Converted HTML test files

## Running Tests

```bash
# Run all tests
npm test

# Run tests with browser UI visible
npm run test:headed

# Run tests with interactive UI
npm run test:ui

# View test report
npm run test:report
```

## Test Features

### Browser Extension Testing
- Extension loading and accessibility
- Form autofill functionality
- Profile data display
- Chrome extension API mocking

### API Testing
- Health endpoint validation
- CRUD operations testing
- Tool endpoint functionality
- Error handling scenarios

### MCP Server Testing
- Server spawn and communication
- stdio protocol testing
- File validation
- Error handling validation

### Legacy Test Migration
- HTML test files converted to Playwright
- Fuzzy matching algorithm testing
- Database field matcher integration
- Profile display functionality

## Configuration

The `playwright.config.js` file includes:
- Multi-browser testing (Chrome, Firefox, Safari)
- Chrome extension testing support
- Automatic API server startup
- Test result reporting
- Screenshot and trace capture on failures

## Requirements

- Node.js and npm
- Playwright browsers installed (`npx playwright install`)
- API server accessible at localhost:3001
- MCP server available at configured path

## Browser Extension Testing

Extension tests require:
- Chrome browser with extension loading capabilities
- Extension files in the project root
- Proper manifest.json configuration
- Background script functionality

## API Dependencies

Tests expect:
- Enhanced API server running on port 3001
- Database connection configured
- User IDs for testing (configured in test files)
- Proper CORS configuration for local testing