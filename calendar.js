const { google } = require('googleapis');
const fs = require('fs');

class CalendarService {
  constructor() {
    this.oauth2Client = null;
    this.calendar = null;
  }

  // Initialize OAuth client with credentials
  async initialize(credentials) {
    try {
      const { client_id, client_secret } = credentials.web || credentials;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/callback';
      
      if (!client_id || !client_secret) {
        throw new Error('Missing client_id or client_secret');
      }
      
      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirectUri
      );

      this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      console.log('Calendar service initialized successfully');
    } catch (error) {
      console.error('Calendar initialization error:', error.message);
      throw error;
    }
  }

  // Get authorization URL for user to grant permissions
  getAuthUrl() {
    const scopes = ['https://www.googleapis.com/auth/calendar'];
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
  }

  // Exchange authorization code for tokens
  async getTokens(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  // Set tokens from storage
  setTokens(tokens) {
    this.oauth2Client.setCredentials(tokens);
  }

  // Create a new calendar event
  async createEvent(eventData) {
    const { title, startTime, endTime, description, attendees = [] } = eventData;
    
    // Validate and parse dates
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    
    if (isNaN(startDate.getTime())) {
      throw new Error(`Invalid start time: ${startTime}`);
    }
    if (isNaN(endDate.getTime())) {
      throw new Error(`Invalid end time: ${endTime}`);
    }
    
    console.log('Creating event with dates:', {
      startTime: startTime,
      endTime: endTime,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });
    
    const event = {
      summary: title,
      description: description,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'America/Los_Angeles',
      },
      attendees: attendees.map(email => ({ email })),
    };

    try {
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });
      
      return {
        success: true,
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
        message: `Event "${title}" created successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // List upcoming events
  async listEvents(maxResults = 100) {
    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items.map(event => ({
        id: event.id,
        title: event.summary,
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        description: event.description,
        htmlLink: event.htmlLink
      }));

      return {
        success: true,
        events: events,
        message: `Found ${events.length} upcoming events`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update an existing event
  async updateEvent(eventId, updates) {
    try {
      const existingEvent = await this.calendar.events.get({
        calendarId: 'primary',
        eventId: eventId,
      });

      const updatedEvent = {
        ...existingEvent.data,
        summary: updates.title || existingEvent.data.summary,
        description: updates.description || existingEvent.data.description,
      };

      if (updates.startTime) {
        updatedEvent.start = {
          dateTime: new Date(updates.startTime).toISOString(),
          timeZone: 'America/Los_Angeles',
        };
      }

      if (updates.endTime) {
        updatedEvent.end = {
          dateTime: new Date(updates.endTime).toISOString(),
          timeZone: 'America/Los_Angeles',
        };
      }

      const response = await this.calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: updatedEvent,
      });

      return {
        success: true,
        eventId: response.data.id,
        message: `Event updated successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete an event
  async deleteEvent(eventId) {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });

      return {
        success: true,
        message: `Event deleted successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = CalendarService;