// Test script to create event for today and list events
const http = require('http');

// Create event for today at 2pm
const today = new Date();
const startTime = new Date(today);
startTime.setHours(14, 0, 0, 0); // 2:00 PM today

const endTime = new Date(startTime);
endTime.setHours(15, 0, 0, 0); // 3:00 PM today

console.log('Creating event for:', startTime.toISOString());

const createPayload = {
  tool_name: 'create_calendar_event',
  parameters: {
    title: 'Test Event for Today',
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    description: 'Test event created today by Claude agent'
  }
};

function makeRequest(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    
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

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (error) {
          resolve({ error: 'Invalid JSON', raw: responseData });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function test() {
  console.log('1. Creating event for today...');
  const createResult = await makeRequest(createPayload);
  console.log('Create result:', createResult);

  console.log('\n2. Listing upcoming events...');
  const listResult = await makeRequest({
    tool_name: 'list_calendar_events',
    parameters: { max_results: 10 }
  });
  console.log('List result:', listResult);
}

test().catch(console.error);