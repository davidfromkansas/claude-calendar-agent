require('dotenv').config();
const express = require('express');
const CalendarService = require('./calendar');
const fs = require('fs').promises;

const app = express();
app.use(express.json());

const calendarService = new CalendarService();
let userTokens = null;

// Initialize calendar service with credentials
async function initializeCalendar() {
  try {
    const credentialsPath = './credentials.json'; // You'll put your Google credentials here
    const credentials = JSON.parse(await fs.readFile(credentialsPath));
    await calendarService.initialize(credentials);
    console.log('Calendar service initialized');
  } catch (error) {
    console.error('Failed to initialize calendar service:', error.message);
  }
}

// OAuth flow - redirect user to Google for authorization
app.get('/auth', (req, res) => {
  const authUrl = calendarService.getAuthUrl();
  console.log('Generated auth URL:', authUrl);
  res.redirect(authUrl);
});

// Handle OAuth callback
app.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  console.log('Full callback query:', req.query);
  console.log('Received authorization code:', code ? 'Yes' : 'No');
  
  if (error) {
    return res.status(400).send('OAuth error: ' + error);
  }
  
  if (!code) {
    return res.status(400).send('No authorization code received. Full query: ' + JSON.stringify(req.query));
  }
  
  try {
    const tokens = await calendarService.getTokens(code);
    userTokens = tokens; // In production, store this securely per user
    console.log('Tokens received successfully');
    res.send('Authorization successful! You can now use the calendar agent.');
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).send('Authorization failed: ' + error.message);
  }
});

// Claude Agent webhook endpoint
app.post('/webhook', async (req, res) => {
  console.log('Received webhook:', JSON.stringify(req.body, null, 2));
  
  const { tool_name, parameters } = req.body;
  
  // Set user tokens for this request
  if (userTokens) {
    calendarService.setTokens(userTokens);
  } else {
    return res.status(401).json({
      error: 'User not authenticated. Please visit /auth first.'
    });
  }

  let result;

  try {
    switch (tool_name) {
      case 'create_calendar_event':
        result = await handleCreateEvent(parameters);
        break;
      case 'list_calendar_events':
        result = await handleListEvents(parameters);
        break;
      case 'update_calendar_event':
        result = await handleUpdateEvent(parameters);
        break;
      case 'delete_calendar_event':
        result = await handleDeleteEvent(parameters);
        break;
      default:
        result = {
          success: false,
          error: `Unknown tool: ${tool_name}`
        };
    }
  } catch (error) {
    result = {
      success: false,
      error: error.message
    };
  }

  res.json(result);
});

// Tool handlers
async function handleCreateEvent(params) {
  const { title, start_time, end_time, description, attendees } = params;
  
  return await calendarService.createEvent({
    title,
    startTime: start_time,
    endTime: end_time,
    description,
    attendees: attendees || []
  });
}

async function handleListEvents(params) {
  const { max_results = 10 } = params;
  return await calendarService.listEvents(max_results);
}

async function handleUpdateEvent(params) {
  const { event_id, title, start_time, end_time, description } = params;
  
  const updates = {};
  if (title) updates.title = title;
  if (start_time) updates.startTime = start_time;
  if (end_time) updates.endTime = end_time;
  if (description) updates.description = description;
  
  return await calendarService.updateEvent(event_id, updates);
}

async function handleDeleteEvent(params) {
  const { event_id } = params;
  return await calendarService.deleteEvent(event_id);
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Calendar Agent Server Running',
    authenticated: !!userTokens,
    authUrl: userTokens ? null : `${req.protocol}://${req.get('host')}/auth`
  });
});

const PORT = process.env.PORT || 3000;
const isDevelopment = process.env.NODE_ENV !== 'production';

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeCalendar();
});