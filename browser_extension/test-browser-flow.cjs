#!/usr/bin/env node

// Test the exact flow that the browser extension uses

async function testBrowserExtensionFlow() {
  console.log('🧪 Testing Browser Extension Flow');
  console.log('================================\n');

  const apiUrl = 'http://localhost:3001';
  const userId = '399aa002-cb10-40fc-abfe-d2656eea0199';

  // Step 1: Test API connection (like EnhancedMCPClient.connect)
  console.log('1. Testing API connection...');
  try {
    const response = await fetch(`${apiUrl}/health`);
    if (response.ok) {
      console.log('✅ API connected');
    } else {
      console.log('❌ API connection failed');
      return;
    }
  } catch (error) {
    console.log('❌ API connection error:', error.message);
    return;
  }

  // Step 2: Extract personal data (like EnhancedMCPClient.extractPersonalData)
  console.log('\n2. Extracting personal data...');
  try {
    const response = await fetch(`${apiUrl}/api/extract_personal_data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        limit: 50,
        offset: 0
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('📡 Raw API Response:', JSON.stringify(result, null, 2));
    
    // This is what the MCP client returns (result.data)
    const mcpClientReturn = result.data;
    console.log('\n🔄 MCP Client Return Value:', JSON.stringify(mcpClientReturn, null, 2));

    // Step 3: Background service processing (like extractPersonalData method)
    console.log('\n3. Background service processing...');
    let finalData;
    
    // Check if it's old MCP format
    if (mcpClientReturn.content && mcpClientReturn.content[0] && mcpClientReturn.content[0].type === 'text') {
      console.log('📝 Processing as old MCP format');
      const data = JSON.parse(mcpClientReturn.content[0].text);
      finalData = data.data || data;
    } else if (mcpClientReturn.data) {
      console.log('🌐 Processing as HTTP API format');
      finalData = mcpClientReturn.data;
    } else {
      console.log('🔄 Using raw result');
      finalData = mcpClientReturn;
    }

    console.log('\n📊 Final Data for Frontend:', JSON.stringify(finalData, null, 2));
    console.log(`\n📈 Number of profiles: ${Array.isArray(finalData) ? finalData.length : 'Not an array'}`);

    // Step 4: What the popup will display
    if (Array.isArray(finalData) && finalData.length > 0) {
      console.log('\n🎯 Profiles that will be displayed:');
      finalData.forEach((profile, index) => {
        console.log(`   ${index + 1}. ${profile.title}`);
        console.log(`      Type: ${profile.data_type}`);
        console.log(`      Content: ${JSON.stringify(profile.content)}`);
        console.log(`      Tags: ${profile.tags}`);
        console.log('');
      });
    } else {
      console.log('\n❌ No profiles will be displayed');
    }

  } catch (error) {
    console.error('❌ Error in flow:', error.message);
  }
}

testBrowserExtensionFlow().catch(console.error);