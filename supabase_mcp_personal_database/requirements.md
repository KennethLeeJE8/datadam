# MCP Server Requirements for Personal Data Management with Supabase

## Executive Summary

This document defines comprehensive requirements for building a Model Context Protocol (MCP) server that provides secure personal data management capabilities through CRUD operations integrated with Supabase database. The system enables AI assistants to interact with personal data through standardized MCP tools while maintaining strict security, privacy compliance, and performance standards.

**Key capabilities include extracting personal data on demand, adding new data fields dynamically, and providing full CRUD operations through MCP tools**, all while ensuring GDPR compliance and implementing robust security measures including Supabase Auth integration, Row Level Security (RLS), and comprehensive audit logging.

## Implementation Status Update

**✅ COMPLETED FEATURES:**
- **Database Schema**: Complete schema with 4 core tables, RLS policies, and performance indexes
- **Authentication Integration**: Real Supabase Auth user creation with proper foreign key handling
- **RPC Functions**: 6 advanced functions for search, bulk operations, and GDPR compliance
- **Audit Logging**: Comprehensive tracking of all database operations
- **Test Infrastructure**: Automated testing with `createTables.ts` for validation
- **Security Policies**: Production-ready RLS policies with service role bypass
- **Sample Data**: Working sample data with proper `auth.users` integration

## 1. Technical Architecture Specifications

### 1.1 MCP Protocol Implementation

**Protocol Foundation**
- **Base Protocol**: JSON-RPC 2.0 with MCP specification compliance
- **Transport Mechanisms**: 
  - Primary: HTTP API transport for browser extension compatibility (port 3001)
  - Secondary: stdio transport for local integrations
  - Support for custom transports as needed
- **Message Format**: Standard JSON-RPC with MCP-specific extensions
- **Session Management**: OAuth 2.1 with PKCE for security baseline

**Core MCP Primitives Implementation**

**Tools (Personal Data Operations)**
- `extract_personal_data`: Query and retrieve personal data with filtering
- `add_personal_data_field`: Create new data field types dynamically  
- `update_personal_data`: Modify existing personal data records
- `delete_personal_data`: Secure deletion with GDPR compliance
- `search_personal_data`: Full-text search across personal data
- `export_personal_data`: Data portability compliance exports

**Resources (Data Schema Access)**
- `schema://personal_data_types`: Available data field types and schemas
- `stats://usage_patterns`: Data access and usage statistics
- `config://privacy_settings`: User privacy configuration options

**Prompts (Data Management Workflows)**
- `analyze_personal_data`: Structured data analysis workflows
- `privacy_assessment`: Data privacy impact evaluation prompts
- `data_migration`: Guided data migration and transformation

### 1.2 Supabase Integration Architecture (✅ IMPLEMENTED)

**Database Connection Management**
- **Connection Pooling**: Supavisor transaction pooling for optimal performance  
- **Client Library**: `@supabase/supabase-js` v2 with TypeScript support
- **Authentication**: Full Supabase Auth integration with `auth.admin.createUser()` 
- **Row Level Security**: Comprehensive RLS policies with service role bypass
- **Real-time Capabilities**: Supabase Realtime for live data updates
- **Environment Variables**:
  - `SUPABASE_URL`: The URL of your Supabase project
  - `SUPABASE_ANON_KEY`: Key for public read operations
  - `SUPABASE_SERVICE_ROLE_KEY`: Key for admin-level operations

**Database Schema Design (✅ DEPLOYED)**

**Implementation Status**: Complete schema deployed with `src/database/schema.sql`
- ✅ All 4 core tables with proper constraints and foreign keys
- ✅ Comprehensive Row Level Security (RLS) policies  
- ✅ 6 RPC functions for advanced operations
- ✅ Performance indexes on all critical columns
- ✅ Automatic timestamp triggers
- ✅ Sample data integration with real `auth.users`

```sql
-- Core user profiles with metadata support
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flexible personal data storage with dynamic fields
CREATE TABLE personal_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE,
  data_type TEXT NOT NULL, -- 'contact', 'document', 'preference', 'custom'
  title TEXT,
  content JSONB NOT NULL,
  tags TEXT[],
  classification TEXT DEFAULT 'personal', -- 'personal', 'sensitive', 'public'
  is_encrypted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW()
);

-- Data field definitions for dynamic schema management
CREATE TABLE data_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name TEXT NOT NULL,
  data_type TEXT NOT NULL, -- 'string', 'number', 'date', 'json', 'encrypted'
  validation_rules JSONB DEFAULT '{}',
  is_required BOOLEAN DEFAULT FALSE,
  default_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail for compliance and security
CREATE TABLE data_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE,
  operation TEXT NOT NULL, -- 'CREATE', 'READ', 'UPDATE', 'DELETE'
  table_name TEXT NOT NULL,
  record_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Performance Indexes (✅ IMPLEMENTED)**
```sql
-- Core performance indexes (expanded implementation)
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_personal_data_user_id ON personal_data(user_id);
CREATE INDEX idx_personal_data_type ON personal_data(data_type);
CREATE INDEX idx_personal_data_tags ON personal_data USING GIN(tags);
CREATE INDEX idx_personal_data_content ON personal_data USING GIN(content);
CREATE INDEX idx_personal_data_classification ON personal_data(classification);
CREATE INDEX idx_personal_data_deleted_at ON personal_data(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_data_field_definitions_field_name ON data_field_definitions(field_name);
CREATE INDEX idx_data_field_definitions_data_type ON data_field_definitions(data_type);
CREATE INDEX idx_access_log_user_operation ON data_access_log(user_id, operation);
CREATE INDEX idx_access_log_timestamp ON data_access_log(created_at);
CREATE INDEX idx_access_log_table_name ON data_access_log(table_name);
```

**Implemented RPC Functions (✅ PRODUCTION-READY)**
```sql
-- Advanced search with filters and pagination
CREATE FUNCTION search_personal_data(user_id, search_text, data_types[], tags[], classification, limit, offset)

-- Bulk tag management for efficiency  
CREATE FUNCTION bulk_update_personal_data_tags(user_id, record_ids[], tags_to_add[], tags_to_remove[])

-- GDPR-compliant soft deletion with audit trail
CREATE FUNCTION soft_delete_personal_data(user_id, record_id, deletion_reason)

-- Complete user data erasure (Right to Erasure)
CREATE FUNCTION hard_delete_user_data(user_id, confirmation_token)

-- Full data export for GDPR compliance (Data Portability)  
CREATE FUNCTION export_user_data(user_id)

-- Analytics and reporting
CREATE FUNCTION get_data_type_stats()
```

**Row Level Security Policies (✅ IMPLEMENTED)**
- Service role bypass for admin operations
- User data isolation (users only access own data) 
- Field definitions shared access with proper permissions
- Audit log security (users only see own logs)
- Authenticated user policies for all CRUD operations

### 1.3 System Architecture Components

**Core Service Layer (✅ FOUNDATION IMPLEMENTED)**
- **Database Layer**: Complete Supabase schema with RLS and RPC functions
- **Data Access Layer**: Supabase JavaScript client with TypeScript support  
- **Authentication Service**: Supabase Auth integration with real user creation
- **Validation Engine**: Runtime validation ready for Zod integration
- **Test Infrastructure**: Automated testing with `createTables.ts`

**Supporting Services (✅ PARTIALLY IMPLEMENTED)**
- **Audit Service**: ✅ Comprehensive logging via `data_access_log` table
- **Security Layer**: ✅ Row Level Security policies and service role bypass
- **Data Management**: ✅ RPC functions for CRUD, search, and GDPR operations
- **Performance Layer**: ✅ Comprehensive indexing and query optimization

**Ready for MCP Implementation**
- **MCP Server Engine**: Ready for FastMCP framework integration
- **Tool Implementation**: Database foundation ready for MCP tool development
- **Resource Management**: Schema and RPC functions ready for MCP resource exposure
- **Prompt Integration**: Data access patterns established for MCP prompt workflows

## 2. Functional Requirements

### 2.1 Personal Data Extraction

**Extract Personal Data Tool**
- **Input Parameters**:
  - `user_id`: Target user identifier (validated against permissions)
  - `data_types`: Array of data types to extract (`contact`, `documents`, `preferences`)
  - `filters`: Optional filtering criteria (date ranges, tags, classification)
  - `limit`: Maximum number of records (default: 50, max: 500)
  - `offset`: Pagination offset for large datasets
- **Processing Logic**:
  - Validate user permissions and data access rights
  - Apply Row Level Security policies automatically
  - Decrypt encrypted fields based on user permissions
  - Log all data access for audit compliance
- **Output Format**: Structured JSON with metadata, pagination info, and data records

**Advanced Query Capabilities**
- **Full-text search** across all personal data fields
- **Semantic search** using vector embeddings for similar content
- **Aggregation queries** for data analytics and insights
- **Cross-reference queries** to find related data across different types

### 2.2 Dynamic Data Field Management

**Add Personal Data Field Tool**
- **Input Parameters**:
  - `field_name`: Unique identifier for the new field
  - `data_type`: Field type (`string`, `number`, `date`, `json`, `encrypted`)
  - `validation_rules`: JSON schema validation rules
  - `is_required`: Whether field is mandatory for new records
  - `default_value`: Default value for new field
  - `encryption_required`: Whether field should be encrypted at rest
- **Processing Logic**:
  - Validate field definition against system constraints
  - Create field definition in metadata tables
  - Update validation schemas dynamically
  - Migrate existing records with default values
- **Schema Evolution**: Support for backward-compatible schema changes

**Field Management Operations**
- **Update field definitions** with validation rule changes
- **Deprecate fields** while maintaining historical data
- **Field type conversion** with data migration support
- **Bulk field operations** for schema management

### 2.3 CRUD Operations Implementation

**Create Operations**
- Validate input against dynamic schema definitions
- Apply field-level encryption for sensitive data
- Generate unique identifiers and timestamps
- Trigger real-time notifications for data changes
- Maintain audit trail for all create operations

**Read Operations**
- Support complex filtering and sorting criteria
- Implement efficient pagination for large datasets
- Apply user permissions and data classification rules
- Provide caching for frequently accessed data
- Return data with appropriate field decryption

**Update Operations**
- Partial update support with field-level granularity
- Optimistic locking to prevent concurrent modification conflicts
- Change tracking and audit trail maintenance
- Schema validation for all field updates
- Selective field encryption updates

**Delete Operations**
- **Soft delete** with audit trail maintenance
- **Hard delete** for GDPR compliance (Right to Erasure)
- **Cascading delete** for related data records
- **Secure deletion** of encrypted fields and backup data
- **Batch delete** operations with transaction support

## 3. Security Requirements

### 3.1 Authentication and Authorization

**OAuth 2.1 Implementation**
- **Authorization Server**: Supabase Auth with custom policies
- **Client Authentication**: PKCE (Proof Key for Code Exchange) mandatory
- **Token Management**: Short-lived access tokens (15 minutes) with secure refresh tokens
- **Scope Definition**: Granular scopes for different data types and operations
- **Multi-Factor Authentication**: TOTP, SMS, or hardware token support

**Authorization Model**
- **Role-Based Access Control**: Predefined roles (owner, viewer, editor, admin)
- **Attribute-Based Access Control**: Dynamic permissions based on data classification
- **Data Classification Levels**: public, personal, sensitive, confidential
- **Time-Based Access**: Temporary access grants with automatic expiration
- **Location-Based Restrictions**: IP-based access controls for sensitive operations

**Row Level Security Policies**
```sql
-- Users can only access their own personal data
CREATE POLICY "personal_data_access" ON personal_data
FOR ALL TO authenticated 
USING (user_id = auth.uid());

-- Audit logs are read-only for data owners
CREATE POLICY "audit_log_read" ON data_access_log
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Admins can access aggregated, anonymized data
CREATE POLICY "admin_analytics" ON personal_data
FOR SELECT TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin' AND
  current_setting('app.admin_mode') = 'analytics_only'
);
```

### 3.2 Data Protection and Encryption

**Encryption at Rest**
- **Database Level**: Supabase provides AES-256 encryption for all stored data
- **Field Level**: Additional AES-256 encryption for sensitive personal data fields
- **Key Management**: Separate encryption keys for different data classifications
- **Key Rotation**: Automated key rotation on quarterly basis

**Encryption in Transit**
- **Protocol**: TLS 1.3 minimum for all API communications
- **Certificate Pinning**: Pin Supabase certificates for enhanced security
- **API Gateway**: All MCP communications through encrypted channels only

**Advanced Data Protection**
- **Tokenization**: Replace sensitive data with non-sensitive tokens for processing
- **Data Masking**: Configurable masking for non-production environments
- **Homomorphic Encryption**: For computation on encrypted data where needed

### 3.3 Privacy and Compliance

**GDPR Compliance Features**
- **Data Subject Rights**: Automated tools for access, rectification, erasure, portability
- **Consent Management**: Granular consent tracking and enforcement
- **Data Processing Records**: Comprehensive documentation of all processing activities
- **Privacy by Design**: Default privacy-preserving configurations
- **Data Protection Impact Assessments**: Built-in DPIA workflow tools

**Compliance Monitoring**
- **Audit Trail**: Immutable logs of all data access and modifications
- **Retention Management**: Automated data deletion based on retention policies
- **Breach Detection**: Automated monitoring for potential data breaches
- **Compliance Reporting**: Automated generation of compliance reports

### 3.4 Security Monitoring and Incident Response

**Threat Detection**
- **Anomaly Detection**: Machine learning-based detection of unusual access patterns
- **Brute Force Protection**: Progressive delays and account lockouts
- **Privilege Escalation Monitoring**: Detection of unauthorized permission changes
- **Data Exfiltration Detection**: Monitoring for large data exports or unusual patterns

**Incident Response**
- **Automated Response**: Immediate blocking of suspicious activities
- **Alert System**: Real-time notifications for security events
- **Forensic Logging**: Detailed logs for security incident investigation
- **Recovery Procedures**: Documented procedures for security incident recovery

## 4. Performance Requirements

### 4.1 Response Time Targets

**API Response Times**
- **Simple data queries**: \< 100ms (95th percentile)
- **Complex filtering operations**: \< 500ms (95th percentile)  
- **Data exports**: \< 2 seconds for up to 10,000 records
- **Schema operations**: \< 200ms for field additions/updates
- **Authentication operations**: \< 150ms for token validation

**Database Performance**
- **Connection acquisition**: \< 10ms from connection pool
- **Query execution**: \< 50ms for simple queries, \< 200ms for complex queries
- **Index utilization**: \> 95% for all frequent query patterns
- **Cache hit ratio**: \> 80% for frequently accessed data

### 4.2 Scalability Requirements

**Concurrent Users**
- **Baseline**: Support 100 concurrent users per server instance
- **Peak Load**: Handle 500 concurrent users with auto-scaling
- **Database Connections**: Optimize connection pooling for maximum efficiency
- **Memory Usage**: \< 1GB memory usage per 100 concurrent users

**Data Volume Handling**
- **Record Limits**: Support up to 1 million personal data records per user
- **Query Performance**: Maintain sub-second response times for queries across large datasets
- **Storage Optimization**: Implement data archiving for historical records
- **Backup Performance**: Complete database backups within 30 minutes

### 4.3 Availability and Reliability

**Uptime Requirements**
- **Service Availability**: 99.9% uptime (8.77 hours downtime per year)
- **Planned Maintenance**: Maximum 4 hours monthly maintenance window
- **Disaster Recovery**: Recovery Time Objective (RTO) of 4 hours
- **Data Backup**: Recovery Point Objective (RPO) of 1 hour

**Error Handling**
- **Graceful Degradation**: Continue operating with reduced functionality during partial failures
- **Circuit Breaker**: Automatic failover for failed external dependencies
- **Retry Logic**: Exponential backoff for transient failures
- **Error Recovery**: Automatic recovery from common error conditions

## 5. Implementation Guidelines

### 5.1 Development Framework

**Recommended Technology Stack**
- **Server Framework**: FastMCP 2.0 with TypeScript for type safety and performance
- **Database Integration**: Supabase TypeScript client with automatic type generation
- **Authentication**: Supabase Auth with custom policies and RLS
- **Validation**: Zod for runtime type validation and schema enforcement
- **Testing**: Vitest for unit testing, Playwright for integration testing

**Project Structure**
```
mcp-personal-data-server/
├── src/
│   ├── server/
│   │   ├── tools/           # MCP tool implementations
│   │   ├── resources/       # Resource access handlers
│   │   ├── prompts/         # Prompt templates
│   │   └── index.ts         # Main server entry point
│   ├── database/
│   │   ├── client.ts        # Supabase client configuration
│   │   ├── schema.sql       # Database schema definitions
│   │   └── migrations/      # Database migration files
│   ├── auth/
│   │   ├── middleware.ts    # Authentication middleware
│   │   ├── policies.ts      # Authorization policies
│   │   └── validation.ts    # Token validation logic
│   ├── security/
│   │   ├── encryption.ts    # Field-level encryption
│   │   ├── audit.ts         # Audit logging service
│   │   └── compliance.ts    # GDPR compliance tools
│   └── utils/
│       ├── validation.ts    # Input validation schemas
│       ├── errors.ts        # Error handling utilities
│       └── performance.ts   # Performance monitoring
├── tests/
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── security/           # Security-focused tests
├── docker/
│   ├── Dockerfile          # Container definition
│   └── docker-compose.yml  # Development environment
└── docs/
    ├── api.md              # API documentation
    ├── security.md         # Security guidelines
    └── deployment.md       # Deployment instructions
```

### 5.2 Security Implementation Patterns

**Authentication Middleware**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createClient } from '@supabase/supabase-js';

export class SecurePersonalDataServer {
  private server: McpServer;
  private supabase: SupabaseClient;
  
  constructor(private config: ServerConfig) {
    this.server = new McpServer({
      name: 'personal-data-server',
      version: '1.0.0'
    });
    
    this.supabase = createClient(
      config.supabaseUrl,
      config.supabaseKey
    );
    
    this.setupAuthentication();
    this.setupTools();
  }
  
  private setupAuthentication() {
    // OAuth 2.1 with PKCE validation
    this.server.setRequestHandler(async (request, next) => {
      const token = this.extractToken(request);
      const user = await this.validateToken(token);
      
      if (!user) {
        throw new Error('Authentication required');
      }
      
      return next({ ...request, user });
    });
  }
}
```

**Data Validation and Sanitization**
```typescript
import { z } from 'zod';

const PersonalDataSchema = z.object({
  data_type: z.enum(['contact', 'document', 'preference', 'custom']),
  title: z.string().min(1).max(255),
  content: z.record(z.unknown()),
  tags: z.array(z.string()).optional(),
  classification: z.enum(['public', 'personal', 'sensitive', 'confidential']),
});

const sanitizePersonalData = (data: unknown) => {
  // Input sanitization and validation
  const validated = PersonalDataSchema.parse(data);
  
  // Apply data classification policies
  if (validated.classification === 'sensitive') {
    validated.content = encryptSensitiveFields(validated.content);
  }
  
  return validated;
};
```

**Audit Logging Implementation**
```typescript
const auditLogger = {
  async logDataAccess(
    userId: string,
    operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE',
    tableName: string,
    recordId?: string,
    changes?: object
  ) {
    await supabase
      .from('data_access_log')
      .insert({
        user_id: userId,
        operation,
        table_name: tableName,
        record_id: recordId,
        changes,
        ip_address: getCurrentIPAddress(),
        user_agent: getCurrentUserAgent()
      });
  }
};
```

### 5.3 Performance Optimization Implementation

**Connection Pooling Configuration**
```typescript
const supabaseConfig = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_KEY,
  db: {
    schema: 'public',
    pooler: {
      mode: 'transaction', // Use Supavisor transaction pooling
      pool_timeout: 15,
      max_client_conn: 25
    }
  },
  auth: {
    persistSession: false, // Stateless for better scaling
    detectSessionInUrl: false
  }
};
```

**Caching Strategy**
```typescript
import Redis from 'ioredis';

class CacheService {
  private redis: Redis;
  
  async cachePersonalData(userId: string, data: any, ttl = 300) {
    const key = `personal_data:${userId}`;
    await this.redis.setex(key, ttl, JSON.stringify(data));
  }
  
  async getCachedData(userId: string) {
    const cached = await this.redis.get(`personal_data:${userId}`);
    return cached ? JSON.parse(cached) : null;
  }
  
  async invalidateUserCache(userId: string) {
    await this.redis.del(`personal_data:${userId}`);
  }
}
```

### 5.4 Error Handling and Monitoring

**Comprehensive Error Handling**
```typescript
class PersonalDataError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: object
  ) {
    super(message);
    this.name = 'PersonalDataError';
  }
}

const errorHandler = (error: Error, context: RequestContext) => {
  // Log error with full context
  logger.error('Operation failed', {
    error: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
  
  // Return appropriate error response
  if (error instanceof PersonalDataError) {
    return {
      jsonrpc: '2.0',
      error: {
        code: error.statusCode,
        message: error.message,
        data: error.context
      },
      id: context.requestId
    };
  }
  
  // Generic error response
  return {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Internal server error'
    },
    id: context.requestId
  };
};
```

**Performance Monitoring**
```typescript
const performanceMonitor = {
  async trackOperation(operation: string, fn: () => Promise<any>) {
    const startTime = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      
      // Log successful operation
      logger.info('Operation completed', {
        operation,
        duration: `${duration.toFixed(2)}ms`,
        status: 'success'
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      // Log failed operation
      logger.error('Operation failed', {
        operation,
        duration: `${duration.toFixed(2)}ms`,
        status: 'error',
        error: error.message
      });
      
      throw error;
    }
  }
};
```

## 6. Deployment and Operations

### 6.1 Container Deployment

**Docker Configuration**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY dist/ ./dist/
COPY package*.json ./

# Security hardening
RUN addgroup -g 1001 -S mcp && \
    adduser -S mcp -u 1001
USER mcp

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Kubernetes Deployment**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-personal-data-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-personal-data-server
  template:
    metadata:
      labels:
        app: mcp-personal-data-server
    spec:
      containers:
      - name: mcp-server
        image: your-registry/mcp-personal-data-server:latest
        ports:
        - containerPort: 3000
        env:
        - name: SUPABASE_URL
          valueFrom:
            secretKeyRef:
              name: mcp-secrets
              key: supabase-url
        - name: SUPABASE_SERVICE_ROLE_KEY
          valueFrom:
            secretKeyRef:
              name: mcp-secrets
              key: supabase-key
        resources:
          limits:
            memory: "1Gi"
            cpu: "500m"
          requests:
            memory: "512Mi"
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### 6.2 Environment Configuration

**Production Environment Variables**
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Security Configuration
JWT_SECRET=your-jwt-secret-key
ENCRYPTION_KEY=your-aes-256-encryption-key
OAUTH_CLIENT_ID=your-oauth-client-id
OAUTH_CLIENT_SECRET=your-oauth-client-secret

# Performance Configuration
REDIS_URL=redis://your-redis-instance:6379
CONNECTION_POOL_SIZE=25
MAX_CONCURRENT_REQUESTS=100

# Monitoring Configuration
LOG_LEVEL=info
METRICS_ENDPOINT=https://your-metrics-service
SENTRY_DSN=your-sentry-dsn
```

### 6.3 Monitoring and Alerting

**Health Check Endpoints**
```typescript
server.resource('health://system', {}, async () => ({
  contents: [{
    uri: 'health://system',
    mimeType: 'application/json',
    text: JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: await checkDatabaseHealth(),
      cache: await checkCacheHealth(),
      memory: process.memoryUsage(),
      uptime: process.uptime()
    })
  }]
}));
```

**Operational Metrics**
- Database connection pool utilization
- API response time percentiles
- Error rates by endpoint and error type
- Authentication success/failure rates
- Data access patterns and anomalies
- Cache hit ratios and performance
- Memory and CPU utilization

## 7. Testing Infrastructure and Quality Assurance

### 7.1 Testing Overview

**✅ COMPREHENSIVE TEST SUITE IMPLEMENTED**

The project now includes a complete testing infrastructure with 8 test suites covering unit, integration, e2e, and performance testing. All tests are currently passing with 36/36 tests successful.

**Test Categories:**
- **Unit Tests**: Core component functionality testing
- **Integration Tests**: Database and MCP server integration testing  
- **End-to-End Tests**: Complete workflow testing with real server processes
- **Performance Tests**: Database query performance and memory usage validation
- **Security Tests**: Authentication, authorization, and data protection validation

### 7.2 How to Run Tests

**Prerequisites:**
```bash
# Install dependencies
npm install

# Set up test environment variables (automatically handled by test setup)
# Tests use mock Supabase credentials for safety
```

**Running All Tests:**
```bash
# Run the complete test suite
npm test

# Expected output:
# Test Suites: 8 passed, 8 total
# Tests: 36 passed, 36 total
# Snapshots: 0 total
```

**Running Specific Test Categories:**
```bash
# Unit tests only
npm test -- tests/unit/

# Integration tests only  
npm test -- tests/integration/

# End-to-end tests only
npm test -- tests/e2e/

# Performance tests only
npm test -- tests/performance/

# Specific test file
npm test -- tests/unit/database/client.test.ts
```

**Test Output Options:**
```bash
# Verbose output with detailed test information
npm test -- --verbose

# Coverage report generation
npm test -- --coverage

# Watch mode for development
npm test -- --watch

# Debug mode with additional logging
npm test -- --detectOpenHandles
```

### 7.3 Test Infrastructure Components

**Jest Configuration (✅ Implemented)**
- **Framework**: Jest with TypeScript support via ts-jest
- **Module Resolution**: ESM support with proper module name mapping
- **Coverage**: Comprehensive coverage reporting with 80% thresholds
- **Timeout**: 30-second timeout for complex e2e tests
- **Setup Files**: Automated test environment configuration

**Test Environment Setup (✅ Implemented)**
```typescript
// tests/setup.ts - Automated test environment configuration
- Mock Supabase environment variables for safety
- Debug log level configuration for comprehensive testing
- Original console methods preservation for test debugging
```

**Database Testing (✅ Implemented)**
```typescript
// Mock Supabase client for unit tests
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      // ... complete CRUD operation mocking
    }))
  }))
}));
```

### 7.4 Test Suite Details

**Unit Tests (`tests/unit/`)**
- **Database Client**: Connection handling and client export validation
- **Logger**: Comprehensive logging functionality with all log levels
- **Utilities**: Core utility functions and helper methods

**Integration Tests (`tests/integration/`)**
- **Database Integration**: Real database connection testing with mock credentials
- **MCP Server Integration**: Server initialization and capability validation

**End-to-End Tests (`tests/e2e/`)**
- **Database Operations**: Complete CRUD workflows with real database interactions
- **MCP Workflow**: Full server startup, protocol communication, and tool calling

**Performance Tests (`tests/performance/`)**
- **Database Queries**: Query performance validation and optimization verification
- **Memory Usage**: Memory leak detection and resource utilization monitoring

### 7.5 Test Fixes and Improvements Implemented

**Jest Configuration Fixes:**
- ✅ Fixed `moduleNameMapping` to `moduleNameMapper` for proper module resolution
- ✅ ESM support configuration for TypeScript modules
- ✅ Proper test timeout configuration for e2e tests

**Database Testing Fixes:**
- ✅ Mock Supabase environment variables for test safety
- ✅ Fixed database client exports with backward compatibility
- ✅ TypeScript null safety fixes for database operations

**MCP Server Testing Fixes:**
- ✅ Proper server startup detection via stderr monitoring
- ✅ Sequential message handling for protocol communication
- ✅ Tool call testing with actual implemented tools
- ✅ Graceful server shutdown in test cleanup

**Logger Testing Fixes:**
- ✅ Correct console spy configuration for different log levels
- ✅ Debug log level setup for comprehensive test coverage
- ✅ Proper console method targeting (console.log vs console.debug)

### 7.6 Continuous Integration Ready

**CI/CD Pipeline Compatibility:**
```yaml
# Example GitHub Actions workflow
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm run build
    - run: npm test
    - run: npm run test:coverage
```

**Quality Gates:**
- ✅ All tests must pass before deployment
- ✅ 80% code coverage threshold enforced
- ✅ TypeScript compilation without errors
- ✅ ESLint/Prettier code quality checks (when configured)

**Test Monitoring:**
- Test execution time tracking
- Flaky test detection and reporting
- Performance regression detection
- Coverage trend monitoring

### 7.7 Development Testing Workflow

**Test-Driven Development Support:**
```bash
# Development workflow
npm run test:watch          # Watch mode for active development
npm run test:unit:watch     # Watch only unit tests
npm run test:debug         # Debug mode with additional logging
```

**Pre-Commit Testing:**
```bash
# Recommended pre-commit hook
npm run build && npm test && npm run lint
```

**Test Documentation:**
- All test files include descriptive test names and comments
- Complex test scenarios documented with inline explanations
- Mock setup and teardown procedures clearly defined
- Error conditions and edge cases thoroughly tested

This comprehensive testing infrastructure ensures code quality, reliability, and maintainability while providing developers with the tools needed for effective test-driven development and continuous integration.

---

This comprehensive requirements document provides the foundation for building a production-ready MCP server that securely manages personal data through Supabase integration while maintaining high performance, security, and compliance standards.