import { describe, expect, test, beforeEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../src/database/client.js', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    })),
  },
}));

jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  ErrorCategory: {
    SYSTEM: 'system',
    DATABASE: 'database',
  },
}));

import { errorRecovery, type RecoveryStrategy } from '../../../src/utils/errorRecovery.js';

describe('Error Recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should have default recovery strategies', () => {
    const strategies = errorRecovery.getStrategies();
    expect(strategies.length).toBeGreaterThan(0);
    
    const dbRetry = strategies.find(s => s.name === 'database_retry');
    expect(dbRetry).toBeDefined();
    expect(dbRetry?.maxAttempts).toBeGreaterThan(0);
  });

  test('should add and remove strategies', () => {
    const testStrategy: RecoveryStrategy = {
      name: 'test_strategy',
      description: 'Test strategy',
      applicable: () => true,
      execute: async () => ({ success: true, message: 'Test', shouldRetry: false }),
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 1000,
    };

    errorRecovery.addStrategy(testStrategy);
    const strategies = errorRecovery.getStrategies();
    expect(strategies.find(s => s.name === 'test_strategy')).toBeDefined();

    errorRecovery.removeStrategy('test_strategy');
    const updatedStrategies = errorRecovery.getStrategies();
    expect(updatedStrategies.find(s => s.name === 'test_strategy')).toBeUndefined();
  });

  test('should attempt recovery for applicable errors', async () => {
    const dbError = new Error('Database connection failed');
    const context = { operation: 'database_query' };
    
    const result = await errorRecovery.attemptRecovery(dbError, context, 'test-correlation');
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('shouldRetry');
  });

  test('should handle no applicable strategies', async () => {
    const unknownError = new Error('Unknown error type');
    const context = { operation: 'unknown' };
    
    const result = await errorRecovery.attemptRecovery(unknownError, context, 'test-correlation');
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('recovery strategies');
  });

  test('should get recovery statistics', async () => {
    const stats = await errorRecovery.getRecoveryStats('1h');
    
    expect(stats).toBeDefined();
    expect(typeof stats).toBe('object');
  });

  test('should clear active recoveries', () => {
    expect(() => {
      errorRecovery.clearActiveRecoveries('test-correlation');
      errorRecovery.clearActiveRecoveries(); // Clear all
    }).not.toThrow();
  });

  test('should handle strategy execution errors gracefully', async () => {
    const faultyError = new Error('Strategy execution error');
    const context = { operation: 'test' };
    
    // Should not throw even if strategies fail
    const result = await errorRecovery.attemptRecovery(faultyError, context, 'test-correlation');
    expect(result).toBeDefined();
  });
});