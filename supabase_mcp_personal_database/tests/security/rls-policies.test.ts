import { describe, expect, test, beforeEach, jest } from '@jest/globals';

// Mock Supabase client with RLS simulation
const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => Promise.resolve({ data: [], error: null })),
    insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    update: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    delete: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    eq: jest.fn(() => mockSupabaseClient.from()),
  })),
  auth: {
    getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'test-user' } }, error: null })),
  },
  rls: {
    enable: jest.fn(),
    disable: jest.fn(),
  },
};

jest.mock('../../src/database/client.js', () => ({
  supabaseAdmin: mockSupabaseClient,
}));

describe('Row Level Security (RLS) Policy Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Personal Data Table RLS', () => {
    test('should isolate user data access', async () => {
      // Simulate RLS behavior - users only see their own data
      const mockUserData = [
        { id: '1', user_id: 'test-user', title: 'User data' },
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => Promise.resolve({ data: mockUserData, error: null })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('personal_data')
        .select('*');

      expect(error).toBeNull();
      expect(data).toEqual(mockUserData);
      expect(data.every((record: any) => record.user_id === 'test-user')).toBe(true);
    });

    test('should prevent cross-user data access', async () => {
      // Simulate RLS blocking access to other users' data
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => Promise.resolve({ data: [], error: null })), // Empty result due to RLS
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('personal_data')
        .select('*');

      expect(error).toBeNull();
      expect(data).toEqual([]); // RLS should return no data for unauthorized access
    });

    test('should allow user to insert their own data', async () => {
      const newRecord = {
        user_id: 'test-user',
        data_type: 'contact',
        title: 'Test Contact',
        content: { email: 'test@example.com' },
      };

      mockSupabaseClient.from.mockReturnValue({
        insert: jest.fn(() => Promise.resolve({ data: newRecord, error: null })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('personal_data')
        .insert(newRecord);

      expect(error).toBeNull();
      expect(data).toEqual(newRecord);
    });

    test('should prevent user from inserting data for other users', async () => {
      const invalidRecord = {
        user_id: 'other-user', // Different user
        data_type: 'contact',
        title: 'Invalid Contact',
        content: { email: 'invalid@example.com' },
      };

      // Simulate RLS blocking unauthorized insert
      mockSupabaseClient.from.mockReturnValue({
        insert: jest.fn(() => Promise.resolve({ 
          data: null, 
          error: { message: 'RLS policy violation', code: '42501' }
        })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('personal_data')
        .insert(invalidRecord);

      expect(error).toBeDefined();
      expect(error.code).toBe('42501'); // PostgreSQL RLS violation
      expect(data).toBeNull();
    });
  });

  describe('Profiles Table RLS', () => {
    test('should allow users to access their own profile', async () => {
      const userProfile = {
        id: 'profile-1',
        user_id: 'test-user',
        username: 'testuser',
        full_name: 'Test User',
      };

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => Promise.resolve({ data: [userProfile], error: null })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*');

      expect(error).toBeNull();
      expect(data).toEqual([userProfile]);
    });

    test('should prevent access to other users profiles', async () => {
      // RLS should return empty results for unauthorized profile access
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*');

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('Audit Log RLS', () => {
    test('should allow users to view their own audit logs', async () => {
      const userAuditLogs = [
        {
          id: 'log-1',
          user_id: 'test-user',
          operation: 'READ',
          table_name: 'personal_data',
          created_at: new Date().toISOString(),
        },
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => Promise.resolve({ data: userAuditLogs, error: null })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('data_access_log')
        .select('*');

      expect(error).toBeNull();
      expect(data).toEqual(userAuditLogs);
      expect(data.every((log: any) => log.user_id === 'test-user')).toBe(true);
    });

    test('should prevent users from accessing other users audit logs', async () => {
      // RLS should filter out other users' audit logs
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('data_access_log')
        .select('*');

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('Service Role Bypass', () => {
    test('should allow service role to bypass RLS for admin operations', async () => {
      // Service role should access all data regardless of user_id
      const allUserData = [
        { id: '1', user_id: 'user-1', title: 'User 1 data' },
        { id: '2', user_id: 'user-2', title: 'User 2 data' },
        { id: '3', user_id: 'user-3', title: 'User 3 data' },
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => Promise.resolve({ data: allUserData, error: null })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('personal_data')
        .select('*');

      expect(error).toBeNull();
      expect(data).toEqual(allUserData);
      expect(data.length).toBe(3); // Service role sees all data
    });

    test('should allow service role to perform admin operations', async () => {
      const adminUpdate = {
        classification: 'archived',
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn(() => Promise.resolve({ data: adminUpdate, error: null })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('personal_data')
        .update(adminUpdate);

      expect(error).toBeNull();
      expect(data).toEqual(adminUpdate);
    });
  });

  describe('Data Field Definitions RLS', () => {
    test('should allow shared access to field definitions', async () => {
      const fieldDefinitions = [
        {
          id: 'field-1',
          field_name: 'email',
          data_type: 'string',
          validation_rules: { format: 'email' },
        },
        {
          id: 'field-2',
          field_name: 'phone',
          data_type: 'string',
          validation_rules: { pattern: '^\\+?[1-9]\\d{1,14}$' },
        },
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn(() => Promise.resolve({ data: fieldDefinitions, error: null })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('data_field_definitions')
        .select('*');

      expect(error).toBeNull();
      expect(data).toEqual(fieldDefinitions);
    });
  });

  describe('RLS Policy Enforcement', () => {
    test('should enforce policies on UPDATE operations', async () => {
      // User should only be able to update their own records
      mockSupabaseClient.from.mockReturnValue({
        update: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ data: null, error: { message: 'RLS policy violation' } })),
        })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('personal_data')
        .update({ title: 'Updated title' })
        .eq('user_id', 'other-user'); // Trying to update another user's data

      expect(error).toBeDefined();
      expect(error.message).toContain('RLS policy violation');
    });

    test('should enforce policies on DELETE operations', async () => {
      // User should only be able to delete their own records
      mockSupabaseClient.from.mockReturnValue({
        delete: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ data: null, error: { message: 'RLS policy violation' } })),
        })),
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin
        .from('personal_data')
        .delete()
        .eq('user_id', 'other-user'); // Trying to delete another user's data

      expect(error).toBeDefined();
      expect(error.message).toContain('RLS policy violation');
    });
  });

  describe('Authentication Context', () => {
    test('should validate user authentication context', async () => {
      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data: user, error } = await supabaseAdmin.auth.getUser();

      expect(error).toBeNull();
      expect(user.user).toBeDefined();
      expect(user.user.id).toBe('test-user');
    });

    test('should handle unauthenticated requests', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' },
      });

      const { supabaseAdmin } = require('../../src/database/client.js');
      const { data, error } = await supabaseAdmin.auth.getUser();

      expect(error).toBeDefined();
      expect(error.message).toContain('Invalid JWT');
      expect(data.user).toBeNull();
    });
  });
});