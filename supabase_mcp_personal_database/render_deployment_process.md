# MCP Server Deployment Process on Render

## Step 1: Repository Preparation

### 1.1 Project Structure Organization
```
your-mcp-server/
├── src/
│   ├── server.js           // Main entry point
│   ├── tools/              // Existing MCP tools
│   ├── database/           // Supabase integration
│   └── http/               // New HTTP transport layer
├── package.json            // Dependencies and scripts
├── Dockerfile             // Optional for custom builds
├── render.yaml            // Render configuration (optional)
└── .env.example           // Environment variable template
```

### 1.2 Update package.json
```json
{
  "name": "mcp-personal-data-server",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "build": "echo 'No build step required'"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    // Your existing dependencies plus:
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "helmet": "^6.1.0",
    "dotenv": "^16.0.0"
  }
}
```

### 1.3 Create HTTP Server Entry Point
```javascript
// src/server.js - Modified entry point
require('dotenv').config();

// Environment-based transport selection
if (process.env.MCP_TRANSPORT === 'http') {
  require('./http/http-server.js');
} else {
  require('./stdio/stdio-server.js'); // Your existing stdio server
}
```

## Step 2: Render Account Setup

### 2.1 Account Creation
```
1. Go to render.com
2. Sign up with GitHub account (recommended for easy repo connection)
3. Verify email address
4. Connect GitHub account if not done during signup
```

### 2.2 Dashboard Navigation
```
Render Dashboard → New → Web Service
- This creates a new web service that can handle HTTP requests
- Alternative: Background Worker (for non-HTTP services)
```

## Step 3: Service Configuration on Render

### 3.1 Repository Connection
```
Service Creation Flow:
1. "Connect a repository"
2. Select your GitHub repo containing MCP server
3. Grant Render access to the repository
4. Select branch (usually 'main' or 'master')
```

### 3.2 Build & Deploy Settings
```
Basic Settings:
- Name: "mcp-personal-data-server"
- Environment: "Node"
- Region: "US West" (or closest to your users)
- Branch: "main"

Build Command: "npm install"
Start Command: "npm start"

Advanced Settings:
- Auto-Deploy: Yes (deploys on git push)
- Pull Request Previews: No (for production)
```

### 3.3 Environment Variables Configuration

**🔴 REQUIRED VARIABLES:**
```
MCP_TRANSPORT=http
NODE_ENV=production
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

**🟡 OPTIONAL SECURITY VARIABLES:**
```
MCP_API_KEY=your-secure-random-32char-key
CORS_ORIGINS=https://yourapp.com,chrome-extension://*
RATE_LIMIT_REQUESTS=50
RATE_LIMIT_WINDOW=900000
REQUEST_TIMEOUT=30000
MAX_REQUEST_SIZE=100kb
MAX_CONNECTIONS=3
CACHE_SIZE=100
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
```

**⚠️ IMPORTANT NOTES:**
- PORT is auto-assigned by Render - DO NOT SET
- SUPABASE keys are found in your Supabase project dashboard
- MCP_API_KEY should be 32+ random characters for security
- CORS_ORIGINS should list your actual domains (no wildcards in production)

## Step 4: Health Check Configuration

### 4.1 Health Endpoint Setup
```javascript
// Add to your HTTP server
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'mcp-personal-data-server'
  });
});
```

### 4.2 Render Health Check Settings
```
Health Check Configuration:
- Health Check Path: "/health"
- Health Check Grace Period: 30 seconds
- Health Check Interval: 30 seconds
- Health Check Timeout: 10 seconds
```

## Step 5: Custom Domain & SSL (Optional)

### 5.1 Custom Domain Setup
```
Render Settings → Custom Domains:
1. Add domain: "mcp-api.yourdomain.com"
2. Add DNS records to your domain provider:
   - Type: CNAME
   - Name: mcp-api
   - Value: your-service.onrender.com
3. Render automatically provisions SSL certificate
```

### 5.2 Environment URL Updates
```
After domain setup, update:
- Browser extension configuration
- Client applications
- Any hardcoded URLs to use new custom domain
```

## Step 6: Deployment Process

### 6.1 Initial Deployment
```
Deployment Steps:
1. Click "Create Web Service"
2. Render automatically:
   - Clones your repository
   - Runs `npm install`
   - Starts the service with `npm start`
   - Assigns a public URL: https://your-service.onrender.com

Expected Timeline:
- Build: 2-5 minutes
- Deploy: 1-2 minutes
- Health Check: 30 seconds
```

### 6.2 Monitoring Deployment
```
Render Dashboard Shows:
- Build logs (real-time)
- Deploy status
- Service health
- Resource usage
- Error logs

Common Issues to Watch:
- Environment variable typos
- Missing dependencies
- Port binding issues (Render assigns port via $PORT)
- Database connection failures
```

## Step 7: Post-Deployment Verification

### 7.1 Service Health Verification
```bash
# Test basic connectivity
curl https://your-service.onrender.com/health

# Test MCP endpoints
curl -X POST https://your-service.onrender.com/api/tools/extract_personal_data \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"user_id": "test-user", "data_types": ["contact"]}'
```

### 7.2 Browser Extension Testing
```javascript
// Update extension configuration
const MCP_SERVER_CONFIG = {
  development: 'localhost:3000',
  production: 'https://your-service.onrender.com'
};

// Test autofill functionality
// Verify data retrieval works
// Check error handling
```

## Step 8: Continuous Deployment Setup

### 8.1 Git Workflow
```
Deployment Workflow:
1. Push to main branch
2. Render automatically detects change
3. Runs build process
4. Deploys new version
5. Health checks verify deployment
6. Old version remains until health checks pass

Rollback Process:
- Automatic rollback if health checks fail
- Manual rollback via Render dashboard
- Git revert → automatic redeployment
```

### 8.2 Environment Management
```
Environment Strategy:
- Production: main branch → Render production service
- Staging: develop branch → Render staging service
- Local: stdio transport for development

Branch Protection:
- Require PR reviews for main branch
- Run tests before merge
- Protect against direct pushes to main
```

## Step 9: Monitoring & Alerts

### 9.1 Render Built-in Monitoring
```
Available Metrics:
- Response time
- Error rate
- Memory usage
- CPU usage
- Request volume

Dashboard Features:
- Real-time metrics
- Historical data
- Alerting thresholds
- Log streaming
```

### 9.2 External Monitoring Setup
```javascript
// Optional: Add external monitoring
app.use('/metrics', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: Date.now(),
    database: await checkDatabaseHealth()
  });
});

// Health check for external monitors
app.get('/ping', (req, res) => res.send('pong'));
```

## Step 10: Cost Optimization

### 10.1 Render Pricing Tiers
```
Free Tier:
- 750 hours/month free compute
- Auto-sleep after 15 minutes of inactivity
- 512MB RAM, 0.5 CPU
- Good for development/testing

Starter Plan ($7/month):
- Always-on service
- 1GB RAM, 1 CPU
- Custom domains
- Better for production

Pro Plan ($25/month):
- 2GB RAM, 1 CPU
- Priority support
- Advanced metrics
```

### 10.2 Resource Optimization
```javascript
// Optimize for Render's environment
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

// Memory usage optimization
if (process.env.NODE_ENV === 'production') {
  // Reduce connection pool size
  // Enable response compression
  // Implement request caching
}
```

## Troubleshooting Common Issues

### Build Failures
```
Common Causes:
- Missing package.json
- Node version incompatibility
- Missing environment variables during build
- Dependency installation failures

Solutions:
- Check build logs in Render dashboard
- Verify package.json engines field
- Ensure all dependencies are in dependencies, not devDependencies
```

### Runtime Issues
```
Common Causes:
- Port binding issues (use process.env.PORT)
- Database connection failures
- Missing environment variables
- CORS configuration problems

Solutions:
- Check service logs in Render dashboard
- Verify environment variables are set
- Test database connectivity separately
- Use Render's shell access for debugging
```

### Performance Issues
```
Common Causes:
- Insufficient resources (upgrade plan)
- Database query optimization needed
- Too many concurrent connections
- Memory leaks

Solutions:
- Monitor resource usage in dashboard
- Optimize database queries
- Implement connection pooling
- Add memory monitoring and alerting
```

This process should get your MCP server running on Render with HTTPS, automatic deployments, and production monitoring. The total setup time is typically 15-30 minutes for the initial deployment.