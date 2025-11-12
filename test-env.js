// Quick test to verify our environment variables approach works
require('dotenv').config();
const { google } = require('googleapis');

console.log('Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('GOOGLE_CLIENT_ID exists:', !!process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_SECRET exists:', !!process.env.GOOGLE_CLIENT_SECRET);
console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);

// Test creating OAuth client
try {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar']
  });
  
  console.log('✅ OAuth client created successfully');
  console.log('✅ Auth URL generated:', authUrl.substring(0, 50) + '...');
} catch (error) {
  console.log('❌ Error creating OAuth client:', error.message);
}