# Quick Setup Guide

## 🚀 Simple 3-Step Setup

### 1. Test the Extension
```bash
node test-extension-simple.js
```
✅ Should show all tests passing (including error handling)

### 2. Load in Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select this directory

### 3. Test with Real Forms
1. Open `test.html` in Chrome
2. Click the extension icon
3. Click "Get Profiles"
4. Watch it fetch data from your MCP server!

## 🎯 What It Does

- **Spawns your MCP server** directly via `child_process.spawn()`
- **Monitors server startup** with timeout and error detection
- **Sends JSON-RPC requests** via stdin
- **Reads responses** from stdout
- **Shows helpful errors** when things go wrong
- **No complex setup** required!

## 🔧 Configuration

Your MCP server path is configured in `background.js`:
```javascript
this.mcpServerPath = '/Users/kenne/github/datadam/supabase_mcp_personal_database';
```

Your user ID is:
```javascript
'60767eca-63eb-43be-a861-fc0fbf46f468'
```

## 🚫 If Server Is Not Running

You'll see this exact error message in the extension popup:

```
🚫 MCP Server Not Available
Server files not found at the configured path

Troubleshooting:
• Check that your MCP server is built: npm run build
• Verify server path in extension settings  
• Check server logs for database connection issues
```

**Solution**: Run your MCP server:
```bash
cd /Users/kenne/github/datadam/supabase_mcp_personal_database
npm run build
node dist/server/index.js
```

## 🐛 Troubleshooting

**Extension won't load?** 
- Check `chrome://extensions/` for errors

**See server error UI?**
- Follow the troubleshooting steps shown in the extension
- Run `npm run build` in your MCP server directory
- Check server path in `background.js`

**No data but no errors?**
- Your Supabase database is empty for that user ID
- Extension shows this as an info message, not an error

**Want to test error handling?**
- Temporarily change the server path in `background.js` to see error UI
- Stop your database to see connection error handling

That's it! Simple stdio communication with comprehensive error handling. 🎉