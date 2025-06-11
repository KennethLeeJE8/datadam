const dotenv = require('dotenv');
dotenv.config();
const { createClient } = require('@supabase/supabase-js');

async function createProfile() {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const userId = '399aa002-cb10-40fc-abfe-d2656eea0199';
  const fullName = 'Kenneth Lee';
  const username = 'kenneth.lee';
  
  console.log('Creating profile for Kenneth Lee...');
  
  // First, create the auth user if it doesn't exist
  try {
    const { data: authUser, error: authError } = await client.auth.admin.createUser({
      user_id: userId,
      email: 'kenneth.lee@example.com',
      password: 'temppassword123',
      email_confirm: true,
      user_metadata: {
        full_name: fullName
      }
    });
    
    if (authError && authError.message && !authError.message.includes('already exists')) {
      console.error('Auth user creation error:', authError);
    } else {
      console.log('✅ Auth user created/exists');
    }
  } catch (e) {
    console.log('Auth user might already exist:', e.message);
  }
  
  // Create the profile
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .insert({
      user_id: userId,
      username: username,
      full_name: fullName,
      metadata: {
        created_via: 'mcp_setup',
        preferences: {
          theme: 'default',
          notifications: true
        }
      }
    })
    .select()
    .single();
    
  if (profileError) {
    if (profileError.message.includes('duplicate key')) {
      console.log('✅ Profile already exists, updating...');
      
      const { data: updatedProfile, error: updateError } = await client
        .from('profiles')
        .update({
          username: username,
          full_name: fullName,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();
        
      if (updateError) {
        console.error('❌ Profile update error:', updateError);
      } else {
        console.log('✅ Profile updated successfully');
        console.log('Profile:', updatedProfile);
      }
    } else {
      console.error('❌ Profile creation error:', profileError);
    }
  } else {
    console.log('✅ Profile created successfully');
    console.log('Profile:', profile);
  }
}

createProfile().catch(console.error);