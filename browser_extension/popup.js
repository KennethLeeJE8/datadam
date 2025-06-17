class PopupController {
  constructor() {
    this.currentTab = null;
    this.detectedFields = [];
    this.connectionStatus = 'disconnected';
    this.initialize();
  }

  async initialize() {
    await this.getCurrentTab();
    this.setupEventListeners();
    await this.updateConnectionStatus();
    await this.loadDetectedFields();
    await this.loadRecentData();
    this.updatePageInfo();
  }

  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tab;
  }

  setupEventListeners() {
    document.getElementById('fillAllBtn').addEventListener('click', () => {
      this.fillAllFields();
    });

    document.getElementById('detectFieldsBtn').addEventListener('click', () => {
      this.detectFields();
    });

    document.getElementById('saveFormBtn').addEventListener('click', () => {
      this.saveFormData();
    });

    document.getElementById('getProfilesBtn').addEventListener('click', () => {
      this.getProfiles();
    });

    document.getElementById('matchFieldsBtn').addEventListener('click', () => {
      this.matchFieldsToDatabase();
    });

    document.getElementById('extractDataBtn').addEventListener('click', () => {
      this.extractFilledData();
    });

    document.getElementById('optionsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('helpBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://docs.example.com/mcp-autofill' });
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    setInterval(() => {
      this.updateConnectionStatus();
    }, 5000);
  }

  async updateConnectionStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getConnectionStatus'
      });

      this.connectionStatus = response.connected ? 'connected' : 'disconnected';
      
      const statusIndicator = document.getElementById('statusIndicator');
      const statusText = document.getElementById('statusText');
      
      if (response.connected) {
        statusIndicator.className = 'status-indicator connected';
        statusText.textContent = 'Connected to MCP';
      } else {
        statusIndicator.className = 'status-indicator disconnected';
        statusText.textContent = 'MCP Disconnected';
      }
    } catch (error) {
      console.error('Failed to get connection status:', error);
      document.getElementById('statusIndicator').className = 'status-indicator disconnected';
      document.getElementById('statusText').textContent = 'Connection Error';
    }
  }

  updatePageInfo() {
    if (this.currentTab) {
      const url = new URL(this.currentTab.url);
      document.getElementById('pageUrl').textContent = url.hostname + url.pathname;
    }
  }

  async loadDetectedFields() {
    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getDetectedFields'
      });

      this.detectedFields = response.fields || [];
      this.updateFieldsDisplay();
      this.updateFieldsCount();
      this.updateActionButtons();
    } catch (error) {
      console.error('Failed to load detected fields:', error);
      this.detectedFields = [];
      this.updateFieldsDisplay();
      this.updateFieldsCount();
    }
  }

  updateFieldsDisplay() {
    const fieldsList = document.getElementById('fieldsList');
    
    if (this.detectedFields.length === 0) {
      fieldsList.innerHTML = '<div class="no-data">No fillable fields detected</div>';
      return;
    }

    const fieldsHTML = this.detectedFields
      .filter(field => field.confidence > 30)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 15)
      .map(field => `
        <div class="field-item detailed fade-in" data-field='${JSON.stringify(this.sanitizeFieldForDisplay(field))}'>
          <div class="field-header">
            <span class="field-type">${this.getFieldTypeDisplay(field)}</span>
            <span class="field-confidence ${this.getConfidenceClass(field.confidence)}">${field.confidence}%</span>
          </div>
          <div class="field-details">
            <div class="field-label">${this.getFieldDisplayName(field)}</div>
            <div class="field-selectors">
              ${field.name ? `<span class="selector-tag">name: ${field.name}</span>` : ''}
              ${field.id ? `<span class="selector-tag">id: ${field.id}</span>` : ''}
              ${field.placeholder ? `<span class="selector-tag">placeholder: ${field.placeholder}</span>` : ''}
              ${field.identifier ? `<span class="selector-tag">identifier: ${field.identifier}</span>` : ''}
            </div>
          </div>
        </div>
      `)
      .join('');

    fieldsList.innerHTML = fieldsHTML;

    // Add click handlers for detailed view
    fieldsList.querySelectorAll('.field-item').forEach(item => {
      item.addEventListener('click', () => {
        const field = JSON.parse(item.dataset.field);
        this.showFieldDetails(field);
      });
    });
  }

  formatFieldType(type) {
    const typeMap = {
      'email': '📧 Email',
      'phone': '📞 Phone',
      'name': '👤 Name',
      'address': '🏠 Address',
      'city': '🏙️ City',
      'state': '🗺️ State',
      'zip': '📮 ZIP Code',
      'country': '🌍 Country',
      'creditcard': '💳 Credit Card',
      'expiry': '📅 Expiry',
      'birthday': '🎂 Birthday',
      'website': '🌐 Website',
      'company': '🏢 Company',
      'custom': '❓ Unknown'
    };

    return typeMap[type] || `❓ ${type}`;
  }

  getFieldTypeDisplay(field) {
    // Handle the new field type system (numeric types from autofill logic)
    if (field.type !== undefined && typeof field.type === 'number') {
      const typeMap = {
        0: '📝 Text Input',
        1: '🔒 Password',
        2: '📋 Dropdown',
        3: '☑️ Checkbox/Radio'
      };
      return typeMap[field.type] || '❓ Unknown';
    }
    
    // Handle inferred types
    if (field.inferredType) {
      return this.formatFieldType(field.inferredType);
    }
    
    // Fallback to element type
    if (field.element && field.element.type) {
      return this.formatFieldType(field.element.type);
    }
    
    return '📝 Field';
  }

  sanitizeFieldForDisplay(field) {
    // Remove DOM element reference for JSON serialization and add safe display data
    return {
      identifier: field.identifier,
      type: field.type,
      name: field.name,
      id: field.id,
      label: field.label,
      placeholder: field.placeholder,
      autocomplete: field.autocomplete,
      ariaLabel: field.ariaLabel,
      contextualHints: field.contextualHints,
      xpath: field.xpath,
      inferredType: field.inferredType,
      confidence: field.confidence,
      attributes: field.attributes,
      value: field.value
    };
  }

  getFieldDisplayName(field) {
    // Priority order for display name - use identifier first if available
    if (field.identifier && field.identifier.trim()) {
      return field.identifier;
    }
    if (field.label && field.label.trim()) {
      return `"${field.label.trim()}"`;
    }
    if (field.placeholder && field.placeholder.trim()) {
      return `"${field.placeholder.trim()}"`;
    }
    if (field.ariaLabel && field.ariaLabel.trim()) {
      return `"${field.ariaLabel.trim()}"`;
    }
    if (field.name && field.name.trim()) {
      return `[name="${field.name}"]`;
    }
    if (field.id && field.id.trim()) {
      return `[id="${field.id}"]`;
    }
    return 'Unlabeled field';
  }

  getConfidenceClass(confidence) {
    if (confidence >= 80) return 'confidence-high';
    if (confidence >= 60) return 'confidence-medium';
    return 'confidence-low';
  }

  showFieldDetails(field) {
    // Create detailed popup overlay
    const overlay = document.createElement('div');
    overlay.className = 'field-details-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    const modal = document.createElement('div');
    modal.className = 'field-details-modal';
    modal.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 20px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;

    modal.innerHTML = `
      <div class="modal-header">
        <h3>${this.formatFieldType(field.inferredType)} Field Details</h3>
        <button class="close-btn" style="float: right; background: none; border: none; font-size: 20px; cursor: pointer;">&times;</button>
      </div>
      <div class="modal-content">
        <div class="detail-section">
          <strong>Confidence:</strong> <span class="${this.getConfidenceClass(field.confidence)}">${field.confidence}%</span>
        </div>
        <div class="detail-section">
          <strong>Field Type:</strong> ${field.type || 'text'}
        </div>
        <div class="detail-section">
          <strong>Display Name:</strong> ${this.getFieldDisplayName(field)}
        </div>
        ${field.name ? `<div class="detail-section"><strong>Name:</strong> ${field.name}</div>` : ''}
        ${field.id ? `<div class="detail-section"><strong>ID:</strong> ${field.id}</div>` : ''}
        ${field.placeholder ? `<div class="detail-section"><strong>Placeholder:</strong> "${field.placeholder}"</div>` : ''}
        ${field.autocomplete ? `<div class="detail-section"><strong>Autocomplete:</strong> ${field.autocomplete}</div>` : ''}
        ${field.ariaLabel ? `<div class="detail-section"><strong>Aria Label:</strong> "${field.ariaLabel}"</div>` : ''}
        ${field.contextualHints && field.contextualHints.length > 0 ? 
          `<div class="detail-section"><strong>Context Hints:</strong> ${field.contextualHints.map(hint => `"${hint}"`).join(', ')}</div>` : ''}
        ${field.xpath ? `<div class="detail-section"><strong>XPath:</strong> <code style="font-size: 11px; background: #f5f5f5; padding: 2px 4px; border-radius: 2px;">${field.xpath}</code></div>` : ''}
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers
    const closeBtn = modal.querySelector('.close-btn');
    const closeModal = () => overlay.remove();
    
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    
    // Close on escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  updateFieldsCount() {
    const count = this.detectedFields.length;
    const fieldsCountEl = document.getElementById('fieldsCount');
    
    if (count === 0) {
      fieldsCountEl.textContent = 'No form fields detected';
    } else {
      fieldsCountEl.textContent = `${count} field${count === 1 ? '' : 's'} detected`;
    }
  }

  updateActionButtons() {
    const fillAllBtn = document.getElementById('fillAllBtn');
    const saveFormBtn = document.getElementById('saveFormBtn');
    
    const hasFields = this.detectedFields.length > 0;
    fillAllBtn.disabled = !hasFields;
    saveFormBtn.disabled = !hasFields;
  }

  async fillAllFields() {
    if (this.detectedFields.length === 0) {
      this.showNotification('No fields to fill', 'error');
      return;
    }

    try {
      const fillAllBtn = document.getElementById('fillAllBtn');
      fillAllBtn.disabled = true;
      fillAllBtn.innerHTML = '<span class="btn-icon">⏳</span>Filling...';

      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'performAutofill',
        fields: this.detectedFields
      });

      this.showNotification('Fields filled successfully', 'success');
    } catch (error) {
      console.error('Failed to fill fields:', error);
      this.showNotification('Failed to fill fields', 'error');
    } finally {
      const fillAllBtn = document.getElementById('fillAllBtn');
      fillAllBtn.disabled = false;
      fillAllBtn.innerHTML = '<span class="btn-icon">📝</span>Fill All Fields';
    }
  }

  async detectFields() {
    try {
      const detectBtn = document.getElementById('detectFieldsBtn');
      detectBtn.disabled = true;
      detectBtn.innerHTML = '<span class="btn-icon">🔍</span>Scanning...';

      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'redetectFields'
      });

      setTimeout(async () => {
        await this.loadDetectedFields();
        detectBtn.disabled = false;
        detectBtn.innerHTML = '<span class="btn-icon">🔍</span>Re-scan Fields';
      }, 1000);

    } catch (error) {
      console.error('Failed to detect fields:', error);
      this.showNotification('Failed to scan fields', 'error');
    }
  }

  async saveFormData() {
    try {
      const saveBtn = document.getElementById('saveFormBtn');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="btn-icon">💾</span>Saving...';

      const formData = await this.extractFormData();
      
      await chrome.runtime.sendMessage({
        action: 'saveFormData',
        data: formData
      });

      this.showNotification('Form data saved', 'success');
      await this.loadRecentData();
    } catch (error) {
      console.error('Failed to save form data:', error);
      this.showNotification('Failed to save data', 'error');
    } finally {
      const saveBtn = document.getElementById('saveFormBtn');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span class="btn-icon">💾</span>Save Form Data';
    }
  }

  async extractFormData() {
    const response = await chrome.tabs.sendMessage(this.currentTab.id, {
      action: 'extractFormValues'
    });

    return response.data || {};
  }

  async loadRecentData() {
    try {
      const result = await chrome.storage.local.get('savedFormData');
      const recentData = (result.savedFormData || [])
        .slice(-5)
        .reverse();

      this.updateRecentDataDisplay(recentData);
    } catch (error) {
      console.error('Failed to load recent data:', error);
    }
  }

  updateRecentDataDisplay(recentData) {
    const dataList = document.getElementById('recentDataList');
    
    if (recentData.length === 0) {
      dataList.innerHTML = '<div class="no-data">No recent data</div>';
      return;
    }

    const dataHTML = recentData
      .map(item => {
        const url = new URL(item.url).hostname;
        const date = new Date(item.timestamp).toLocaleDateString();
        
        return `
          <div class="data-item" data-item='${JSON.stringify(item)}'>
            <div class="data-type">${url}</div>
            <div class="data-value">${date}</div>
          </div>
        `;
      })
      .join('');

    dataList.innerHTML = dataHTML;

    dataList.querySelectorAll('.data-item').forEach(item => {
      item.addEventListener('click', () => {
        const data = JSON.parse(item.dataset.item);
        this.useRecentData(data);
      });
    });
  }

  async useRecentData(data) {
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'fillWithData',
        data: data.data
      });

      this.showNotification('Data applied to form', 'success');
    } catch (error) {
      console.error('Failed to use recent data:', error);
      this.showNotification('Failed to apply data', 'error');
    }
  }

  async handleSearch(query) {
    const searchResults = document.getElementById('searchResults');
    
    if (query.length < 2) {
      searchResults.innerHTML = '';
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'searchPersonalData',
        query: query
      });

      if (response.results && response.results.length > 0) {
        const resultsHTML = response.results
          .slice(0, 5)
          .map(result => `
            <div class="data-item" data-value="${result.value}" data-type="${result.type}">
              <div class="data-type">${this.formatFieldType(result.type)}</div>
              <div class="data-value">${result.value}</div>
            </div>
          `)
          .join('');

        searchResults.innerHTML = resultsHTML;

        searchResults.querySelectorAll('.data-item').forEach(item => {
          item.addEventListener('click', () => {
            this.useSearchResult(item.dataset.value, item.dataset.type);
          });
        });
      } else {
        searchResults.innerHTML = '<div class="no-data">No results found</div>';
      }
    } catch (error) {
      console.error('Search failed:', error);
      searchResults.innerHTML = '<div class="no-data">Search unavailable</div>';
    }
  }

  async useSearchResult(value, type) {
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'fillFieldByType',
        fieldType: type,
        value: value
      });

      this.showNotification(`Filled ${type} field`, 'success');
    } catch (error) {
      console.error('Failed to fill field:', error);
      this.showNotification('Failed to fill field', 'error');
    }
  }

  async getProfiles() {
    try {
      const getProfilesBtn = document.getElementById('getProfilesBtn');
      getProfilesBtn.disabled = true;
      getProfilesBtn.innerHTML = '<span class="btn-icon">⏳</span>Loading...';

      const response = await chrome.runtime.sendMessage({
        action: 'getProfiles'
      });

      if (response.success) {
        if (response.profiles && response.profiles.length > 0) {
          this.displayProfiles(response.profiles);
          this.showNotification(`Loaded ${response.profiles.length} profiles`, 'success');
        } else {
          this.showNotification('No profiles found in database', 'info');
        }
      } else {
        // Handle server connection errors
        const error = response.error || 'Unknown error';
        console.error('Server error:', error);
        
        if (error.includes('MCP Server') || error.includes('connection failed')) {
          this.showServerError(error);
        } else {
          this.showNotification('Failed to load profiles: ' + error, 'error');
        }
      }
    } catch (error) {
      console.error('Failed to get profiles:', error);
      this.showNotification('Extension error: ' + error.message, 'error');
    } finally {
      const getProfilesBtn = document.getElementById('getProfilesBtn');
      getProfilesBtn.disabled = false;
      getProfilesBtn.innerHTML = '<span class="btn-icon">👤</span>Get Profiles';
    }
  }

  showServerError(errorMessage) {
    const dataList = document.getElementById('recentDataList');
    
    // Create detailed error display
    const errorHTML = `
      <div class="server-error">
        <div class="error-icon">🚫</div>
        <div class="error-title">MCP Server Not Available</div>
        <div class="error-message">${this.formatErrorMessage(errorMessage)}</div>
        <div class="error-suggestions">
          <strong>Troubleshooting:</strong>
          <ul>
            <li>Check that your MCP server is built: <code>npm run build</code></li>
            <li>Verify server path in extension settings</li>
            <li>Check server logs for database connection issues</li>
          </ul>
        </div>
      </div>
    `;
    
    dataList.innerHTML = errorHTML;
    this.showNotification('MCP Server connection failed', 'error');
  }

  formatErrorMessage(error) {
    // Make error messages more user-friendly
    if (error.includes('not found')) {
      return 'Server files not found at the configured path';
    } else if (error.includes('timeout')) {
      return 'Server took too long to start (may be missing dependencies)';
    } else if (error.includes('Database connection failed')) {
      return 'Server started but cannot connect to database';
    } else if (error.includes('ENOENT')) {
      return 'Node.js or server files not found';
    } else {
      return error;
    }
  }

  displayProfiles(profiles) {
    const dataList = document.getElementById('recentDataList');
    
    const profilesHTML = profiles
      .slice(0, 5)
      .map(profile => {
        // Handle the new aggregated profile structure
        const displayName = profile.name || 'Unnamed User';
        const displayEmail = profile.email || profile.phone || 'No contact info';
        
        // Show additional info if available
        const additionalInfo = [];
        if (profile.phone && profile.email) additionalInfo.push(profile.phone);
        if (Object.keys(profile.preferences || {}).length > 0) {
          additionalInfo.push(`${Object.keys(profile.preferences).length} preferences`);
        }
        if (Object.keys(profile.documents || {}).length > 0) {
          additionalInfo.push(`${Object.keys(profile.documents).length} documents`);
        }
        
        const extraInfo = additionalInfo.length > 0 ? ` • ${additionalInfo.join(' • ')}` : '';
        
        return `
          <div class="data-item profile-item" data-profile='${JSON.stringify(profile)}'>
            <div class="data-type">👤 ${displayName}</div>
            <div class="data-value">${displayEmail}${extraInfo}</div>
          </div>
        `;
      })
      .join('');

    dataList.innerHTML = profilesHTML;

    dataList.querySelectorAll('.profile-item').forEach(item => {
      item.addEventListener('click', () => {
        const profile = JSON.parse(item.dataset.profile);
        this.useProfileData(profile);
      });
    });
  }

  async useProfileData(profile) {
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'fillWithData',
        data: profile
      });

      this.showNotification(`Applied ${profile.name}'s data`, 'success');
    } catch (error) {
      console.error('Failed to use profile data:', error);
      this.showNotification('Failed to apply profile data', 'error');
    }
  }

  async matchFieldsToDatabase() {
    try {
      const matchBtn = document.getElementById('matchFieldsBtn');
      matchBtn.disabled = true;
      matchBtn.innerHTML = '<span class="btn-icon">🔍</span>Matching...';

      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'matchFieldsToDatabase'
      });

      if (response.success) {
        this.displayDatabaseMatches(response.matches);
        this.showNotification(`Found ${response.matches.matches.length} field matches`, 'success');
      } else {
        this.showNotification('Failed to match fields: ' + response.error, 'error');
      }
    } catch (error) {
      console.error('Failed to match fields to database:', error);
      this.showNotification('Failed to match fields', 'error');
    } finally {
      const matchBtn = document.getElementById('matchFieldsBtn');
      matchBtn.disabled = false;
      matchBtn.innerHTML = '<span class="btn-icon">🔗</span>Match to Database';
    }
  }

  displayDatabaseMatches(matchResults) {
    const dataList = document.getElementById('recentDataList');
    
    if (matchResults.matches.length === 0) {
      dataList.innerHTML = '<div class="no-data">No database matches found</div>';
      return;
    }

    const matchesHTML = matchResults.matches
      .slice(0, 10) // Show top 10 matches
      .map(match => {
        const suggestions = match.databaseData.slice(0, 3); // Top 3 suggestions per field
        const fieldName = this.getFieldDisplayName(match.field);
        
        return `
          <div class="match-item" data-match='${JSON.stringify(this.sanitizeMatchForDisplay(match))}'>
            <div class="match-header">
              <span class="match-field">${fieldName}</span>
              <span class="match-confidence confidence-${this.getConfidenceClass(match.confidence)}">${match.confidence}%</span>
            </div>
            <div class="match-suggestions">
              ${suggestions.map(suggestion => `
                <div class="suggestion-item" data-value="${suggestion.value}">
                  <span class="suggestion-value">${suggestion.value}</span>
                  <span class="suggestion-source">${match.source}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      })
      .join('');

    dataList.innerHTML = `
      <div class="matches-section">
        <h4>Database Matches (${matchResults.matches.length})</h4>
        ${matchesHTML}
      </div>
      ${matchResults.missingData.length > 0 ? `
        <div class="missing-data-section">
          <h4>Missing Data (${matchResults.missingData.length})</h4>
          ${matchResults.missingData.map(missing => `
            <div class="missing-item">
              <span class="missing-type">${missing.fieldType}</span>
              <span class="missing-count">${missing.fields.length} field(s)</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    // Add click handlers for suggestions
    dataList.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const value = item.dataset.value;
        const matchData = JSON.parse(item.closest('.match-item').dataset.match);
        this.applySuggestionToField(matchData.field, value);
      });
    });
  }

  sanitizeMatchForDisplay(match) {
    return {
      field: {
        identifier: match.field.identifier,
        name: match.field.name,
        id: match.field.id,
        label: match.field.label,
        inferredType: match.field.inferredType
      },
      fieldType: match.fieldType,
      confidence: match.confidence,
      source: match.source
    };
  }

  async applySuggestionToField(field, value) {
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'fillFieldWithValue',
        fieldIdentifier: field.identifier,
        value: value
      });

      this.showNotification(`Filled ${field.identifier} with "${value}"`, 'success');
    } catch (error) {
      console.error('Failed to fill field:', error);
      this.showNotification('Failed to fill field', 'error');
    }
  }

  async extractFilledData() {
    try {
      const extractBtn = document.getElementById('extractDataBtn');
      extractBtn.disabled = true;
      extractBtn.innerHTML = '<span class="btn-icon">📤</span>Extracting...';

      // Get filled form data from the current page
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'extractFilledFormData'
      });

      if (response.success && response.data && Object.keys(response.data).length > 0) {
        // Show extracted data to user for confirmation
        const confirmed = await this.showExtractedDataConfirmation(response.data);
        
        if (confirmed) {
          // Save to database via background service
          const saveResponse = await chrome.runtime.sendMessage({
            action: 'saveExtractedData',
            data: response.data,
            metadata: {
              url: this.currentTab.url,
              title: this.currentTab.title,
              timestamp: new Date().toISOString(),
              fieldCount: Object.keys(response.data).length
            }
          });

          if (saveResponse.success) {
            this.showNotification(`Extracted and saved ${Object.keys(response.data).length} fields`, 'success');
            await this.loadRecentData(); // Refresh recent data
          } else {
            this.showNotification('Failed to save extracted data: ' + saveResponse.error, 'error');
          }
        }
      } else {
        this.showNotification('No filled form data found on this page', 'info');
      }
    } catch (error) {
      console.error('Failed to extract data:', error);
      this.showNotification('Failed to extract data: ' + error.message, 'error');
    } finally {
      const extractBtn = document.getElementById('extractDataBtn');
      extractBtn.disabled = false;
      extractBtn.innerHTML = '<span class="btn-icon">📤</span>Extract Data';
    }
  }

  async showExtractedDataConfirmation(extractedData) {
    return new Promise((resolve) => {
      // Create confirmation modal
      const overlay = document.createElement('div');
      overlay.className = 'extract-confirmation-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      `;

      const modal = document.createElement('div');
      modal.className = 'extract-confirmation-modal';
      modal.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 20px;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      `;

      // Build data display
      const dataItems = Object.entries(extractedData)
        .map(([fieldType, value]) => `
          <div class="extracted-item">
            <span class="extracted-type">${this.formatFieldType(fieldType)}:</span>
            <span class="extracted-value">"${value}"</span>
          </div>
        `)
        .join('');

      modal.innerHTML = `
        <div class="modal-header">
          <h3>📤 Confirm Data Extraction</h3>
          <button class="close-btn" style="float: right; background: none; border: none; font-size: 20px; cursor: pointer;">&times;</button>
        </div>
        <div class="modal-content">
          <p>Found ${Object.keys(extractedData).length} filled fields. Save this data to your personal database?</p>
          <div class="extracted-data-preview">
            ${dataItems}
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
          <button class="cancel-btn" style="padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button class="confirm-btn" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Save Data</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Event handlers
      const closeModal = (result) => {
        overlay.remove();
        resolve(result);
      };

      modal.querySelector('.close-btn').addEventListener('click', () => closeModal(false));
      modal.querySelector('.cancel-btn').addEventListener('click', () => closeModal(false));
      modal.querySelector('.confirm-btn').addEventListener('click', () => closeModal(true));
      
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(false);
      });

      // Close on escape key
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          closeModal(false);
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    });
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      ${type === 'success' ? 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : ''}
      ${type === 'error' ? 'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;' : ''}
      ${type === 'info' ? 'background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;' : ''}
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});