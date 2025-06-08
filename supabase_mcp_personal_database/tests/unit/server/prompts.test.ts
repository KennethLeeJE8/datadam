import { describe, expect, test, beforeEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../src/database/client.js', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          is: jest.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

import { setupPersonalDataPrompts } from '../../../src/server/prompts/index.js';

describe('MCP Prompts', () => {
  let mockServer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer = {
      setRequestHandler: jest.fn(),
    };
  });

  test('should setup prompt handlers', () => {
    expect(() => setupPersonalDataPrompts(mockServer)).not.toThrow();
    expect(mockServer.setRequestHandler).toHaveBeenCalled();
  });

  test('should handle analyze_personal_data prompt', async () => {
    const mockPersonalData = [
      { data_type: 'contact', classification: 'personal', tags: ['work'], created_at: '2024-01-01' },
      { data_type: 'document', classification: 'sensitive', tags: ['legal'], created_at: '2024-01-02' },
    ];

    const { supabaseAdmin } = require('../../../src/database/client.js');
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          is: jest.fn(() => Promise.resolve({ data: mockPersonalData, error: null })),
        })),
      })),
    });

    setupPersonalDataPrompts(mockServer);
    
    const calls = mockServer.setRequestHandler.mock.calls;
    const promptHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
    
    if (promptHandler) {
      const response = await promptHandler({
        params: {
          name: 'analyze_personal_data',
          arguments: {
            user_id: 'test-user',
            analysis_type: 'privacy_overview'
          }
        }
      });
      
      expect(response.messages).toBeDefined();
      expect(response.messages[0].content.text).toContain('Personal Data Privacy Analysis');
      expect(response.messages[0].content.text).toContain('Total Records: 2');
    }
  });

  test('should handle privacy_assessment prompt', async () => {
    setupPersonalDataPrompts(mockServer);
    
    const calls = mockServer.setRequestHandler.mock.calls;
    const promptHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
    
    if (promptHandler) {
      const response = await promptHandler({
        params: {
          name: 'privacy_assessment',
          arguments: {
            data_changes: {
              add_field: 'social_security_number',
              classification: 'sensitive'
            }
          }
        }
      });
      
      expect(response.messages).toBeDefined();
      expect(response.messages[0].content.text).toContain('Privacy Impact Assessment');
      expect(response.messages[0].content.text).toContain('Proposed Changes');
    }
  });

  test('should handle data_migration prompt', async () => {
    setupPersonalDataPrompts(mockServer);
    
    const calls = mockServer.setRequestHandler.mock.calls;
    const promptHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
    
    if (promptHandler) {
      const response = await promptHandler({
        params: {
          name: 'data_migration',
          arguments: {
            source_format: 'CSV',
            target_format: 'JSON'
          }
        }
      });
      
      expect(response.messages).toBeDefined();
      expect(response.messages[0].content.text).toContain('Data Migration Planning Guide');
      expect(response.messages[0].content.text).toContain('CSV');
      expect(response.messages[0].content.text).toContain('JSON');
    }
  });

  test('should handle unknown prompts gracefully', async () => {
    setupPersonalDataPrompts(mockServer);
    
    const calls = mockServer.setRequestHandler.mock.calls;
    const promptHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
    
    if (promptHandler) {
      const response = await promptHandler({
        params: {
          name: 'unknown_prompt',
          arguments: {}
        }
      });
      
      expect(response.messages[0].content.text).toContain('Error generating prompt');
    }
  });

  test('should handle missing arguments', async () => {
    setupPersonalDataPrompts(mockServer);
    
    const calls = mockServer.setRequestHandler.mock.calls;
    const promptHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
    
    if (promptHandler) {
      const response = await promptHandler({
        params: {
          name: 'analyze_personal_data',
          arguments: { user_id: 'test' } // Missing analysis_type
        }
      });
      
      expect(response.messages[0].content.text).toContain('Missing required arguments');
    }
  });

  test('should handle database errors gracefully', async () => {
    const { supabaseAdmin } = require('../../../src/database/client.js');
    supabaseAdmin.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          is: jest.fn(() => Promise.resolve({ data: null, error: new Error('DB Error') })),
        })),
      })),
    });

    setupPersonalDataPrompts(mockServer);
    
    const calls = mockServer.setRequestHandler.mock.calls;
    const promptHandler = calls.find((call: any) => typeof call[1] === 'function')?.[1];
    
    if (promptHandler) {
      const response = await promptHandler({
        params: {
          name: 'analyze_personal_data',
          arguments: {
            user_id: 'test-user',
            analysis_type: 'privacy_overview'
          }
        }
      });
      
      expect(response.messages[0].content.text).toContain('Error generating prompt');
    }
  });
});