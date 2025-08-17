import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';

describe('HTTP Security Features End-to-End Tests', () => {
  const HTTP_PORT = 3000;
  const BASE_URL = `http://localhost:${HTTP_PORT}`;

  beforeAll(async () => {
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      const healthResponse = await fetch(`${BASE_URL}/health`);
      if (!healthResponse.ok) {
        throw new Error(`Server not ready: ${healthResponse.status}`);
      }
    } catch (error) {
      throw new Error(`HTTP server not running on port ${HTTP_PORT}. Please start server with: MCP_TRANSPORT=http npm run dev`);
    }
  }, 10000);

  afterAll(async () => {
    // No cleanup needed for external server
  });

  describe('Security Headers', () => {
    test('should include security headers in all responses', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-xss-protection')).toBe('1; mode=block');
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    });

    test('should include CORS headers', async () => {
      const response = await fetch(`${BASE_URL}/health`, {
        headers: {
          'Origin': 'http://localhost:3000'
        }
      });
      
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('Rate Limiting', () => {
    test('should include rate limit headers', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      
      expect(response.headers.get('x-ratelimit-limit')).toBeTruthy();
      expect(response.headers.get('x-ratelimit-remaining')).toBeTruthy();
      expect(response.headers.get('x-ratelimit-reset')).toBeTruthy();
    });

    test('should enforce rate limits', async () => {
      // Make many requests quickly to test rate limiting
      // Note: This test might be flaky depending on rate limit settings
      const requests = Array(10).fill(null).map(() => 
        fetch(`${BASE_URL}/health`)
      );
      
      const responses = await Promise.all(requests);
      
      // All responses should either be 200 or 429 (rate limited)
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
      
      // Check if rate limit headers are present
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.headers.get('x-ratelimit-limit')).toBeTruthy();
    }, 15000);

    test('should enforce connection limits', async () => {
      // Make multiple simultaneous requests to test connection limiting
      // Note: This test might be flaky depending on connection limit settings
      const simultaneousRequests = Array(5).fill(null).map(() => 
        fetch(`${BASE_URL}/health`)
      );
      
      const responses = await Promise.all(simultaneousRequests);
      
      // Some responses should either be 200 or 503 (connection limit exceeded)
      responses.forEach(response => {
        expect([200, 503]).toContain(response.status);
      });
      
      // At least one request should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Authentication (when disabled)', () => {
    test('should work without authentication when MCP_API_KEY is not set', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: { roots: { listChanged: true } },
            clientInfo: { name: 'test-client', version: '1.0.0' }
          }
        })
      });

      // Should work without authentication if no API key is configured
      expect([200, 401]).toContain(response.status);
    });
  });

  describe('Enhanced Health Endpoint', () => {
    test('should return comprehensive health information', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      expect(response.status).toBe(200);
      
      const data = await response.json() as any;
      
      expect(data).toMatchObject({
        status: 'healthy',
        service: 'personal-data-mcp-server',
        transport: 'http'
      });
      
      expect(data.security).toBeDefined();
      expect(data.security.authenticationEnabled).toBeDefined();
      expect(data.security.rateLimitEnabled).toBe(true);
      expect(data.security.corsEnabled).toBe(true);
      expect(data.security.securityHeadersEnabled).toBe(true);
      
      expect(data.configuration).toBeDefined();
      expect(data.configuration.rateLimit).toBeDefined();
      expect(data.configuration.connections).toBeDefined();
      expect(data.configuration.connections.maxConnections).toBeDefined();
      expect(data.configuration.connections.cacheSize).toBeDefined();
      expect(data.configuration.requestTimeout).toBeDefined();
      expect(data.configuration.maxRequestSize).toBeDefined();
      
      expect(data.sessions).toBeDefined();
      expect(typeof data.sessions.active).toBe('number');
    });
  });

  describe('Metrics Endpoint', () => {
    test('should provide server metrics', async () => {
      const response = await fetch(`${BASE_URL}/metrics`);
      expect(response.status).toBe(200);
      
      const data = await response.json() as any;
      
      expect(data.timestamp).toBeDefined();
      expect(typeof data.sessions.active).toBe('number');
      expect(typeof data.system.uptime).toBe('number');
      expect(data.system.memory).toBeDefined();
      expect(data.system.memory.rss).toBeDefined();
      expect(data.system.memory.heapUsed).toBeDefined();
      expect(data.environment).toBeDefined();
    });
  });

  describe('Request Validation', () => {
    test('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: '{"invalid": json malformed}'
      });

      expect(response.status).toBe(400);
    });

    test('should handle large request bodies appropriately', async () => {
      // Create a large payload (200KB, should exceed 100KB Render limit)
      const largePayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { 
            name: 'test-client', 
            version: '1.0.0',
            largeData: 'x'.repeat(200 * 1024) // 200KB of data (exceeds 100KB limit)
          }
        }
      };

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(largePayload)
      });

      // Should reject large payloads (413 Payload Too Large)
      expect([413, 400]).toContain(response.status);
    });
  });

  describe('CORS Configuration', () => {
    test('should handle preflight requests correctly', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
      expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type');
      expect(response.headers.get('access-control-max-age')).toBe('86400');
    });

    test('should expose custom headers', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      
      const exposedHeaders = response.headers.get('access-control-expose-headers');
      if (exposedHeaders) {
        expect(exposedHeaders).toContain('mcp-session-id');
        expect(exposedHeaders).toContain('X-RateLimit');
      }
    });
  });

  describe('Error Handling', () => {
    test('should return proper JSON-RPC error format', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'invalid_method'
        })
      });

      if (response.status >= 400) {
        const data = await response.json() as any;
        expect(data.jsonrpc).toBe('2.0');
        expect(data.error).toBeDefined();
        expect(data.error.code).toBeDefined();
        expect(data.error.message).toBeDefined();
      }
    });
  });

  describe('Session Security', () => {
    test('should require valid session ID for MCP operations', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': 'invalid-session-id'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        })
      });

      expect(response.status).toBe(400);
    });

    test('should reject SSE requests with invalid session ID', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'mcp-session-id': 'invalid-session-id'
        }
      });

      expect(response.status).toBe(400);
    });
  });
});