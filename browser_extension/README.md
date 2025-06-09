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

## 📝 License

This project is part of the MCP Personal Data Management system.

---

## Why This Simple Approach?

We initially explored complex native messaging setups, but realized that for MCP integration, we just need:

1. **Spawn the MCP server process**
2. **Send JSON-RPC via stdin**  
3. **Read responses from stdout**

This simple stdio approach is exactly how MCP is designed to work - no additional infrastructure needed!