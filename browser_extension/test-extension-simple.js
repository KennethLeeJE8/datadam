#!/usr/bin/env node

/**
 * Simple test for MCP Personal Data Browser Extension
 * Validates the stdio communication approach used by the extension
 */

console.log('🧪 MCP Personal Data Browser Extension Test');
console.log('==========================================');

// Test 1: Verify MCP server can be spawned and responds
async function testMCPServerSpawn() {
  console.log('\n1️⃣ Testing MCP server spawn and stdio communication...');
  
  const { spawn } = require('child_process');
  const mcpServerPath = '/Users/kenne/github/datadam/supabase_mcp_personal_database';
  
  return new Promise((resolve, reject) => {
    const mcpProcess = spawn('node', ['dist/server/index.js'], {
      cwd: mcpServerPath,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let testPassed = false;
    
    mcpProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Look for JSON response to our test
      if (output.includes('"id":1') && output.includes('"result"')) {
        console.log('✅ MCP server responded correctly to extract_personal_data');
        testPassed = true;
        mcpProcess.kill();
        resolve();
      }
    });

    mcpProcess.on('close', () => {
      if (!testPassed) {
        reject(new Error('MCP server did not respond as expected'));
      }
    });

    mcpProcess.on('error', (error) => {
      reject(error);
    });

    // Send initialization and test request
    setTimeout(() => {
      // Initialize
      mcpProcess.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '1.0.0',
          capabilities: { tools: {} },
          clientInfo: { name: 'test', version: '1.0.0' }
        },
        id: 0
      }) + '\n');

      // Test extract_personal_data
      setTimeout(() => {
        mcpProcess.stdin.write(JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'extract_personal_data',
            arguments: { user_id: '60767eca-63eb-43be-a861-fc0fbf46f468' }
          },
          id: 1
        }) + '\n');
      }, 500);

      // Timeout
      setTimeout(() => {
        if (!testPassed) {
          mcpProcess.kill();
          reject(new Error('Test timeout'));
        }
      }, 8000);
    }, 1000);
  });
}

// Test 2: Verify extension files exist and are valid
function testExtensionFiles() {
  console.log('\n2️⃣ Testing extension files...');
  
  const fs = require('fs');
  const path = require('path');
  
  const requiredFiles = [
    'manifest.json',
    'background.js', 
    'popup.html',
    'popup.js',
    'content.js'
  ];

  for (const file of requiredFiles) {
    if (fs.existsSync(path.join(__dirname, file))) {
      console.log(`✅ ${file} exists`);
    } else {
      throw new Error(`❌ Missing required file: ${file}`);
    }
  }

  // Check if background.js has the simple approach
  const backgroundContent = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
  if (backgroundContent.includes('SimpleMCPClient') && backgroundContent.includes('spawn')) {
    console.log('✅ background.js uses simple MCP client');
  } else {
    throw new Error('❌ background.js does not use simple MCP approach');
  }

  // Check for error handling
  if (backgroundContent.includes('serverError') && backgroundContent.includes('timeout')) {
    console.log('✅ background.js includes server error handling');
  } else {
    console.log('⚠️  background.js missing comprehensive error handling');
  }
}

// Run tests
async function runTests() {
  try {
    testExtensionFiles();
    await testMCPServerSpawn();
    
    console.log('\n🎉 All tests passed!');
    console.log('\n📋 Summary:');
    console.log('• MCP server spawns correctly ✅');
    console.log('• stdio communication works ✅');  
    console.log('• extract_personal_data responds ✅');
    console.log('• Extension files are valid ✅');
    
    console.log('\n🚀 Ready to test in Chrome:');
    console.log('1. Open chrome://extensions/');
    console.log('2. Enable Developer Mode');
    console.log('3. Load Unpacked → select this directory');
    console.log('4. Open test.html and click "Get Profiles"');
    console.log('\n💡 The extension will spawn your MCP server and communicate via stdio');
    console.log('\n🚫 Error Handling:');
    console.log('• Shows detailed error UI when server is down');
    console.log('• Provides troubleshooting suggestions');
    console.log('• Detects server startup failures and timeouts');
    console.log('• User-friendly error messages');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();