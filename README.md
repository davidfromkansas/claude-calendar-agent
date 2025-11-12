# Claude Calendar Agent

A Claude agent that can create, update, delete, and list Google Calendar events through natural language requests.

## Setup Instructions

### 1. Copy your Google credentials
- Download the OAuth 2.0 credentials JSON file from Google Cloud Console
- Save it as `credentials.json` in this directory

### 2. Create environment file
```bash
cp .env.example .env
```
Fill in your values in `.env`

### 3. Install and run
```bash
npm install
npm start
```

### 4. Authenticate with Google
- Visit http://localhost:3000/auth
- Grant calendar permissions
- You should see "Authorization successful!"

### 5. Set up Claude Agent (via Anthropic Console)
- Create new agent
- Set webhook URL: `http://your-server.com/webhook`
- Import tools from `agent-tools.json`

## Example Usage

Once set up, you can send natural language requests to your Claude agent:

**"Create a meeting with John tomorrow at 2pm for 1 hour about project planning"**

**"List my events for this week"**

**"Move my dentist appointment to next Friday at 10am"**

**"Cancel the team standup meeting"**

## How it works

1. User sends natural language request to Claude Agent
2. Claude Agent parses the request and calls appropriate calendar tools
3. Your webhook server receives the tool calls
4. Server executes Google Calendar API operations
5. Results are returned to Claude Agent
6. Claude Agent responds to user with confirmation

## Tool Functions

- `create_calendar_event`: Creates new calendar events
- `list_calendar_events`: Shows upcoming events
- `update_calendar_event`: Modifies existing events
- `delete_calendar_event`: Removes events

## Production Considerations

- Use HTTPS for webhook URL
- Store user tokens securely (database)
- Implement proper user authentication
- Add error handling and logging
- Consider rate limiting# Force redeploy Wed Nov 12 18:07:06 +07 2025
# Force restart Wed Nov 12 19:25:40 +07 2025
