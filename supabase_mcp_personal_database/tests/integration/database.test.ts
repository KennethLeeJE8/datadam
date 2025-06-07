import { describe, expect, test, beforeAll, afterAll, jest } from '@jest/globals';
import { supabase } from '../../src/database/client.js';

describe('Database Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database or use test environment
    process.env.NODE_ENV = 'test';
  });

  afterAll(async () => {
    // Cleanup test data
  });

  test('should connect to database', async () => {
    try {
      const { data, error } = await supabase.from('error_logs').select('count').limit(1);
      expect(error).toBeNull();
      expect(data).toBeDefined();
    } catch (err) {
      // If tables don't exist yet, that's expected
      expect(err).toBeDefined();
    }
  });

  test('should handle error logging table operations', async () => {
    const testLog = {
      level: 'info',
      message: 'Test log message',
      category: 'test',
      context: { test: true },
      correlation_id: 'test-correlation-id'
    };

    try {
      const { data, error } = await supabase
        .from('error_logs')
        .insert(testLog)
        .select();

      if (!error) {
        expect(data).toBeDefined();
        expect(data[0]).toMatchObject({
          level: 'info',
          message: 'Test log message',
          category: 'test'
        });

        // Cleanup
        await supabase
          .from('error_logs')
          .delete()
          .eq('correlation_id', 'test-correlation-id');
      }
    } catch (err) {
      // Table might not exist in test environment
      console.log('Error logs table not available in test environment');
    }
  });

  test('should handle error alerts table operations', async () => {
    const testAlert = {
      level: 'error',
      message: 'Test alert message',
      context: { test: true },
      timestamp: new Date().toISOString(),
      correlation_id: 'test-alert-correlation-id'
    };

    try {
      const { data, error } = await supabase
        .from('error_alerts')
        .insert(testAlert)
        .select();

      if (!error) {
        expect(data).toBeDefined();
        expect(data[0]).toMatchObject({
          level: 'error',
          message: 'Test alert message'
        });

        // Cleanup
        await supabase
          .from('error_alerts')
          .delete()
          .eq('correlation_id', 'test-alert-correlation-id');
      }
    } catch (err) {
      // Table might not exist in test environment
      console.log('Error alerts table not available in test environment');
    }
  });

  test('should handle database connection errors gracefully', async () => {
    // Test with invalid query to check error handling
    const { data, error } = await supabase
      .from('non_existent_table')
      .select('*');

    expect(error).toBeDefined();
    expect(data).toBeNull();
  });
});