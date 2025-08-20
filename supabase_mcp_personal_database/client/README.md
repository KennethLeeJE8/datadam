# MCP Bridge Client

This directory contains the bridge client that enables Claude Desktop to connect to the HTTP MCP server deployed on Render.com.

## How It Works

Claude Desktop → stdio MCP protocol → Bridge Client → HTTP requests → Cloud MCP Server

The bridge client:
1. Reads JSON-RPC requests from stdin (Claude Desktop)
2. Converts them to HTTP POST requests to your cloud server
3. Receives HTTP responses and converts them back to JSON-RPC
4. Writes responses to stdout (back to Claude Desktop)

## Installation

1. **Copy the bridge client to a stable location:**
   ```bash
   # Create a directory for MCP clients
   mkdir -p ~/.mcp-clients
   
   # Copy the bridge client
   cp client/mcp-bridge.js ~/.mcp-clients/
   chmod +x ~/.mcp-clients/mcp-bridge.js
   ```

2. **Configure Claude Desktop:**
   
   Edit your Claude Desktop configuration file (usually at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
   
   ```json
   {
     "mcpServers": {
       "personal-data": {
         "command": "node",
         "args": [
           "/Users/YOUR_USERNAME/.mcp-clients/mcp-bridge.js",
           "https://datadam-mcp.onrender.com"
         ]
       }
     }
   }
   ```
   
   Replace `YOUR_USERNAME` with your actual username.

3. **Restart Claude Desktop** for the changes to take effect.

## Testing the Connection

You can test the bridge client manually:

```bash
# Test basic connection
echo '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}}, "id": 1}' | node client/mcp-bridge.js https://datadam-mcp.onrender.com

# Test tool listing
echo '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 2}' | node client/mcp-bridge.js https://datadam-mcp.onrender.com
```

## Debugging

Enable debug mode to see detailed logs:

```bash
DEBUG=true node client/mcp-bridge.js https://datadam-mcp.onrender.com
```

The debug logs will be written to stderr, so they won't interfere with the JSON-RPC communication on stdout.

## Configuration Options

### Server URL
The bridge client accepts the server URL as the first argument:
- `https://datadam-mcp.onrender.com` (production)
- `http://localhost:3000` (local development)

### Environment Variables
- `DEBUG=true` - Enable verbose logging to stderr

## Troubleshooting

### Common Issues

1. **"Command not found" error in Claude Desktop:**
   - Ensure Node.js is installed and accessible in PATH
   - Check that the bridge client path is correct
   - Try using absolute path to node: `/usr/local/bin/node` or `/opt/homebrew/bin/node`

2. **Connection timeout:**
   - Check that the server URL is correct and accessible
   - Verify the server is running (check `/health` endpoint)
   - Check your internet connection

3. **JSON-RPC errors:**
   - Enable debug mode to see detailed request/response logs
   - Check server logs for errors
   - Verify the MCP protocol compatibility

### Verification Steps

1. **Test server accessibility:**
   ```bash
   curl https://datadam-mcp.onrender.com/health
   ```

2. **Test REST API endpoints:**
   ```bash
   curl https://datadam-mcp.onrender.com/tools
   ```

3. **Test MCP endpoint directly:**
   ```bash
   curl -X POST https://datadam-mcp.onrender.com/mcp-public \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
   ```

## Architecture

```
┌─────────────────┐    stdio     ┌─────────────────┐    HTTPS    ┌─────────────────┐
│   Claude        │─────────────→│   MCP Bridge    │────────────→│   HTTP MCP      │
│   Desktop       │              │   Client        │             │   Server        │
│                 │←─────────────│                 │←────────────│   (Render.com)  │
└─────────────────┘    stdio     └─────────────────┘    HTTPS    └─────────────────┘
```

## Advanced Usage

### Custom Headers
You can modify the bridge client to add custom headers for authentication or other purposes by editing the `options.headers` in the `forwardToHTTPServer` method.

### Session Management
The bridge client automatically manages session IDs returned by the HTTP server to maintain state across requests.

### Error Handling
The bridge client includes comprehensive error handling and will attempt to provide meaningful error messages back to Claude Desktop.