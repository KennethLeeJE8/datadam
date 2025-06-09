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
      fieldsList.innerHTML = '<div class="no-data">No form fields detected</div>';
      return;
    }

    const fieldsHTML = this.detectedFields
      .filter(field => field.confidence > 30)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map(field => `
        <div class="field-item fade-in">
          <span class="field-type">${this.formatFieldType(field.inferredType)}</span>
          <span class="field-confidence">${field.confidence}%</span>
        </div>
      `)
      .join('');

    fieldsList.innerHTML = fieldsHTML;
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
      'custom': '❓ Unknown'
    };

    return typeMap[type] || `❓ ${type}`;
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