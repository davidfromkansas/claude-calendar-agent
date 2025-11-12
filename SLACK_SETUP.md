# Slack Calendar Agent Setup

## Step 1: Create Slack App

1. **Go to [api.slack.com/apps](https://api.slack.com/apps)**
2. **Click "Create New App" → "From scratch"**
3. **App Name:** `Calendar Agent`
4. **Workspace:** Select your workspace
5. **Click "Create App"**

## Step 2: Add Slash Command

1. **In your app settings, go to "Slash Commands"**
2. **Click "Create New Command"**
3. **Configure:**
   ```
   Command: /calendar
   Request URL: https://claude-calendar-agent-production.up.railway.app/slack-webhook
   Short Description: Manage your calendar with natural language
   Usage Hint: schedule meeting tomorrow at 2pm with john@company.com
   ```
4. **Click "Save"**

## Step 3: Add Required Environment Variables

**In your Railway dashboard, add:**

```
CLAUDE_API_KEY=your_claude_api_key_here
```

## Step 4: Install App to Workspace

1. **Go to "Install App" in sidebar**
2. **Click "Install to Workspace"**
3. **Authorize the app**

## Step 5: Test the Integration

**In any Slack channel, try:**

```
/calendar schedule lunch with Sarah tomorrow at 1pm
/calendar what's on my calendar today?
/calendar block 2 hours Friday afternoon for project work
/calendar cancel my 3pm meeting
```

## How It Works

```
User types: /calendar schedule dinner with mom tomorrow 7pm
↓
Slack sends request to your webhook
↓
Claude API parses: "create_calendar_event" with extracted details
↓
Your calendar agent creates the event
↓
Slack shows: "✅ Dinner with mom scheduled for Nov 14 at 7pm!"
```

## Natural Language Examples

**Creating Events:**
- `/calendar schedule team standup tomorrow 9am`
- `/calendar book dentist appointment Friday 2pm`
- `/calendar dinner with John next Tuesday at 7pm at Luigi's`

**Viewing Calendar:**
- `/calendar what do I have today?`
- `/calendar show my schedule for this week`
- `/calendar what's coming up?`

**Updating Events:**
- `/calendar move my 3pm meeting to 4pm`
- `/calendar reschedule lunch to tomorrow`
- `/calendar cancel my dentist appointment`

## Troubleshooting

**❌ "Calendar not authenticated"**
→ Visit https://claude-calendar-agent-production.up.railway.app/auth

**❌ "Claude API not configured"**
→ Add CLAUDE_API_KEY environment variable in Railway

**❌ Command not working**
→ Check that Request URL is correct in Slack app settings