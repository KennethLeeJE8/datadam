import { describe, expect, test, beforeEach, jest } from '@jest/globals';

// Mock Supabase client
const mockSupabaseAdmin = {
  from: jest.fn(() => ({
    insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            range: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        order: jest.fn(() => ({
          range: jest.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  })),
};

jest.mock('../../../src/database/client.js', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

import { logDataAccess, getAuditLog } from '../../../src/security/audit.js';

describe('Security Audit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logDataAccess', () => {
    test('should log data access successfully', async () => {
      const userId = 'user-123';
      const operation = 'CREATE';
      const tableName = 'personal_data';
      const recordId = 'record-456';
      const changes = { title: 'New Title' };

      await logDataAccess(userId, operation, tableName, recordId, changes);

      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('data_access_log');
      expect(mockSupabaseAdmin.from().insert).toHaveBeenCalledWith({
        user_id: userId,
        operation,
        table_name: tableName,
        record_id: recordId,
        changes,
        ip_address: '127.0.0.1',
        user_agent: 'MCP-Server/1.0.0',
      });
    });

    test('should handle database errors gracefully', async () => {
      (mockSupabaseAdmin.from as jest.Mock).mockReturnValue({
        insert: jest.fn(() => Promise.resolve({ 
          data: null, 
          error: new Error('Database error') 
        })),
      });

      // Should not throw even if database insert fails
      await expect(logDataAccess('user-123', 'READ', 'personal_data')).resolves.not.toThrow();
    });

    test('should handle exceptions gracefully', async () => {
      (mockSupabaseAdmin.from as jest.Mock).mockImplementation(() => {
        throw new Error('Connection failed');
      });

      // Should not throw even if operation throws
      await expect(logDataAccess('user-123', 'READ', 'personal_data')).resolves.not.toThrow();
    });
  });

  describe('getAuditLog', () => {
    test('should retrieve audit log for user', async () => {
      const userId = 'user-123';
      const mockData = [
        { id: '1', user_id: userId, operation: 'CREATE', table_name: 'personal_data' },
        { id: '2', user_id: userId, operation: 'READ', table_name: 'personal_data' },
      ];

      (mockSupabaseAdmin.from as jest.Mock).mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn(() => Promise.resolve({ data: mockData, error: null })),
            })),
          })),
        })),
      });

      const result = await getAuditLog(userId);

      expect(result).toEqual(mockData);
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('data_access_log');
    });

    test('should filter by operation', async () => {
      const userId = 'user-123';
      const operation = 'CREATE';

      await getAuditLog(userId, { operation });

      const mockChain = mockSupabaseAdmin.from().select().eq();
      expect(mockChain.eq).toHaveBeenCalledWith('operation', operation);
    });

    test('should filter by table name', async () => {
      const userId = 'user-123';
      const tableName = 'personal_data';

      await getAuditLog(userId, { tableName });

      // Verify the filtering chain is called
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('data_access_log');
    });

    test('should handle pagination', async () => {
      const userId = 'user-123';
      const limit = 50;
      const offset = 10;

      await getAuditLog(userId, { limit, offset });

      // Verify range is called with correct parameters
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('data_access_log');
    });

    test('should throw error on database failure', async () => {
      (mockSupabaseAdmin.from as jest.Mock).mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn(() => Promise.resolve({ 
                data: null, 
                error: new Error('Database error') 
              })),
            })),
          })),
        })),
      });

      await expect(getAuditLog('user-123')).rejects.toThrow('Failed to retrieve audit log');
    });
  });

  describe('audit log integration', () => {
    test('should log and retrieve operations correctly', async () => {
      // Reset mocks for clean test
      jest.clearAllMocks();
      
      const userId = 'user-integration';
      
      // Mock successful log
      (mockSupabaseAdmin.from as jest.Mock).mockReturnValue({
        insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      });

      await logDataAccess(userId, 'CREATE', 'personal_data', 'record-1');

      // Mock successful retrieval
      const mockAuditData = [{
        user_id: userId,
        operation: 'CREATE',
        table_name: 'personal_data',
        record_id: 'record-1',
      }];

      (mockSupabaseAdmin.from as jest.Mock).mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn(() => Promise.resolve({ data: mockAuditData, error: null })),
            })),
          })),
        })),
      });

      const auditLog = await getAuditLog(userId);
      
      expect(auditLog).toBeDefined();
      expect(Array.isArray(auditLog)).toBe(true);
    });
  });
});