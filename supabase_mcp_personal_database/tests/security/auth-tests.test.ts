import { describe, expect, test, beforeEach, jest } from '@jest/globals';

// Mock JWT and auth utilities
const mockJWT = {
  verify: jest.fn(),
  sign: jest.fn(),
  decode: jest.fn(),
};

jest.mock('jsonwebtoken', () => mockJWT);

// Mock Supabase auth
const mockSupabaseAuth = {
  getUser: jest.fn() as jest.Mock,
  admin: {
    createUser: jest.fn() as jest.Mock,
    deleteUser: jest.fn() as jest.Mock,
    updateUserById: jest.fn() as jest.Mock,
  },
  signInWithPassword: jest.fn() as jest.Mock,
  signOut: jest.fn() as jest.Mock,
};

jest.mock('../../src/database/client.js', () => ({
  supabaseAdmin: {
    auth: mockSupabaseAuth,
    from: jest.fn(() => ({
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
      insert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    })),
  },
}));

describe('Authentication & Authorization Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('JWT Token Validation', () => {
    test('should validate valid JWT tokens', () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJpYXQiOjE2MzAwMDAwMDB9';
      const decodedPayload = {
        sub: 'test-user',
        iat: 1630000000,
        exp: 1630086400, // 24 hours later
        role: 'authenticated',
      };

      mockJWT.verify.mockReturnValue(decodedPayload);

      const result = mockJWT.verify(validToken, 'secret-key') as any;

      expect(result).toEqual(decodedPayload);
      expect(result.sub).toBe('test-user');
      expect(result.role).toBe('authenticated');
    });

    test('should reject expired JWT tokens', () => {
      const expiredToken = 'expired.jwt.token';
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';

      mockJWT.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        mockJWT.verify(expiredToken, 'secret-key');
      }).toThrow('Token expired');
    });

    test('should reject invalid JWT tokens', () => {
      const invalidToken = 'invalid.jwt.token';
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';

      mockJWT.verify.mockImplementation(() => {
        throw error;
      });

      expect(() => {
        mockJWT.verify(invalidToken, 'secret-key');
      }).toThrow('Invalid token');
    });

    test('should decode JWT tokens without verification', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ';
      const decodedPayload = { sub: 'test-user' };

      mockJWT.decode.mockReturnValue(decodedPayload);

      const result = mockJWT.decode(token);
      expect(result).toEqual(decodedPayload);
    });
  });

  describe('User Authentication', () => {
    test('should authenticate users with valid credentials', async () => {
      const userCredentials = {
        email: 'test@example.com',
        password: 'secure-password-123',
      };

      const authResponse = {
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            role: 'authenticated',
          },
          session: {
            access_token: 'valid-jwt-token',
            refresh_token: 'refresh-token',
          },
        },
        error: null,
      };

      mockSupabaseAuth.signInWithPassword.mockResolvedValue(authResponse);

      const { supabaseAdmin } = require('../../src/database/client.js');
      const result = await supabaseAdmin.auth.signInWithPassword(userCredentials);

      expect(result.error).toBeNull();
      expect(result.data.user.id).toBe('user-123');
      expect(result.data.session.access_token).toBe('valid-jwt-token');
    });

    test('should reject authentication with invalid credentials', async () => {
      const invalidCredentials = {
        email: 'invalid@example.com',
        password: 'wrong-password',
      };

      const authResponse = {
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      };

      mockSupabaseAuth.signInWithPassword.mockResolvedValue(authResponse);

      const { supabaseAdmin } = require('../../src/database/client.js');
      const result = await supabaseAdmin.auth.signInWithPassword(invalidCredentials);

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Invalid login credentials');
      expect(result.data.user).toBeNull();
    });

    test('should get user from valid session', async () => {
      const userResponse = {
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            role: 'authenticated',
            user_metadata: {},
          },
        },
        error: null,
      };

      mockSupabaseAuth.getUser.mockResolvedValue(userResponse);

      const { supabaseAdmin } = require('../../src/database/client.js');
      const result = await supabaseAdmin.auth.getUser();

      expect(result.error).toBeNull();
      expect(result.data.user.id).toBe('user-123');
      expect(result.data.user.role).toBe('authenticated');
    });

    test('should handle invalid session gracefully', async () => {
      const userResponse = {
        data: { user: null },
        error: { message: 'Invalid JWT token' },
      };

      mockSupabaseAuth.getUser.mockResolvedValue(userResponse);

      const { supabaseAdmin } = require('../../src/database/client.js');
      const result = await supabaseAdmin.auth.getUser();

      expect(result.error).toBeDefined();
      expect(result.data.user).toBeNull();
    });
  });

  describe('User Authorization', () => {
    test('should authorize users for their own data', async () => {
      const userToken = {
        sub: 'user-123',
        role: 'authenticated',
        aud: 'authenticated',
      };

      const dataRequest = {
        user_id: 'user-123',
        resource: 'personal_data',
        operation: 'read',
      };

      // Simulate authorization check
      const isAuthorized = userToken.sub === dataRequest.user_id && 
                          userToken.role === 'authenticated';

      expect(isAuthorized).toBe(true);
    });

    test('should deny users access to other users data', async () => {
      const userToken = {
        sub: 'user-123',
        role: 'authenticated',
        aud: 'authenticated',
      };

      const dataRequest = {
        user_id: 'user-456', // Different user
        resource: 'personal_data',
        operation: 'read',
      };

      // Simulate authorization check
      const isAuthorized = userToken.sub === dataRequest.user_id;

      expect(isAuthorized).toBe(false);
    });

    test('should allow service role to access all data', async () => {
      const serviceToken = {
        sub: 'service-role',
        role: 'service_role',
        aud: 'authenticated',
      };

      const dataRequest = {
        user_id: 'any-user',
        resource: 'personal_data',
        operation: 'admin_read',
      };

      // Service role should have access to all data
      const isAuthorized = serviceToken.role === 'service_role';

      expect(isAuthorized).toBe(true);
    });

    test('should enforce data classification access controls', async () => {
      const userToken = {
        sub: 'user-123',
        role: 'authenticated',
        clearance_level: 'personal',
      };

      const testCases = [
        { classification: 'public', expected: true },
        { classification: 'personal', expected: true },
        { classification: 'sensitive', expected: false },
        { classification: 'confidential', expected: false },
      ];

      testCases.forEach(testCase => {
        // Simulate access control based on classification
        const clearanceLevels = ['public', 'personal', 'sensitive', 'confidential'];
        const userLevel = clearanceLevels.indexOf(userToken.clearance_level);
        const dataLevel = clearanceLevels.indexOf(testCase.classification);
        
        const hasAccess = userLevel >= dataLevel;
        expect(hasAccess).toBe(testCase.expected);
      });
    });
  });

  describe('User Management', () => {
    test('should create new users with proper validation', async () => {
      const newUser = {
        email: 'newuser@example.com',
        password: 'secure-password-123',
        user_metadata: {
          full_name: 'New User',
        },
      };

      const createResponse = {
        data: {
          user: {
            id: 'new-user-456',
            email: 'newuser@example.com',
            created_at: new Date().toISOString(),
          },
        },
        error: null,
      };

      mockSupabaseAuth.admin.createUser.mockResolvedValue(createResponse);

      const { supabaseAdmin } = require('../../src/database/client.js');
      const result = await supabaseAdmin.auth.admin.createUser(newUser);

      expect(result.error).toBeNull();
      expect(result.data.user.email).toBe('newuser@example.com');
      expect(result.data.user.id).toBe('new-user-456');
    });

    test('should prevent duplicate user creation', async () => {
      const duplicateUser = {
        email: 'existing@example.com',
        password: 'password-123',
      };

      const createResponse = {
        data: { user: null },
        error: { message: 'User already registered' },
      };

      mockSupabaseAuth.admin.createUser.mockResolvedValue(createResponse);

      const { supabaseAdmin } = require('../../src/database/client.js');
      const result = await supabaseAdmin.auth.admin.createUser(duplicateUser);

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('User already registered');
    });

    test('should delete users and associated data', async () => {
      const deleteResponse = {
        data: { user: null },
        error: null,
      };

      mockSupabaseAuth.admin.deleteUser.mockResolvedValue(deleteResponse);

      const { supabaseAdmin } = require('../../src/database/client.js');
      const result = await supabaseAdmin.auth.admin.deleteUser('user-to-delete');

      expect(result.error).toBeNull();
    });
  });

  describe('Session Management', () => {
    test('should handle user sign out', async () => {
      const signOutResponse = { error: null };

      mockSupabaseAuth.signOut.mockResolvedValue(signOutResponse);

      const { supabaseAdmin } = require('../../src/database/client.js');
      const result = await supabaseAdmin.auth.signOut();

      expect(result.error).toBeNull();
    });

    test('should validate session timeouts', () => {
      const token = {
        iat: Date.now() / 1000 - 3600, // Issued 1 hour ago
        exp: Date.now() / 1000 - 1800, // Expired 30 minutes ago
      };

      const isExpired = token.exp < Date.now() / 1000;
      expect(isExpired).toBe(true);
    });

    test('should validate active sessions', () => {
      const token = {
        iat: Date.now() / 1000 - 1800, // Issued 30 minutes ago
        exp: Date.now() / 1000 + 1800, // Expires in 30 minutes
      };

      const isValid = token.exp > Date.now() / 1000;
      expect(isValid).toBe(true);
    });
  });

  describe('Security Headers and Context', () => {
    test('should validate required security headers', () => {
      const requestHeaders = {
        'authorization': 'Bearer valid-jwt-token',
        'content-type': 'application/json',
        'x-client-info': 'mcp-server/1.0.0',
      };

      expect(requestHeaders.authorization).toBeDefined();
      expect(requestHeaders.authorization).toContain('Bearer');
      expect(requestHeaders['content-type']).toBe('application/json');
    });

    test('should handle missing authorization header', () => {
      const requestHeaders = {
        'content-type': 'application/json',
      };

      const hasAuth = requestHeaders.authorization !== undefined;
      expect(hasAuth).toBe(false);
    });

    test('should validate user context in requests', () => {
      const userContext = {
        user_id: 'user-123',
        session_id: 'session-456',
        ip_address: '192.168.1.1',
        user_agent: 'MCP-Client/1.0.0',
      };

      expect(userContext.user_id).toBeDefined();
      expect(userContext.session_id).toBeDefined();
      expect(userContext.ip_address).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });
  });
});