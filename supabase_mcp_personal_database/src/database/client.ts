import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.js';

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

// Initialize database connection and verify tables exist
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('Attempting to initialize database...');
    
    // First test basic connectivity with a simple query
    const { data: healthCheck, error: healthError } = await supabaseAdmin
      .from('personal_data')
      .select('id')
      .limit(0); // Just test the connection, don't actually fetch data
      
    if (healthError && healthError.code !== 'PGRST116') {
      // PGRST116 means table doesn't exist, which is different from connection issues
      console.error('Health check failed:', healthError);
      // Try auth test as fallback
      const { data: authTest, error: authError } = await supabaseAdmin.auth.getSession();
      console.error('Auth test result:', { authError });
    }

    // Test connection with personal_data table
    const { data, error } = await supabaseAdmin
      .from('personal_data')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Database connection failed:', error.message);
      console.error('Full error details:', JSON.stringify(error, null, 2));
      console.error('Error code:', error.code);
      console.error('Error hint:', error.hint);
      console.error('Using SUPABASE_URL:', process.env.SUPABASE_URL);
      console.error('Using SERVICE_ROLE_KEY prefix:', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) + '...');
      
      // Check if the table exists at all
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        console.error('The personal_data table does not exist. Database may need to be set up.');
      }
      
      throw new Error(`Database initialization failed: ${error.message}`);
    }

    console.log('Database connection successful');
    console.log('Query returned:', data?.length || 0, 'rows');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}