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
  'birthday': ['birthday', 'birthdate', 'dob', 'dateofbirth'],
  'website': ['website', 'url', 'web', 'site', 'homepage', 'weburl', 'link'],
  'company': ['company', 'organization', 'business', 'employer', 'firm', 'corporation', 'org']
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
    this.fieldCache = new Map();
    this.isGoogleForms = this.detectGoogleForms();
    this.isMicrosoftForms = this.detectMicrosoftForms();
    this.initialize();
  }

  /**
   * Detect if current page is Google Forms
   */
  detectGoogleForms() {
    return document.body?.hasAttribute("jsaction") && 
           document.URL.toLowerCase().includes("docs.google.com/forms");
  }

  /**
   * Detect if current page is Microsoft Forms  
   */
  detectMicrosoftForms() {
    return !this.isGoogleForms && 
           /forms\.(microsoft|office)\.com\/pages\/responsepage/i.test(document.URL);
  }

  initialize() {
    this.detectFormFields();
    this.observeFieldChanges();
    this.addVisualIndicators();
  }

  detectFormFields() {
    const fields = [];
    
    if (this.isGoogleForms) {
      // For Google Forms, detect by question containers instead of individual elements
      fields.push(...this.detectGoogleFormsFields());
    } else {
      // Standard detection for other sites
      const elements = this.getAllInputElements();
      elements.forEach(element => {
        if (this.isElementFillable(element)) {
          const fieldData = this.analyzeField(element);
          if (fieldData && fieldData.confidence > 30) {
            fields.push(fieldData);
          }
        }
      });
    }

    this.detectedFields = fields;
    console.log(`🎯 Detected ${fields.length} fillable fields total:`, fields);
    
    chrome.runtime.sendMessage({
      action: 'fieldsDetected',
      fields: fields,
      url: window.location.href
    });

    return fields;
  }

  /**
   * Specialized Google Forms field detection by question containers
   */
  detectGoogleFormsFields() {
    const fields = [];
    
    console.log('🔍 Google Forms detected, using container-based detection');
    
    // Find all question containers
    const questionContainers = document.querySelectorAll(
      '.freebirdFormviewerViewItemsItemItem, ' +
      '[data-params], ' +
      '.freebirdFormviewerComponentsQuestionBaseRoot, ' +
      '[role="group"]'
    );
    
    console.log(`🔍 Found ${questionContainers.length} question containers`);
    
    questionContainers.forEach((container, index) => {
      console.log(`🔍 Processing question container ${index + 1}:`, container);
      
      // Find the actual input element within this container
      const inputElement = this.findInputInContainer(container);
      
      if (inputElement && this.isElementFillable(inputElement)) {
        const fieldData = this.analyzeGoogleFormsField(container, inputElement);
        if (fieldData && fieldData.confidence > 30) {
          fields.push(fieldData);
          console.log('✅ Google Forms field detected:', {
            identifier: fieldData.identifier,
            type: fieldData.type,
            confidence: fieldData.confidence,
            label: fieldData.label
          });
        }
      }
    });
    
    return fields;
  }

  /**
   * Find the actual input element within a Google Forms question container
   */
  findInputInContainer(container) {
    // Look for actual input elements first
    const inputs = container.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], textarea');
    if (inputs.length > 0) {
      return inputs[0]; // Return the first actual input
    }
    
    // Look for custom Google Forms input elements
    const customInputs = container.querySelectorAll(
      'div[role="textbox"], ' +
      'div[role="combobox"], ' +
      'div[role="listbox"], ' +
      'div[contenteditable="true"], ' +
      'div[jsaction*="input"], ' +
      'div[jsaction*="change"]'
    );
    
    if (customInputs.length > 0) {
      return customInputs[0];
    }
    
    return null;
  }

  /**
   * Analyze Google Forms field using both container and input element
   */
  analyzeGoogleFormsField(container, inputElement) {
    const fieldData = {
      element: inputElement,
      identifier: this.generateGoogleFormsIdentifier(container, inputElement),
      type: this.determineFieldType(inputElement),
      value: this.getCurrentValue(inputElement),
      name: inputElement.name || '',
      id: inputElement.id || '',
      label: this.getGoogleFormsLabel(container),
      placeholder: inputElement.placeholder || '',
      autocomplete: inputElement.autocomplete || '',
      ariaLabel: inputElement.getAttribute('aria-label') || '',
      contextualHints: this.getGoogleFormsContextualHints(container),
      xpath: this.getXPath(inputElement),
      attributes: this.extractRelevantAttributes(inputElement)
    };

    fieldData.inferredType = this.inferFieldType(fieldData);
    fieldData.confidence = this.calculateAdvancedConfidence(fieldData);

    return fieldData.identifier ? fieldData : null;
  }

  /**
   * Generate identifier specifically for Google Forms using question container
   */
  generateGoogleFormsIdentifier(container, inputElement) {
    // Try to get the question text from the container
    const questionText = this.getGoogleFormsLabel(container);
    if (questionText) {
      return `"${questionText}"`;
    }
    
    // Fallback to standard identifier generation
    return this.generateFieldIdentifier(inputElement);
  }

  /**
   * Get label/question text from Google Forms container
   */
  getGoogleFormsLabel(container) {
    // Look for question heading/title elements
    const headingSelectors = [
      '[role="heading"]',
      '.freebirdFormviewerViewItemsItemItemTitle',
      '.exportLabel',
      'div[jsname] span',
      'div[dir] span'
    ];
    
    for (const selector of headingSelectors) {
      const heading = container.querySelector(selector);
      if (heading && heading.textContent.trim()) {
        return heading.textContent.trim();
      }
    }
    
    // Look for any prominent text in the container
    const textElements = container.querySelectorAll('span, div');
    for (const element of textElements) {
      const text = element.textContent.trim();
      if (text.length > 2 && text.length < 100 && 
          !text.includes('Your answer') && 
          !text.includes('Required') &&
          element.children.length === 0) { // Leaf text node
        return text;
      }
    }
    
    return null;
  }

  /**
   * Get contextual hints from Google Forms container
   */
  getGoogleFormsContextualHints(container) {
    const hints = [];
    
    // Get all text content from the container
    const allText = container.textContent || '';
    hints.push(allText);
    
    // Look for help text or descriptions
    const helpText = container.querySelector('.freebirdFormviewerViewItemsItemItemHelpText');
    if (helpText) {
      hints.push(helpText.textContent.trim());
    }
    
    return hints.filter(hint => hint && hint.trim().length > 0);
  }

  /**
   * Get all input elements from the page using advanced selectors
   */
  getAllInputElements() {
    const selectors = [
      'input:not([disabled]):not([hidden]):not([readonly])',
      'select:not([disabled]):not([readonly])', 
      'textarea:not([disabled]):not([readonly])',
      '[contenteditable="true"]:not(html):not(body)',
      'iframe'
    ];

    // Add Google Forms specific selectors
    if (this.isGoogleForms) {
      selectors.push(
        // Text input fields in Google Forms
        'input[type="text"]',
        'input[type="email"]', 
        'input[type="tel"]',
        'input[type="url"]',
        'input[type="number"]',
        'input[type="date"]',
        'input[type="time"]',
        'input[type="datetime-local"]',
        'textarea',
        // Radio buttons and checkboxes
        'div[role="radio"]',
        'div[role="checkbox"]', 
        'div[aria-checked]',
        'span[role="checkbox"]',
        'span[role="radio"]',
        // Dropdown/select elements
        'div[role="listbox"]',
        'div[role="option"]',
        'div[role="combobox"]',
        'div[role="button"][aria-haspopup]',
        // Generic form elements with jsaction
        'div[jsaction*="input"]',
        'div[jsaction*="change"]',
        'div[jsaction*="click"]',
        'div[jsaction*="focus"]',
        // Elements with data-params (common in Google Forms)
        'input[data-params]',
        'textarea[data-params]',
        'div[data-params]',
        // Additional Google Forms patterns
        'div[jsname]',
        'span[jsname]',
        'input[jsname]',
        'textarea[jsname]'
      );
    }

    // Add Microsoft Forms specific selectors  
    if (this.isMicrosoftForms) {
      selectors.push(
        'div[data-automation-id="questionItem"] div[aria-checked="true"]',
        'div[data-automation-id="questionItem"] [aria-haspopup] [aria-label]'
      );
    }

    const elements = [];
    for (const selector of selectors) {
      try {
        const found = document.querySelectorAll(selector);
        if (this.isGoogleForms && found.length > 0) {
          console.log(`🔍 Google Forms selector "${selector}" found ${found.length} elements`);
        }
        elements.push(...found);
      } catch (e) {
        console.warn('Invalid selector:', selector);
      }
    }

    // Enhanced Google Forms detection
    if (this.isGoogleForms) {
      console.log('🔍 Enhanced Google Forms detection starting...');
      
      // Strategy 1: Find all form containers and scan deeply
      const formContainers = document.querySelectorAll(
        '[data-params], [jsaction], .freebirdFormviewerViewItemsItemItem, ' +
        '.freebirdFormviewerViewItemsItemItem, [role="group"], .freebirdFormviewerComponentsQuestionBaseRoot'
      );
      
      console.log(`🔍 Found ${formContainers.length} form containers`);
      
      formContainers.forEach((container, index) => {
        console.log(`🔍 Scanning container ${index + 1}:`, container);
        
        const inputs = container.querySelectorAll(
          'input, textarea, select, ' +
          'div[role], span[role], ' +
          '[aria-checked], [aria-selected], [aria-expanded], ' +
          '[jsaction], [jsname], [data-params], ' +
          '[tabindex]:not([tabindex="-1"])'
        );
        
        console.log(`🔍 Container ${index + 1} has ${inputs.length} potential inputs`);
        
        inputs.forEach(input => {
          if (!elements.includes(input)) {
            elements.push(input);
            console.log(`🔍 Added new element from container:`, input);
          }
        });
      });

      // Strategy 2: Look for elements that might be dynamically loaded
      // Check for elements with common Google Forms classes/attributes
      const additionalSelectors = [
        '[class*="freebirdForm"]',
        '[class*="quantumWizTextinputPaperinputInput"]',
        '[class*="quantumWizTextinputTextinput"]',
        '[aria-labelledby]',
        '[aria-describedby]',
        'div[tabindex="0"]',
        'span[tabindex="0"]'
      ];

      additionalSelectors.forEach(selector => {
        try {
          const found = document.querySelectorAll(selector);
          if (found.length > 0) {
            console.log(`🔍 Additional selector "${selector}" found ${found.length} elements`);
            found.forEach(el => {
              if (!elements.includes(el) && this.couldBeFormElement(el)) {
                elements.push(el);
                console.log(`🔍 Added additional element:`, el);
              }
            });
          }
        } catch (e) {
          console.warn('Invalid additional selector:', selector);
        }
      });

      // Strategy 3: Look at the very bottom of the form for submit areas
      const submitContainers = document.querySelectorAll(
        '.freebirdFormviewerViewNavigationSubmitButton, ' +
        '[role="button"][jsaction*="submit"], ' +
        'div[jsaction*="submit"]'
      );
      
      submitContainers.forEach(submitArea => {
        const parentForm = submitArea.closest('form') || submitArea.closest('[role="main"]');
        if (parentForm) {
          const nearbyInputs = parentForm.querySelectorAll('input, textarea, div[role], span[role]');
          nearbyInputs.forEach(input => {
            if (!elements.includes(input)) {
              elements.push(input);
              console.log(`🔍 Added element near submit button:`, input);
            }
          });
        }
      });
    }

    console.log(`🎯 Total elements found: ${elements.length}`);
    return [...new Set(elements)]; // Remove duplicates
  }

  /**
   * Check if element could be a form element (for additional detection)
   */
  couldBeFormElement(element) {
    const tagName = element.tagName.toLowerCase();
    
    // Standard form elements
    if (['input', 'textarea', 'select'].includes(tagName)) {
      return true;
    }
    
    // Elements with form-like roles
    const role = element.getAttribute('role');
    if (['textbox', 'combobox', 'listbox', 'option', 'radio', 'checkbox'].includes(role)) {
      return true;
    }
    
    // Elements with interactive attributes
    if (element.hasAttribute('aria-checked') || 
        element.hasAttribute('aria-selected') ||
        element.hasAttribute('aria-expanded')) {
      return true;
    }
    
    // Elements that can receive focus (likely interactive)
    const tabIndex = element.getAttribute('tabindex');
    if (tabIndex && tabIndex !== '-1') {
      return true;
    }
    
    // Google Forms specific patterns
    if (element.hasAttribute('jsaction') || 
        element.hasAttribute('jsname') || 
        element.hasAttribute('data-params')) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if element can be filled using advanced criteria
   */
  isElementFillable(element) {
    // Skip elements that are part of autofill UI
    if (element.id?.startsWith("autofill-")) {
      return false;
    }

    // Check element type
    const tagName = element.tagName.toLowerCase();
    const inputType = element.type?.toLowerCase();

    // For Google Forms, be more permissive
    if (this.isGoogleForms) {
      // Skip truly disabled/hidden elements but be less strict
      if (element.disabled || inputType === "hidden") {
        return false;
      }
      
      // Check if element is visually hidden
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        console.log('🔍 Skipping visually hidden element:', element);
        return false;
      }

      // Allow more element types for Google Forms
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        console.log('✅ Google Forms: Standard form element detected:', element);
        return true;
      }

      // Content editable elements
      if (element.isContentEditable) {
        console.log('✅ Google Forms: Content editable element detected:', element);
        return true;
      }

      // Custom Google Forms elements - be very permissive
      if (this.isCustomFormElement(element)) {
        console.log('✅ Google Forms: Custom form element detected:', element);
        return true;
      }

      // Additional Google Forms patterns
      if (element.hasAttribute('jsname') || 
          element.hasAttribute('data-params') ||
          element.hasAttribute('jsaction')) {
        console.log('✅ Google Forms: Element with Google attributes detected:', element);
        return true;
      }

      // Elements that can receive focus are likely interactive
      const tabIndex = element.getAttribute('tabindex');
      if (tabIndex && tabIndex !== '-1') {
        console.log('✅ Google Forms: Focusable element detected:', element);
        return true;
      }

      console.log('❌ Google Forms: Element rejected:', element);
      return false;
    }

    // Standard logic for non-Google Forms
    // Skip disabled, readonly, or hidden elements
    if (element.disabled || element.readOnly || inputType === "hidden") {
      return false;
    }

    // Standard form elements
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return true;
    }

    // Content editable elements
    if (element.isContentEditable) {
      return true;
    }

    // Iframes
    if (tagName === 'iframe' && this.canAccessIframe(element)) {
      return true;
    }

    // Microsoft Forms
    if (this.isMicrosoftForms) {
      return this.isCustomFormElement(element);
    }

    return false;
  }

  /**
   * Check if iframe is accessible
   */
  canAccessIframe(iframe) {
    try {
      return iframe.contentDocument && iframe.contentDocument.body;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if element is a custom form element (Google/Microsoft Forms)
   */
  isCustomFormElement(element) {
    if (this.isGoogleForms) {
      // Check for various Google Forms element types
      const isGoogleFormsElement = 
        element.hasAttribute('aria-checked') || 
        element.hasAttribute('aria-selected') ||
        element.hasAttribute('aria-expanded') ||
        element.getAttribute('role') === 'listbox' ||
        element.getAttribute('role') === 'option' ||
        element.getAttribute('role') === 'radio' ||
        element.getAttribute('role') === 'checkbox' ||
        element.getAttribute('role') === 'textbox' ||
        element.getAttribute('role') === 'combobox' ||
        element.getAttribute('role') === 'button' ||
        element.hasAttribute('data-params') ||
        element.hasAttribute('jsname') ||
        (element.hasAttribute('jsaction') && (
          element.getAttribute('jsaction').includes('input') ||
          element.getAttribute('jsaction').includes('change') ||
          element.getAttribute('jsaction').includes('click') ||
          element.getAttribute('jsaction').includes('focus') ||
          element.getAttribute('jsaction').includes('keydown')
        )) ||
        // Check if element is inside a Google Forms question container
        element.closest('.freebirdFormviewerViewItemsItemItem') !== null ||
        element.closest('.freebirdFormviewerComponentsQuestionBaseRoot') !== null ||
        element.closest('[data-params]') !== null ||
        element.closest('[role="group"]') !== null ||
        // Additional Google Forms class patterns
        element.className.includes('freebirdForm') ||
        element.className.includes('quantumWiz') ||
        // Check for elements with tabindex (likely interactive)
        (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1');

      if (isGoogleFormsElement) {
        console.log('✅ Custom Google Forms element identified:', {
          element: element,
          role: element.getAttribute('role'),
          jsaction: element.getAttribute('jsaction'),
          dataParams: element.hasAttribute('data-params'),
          jsname: element.getAttribute('jsname'),
          tabindex: element.getAttribute('tabindex'),
          className: element.className
        });
      }

      return isGoogleFormsElement;
    }

    if (this.isMicrosoftForms) {
      return element.closest('[data-automation-id="questionItem"]') !== null;
    }

    return false;
  }


  /**
   * Analyze field and extract identification information using advanced logic
   */
  analyzeField(element) {
    const fieldData = {
      element: element,
      identifier: this.generateFieldIdentifier(element),
      type: this.determineFieldType(element),
      value: this.getCurrentValue(element),
      name: element.name || '',
      id: element.id || '',
      label: this.getAdvancedFieldLabel(element),
      placeholder: element.placeholder || '',
      autocomplete: element.autocomplete || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      contextualHints: this.getContextualHints(element),
      xpath: this.getXPath(element),
      attributes: this.extractRelevantAttributes(element)
    };

    fieldData.inferredType = this.inferFieldType(fieldData);
    fieldData.confidence = this.calculateAdvancedConfidence(fieldData);

    return fieldData.identifier ? fieldData : null;
  }

  /**
   * Generate unique identifier for field using multiple strategies
   */
  generateFieldIdentifier(element) {
    // Try multiple identification strategies in order of preference

    // 1. Check for specific label association
    if (element.hasAttribute('aria-labelledby')) {
      const labelId = element.getAttribute('aria-labelledby');
      const labelElement = document.getElementById(labelId);
      if (labelElement) {
        return `"${labelElement.textContent.trim()}"`;
      }
    }

    // 2. Check for direct label (by id)
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        return `"${label.textContent.trim()}"`;
      }
    }

    // 3. Google/Microsoft Forms specific identification
    if (this.isGoogleForms || this.isMicrosoftForms) {
      const customLabel = this.getCustomFormLabel(element);
      if (customLabel) {
        return `"${customLabel}"`;
      }
    }

    // 4. Standard attributes in order of preference
    const identifierSources = [
      element.name,
      element.id,
      element.getAttribute('placeholder'),
      element.getAttribute('title'),
      element.getAttribute('aria-label'),
      element.getAttribute('data-bind'),
      element.getAttribute('ng-model'),
      element.getAttribute('aria-describedby')
    ];

    for (const source of identifierSources) {
      if (source && source.trim()) {
        return `"${source.trim()}"`;
      }
    }

    // 5. For checkboxes/radios, use value if available
    if (this.isCheckboxOrRadio(element) && element.value) {
      return `"${element.value}"`;
    }

    // 6. Try to generate selector-based identifier
    return this.generateSelectorIdentifier(element);
  }

  /**
   * Get label for Google/Microsoft Forms custom elements
   */
  getCustomFormLabel(element) {
    if (this.isGoogleForms) {
      // Strategy 1: Look for question containers with data-params
      const questionContainer = element.closest('[data-params]') || element.closest('.freebirdFormviewerViewItemsItemItem');
      if (questionContainer) {
        // Look for question text elements within the container
        const questionText = questionContainer.querySelector('[role="heading"]') ||
                           questionContainer.querySelector('.freebirdFormviewerViewItemsItemItemTitle') ||
                           questionContainer.querySelector('.freebirdFormviewerViewItemsItemItem .exportLabel') ||
                           questionContainer.querySelector('div[jsname] > div[jsname] > div');
        if (questionText && questionText.textContent.trim()) {
          return questionText.textContent.trim();
        }
      }

      // Strategy 2: Look for listbox or option role elements
      const listboxParent = element.closest('div[role="listbox"]');
      const optionParent = element.closest('div[role="option"]');
      
      if (listboxParent) {
        const label = listboxParent.getAttribute('aria-label') || 
                    listboxParent.getAttribute('aria-labelledby');
        if (label) return label;
      }
      
      if (optionParent) {
        return element.getAttribute('aria-label') || element.textContent.trim();
      }

      // Strategy 3: Look for aria-labelledby references
      const ariaLabelledBy = element.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        const labelElement = document.getElementById(ariaLabelledBy);
        if (labelElement) {
          return labelElement.textContent.trim();
        }
      }

      // Strategy 4: Check data-params for question info
      const dataParams = element.getAttribute('data-params');
      if (dataParams) {
        try {
          // Try to extract readable question text from data-params
          const paramMatch = dataParams.match(/"([^"]*(?:name|email|phone|address|question)[^"]*)"/i);
          if (paramMatch) {
            return paramMatch[1];
          }
        } catch (e) {
          // Ignore JSON parsing errors
        }
      }

      // Strategy 5: Look for nearby text elements that might be labels
      const parent = element.parentElement;
      if (parent) {
        const labelCandidates = parent.querySelectorAll('div[jsname], span[jsname], div[role="heading"]');
        for (const candidate of labelCandidates) {
          const text = candidate.textContent.trim();
          if (text && text.length > 2 && text.length < 200) {
            return text;
          }
        }
      }
    }

    if (this.isMicrosoftForms) {
      const questionItem = element.closest('[data-automation-id="questionItem"]');
      if (questionItem) {
        const heading = questionItem.querySelector('[role="heading"]');
        if (heading) {
          return heading.textContent.trim();
        }
      }
    }

    return null;
  }

  /**
   * Generate CSS selector-based identifier
   */
  generateSelectorIdentifier(element) {
    // Try ID first (most specific)
    if (element.id) {
      return `#${element.id}`;
    }

    // Try to build a unique selector
    const attributes = Array.from(element.attributes).filter(attr => {
      const name = attr.name;
      return name === 'autocomplete' || 
             name === 'name' || 
             name === 'placeholder' ||
             name === 'role' ||
             name === 'type' ||
             name.startsWith('aria-') ||
             name.startsWith('data-');
    });

    // Build selector combinations
    for (const attr of attributes) {
      const selector = `[${attr.name}="${this.escapeSelector(attr.value)}"]`;
      if (this.isSelectorUnique(selector, element)) {
        return selector;
      }
    }

    // Fall back to XPath-like identifier
    return this.generateXPathIdentifier(element);
  }

  /**
   * Check if selector uniquely identifies the element
   */
  isSelectorUnique(selector, targetElement) {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === targetElement;
    } catch (e) {
      return false;
    }
  }

  /**
   * Generate XPath-like identifier
   */
  generateXPathIdentifier(element) {
    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let hasFollowingSiblings = false;

      // Count preceding siblings with same tag name
      for (let sibling = current.previousSibling; sibling; sibling = sibling.previousSibling) {
        if (sibling.nodeType !== Node.DOCUMENT_TYPE_NODE && 
            sibling.nodeName === current.nodeName) {
          index++;
          hasFollowingSiblings = true;
        }
      }

      const tagName = current.nodeName.toLowerCase();
      const position = hasFollowingSiblings ? `[${index + 1}]` : '';
      path.unshift(tagName + position);

      current = current.parentNode;
    }

    return '/' + path.join('/');
  }

  /**
   * Determine the type of field for autofill purposes
   */
  determineFieldType(element) {
    const tagName = element.tagName.toLowerCase();
    const inputType = element.type?.toLowerCase();

    if (tagName === 'input') {
      switch (inputType) {
        case 'password':
          return 1; // PASSWORD_INPUT
        case 'checkbox':
        case 'radio':
          return 3; // CHECKBOX_RADIO
        default:
          return 0; // TEXT_INPUT
      }
    }

    if (tagName === 'select') {
      return 2; // SELECT_DROPDOWN
    }

    if (tagName === 'textarea' || element.isContentEditable) {
      return 0; // TEXT_INPUT
    }

    // Enhanced Google Forms detection
    if (this.isGoogleForms) {
      const role = element.getAttribute('role');
      
      // Dropdown/select elements
      if (role === 'listbox' || role === 'option') {
        return 2; // SELECT_DROPDOWN
      }
      
      // Radio buttons and checkboxes
      if (role === 'radio' || role === 'checkbox' || element.hasAttribute('aria-checked')) {
        return 3; // CHECKBOX_RADIO
      }
      
      // Text input elements (default for Google Forms)
      if (element.hasAttribute('data-params') || element.hasAttribute('jsaction')) {
        // Check if it's likely a text input based on context
        const container = element.closest('.freebirdFormviewerViewItemsItemItem');
        if (container) {
          const containerText = container.textContent.toLowerCase();
          // Look for indicators of different input types
          if (containerText.includes('email')) {
            return 0; // TEXT_INPUT (email)
          }
          if (containerText.includes('phone') || containerText.includes('tel')) {
            return 0; // TEXT_INPUT (phone)  
          }
          if (containerText.includes('address')) {
            return 0; // TEXT_INPUT (address)
          }
        }
        return 0; // TEXT_INPUT (default)
      }
    }

    // Microsoft Forms
    if (this.isMicrosoftForms) {
      if (element.getAttribute('role') === 'listbox') {
        return 2; // SELECT_DROPDOWN
      }
      if (element.hasAttribute('aria-checked')) {
        return 3; // CHECKBOX_RADIO
      }
    }

    return 0; // TEXT_INPUT
  }

  /**
   * Get current value of field
   */
  getCurrentValue(element) {
    if (element.value !== undefined) {
      return element.value;
    }

    if (element.isContentEditable) {
      return this.stripHTMLTags(element.innerHTML);
    }

    if (element.tagName.toLowerCase() === 'iframe') {
      try {
        const doc = element.contentDocument;
        if (doc && doc.body) {
          return this.stripHTMLTags(doc.body.innerHTML);
        }
      } catch (e) {
        return '';
      }
    }

    // Custom form elements
    if (this.isGoogleForms || this.isMicrosoftForms) {
      return element.getAttribute('aria-label') || 
             element.textContent?.trim() || '';
    }

    return '';
  }

  /**
   * Advanced field label detection
   */
  getAdvancedFieldLabel(element) {
    // Direct label association
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        return label.textContent.trim();
      }
    }

    // ARIA label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel.trim();
    }

    // ARIA labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelElement = document.getElementById(labelledBy);
      if (labelElement) {
        return labelElement.textContent.trim();
      }
    }

    // Parent label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      return parentLabel.textContent.trim();
    }

    // Placeholder as fallback
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
      return placeholder.trim();
    }

    return '';
  }

  /**
   * Extract relevant attributes for field identification
   */
  extractRelevantAttributes(element) {
    const relevantAttrs = [
      'name', 'id', 'type', 'placeholder', 'title', 'class',
      'aria-label', 'aria-labelledby', 'aria-describedby',
      'data-bind', 'ng-model', 'autocomplete', 'role'
    ];

    const attributes = {};
    for (const attr of relevantAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        attributes[attr] = value;
      }
    }

    return attributes;
  }

  /**
   * Helper methods
   */
  isCheckboxOrRadio(element) {
    const type = element.type?.toLowerCase();
    return type === 'checkbox' || type === 'radio';
  }

  escapeSelector(value) {
    return value.replace(/["\\]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  }

  stripHTMLTags(html) {
    const stripped = html.replace(/<script.+?<\/script>/gi, '');
    const temp = document.createElement('div');
    temp.innerHTML = stripped;
    return temp.textContent?.trim() || '';
  }

  getFieldLabel(element) {
    // Try standard label associations first
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

    // Handle aria-labelledby references (common in SPAs)
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelIds = ariaLabelledBy.split(/\s+/);
      const labelTexts = labelIds
        .map(id => {
          const labelEl = document.getElementById(id);
          return labelEl ? labelEl.textContent.trim() : '';
        })
        .filter(text => text.length > 0);
      
      if (labelTexts.length > 0) {
        return labelTexts.join(' ');
      }
    }

    // Handle aria-describedby for additional context
    const ariaDescribedBy = element.getAttribute('aria-describedby');
    if (ariaDescribedBy) {
      const descIds = ariaDescribedBy.split(/\s+/);
      const descTexts = descIds
        .map(id => {
          const descEl = document.getElementById(id);
          return descEl ? descEl.textContent.trim() : '';
        })
        .filter(text => text.length > 0 && !text.toLowerCase().includes('error') && !text.toLowerCase().includes('help'));
      
      if (descTexts.length > 0) {
        return descTexts.join(' ');
      }
    }

    return '';
  }

  getContextualHints(element) {
    const hints = [];
    
    // Check data attributes for direct hints
    const dataParams = element.getAttribute('data-params');
    if (dataParams) {
      try {
        // Extract readable text from data-params (like "First Name" in the example)
        const matches = dataParams.match(/"([^"]*(?:name|email|phone|address|city|state|zip|country)[^"]*)"/gi);
        if (matches) {
          hints.push(...matches.map(m => m.replace(/"/g, '')));
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }

    // Check all data-* attributes for contextual information
    Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('data-') && attr.value)
      .forEach(attr => {
        const value = attr.value.toLowerCase();
        if (PERSONAL_DATA_INDICATORS.some(indicator => value.includes(indicator))) {
          hints.push(attr.value);
        }
      });

    // Check jsname attribute (common in Google/Angular apps)
    const jsname = element.getAttribute('jsname');
    if (jsname) {
      hints.push(`jsname:${jsname}`);
    }

    // Enhanced sibling text search
    const previousSibling = element.previousElementSibling;
    if (previousSibling && previousSibling.textContent) {
      hints.push(previousSibling.textContent.trim());
    }

    // Look for text in parent containers (up to 3 levels)
    let currentParent = element.parentElement;
    let level = 0;
    while (currentParent && level < 3) {
      // Get direct text content (not from child elements)
      const directText = Array.from(currentParent.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .filter(text => text.length > 0)
        .join(' ');
      
      if (directText) {
        hints.push(directText);
      }

      // Check for common field wrapper patterns
      const classList = currentParent.className || '';
      if (classList.includes('field') || classList.includes('input') || classList.includes('form')) {
        // Look for any text content in this container
        const containerText = currentParent.textContent
          .replace(element.value || '', '')
          .trim();
        if (containerText && containerText.length < 100) { // Avoid long paragraphs
          hints.push(containerText);
        }
      }

      currentParent = currentParent.parentElement;
      level++;
    }

    // Look for nearby elements with meaningful text
    const nearbyElements = this.findNearbyTextElements(element);
    hints.push(...nearbyElements);

    return [...new Set(hints)]; // Remove duplicates
  }

  findNearbyTextElements(element) {
    const hints = [];
    const rect = element.getBoundingClientRect();
    
    // Find elements within a reasonable distance (100px) of the input
    const allElements = document.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6, label');
    
    for (const el of allElements) {
      if (el === element || element.contains(el) || el.contains(element)) continue;
      
      const elRect = el.getBoundingClientRect();
      const distance = Math.sqrt(
        Math.pow(rect.left - elRect.left, 2) + 
        Math.pow(rect.top - elRect.top, 2)
      );
      
      // If element is close and has meaningful text
      if (distance < 100 && el.textContent) {
        const text = el.textContent.trim();
        if (text.length > 2 && text.length < 50) {
          // Check if text contains personal data indicators
          const lowerText = text.toLowerCase();
          if (PERSONAL_DATA_INDICATORS.some(indicator => lowerText.includes(indicator))) {
            hints.push(text);
          }
        }
      }
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
      fieldData.name || '',
      fieldData.id || '',
      fieldData.label || '',
      fieldData.placeholder || '',
      fieldData.ariaLabel || '',
      fieldData.identifier || '',
      ...(fieldData.contextualHints || [])
    ].join(' ').toLowerCase();

    // Handle HTML5 input types first
    if (fieldData.element) {
      const inputType = fieldData.element.type?.toLowerCase();
      if (inputType === 'email') return 'email';
      if (inputType === 'tel') return 'phone';
      if (inputType === 'password') return 'password';
      if (inputType === 'url') return 'url';
      if (inputType === 'date') return 'birthday';
    }

    // Handle autocomplete attributes
    if (fieldData.autocomplete) {
      const autocompleteType = this.mapAutocompleteToType(fieldData.autocomplete);
      if (autocompleteType) return autocompleteType;
    }

    // Enhanced keyword matching with priority
    const priorityMappings = [
      // Email patterns (highest priority)
      { type: 'email', patterns: ['email', 'e-mail', 'mail', '@'] },
      // Phone patterns
      { type: 'phone', patterns: ['phone', 'tel', 'mobile', 'cell', 'contact', 'number'] },
      // Name patterns
      { type: 'name', patterns: ['name', 'full name', 'first name', 'last name', 'given', 'family', 'surname'] },
      // Address patterns
      { type: 'address', patterns: ['address', 'street', 'addr', 'location', 'residence'] },
      { type: 'city', patterns: ['city', 'town', 'locality', 'municipality'] },
      { type: 'state', patterns: ['state', 'province', 'region', 'prefecture'] },
      { type: 'zip', patterns: ['zip', 'postal', 'postcode', 'zipcode', 'post code'] },
      { type: 'country', patterns: ['country', 'nation', 'nationality'] },
      // Date patterns
      { type: 'birthday', patterns: ['birth', 'birthday', 'born', 'dob', 'date of birth', 'age'] },
      // Other patterns
      { type: 'creditcard', patterns: ['card', 'credit', 'payment', 'cc-number', 'cardnumber'] },
      { type: 'expiry', patterns: ['expiry', 'expiration', 'exp', 'expires', 'valid'] }
    ];

    // Check each priority mapping
    for (const mapping of priorityMappings) {
      for (const pattern of mapping.patterns) {
        if (textToAnalyze.includes(pattern)) {
          return mapping.type;
        }
      }
    }

    // Fallback to original mapping
    for (const [fieldType, keywords] of Object.entries(FIELD_MAPPINGS)) {
      for (const keyword of keywords) {
        if (textToAnalyze.includes(keyword)) {
          return fieldType;
        }
      }
    }

    return 'text';
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

  /**
   * Calculate confidence score using advanced criteria
   */
  calculateAdvancedConfidence(fieldData) {
    let confidence = 0;

    // Strong type indicators
    if (fieldData.element) {
      const inputType = fieldData.element.type?.toLowerCase();
      if (inputType === 'email' || inputType === 'tel' || inputType === 'password') {
        confidence += 40;
      }
    }

    // Autocomplete attribute
    if (fieldData.autocomplete && fieldData.autocomplete !== 'off') {
      confidence += 30;
    }

    // Strong identifier presence
    if (fieldData.identifier && fieldData.identifier.length > 2) {
      confidence += 25;
      
      // Extra boost for clear field identifiers
      const identifierLower = fieldData.identifier.toLowerCase();
      if (identifierLower.includes('name') || identifierLower.includes('email') || 
          identifierLower.includes('phone') || identifierLower.includes('address')) {
        confidence += 15;
      }
    }

    // Label quality
    if (fieldData.label && fieldData.label.length > 2) {
      confidence += 20;
    }

    // Aria attributes
    if (fieldData.ariaLabel || fieldData.attributes['aria-labelledby']) {
      confidence += 15;
    }

    // Standard attributes
    if (fieldData.name || fieldData.id) {
      confidence += 10;
    }

    if (fieldData.placeholder) {
      confidence += 8;
    }

    // Custom form handling
    if (this.isGoogleForms || this.isMicrosoftForms) {
      confidence += 10;
    }

    // Contextual hints bonus
    if (fieldData.contextualHints && fieldData.contextualHints.length > 0) {
      confidence += Math.min(fieldData.contextualHints.length * 2, 10);
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

/**
 * Extract filled form data from the current page
 */
function extractFilledFormData() {
  const extractedData = {};
  const processedElements = new Set();

  // Get all form elements that have values
  const formElements = document.querySelectorAll('input, textarea, select');
  
  for (const element of formElements) {
    // Skip if already processed or no value
    if (processedElements.has(element) || !hasValue(element)) {
      continue;
    }

    // Skip sensitive fields
    if (isSensitiveField(element)) {
      continue;
    }

    const value = getElementValue(element);
    if (!value || value.trim() === '') {
      continue;
    }

    // Determine field type and map to database field
    const fieldType = inferFieldTypeFromElement(element);
    const mappedFieldType = mapToStandardFieldType(fieldType, element);
    
    if (mappedFieldType && value.length > 0 && value.length < 500) {
      // Use the most specific field type found, don't overwrite existing data
      if (!extractedData[mappedFieldType] || extractedData[mappedFieldType].length < value.length) {
        extractedData[mappedFieldType] = value;
      }
    }

    processedElements.add(element);
  }

  // Handle Google Forms and Microsoft Forms specifically
  if (fieldDetector.isGoogleForms) {
    const googleFormsData = extractGoogleFormsData();
    Object.assign(extractedData, googleFormsData);
  }

  if (fieldDetector.isMicrosoftForms) {
    const microsoftFormsData = extractMicrosoftFormsData();
    Object.assign(extractedData, microsoftFormsData);
  }

  console.log('🎯 Extracted form data:', extractedData);
  return extractedData;
}

/**
 * Check if element has a value
 */
function hasValue(element) {
  const tagName = element.tagName.toLowerCase();
  const type = element.type?.toLowerCase();

  if (tagName === 'select') {
    return element.selectedIndex > -1 && element.value;
  }
  
  if (type === 'checkbox' || type === 'radio') {
    return element.checked;
  }
  
  if (tagName === 'textarea' || (tagName === 'input' && ['text', 'email', 'tel', 'url', 'password', 'number'].includes(type))) {
    return element.value && element.value.trim() !== '';
  }

  return false;
}

/**
 * Check if field contains sensitive information that shouldn't be extracted
 */
function isSensitiveField(element) {
  const sensitiveIndicators = [
    'password', 'pass', 'pwd', 'pin', 'secret', 'token', 'key',
    'ssn', 'social', 'security', 'cvv', 'cvc', 'ccv', 'cid',
    'account', 'routing', 'aba', 'swift', 'iban',
    'login', 'signin', 'auth', 'otp', 'captcha', 'verify'
  ];

  const textToCheck = [
    element.name,
    element.id,
    element.placeholder,
    element.getAttribute('aria-label'),
    element.className
  ].join(' ').toLowerCase();

  return sensitiveIndicators.some(indicator => textToCheck.includes(indicator)) ||
         element.type === 'password';
}

/**
 * Get the current value of an element
 */
function getElementValue(element) {
  const tagName = element.tagName.toLowerCase();
  const type = element.type?.toLowerCase();

  if (tagName === 'select') {
    const option = element.options[element.selectedIndex];
    return option ? option.text || option.value : '';
  }
  
  if (type === 'checkbox' || type === 'radio') {
    return element.checked ? (element.value || 'true') : '';
  }
  
  if (element.isContentEditable) {
    return element.textContent?.trim() || '';
  }

  return element.value?.trim() || '';
}

/**
 * Infer field type from element using the same logic as field detection
 */
function inferFieldTypeFromElement(element) {
  const textToAnalyze = [
    element.name || '',
    element.id || '',
    element.placeholder || '',
    element.getAttribute('aria-label') || '',
    element.getAttribute('title') || '',
    element.className || ''
  ].join(' ').toLowerCase();

  // Check HTML5 input types first
  const inputType = element.type?.toLowerCase();
  if (inputType === 'email') return 'email';
  if (inputType === 'tel') return 'phone';
  if (inputType === 'url') return 'website';
  if (inputType === 'date') return 'birthday';

  // Check autocomplete attribute
  const autocomplete = element.autocomplete?.toLowerCase();
  if (autocomplete) {
    const autocompleteMap = {
      'email': 'email',
      'tel': 'phone',
      'given-name': 'firstName',
      'family-name': 'lastName',
      'name': 'name',
      'street-address': 'address',
      'locality': 'city',
      'region': 'state',
      'postal-code': 'zip',
      'country': 'country',
      'organization': 'company'
    };
    if (autocompleteMap[autocomplete]) {
      return autocompleteMap[autocomplete];
    }
  }

  // Pattern matching similar to field detection
  for (const [fieldType, keywords] of Object.entries(FIELD_MAPPINGS)) {
    for (const keyword of keywords) {
      if (textToAnalyze.includes(keyword)) {
        return fieldType;
      }
    }
  }

  return 'text';
}

/**
 * Map inferred field type to standard database field types
 */
function mapToStandardFieldType(inferredType, element) {
  const value = getElementValue(element);
  
  // Additional validation based on value patterns
  if (inferredType === 'email' || (value && value.includes('@'))) {
    return 'email';
  }
  
  if (inferredType === 'phone' || (value && /[\d\s\-\+\(\)]{10,}/.test(value))) {
    return 'phone';
  }
  
  if (inferredType === 'name' || inferredType === 'firstName' || inferredType === 'lastName') {
    // Determine if it's full name vs first/last name based on content
    if (value && value.includes(' ') && value.split(' ').length >= 2) {
      return 'full_name';
    }
    return inferredType === 'lastName' ? 'last_name' : 
           inferredType === 'firstName' ? 'first_name' : 'name';
  }
  
  const typeMapping = {
    'address': 'address',
    'city': 'city',
    'state': 'state',
    'zip': 'zip_code',
    'country': 'country',
    'website': 'website',
    'company': 'company',
    'birthday': 'birth_date'
  };
  
  return typeMapping[inferredType] || null;
}

/**
 * Extract data specifically from Google Forms
 */
function extractGoogleFormsData() {
  const data = {};
  
  // Find filled text inputs in Google Forms
  const googleInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea');
  
  for (const input of googleInputs) {
    if (!input.value || input.value.trim() === '') continue;
    
    // Get the question container
    const container = input.closest('.freebirdFormviewerViewItemsItemItem') || 
                     input.closest('[data-params]') ||
                     input.closest('[role="group"]');
    
    if (container) {
      // Get question text to help identify field type
      const questionText = container.querySelector('[role="heading"]')?.textContent ||
                          container.querySelector('.freebirdFormviewerViewItemsItemItemTitle')?.textContent ||
                          '';
      
      const fieldType = inferFieldTypeFromText(questionText + ' ' + input.value);
      const mappedType = mapToStandardFieldType(fieldType, input);
      
      if (mappedType) {
        data[mappedType] = input.value.trim();
      }
    }
  }
  
  return data;
}

/**
 * Extract data specifically from Microsoft Forms
 */
function extractMicrosoftFormsData() {
  const data = {};
  
  const microsoftInputs = document.querySelectorAll('[data-automation-id="questionItem"] input, [data-automation-id="questionItem"] textarea');
  
  for (const input of microsoftInputs) {
    if (!input.value || input.value.trim() === '') continue;
    
    const questionItem = input.closest('[data-automation-id="questionItem"]');
    if (questionItem) {
      const questionText = questionItem.querySelector('[role="heading"]')?.textContent || '';
      
      const fieldType = inferFieldTypeFromText(questionText + ' ' + input.value);
      const mappedType = mapToStandardFieldType(fieldType, input);
      
      if (mappedType) {
        data[mappedType] = input.value.trim();
      }
    }
  }
  
  return data;
}

/**
 * Infer field type from text content
 */
function inferFieldTypeFromText(text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('@')) return 'email';
  if (lowerText.match(/\d{3}[-\s]?\d{3}[-\s]?\d{4}/)) return 'phone';
  if (lowerText.includes('email') || lowerText.includes('e-mail')) return 'email';
  if (lowerText.includes('phone') || lowerText.includes('tel')) return 'phone';
  if (lowerText.includes('name')) return 'name';
  if (lowerText.includes('address') || lowerText.includes('street')) return 'address';
  if (lowerText.includes('city')) return 'city';
  if (lowerText.includes('state') || lowerText.includes('province')) return 'state';
  if (lowerText.includes('zip') || lowerText.includes('postal')) return 'zip';
  if (lowerText.includes('country')) return 'country';
  if (lowerText.includes('company') || lowerText.includes('organization')) return 'company';
  if (lowerText.includes('website') || lowerText.includes('url')) return 'website';
  
  return 'text';
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === 'getDetectedFields') {
    sendResponse({ fields: fieldDetector.getDetectedFields() });
  } else if (request.action === 'redetectFields') {
    fieldDetector.detectFormFields();
    sendResponse({ success: true });
  } else if (request.action === 'matchFieldsToDatabase') {
    if (!window.databaseMatcher) {
      sendResponse({ success: false, error: 'Database matcher not loaded yet' });
      return true;
    }
    try {
      const matches = await window.databaseMatcher.matchFieldsToDatabase(fieldDetector.getDetectedFields());
      sendResponse({ success: true, matches });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'getSuggestionsForField') {
    if (!window.databaseMatcher) {
      sendResponse({ success: false, error: 'Database matcher not loaded yet' });
      return true;
    }
    try {
      const field = fieldDetector.getDetectedFields().find(f => f.identifier === request.fieldIdentifier);
      if (field) {
        const matches = await window.databaseMatcher.matchFieldsToDatabase([field]);
        const suggestions = matches.matches.length > 0 ? 
          window.databaseMatcher.getMatchSuggestions(matches.matches[0]) : [];
        sendResponse({ success: true, suggestions });
      } else {
        sendResponse({ success: false, error: 'Field not found' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'extractFilledFormData') {
    try {
      const extractedData = extractFilledFormData();
      sendResponse({ success: true, data: extractedData });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  
  // Return true to indicate async response
  return true;
});

// Load database matcher
const script = document.createElement('script');
script.src = chrome.runtime.getURL('database-matcher.js');
script.onload = () => {
  window.databaseMatcher = new window.DatabaseFieldMatcher();
};
document.head.appendChild(script);

const fieldDetector = new FieldDetector();
let databaseMatcher = null;

// Wait for database matcher to load
setTimeout(() => {
  databaseMatcher = window.databaseMatcher;
}, 100);

// Clean up cache periodically
setInterval(() => {
  databaseMatcher.cleanupCache();
}, 60000); // Every minute