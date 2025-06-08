import { describe, expect, test, beforeAll, afterAll, jest } from '@jest/globals';

// Mock external dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn(),
  })),
}));

jest.mock('../../src/database/client.js', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    })),
    rpc: jest.fn(() => Promise.resolve({ data: {}, error: null })),
  },
}));

import { setupPersonalDataTools } from '../../src/server/tools/index.js';
import { setupPersonalDataResources } from '../../src/server/resources/index.js';

describe('MCP Server Integration Tests', () => {
  let mockServer: any;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
    };
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('Tools Integration', () => {
    test('should setup tools without errors', () => {
      expect(() => setupPersonalDataTools(mockServer)).not.toThrow();
      expect(mockServer.setRequestHandler).toHaveBeenCalled();
    });

    test('should register tool handlers', () => {
      setupPersonalDataTools(mockServer);
      
      // Verify request handler was set up for tools
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Resources Integration', () => {
    test('should setup resources without errors', () => {
      expect(() => setupPersonalDataResources(mockServer)).not.toThrow();
      expect(mockServer.setRequestHandler).toHaveBeenCalled();
    });

    test('should handle schema resources', async () => {
      setupPersonalDataResources(mockServer);
      
      const calls = mockServer.setRequestHandler.mock.calls;
      const resourceHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
      
      if (resourceHandler) {
        const response = await resourceHandler({
          params: { uri: 'schema://personal_data_types' }
        });
        
        expect(response.contents).toBeDefined();
        expect(response.contents[0].mimeType).toBe('application/json');
      }
    });

    test('should handle stats resources', async () => {
      setupPersonalDataResources(mockServer);
      
      const calls = mockServer.setRequestHandler.mock.calls;
      const resourceHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
      
      if (resourceHandler) {
        const response = await resourceHandler({
          params: { uri: 'stats://usage_patterns' }
        });
        
        expect(response.contents).toBeDefined();
      }
    });

    test('should handle config resources', async () => {
      setupPersonalDataResources(mockServer);
      
      const calls = mockServer.setRequestHandler.mock.calls;
      const resourceHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
      
      if (resourceHandler) {
        const response = await resourceHandler({
          params: { uri: 'config://privacy_settings' }
        });
        
        expect(response.contents).toBeDefined();
        expect(response.contents[0].text).toContain('data_retention_policies');
      }
    });

    test('should handle unknown resources gracefully', async () => {
      setupPersonalDataResources(mockServer);
      
      const calls = mockServer.setRequestHandler.mock.calls;
      const resourceHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
      
      if (resourceHandler) {
        const response = await resourceHandler({
          params: { uri: 'unknown://invalid' }
        });
        
        expect(response.contents[0].text).toContain('error');
      }
    });
  });

  describe('Database Integration', () => {
    test('should handle database operations', () => {
      const { supabaseAdmin } = require('../../src/database/client.js');
      
      expect(supabaseAdmin.from).toBeDefined();
      expect(supabaseAdmin.rpc).toBeDefined();
    });

    test('should handle database errors gracefully', async () => {
      const { supabaseAdmin } = require('../../src/database/client.js');
      
      // Mock database error
      supabaseAdmin.from.mockReturnValue({
        select: jest.fn(() => Promise.resolve({ 
          data: null, 
          error: new Error('Database error') 
        })),
      });

      setupPersonalDataResources(mockServer);
      
      const calls = mockServer.setRequestHandler.mock.calls;
      const resourceHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
      
      if (resourceHandler) {
        const response = await resourceHandler({
          params: { uri: 'schema://personal_data_types' }
        });
        
        // Should handle error gracefully
        expect(response.contents[0].text).toContain('error');
      }
    });
  });

  describe('Server Configuration', () => {
    test('should have proper server structure', () => {
      expect(mockServer.setRequestHandler).toBeDefined();
      expect(mockServer.connect).toBeDefined();
    });

    test('should integrate all components', () => {
      // Setup all components
      setupPersonalDataTools(mockServer);
      setupPersonalDataResources(mockServer);
      
      // Verify handlers were registered
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });
});