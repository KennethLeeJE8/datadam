import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      update: jest.fn(() => Promise.resolve({ data: {}, error: null })),
      delete: jest.fn(() => Promise.resolve({ data: {}, error: null }))
    })),
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null }))
    }
  }))
}));

// Import after mock is set up
import { supabase } from '../../../src/database/client.js';

describe('Database Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should export supabase client', () => {
    expect(supabase).toBeDefined();
  });

  test('should validate client module structure', () => {
    // Test the module exports without invoking the actual client
    expect(typeof supabase).toBe('object');
  });

  test('should be importable without errors', () => {
    // This test passes if the import doesn't throw
    expect(true).toBe(true);
  });
});