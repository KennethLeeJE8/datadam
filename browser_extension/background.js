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

// Field Matching Rules System for Autofill
class FieldMatchingRulesSystem {
  constructor() {
    this.rules = this.initializeDefaultRules();
    this.categories = new Map();
    this.initializeDefaultCategories();
  }

  initializeDefaultRules() {
    return new Map([
      // Name field rules
      ['name_full', {
        id: 'name_full',
        type: 0, // Text input
        pattern: /^(cc-)?name$/,
        value: 'Full Name',
        category: 'personal_info',
        priority: 10,
        overwrite: true
      }],
      ['name_given', {
        id: 'name_given',
        type: 0,
        pattern: /^(cc-)?given-name$/,
        value: 'First Name',
        category: 'personal_info',
        priority: 9,
        overwrite: true
      }],
      ['name_family', {
        id: 'name_family',
        type: 0,
        pattern: /^(cc-)?family-name$/,
        value: 'Last Name',
        category: 'personal_info',
        priority: 9,
        overwrite: true
      }],
      
      // Contact field rules
      ['email', {
        id: 'email',
        type: 0,
        pattern: /^email$/,
        value: 'email@example.com',
        category: 'contact_info',
        priority: 10,
        overwrite: true
      }],
      ['phone', {
        id: 'phone',
        type: 0,
        pattern: /^tel$/,
        value: '+1-555-123-4567',
        category: 'contact_info',
        priority: 9,
        overwrite: true
      }],
      
      // Address field rules
      ['address_street', {
        id: 'address_street',
        type: 0,
        pattern: /^street-address$/,
        value: '123 Main Street',
        category: 'address_info',
        priority: 8,
        overwrite: true
      }],
      ['address_city', {
        id: 'address_city',
        type: 0,
        pattern: /^address-level2$/,
        value: 'City',
        category: 'address_info',
        priority: 7,
        overwrite: true
      }],
      ['address_state', {
        id: 'address_state',
        type: 0,
        pattern: /^address-level1$/,
        value: 'State',
        category: 'address_info',
        priority: 7,
        overwrite: true
      }],
      ['address_postal', {
        id: 'address_postal',
        type: 0,
        pattern: /^postal-code$/,
        value: '12345',
        category: 'address_info',
        priority: 7,
        overwrite: true
      }],
      ['address_country', {
        id: 'address_country',
        type: 0,
        pattern: /^country$/,
        value: 'United States',
        category: 'address_info',
        priority: 6,
        overwrite: true
      }],
      
      // Organization field rules
      ['organization', {
        id: 'organization',
        type: 0,
        pattern: /^organization$/,
        value: 'Company Name',
        category: 'work_info',
        priority: 6,
        overwrite: true
      }],
      ['job_title', {
        id: 'job_title',
        type: 0,
        pattern: /^organization-title$/,
        value: 'Job Title',
        category: 'work_info',
        priority: 5,
        overwrite: true
      }]
    ]);
  }

  initializeDefaultCategories() {
    this.categories.set('personal_info', {
      id: 'personal_info',
      name: 'Personal Information',
      description: 'Basic personal details like name and birth date'
    });
    this.categories.set('contact_info', {
      id: 'contact_info',
      name: 'Contact Information',
      description: 'Email, phone, and communication details'
    });
    this.categories.set('address_info', {
      id: 'address_info',
      name: 'Address Information',
      description: 'Street address, city, state, and postal code'
    });
    this.categories.set('work_info', {
      id: 'work_info',
      name: 'Work Information',
      description: 'Company, job title, and work details'
    });
  }

  getRulesByCategory(categoryId) {
    return Array.from(this.rules.values()).filter(rule => rule.category === categoryId);
  }

  getAllRules() {
    return Array.from(this.rules.values());
  }

  addRule(rule) {
    this.rules.set(rule.id, rule);
  }

  updateRule(ruleId, updates) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      Object.assign(rule, updates);
      return true;
    }
    return false;
  }

  deleteRule(ruleId) {
    return this.rules.delete(ruleId);
  }
}

// Enhanced Local Storage Cache System
class EnhancedCacheSystem {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes TTL
    this.maxCacheSize = 100; // Max cached entries
    this.pendingRequests = new Map();
    this.initializeCache();
  }

  async initializeCache() {
    try {
      const stored = await chrome.storage.local.get('autofillCache');
      if (stored.autofillCache) {
        const cacheData = JSON.parse(stored.autofillCache);
        for (const [key, value] of Object.entries(cacheData)) {
          if (!this.isExpired(value.timestamp)) {
            this.cache.set(key, value);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load cache from storage:', error);
    }
  }

  async set(key, data, ttl = null) {
    const entry = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.cacheTimeout
    };

    this.cache.set(key, entry);
    await this.persistCache();

    // Cleanup if cache gets too large
    if (this.cache.size > this.maxCacheSize) {
      this.cleanup();
    }
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (this.isExpired(entry.timestamp, entry.ttl)) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry.timestamp, entry.ttl)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  isExpired(timestamp, ttl = null) {
    return Date.now() - timestamp > (ttl || this.cacheTimeout);
  }

  cleanup() {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    // Remove expired entries
    for (const [key, entry] of entries) {
      if (this.isExpired(entry.timestamp, entry.ttl)) {
        this.cache.delete(key);
      }
    }

    // If still too large, remove oldest entries
    if (this.cache.size > this.maxCacheSize) {
      const sortedEntries = entries
        .filter(([key]) => this.cache.has(key))
        .sort(([,a], [,b]) => a.timestamp - b.timestamp);

      const toRemove = this.cache.size - this.maxCacheSize;
      for (let i = 0; i < toRemove; i++) {
        if (sortedEntries[i]) {
          this.cache.delete(sortedEntries[i][0]);
        }
      }
    }
  }

  async persistCache() {
    try {
      const cacheData = {};
      for (const [key, value] of this.cache.entries()) {
        cacheData[key] = value;
      }
      await chrome.storage.local.set({
        autofillCache: JSON.stringify(cacheData)
      });
    } catch (error) {
      console.error('Failed to persist cache:', error);
    }
  }

  clear() {
    this.cache.clear();
    chrome.storage.local.remove('autofillCache');
  }

  getStats() {
    const now = Date.now();
    let expired = 0;
    let total = 0;

    for (const entry of this.cache.values()) {
      total++;
      if (this.isExpired(entry.timestamp, entry.ttl)) {
        expired++;
      }
    }

    return {
      total,
      expired,
      active: total - expired,
      memoryUsage: this.cache.size
    };
  }
}

// Enhanced Background service with full personal data management
class EnhancedBackgroundService {
  constructor() {
    this.mcpClient = new EnhancedMCPClient();
    this.fieldRules = new FieldMatchingRulesSystem();
    this.cache = new EnhancedCacheSystem();
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

        // Autofill system actions
        case 'getAutofillRules':
          const rules = await this.getAutofillRules(request.categoryId);
          sendResponse({ success: true, data: rules });
          break;

        case 'getAutofillCategories':
          const categories = this.getAutofillCategories();
          sendResponse({ success: true, data: categories });
          break;

        case 'executeAutofill':
          const autofillResult = await this.executeAutofill(request.categoryId, request.fieldData);
          sendResponse({ success: true, data: autofillResult });
          break;

        case 'getFieldData':
          const fieldData = await this.getFieldDataWithCache(request.fieldTypes, request.options);
          sendResponse({ success: true, data: fieldData });
          break;

        case 'saveFieldData':
          const saved = await this.saveFieldData(request.fieldType, request.data);
          sendResponse({ success: true, data: saved });
          break;

        case 'getCacheStats':
          const cacheStats = this.cache.getStats();
          sendResponse({ success: true, data: cacheStats });
          break;

        case 'clearCache':
          this.cache.clear();
          sendResponse({ success: true, message: 'Cache cleared' });
          break;

        // MCP API requests with cache fallback
        case 'mcpRequest':
          const mcpResult = await this.handleMCPRequest(request.data);
          sendResponse(mcpResult);
          break;

        case 'saveExtractedData':
          const extractedSave = await this.saveExtractedData(request.data, request.metadata);
          sendResponse({ success: true, data: extractedSave });
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

  // Autofill system methods
  async getAutofillRules(categoryId = null) {
    if (categoryId) {
      return this.fieldRules.getRulesByCategory(categoryId);
    }
    return this.fieldRules.getAllRules();
  }

  getAutofillCategories() {
    return Array.from(this.fieldRules.categories.values());
  }

  async executeAutofill(categoryId, fieldData = null) {
    try {
      const rules = this.fieldRules.getRulesByCategory(categoryId);
      const results = {
        filled: 0,
        errors: [],
        fieldMatches: []
      };

      for (const rule of rules) {
        // Try to get actual data from cache/API for this rule
        const actualData = await this.getFieldDataForRule(rule);
        if (actualData) {
          results.fieldMatches.push({
            rule: rule,
            data: actualData,
            applied: true,
            providedFieldData: fieldData // Include provided field data for context
          });
          results.filled++;
        }
      }

      return results;
    } catch (error) {
      console.error('Autofill execution error:', error);
      throw error;
    }
  }

  async getFieldDataWithCache(fieldTypes, options = {}) {
    const results = [];
    const uncachedTypes = [];

    // Check cache first
    for (const fieldType of fieldTypes) {
      const cacheKey = `fieldData_${fieldType}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached) {
        results.push({
          fieldType,
          data: cached,
          source: 'cache'
        });
      } else {
        uncachedTypes.push(fieldType);
      }
    }

    // Fetch uncached data from API
    if (uncachedTypes.length > 0) {
      try {
        const apiData = await this.fetchFieldDataFromAPI(uncachedTypes, options);
        
        for (const item of apiData) {
          // Cache the data
          await this.cache.set(`fieldData_${item.fieldType}`, item.data);
          
          results.push({
            ...item,
            source: 'api'
          });
        }
      } catch (error) {
        console.error('API fetch error:', error);
        // Return partial results with cache data
      }
    }

    return results;
  }

  async fetchFieldDataFromAPI(fieldTypes, options) {
    // Map field types to database field names
    const databaseFields = fieldTypes.flatMap(type => {
      switch (type) {
        case 'email': return ['email', 'contact_email', 'work_email'];
        case 'phone': return ['phone', 'mobile', 'telephone'];
        case 'name': return ['name', 'first_name', 'last_name', 'full_name'];
        case 'address': return ['address', 'street_address', 'home_address'];
        case 'city': return ['city', 'locality'];
        case 'state': return ['state', 'province', 'region'];
        case 'zip': return ['zip_code', 'postal_code'];
        case 'country': return ['country'];
        case 'company': return ['company', 'organization', 'employer'];
        default: return [type];
      }
    });

    const apiResult = await this.extractPersonalData({
      data_types: databaseFields,
      filters: options.filters || { classification: ['personal', 'public'] },
      limit: options.limit || 10
    });

    // Process and group by field type
    const groupedData = {};
    
    if (apiResult && Array.isArray(apiResult)) {
      for (const record of apiResult) {
        for (const fieldType of fieldTypes) {
          if (!groupedData[fieldType]) {
            groupedData[fieldType] = [];
          }

          // Extract relevant data for this field type
          const relevantData = this.extractRelevantDataForFieldType(record, fieldType);
          if (relevantData) {
            groupedData[fieldType].push(relevantData);
          }
        }
      }
    }

    return fieldTypes.map(fieldType => ({
      fieldType,
      data: groupedData[fieldType] || []
    }));
  }

  extractRelevantDataForFieldType(record, fieldType) {
    const content = record.content || {};
    
    switch (fieldType) {
      case 'email':
        return content.email || content.contact_email || content.work_email;
      case 'phone':
        return content.phone || content.mobile || content.telephone;
      case 'name':
        return content.full_name || content.name || 
               (content.first_name && content.last_name ? 
                `${content.first_name} ${content.last_name}` : null);
      case 'address':
        return content.address || content.street_address || content.home_address;
      case 'city':
        return content.city || content.locality;
      case 'state':
        return content.state || content.province || content.region;
      case 'zip':
        return content.zip_code || content.postal_code;
      case 'country':
        return content.country;
      case 'company':
        return content.company || content.organization || content.employer;
      default:
        return content[fieldType];
    }
  }

  async getFieldDataForRule(rule) {
    // Try to get real data for this rule pattern
    const fieldType = this.inferFieldTypeFromRule(rule);
    if (fieldType) {
      const cachedData = await this.getFieldDataWithCache([fieldType]);
      if (cachedData.length > 0 && cachedData[0].data.length > 0) {
        return cachedData[0].data[0]; // Return first match
      }
    }
    
    // Fallback to rule's default value
    return rule.value;
  }

  inferFieldTypeFromRule(rule) {
    const patternString = rule.pattern.toString().toLowerCase();
    
    if (patternString.includes('email')) return 'email';
    if (patternString.includes('tel') || patternString.includes('phone')) return 'phone';
    if (patternString.includes('name')) return 'name';
    if (patternString.includes('address')) return 'address';
    if (patternString.includes('city') || patternString.includes('level2')) return 'city';
    if (patternString.includes('state') || patternString.includes('level1')) return 'state';
    if (patternString.includes('postal') || patternString.includes('zip')) return 'zip';
    if (patternString.includes('country')) return 'country';
    if (patternString.includes('organization') || patternString.includes('company')) return 'company';
    
    return null;
  }

  async saveFieldData(fieldType, data) {
    try {
      // Save to API
      const apiResult = await this.createPersonalData(
        fieldType,
        `${fieldType.charAt(0).toUpperCase() + fieldType.slice(1)} Data`,
        data,
        { classification: 'personal' }
      );

      // Update cache
      const cacheKey = `fieldData_${fieldType}`;
      const existing = this.cache.get(cacheKey) || [];
      existing.unshift(data); // Add to beginning
      await this.cache.set(cacheKey, existing.slice(0, 10)); // Keep only 10 most recent

      return apiResult;
    } catch (error) {
      console.error('Failed to save field data:', error);
      throw error;
    }
  }

  async handleMCPRequest(requestData) {
    try {
      const { method, params } = requestData;
      
      switch (method) {
        case 'extract_personal_data':
          return await this.extractPersonalData(params);
        case 'create_personal_data':
          return await this.createPersonalData(
            params.data_type, 
            params.title, 
            params.content, 
            params.options
          );
        case 'search_personal_data':
          return await this.searchPersonalData(params.query, params.options);
        default:
          throw new Error(`Unknown MCP method: ${method}`);
      }
    } catch (error) {
      console.error('MCP request error:', error);
      return { error: error.message };
    }
  }

  async saveExtractedData(extractedData, metadata) {
    try {
      const results = [];
      const timestamp = new Date().toISOString();

      // Map our field types to valid database data types
      const dataTypeMapping = {
        'email': 'contact',
        'phone': 'contact', 
        'full_name': 'personal',
        'first_name': 'personal',
        'last_name': 'personal',
        'name': 'personal',
        'address': 'address',
        'city': 'address',
        'state': 'address', 
        'zip_code': 'address',
        'country': 'address',
        'company': 'work',
        'website': 'contact',
        'birth_date': 'personal'
      };

      // Save each field type as a separate record
      for (const [fieldType, value] of Object.entries(extractedData)) {
        const validDataType = dataTypeMapping[fieldType] || 'custom';
        const title = `${fieldType.charAt(0).toUpperCase() + fieldType.slice(1).replace('_', ' ')} - Extracted from ${metadata.title || 'Unknown Page'}`;
        
        const record = await this.createPersonalData(
          validDataType,
          title,
          {
            field_type: fieldType,
            [fieldType]: value,
            extracted_from: metadata.url,
            page_title: metadata.title,
            extraction_date: timestamp,
            source: 'browser_extension_extraction'
          },
          {
            classification: 'personal',
            tags: ['extracted', 'autofill', fieldType]
          }
        );

        results.push({
          fieldType,
          value,
          record: record
        });

        // Update cache with new data
        const cacheKey = `fieldData_${fieldType}`;
        const existing = this.cache.get(cacheKey) || [];
        existing.unshift(value); // Add to beginning
        await this.cache.set(cacheKey, existing.slice(0, 10)); // Keep only 10 most recent
      }

      // Also save as a combined profile record
      const profileRecord = await this.createPersonalData(
        'personal',
        `Profile Data - Extracted from ${metadata.title || 'Unknown Page'}`,
        {
          ...extractedData,
          extracted_from: metadata.url,
          page_title: metadata.title,
          extraction_date: timestamp,
          field_count: metadata.fieldCount,
          source: 'browser_extension_extraction'
        },
        {
          classification: 'personal',
          tags: ['extracted', 'profile', 'autofill']
        }
      );

      return {
        individual_records: results,
        profile_record: profileRecord,
        total_fields: Object.keys(extractedData).length,
        extraction_metadata: metadata
      };
    } catch (error) {
      console.error('Failed to save extracted data:', error);
      throw error;
    }
  }

  // Legacy method for backwards compatibility
  async getProfiles() {
    return this.extractPersonalData();
  }
}

// Start the enhanced background service
const backgroundService = new EnhancedBackgroundService();

console.log('🚀 Enhanced Background script loaded with Autofill System');
console.log('📡 HTTP API Server expected at: http://localhost:3001');
console.log('🗄️ MCP Server expected at: /Users/kenne/github/datadam/supabase_mcp_personal_database');
console.log('👤 User ID configured:', '399aa002-cb10-40fc-abfe-d2656eea0199 (Kenneth Lee)');
console.log('🎯 Autofill System Status:');
console.log('  📝 Field Matching Rules: Active');
console.log('  💾 Local Storage Cache: Active (10min TTL)');
console.log('  🔄 API Fallback: Enabled');
console.log('  📚 Default Categories: Personal, Contact, Address, Work');
console.log('📋 Available actions:', [
  // Personal data actions
  'extractPersonalData', 'createPersonalData', 'updatePersonalData', 
  'deletePersonalData', 'searchPersonalData', 'addPersonalDataField',
  'getConnectionStatus', 'testApiEndpoints',
  // Autofill system actions
  'getAutofillRules', 'getAutofillCategories', 'executeAutofill',
  'getFieldData', 'saveFieldData', 'getCacheStats', 'clearCache', 'mcpRequest',
  // Data extraction actions
  'saveExtractedData'
]);