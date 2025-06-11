#!/usr/bin/env node

import express from 'express';
import cors from 'cors';

const app = express();
const port = 3002; // Use different port to avoid conflicts

// Setup middleware
app.use(cors({
  origin: ['chrome-extension://*', 'moz-extension://*', 'http://localhost:*'],
  credentials: true
}));

app.use(express.json());

// Mock user data for testing
const mockUserId = '60767eca-63eb-43be-a861-fc0fbf46f468';
let mockDatabase = [
  {
    id: 'mock-1',
    user_id: mockUserId,
    data_type: 'contact',
    title: 'Emergency Contact',
    content: { name: 'John Doe', phone: '+1-555-123-4567', email: 'john@example.com' },
    tags: ['emergency', 'contact'],
    classification: 'personal',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'mock-2',
    user_id: mockUserId,
    data_type: 'document',
    title: 'Driver License',
    content: { license_number: 'DL123456789', expiry: '2025-12-31', state: 'CA' },
    tags: ['document', 'identity'],
    classification: 'sensitive',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Enhanced MCP Personal Data HTTP API',
    timestamp: new Date().toISOString(),
    database: 'mock'
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'running',
    service: 'Enhanced MCP HTTP API Server',
    port: port,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Extract personal data endpoint
app.post('/api/extract_personal_data', (req, res) => {
  try {
    const { user_id, data_types, filters, limit = 50, offset = 0 } = req.body;

    if (!user_id) {
      return res.status(400).json({
        error: 'user_id is required',
        code: 'MISSING_USER_ID'
      });
    }

    let filteredData = mockDatabase.filter(item => item.user_id === user_id);

    if (data_types && data_types.length > 0) {
      filteredData = filteredData.filter(item => data_types.includes(item.data_type));
    }

    const total = filteredData.length;
    const paginatedData = filteredData.slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        data: paginatedData,
        pagination: {
          offset,
          limit,
          total
        },
        extracted_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'EXTRACTION_FAILED'
    });
  }
});

// Create personal data endpoint
app.post('/api/create_personal_data', (req, res) => {
  try {
    const { user_id, data_type, title, content, tags = [], classification = 'personal' } = req.body;

    if (!user_id || !data_type || !title || !content) {
      return res.status(400).json({
        error: 'user_id, data_type, title, and content are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const newRecord = {
      id: `mock-${Date.now()}`,
      user_id,
      data_type,
      title,
      content,
      tags,
      classification,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    mockDatabase.push(newRecord);

    res.json({
      success: true,
      data: {
        success: true,
        record: newRecord,
        created_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'CREATION_FAILED'
    });
  }
});

// Update personal data endpoint  
app.put('/api/update_personal_data/*', (req, res) => {
  try {
    const recordId = req.params[0];
    const updates = req.body;

    const recordIndex = mockDatabase.findIndex(item => item.id === recordId);
    if (recordIndex === -1) {
      return res.status(404).json({
        error: 'Record not found',
        code: 'RECORD_NOT_FOUND'
      });
    }

    mockDatabase[recordIndex] = {
      ...mockDatabase[recordIndex],
      ...updates,
      updated_at: new Date().toISOString()
    };

    res.json({
      success: true,
      data: {
        success: true,
        record: mockDatabase[recordIndex],
        updated_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'UPDATE_FAILED'
    });
  }
});

// Delete personal data endpoint
app.delete('/api/delete_personal_data', (req, res) => {
  try {
    const { record_ids, hard_delete = false } = req.body;

    if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
      return res.status(400).json({
        error: 'record_ids array is required',
        code: 'MISSING_RECORD_IDS'
      });
    }

    let deletedCount = 0;
    
    if (hard_delete) {
      const initialLength = mockDatabase.length;
      mockDatabase = mockDatabase.filter(item => !record_ids.includes(item.id));
      deletedCount = initialLength - mockDatabase.length;
    } else {
      // Soft delete - mark as deleted
      record_ids.forEach(id => {
        const recordIndex = mockDatabase.findIndex(item => item.id === id);
        if (recordIndex !== -1) {
          mockDatabase[recordIndex].deleted_at = new Date().toISOString();
          deletedCount++;
        }
      });
    }

    res.json({
      success: true,
      data: {
        success: true,
        deleted_count: deletedCount,
        hard_delete,
        deleted_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'DELETION_FAILED'
    });
  }
});

// Search personal data endpoint
app.post('/api/search_personal_data', (req, res) => {
  try {
    const { user_id, query, data_types, limit = 20 } = req.body;

    if (!user_id || !query) {
      return res.status(400).json({
        error: 'user_id and query are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    let searchResults = mockDatabase.filter(item => {
      if (item.user_id !== user_id) return false;
      if (item.deleted_at) return false;
      
      const searchText = `${item.title} ${JSON.stringify(item.content)} ${item.tags.join(' ')}`.toLowerCase();
      return searchText.includes(query.toLowerCase());
    });

    if (data_types && data_types.length > 0) {
      searchResults = searchResults.filter(item => data_types.includes(item.data_type));
    }

    searchResults = searchResults.slice(0, limit);

    res.json({
      success: true,
      data: {
        query,
        results: searchResults,
        count: searchResults.length,
        searched_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'SEARCH_FAILED'
    });
  }
});

// Add personal data field endpoint
app.post('/api/add_personal_data_field', (req, res) => {
  try {
    const { field_name, data_type, validation_rules = {}, is_required = false, default_value } = req.body;

    if (!field_name || !data_type) {
      return res.status(400).json({
        error: 'field_name and data_type are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const fieldDefinition = {
      id: `field-${Date.now()}`,
      field_name,
      data_type,
      validation_rules,
      is_required,
      default_value,
      created_at: new Date().toISOString()
    };

    res.json({
      success: true,
      data: {
        success: true,
        field_definition: fieldDefinition,
        created_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'FIELD_CREATION_FAILED'
    });
  }
});

// List available tools
app.get('/api/tools', (req, res) => {
  const tools = [
    {
      name: 'extract_personal_data',
      description: 'Extract personal data with optional filtering',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'User identifier' },
          data_types: { type: 'array', items: { type: 'string', enum: ['contact', 'document', 'preference', 'custom'] } },
          filters: { type: 'object', description: 'Additional filtering options' },
          limit: { type: 'number', description: 'Maximum number of results', default: 50 }
        },
        required: ['user_id']
      }
    },
    {
      name: 'create_personal_data',
      description: 'Create new personal data record',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'User identifier' },
          data_type: { type: 'string', enum: ['contact', 'document', 'preference', 'custom'] },
          title: { type: 'string', description: 'Record title' },
          content: { type: 'object', description: 'Record content as JSON' },
          tags: { type: 'array', items: { type: 'string' } },
          classification: { type: 'string', enum: ['public', 'personal', 'sensitive', 'confidential'], default: 'personal' }
        },
        required: ['user_id', 'data_type', 'title', 'content']
      }
    },
    {
      name: 'update_personal_data',
      description: 'Update existing personal data record',
      inputSchema: {
        type: 'object',
        properties: {
          record_id: { type: 'string', description: 'Record identifier' },
          updates: { type: 'object', description: 'Fields to update' }
        },
        required: ['record_id', 'updates']
      }
    },
    {
      name: 'delete_personal_data',
      description: 'Delete personal data records',
      inputSchema: {
        type: 'object',
        properties: {
          record_ids: { type: 'array', items: { type: 'string' }, description: 'Array of record IDs to delete' },
          hard_delete: { type: 'boolean', default: false, description: 'Whether to permanently delete records' }
        },
        required: ['record_ids']
      }
    },
    {
      name: 'search_personal_data',
      description: 'Search personal data records',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'User identifier' },
          query: { type: 'string', description: 'Search query' },
          data_types: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number', default: 20, description: 'Maximum results' }
        },
        required: ['user_id', 'query']
      }
    },
    {
      name: 'add_personal_data_field',
      description: 'Add new field definition for personal data',
      inputSchema: {
        type: 'object',
        properties: {
          field_name: { type: 'string', description: 'Field name' },
          data_type: { type: 'string', enum: ['string', 'number', 'date', 'json', 'encrypted'] },
          validation_rules: { type: 'object', default: {} },
          is_required: { type: 'boolean', default: false },
          default_value: { description: 'Default field value' }
        },
        required: ['field_name', 'data_type']
      }
    }
  ];

  res.json({
    success: true,
    tools,
    timestamp: new Date().toISOString()
  });
});

// Generic tool call endpoint - simplified approach
app.post('/api/tools/*', (req, res) => {
  const toolName = req.params[0];
  const args = req.body;

  // Mock successful response for testing
  res.json({
    success: true,
    tool: toolName,
    result: {
      message: `Tool ${toolName} called successfully`,
      args: args,
      mock: true
    },
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /health',
      'GET /status',
      'POST /api/extract_personal_data',
      'POST /api/create_personal_data',
      'PUT /api/update_personal_data/{recordId}',
      'DELETE /api/delete_personal_data',
      'POST /api/search_personal_data',
      'POST /api/add_personal_data_field',
      'GET /api/tools',
      'POST /api/tools/{toolName}'
    ]
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Enhanced MCP HTTP API Server started at http://localhost:${port}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET    http://localhost:${port}/health`);
  console.log(`   GET    http://localhost:${port}/status`);
  console.log(`   POST   http://localhost:${port}/api/extract_personal_data`);
  console.log(`   POST   http://localhost:${port}/api/create_personal_data`);
  console.log(`   PUT    http://localhost:${port}/api/update_personal_data/{recordId}`);
  console.log(`   DELETE http://localhost:${port}/api/delete_personal_data`);
  console.log(`   POST   http://localhost:${port}/api/search_personal_data`);
  console.log(`   POST   http://localhost:${port}/api/add_personal_data_field`);
  console.log(`   GET    http://localhost:${port}/api/tools`);
  console.log(`   POST   http://localhost:${port}/api/tools/{toolName}`);
  console.log(`\n💾 Using mock database with ${mockDatabase.length} sample records`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Enhanced MCP HTTP API Server...');
  process.exit(0);
});