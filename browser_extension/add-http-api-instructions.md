# Add HTTP API to Your MCP Server

## 📦 1. Install Dependencies

First, add Express to your MCP server:

```bash
cd /Users/kenne/github/datadam/supabase_mcp_personal_database
npm install express cors
npm install --save-dev @types/express @types/cors
```

## 📁 2. Copy HTTP API File

Copy the HTTP API server file to your MCP server:

```bash
cp /Users/kenne/github/datadam/browser_extension/http-api-server.ts /Users/kenne/github/datadam/supabase_mcp_personal_database/src/server/http-api-server.ts
```

## 🔧 3. Update package.json Scripts

Add these scripts to your MCP server's `package.json`:

```json
{
  "scripts": {
    "http-api": "node --loader ts-node/esm src/server/http-api-server.ts",
    "http-api:dev": "node --loader ts-node/esm --watch src/server/http-api-server.ts",
    "start:both": "concurrently \"npm run start\" \"npm run http-api\""
  }
}
```

If you don't have `concurrently`, install it:
```bash
npm install --save-dev concurrently
```

## 🔧 4. Fix Import Paths

Update the import paths in `http-api-server.ts` to match your project structure:

```typescript
// Change these lines in http-api-server.ts:
import { setupPersonalDataTools } from './tools/index.js';
import { initializeDatabase } from '../database/client.js';
import { logger } from '../utils/logger.js';

// And update the tool import to match your actual file structure
```

## 🚀 5. Start the HTTP API Server

You can now run:

```bash
# Just the HTTP API
npm run http-api

# Both MCP server and HTTP API
npm run start:both

# Development mode with auto-restart
npm run http-api:dev
```

## 🧪 6. Test the API

Test that it's working:

```bash
# Health check
curl http://localhost:3001/health

# Test extract_personal_data
curl -X POST http://localhost:3001/api/extract_personal_data \
  -H "Content-Type: application/json" \
  -d '{"user_id": "60767eca-63eb-43be-a861-fc0fbf46f468"}'
```

## 📡 7. Update Browser Extension

Once the HTTP API is running, I'll update your browser extension to use it instead of mock data.

The API will be available at:
- **Base URL**: `http://localhost:3001`
- **Extract Data**: `POST /api/extract_personal_data`
- **Health Check**: `GET /health`
- **List Tools**: `GET /api/tools`

Let me know when you've completed these steps and I'll update the browser extension!