import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { logger } from '../../../src/utils/logger.js';

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set log level to DEBUG to ensure all log methods work in tests
    process.env.LOG_LEVEL = 'DEBUG';
  });

  test('should have all required log methods', () => {
    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.critical).toBeDefined();
  });

  test('should log debug messages', () => {
    const spy = jest.spyOn(console, 'log');
    logger.debug('Test debug message');
    expect(spy).toHaveBeenCalled();
  });

  test('should log info messages', () => {
    const spy = jest.spyOn(console, 'log');
    logger.info('Test info message');
    expect(spy).toHaveBeenCalled();
  });

  test('should log warn messages', () => {
    const spy = jest.spyOn(console, 'warn');
    logger.warn('Test warn message');
    expect(spy).toHaveBeenCalled();
  });

  test('should log error messages', () => {
    const spy = jest.spyOn(console, 'error');
    logger.error('Test error message');
    expect(spy).toHaveBeenCalled();
  });

  test('should log critical messages', () => {
    const spy = jest.spyOn(console, 'error');
    logger.critical('Test critical message');
    expect(spy).toHaveBeenCalled();
  });

  test('should handle objects in log messages', () => {
    const spy = jest.spyOn(console, 'log');
    const testObject = { key: 'value', nested: { data: 123 } };
    logger.info('Test with object', testObject);
    expect(spy).toHaveBeenCalled();
  });
});