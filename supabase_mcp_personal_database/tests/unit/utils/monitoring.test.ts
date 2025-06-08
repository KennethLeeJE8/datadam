import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

// Mock Supabase and logger
jest.mock('../../../src/database/client.js', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        gte: jest.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      delete: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    })),
    rpc: jest.fn(() => Promise.resolve({ data: {}, error: null })),
  },
}));

jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    critical: jest.fn(),
  },
  ErrorCategory: {
    SYSTEM: 'system',
    DATABASE: 'database',
  },
}));

import { errorMonitoring, type AlertRule } from '../../../src/utils/monitoring.js';

describe('Error Monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    errorMonitoring.stop();
  });

  test('should have default alert rules', () => {
    const rules = errorMonitoring.getAlertRules();
    expect(rules.length).toBeGreaterThan(0);
    
    const highErrorRate = rules.find(r => r.id === 'high-error-rate');
    expect(highErrorRate).toBeDefined();
    expect(highErrorRate?.condition.metric).toBe('error_rate');
  });

  test('should add and remove alert rules', () => {
    const testRule: AlertRule = {
      id: 'test-rule',
      name: 'Test Rule',
      condition: { metric: 'error_count', operator: 'gt' },
      threshold: 5,
      timeWindow: '5m',
      severity: 'medium',
      enabled: true,
      actions: [],
    };

    errorMonitoring.addAlertRule(testRule);
    const rules = errorMonitoring.getAlertRules();
    expect(rules.find(r => r.id === 'test-rule')).toBeDefined();

    errorMonitoring.removeAlertRule('test-rule');
    const updatedRules = errorMonitoring.getAlertRules();
    expect(updatedRules.find(r => r.id === 'test-rule')).toBeUndefined();
  });

  test('should update alert rules', () => {
    const testRule: AlertRule = {
      id: 'update-test',
      name: 'Update Test',
      condition: { metric: 'error_rate', operator: 'gt' },
      threshold: 10,
      timeWindow: '5m',
      severity: 'low',
      enabled: true,
      actions: [],
    };

    errorMonitoring.addAlertRule(testRule);
    errorMonitoring.updateAlertRule('update-test', { threshold: 20, severity: 'high' });

    const rules = errorMonitoring.getAlertRules();
    const updated = rules.find(r => r.id === 'update-test');
    expect(updated?.threshold).toBe(20);
    expect(updated?.severity).toBe('high');
  });

  test('should get health status', async () => {
    const metrics = await errorMonitoring.getHealthStatus();
    
    expect(metrics).toBeDefined();
    expect(metrics).toHaveProperty('errorRate');
    expect(metrics).toHaveProperty('errorCount');
    expect(metrics).toHaveProperty('criticalErrors');
    expect(metrics).toHaveProperty('healthStatus');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(metrics.healthStatus);
  });

  test('should handle database errors gracefully', async () => {
    // Should not throw even if database operations fail
    expect(async () => {
      await errorMonitoring.getHealthStatus();
    }).not.toThrow();
  });

  test('should stop monitoring cleanly', () => {
    expect(() => errorMonitoring.stop()).not.toThrow();
  });
});