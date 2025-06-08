import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.js';

function validateEnvironmentVariables() {
  if (!process.env.SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL environment variable');
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_ANON_KEY environment variable');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  }
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

// Initialize database connection and verify tables exist
export async function initializeDatabase(): Promise<void> {
  try {
    // Test connection with a simple query
    const { error } = await supabaseAdmin
      .from('personal_data')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Database connection failed:', error.message);
      throw new Error(`Database initialization failed: ${error.message}`);
    }

    console.error('Database connection successful');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}