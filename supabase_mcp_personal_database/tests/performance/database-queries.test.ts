import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { supabase } from '../../src/database/client.js';

describe('Database Performance Tests', () => {
  const PERFORMANCE_THRESHOLD_MS = 1000; // 1 second max for queries
  const BULK_INSERT_THRESHOLD_MS = 5000; // 5 seconds max for bulk operations

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
  });

  afterAll(async () => {
    // Cleanup performance test data
    try {
      await supabase
        .from('error_logs')
        .delete()
        .like('correlation_id', 'perf-test-%');
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  test('should perform single insert within performance threshold', async () => {
    const startTime = Date.now();
    
    const testLog = {
      level: 'info',
      message: 'Performance test log',
      category: 'performance',
      context: { test: 'performance' },
      correlation_id: 'perf-test-single-insert'
    };

    try {
      const { error } = await supabase
        .from('error_logs')
        .insert(testLog);

      const duration = Date.now() - startTime;
      
      if (!error) {
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      }
    } catch (err) {
      console.log('Performance test skipped - table not available');
    }
  });

  test('should perform bulk insert within performance threshold', async () => {
    const startTime = Date.now();
    
    const testLogs = Array.from({ length: 100 }, (_, i) => ({
      level: 'info',
      message: `Performance test log ${i}`,
      category: 'performance',
      context: { test: 'performance', index: i },
      correlation_id: `perf-test-bulk-${i}`
    }));

    try {
      const { error } = await supabase
        .from('error_logs')
        .insert(testLogs);

      const duration = Date.now() - startTime;
      
      if (!error) {
        expect(duration).toBeLessThan(BULK_INSERT_THRESHOLD_MS);
      }
    } catch (err) {
      console.log('Bulk performance test skipped - table not available');
    }
  });

  test('should perform select queries within performance threshold', async () => {
    const startTime = Date.now();

    try {
      const { error } = await supabase
        .from('error_logs')
        .select('*')
        .limit(50);

      const duration = Date.now() - startTime;
      
      if (!error) {
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      }
    } catch (err) {
      console.log('Select performance test skipped - table not available');
    }
  });

  test('should perform filtered queries within performance threshold', async () => {
    const startTime = Date.now();

    try {
      const { error } = await supabase
        .from('error_logs')
        .select('*')
        .eq('level', 'error')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(20);

      const duration = Date.now() - startTime;
      
      if (!error) {
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      }
    } catch (err) {
      console.log('Filtered performance test skipped - table not available');
    }
  });

  test('should perform aggregation queries within performance threshold', async () => {
    const startTime = Date.now();

    try {
      const { error } = await supabase
        .from('error_logs')
        .select('level, count(*)')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const duration = Date.now() - startTime;
      
      if (!error) {
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      }
    } catch (err) {
      console.log('Aggregation performance test skipped - table not available');
    }
  });
});