import { supabaseAdmin } from './database/client.js';
import dotenv from 'dotenv';

dotenv.config();

// Helper function to check if all required tables exist
async function checkTablesExist(): Promise<void> {
  const tables = ['profiles', 'personal_data', 'data_field_definitions', 'data_access_log'];
  
  for (const table of tables) {
    console.log(`Checking ${table} table...`);
    const { error } = await supabaseAdmin
      .from(table)
      .select('id')
      .limit(1);
    
    if (error) {
      console.error(`❌ Table ${table} does not exist or is not accessible.`);
      console.error('Error:', error.message);
      throw new Error(`Table ${table} not found. Please run the schema.sql file in your Supabase dashboard first.`);
    }
  }
  console.log('✅ All required tables verified to exist');
}

// Helper function to create a real authenticated user
async function createAuthenticatedUser(email: string, password: string): Promise<string | null> {
  try {
    console.log(`Creating authenticated user: ${email}`);
    
    // Create user using Supabase Admin client
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for testing
      user_metadata: {
        created_by: 'test_script',
        source: 'createTables_script'
      }
    });

    if (error) {
      console.error('❌ Failed to create authenticated user:', error);
      return null;
    }

    console.log('✅ Authenticated user created successfully');
    console.log(`📧 User email: ${data.user.email}`);
    console.log(`🆔 User ID: ${data.user.id}`);
    
    return data.user.id;
  } catch (error) {
    console.error('❌ Error creating authenticated user:', error);
    return null;
  }
}

// Helper function to log operations for audit trail
async function logAuditEvent(
  userId: string, 
  operation: string, 
  tableName: string, 
  recordId?: string,
  changes?: object
): Promise<void> {
  try {
    await supabaseAdmin
      .from('data_access_log')
      .insert({
        user_id: userId,
        operation,
        table_name: tableName,
        record_id: recordId,
        changes: changes || {},
        ip_address: '127.0.0.1', // Script execution IP
        user_agent: 'setup_script'
      });
  } catch (error) {
    console.warn('Failed to log audit event:', error);
  }
}

async function createTables() {
  try {
    console.log('🚀 Starting database setup with JavaScript client methods...');
    
    console.log('📋 Using pure Supabase JavaScript client as per requirements.');
    console.log('📋 This script will verify tables exist and read existing data first.');

    // Step 1: Verify all required tables exist
    console.log('Checking if all required tables exist...');
    await checkTablesExist();

    // Step 2: Read existing data to understand current state
    console.log('Reading existing data from database...');
    
    // Check existing profiles
    const { data: existingProfiles, error: profilesReadError } = await supabaseAdmin
      .from('profiles')
      .select('id, user_id, username, full_name');
    
    if (profilesReadError) {
      console.error('❌ Failed to read existing profiles. Cannot safely proceed with writes.');
      console.error('Read error:', profilesReadError);
      throw new Error('Database read test failed. Aborting writes to prevent data corruption.');
    }
    
    console.log(`✅ Successfully read ${existingProfiles?.length || 0} existing profiles`);
    if (existingProfiles && existingProfiles.length > 0) {
      console.log('📋 Existing profiles:', existingProfiles.map(p => `${p.username} (${p.user_id})`).join(', '));
    }

    // Check existing field definitions
    const { data: existingFields, error: fieldsReadError } = await supabaseAdmin
      .from('data_field_definitions')
      .select('id, field_name, data_type');
    
    if (fieldsReadError) {
      console.error('❌ Failed to read existing field definitions. Cannot safely proceed with writes.');
      console.error('Read error:', fieldsReadError);
      throw new Error('Database read test failed. Aborting writes to prevent data corruption.');
    }
    
    console.log(`✅ Successfully read ${existingFields?.length || 0} existing field definitions`);
    if (existingFields && existingFields.length > 0) {
      console.log('📋 Existing fields:', existingFields.map(f => `${f.field_name} (${f.data_type})`).join(', '));
    }

    // Check existing personal data
    const { data: existingPersonalData, error: personalDataReadError } = await supabaseAdmin
      .from('personal_data')
      .select('id, user_id, title, data_type');
    
    if (personalDataReadError) {
      console.error('❌ Failed to read existing personal data. Cannot safely proceed with writes.');
      console.error('Read error:', personalDataReadError);
      throw new Error('Database read test failed. Aborting writes to prevent data corruption.');
    }
    
    console.log(`✅ Successfully read ${existingPersonalData?.length || 0} existing personal data records`);

    console.log('\n🎯 All read operations successful. Proceeding with test data creation...');

    // Step 3: Create a real authenticated user first
    console.log('\n👤 Creating authenticated test user...');
    const testUserEmail = 'test@example.com';
    const testUserPassword = 'TestPassword123!';
    
    const testUserId = await createAuthenticatedUser(testUserEmail, testUserPassword);
    
    if (!testUserId) {
      console.error('❌ Could not create authenticated user. Skipping profile creation.');
      console.log('💡 You may need to check if user already exists or delete existing user first.');
      
      // Try to find existing user instead
      console.log('🔍 Checking for existing test users...');
      const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (!listError && existingUsers.users.length > 0) {
        const testUser = existingUsers.users.find(u => u.email === testUserEmail);
        if (testUser) {
          console.log(`✅ Found existing test user: ${testUser.email} (${testUser.id})`);
          const existingUserId = testUser.id;
          
          // Use existing user for profile creation
          await createTestProfile(existingUserId);
          await createTestFieldDefinitions(existingUserId);
          await displaySummary(existingUserId);
          return;
        }
      }
      
      console.log('❌ No suitable test user found. Exiting...');
      return;
    }

    await createTestProfile(testUserId);
    await createTestFieldDefinitions(testUserId);
    await displaySummary(testUserId);

  } catch (error) {
    console.error('💥 Database setup failed:', error);
    process.exit(1);
  }
}

// Helper function to create test profile
async function createTestProfile(testUserId: string): Promise<void> {
  console.log('Creating test profile...');
  
  const profileData = {
    user_id: testUserId,
    username: 'test_user',
    full_name: 'Test User',
    metadata: { created_by: 'setup_script', source: 'createTables_script' }
  };

  const { data: profile, error: profileInsertError } = await supabaseAdmin
    .from('profiles')
    .upsert(profileData)
    .select()
    .single();

  if (profileInsertError) {
    console.error('❌ Failed to create test profile:', profileInsertError);
    throw profileInsertError;
  }

  // Log the profile creation for audit trail
  await logAuditEvent(testUserId, 'CREATE', 'profiles', profile.id, profileData);
  console.log('✅ Test profile created successfully with ID:', profile.id);
}

// Helper function to create test field definitions
async function createTestFieldDefinitions(testUserId: string): Promise<number> {
  console.log('Adding test data field definitions...');
  
  // Use 'test_' prefix to avoid conflicts with sample data
  const defaultFields = [
    { field_name: 'test_email', data_type: 'string', validation_rules: { format: 'email' }, is_required: false },
    { field_name: 'test_phone', data_type: 'string', validation_rules: { pattern: '^\\+?[1-9]\\d{1,14}$' }, is_required: false },
    { field_name: 'test_name', data_type: 'string', validation_rules: { minLength: 1, maxLength: 255 }, is_required: true },
    { field_name: 'test_birth_date', data_type: 'date', validation_rules: {}, is_required: false },
    { field_name: 'test_preferences', data_type: 'json', validation_rules: {}, is_required: false }
  ];

  let createdFieldsCount = 0;
  for (const field of defaultFields) {
    try {
      const { data: fieldDef, error: fieldError } = await supabaseAdmin
        .from('data_field_definitions')
        .upsert(field)
        .select()
        .single();

      if (fieldError) {
        console.error(`❌ Failed to create field definition for ${field.field_name}:`, fieldError);
        continue;
      }

      // Log the field definition creation for audit trail
      await logAuditEvent(testUserId, 'CREATE', 'data_field_definitions', fieldDef.id, field);
      console.log(`✅ Created field definition: ${field.field_name}`);
      createdFieldsCount++;
    } catch (error) {
      console.error(`❌ Error processing field ${field.field_name}:`, error);
    }
  }
  
  return createdFieldsCount;
}

// Helper function to display comprehensive summary
async function displaySummary(testUserId: string): Promise<void> {
  console.log('\n🎉 Database test data setup completed successfully!');
  console.log('\n📊 Summary of verified tables:');
  console.log('  • profiles - User profile information');
  console.log('  • personal_data - Main data storage with JSONB content');
  console.log('  • data_field_definitions - Schema definitions for data fields');
  console.log('  • data_access_log - Audit trail for all operations');
  console.log('\n👤 Test authenticated user created with ID:', testUserId);
  console.log('🔍 All operations logged to audit trail for compliance');

  // Show sample data from schema
  console.log('\n🔍 Sample data from schema:');
  const { data: sampleProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name, user_id')
    .eq('username', 'sample_user')
    .maybeSingle();
  
  if (sampleProfile) {
    console.log(`✓ Sample profile: ${sampleProfile.username} (${sampleProfile.full_name}) - ${sampleProfile.user_id}`);
    
    const { data: samplePersonalData } = await supabaseAdmin
      .from('personal_data')
      .select('title, data_type')
      .eq('user_id', sampleProfile.user_id);
    
    if (samplePersonalData && samplePersonalData.length > 0) {
      console.log(`✓ Sample personal data: ${samplePersonalData.map(d => `${d.title} (${d.data_type})`).join(', ')}`);
    }
  }
  
  const { data: sampleFields } = await supabaseAdmin
    .from('data_field_definitions')
    .select('field_name, data_type')
    .like('field_name', 'sample_%');
  
  if (sampleFields && sampleFields.length > 0) {
    console.log(`✓ Sample field definitions: ${sampleFields.map(f => f.field_name).join(', ')}`);
  }
  
  // Show test data created by this script
  console.log('\n🧪 Test data created by this script:');
  const { data: testProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, username, full_name')
    .eq('user_id', testUserId)
    .single();
  
  if (testProfile) {
    console.log(`✓ Test profile: ${testProfile.username} (${testProfile.full_name})`);
  }

  const { data: testFields } = await supabaseAdmin
    .from('data_field_definitions')
    .select('field_name, data_type')
    .like('field_name', 'test_%')
    .order('created_at', { ascending: true });
  
  if (testFields && testFields.length > 0) {
    console.log(`✓ Test field definitions: ${testFields.map(f => f.field_name).join(', ')}`);
  }

  // Show total counts
  console.log('\n📊 Total database contents:');
  const { data: allProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id');
  console.log(`✓ Total profiles: ${allProfiles?.length || 0}`);
  
  const { data: allFields } = await supabaseAdmin
    .from('data_field_definitions')
    .select('id');
  console.log(`✓ Total field definitions: ${allFields?.length || 0}`);
  
  const { data: allPersonalData } = await supabaseAdmin
    .from('personal_data')
    .select('id');
  console.log(`✓ Total personal data records: ${allPersonalData?.length || 0}`);
}

// Only run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createTables();
}

export { createTables };