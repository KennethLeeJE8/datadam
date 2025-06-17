// This is the processed version of the autofill(unformatted).js file.

// Browser detection
const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");
const browserAPI = isFirefox ? browser : chrome;
const document = window.document;
const isTopFrame = self === top;
const isBlankPage = "about:blank" === location.href;

// Field type constants
const INPUT_TYPES = {
    TEXT: "text", 
    PASSWORD: "password",
    EMAIL: "email",
    CHECKBOX: "checkbox",
    RADIO: "radio",
    SELECT: "select",
    TEXTAREA: "textarea"
};

// Autofill modes
const AUTOFILL_MODES = {
    REPLACE: 0,    // Replace existing value
    APPEND: 2,     // Append to existing value  
    PREPEND: 3,    // Prepend to existing value
    SURROUND: 4,   // Surround existing value
    INCREMENT: 5,  // Increment numeric value
    DECREMENT: 6   // Decrement numeric value
};

// Field type mappings
const FIELD_TYPES = {
    TEXT_INPUT: 0,      // Text inputs, textareas
    PASSWORD_INPUT: 1,  // Password inputs
    SELECT_DROPDOWN: 2, // Select dropdowns
    CHECKBOX_RADIO: 3,  // Checkboxes and radio buttons
    EXECUTE_COMMAND: 4, // Execute custom commands
    CLICK_ELEMENT: 6,   // Click elements
    DISPATCH_EVENTS: 7, // Dispatch events
    NAVIGATE_URL: 8,    // Navigate to URL
    RELOAD_PAGE: 9,     // Reload page
    SCRAPE_DATA: 10,    // Scrape data from elements
    INJECT_CSS: 11,     // Inject CSS
    WAIT_DELAY: 12      // Wait/delay
};

// Regex patterns for field identification
const FIELD_PATTERNS = {
    AUTOCOMPLETE_VALUES: /^\d+(\|\d+)*$/,
    NUMERIC_ONLY: /[^\d ]/,
    WHITESPACE: /\s/g,
    QUOTES: /"/g,
    ESCAPED_QUOTES: /\\"/g
};

// ===== CORE FIELD IDENTIFICATION CLASS =====

class FieldIdentifier {
    constructor() {
        this.documentFields = [];
        this.fieldCache = new Map();
        this.isGoogleForms = this.detectGoogleForms();
        this.isMicrosoftForms = this.detectMicrosoftForms();
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

    /**
     * Main method to identify all fillable fields on the page
     */
    identifyFields(targetElements = null) {
        if (!targetElements) {
            // Get all potential input elements
            targetElements = this.getAllInputElements();
        }

        const identifiedFields = [];

        for (const element of targetElements) {
            if (this.isElementFillable(element)) {
                const fieldInfo = this.analyzeField(element);
                if (fieldInfo) {
                    identifiedFields.push(fieldInfo);
                }
            }
        }

        return identifiedFields;
    }

    /**
     * Get all input elements from the page
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
                'div[jsaction][aria-checked="true"]',
                'div[jsaction][aria-selected="true"]'
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
                elements.push(...document.querySelectorAll(selector));
            } catch (e) {
                console.warn('Invalid selector:', selector);
            }
        }

        return elements;
    }

    /**
     * Check if element can be filled
     */
    isElementFillable(element) {
        // Skip disabled, readonly, or hidden elements
        if (element.disabled || element.readOnly || element.type === "hidden") {
            return false;
        }

        // Skip elements that are part of autofill UI
        if (element.id?.startsWith("autofill-")) {
            return false;
        }

        // Check element type
        const tagName = element.tagName.toLowerCase();
        const inputType = element.type?.toLowerCase();

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

        // Custom form elements (Google/Microsoft Forms)
        if (this.isGoogleForms || this.isMicrosoftForms) {
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
            return element.hasAttribute('aria-checked') || 
                   element.hasAttribute('aria-selected') ||
                   element.getAttribute('role') === 'listbox' ||
                   element.getAttribute('role') === 'option';
        }

        if (this.isMicrosoftForms) {
            return element.closest('[data-automation-id="questionItem"]') !== null;
        }

        return false;
    }

    /**
     * Analyze field and extract identification information
     */
    analyzeField(element) {
        const fieldInfo = {
            element: element,
            identifier: this.generateFieldIdentifier(element),
            type: this.determineFieldType(element),
            value: this.getCurrentValue(element),
            label: this.findFieldLabel(element),
            attributes: this.extractRelevantAttributes(element)
        };

        return fieldInfo.identifier ? fieldInfo : null;
    }

    /**
     * Generate unique identifier for field
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
            // Look for listbox or option role elements
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
        if (element.id && !this.isCrowdtapSite()) {
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
                    return FIELD_TYPES.PASSWORD_INPUT;
                case 'checkbox':
                case 'radio':
                    return FIELD_TYPES.CHECKBOX_RADIO;
                default:
                    return FIELD_TYPES.TEXT_INPUT;
            }
        }

        if (tagName === 'select') {
            return FIELD_TYPES.SELECT_DROPDOWN;
        }

        if (tagName === 'textarea' || element.isContentEditable) {
            return FIELD_TYPES.TEXT_INPUT;
        }

        // Custom form elements
        if (this.isGoogleForms || this.isMicrosoftForms) {
            if (element.getAttribute('role') === 'listbox') {
                return FIELD_TYPES.SELECT_DROPDOWN;
            }
            if (element.hasAttribute('aria-checked')) {
                return FIELD_TYPES.CHECKBOX_RADIO;
            }
        }

        return FIELD_TYPES.TEXT_INPUT;
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
     * Find associated label for field
     */
    findFieldLabel(element) {
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

    isCrowdtapSite() {
        return document.URL.includes('crowdtap.com');
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
}

// ===== FIELD MATCHING AND AUTOFILL LOGIC =====

class AutofillEngine {
    constructor() {
        this.fieldIdentifier = new FieldIdentifier();
        this.rules = new Map();
        this.variables = new Map();
    }

    /**
     * Main autofill execution method
     */
    async executeAutofill(categoryId = null, targetFields = null, forceOverwrite = false, rules = null) {
        const availableRules = rules || this.rules;
        if (availableRules.size === 0) {
            return { filled: 0, errors: [] };
        }

        const fields = targetFields || this.fieldIdentifier.identifyFields();
        const results = { filled: 0, errors: [] };

        for (const [ruleId, rule] of availableRules) {
            // Skip rules that don't match current category
            if (categoryId && rule.category !== categoryId) {
                continue;
            }

            // Find matching fields for this rule
            const matchingFields = this.findMatchingFields(rule, fields);

            for (const field of matchingFields) {
                try {
                    const success = await this.fillField(field, rule, forceOverwrite);
                    if (success) {
                        results.filled++;
                    }
                } catch (error) {
                    results.errors.push({
                        field: field.identifier,
                        rule: ruleId,
                        error: error.message
                    });
                }
            }
        }

        return results;
    }

    /**
     * Find fields that match a given rule
     */
    findMatchingFields(rule, fields) {
        const matchingFields = [];
        const rulePattern = this.parseRulePattern(rule.pattern);

        for (const field of fields) {
            if (this.isFieldMatch(field, rulePattern, rule)) {
                matchingFields.push(field);
            }
        }

        return matchingFields;
    }

    /**
     * Parse rule pattern (regex, exact match, etc.)
     */
    parseRulePattern(pattern) {
        // Handle regex patterns
        if (pattern.startsWith('/') && pattern.includes('/')) {
            const regexMatch = pattern.match(/^\/(.+?)\/([gimsuvy]*)$/);
            if (regexMatch) {
                return new RegExp(regexMatch[1], regexMatch[2]);
            }
        }

        // Handle exact string matches
        return pattern;
    }

    /**
     * Check if field matches rule pattern
     */
    isFieldMatch(field, rulePattern, rule) {
        const targets = [
            field.identifier,
            field.label,
            field.attributes.name,
            field.attributes.id,
            field.attributes.placeholder
        ].filter(Boolean);

        for (const target of targets) {
            if (rulePattern instanceof RegExp) {
                if (rulePattern.test(target)) {
                    return true;
                }
            } else {
                if (target.toLowerCase().includes(rulePattern.toLowerCase())) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Fill a field with rule value
     */
    async fillField(field, rule, forceOverwrite = false) {
        const element = field.element;

        // Check if field should be filled
        if (!forceOverwrite && element.value && rule.mode !== AUTOFILL_MODES.REPLACE) {
            return false;
        }

        // Process rule value (handle variables, etc.)
        const processedValue = this.processRuleValue(rule.value, field);

        // Fill based on field type
        switch (field.type) {
            case FIELD_TYPES.TEXT_INPUT:
            case FIELD_TYPES.PASSWORD_INPUT:
                return await this.fillTextInput(element, processedValue, rule.mode);

            case FIELD_TYPES.SELECT_DROPDOWN:
                return await this.fillSelectDropdown(element, processedValue);

            case FIELD_TYPES.CHECKBOX_RADIO:
                return await this.fillCheckboxRadio(element, processedValue);

            default:
                return false;
        }
    }

    /**
     * Fill text input field
     */
    async fillTextInput(element, value, mode = AUTOFILL_MODES.REPLACE) {
        const currentValue = element.value || '';

        let newValue;
        switch (mode) {
            case AUTOFILL_MODES.APPEND:
                newValue = currentValue + value;
                break;
            case AUTOFILL_MODES.PREPEND:
                newValue = value + currentValue;
                break;
            case AUTOFILL_MODES.SURROUND:
                newValue = value + currentValue + value;
                break;
            case AUTOFILL_MODES.INCREMENT:
                newValue = isNaN(currentValue) ? currentValue : (parseFloat(currentValue) + 1).toString();
                break;
            case AUTOFILL_MODES.DECREMENT:
                newValue = isNaN(currentValue) ? currentValue : (parseFloat(currentValue) - 1).toString();
                break;
            default:
                newValue = value;
        }

        // Set value and trigger events
        element.value = newValue;
        await this.triggerEvents(element, ['focus', 'input', 'keyup', 'change', 'blur']);

        return true;
    }

    /**
     * Fill select dropdown
     */
    async fillSelectDropdown(element, value) {
        // Handle special values
        if (value === '?') {
            // Random selection
            const randomIndex = Math.floor(Math.random() * element.options.length);
            element.selectedIndex = randomIndex;
        } else if (!isNaN(value)) {
            // Numeric index
            element.selectedIndex = parseInt(value);
        } else {
            // Text matching
            const normalizedValue = value.toLowerCase().replace(/['"]/g, '');
            
            for (let i = 0; i < element.options.length; i++) {
                const option = element.options[i];
                const optionText = (option.text || '').toLowerCase();
                const optionValue = (option.value || '').toLowerCase();
                
                if (optionText === normalizedValue || optionValue === normalizedValue) {
                    element.selectedIndex = i;
                    break;
                }
            }
        }

        await this.triggerEvents(element, ['change']);
        return true;
    }

    /**
     * Fill checkbox/radio button
     */
    async fillCheckboxRadio(element, value) {
        const normalizedValue = value.toLowerCase();
        let shouldCheck = false;

        if (normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'on') {
            shouldCheck = true;
        } else if (normalizedValue === '0' || normalizedValue === 'false' || normalizedValue === 'off') {
            shouldCheck = false;
        } else {
            // Match against element value or label
            const elementValue = (element.value || '').toLowerCase();
            const elementLabel = (this.fieldIdentifier.findFieldLabel(element) || '').toLowerCase();
            shouldCheck = elementValue === normalizedValue || elementLabel === normalizedValue;
        }

        if (element.checked !== shouldCheck) {
            element.checked = shouldCheck;
            await this.triggerEvents(element, ['change']);
            return true;
        }

        return false;
    }

    /**
     * Process rule value (handle variables, random values, etc.)
     */
    processRuleValue(value, field) {
        // Handle variables
        value = this.replaceVariables(value);

        // Handle random number generation
        value = this.handleRandomGeneration(value);

        // Handle conditional logic
        value = this.handleConditionalLogic(value);

        return value;
    }

    /**
     * Replace variables in value
     */
    replaceVariables(value) {
        // Replace {varname} with actual variable values
        return value.replace(/\{(\w+)\}/g, (match, varName) => {
            return this.variables.get(varName) || match;
        });
    }

    /**
     * Handle random value generation
     */
    handleRandomGeneration(value) {
        // {#N} - Random N-digit number
        value = value.replace(/\{#(\d+)\}/g, (match, digits) => {
            const min = Math.pow(10, digits - 1);
            const max = Math.pow(10, digits) - 1;
            return Math.floor(Math.random() * (max - min + 1)) + min;
        });

        // {$N} - Random N-character alphanumeric string
        value = value.replace(/\{\$(\d+)\}/g, (match, length) => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        });

        return value;
    }

    /**
     * Handle conditional logic in values
     */
    handleConditionalLogic(value) {
        // {option1|option2|option3} - Random selection
        return value.replace(/\{([^}]+)\}/g, (match, options) => {
            if (options.includes('|')) {
                const choices = options.split('|');
                return choices[Math.floor(Math.random() * choices.length)];
            }
            return match;
        });
    }

    /**
     * Trigger events on element
     */
    async triggerEvents(element, eventTypes) {
        for (const eventType of eventTypes) {
            const event = new Event(eventType, { bubbles: true });
            element.dispatchEvent(event);
            
            // Small delay between events
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
}

// ===== EXPORT FOR USE =====

// Initialize the autofill system
const autofillSystem = {
    fieldIdentifier: new FieldIdentifier(),
    autofillEngine: new AutofillEngine(),
    
    // Public methods
    identifyFields: function(targetElements = null) {
        return this.fieldIdentifier.identifyFields(targetElements);
    },
    
    executeAutofill: function(categoryId = null, targetFields = null, forceOverwrite = false, rules = null) {
        return this.autofillEngine.executeAutofill(categoryId, targetFields, forceOverwrite, rules);
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.AutofillSystem = autofillSystem;
}

console.log('Lightning Autofill Field Identification System Loaded');