# MCP Personal Data Browser Extension

A simple Chrome browser extension that integrates with your MCP Personal Data Server using direct stdio communication to provide intelligent form autofill.

## 🚀 Features

- **Automatic Form Detection**: Detects fillable form fields on web pages
- **Direct MCP Integration**: Spawns and communicates with your MCP server via stdio
- **Secure Data Retrieval**: Fetches personal data using the `extract_personal_data` tool
- **One-Click Autofill**: Fill forms with your personal data profiles
- **No External Dependencies**: Pure stdio communication, no native messaging setup required
- **Comprehensive Error Handling**: Professional error UI with troubleshooting when server is down
- **Smart Fallbacks**: Graceful degradation with mock data for non-critical errors
- **User-Friendly Messages**: Technical errors translated to actionable solutions

## 📋 Prerequisites

- Node.js (for running the MCP server)
- Chrome or Chromium browser
- Your MCP Personal Data Server at `/Users/kenne/github/datadam/supabase_mcp_personal_database`

## 🛠️ Installation

### 1. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select this directory
4. The extension should now appear in your extensions list

### 2. Test the Extension

1. Open `test.html` in Chrome
2. Click the extension icon in the toolbar
3. Click "Get Profiles" to fetch data from your MCP server
4. Test autofill functionality on the form

**That's it!** No installation scripts or native messaging setup required.

## 🔧 How It Works

The extension uses a simple approach:

1. **Spawns MCP Server**: Directly spawns your MCP server process using `child_process.spawn()`
2. **stdio Communication**: Sends JSON-RPC requests via stdin and reads responses from stdout
3. **No Intermediaries**: Direct communication between browser extension and MCP server

```javascript
// The core approach:
const mcpProcess = spawn('node', ['dist/server/index.js'], {
  cwd: '/path/to/mcp/server',
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send request
mcpProcess.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'extract_personal_data',
    arguments: { user_id: 'your-user-id' }
  },
  id: 1
}) + '\n');

// Handle response
mcpProcess.stdout.on('data', (data) => {
  const response = JSON.parse(data.toString());
  // Use response.result.content
});
```

## 📁 Project Structure

```
browser_extension/
├── manifest.json              # Extension manifest (MV3)
├── background.js              # Service worker with simple MCP client
├── popup.html                 # Extension popup UI
├── popup.js                   # Popup functionality
├── popup.css                  # Popup styling
├── content.js                 # Content script for form detection
├── options.html               # Options page
├── test.html                  # Test page for the extension
├── test-extension-simple.js   # Simple test script
├── requirements.md            # Original requirements (reference)
└── icons/                     # Extension icons
```

## 🧪 Testing

Run the simple test to validate everything works:

```bash
node test-extension-simple.js
```

This test verifies:
- ✅ MCP server can be spawned
- ✅ stdio communication works
- ✅ `extract_personal_data` responds correctly
- ✅ Extension files are valid

## 🔧 Configuration

The extension is configured to:
- MCP Server Path: `/Users/kenne/github/datadam/supabase_mcp_personal_database`
- User ID: `60767eca-63eb-43be-a861-fc0fbf46f468`
- Tool: `extract_personal_data`

To modify these settings, edit `background.js`:

```javascript
class SimpleMCPClient {
  constructor() {
    this.mcpServerPath = '/your/mcp/server/path';
    // ... rest of configuration
  }
  
  async extractPersonalData(userId) {
    // Change the user ID here
    // ...
  }
}
```

## 🔍 How the Extension Works

1. **User clicks "Get Profiles"** in the extension popup
2. **Background script spawns** your MCP server process with error monitoring
3. **Validates server startup** with timeout and error detection
4. **Sends initialize request** via stdin to the MCP server
5. **Sends extract_personal_data request** with your user ID
6. **Parses JSON response** from MCP server stdout
7. **Displays profiles** in the popup for form autofill
8. **Shows error UI** with troubleshooting if server fails

## 🔒 Security

- **Local Communication Only**: All communication happens locally via stdio
- **No Network Requests**: Extension doesn't make external API calls
- **Process Isolation**: MCP server runs in its own monitored process
- **User Control**: Explicit user action required for data retrieval
- **Error Boundary**: Server failures are contained and don't crash the extension

## 🐛 Troubleshooting

The extension includes comprehensive error handling that will guide you through most issues.

### 🚫 Server Error Display

When the MCP server fails, you'll see a detailed error interface with:
- **Clear error description** (not technical jargon)
- **Specific troubleshooting steps** for your situation
- **Visual error indicators** with professional styling

### 🚫 When Server Is Not Running

If your MCP server is not running, you'll see this error in the extension popup:

```
🚫 MCP Server Not Available
Server files not found at the configured path

Troubleshooting:
• Check that your MCP server is built: npm run build
• Verify server path in extension settings
• Check server logs for database connection issues
```

**Quick Fix**: Navigate to your MCP server directory and run:
```bash
cd /Users/kenne/github/datadam/supabase_mcp_personal_database
npm run build
node dist/server/index.js
```

### 📊 Other Error Types

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "Server took too long to start" | Missing dependencies | Run `npm install` then `npm run build` |
| "Server started but cannot connect to database" | Supabase connection issue | Check `.env` file and database credentials |
| "Node.js or server files not found" | Node.js not installed | Install Node.js and verify `node` command works |
| "No profiles found in database" | Empty database | Add data to Supabase for your user ID |

### 🔍 Debugging Steps

1. **Check Extension Console**:
   - Open `chrome://extensions/`
   - Click "Details" on your extension
   - Click "Inspect views: service worker"
   - Check console for detailed error logs

2. **Test MCP Server Directly**:
   ```bash
   cd /path/to/your/mcp/server
   node dist/server/index.js
   ```

3. **Run Extension Test**:
   ```bash
   node test-extension-simple.js
   ```

4. **Check Server Build**:
   ```bash
   cd /path/to/your/mcp/server
   npm run build
   ```

### 🔄 Error Recovery

- **Server errors**: Extension shows troubleshooting UI
- **Temporary issues**: Retry by clicking "Get Profiles" again
- **Persistent failures**: Check server logs and database connection
- **Development mode**: Extension falls back to mock data for testing

The extension is designed to fail gracefully and provide clear guidance for resolution.

## 📊 Test Results

Latest test results from `test-extension-simple.js`:
- ✅ MCP server spawns correctly
- ✅ stdio communication works  
- ✅ extract_personal_data responds
- ✅ Extension files are valid
- ✅ Error handling implementation verified
- ✅ Server failure detection working
- ✅ User-friendly error messages active

## 🤝 Development

1. Make changes to extension code
2. Run test: `node test-extension-simple.js`
3. Reload extension in `chrome://extensions/`
4. Test with `test.html`

## 📡 HTTP API Reference

The browser extension communicates with the MCP server through HTTP requests to port 3001. Below is a comprehensive list of all HTTP API endpoints used:

### Health & Status Endpoints

#### GET /health
**Purpose**: Check if the MCP HTTP API Server is running  
**URL**: `http://localhost:3001/health`  
**Method**: GET  
**Headers**: None required  
**Response**:
```json
{
  "status": "ok",
  "service": "MCP Personal Data HTTP API", 
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### GET /status  
**Purpose**: Get detailed server status and uptime  
**URL**: `http://localhost:3001/status`  
**Method**: GET  
**Headers**: None required  
**Response**:
```json
{
  "status": "running",
  "service": "MCP HTTP API Server",
  "port": 3001,
  "uptime": 123.45,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### GET /api/tools
**Purpose**: List all available MCP tools and their schemas  
**URL**: `http://localhost:3001/api/tools`  
**Method**: GET  
**Headers**: Content-Type: application/json  
**Response**:
```json
{
  "success": true,
  "tools": [
    {
      "name": "extract_personal_data",
      "description": "Extract personal data with optional filtering",
      "inputSchema": { ... }
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Personal Data Management Endpoints

#### POST /api/extract_personal_data
**Purpose**: Retrieve personal data for form autofill  
**URL**: `http://localhost:3001/api/extract_personal_data`  
**Method**: POST  
**Headers**: Content-Type: application/json  
**Request Body**:
```json
{
  "user_id": "399aa002-cb10-40fc-abfe-d2656eea0199",
  "data_types": ["contact", "document", "preference", "custom"],
  "filters": { "classification": ["personal", "public"] },
  "limit": 50,
  "offset": 0
}
```
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "user_id": "399aa002-cb10-40fc-abfe-d2656eea0199",
      "data_type": "contact",
      "title": "Emergency Contact",
      "content": { "name": "John Doe", "phone": "+1-555-123-4567" },
      "tags": ["emergency", "contact"],
      "classification": "personal",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### POST /api/create_personal_data  
**Purpose**: Save new personal data from form fields  
**URL**: `http://localhost:3001/api/create_personal_data`  
**Method**: POST  
**Headers**: Content-Type: application/json  
**Request Body**:
```json
{
  "user_id": "399aa002-cb10-40fc-abfe-d2656eea0199",
  "data_type": "contact",
  "title": "Work Contact",
  "content": { "email": "work@example.com", "phone": "+1-555-999-8888" },
  "tags": ["work", "contact"],
  "classification": "personal"
}
```
**Response**:
```json
{
  "success": true,
  "data": {
    "id": "new_record_id",
    "user_id": "399aa002-cb10-40fc-abfe-d2656eea0199",
    "data_type": "contact",
    "title": "Work Contact",
    "content": { "email": "work@example.com", "phone": "+1-555-999-8888" },
    "tags": ["work", "contact"],
    "classification": "personal",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### PUT /api/update_personal_data/:recordId
**Purpose**: Update existing personal data record  
**URL**: `http://localhost:3001/api/update_personal_data/{record_id}`  
**Method**: PUT  
**Headers**: Content-Type: application/json  
**Request Body**:
```json
{
  "title": "Updated Contact Info",
  "content": { "email": "updated@example.com" },
  "tags": ["updated", "contact"]
}
```
**Response**:
```json
{
  "success": true,
  "data": {
    "id": "record_id",
    "message": "Record updated successfully"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### DELETE /api/delete_personal_data
**Purpose**: Delete one or more personal data records  
**URL**: `http://localhost:3001/api/delete_personal_data`  
**Method**: DELETE  
**Headers**: Content-Type: application/json  
**Request Body**:
```json
{
  "record_ids": ["record_id_1", "record_id_2"],
  "hard_delete": false
}
```
**Response**:
```json
{
  "success": true,
  "data": {
    "deleted_count": 2,
    "hard_delete": false,
    "message": "Records deleted successfully"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### POST /api/search_personal_data
**Purpose**: Search personal data with query string  
**URL**: `http://localhost:3001/api/search_personal_data`  
**Method**: POST  
**Headers**: Content-Type: application/json  
**Request Body**:
```json
{
  "user_id": "399aa002-cb10-40fc-abfe-d2656eea0199",
  "query": "john doe",
  "data_types": ["contact"],
  "limit": 20
}
```
**Response**:
```json
{
  "success": true,
  "data": {
    "query": "john doe",
    "results": [
      {
        "id": "1",
        "title": "John Doe Contact",
        "content": { "name": "John Doe", "email": "john@example.com" },
        "data_type": "contact",
        "relevance_score": 0.95
      }
    ],
    "count": 1
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### POST /api/add_personal_data_field
**Purpose**: Add new field definition for personal data schema  
**URL**: `http://localhost:3001/api/add_personal_data_field`  
**Method**: POST  
**Headers**: Content-Type: application/json  
**Request Body**:
```json
{
  "field_name": "emergency_contact",
  "data_type": "string",
  "validation_rules": { "required": true },
  "is_required": false,
  "default_value": null
}
```
**Response**:
```json
{
  "success": true,
  "data": {
    "field_name": "emergency_contact",
    "data_type": "string",
    "message": "Field added successfully"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### GET /api/user_profile/:userId
**Purpose**: Get aggregated user profile data  
**URL**: `http://localhost:3001/api/user_profile/399aa002-cb10-40fc-abfe-d2656eea0199`  
**Method**: GET  
**Headers**: Content-Type: application/json  
**Response**:
```json
{
  "success": true,
  "profile": {
    "user_id": "399aa002-cb10-40fc-abfe-d2656eea0199",
    "name": "Kenneth Lee",
    "email": "kenneth@example.com",
    "phone": "+1-555-0123",
    "address": null,
    "preferences": { "theme": "dark" },
    "documents": {},
    "custom_fields": {}
  }
}
```

### Generic Tool Endpoint

#### POST /api/tools/:toolName
**Purpose**: Call any MCP tool dynamically  
**URL**: `http://localhost:3001/api/tools/{tool_name}`  
**Method**: POST  
**Headers**: Content-Type: application/json  
**Request Body**: Tool-specific arguments as JSON object  
**Response**:
```json
{
  "success": true,
  "tool": "tool_name",
  "result": { /* Tool-specific result data */ },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Responses

All endpoints may return error responses in this format:
```json
{
  "success": false,
  "error": "Error description",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Browser Extension Usage

The extension makes these requests from:
- **background.js**: All API calls from `EnhancedMCPClient` class (lines 25-231)
- **popup.js**: Indirect calls via `chrome.runtime.sendMessage()` to background script (lines 319-322, 372-374)

### Connection Configuration

- **Base URL**: `http://localhost:3001` (configurable in background.js:6)
- **User ID**: `399aa002-cb10-40fc-abfe-d2656eea0199` (Kenneth Lee)
- **Timeout**: 2 minutes per request (default)
- **Retry Logic**: Falls back to mock data on connection failure

## 📝 License

This project is part of the MCP Personal Data Management system.

---

## Why This Simple Approach?

We initially explored complex native messaging setups, but realized that for MCP integration, we just need:

1. **Spawn the MCP server process**
2. **Send JSON-RPC via stdin**  
3. **Read responses from stdout**

This simple stdio approach is exactly how MCP is designed to work - no additional infrastructure needed!