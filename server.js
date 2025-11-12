require('dotenv').config();
const express = require('express');
const CalendarService = require('./calendar');
const fs = require('fs').promises;
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

const calendarService = new CalendarService();
let userTokens = null;

// Initialize Claude API client
const anthropic = process.env.CLAUDE_API_KEY ? new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
}) : null;

// Initialize calendar service with credentials
async function initializeCalendar() {
  try {
    let credentials;
    
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      // Use environment variables (production)
      credentials = {
        web: {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET
        }
      };
    } else {
      // Use credentials.json file (development)
      const credentialsPath = './credentials.json';
      credentials = JSON.parse(await fs.readFile(credentialsPath));
    }
    
    await calendarService.initialize(credentials);
    console.log('Calendar service initialized');
  } catch (error) {
    console.error('Failed to initialize calendar service:', error.message);
  }
}

// OAuth flow - redirect user to Google for authorization
app.get('/auth', (req, res) => {
  try {
    if (!calendarService.oauth2Client) {
      return res.status(500).send('Calendar service not initialized');
    }
    const authUrl = calendarService.getAuthUrl();
    console.log('Generated auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send('Authentication error: ' + error.message);
  }
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
      case 'confirm_calendar_event':
        result = await handleConfirmEvent(parameters);
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

// Slack webhook endpoint
app.post('/slack-webhook', express.urlencoded({ extended: true }), async (req, res) => {
  console.log('Received Slack webhook:', req.body);
  
  const { text, user_name, response_url } = req.body;
  
  // Check if calendar is authenticated
  if (!userTokens) {
    return res.json({
      text: '❌ Calendar not authenticated. Please visit https://claude-calendar-agent-production.up.railway.app/auth first.',
      response_type: 'ephemeral'
    });
  }
  
  // Check if Claude API is available
  if (!anthropic) {
    return res.json({
      text: '❌ Claude API not configured. Please add CLAUDE_API_KEY environment variable to Railway.',
      response_type: 'ephemeral'
    });
  }
  
  try {
    console.log('Processing Slack request:', text);
    
    // Use Claude to parse natural language and decide what calendar action to take
    const message = await Promise.race([
      anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a calendar assistant. The user said: "${text}"
          
Convert this to a calendar action using these tools:
- create_calendar_event: Creates new events
- list_calendar_events: Shows upcoming events  
- update_calendar_event: Modifies existing events
- delete_calendar_event: Removes events
- confirm_calendar_event: Preview before creating

If you need more information (like time, attendees, etc.), respond with questions instead of calling a tool.

Respond with either:
1. A tool call if you have enough info
2. Questions to gather missing details`
        }],
        tools: JSON.parse(await fs.readFile('./agent-tools.json')).tools
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Claude API timeout')), 25000)
      )
    ]);
    
    console.log('Claude response received');

    // Check if Claude wants to call a tool
    if (message.content[0].type === 'tool_use') {
      const toolCall = message.content[0];
      
      // Set calendar tokens for this request
      calendarService.setTokens(userTokens);
      
      // Execute the calendar action
      let result;
      switch (toolCall.name) {
        case 'create_calendar_event':
          result = await handleCreateEvent(toolCall.input);
          break;
        case 'list_calendar_events':
          result = await handleListEvents(toolCall.input);
          break;
        case 'update_calendar_event':
          result = await handleUpdateEvent(toolCall.input);
          break;
        case 'delete_calendar_event':
          result = await handleDeleteEvent(toolCall.input);
          break;
        case 'confirm_calendar_event':
          result = await handleConfirmEvent(toolCall.input);
          break;
        default:
          result = { success: false, error: `Unknown tool: ${toolCall.name}` };
      }
      
      // Format response for Slack
      const emoji = result.success ? '✅' : '❌';
      const responseText = result.success ? result.message || 'Action completed!' : result.error;
      
      return res.json({
        text: `${emoji} ${responseText}`,
        response_type: 'in_channel'
      });
      
    } else {
      // Claude is asking for more information
      const claudeResponse = message.content[0].text;
      
      return res.json({
        text: `🤔 ${claudeResponse}`,
        response_type: 'ephemeral'
      });
    }
    
  } catch (error) {
    console.error('Slack webhook error:', error);
    return res.json({
      text: `❌ Error processing request: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
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

async function handleConfirmEvent(params) {
  const { title, start_time, end_time, description, attendees } = params;
  
  // Format the time for display
  const startDate = new Date(start_time);
  const endDate = new Date(end_time);
  const duration = Math.round((endDate - startDate) / (1000 * 60)); // minutes
  
  const formatTime = (date) => {
    return date.toLocaleString('en-US', { 
      weekday: 'long',
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true 
    });
  };

  return {
    success: true,
    preview: {
      title: title,
      when: `${formatTime(startDate)} to ${formatTime(endDate)} (${duration} minutes)`,
      attendees: attendees && attendees.length > 0 ? attendees.join(', ') : 'None - personal event',
      description: description || 'No description provided',
    },
    message: "📅 Event Preview - Does this look correct? Say 'yes' to create it or tell me what to change.",
    next_action: "If confirmed, I'll create this event using create_calendar_event"
  };
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Calendar Agent Server Running',
    authenticated: !!userTokens,
    authUrl: userTokens ? null : `${req.protocol}://${req.get('host')}/auth`
  });
});

// Debug endpoint
app.get('/debug', (req, res) => {
  res.json({
    env: {
      NODE_ENV: process.env.NODE_ENV,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set',
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY ? 'Set' : 'Not set'
    },
    calendarServiceInitialized: !!calendarService.oauth2Client,
    anthropicInitialized: !!anthropic
  });
});

const PORT = process.env.PORT || 3000;
const isDevelopment = process.env.NODE_ENV !== 'production';

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeCalendar();
});