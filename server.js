require('dotenv').config();
const express = require('express');
const CalendarService = require('./calendar');
const fs = require('fs').promises;
const Anthropic = require('@anthropic-ai/sdk');
const { WebClient } = require('@slack/web-api');

const app = express();
app.use(express.json());

const calendarService = new CalendarService();
let userTokens = null;

// Initialize Claude API client
const anthropic = process.env.CLAUDE_API_KEY ? new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
}) : null;

// Initialize Slack Web API client
const slack = process.env.SLACK_BOT_TOKEN ? new WebClient(process.env.SLACK_BOT_TOKEN) : null;

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

// Shared function to process calendar requests with Claude
async function processWithClaude(text) {
  console.log('Processing request:', text);
  
  calendarService.setTokens(userTokens);
  
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
    
    return { isToolCall: true, ...result };
  } else {
    // Claude is asking for more information
    const claudeResponse = message.content[0].text;
    return { isToolCall: false, claudeResponse };
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

// Slack events endpoint for @mentions
app.post('/slack-events', express.json(), async (req, res) => {
  console.log('Received Slack event:', JSON.stringify(req.body, null, 2));
  
  // Slack URL verification
  if (req.body.type === 'url_verification') {
    console.log('URL verification challenge:', req.body.challenge);
    return res.json({ challenge: req.body.challenge });
  }
  
  // Handle app mention events
  if (req.body.type === 'event_callback' && req.body.event.type === 'app_mention') {
    const { event } = req.body;
    const { text, channel, user } = event;
    
    // Remove the @bot mention from the text
    const cleanText = text.replace(/<@[^>]+>/g, '').trim();
    
    // Check if calendar is authenticated
    if (!userTokens) {
      console.log('❌ Calendar not authenticated for mention');
      return res.json({});
    }
    
    // Check if Claude API is available
    if (!anthropic) {
      console.log('❌ Claude API not available for mention');
      return res.json({});
    }
    
    // Check if Slack is available
    if (!slack) {
      console.log('❌ Slack not initialized - missing SLACK_BOT_TOKEN');
      return res.json({});
    }
    
    try {
      // Process with Claude and respond via Web API
      const result = await processWithClaude(cleanText);
      
      if (result.isToolCall) {
        const emoji = result.success ? '✅' : '❌';
        const responseText = result.success ? result.message || 'Action completed!' : result.error;
        console.log('Sending tool result to Slack:', `${emoji} ${responseText}`);
        const slackResponse = await slack.chat.postMessage({
          channel: channel,
          text: `${emoji} ${responseText}`,
          unfurl_links: false,
          unfurl_media: false
        });
        console.log('Slack response:', slackResponse.ok ? 'Success' : 'Failed');
        if (!slackResponse.ok) {
          console.error('Slack error:', slackResponse.error);
        }
      } else {
        // Claude is asking questions
        console.log('Sending Claude question to Slack:', result.claudeResponse);
        const slackResponse = await slack.chat.postMessage({
          channel: channel,
          text: `🤔 ${result.claudeResponse}`,
          unfurl_links: false,
          unfurl_media: false
        });
        console.log('Slack response:', slackResponse.ok ? 'Success' : 'Failed');
        if (!slackResponse.ok) {
          console.error('Slack error:', slackResponse.error);
        }
      }
    } catch (error) {
      console.error('Mention processing error:', error);
      await slack.chat.postMessage({
        channel: channel,
        text: `❌ Sorry, I encountered an error processing your request.`
      });
    }
    
    res.json({});
    return;
  }
  
  res.json({});
});

// Slack webhook endpoint for slash commands
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
      
      // Use delayed response for conversational feel
      if (response_url) {
        // Send immediate acknowledgment
        res.json({ text: `🤔 Processing your request...` });
        
        // Send delayed response
        const https = require('node:https');
        const { URL } = require('node:url');
        const postData = JSON.stringify({
          text: `${emoji} ${responseText}`,
          response_type: 'in_channel'
        });
        
        setTimeout(() => {
          const url = new URL(response_url);
          const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };
          
          const req = https.request(options, (res) => {
            console.log('Delayed response status:', res.statusCode);
          });
          req.on('error', (err) => {
            console.error('Delayed response error:', err);
          });
          req.write(postData);
          req.end();
        }, 1000);
        
        return;
      }
      
      return res.json({
        text: `${emoji} ${responseText}`,
        response_type: 'in_channel'
      });
      
    } else {
      // Claude is asking for more information
      const claudeResponse = message.content[0].text;
      
      // Use delayed response for questions too
      if (response_url) {
        res.json({ text: `🤔 Let me think about that...` });
        
        const postData = JSON.stringify({
          text: `🤔 ${claudeResponse}`,
          response_type: 'in_channel'
        });
        
        setTimeout(() => {
          const url = new URL(response_url);
          const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };
          
          const req = https.request(options, (res) => {
            console.log('Question response status:', res.statusCode);
          });
          req.on('error', (err) => {
            console.error('Question response error:', err);
          });
          req.write(postData);
          req.end();
        }, 1000);
        
        return;
      }
      
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
    authUrl: userTokens ? null : `${req.protocol}://${req.get('host')}/auth`,
    hasSlackEvents: true,
    version: '2.0'
  });
});

// Test endpoint for Slack events
app.get('/slack-events', (req, res) => {
  res.json({ message: 'Slack events endpoint is ready for POST requests' });
});

// Debug endpoint
app.get('/debug', (req, res) => {
  res.json({
    env: {
      NODE_ENV: process.env.NODE_ENV,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set',
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
      CLAUDE_API_KEY: process.env.CLAUDE_API_KEY ? 'Set' : 'Not set',
      SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN ? 'Set' : 'Not set'
    },
    calendarServiceInitialized: !!calendarService.oauth2Client,
    anthropicInitialized: !!anthropic,
    slackInitialized: !!slack
  });
});

const PORT = process.env.PORT || 3000;
const isDevelopment = process.env.NODE_ENV !== 'production';

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeCalendar();
});