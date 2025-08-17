import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';

describe('HTTP Transport End-to-End Tests', () => {
  let serverProcess: ChildProcess;
  const HTTP_PORT = 3000; // Use existing server
  const BASE_URL = `http://localhost:${HTTP_PORT}`;

  beforeAll(async () => {
    // Wait a moment for any existing server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test if server is running
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
    // No need to kill server since we're using external server
  });

  describe('Health Endpoint', () => {
    test('should respond to health check', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      expect(response.status).toBe(200);
      
      const data = await response.json() as any;
      expect(data).toMatchObject({
        status: 'healthy',
        service: 'personal-data-mcp-server',
        transport: 'http'
      });
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('MCP Protocol over HTTP', () => {
    let sessionId: string;

    test('should handle MCP initialization', async () => {
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
            capabilities: {
              roots: { listChanged: true }
            },
            clientInfo: {
              name: 'test-client',
              version: '1.0.0'
            }
          }
        })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      
      // Extract session ID
      sessionId = response.headers.get('mcp-session-id') || '';
      expect(sessionId).toBeTruthy();
      expect(sessionId).toMatch(/^[0-9a-f-]{36}$/); // UUID format

      const responseText = await response.text();
      expect(responseText).toContain('event: message');
      expect(responseText).toContain('"result"');
      expect(responseText).toContain('"protocolVersion":"2024-11-05"');
      expect(responseText).toContain('"name":"personal-data-server"');
    });

    test('should list available tools', async () => {
      expect(sessionId).toBeTruthy();

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list'
        })
      });

      expect(response.status).toBe(200);
      
      const responseText = await response.text();
      expect(responseText).toContain('event: message');
      
      // Parse SSE response
      const dataMatch = responseText.match(/data: (.+)/);
      expect(dataMatch).toBeTruthy();
      
      const data = JSON.parse(dataMatch![1]);
      expect(data.result.tools).toBeInstanceOf(Array);
      expect(data.result.tools).toHaveLength(6);
      
      // Check for expected tools
      const toolNames = data.result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('extract_personal_data');
      expect(toolNames).toContain('create_personal_data');
      expect(toolNames).toContain('update_personal_data');
      expect(toolNames).toContain('delete_personal_data');
      expect(toolNames).toContain('search_personal_data');
      expect(toolNames).toContain('add_personal_data_field');
    });

    test('should list available resources', async () => {
      expect(sessionId).toBeTruthy();

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'resources/list'
        })
      });

      expect(response.status).toBe(200);
      
      const responseText = await response.text();
      const dataMatch = responseText.match(/data: (.+)/);
      const data = JSON.parse(dataMatch![1]);
      
      expect(data.result.resources).toBeInstanceOf(Array);
      expect(data.result.resources).toHaveLength(3);
      
      const resourceUris = data.result.resources.map((resource: any) => resource.uri);
      expect(resourceUris).toContain('schema://personal_data_types');
      expect(resourceUris).toContain('stats://usage_patterns');
      expect(resourceUris).toContain('config://privacy_settings');
    });

    test('should handle create_personal_data tool call with valid UUID', async () => {
      expect(sessionId).toBeTruthy();

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'create_personal_data',
            arguments: {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              data_type: 'contact',
              title: 'Test Contact HTTP',
              content: {
                name: 'Jane Doe',
                email: 'jane@example.com',
                phone: '+1234567890'
              },
              tags: ['test', 'http'],
              classification: 'personal'
            }
          }
        })
      });

      expect(response.status).toBe(200);
      
      const responseText = await response.text();
      const dataMatch = responseText.match(/data: (.+)/);
      const data = JSON.parse(dataMatch![1]);
      
      expect(data.result).toBeDefined();
      expect(data.result.content).toBeInstanceOf(Array);
      expect(data.result.content[0].text).toContain('success');
      expect(data.result.content[0].text).toContain('Test Contact HTTP');
    });

    test('should handle delete_personal_data tool call', async () => {
      expect(sessionId).toBeTruthy();

      // First create a record to delete
      const createResponse = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 41,
          method: 'tools/call',
          params: {
            name: 'create_personal_data',
            arguments: {
              user_id: '123e4567-e89b-12d3-a456-426614174000',
              data_type: 'contact',
              title: 'Test Contact to Delete',
              content: { name: 'Delete Me' },
              classification: 'personal'
            }
          }
        })
      });

      const createText = await createResponse.text();
      const createMatch = createText.match(/data: (.+)/);
      const createData = JSON.parse(createMatch![1]);
      
      // Extract record ID from successful creation
      let recordId: string = '';
      if (createData.result.content[0].text.includes('success')) {
        const recordMatch = createData.result.content[0].text.match(/"id":\s*"([^"]+)"/);
        if (recordMatch) {
          recordId = recordMatch[1];
        }
      }

      if (recordId) {
        // Now delete the record
        const deleteResponse = await fetch(`${BASE_URL}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'mcp-session-id': sessionId
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 42,
            method: 'tools/call',
            params: {
              name: 'delete_personal_data',
              arguments: {
                record_ids: [recordId],
                hard_delete: false
              }
            }
          })
        });

        expect(deleteResponse.status).toBe(200);
        
        const deleteText = await deleteResponse.text();
        const deleteMatch = deleteText.match(/data: (.+)/);
        const deleteData = JSON.parse(deleteMatch![1]);
        
        expect(deleteData.result).toBeDefined();
        expect(deleteData.result.content[0].text).toContain('success');
      } else {
        // If we can't create a record (e.g., in degraded mode), just test the delete endpoint
        const deleteResponse = await fetch(`${BASE_URL}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'mcp-session-id': sessionId
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 42,
            method: 'tools/call',
            params: {
              name: 'delete_personal_data',
              arguments: {
                record_ids: ['123e4567-e89b-12d3-a456-426614174001'],
                hard_delete: false
              }
            }
          })
        });

        expect(deleteResponse.status).toBe(200);
        // Should handle gracefully even if record doesn't exist
      }
    });

    test('should handle graceful degradation for invalid user_id', async () => {
      expect(sessionId).toBeTruthy();

      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': sessionId
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'create_personal_data',
            arguments: {
              user_id: 'invalid-user-id',
              data_type: 'contact',
              title: 'Test Contact Invalid',
              content: { name: 'Test User' },
              classification: 'personal'
            }
          }
        })
      });

      expect(response.status).toBe(200);
      
      const responseText = await response.text();
      const dataMatch = responseText.match(/data: (.+)/);
      const data = JSON.parse(dataMatch![1]);
      
      expect(data.result).toBeDefined();
      expect(data.result.content[0].text).toContain('warning');
      expect(data.result.content[0].text).toContain('fallback');
    });

    test('should reject requests without session ID', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/list'
        })
      });

      expect(response.status).toBe(400);
      
      const data = await response.json() as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32000);
      expect(data.error.message).toContain('No valid session ID');
    });

    test('should reject requests with invalid session ID', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': 'invalid-session-id'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/list'
        })
      });

      expect(response.status).toBe(400);
      
      const data = await response.json() as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32000);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: '{"invalid": json}'
      });

      expect(response.status).toBe(400);
    });

    test('should handle missing Content-Type', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 8,
          method: 'initialize',
          params: {}
        })
      });

      // Should still work but might have different behavior
      expect(response.status).toBeLessThan(500);
    });

    test('should handle CORS preflight requests', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('Session Management', () => {
    test('should generate unique session IDs', async () => {
      // Create two sessions
      const response1 = await fetch(`${BASE_URL}/mcp`, {
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
            capabilities: {},
            clientInfo: { name: 'test1', version: '1.0.0' }
          }
        })
      });

      const response2 = await fetch(`${BASE_URL}/mcp`, {
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
            capabilities: {},
            clientInfo: { name: 'test2', version: '1.0.0' }
          }
        })
      });

      const sessionId1 = response1.headers.get('mcp-session-id');
      const sessionId2 = response2.headers.get('mcp-session-id');

      expect(sessionId1).toBeTruthy();
      expect(sessionId2).toBeTruthy();
      expect(sessionId1).not.toBe(sessionId2);
    });
  });
});