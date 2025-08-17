import { Request, Response, NextFunction } from 'express';
import { logger, ErrorCategory } from '../utils/logger.js';

export interface AuthInfo {
  isAuthenticated: boolean;
  apiKey?: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthInfo;
}

/**
 * Optional API key authentication middleware
 * Only validates if MCP_API_KEY environment variable is set
 */
export function validateApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction): void | Response {
  const requiredApiKey = process.env.MCP_API_KEY;
  
  // If no API key is configured, skip authentication
  if (!requiredApiKey) {
    req.auth = { isAuthenticated: false };
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    logger.warn('Missing Authorization header', ErrorCategory.AUTHENTICATION, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      url: req.url
    });
    
    return res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Authentication required. Provide Authorization: Bearer <api-key> header.'
      },
      id: null
    });
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) {
    logger.warn('Invalid Authorization header format', ErrorCategory.AUTHENTICATION, {
      ip: req.ip,
      authHeader: authHeader.substring(0, 20) + '...'
    });
    
    return res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Invalid Authorization header format. Use: Bearer <api-key>'
      },
      id: null
    });
  }

  const providedApiKey = match[1];
  
  if (providedApiKey !== requiredApiKey) {
    logger.warn('Invalid API key provided', ErrorCategory.AUTHENTICATION, {
      ip: req.ip,
      providedKeyLength: providedApiKey.length,
      userAgent: req.headers['user-agent']
    });
    
    return res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Invalid API key'
      },
      id: null
    });
  }

  // Authentication successful
  req.auth = { 
    isAuthenticated: true, 
    apiKey: providedApiKey 
  };
  
  logger.info('API key authentication successful', {
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  next();
}

/**
 * Simple in-memory rate limiting with connection management
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Track active connections for Render tier limits
let activeConnections = 0;

export function connectionLimit(req: Request, res: Response, next: NextFunction): void | Response {
  const maxConnections = parseInt(process.env.MAX_CONNECTIONS || '3');
  
  if (activeConnections >= maxConnections) {
    logger.warn('Connection limit exceeded', ErrorCategory.NETWORK, {
      activeConnections,
      maxConnections,
      ip: req.ip
    });
    
    return res.status(503).json({
      jsonrpc: '2.0',
      error: {
        code: -32004,
        message: 'Service temporarily unavailable - connection limit reached',
        data: { activeConnections, maxConnections }
      },
      id: null
    });
  }
  
  activeConnections++;
  
  // Decrease counter when response finishes
  res.on('finish', () => {
    activeConnections = Math.max(0, activeConnections - 1);
  });
  
  res.on('close', () => {
    activeConnections = Math.max(0, activeConnections - 1);
  });
  
  next();
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void | Response {
  const maxRequests = parseInt(process.env.RATE_LIMIT_REQUESTS || '50');
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW || '900000');
  const maxCacheSize = parseInt(process.env.CACHE_SIZE || '100');
  
  const clientKey = req.ip || 'unknown';
  const now = Date.now();
  const resetTime = now + windowMs;
  
  // Enforce cache size limit and clean up expired entries
  if (rateLimitStore.size >= maxCacheSize || Math.random() < 0.05) { // 5% chance to cleanup
    const expiredKeys: string[] = [];
    const oldestKeys: [string, number][] = [];
    
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        expiredKeys.push(key);
      } else {
        oldestKeys.push([key, entry.resetTime]);
      }
    }
    
    // Remove expired entries
    expiredKeys.forEach(key => rateLimitStore.delete(key));
    
    // If still over cache limit, remove oldest entries
    if (rateLimitStore.size >= maxCacheSize) {
      oldestKeys.sort((a, b) => a[1] - b[1]); // Sort by reset time (oldest first)
      const toRemove = oldestKeys.slice(0, rateLimitStore.size - maxCacheSize + 1);
      toRemove.forEach(([key]) => rateLimitStore.delete(key));
    }
  }
  
  const entry = rateLimitStore.get(clientKey);
  
  if (!entry) {
    // First request from this IP
    rateLimitStore.set(clientKey, { count: 1, resetTime });
    return next();
  }
  
  if (now > entry.resetTime) {
    // Reset expired window
    entry.count = 1;
    entry.resetTime = resetTime;
    return next();
  }
  
  if (entry.count >= maxRequests) {
    // Rate limit exceeded
    logger.warn('Rate limit exceeded', ErrorCategory.VALIDATION, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestCount: entry.count,
      maxRequests
    });
    
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': Math.ceil(entry.resetTime / 1000).toString()
    });
    
    return res.status(429).json({
      jsonrpc: '2.0',
      error: {
        code: -32002,
        message: 'Rate limit exceeded. Please try again later.',
        data: {
          limit: maxRequests,
          window: windowMs,
          retryAfter: Math.ceil((entry.resetTime - now) / 1000)
        }
      },
      id: null
    });
  }
  
  // Increment counter
  entry.count++;
  
  res.set({
    'X-RateLimit-Limit': maxRequests.toString(),
    'X-RateLimit-Remaining': (maxRequests - entry.count).toString(),
    'X-RateLimit-Reset': Math.ceil(entry.resetTime / 1000).toString()
  });
  
  next();
}

/**
 * Request timeout middleware
 */
export function requestTimeout(req: Request, res: Response, next: NextFunction): void {
  const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT || '30000');
  
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      logger.warn('Request timeout', ErrorCategory.NETWORK, {
        ip: req.ip,
        url: req.url,
        method: req.method,
        timeoutMs
      });
      
      res.status(408).json({
        jsonrpc: '2.0',
        error: {
          code: -32003,
          message: 'Request timeout'
        },
        id: null
      });
    }
  }, timeoutMs);
  
  // Clear timeout when response is finished
  res.on('finish', () => {
    clearTimeout(timeout);
  });
  
  next();
}