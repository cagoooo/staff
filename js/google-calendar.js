// Google Calendar Integration Module
// Single-way sync: System → Google Calendar

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// Store access token from Google login
let _accessToken = null;

/**
 * Set the access token from Google login
 * @param {string} token - OAuth access token
 */
export function setAccessToken(token) {
    _accessToken = token;
    sessionStorage.setItem('google_access_token', token);
}

/**
 * Get stored access token
 * @returns {string|null}
 */
export function getAccessToken() {
    if (_accessToken) return _accessToken;
    return sessionStorage.getItem('google_access_token');
}

/**
 * Check if user has calendar access
 * @returns {boolean}
 */
export function hasCalendarAccess() {
    return !!getAccessToken();
}

/**
 * Clear calendar access
 */
export function clearCalendarAccess() {
    _accessToken = null;
    sessionStorage.removeItem('google_access_token');
}

/**
 * Add event to Google Calendar
 * @param {Object} eventData - Event data from the system
 * @param {string} eventData.title - Event title
 * @param {string} eventData.date - Date in YYYY-MM-DD format
 * @param {string} eventData.time - Time in HH:MM format
 * @param {string} eventData.authorName - Creator name
 * @returns {Promise<Object>} - Created calendar event
 */
export async function addToGoogleCalendar(eventData) {
    const token = getAccessToken();

    if (!token) {
        throw new Error('未授權 Google 行事曆存取');
    }

    // Parse date and time
    const startDateTime = new Date(`${eventData.date}T${eventData.time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour duration

    // Format for Google Calendar API
    const calendarEvent = {
        summary: eventData.title,
        description: `建立者：${eventData.authorName}\n來源：行政業務協調系統`,
        start: {
            dateTime: startDateTime.toISOString(),
            timeZone: 'Asia/Taipei'
        },
        end: {
            dateTime: endDateTime.toISOString(),
            timeZone: 'Asia/Taipei'
        },
        reminders: {
            useDefault: false,
            overrides: [
                { method: 'popup', minutes: 30 },
                { method: 'popup', minutes: 10 }
            ]
        }
    };

    try {
        const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(calendarEvent)
        });

        if (!response.ok) {
            const error = await response.json();

            // Token expired
            if (response.status === 401) {
                clearCalendarAccess();
                throw new Error('授權已過期，請重新以 Google 登入');
            }

            throw new Error(error.error?.message || '新增行事曆失敗');
        }

        const result = await response.json();
        console.log('[Calendar] Event created:', result.id);
        return result;

    } catch (err) {
        console.error('[Calendar] Error:', err);
        throw err;
    }
}

/**
 * Check if calendar API is accessible
 * @returns {Promise<boolean>}
 */
export async function testCalendarAccess() {
    const token = getAccessToken();
    if (!token) return false;

    try {
        const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch {
        return false;
    }
}
