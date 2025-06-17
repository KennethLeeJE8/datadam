/**
 * Database Field Matching Engine
 * Matches detected form fields to personal data in database with low-latency caching
 */

class DatabaseFieldMatcher {
  constructor() {
    this.localCache = new Map();
    this.fieldMappingRules = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes TTL
    this.pendingRequests = new Map(); // Prevent duplicate API calls
    this.initializeFieldMappingRules();
  }

  /**
   * Initialize field mapping rules based on common patterns
   */
  initializeFieldMappingRules() {
    // Email field patterns
    this.addMappingRule('email', {
      patterns: [/email/i, /e-?mail/i, /mail/i, /@/],
      databaseFields: ['email', 'contact_email', 'work_email', 'personal_email'],
      priority: 10
    });

    // Phone field patterns  
    this.addMappingRule('phone', {
      patterns: [/phone/i, /tel/i, /mobile/i, /cell/i, /contact/i],
      databaseFields: ['phone', 'mobile', 'telephone', 'contact_phone'],
      priority: 9
    });

    // Name field patterns
    this.addMappingRule('firstName', {
      patterns: [/first.*name/i, /given.*name/i, /fname/i, /firstname/i],
      databaseFields: ['first_name', 'given_name', 'name'],
      priority: 8
    });

    this.addMappingRule('lastName', {
      patterns: [/last.*name/i, /family.*name/i, /surname/i, /lname/i, /lastname/i],
      databaseFields: ['last_name', 'family_name', 'surname'],
      priority: 8
    });

    this.addMappingRule('fullName', {
      patterns: [/full.*name/i, /complete.*name/i, /name/i],
      databaseFields: ['full_name', 'name', 'display_name'],
      priority: 7
    });

    // Address field patterns
    this.addMappingRule('address', {
      patterns: [/address/i, /street/i, /addr/i, /location/i],
      databaseFields: ['address', 'street_address', 'home_address'],
      priority: 6
    });

    this.addMappingRule('city', {
      patterns: [/city/i, /town/i, /locality/i],
      databaseFields: ['city', 'locality', 'town'],
      priority: 6
    });

    this.addMappingRule('state', {
      patterns: [/state/i, /province/i, /region/i],
      databaseFields: ['state', 'province', 'region'],
      priority: 6
    });

    this.addMappingRule('zipCode', {
      patterns: [/zip/i, /postal/i, /postcode/i],
      databaseFields: ['zip_code', 'postal_code', 'postcode'],
      priority: 6
    });

    this.addMappingRule('country', {
      patterns: [/country/i, /nation/i],
      databaseFields: ['country', 'nationality'],
      priority: 6
    });

    // Date fields
    this.addMappingRule('birthDate', {
      patterns: [/birth/i, /birthday/i, /born/i, /dob/i],
      databaseFields: ['birth_date', 'date_of_birth', 'birthday'],
      priority: 5
    });

    // Website fields
    this.addMappingRule('website', {
      patterns: [/website/i, /url/i, /web/i, /site/i, /homepage/i, /link/i],
      databaseFields: ['website', 'url', 'homepage', 'web_url', 'site_url'],
      priority: 7
    });

    // Company fields
    this.addMappingRule('company', {
      patterns: [/company/i, /organization/i, /business/i, /employer/i, /firm/i, /corporation/i, /org/i],
      databaseFields: ['company', 'organization', 'employer', 'business_name', 'company_name'],
      priority: 7
    });
  }

  /**
   * Add a field mapping rule
   */
  addMappingRule(fieldType, rule) {
    this.fieldMappingRules.set(fieldType, rule);
  }

  /**
   * Main method to match detected fields to database data
   */
  async matchFieldsToDatabase(detectedFields) {
    const results = {
      matches: [],
      missingData: [],
      errors: []
    };

    // Group fields by inferred type for batch processing
    const fieldsByType = this.groupFieldsByType(detectedFields);
    
    // Get cached data first (immediate response)
    const cachedMatches = await this.getCachedMatches(fieldsByType);
    results.matches.push(...cachedMatches.matches);
    
    // Identify fields that need fresh data from database
    const uncachedTypes = cachedMatches.missingTypes;
    
    if (uncachedTypes.length > 0) {
      try {
        // Batch API call for missing data types
        const freshData = await this.fetchDatabaseData(uncachedTypes);
        
        // Process fresh data and update cache
        const freshMatches = this.processFreshData(freshData, fieldsByType, uncachedTypes);
        results.matches.push(...freshMatches.matches);
        results.missingData.push(...freshMatches.missingData);
        
        // Update cache with fresh data
        this.updateCache(freshData);
        
      } catch (error) {
        console.error('Database fetch error:', error);
        results.errors.push({
          type: 'database_fetch_error',
          message: error.message,
          affectedTypes: uncachedTypes
        });
      }
    }

    return results;
  }

  /**
   * Group detected fields by their inferred types
   */
  groupFieldsByType(detectedFields) {
    const grouped = new Map();
    
    for (const field of detectedFields) {
      const matchedType = this.inferDatabaseFieldType(field);
      
      if (matchedType) {
        if (!grouped.has(matchedType)) {
          grouped.set(matchedType, []);
        }
        grouped.get(matchedType).push(field);
      }
    }
    
    return grouped;
  }

  /**
   * Infer database field type from detected field using fuzzy matching
   */
  inferDatabaseFieldType(field) {
    let bestMatch = null;
    let highestScore = 0;

    // Get all text to analyze from field
    const searchTargets = [
      field.identifier,
      field.label,
      field.name,
      field.id,
      field.placeholder,
      field.ariaLabel,
      ...(field.contextualHints || [])
    ].filter(Boolean);

    const searchText = searchTargets.join(' ').toLowerCase();

    // Test against each mapping rule
    for (const [fieldType, rule] of this.fieldMappingRules) {
      let score = 0;

      // Check each pattern in the rule
      for (const pattern of rule.patterns) {
        if (pattern instanceof RegExp) {
          if (pattern.test(searchText)) {
            score += rule.priority;
          }
        } else {
          if (searchText.includes(pattern.toLowerCase())) {
            score += rule.priority;
          }
        }
      }

      // Bonus for exact field type matches
      if (field.inferredType === fieldType) {
        score += 5;
      }

      // Bonus for HTML5 input types
      if (field.element && field.element.type) {
        const inputType = field.element.type.toLowerCase();
        if ((fieldType === 'email' && inputType === 'email') ||
            (fieldType === 'phone' && inputType === 'tel')) {
          score += 8;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = fieldType;
      }
    }

    return highestScore > 3 ? bestMatch : null; // Minimum confidence threshold
  }

  /**
   * Get matches from local cache
   */
  async getCachedMatches(fieldsByType) {
    const matches = [];
    const missingTypes = [];
    
    for (const [fieldType, fields] of fieldsByType) {
      const cacheKey = `data_${fieldType}`;
      const cached = this.localCache.get(cacheKey);
      
      if (cached && !this.isCacheExpired(cached.timestamp)) {
        // Create matches for each field of this type
        for (const field of fields) {
          matches.push({
            field: field,
            fieldType: fieldType,
            databaseData: cached.data,
            source: 'cache',
            confidence: this.calculateMatchConfidence(field, fieldType)
          });
        }
      } else {
        missingTypes.push(fieldType);
      }
    }
    
    return { matches, missingTypes };
  }

  /**
   * Fetch data from database via MCP API
   */
  async fetchDatabaseData(fieldTypes) {
    // Prevent duplicate API calls
    const requestKey = fieldTypes.sort().join(',');
    if (this.pendingRequests.has(requestKey)) {
      return await this.pendingRequests.get(requestKey);
    }

    // Build database field list from field types
    const databaseFields = new Set();
    for (const fieldType of fieldTypes) {
      const rule = this.fieldMappingRules.get(fieldType);
      if (rule) {
        rule.databaseFields.forEach(dbField => databaseFields.add(dbField));
      }
    }

    const requestPromise = this.callMCPAPI({
      method: 'extract_personal_data',
      params: {
        data_types: Array.from(databaseFields),
        filters: {
          classification: ['personal', 'public'],
          active: true
        },
        limit: 5 // Get multiple options for each type
      }
    });

    this.pendingRequests.set(requestKey, requestPromise);
    
    try {
      const result = await requestPromise;
      this.pendingRequests.delete(requestKey);
      return result;
    } catch (error) {
      this.pendingRequests.delete(requestKey);
      throw error;
    }
  }

  /**
   * Process fresh data from database
   */
  processFreshData(freshData, fieldsByType, fetchedTypes) {
    const matches = [];
    const missingData = [];

    for (const fieldType of fetchedTypes) {
      const fields = fieldsByType.get(fieldType);
      const rule = this.fieldMappingRules.get(fieldType);
      
      if (!fields || !rule) continue;

      // Find matching data for this field type
      const matchingData = this.findMatchingDatabaseData(freshData, rule.databaseFields);
      
      if (matchingData.length > 0) {
        for (const field of fields) {
          matches.push({
            field: field,
            fieldType: fieldType,
            databaseData: matchingData,
            source: 'database',
            confidence: this.calculateMatchConfidence(field, fieldType)
          });
        }
      } else {
        missingData.push({
          fieldType: fieldType,
          fields: fields,
          requestedDatabaseFields: rule.databaseFields
        });
      }
    }

    return { matches, missingData };
  }

  /**
   * Find matching data in database response
   */
  findMatchingDatabaseData(databaseResponse, targetFields) {
    const matches = [];
    
    if (databaseResponse.data && Array.isArray(databaseResponse.data)) {
      for (const record of databaseResponse.data) {
        for (const targetField of targetFields) {
          if (record[targetField] && record[targetField].trim()) {
            matches.push({
              field: targetField,
              value: record[targetField],
              record: record
            });
          }
        }
      }
    }
    
    return matches;
  }

  /**
   * Calculate confidence score for field match
   */
  calculateMatchConfidence(field, fieldType) {
    let confidence = 50; // Base confidence
    
    // Boost for high-confidence field detection
    if (field.confidence > 80) {
      confidence += 20;
    } else if (field.confidence > 60) {
      confidence += 10;
    }
    
    // Boost for exact type matches
    if (field.inferredType === fieldType) {
      confidence += 15;
    }
    
    // Boost for strong identifiers
    if (field.identifier && field.identifier.length > 5) {
      confidence += 10;
    }
    
    return Math.min(confidence, 100);
  }

  /**
   * Update local cache with fresh data
   */
  updateCache(databaseData) {
    const timestamp = Date.now();
    
    // Group data by field types for caching
    for (const [fieldType, rule] of this.fieldMappingRules) {
      const relevantData = this.findMatchingDatabaseData(databaseData, rule.databaseFields);
      
      if (relevantData.length > 0) {
        this.localCache.set(`data_${fieldType}`, {
          data: relevantData,
          timestamp: timestamp
        });
      }
    }
  }

  /**
   * Check if cache entry is expired
   */
  isCacheExpired(timestamp) {
    return Date.now() - timestamp > this.cacheTimeout;
  }

  /**
   * Make API call to MCP server
   */
  async callMCPAPI(request) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'mcpRequest',
        data: request
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Clear expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.localCache) {
      if (this.isCacheExpired(value.timestamp)) {
        this.localCache.delete(key);
      }
    }
  }

  /**
   * Get match suggestions for autofill
   */
  getMatchSuggestions(fieldMatch) {
    const suggestions = [];
    
    if (fieldMatch.databaseData && Array.isArray(fieldMatch.databaseData)) {
      for (const data of fieldMatch.databaseData) {
        suggestions.push({
          value: data.value,
          label: this.formatSuggestionLabel(data),
          confidence: fieldMatch.confidence,
          source: fieldMatch.source,
          lastUsed: data.record?.last_used
        });
      }
    }
    
    // Sort by relevance and last used
    return suggestions.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      if (a.lastUsed && b.lastUsed) {
        return new Date(b.lastUsed) - new Date(a.lastUsed);
      }
      return 0;
    }).slice(0, 5); // Limit to top 5 suggestions
  }

  /**
   * Format suggestion label for display
   */
  formatSuggestionLabel(data) {
    if (data.record?.profile_name) {
      return `${data.value} (${data.record.profile_name})`;
    }
    return data.value;
  }
}

// Export for use in content script
window.DatabaseFieldMatcher = DatabaseFieldMatcher;