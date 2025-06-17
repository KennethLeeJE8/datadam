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
   * Main method to match detected fields to database data with fuzzy tag matching
   */
  async matchFieldsToDatabase(detectedFields) {
    const results = {
      matches: [],
      missingData: [],
      errors: []
    };

    // Group fields by inferred type for batch processing
    const fieldsByType = this.groupFieldsByType(detectedFields);
    
    // Get cached data first (immediate response) with fuzzy matching support
    const cachedMatches = await this.getCachedMatchesWithTags(fieldsByType, detectedFields);
    results.matches.push(...cachedMatches.matches);
    
    // Identify fields that need fresh data from database
    const uncachedTypes = cachedMatches.missingTypes;
    
    if (uncachedTypes.length > 0) {
      try {
        // Fetch database data with tag-based fuzzy matching
        const freshData = await this.fetchDatabaseDataWithTags(detectedFields, uncachedTypes);
        
        // Process fresh data with fuzzy tag matching and update cache
        const freshMatches = this.processFreshDataWithTags(freshData, fieldsByType, detectedFields, uncachedTypes);
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
   * Fetch data from database with fuzzy tag matching
   */
  async fetchDatabaseDataWithTags(detectedFields, fieldTypes) {
    // Prevent duplicate API calls
    const requestKey = fieldTypes.sort().join(',');
    if (this.pendingRequests.has(requestKey)) {
      return await this.pendingRequests.get(requestKey);
    }

    // Generate search tags from detected fields for fuzzy matching
    const searchTags = this.generateSearchTags(detectedFields);
    
    // Build database field list from field types
    const databaseFields = new Set();
    for (const fieldType of fieldTypes) {
      const rule = this.fieldMappingRules.get(fieldType);
      if (rule) {
        rule.databaseFields.forEach(dbField => databaseFields.add(dbField));
      }
    }

    const requestPromise = this.callHTTPAPI('/api/extract_personal_data', {
      method: 'POST',
      body: JSON.stringify({
        user_id: '399aa002-cb10-40fc-abfe-d2656eea0199',
        data_types: Array.from(databaseFields),
        search_tags: searchTags, // Add fuzzy search tags
        filters: {
          classification: ['personal', 'public'],
          active: true
        },
        limit: 20 // Increase limit for better fuzzy matching
      })
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
   * Legacy method for backward compatibility
   */
  async fetchDatabaseData(fieldTypes) {
    return this.fetchDatabaseDataWithTags([], fieldTypes);
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
   * Update local cache with fresh data including fuzzy tag matches
   */
  updateCache(databaseData) {
    const timestamp = Date.now();
    
    // Group data by field types for caching (traditional approach)
    for (const [fieldType, rule] of this.fieldMappingRules) {
      const relevantData = this.findMatchingDatabaseData(databaseData, rule.databaseFields);
      
      if (relevantData.length > 0) {
        this.localCache.set(`data_${fieldType}`, {
          data: relevantData,
          timestamp: timestamp,
          source: 'traditional'
        });
      }
    }
    
    // Also cache the raw database response for fuzzy matching
    if (databaseData && databaseData.data) {
      this.localCache.set('raw_database_response', {
        data: databaseData.data,
        timestamp: timestamp,
        source: 'raw_for_fuzzy'
      });
      
      // Cache tag index for faster fuzzy matching
      const tagIndex = this.buildTagIndex(databaseData.data);
      this.localCache.set('tag_index', {
        data: tagIndex,
        timestamp: timestamp,
        source: 'tag_index'
      });
    }
  }

  /**
   * Build an index of all tags in the database for faster fuzzy matching
   */
  buildTagIndex(databaseRecords) {
    const tagIndex = new Map();
    
    for (const record of databaseRecords) {
      if (record.tags && Array.isArray(record.tags)) {
        for (const tag of record.tags) {
          const normalizedTag = tag.toLowerCase().trim();
          if (!tagIndex.has(normalizedTag)) {
            tagIndex.set(normalizedTag, []);
          }
          tagIndex.get(normalizedTag).push(record);
        }
      }
    }
    
    return tagIndex;
  }

  /**
   * Enhanced cache lookup that includes fuzzy tag matching
   */
  async getCachedMatchesWithTags(fieldsByType, detectedFields) {
    const matches = [];
    const missingTypes = [];
    
    for (const [fieldType, fields] of fieldsByType) {
      const cacheKey = `data_${fieldType}`;
      const cached = this.localCache.get(cacheKey);
      
      if (cached && !this.isCacheExpired(cached.timestamp)) {
        // Create matches for each field of this type using cached data
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
        // Try fuzzy matching from cached raw data
        const rawCache = this.localCache.get('raw_database_response');
        const tagIndexCache = this.localCache.get('tag_index');
        
        if (rawCache && tagIndexCache && 
            !this.isCacheExpired(rawCache.timestamp) && 
            !this.isCacheExpired(tagIndexCache.timestamp)) {
          
          // Perform fuzzy matching using cached data
          const fuzzyMatches = this.findFuzzyTagMatches(rawCache, detectedFields, fieldType);
          
          if (fuzzyMatches.length > 0) {
            for (const field of fields) {
              matches.push({
                field: field,
                fieldType: fieldType,
                databaseData: fuzzyMatches,
                source: 'cache_fuzzy',
                confidence: this.calculateEnhancedMatchConfidence(field, fieldType, fuzzyMatches)
              });
            }
          } else {
            missingTypes.push(fieldType);
          }
        } else {
          missingTypes.push(fieldType);
        }
      }
    }
    
    return { matches, missingTypes };
  }

  /**
   * Check if cache entry is expired
   */
  isCacheExpired(timestamp) {
    return Date.now() - timestamp > this.cacheTimeout;
  }

  /**
   * Generate search tags from detected fields for fuzzy matching
   */
  generateSearchTags(detectedFields) {
    const tags = new Set();
    
    for (const field of detectedFields) {
      // Add field type as tag
      if (field.inferredType) {
        tags.add(field.inferredType.toLowerCase());
      }
      
      // Add field identifier parts as tags
      if (field.identifier) {
        this.extractTagsFromText(field.identifier).forEach(tag => tags.add(tag));
      }
      
      // Add label parts as tags
      if (field.label) {
        this.extractTagsFromText(field.label).forEach(tag => tags.add(tag));
      }
      
      // Add name attribute parts as tags
      if (field.name) {
        this.extractTagsFromText(field.name).forEach(tag => tags.add(tag));
      }
      
      // Add placeholder text parts as tags
      if (field.placeholder) {
        this.extractTagsFromText(field.placeholder).forEach(tag => tags.add(tag));
      }
      
      // Add contextual hints as tags
      if (field.contextualHints) {
        field.contextualHints.forEach(hint => {
          this.extractTagsFromText(hint).forEach(tag => tags.add(tag));
        });
      }
      
      // Add HTML input type as tag
      if (field.element && field.element.type) {
        tags.add(field.element.type.toLowerCase());
      }
    }
    
    return Array.from(tags).filter(tag => tag.length > 2); // Filter out very short tags
  }

  /**
   * Extract meaningful tags from text using various patterns
   */
  extractTagsFromText(text) {
    const tags = new Set();
    const cleanText = text.toLowerCase().trim();
    
    // Split by common separators and clean
    const words = cleanText.split(/[\s\-_\.,:;@#\[\](){}]+/)
      .map(word => word.replace(/[^a-z0-9]/g, ''))
      .filter(word => word.length > 2);
    
    words.forEach(word => tags.add(word));
    
    // Add the full cleaned text as a tag if it's reasonable length
    const fullTag = cleanText.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    if (fullTag.length > 2 && fullTag.length < 50) {
      tags.add(fullTag);
    }
    
    return Array.from(tags);
  }

  /**
   * Calculate fuzzy match score between two strings using Levenshtein-like algorithm
   */
  calculateFuzzyScore(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Exact match gets highest score
    if (s1 === s2) return 100;
    
    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) {
      const containmentScore = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
      return Math.floor(containmentScore * 85);
    }
    
    // Calculate similarity using simple character overlap
    const chars1 = new Set(s1.split(''));
    const chars2 = new Set(s2.split(''));
    const intersection = new Set([...chars1].filter(x => chars2.has(x)));
    const union = new Set([...chars1, ...chars2]);
    
    if (union.size === 0) return 0;
    
    const jaccardSimilarity = intersection.size / union.size;
    return Math.floor(jaccardSimilarity * 70);
  }

  /**
   * Process fresh data with fuzzy tag matching
   */
  processFreshDataWithTags(freshData, fieldsByType, detectedFields, fetchedTypes) {
    const matches = [];
    const missingData = [];

    for (const fieldType of fetchedTypes) {
      const fields = fieldsByType.get(fieldType);
      const rule = this.fieldMappingRules.get(fieldType);
      
      if (!fields || !rule) continue;

      // Find matching data using both traditional field matching and fuzzy tag matching
      const traditionalMatches = this.findMatchingDatabaseData(freshData, rule.databaseFields);
      const fuzzyMatches = this.findFuzzyTagMatches(freshData, detectedFields, fieldType);
      
      // Combine and deduplicate matches
      const allMatches = this.combineAndRankMatches(traditionalMatches, fuzzyMatches);
      
      if (allMatches.length > 0) {
        for (const field of fields) {
          matches.push({
            field: field,
            fieldType: fieldType,
            databaseData: allMatches,
            source: 'database_fuzzy',
            confidence: this.calculateEnhancedMatchConfidence(field, fieldType, allMatches)
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
   * Find matches using fuzzy tag matching
   */
  findFuzzyTagMatches(databaseResponse, detectedFields, fieldType) {
    const matches = [];
    const searchTags = this.generateSearchTags(detectedFields.filter(f => this.inferDatabaseFieldType(f) === fieldType));
    
    if (!databaseResponse.data || !Array.isArray(databaseResponse.data)) {
      return matches;
    }
    
    for (const record of databaseResponse.data) {
      if (!record.tags || !Array.isArray(record.tags)) continue;
      
      let bestScore = 0;
      let matchedTag = '';
      
      // Compare each search tag with each record tag
      for (const searchTag of searchTags) {
        for (const recordTag of record.tags) {
          const score = this.calculateFuzzyScore(searchTag, recordTag);
          if (score > bestScore) {
            bestScore = score;
            matchedTag = recordTag;
          }
        }
      }
      
      // If fuzzy match score is above threshold, include this record
      if (bestScore >= 60) { // 60% similarity threshold
        // Extract the most relevant field from the record content
        const relevantValue = this.extractRelevantValue(record, fieldType);
        if (relevantValue) {
          matches.push({
            field: fieldType,
            value: relevantValue,
            record: record,
            fuzzyScore: bestScore,
            matchedTag: matchedTag,
            source: 'fuzzy_tag_match'
          });
        }
      }
    }
    
    return matches.sort((a, b) => b.fuzzyScore - a.fuzzyScore); // Sort by fuzzy score
  }

  /**
   * Extract the most relevant value from a database record based on field type
   */
  extractRelevantValue(record, fieldType) {
    const rule = this.fieldMappingRules.get(fieldType);
    if (!rule) return null;
    
    // First try to find value in the structured content
    if (record.content && typeof record.content === 'object') {
      for (const dbField of rule.databaseFields) {
        if (record.content[dbField]) {
          return record.content[dbField];
        }
      }
    }
    
    // Then try direct record fields
    for (const dbField of rule.databaseFields) {
      if (record[dbField]) {
        return record[dbField];
      }
    }
    
    // Fallback to title if it seems relevant
    if (record.title && fieldType !== 'company' && fieldType !== 'website') {
      return record.title;
    }
    
    return null;
  }

  /**
   * Combine traditional and fuzzy matches, removing duplicates and ranking by relevance
   */
  combineAndRankMatches(traditionalMatches, fuzzyMatches) {
    const combined = new Map();
    
    // Add traditional matches (higher priority)
    traditionalMatches.forEach(match => {
      const key = `${match.value}_${match.record?.id || 'unknown'}`;
      combined.set(key, {
        ...match,
        score: 90, // High score for traditional matches
        matchType: 'traditional'
      });
    });
    
    // Add fuzzy matches (avoid duplicates)
    fuzzyMatches.forEach(match => {
      const key = `${match.value}_${match.record?.id || 'unknown'}`;
      if (!combined.has(key)) {
        combined.set(key, {
          ...match,
          score: match.fuzzyScore,
          matchType: 'fuzzy'
        });
      }
    });
    
    // Convert back to array and sort by score
    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 8); // Limit to top 8 matches
  }

  /**
   * Calculate enhanced match confidence that factors in fuzzy matching
   */
  calculateEnhancedMatchConfidence(field, fieldType, matches) {
    let confidence = this.calculateMatchConfidence(field, fieldType); // Base confidence
    
    if (matches.length > 0) {
      const bestMatch = matches[0];
      
      // Boost for high fuzzy scores
      if (bestMatch.fuzzyScore >= 80) {
        confidence += 15;
      } else if (bestMatch.fuzzyScore >= 60) {
        confidence += 10;
      }
      
      // Boost for multiple good matches (indicates data richness)
      const goodMatches = matches.filter(m => (m.score || m.fuzzyScore || 0) >= 70);
      if (goodMatches.length >= 3) {
        confidence += 8;
      } else if (goodMatches.length >= 2) {
        confidence += 5;
      }
      
      // Boost for recent data
      if (bestMatch.record?.created_at) {
        const daysSinceCreated = (Date.now() - new Date(bestMatch.record.created_at)) / (1000 * 60 * 60 * 24);
        if (daysSinceCreated <= 30) {
          confidence += 5; // Recent data is more relevant
        }
      }
    }
    
    return Math.min(confidence, 100);
  }

  /**
   * Make HTTP API call instead of MCP
   */
  async callHTTPAPI(endpoint, options = {}) {
    const baseUrl = 'http://localhost:3001';
    const url = `${baseUrl}${endpoint}`;
    
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const requestOptions = { ...defaultOptions, ...options };
    
    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP API request failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('HTTP API call failed:', error);
      throw error;
    }
  }

  /**
   * Legacy MCP API call for backward compatibility
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