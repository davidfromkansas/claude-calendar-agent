const Anthropic = require('@anthropic-ai/sdk');

async function testModels() {
  const apiKey = process.env.CLAUDE_API_KEY;
  
  if (!apiKey) {
    console.log('❌ No CLAUDE_API_KEY found');
    return;
  }
  
  const anthropic = new Anthropic({ apiKey });
  
  // List of models to test
  const modelsToTest = [
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229',
    'claude-3-opus-20240229',
    'claude-3-5-sonnet-20240620',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-sonnet-4',
    'claude-sonnet-4-5'
  ];
  
  for (const model of modelsToTest) {
    try {
      console.log(`Testing ${model}...`);
      await anthropic.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }]
      });
      console.log(`✅ ${model} - WORKS`);
      break; // Stop at first working model
    } catch (error) {
      if (error.message.includes('not_found_error')) {
        console.log(`❌ ${model} - NOT FOUND`);
      } else {
        console.log(`⚠️  ${model} - ${error.message}`);
      }
    }
  }
}

testModels();