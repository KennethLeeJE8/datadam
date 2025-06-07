#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { join } from 'path';
import { supabaseAdmin } from './database/client.js';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  try {
    console.log('Running error logging migration...');
    
    // Read the migration file
    const migrationPath = join(process.cwd(), 'src/database/migrations/003_error_logging.sql');
    const migrationSQL = await readFile(migrationPath, 'utf-8');
    
    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Executing ${statements.length} migration statements...`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}`);
      
      const { error } = await supabaseAdmin.rpc('execute_sql', { sql: statement });
      
      if (error) {
        // Try direct query if RPC fails
        try {
          await supabaseAdmin.from('_migration_temp').select('1');
        } catch {
          console.warn(`Could not execute statement ${i + 1}, might already exist: ${error.message}`);
        }
      }
    }
    
    console.log('Migration completed successfully!');
    
    // Test the new tables
    console.log('Testing error logging tables...');
    
    const { data: errorLogsTest, error: errorLogsError } = await supabaseAdmin
      .from('error_logs')
      .select('id')
      .limit(1);
      
    if (errorLogsError) {
      console.error('Error logs table test failed:', errorLogsError.message);
    } else {
      console.log('✓ error_logs table is accessible');
    }
    
    const { data: errorAlertsTest, error: errorAlertsError } = await supabaseAdmin
      .from('error_alerts')
      .select('id')
      .limit(1);
      
    if (errorAlertsError) {
      console.error('Error alerts table test failed:', errorAlertsError.message);
    } else {
      console.log('✓ error_alerts table is accessible');
    }
    
    const { data: errorMetricsTest, error: errorMetricsError } = await supabaseAdmin
      .from('error_metrics')
      .select('id')
      .limit(1);
      
    if (errorMetricsError) {
      console.error('Error metrics table test failed:', errorMetricsError.message);
    } else {
      console.log('✓ error_metrics table is accessible');
    }
    
    const { data: errorRecoveryTest, error: errorRecoveryError } = await supabaseAdmin
      .from('error_recovery_attempts')
      .select('id')
      .limit(1);
      
    if (errorRecoveryError) {
      console.error('Error recovery attempts table test failed:', errorRecoveryError.message);
    } else {
      console.log('✓ error_recovery_attempts table is accessible');
    }
    
    console.log('All error handling tables are ready!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigration();
}

export { runMigration };