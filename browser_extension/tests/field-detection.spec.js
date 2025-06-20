import { test, expect } from '@playwright/test';

test.describe('Advanced Field Detection', () => {
  test('should detect standard HTML form fields', async ({ page }) => {
    await page.goto('data:text/html,<html><body>' +
      '<form>' +
      '<input type="email" name="email" placeholder="Email Address" id="email-field">' +
      '<input type="tel" name="phone" placeholder="Phone Number" id="phone-field">' +
      '<input type="text" name="firstName" placeholder="First Name" id="name-field">' +
      '<input type="password" name="password" placeholder="Password" id="pwd-field">' +
      '<select name="country" id="country-field">' +
      '<option value="us">United States</option>' +
      '<option value="ca">Canada</option>' +
      '</select>' +
      '<textarea name="address" placeholder="Full Address" id="address-field"></textarea>' +
      '</form>' +
      '</body></html>');
    
    const detectedFields = await page.evaluate(() => {
      const fields = [];
      
      // Simulate the field detection algorithm
      const inputs = document.querySelectorAll('input, select, textarea');
      
      inputs.forEach(element => {
        const field = {
          type: element.type || element.tagName.toLowerCase(),
          name: element.name,
          id: element.id,
          placeholder: element.placeholder || '',
          tagName: element.tagName.toLowerCase()
        };
        
        // Infer field type based on attributes
        if (element.type === 'email' || (element.name && element.name.includes('email'))) {
          field.inferredType = 'email';
        } else if (element.type === 'tel' || (element.name && element.name.includes('phone'))) {
          field.inferredType = 'phone';
        } else if ((element.name && element.name.includes('name')) || (element.placeholder && element.placeholder.includes('Name'))) {
          field.inferredType = 'name';
        } else if (element.type === 'password') {
          field.inferredType = 'password';
        } else if (element.name === 'country') {
          field.inferredType = 'country';
        } else if (element.name === 'address') {
          field.inferredType = 'address';
        }
        
        fields.push(field);
      });
      
      return fields;
    });
    
    expect(detectedFields).toHaveLength(6);
    
    // Verify field type inference
    const emailField = detectedFields.find(f => f.name === 'email');
    expect(emailField.inferredType).toBe('email');
    
    const phoneField = detectedFields.find(f => f.name === 'phone');
    expect(phoneField.inferredType).toBe('phone');
    
    const nameField = detectedFields.find(f => f.name === 'firstName');
    expect(nameField.inferredType).toBe('name');
  });

  test('should detect Google Forms elements', async ({ page }) => {
    // Simulate Google Forms structure
    await page.goto('data:text/html,<html><body>' +
      '<div jsaction="click:trigger">' +
      '<div class="freebirdFormviewerViewItemsItemItem">' +
      '<div class="freebirdFormviewerViewItemsItemItemTitle">' +
      '<span>What is your email address?</span>' +
      '</div>' +
      '<input type="text" name="entry.123456789" data-params="[null,[],[],[]]">' +
      '</div>' +
      '<div class="freebirdFormviewerViewItemsItemItem">' +
      '<div class="freebirdFormviewerViewItemsItemItemTitle">' +
      '<span>Phone Number</span>' +
      '</div>' +
      '<input type="text" name="entry.987654321">' +
      '</div>' +
      '</div>' +
      '</body></html>');
    
    const isGoogleForm = await page.evaluate(() => {
      return document.body.hasAttribute('jsaction') || 
             document.querySelector('[jsaction]') !== null;
    });
    
    expect(isGoogleForm).toBeTruthy();
    
    const googleFormFields = await page.evaluate(() => {
      const fields = [];
      
      // Google Forms detection logic
      const questionContainers = document.querySelectorAll('.freebirdFormviewerViewItemsItemItem');
      
      questionContainers.forEach(container => {
        const titleElement = container.querySelector('.freebirdFormviewerViewItemsItemItemTitle span');
        const inputElement = container.querySelector('input, select, textarea');
        
        if (titleElement && inputElement) {
          const questionText = titleElement.textContent.toLowerCase();
          let inferredType = 'text';
          
          if (questionText.includes('email')) {
            inferredType = 'email';
          } else if (questionText.includes('phone')) {
            inferredType = 'phone';
          } else if (questionText.includes('name')) {
            inferredType = 'name';
          }
          
          fields.push({
            element: inputElement.tagName,
            name: inputElement.name,
            label: titleElement.textContent,
            inferredType: inferredType,
            platform: 'google-forms'
          });
        }
      });
      
      return fields;
    });
    
    expect(googleFormFields).toHaveLength(2);
    expect(googleFormFields[0].inferredType).toBe('email');
    expect(googleFormFields[1].inferredType).toBe('phone');
  });

  test('should detect Microsoft Forms elements', async ({ page }) => {
    // Simulate Microsoft Forms structure
    await page.goto('data:text/html,<html><body>' +
      '<div data-automation-id="questionItem">' +
      '<h3>Email Address</h3>' +
      '<input type="text" aria-label="Email Address">' +
      '</div>' +
      '<div data-automation-id="questionItem">' +
      '<h3>Contact Number</h3>' +
      '<input type="text" aria-label="Contact Number">' +
      '</div>' +
      '</body></html>');
    
    const isMicrosoftForm = await page.evaluate(() => {
      return document.querySelector('[data-automation-id="questionItem"]') !== null;
    });
    
    expect(isMicrosoftForm).toBeTruthy();
    
    const microsoftFormFields = await page.evaluate(() => {
      const fields = [];
      const questionItems = document.querySelectorAll('[data-automation-id="questionItem"]');
      
      questionItems.forEach(item => {
        const heading = item.querySelector('h3');
        const input = item.querySelector('input, select, textarea');
        
        if (heading && input) {
          const questionText = heading.textContent.toLowerCase();
          let inferredType = 'text';
          
          if (questionText.includes('email')) {
            inferredType = 'email';
          } else if (questionText.includes('phone') || questionText.includes('contact')) {
            inferredType = 'phone';
          }
          
          fields.push({
            element: input.tagName,
            ariaLabel: input.getAttribute('aria-label'),
            label: heading.textContent,
            inferredType: inferredType,
            platform: 'microsoft-forms'
          });
        }
      });
      
      return fields;
    });
    
    expect(microsoftFormFields).toHaveLength(2);
    expect(microsoftFormFields[0].inferredType).toBe('email');
    expect(microsoftFormFields[1].inferredType).toBe('phone');
  });

  test('should handle dynamic form fields', async ({ page }) => {
    await page.goto('data:text/html,<html><body>' +
      '<div id="dynamic-form">' +
      '<button id="add-field">Add Field</button>' +
      '</div>' +
      '<script>' +
      'document.getElementById("add-field").onclick = function() {' +
      '  const input = document.createElement("input");' +
      '  input.type = "text";' +
      '  input.name = "dynamic-field-" + Date.now();' +
      '  input.placeholder = "Dynamic Field";' +
      '  document.getElementById("dynamic-form").appendChild(input);' +
      '};' +
      '</script>' +
      '</body></html>');
    
    // Initial field count
    let fieldCount = await page.evaluate(() => {
      return document.querySelectorAll('input').length;
    });
    expect(fieldCount).toBe(0);
    
    // Add dynamic field
    await page.click('#add-field');
    
    // Wait for field to be added
    await page.waitForSelector('input[name^="dynamic-field-"]');
    
    fieldCount = await page.evaluate(() => {
      return document.querySelectorAll('input').length;
    });
    expect(fieldCount).toBe(1);
    
    // Verify field detection works on dynamic fields
    const dynamicField = await page.evaluate(() => {
      const input = document.querySelector('input[name^="dynamic-field-"]');
      return {
        name: input.name,
        placeholder: input.placeholder,
        isDynamic: input.name.includes('dynamic-field-')
      };
    });
    
    expect(dynamicField.isDynamic).toBeTruthy();
    expect(dynamicField.placeholder).toBe('Dynamic Field');
  });

  test('should calculate confidence scores', async ({ page }) => {
    await page.goto('data:text/html,<html><body>' +
      '<form>' +
      '<input type="email" name="email" placeholder="Email" id="email" autocomplete="email">' +
      '<input type="text" name="field1" placeholder="Unknown">' +
      '<input type="text" name="user_email" placeholder="Your email address">' +
      '</form>' +
      '</body></html>');
    
    const fieldsWithConfidence = await page.evaluate(() => {
      const fields = document.querySelectorAll('input');
      const results = [];
      
      fields.forEach(field => {
        let confidence = 0;
        
        // Base confidence
        confidence += 20;
        
        // Type attribute bonus
        if (field.type === 'email') confidence += 30;
        if (field.type === 'tel') confidence += 30;
        if (field.type === 'password') confidence += 30;
        
        // Name attribute bonus
        if (field.name.includes('email')) confidence += 25;
        if (field.name.includes('phone')) confidence += 25;
        if (field.name.includes('name')) confidence += 25;
        
        // Placeholder bonus
        if (field.placeholder.toLowerCase().includes('email')) confidence += 20;
        if (field.placeholder.toLowerCase().includes('phone')) confidence += 20;
        
        // Autocomplete bonus
        if (field.autocomplete) confidence += 10;
        
        // ID bonus
        if (field.id) confidence += 5;
        
        // Cap at 100
        confidence = Math.min(confidence, 100);
        
        results.push({
          name: field.name,
          confidence: confidence,
          attributes: {
            type: field.type,
            placeholder: field.placeholder,
            autocomplete: field.autocomplete || '',
            id: field.id
          }
        });
      });
      
      return results;
    });
    
    expect(fieldsWithConfidence).toHaveLength(3);
    
    // High confidence email field
    const emailField = fieldsWithConfidence.find(f => f.name === 'email');
    expect(emailField.confidence).toBeGreaterThan(80);
    
    // Medium confidence email field (based on name)
    const userEmailField = fieldsWithConfidence.find(f => f.name === 'user_email');
    expect(userEmailField.confidence).toBeGreaterThan(60);
    
    // Low confidence unknown field
    const unknownField = fieldsWithConfidence.find(f => f.name === 'field1');
    expect(unknownField.confidence).toBeLessThan(40);
  });
});