import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.js';
import { logger, ErrorCategory } from '../utils/logger.js';

function validateEnvironmentVariables() {
  const missing = [];
  
  if (!process.env.SUPABASE_URL) {
    missing.push('SUPABASE_URL');
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    missing.push('SUPABASE_ANON_KEY');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    console.error('Available environment variables:', Object.keys(process.env).filter(key => key.startsWith('SUPABASE')));
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Log (partial) values for debugging
  console.log('Environment variables loaded:');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY?.substring(0, 20) + '...');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) + '...');
}

const supabaseConfig = {
  auth: {
    persistSession: false, // Stateless for better scaling
    detectSessionInUrl: false
  },
  db: {
    schema: 'public' as const
  },
  global: {
    headers: {
      'x-application-name': 'mcp-personal-data-server'
    }
  },
  // Connection pooling configuration for better performance
  realtime: {
    params: {
      eventsPerSecond: parseInt(process.env.REALTIME_EVENTS_PER_SECOND || '10')
    }
  }
};

function createSupabaseClients() {
  validateEnvironmentVariablesIfNeeded();
  
  return {
    supabaseAnon: createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      supabaseConfig
    ),
    supabaseAdmin: createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      supabaseConfig
    )
  };
}

let clients: ReturnType<typeof createSupabaseClients> | null = null;
let lastValidation: number = 0;
const VALIDATION_CACHE_TTL = 60000; // Cache validation for 1 minute

function getClients() {
  if (!clients) {
    clients = createSupabaseClients();
  }
  return clients;
}

// Optimized validation with caching
function validateEnvironmentVariablesIfNeeded() {
  const now = Date.now();
  if (now - lastValidation > VALIDATION_CACHE_TTL) {
    validateEnvironmentVariables();
    lastValidation = now;
  }
}

export const supabaseAnon = new Proxy({} as ReturnType<typeof createSupabaseClients>['supabaseAnon'], {
  get(target, prop) {
    return getClients().supabaseAnon[prop as keyof typeof target];
  }
});

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseClients>['supabaseAdmin'], {
  get(target, prop) {
    return getClients().supabaseAdmin[prop as keyof typeof target];
  }
});

// Export supabase as an alias for supabaseAdmin for backward compatibility
export const supabase = supabaseAdmin;

// Verify database schema based on actual tables from screenshot
export async function verifyDatabaseSchema(): Promise<void> {
  // Core tables required for functionality
  const coreRequiredTables = ['personal_data', 'profiles', 'data_field_definitions'];
  
  // Monitoring/logging tables (warn if missing but don't fail)
  const optionalTables = ['data_access_log', 'error_alerts', 'error_logs', 'error_metrics', 'error_recovery_attempts'];
  
  logger.info('Verifying database schema...');
  
  // Check core required tables
  for (const tableName of coreRequiredTables) {
    try {
      const { error } = await supabaseAdmin
        .from(tableName as any)
        .select('*')
        .limit(0); // Just check table exists, don't fetch data
      
      if (error && error.code === 'PGRST116') {
        throw new Error(`CRITICAL: Required table '${tableName}' does not exist. Please run the database setup script.`);
      } else if (error) {
        throw new Error(`CRITICAL: Error accessing required table '${tableName}': ${error.message}`);
      }
      
      logger.info(`✓ Core table '${tableName}' exists`);
    } catch (error) {
      logger.error(`Schema verification failed for core table '${tableName}'`, error as Error, ErrorCategory.DATABASE);
      throw error;
    }
  }
  
  // Check optional tables (warn only)
  for (const tableName of optionalTables) {
    try {
      const { error } = await supabaseAdmin
        .from(tableName as any)
        .select('*')
        .limit(0);
      
      if (error && error.code === 'PGRST116') {
        logger.warn(`Optional table '${tableName}' does not exist. Some monitoring features may not work.`, ErrorCategory.DATABASE);
      } else if (error) {
        logger.warn(`Error accessing optional table '${tableName}': ${error.message}`, ErrorCategory.DATABASE);
      } else {
        logger.debug(`✓ Optional table '${tableName}' exists`);
      }
    } catch (error) {
      logger.warn(`Could not verify optional table '${tableName}': ${(error as Error).message}`, ErrorCategory.DATABASE);
    }
  }
  
  logger.info('Database schema verification completed');
}

// Initialize database connection and verify tables exist
export async function initializeDatabase(): Promise<void> {
  try {
    logger.info('Starting database initialization...');
    
    // Test basic connectivity
    const { error } = await supabaseAdmin
      .from('personal_data')
      .select('*')
      .limit(0);
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database connection failed: ${error.message}`);
    }
    
    logger.info('Database connection successful');
    
    // Verify all required tables exist
    await verifyDatabaseSchema();
    
    logger.info('Database initialization completed successfully');
    
  } catch (error) {
    logger.error('Database initialization failed', error as Error, ErrorCategory.DATABASE, {
      supabaseUrl: process.env.SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    });
    throw error;
  }
}