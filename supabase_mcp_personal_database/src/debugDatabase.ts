import { supabaseAdmin } from './database/client.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugDatabase() {
  try {
    console.log('=== Database Debug Info ===');
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
    console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);
    console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Test basic connection by trying to create the table
    console.log('\nTesting connection and creating tables...');
    
    // First, try to check if the table exists by querying it
    console.log('Checking if personal_data table exists...');
    const { data: existingData, error: existingError } = await supabaseAdmin
      .from('personal_data')
      .select('id')
      .limit(1);
      
    if (existingError) {
      console.log('Table does not exist, creating it...', existingError.message);
      
      // Create the personal_data table
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS personal_data (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          data_type TEXT NOT NULL CHECK (data_type IN ('contact', 'document', 'preference', 'custom')),
          title TEXT NOT NULL,
          content JSONB NOT NULL,
          tags TEXT[],
          classification TEXT DEFAULT 'personal' CHECK (classification IN ('public', 'personal', 'sensitive', 'confidential')),
          is_encrypted BOOLEAN DEFAULT FALSE,
          deleted_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          last_accessed TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_personal_data_user_id ON personal_data(user_id);
        CREATE INDEX IF NOT EXISTS idx_personal_data_type ON personal_data(data_type);
      `;
      
      const { error: createError } = await supabaseAdmin.rpc('exec_sql', { sql: createTableSQL });
      
      if (createError) {
        console.log('Failed to create table with RPC, trying direct query...');
        console.error('Create error:', createError);
        
        // Since we can't use RPC, let's try to manually check database access
        console.log('Testing with a simple select 1...');
        const { data: testData, error: testError } = await supabaseAdmin
          .from('auth.users')
          .select('id')
          .limit(1);
          
        if (testError) {
          console.error('Even basic query failed:', testError);
        } else {
          console.log('✅ Basic database access works');
        }
      } else {
        console.log('✅ Table created successfully!');
      }
    } else {
      console.log('✅ Table already exists!');
      console.log('Sample data:', existingData);
    }
    
    // Try to insert a test record
    console.log('\nTesting data insertion...');
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from('personal_data')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000001',
        data_type: 'contact',
        title: 'Test Contact',
        content: { name: 'Test User', email: 'test@example.com' },
        tags: ['test'],
        classification: 'personal'
      })
      .select();
      
    if (insertError) {
      console.error('Insert failed:', insertError);
    } else {
      console.log('✅ Data insertion successful:', insertData);
    }
    
  } catch (error) {
    console.error('Debug failed:', error);
  }
}

debugDatabase();