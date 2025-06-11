// Enhanced MCP Client for browser extension with full API support
class EnhancedMCPClient {
  constructor() {
    this.isConnected = false;
    this.userId = '399aa002-cb10-40fc-abfe-d2656eea0199';
    this.apiBaseUrl = 'http://localhost:3001'; // HTTP API server port
  }

  async connect() {
    try {
      // Test connection to HTTP API server
      const response = await fetch(`${this.apiBaseUrl}/health`);
      if (response.ok) {
        this.isConnected = true;
        console.log('✅ Connected to MCP HTTP API Server');
        return true;
      }
    } catch (error) {
      console.log('⚠️ MCP HTTP API Server not running, using mock data');
      this.isConnected = false;
    }
    return false;
  }

  async extractPersonalData(userId, options = {}) {
    console.log('Extracting personal data for user:', userId);
    
    if (!this.isConnected) {
      return this._getMockData();
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/extract_personal_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          data_types: options.data_types,
          filters: options.filters,
          limit: options.limit || 50,
          offset: options.offset || 0
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Failed to extract personal data:', error);
      return this._getMockData();
    }
  }

  async createPersonalData(userId, dataType, title, content, options = {}) {
    console.log('Creating personal data:', { userId, dataType, title });

    if (!this.isConnected) {
      return this._createMockRecord(userId, dataType, title, content, options);
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/create_personal_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          data_type: dataType,
          title,
          content,
          tags: options.tags || [],
          classification: options.classification || 'personal'
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create record');
      }

      return result.data;
    } catch (error) {
      console.error('Failed to create personal data:', error);
      throw error;
    }
  }

  async updatePersonalData(recordId, updates) {
    console.log('Updating personal data:', recordId);

    if (!this.isConnected) {
      return { success: true, message: 'Mock update completed', record_id: recordId };
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/update_personal_data/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update record');
      }

      return result.data;
    } catch (error) {
      console.error('Failed to update personal data:', error);
      throw error;
    }
  }

  async deletePersonalData(recordIds, hardDelete = false) {
    console.log('Deleting personal data:', recordIds);

    if (!this.isConnected) {
      return { success: true, deleted_count: recordIds.length, hard_delete: hardDelete };
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/delete_personal_data`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record_ids: recordIds,
          hard_delete: hardDelete
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete records');
      }

      return result.data;
    } catch (error) {
      console.error('Failed to delete personal data:', error);
      throw error;
    }
  }

  async searchPersonalData(userId, query, options = {}) {
    console.log('Searching personal data:', { userId, query });

    if (!this.isConnected) {
      return this._getMockSearchResults(query);
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/search_personal_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          query,
          data_types: options.data_types,
          limit: options.limit || 20
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Search failed');
      }

      return result.data;
    } catch (error) {
      console.error('Failed to search personal data:', error);
      return this._getMockSearchResults(query);
    }
  }

  async addPersonalDataField(fieldName, dataType, options = {}) {
    console.log('Adding personal data field:', { fieldName, dataType });

    if (!this.isConnected) {
      return { success: true, field_name: fieldName, data_type: dataType };
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/add_personal_data_field`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_name: fieldName,
          data_type: dataType,
          validation_rules: options.validation_rules || {},
          is_required: options.is_required || false,
          default_value: options.default_value
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to add field');
      }

      return result.data;
    } catch (error) {
      console.error('Failed to add personal data field:', error);
      throw error;
    }
  }

  async getUserProfile(userId) {
    console.log('Getting user profile for:', userId);

    if (!this.isConnected) {
      return this._getMockProfile(userId);
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/user_profile/${userId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to get profile');
      }

      return result;
    } catch (error) {
      console.error('Failed to get user profile:', error);
      return this._getMockProfile(userId);
    }
  }

  _getMockProfile(userId) {
    return {
      success: true,
      profile: {
        user_id: userId,
        name: 'Mock User',
        email: 'mock@example.com',
        phone: '+1-555-0123',
        address: null,
        preferences: { theme: 'dark' },
        documents: {},
        custom_fields: {}
      }
    };
  }

  // Mock data methods for offline fallback
  _getMockData() {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          data: [
            {
              id: '1',
              user_id: this.userId,
              data_type: 'contact',
              title: 'Emergency Contact',
              content: { name: 'John Doe', phone: '+1-555-123-4567', email: 'john@example.com' },
              tags: ['emergency', 'contact'],
              classification: 'personal',
              created_at: new Date().toISOString()
            },
            {
              id: '2',
              user_id: this.userId,
              data_type: 'document',
              title: 'Driver License',
              content: { license_number: 'DL123456789', expiry: '2025-12-31', state: 'CA' },
              tags: ['document', 'identity'],
              classification: 'sensitive',
              created_at: new Date().toISOString()
            }
          ],
          pagination: { offset: 0, limit: 50, total: 2 },
          extracted_at: new Date().toISOString(),
          note: 'Mock data - MCP HTTP API Server not available'
        })
      }]
    };
  }

  _createMockRecord(userId, dataType, title, content, options) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          record: {
            id: `mock_${Date.now()}`,
            user_id: userId,
            data_type: dataType,
            title,
            content,
            tags: options.tags || [],
            classification: options.classification || 'personal',
            created_at: new Date().toISOString()
          }
        })
      }]
    };
  }

  _getMockSearchResults(query) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          results: [
            {
              id: '1',
              title: `Mock result for: ${query}`,
              content: { matched_text: `This is a mock search result for "${query}"` },
              data_type: 'custom',
              relevance_score: 0.85
            }
          ],
          count: 1,
          searched_at: new Date().toISOString()
        })
      }]
    };
  }
}

// Enhanced Background service with full personal data management
class EnhancedBackgroundService {
  constructor() {
    this.mcpClient = new EnhancedMCPClient();
    this.setupMessageListeners();
    this.initializeConnection();
  }

  async initializeConnection() {
    await this.mcpClient.connect();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep the message channel open for async response
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getProfiles':
          const profileResult = await this.getUserProfile();
          if (profileResult && profileResult.profile) {
            sendResponse({ success: true, profiles: [profileResult.profile] });
          } else {
            sendResponse({ success: true, profiles: [] });
          }
          break;

        case 'extractPersonalData':
          const data = await this.extractPersonalData(request.options);
          sendResponse({ success: true, data: data });
          break;

        case 'createPersonalData':
          const created = await this.createPersonalData(
            request.dataType, 
            request.title, 
            request.content, 
            request.options
          );
          sendResponse({ success: true, data: created });
          break;

        case 'updatePersonalData':
          const updated = await this.updatePersonalData(request.recordId, request.updates);
          sendResponse({ success: true, data: updated });
          break;

        case 'deletePersonalData':
          const deleted = await this.deletePersonalData(request.recordIds, request.hardDelete);
          sendResponse({ success: true, data: deleted });
          break;

        case 'searchPersonalData':
          const searchResults = await this.searchPersonalData(request.query, request.options);
          sendResponse({ success: true, data: searchResults });
          break;

        case 'addPersonalDataField':
          const field = await this.addPersonalDataField(
            request.fieldName, 
            request.dataType, 
            request.options
          );
          sendResponse({ success: true, data: field });
          break;

        case 'getConnectionStatus':
          const status = await this.getConnectionStatus();
          sendResponse({ success: true, ...status });
          break;

        case 'testApiEndpoints':
          const testResults = await this.testApiEndpoints();
          sendResponse({ success: true, data: testResults });
          break;

        default:
          sendResponse({ success: false, error: `Unknown action: ${request.action}` });
      }
    } catch (error) {
      console.error('Background service error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async extractPersonalData(options = {}) {
    try {
      const result = await this.mcpClient.extractPersonalData(this.mcpClient.userId, options);
      
      // Handle both HTTP API format and old MCP format for backwards compatibility
      if (result.content && result.content[0] && result.content[0].type === 'text') {
        // Old MCP format
        const data = JSON.parse(result.content[0].text);
        return data.data || data;
      } else if (result.data) {
        // HTTP API format
        return result.data;
      }
      
      return result;
    } catch (error) {
      console.error('Failed to extract personal data:', error);
      throw error;
    }
  }

  async getUserProfile() {
    try {
      const result = await this.mcpClient.getUserProfile(this.mcpClient.userId);
      return result;
    } catch (error) {
      console.error('Failed to get user profile:', error);
      throw error;
    }
  }

  async createPersonalData(dataType, title, content, options = {}) {
    try {
      const result = await this.mcpClient.createPersonalData(
        this.mcpClient.userId, 
        dataType, 
        title, 
        content, 
        options
      );
      
      if (result.content && result.content[0] && result.content[0].type === 'text') {
        return JSON.parse(result.content[0].text);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to create personal data:', error);
      throw error;
    }
  }

  async updatePersonalData(recordId, updates) {
    try {
      const result = await this.mcpClient.updatePersonalData(recordId, updates);
      return result;
    } catch (error) {
      console.error('Failed to update personal data:', error);
      throw error;
    }
  }

  async deletePersonalData(recordIds, hardDelete = false) {
    try {
      const result = await this.mcpClient.deletePersonalData(recordIds, hardDelete);
      return result;
    } catch (error) {
      console.error('Failed to delete personal data:', error);
      throw error;
    }
  }

  async searchPersonalData(query, options = {}) {
    try {
      const result = await this.mcpClient.searchPersonalData(this.mcpClient.userId, query, options);
      
      if (result.content && result.content[0] && result.content[0].type === 'text') {
        return JSON.parse(result.content[0].text);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to search personal data:', error);
      throw error;
    }
  }

  async addPersonalDataField(fieldName, dataType, options = {}) {
    try {
      const result = await this.mcpClient.addPersonalDataField(fieldName, dataType, options);
      return result;
    } catch (error) {
      console.error('Failed to add personal data field:', error);
      throw error;
    }
  }

  async getConnectionStatus() {
    const connected = await this.mcpClient.connect();
    return {
      connected,
      apiUrl: this.mcpClient.apiBaseUrl,
      userId: this.mcpClient.userId,
      message: connected 
        ? 'Connected to MCP HTTP API Server' 
        : 'Using mock data - MCP HTTP API Server not available'
    };
  }

  async testApiEndpoints() {
    const tests = [
      { name: 'Health Check', url: `${this.mcpClient.apiBaseUrl}/health` },
      { name: 'Status Check', url: `${this.mcpClient.apiBaseUrl}/status` },
      { name: 'Tools List', url: `${this.mcpClient.apiBaseUrl}/api/tools` }
    ];

    const results = [];
    for (const test of tests) {
      try {
        const response = await fetch(test.url);
        results.push({
          name: test.name,
          url: test.url,
          status: response.status,
          success: response.ok,
          data: response.ok ? await response.json() : null
        });
      } catch (error) {
        results.push({
          name: test.name,
          url: test.url,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  // Legacy method for backwards compatibility
  async getProfiles() {
    return this.extractPersonalData();
  }
}

// Start the enhanced background service
const backgroundService = new EnhancedBackgroundService();

console.log('🚀 Enhanced Background script loaded');
console.log('📡 HTTP API Server expected at: http://localhost:3001');
console.log('🗄️ MCP Server expected at: /Users/kenne/github/datadam/supabase_mcp_personal_database');
console.log('👤 User ID configured:', '399aa002-cb10-40fc-abfe-d2656eea0199 (Kenneth Lee)');
console.log('📋 Available actions:', [
  'extractPersonalData', 'createPersonalData', 'updatePersonalData', 
  'deletePersonalData', 'searchPersonalData', 'addPersonalDataField',
  'getConnectionStatus', 'testApiEndpoints'
]);