// Simple test script to verify webhook functionality
const http = require('http');

const testPayload = {
  tool_name: 'create_calendar_event',
  parameters: {
    title: 'Test Event from Claude Agent',
    start_time: '2024-12-15T14:00:00',
    end_time: '2024-12-15T15:00:00',
    description: 'This is a test event created by the Claude agent'
  }
};

const data = JSON.stringify(testPayload);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Testing webhook with payload:', testPayload);

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(responseData);
      console.log('Response:', result);
    } catch (error) {
      console.log('Raw response:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(data);
req.end();