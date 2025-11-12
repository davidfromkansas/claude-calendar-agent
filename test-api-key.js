const Anthropic = require('@anthropic-ai/sdk');

// Test your API key
async function testApiKey() {
  const apiKey = process.env.CLAUDE_API_KEY;
  
  if (!apiKey) {
    console.log('❌ No CLAUDE_API_KEY found in environment');
    return;
  }
  
  console.log('🔑 Testing API key:', apiKey.substring(0, 20) + '...');
  
  const anthropic = new Anthropic({
    apiKey: apiKey
  });
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: 'Say "API key works"'
      }]
    });
    
    console.log('✅ API key is valid!');
    console.log('Response:', response.content[0].text);
  } catch (error) {
    console.log('❌ API key is invalid:');
    console.log('Error:', error.message);
  }
}

testApiKey();