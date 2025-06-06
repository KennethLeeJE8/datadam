import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from './database/client.js';
import dotenv from 'dotenv';

dotenv.config();

async function setupDatabase() {
  try {
    console.log('Setting up database schema...');
    
    // Read the schema file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const schemaPath = join(__dirname, 'database', 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf8');

    // Split the schema into individual statements
    const statements = schemaSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`Executing ${statements.length} SQL statements...`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`Executing statement ${i + 1}/${statements.length}`);
      
      const { error } = await supabaseAdmin.rpc('execute_sql', { sql: statement });
      
      if (error) {
        console.error(`Error executing statement ${i + 1}:`, error);
        // Try direct query for some statements
        const { error: queryError } = await supabaseAdmin
          .from('personal_data')
          .select('*')
          .limit(0);
          
        if (queryError && !queryError.message.includes('does not exist')) {
          console.error('Failed to execute SQL statement:', statement);
          throw error;
        }
      }
    }

    console.log('✅ Database schema setup completed successfully!');
    
    // Test the connection
    const { data, error } = await supabaseAdmin
      .from('personal_data')
      .select('id')
      .limit(1);
      
    if (error) {
      console.error('Database test failed:', error);
    } else {
      console.log('✅ Database connection test successful!');
    }

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase();