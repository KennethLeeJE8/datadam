#!/usr/bin/env node

// Standalone HTTP API server for your MCP Personal Data
// Run this alongside your existing MCP server

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({
  path: '/Users/kenne/github/datadam/supabase_mcp_personal_database/.env'
});

class StandaloneMCPHttpAPI {
  constructor() {
    this.app = express();
    this.port = 3001;
    this.initializeSupabase();
    this.setupMiddleware();
    this.setupRoutes();
  }

  initializeSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    // Always use service role key for admin operations
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials in environment variables');
      console.error('   SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
      console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅ Set' : '❌ Missing');
      process.exit(1);
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized with service role key');
  }

  setupMiddleware() {
    this.app.use(cors({
      origin: ['chrome-extension://*', 'moz-extension://*', 'http://localhost:*'],
      credentials: true
    }));
    this.app.use(express.json());
    
    // Log all requests
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'MCP Personal Data HTTP API',
        timestamp: new Date().toISOString(),
        database: 'connected'
      });
    });

    // Status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        status: 'running',
        service: 'MCP HTTP API Server',
        port: this.port,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Send message endpoint
    this.app.post('/send-message', async (req, res) => {
      try {
        const { message } = req.body;

        if (!message) {
          return res.status(400).json({
            error: 'message is required',
            code: 'MISSING_MESSAGE'
          });
        }

        // Simple echo response for now - you can extend this to actually communicate with MCP server
        const response = {
          success: true,
          received_message: message,
          response: `MCP server received: ${message}`,
          timestamp: new Date().toISOString()
        };

        res.json(response);

      } catch (error) {
        console.error('❌ Error in send-message endpoint:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          code: 'MESSAGE_FAILED'
        });
      }
    });

    // Extract personal data
    this.app.post('/api/extract_personal_data', async (req, res) => {
      try {
        const { user_id, limit = 50, offset = 0 } = req.body;

        if (!user_id) {
          return res.status(400).json({
            success: false,
            error: 'user_id is required'
          });
        }

        console.log(`🔍 Extracting personal data for user: ${user_id}`);

        const { data, error, count } = await this.supabase
          .from('personal_data')
          .select('*', { count: 'exact' })
          .eq('user_id', user_id)
          .range(offset, offset + limit - 1);

        if (error) {
          console.error('❌ Database error:', error);
          throw error;
        }

        console.log(`✅ Found ${data?.length || 0} records`);

        res.json({
          success: true,
          data: {
            data: data || [],
            pagination: {
              offset,
              limit,
              total: count
            },
            extracted_at: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error('❌ Error in extract_personal_data:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error'
        });
      }
    });

    // Get user profile (aggregated view of all personal data)
    this.app.get('/api/user_profile/:user_id', async (req, res) => {
      try {
        const { user_id } = req.params;

        if (!user_id) {
          return res.status(400).json({
            success: false,
            error: 'user_id is required'
          });
        }

        console.log(`👤 Getting user profile for: ${user_id}`);

        // Get all personal data for the user
        const { data, error } = await this.supabase
          .from('personal_data')
          .select('*')
          .eq('user_id', user_id)
          .is('deleted_at', null);

        if (error) {
          console.error('❌ Database error:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          return res.json({
            success: true,
            profile: null,
            message: 'No profile data found for this user'
          });
        }

        // Aggregate all data into a single profile
        const profile = {
          user_id: user_id,
          name: null,
          email: null,
          phone: null,
          address: null,
          preferences: {},
          documents: {},
          custom_fields: {},
          created_at: null,
          updated_at: null
        };

        // Extract and organize data by type
        data.forEach(record => {
          // Track the earliest created_at and latest updated_at
          if (!profile.created_at || record.created_at < profile.created_at) {
            profile.created_at = record.created_at;
          }
          if (!profile.updated_at || record.updated_at > profile.updated_at) {
            profile.updated_at = record.updated_at;
          }

          // Extract data based on type and content
          switch (record.data_type) {
            case 'contact':
              if (record.content.name && !profile.name) {
                profile.name = record.content.name;
              }
              if (record.content.email && !profile.email) {
                profile.email = record.content.email;
              }
              if (record.content.phone && !profile.phone) {
                profile.phone = record.content.phone;
              }
              if (record.content.street || record.content.city) {
                profile.address = {
                  street: record.content.street,
                  city: record.content.city,
                  state: record.content.state,
                  zip: record.content.zip
                };
              }
              break;

            case 'preference':
              profile.preferences[record.title] = record.content;
              break;

            case 'document':
              profile.documents[record.title] = record.content;
              break;

            case 'custom':
              profile.custom_fields[record.title] = record.content;
              break;
          }
        });

        // Use title as fallback for name if no name found in content
        if (!profile.name) {
          const contactRecord = data.find(r => r.data_type === 'contact');
          if (contactRecord) {
            profile.name = contactRecord.title;
          }
        }

        console.log(`✅ Generated profile for ${user_id}: ${profile.name || 'Unnamed User'}`);

        res.json({
          success: true,
          profile: profile,
          raw_data_count: data.length
        });

      } catch (error) {
        console.error('❌ Error in get_user_profile:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error'
        });
      }
    });

    // Create personal data endpoint
    this.app.post('/api/create_personal_data', async (req, res) => {
      try {
        const { user_id, data_type, title, content, tags = [], classification = 'personal' } = req.body;

        if (!user_id || !data_type || !title || !content) {
          return res.status(400).json({
            success: false,
            error: 'user_id, data_type, title, and content are required'
          });
        }

        console.log(`➕ Creating personal data: ${title} for user: ${user_id}`);

        const { data, error } = await this.supabase
          .from('personal_data')
          .insert({
            user_id,
            data_type,
            title,
            content,
            tags,
            classification
          })
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ Created record with ID: ${data.id}`);

        res.json({
          success: true,
          data: {
            success: true,
            record: data,
            created_at: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error('❌ Error creating personal data:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Update personal data endpoint
    this.app.put('/api/update_personal_data', async (req, res) => {
      try {
        const { record_id, updates } = req.body;

        if (!record_id || !updates) {
          return res.status(400).json({
            success: false,
            error: 'record_id and updates are required'
          });
        }

        console.log(`📝 Updating personal data record: ${record_id}`);

        // First check if record exists
        const { data: existingRecord, error: checkError } = await this.supabase
          .from('personal_data')
          .select('id')
          .eq('id', record_id)
          .single();

        if (checkError) {
          if (checkError.code === 'PGRST116') {
            return res.status(404).json({
              success: false,
              error: `Record not found: ${record_id}`
            });
          }
          throw checkError;
        }

        // Update the record
        const { data, error } = await this.supabase
          .from('personal_data')
          .update({
            ...updates,
            updated_at: new Date().toISOString()
          })
          .eq('id', record_id)
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ Updated record: ${record_id}`);

        res.json({
          success: true,
          data: {
            success: true,
            record: data,
            updated_at: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error('❌ Error updating personal data:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Delete personal data endpoint
    this.app.delete('/api/delete_personal_data', async (req, res) => {
      try {
        const { record_ids, hard_delete = false } = req.body;

        if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'record_ids array is required'
          });
        }

        console.log(`🗑️ Deleting ${record_ids.length} records (hard_delete: ${hard_delete})`);

        let result;
        if (hard_delete) {
          const { error } = await this.supabase
            .from('personal_data')
            .delete()
            .in('id', record_ids);

          if (error) throw error;
          result = { deleted_count: record_ids.length, hard_delete: true };
        } else {
          const { data, error } = await this.supabase
            .from('personal_data')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', record_ids)
            .select();

          if (error) throw error;
          result = { soft_deleted: data, hard_delete: false };
        }

        console.log(`✅ Deleted ${record_ids.length} records`);

        res.json({
          success: true,
          data: {
            success: true,
            ...result,
            deleted_at: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error('❌ Error deleting personal data:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Search personal data endpoint
    this.app.post('/api/search_personal_data', async (req, res) => {
      try {
        const { user_id, query, data_types, limit = 20 } = req.body;

        if (!user_id || !query) {
          return res.status(400).json({
            success: false,
            error: 'user_id and query are required'
          });
        }

        console.log(`🔍 Searching personal data for user: ${user_id}, query: "${query}"`);

        let searchQuery = this.supabase
          .from('personal_data')
          .select('*')
          .eq('user_id', user_id)
          .is('deleted_at', null)
          .or(`title.ilike.%${query}%,content->>name.ilike.%${query}%`)
          .limit(limit);

        if (data_types && data_types.length > 0) {
          searchQuery = searchQuery.in('data_type', data_types);
        }

        const { data, error } = await searchQuery;

        if (error) throw error;

        console.log(`✅ Found ${data?.length || 0} search results`);

        res.json({
          success: true,
          data: {
            query,
            results: data || [],
            count: data?.length || 0,
            searched_at: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error('❌ Error searching personal data:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Add personal data field endpoint
    this.app.post('/api/add_personal_data_field', async (req, res) => {
      try {
        const { field_name, data_type, validation_rules = {}, is_required = false, default_value } = req.body;

        if (!field_name || !data_type) {
          return res.status(400).json({
            success: false,
            error: 'field_name and data_type are required'
          });
        }

        console.log(`🏷️ Adding personal data field: ${field_name} (${data_type})`);

        const { data, error } = await this.supabase
          .from('data_field_definitions')
          .insert({
            field_name,
            data_type,
            validation_rules,
            is_required,
            default_value
          })
          .select()
          .single();

        if (error) throw error;

        console.log(`✅ Added field definition: ${field_name}`);

        res.json({
          success: true,
          data: {
            success: true,
            field_definition: data,
            created_at: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error('❌ Error adding personal data field:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // List available tools endpoint
    this.app.get('/api/tools', (req, res) => {
      const tools = [
        {
          name: 'extract_personal_data',
          description: 'Extract personal data with optional filtering',
          endpoint: 'POST /api/extract_personal_data'
        },
        {
          name: 'create_personal_data',
          description: 'Create new personal data record',
          endpoint: 'POST /api/create_personal_data'
        },
        {
          name: 'update_personal_data',
          description: 'Update existing personal data record',
          endpoint: 'PUT /api/update_personal_data'
        },
        {
          name: 'delete_personal_data',
          description: 'Delete personal data records',
          endpoint: 'DELETE /api/delete_personal_data'
        },
        {
          name: 'search_personal_data',
          description: 'Search personal data records',
          endpoint: 'POST /api/search_personal_data'
        },
        {
          name: 'add_personal_data_field',
          description: 'Add new field definition for personal data',
          endpoint: 'POST /api/add_personal_data_field'
        }
      ];

      res.json({
        success: true,
        tools,
        timestamp: new Date().toISOString()
      });
    });

    // Test data endpoint (for development)
    this.app.post('/api/add_test_data', async (req, res) => {
      try {
        const { user_id = '60767eca-63eb-43be-a861-fc0fbf46f468' } = req.body;

        const testData = [
          {
            user_id,
            data_type: 'contact',
            title: 'Primary Email',
            content: { email: 'john.doe@example.com', type: 'primary' },
            tags: ['contact', 'email'],
            classification: 'personal'
          },
          {
            user_id,
            data_type: 'contact', 
            title: 'Phone Number',
            content: { phone: '+1-555-123-4567', type: 'mobile' },
            tags: ['contact', 'phone'],
            classification: 'personal'
          },
          {
            user_id,
            data_type: 'document',
            title: 'Driver License',
            content: { 
              license_number: 'DL123456789',
              expiry: '2025-12-31',
              state: 'CA'
            },
            tags: ['document', 'identity'],
            classification: 'sensitive'
          }
        ];

        const { data, error } = await this.supabase
          .from('personal_data')
          .insert(testData)
          .select();

        if (error) throw error;

        res.json({
          success: true,
          message: `Added ${data.length} test records for user ${user_id}`,
          data
        });

      } catch (error) {
        console.error('❌ Error adding test data:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // List all tables (debug)
    this.app.get('/api/debug/tables', async (req, res) => {
      try {
        const { data, error } = await this.supabase
          .from('personal_data')
          .select('*')
          .limit(5);

        res.json({
          success: true,
          sample_data: data,
          error: error
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`\n🚀 MCP Personal Data HTTP API Server started!`);
      console.log(`📍 Running on: http://localhost:${this.port}`);
      console.log(`\n📋 Available endpoints:`);
      console.log(`   GET    http://localhost:${this.port}/health`);
      console.log(`   GET    http://localhost:${this.port}/status`);
      console.log(`   POST   http://localhost:${this.port}/send-message`);
      console.log(`   POST   http://localhost:${this.port}/api/extract_personal_data`);
      console.log(`   POST   http://localhost:${this.port}/api/create_personal_data`);
      console.log(`   PUT    http://localhost:${this.port}/api/update_personal_data`);
      console.log(`   DELETE http://localhost:${this.port}/api/delete_personal_data`);
      console.log(`   POST   http://localhost:${this.port}/api/search_personal_data`);
      console.log(`   POST   http://localhost:${this.port}/api/add_personal_data_field`);
      console.log(`   GET    http://localhost:${this.port}/api/tools`);
      console.log(`   GET    http://localhost:${this.port}/api/user_profile/:user_id`);
      console.log(`   POST   http://localhost:${this.port}/api/add_test_data`);
      console.log(`   GET    http://localhost:${this.port}/api/debug/tables`);
      console.log(`\n🔧 Test with curl:`);
      console.log(`   curl http://localhost:${this.port}/health`);
      console.log(`   curl -X POST http://localhost:${this.port}/api/extract_personal_data -H "Content-Type: application/json" -d '{"user_id":"60767eca-63eb-43be-a861-fc0fbf46f468"}'`);
      console.log(`\n✅ Ready for browser extension connection!`);
    });
  }
}

// Start the server
const server = new StandaloneMCPHttpAPI();
server.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down HTTP API server...');
  process.exit(0);
});