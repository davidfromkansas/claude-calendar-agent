# Railway Deployment Guide

## Step 1: Deploy to Railway

1. Sign up at [railway.app](https://railway.app) with GitHub
2. In Terminal, run these commands:

```bash
cd ~/claude-calendar-agent
npx @railway/cli login
npx @railway/cli init
npx @railway/cli up
```

3. Get your Railway URL:
```bash
npx @railway/cli status
```

Your app will be available at something like: `https://your-app-name.railway.app`

## Step 2: Set Environment Variables in Railway

1. Go to your Railway dashboard
2. Click on your project
3. Go to "Variables" tab
4. Add these variables:

```
GOOGLE_REDIRECT_URI=https://your-railway-url.railway.app/callback
NODE_ENV=production
```

**Note:** Replace `your-railway-url` with your actual Railway URL

## Step 3: Update Google Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to APIs & Services → Credentials
3. Click your OAuth 2.0 Client ID
4. Under "Authorized redirect URIs", add:
   ```
   https://your-railway-url.railway.app/callback
   ```
5. Save the changes

## Step 4: Re-authenticate

1. Visit: `https://your-railway-url.railway.app/auth`
2. Complete the Google OAuth flow
3. You should see: "Authorization successful!"

## Step 5: Test the Deployment

Test your deployed webhook:
```bash
curl -X POST https://your-railway-url.railway.app/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "list_calendar_events",
    "parameters": {"max_results": 5}
  }'
```

## Your Webhook URL for Claude Agent

Use this URL in Claude Agent API:
```
https://your-railway-url.railway.app/webhook
```