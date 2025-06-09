class BackgroundService {
  constructor() {
    this.detectedFields = new Map();
    this.mcpConnection = null;
    this.initialize();
  }

  initialize() {
    this.setupMessageListeners();
    this.setupContextMenu();
    this.setupNotifications();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.onPageLoad(tabId, tab.url);
      }
    });

    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.onTabActivated(activeInfo.tabId);
    });
  }

  setupContextMenu() {
    chrome.contextMenus.create({
      id: 'mcp-autofill',
      title: 'Fill with MCP Data',
      contexts: ['editable']
    });

    chrome.contextMenus.create({
      id: 'mcp-detect-fields',
      title: 'Detect Form Fields',
      contexts: ['page']
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenu(info, tab);
    });
  }

  setupNotifications() {
    chrome.notifications.onClicked.addListener((notificationId) => {
      if (notificationId.startsWith('mcp-fields-detected')) {
        const tabId = parseInt(notificationId.split('-')[3]);
        chrome.tabs.update(tabId, { active: true });
      }
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'fieldsDetected':
          await this.handleFieldsDetected(request, sender);
          sendResponse({ success: true });
          break;

        case 'getDetectedFields':
          const fields = this.detectedFields.get(sender.tab.id) || [];
          sendResponse({ fields });
          break;

        case 'requestAutofillData':
          const autofillData = await this.requestAutofillData(request.fields);
          sendResponse({ data: autofillData });
          break;

        case 'saveFormData':
          await this.saveFormData(request.data, sender.tab.url);
          sendResponse({ success: true });
          break;

        case 'getConnectionStatus':
          sendResponse({ 
            connected: this.mcpConnection?.isConnected() || false,
            status: await this.getMCPStatus()
          });
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background service error:', error);
      sendResponse({ error: error.message });
    }
  }

  async handleFieldsDetected(request, sender) {
    const tabId = sender.tab.id;
    const fields = request.fields;
    
    this.detectedFields.set(tabId, fields);
    
    await this.updateBadge(tabId, fields.length);
    
    if (fields.length > 0) {
      await this.showFieldsNotification(tabId, fields.length);
    }

    console.log(`Detected ${fields.length} fields on ${request.url}`);
  }

  async updateBadge(tabId, fieldCount) {
    if (fieldCount > 0) {
      await chrome.action.setBadgeText({
        text: fieldCount.toString(),
        tabId: tabId
      });
      
      await chrome.action.setBadgeBackgroundColor({
        color: '#4CAF50',
        tabId: tabId
      });
    } else {
      await chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
    }
  }

  async showFieldsNotification(tabId, fieldCount) {
    const tab = await chrome.tabs.get(tabId);
    const domain = new URL(tab.url).hostname;
    
    await chrome.notifications.create(`mcp-fields-detected-${tabId}`, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Form Fields Detected',
      message: `Found ${fieldCount} fillable fields on ${domain}`
    });
  }

  async handleContextMenu(info, tab) {
    switch (info.menuItemId) {
      case 'mcp-autofill':
        await this.triggerAutofill(tab.id);
        break;
        
      case 'mcp-detect-fields':
        await this.redetectFields(tab.id);
        break;
    }
  }

  async triggerAutofill(tabId) {
    const fields = this.detectedFields.get(tabId) || [];
    
    if (fields.length === 0) {
      await chrome.notifications.create('mcp-no-fields', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'No Fields Detected',
        message: 'No fillable form fields found on this page'
      });
      return;
    }

    try {
      const autofillData = await this.requestAutofillData(fields);
      
      await chrome.tabs.sendMessage(tabId, {
        action: 'performAutofill',
        data: autofillData
      });
      
    } catch (error) {
      console.error('Autofill failed:', error);
      await chrome.notifications.create('mcp-autofill-error', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Autofill Failed',
        message: 'Unable to retrieve autofill data'
      });
    }
  }

  async redetectFields(tabId) {
    await chrome.tabs.sendMessage(tabId, {
      action: 'redetectFields'
    });
  }

  async requestAutofillData(fields) {
    const fieldTypes = [...new Set(fields.map(field => field.inferredType))];
    
    try {
      if (this.mcpConnection?.isConnected()) {
        return await this.mcpConnection.extractPersonalData({
          data_types: fieldTypes,
          filters: {
            classification: ['personal', 'public']
          },
          limit: 10
        });
      } else {
        return this.getMockAutofillData(fieldTypes);
      }
    } catch (error) {
      console.error('Failed to get autofill data:', error);
      return this.getMockAutofillData(fieldTypes);
    }
  }

  getMockAutofillData(fieldTypes) {
    const mockData = {
      'email': ['john.doe@example.com', 'jane.smith@example.com'],
      'phone': ['+1-555-123-4567', '+1-555-987-6543'],
      'name': ['John Doe', 'Jane Smith'],
      'address': ['123 Main St', '456 Oak Ave'],
      'city': ['New York', 'Los Angeles'],
      'state': ['NY', 'CA'],
      'zip': ['10001', '90210'],
      'country': ['United States', 'USA'],
      'creditcard': ['4111 1111 1111 1111', '5555 5555 5555 4444'],
      'expiry': ['12/25', '06/27'],
      'birthday': ['01/15/1990', '03/22/1985']
    };

    const result = {};
    fieldTypes.forEach(type => {
      if (mockData[type]) {
        result[type] = mockData[type];
      }
    });

    return result;
  }

  async saveFormData(data, url) {
    try {
      if (this.mcpConnection?.isConnected()) {
        await this.mcpConnection.addPersonalDataField({
          data: data,
          source: url,
          timestamp: new Date().toISOString()
        });
      } else {
        await this.saveToLocalStorage(data, url);
      }
    } catch (error) {
      console.error('Failed to save form data:', error);
      throw error;
    }
  }

  async saveToLocalStorage(data, url) {
    const stored = await chrome.storage.local.get('savedFormData') || {};
    const savedData = stored.savedFormData || [];
    
    savedData.push({
      data: data,
      url: url,
      timestamp: new Date().toISOString()
    });

    await chrome.storage.local.set({ savedFormData: savedData });
  }

  async getMCPStatus() {
    try {
      const response = await chrome.runtime.sendNativeMessage(
        'com.mcp.personal_data_host',
        { action: 'ping' }
      );
      return response?.status || 'disconnected';
    } catch (error) {
      return 'disconnected';
    }
  }

  async onPageLoad(tabId, url) {
    await this.updateBadge(tabId, 0);
    
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'pageLoaded',
          url: url
        });
      } catch (error) {
        console.log('Content script not ready yet');
      }
    }, 1000);
  }

  async onTabActivated(tabId) {
    const fields = this.detectedFields.get(tabId) || [];
    await this.updateBadge(tabId, fields.length);
  }
}

const backgroundService = new BackgroundService();