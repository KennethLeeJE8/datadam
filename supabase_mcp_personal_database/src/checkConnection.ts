import dotenv from 'dotenv';

dotenv.config();

import { supabaseAnon } from './database/client.js';

async function checkConnection() {
  try {
    let { data: personal_data, error } = await supabaseAnon.from('personal_data').select();
    if (error) {
      console.error('Connection failed:', error.message);
    } else if (!personal_data || personal_data.length === 0) {
      console.log('Connection successful: Table is empty');
    } else {
      console.log('Connection successful:', personal_data);
    }
  } catch (err) {
    console.error('Error during connection check:', err);
  }
}

checkConnection(); 