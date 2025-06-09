const FIELD_MAPPINGS = {
  'email': ['email', 'e-mail', 'emailaddress', 'mail'],
  'phone': ['phone', 'tel', 'mobile', 'cellphone', 'phonenumber'],
  'name': ['name', 'fullname', 'firstname', 'lastname', 'givenname'],
  'address': ['address', 'street', 'addr', 'location'],
  'city': ['city', 'town', 'locality'],
  'state': ['state', 'province', 'region'],
  'zip': ['zip', 'zipcode', 'postal', 'postcode'],
  'country': ['country', 'nation'],
  'creditcard': ['card', 'cardnumber', 'cc-number'],
  'expiry': ['expiry', 'exp-date', 'expiration'],
  'birthday': ['birthday', 'birthdate', 'dob', 'dateofbirth']
};

const EXCLUDED_FIELD_INDICATORS = [
  'search', 'query', 'q', 'filter', 'find', 'lookup', 'keywords',
  'searchterm', 'searchquery', 'searchbox', 'searchfield',
  'comment', 'message', 'note', 'description', 'feedback', 'review',
  'captcha', 'verify', 'verification', 'code', 'token',
  'otp', 'pin', 'security', 'challenge',
  'password', 'pass', 'pwd', 'username', 'userid', 'login', 'account',
  'ssn', 'socialsecurity', 'taxid', 'cvv', 'cvc', 'securitycode'
];

const PERSONAL_DATA_INDICATORS = [
  'email', 'phone', 'name', 'address', 'city', 'state', 'zip', 'country',
  'creditcard', 'card', 'expiry', 'birthday', 'firstname', 'lastname', 'fullname',
  'billing', 'shipping', 'contact', 'personal', 'profile'
];

class FieldDetector {
  constructor() {
    this.detectedFields = [];
    this.observer = null;
    this.initialize();
  }

  initialize() {
    this.detectFormFields();
    this.observeFieldChanges();
    this.addVisualIndicators();
  }

  detectFormFields() {
    const fields = [];
    const inputs = document.querySelectorAll('input, textarea, select');
    
    inputs.forEach(element => {
      if (this.isValidField(element)) {
        const fieldData = this.analyzeField(element);
        if (fieldData.confidence > 40 && fieldData.inferredType !== 'custom') {
          fields.push(fieldData);
        }
      }
    });

    this.detectedFields = fields;
    console.log('Detected personal data fields:', fields);
    
    chrome.runtime.sendMessage({
      action: 'fieldsDetected',
      fields: fields,
      url: window.location.href
    });

    return fields;
  }

  isValidField(element) {
    if (element.type === 'hidden' || element.type === 'submit' || element.type === 'button') {
      return false;
    }
    
    if (element.disabled || element.readOnly) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    if (!this.isPersonalDataField(element)) {
      return false;
    }

    return true;
  }

  isPersonalDataField(element) {
    let labelText = '';
    if (element.labels && element.labels.length > 0) {
      labelText = element.labels[0].textContent.trim();
    } else {
      const labelElement = document.querySelector(`label[for="${element.id}"]`);
      if (labelElement) {
        labelText = labelElement.textContent.trim();
      } else {
        const parentLabel = element.closest('label');
        if (parentLabel) {
          labelText = parentLabel.textContent.replace(element.value, '').trim();
        }
      }
    }

    const textToAnalyze = [
      element.name || '',
      element.id || '',
      element.placeholder || '',
      element.getAttribute('aria-label') || '',
      element.className || '',
      labelText
    ].join(' ').toLowerCase();

    if (element.type === 'search') {
      return false;
    }

    for (const excludedTerm of EXCLUDED_FIELD_INDICATORS) {
      if (textToAnalyze.includes(excludedTerm)) {
        return false;
      }
    }

    for (const personalTerm of PERSONAL_DATA_INDICATORS) {
      if (textToAnalyze.includes(personalTerm)) {
        return true;
      }
    }

    if (element.type === 'email' || element.type === 'tel') {
      return true;
    }

    if (element.autocomplete && element.autocomplete !== 'off') {
      const autocompleteValues = [
        'email', 'tel', 'given-name', 'family-name', 'name',
        'street-address', 'address-line1', 'address-line2',
        'locality', 'region', 'postal-code', 'country',
        'cc-number', 'cc-exp', 'bday'
      ];
      
      if (autocompleteValues.includes(element.autocomplete.toLowerCase())) {
        return true;
      }
    }

    if (element.closest('form')) {
      const form = element.closest('form');
      const formText = (form.className + ' ' + (form.id || '')).toLowerCase();
      
      if (formText.includes('search') || formText.includes('filter')) {
        return false;
      }
      
      if (formText.includes('signup') || formText.includes('register') || 
          formText.includes('contact') || formText.includes('checkout') ||
          formText.includes('billing') || formText.includes('profile')) {
        return true;
      }
    }

    return false;
  }

  analyzeField(element) {
    const fieldData = {
      element: element,
      type: element.type || 'text',
      name: element.name || '',
      id: element.id || '',
      label: this.getFieldLabel(element),
      placeholder: element.placeholder || '',
      autocomplete: element.autocomplete || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      contextualHints: this.getContextualHints(element),
      xpath: this.getXPath(element)
    };

    fieldData.inferredType = this.inferFieldType(fieldData);
    fieldData.confidence = this.calculateConfidence(fieldData);

    return fieldData;
  }

  getFieldLabel(element) {
    if (element.labels && element.labels.length > 0) {
      return element.labels[0].textContent.trim();
    }

    const labelElement = document.querySelector(`label[for="${element.id}"]`);
    if (labelElement) {
      return labelElement.textContent.trim();
    }

    const parentLabel = element.closest('label');
    if (parentLabel) {
      return parentLabel.textContent.replace(element.value, '').trim();
    }

    return '';
  }

  getContextualHints(element) {
    const hints = [];
    
    const previousSibling = element.previousElementSibling;
    if (previousSibling && previousSibling.textContent) {
      hints.push(previousSibling.textContent.trim());
    }

    const parent = element.parentElement;
    if (parent) {
      const textNodes = Array.from(parent.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .filter(text => text.length > 0);
      
      hints.push(...textNodes);
    }

    return hints;
  }

  getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    
    const parts = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let hasFollowingSiblings = false;
      let hasPrecedingSiblings = false;
      
      for (let sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
          hasPrecedingSiblings = true;
          index++;
        }
      }
      
      for (let sibling = element.nextSibling; sibling; sibling = sibling.nextSibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
          hasFollowingSiblings = true;
          break;
        }
      }
      
      const tagName = element.nodeName.toLowerCase();
      const pathIndex = (hasPrecedingSiblings || hasFollowingSiblings) ? `[${index + 1}]` : '';
      parts.splice(0, 0, tagName + pathIndex);
      
      element = element.parentNode;
    }
    
    return parts.length ? '/' + parts.join('/') : '';
  }

  inferFieldType(fieldData) {
    const textToAnalyze = [
      fieldData.name,
      fieldData.id,
      fieldData.label,
      fieldData.placeholder,
      fieldData.ariaLabel,
      ...fieldData.contextualHints
    ].join(' ').toLowerCase();

    if (fieldData.type === 'email') return 'email';
    if (fieldData.type === 'tel') return 'phone';
    if (fieldData.type === 'password') return 'password';
    if (fieldData.autocomplete) {
      const autocompleteType = this.mapAutocompleteToType(fieldData.autocomplete);
      if (autocompleteType) return autocompleteType;
    }

    for (const [fieldType, keywords] of Object.entries(FIELD_MAPPINGS)) {
      for (const keyword of keywords) {
        if (textToAnalyze.includes(keyword)) {
          return fieldType;
        }
      }
    }

    return 'custom';
  }

  mapAutocompleteToType(autocomplete) {
    const mapping = {
      'email': 'email',
      'tel': 'phone',
      'given-name': 'name',
      'family-name': 'name',
      'name': 'name',
      'street-address': 'address',
      'address-line1': 'address',
      'address-line2': 'address',
      'locality': 'city',
      'region': 'state',
      'postal-code': 'zip',
      'country': 'country',
      'cc-number': 'creditcard',
      'cc-csc': 'cvv',
      'cc-exp': 'expiry',
      'username': 'username',
      'current-password': 'password',
      'new-password': 'password',
      'bday': 'birthday'
    };

    return mapping[autocomplete.toLowerCase()] || null;
  }

  calculateConfidence(fieldData) {
    let confidence = 0;

    if (fieldData.type === 'email' || fieldData.type === 'tel' || fieldData.type === 'password') {
      confidence += 40;
    }

    if (fieldData.autocomplete) {
      confidence += 30;
    }

    if (fieldData.label) {
      confidence += 20;
    }

    if (fieldData.name || fieldData.id) {
      confidence += 10;
    }

    if (fieldData.placeholder || fieldData.ariaLabel) {
      confidence += 10;
    }

    if (fieldData.contextualHints.length > 0) {
      confidence += 5;
    }

    return Math.min(confidence, 100);
  }

  observeFieldChanges() {
    this.observer = new MutationObserver((mutations) => {
      let shouldRedetect = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const newFields = node.querySelectorAll ? 
                node.querySelectorAll('input, textarea, select') : [];
              if (newFields.length > 0 || 
                  ['input', 'textarea', 'select'].includes(node.tagName?.toLowerCase())) {
                shouldRedetect = true;
              }
            }
          });
        }
      });

      if (shouldRedetect) {
        setTimeout(() => this.detectFormFields(), 100);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  addVisualIndicators() {
    this.detectedFields.forEach(field => {
      if (field.element && field.confidence > 50) {
        field.element.style.outline = '2px solid #4CAF50';
        field.element.style.outlineOffset = '1px';
        
        field.element.addEventListener('focus', () => {
          this.showFieldInfo(field);
        });
      }
    });
  }

  showFieldInfo(field) {
    const existingTooltip = document.querySelector('.mcp-field-tooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }

    const tooltip = document.createElement('div');
    tooltip.className = 'mcp-field-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      background: #333;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      pointer-events: none;
      max-width: 200px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    
    tooltip.textContent = `Type: ${field.inferredType} (${field.confidence}% confidence)`;
    
    const rect = field.element.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    
    document.body.appendChild(tooltip);
    
    field.element.addEventListener('blur', () => {
      tooltip.remove();
    }, { once: true });
  }

  getDetectedFields() {
    return this.detectedFields;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDetectedFields') {
    sendResponse({ fields: fieldDetector.getDetectedFields() });
  } else if (request.action === 'redetectFields') {
    fieldDetector.detectFormFields();
    sendResponse({ success: true });
  }
});

const fieldDetector = new FieldDetector();