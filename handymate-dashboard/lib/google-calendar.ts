import { google, calendar_v3 } from 'googleapis'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
]

/**
 * Create an OAuth2 client, optionally with existing credentials
 */
export function getGoogleAuthClient(credentials?: {
  access_token: string
  refresh_token: string
}) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  if (credentials) {
    client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
    })
  }

  return client
}

/**
 * Generate the Google OAuth URL for consent
 */
export function getGoogleAuthUrl(state: string): string {
  const client = getGoogleAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent',
  })
}

/**
 * Exchange authorization code for tokens
 */
export async function getGoogleTokens(code: string): Promise<{
  access_token: string
  refresh_token: string
  expiry_date: number
  email: string
}> {
  const client = getGoogleAuthClient()
  const { tokens } = await client.getToken(code)

  client.setCredentials(tokens)

  // Get user email
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data: userInfo } = await oauth2.userinfo.get()

  return {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token!,
    expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
    email: userInfo.email || '',
  }
}

/**
 * Refresh an expired access token
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string
  expiry_date: number
}> {
  const client = getGoogleAuthClient()
  client.setCredentials({ refresh_token: refreshToken })

  const { credentials } = await client.refreshAccessToken()
  return {
    access_token: credentials.access_token!,
    expiry_date: credentials.expiry_date || Date.now() + 3600 * 1000,
  }
}

/**
 * Get user's calendar list
 */
export async function getCalendarList(accessToken: string): Promise<Array<{
  id: string
  summary: string
  primary: boolean
}>> {
  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: accessToken })

  const calendar = google.calendar({ version: 'v3', auth: client })
  const { data } = await calendar.calendarList.list()

  return (data.items || []).map((cal) => ({
    id: cal.id || '',
    summary: cal.summary || '',
    primary: cal.primary || false,
  }))
}

/**
 * Get events from a calendar within a date range
 */
export async function getCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<Array<{
  id: string
  summary: string
  description: string | null
  start: Date
  end: Date
  allDay: boolean
}>> {
  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: accessToken })

  const calendar = google.calendar({ version: 'v3', auth: client })
  const events: calendar_v3.Schema$Event[] = []
  let pageToken: string | undefined

  do {
    const { data } = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    })
    events.push(...(data.items || []))
    pageToken = data.nextPageToken || undefined
  } while (pageToken)

  return events.map((event) => {
    const allDay = !event.start?.dateTime
    const start = allDay
      ? new Date(event.start?.date + 'T00:00:00')
      : new Date(event.start?.dateTime!)
    const end = allDay
      ? new Date(event.end?.date + 'T23:59:59')
      : new Date(event.end?.dateTime!)

    return {
      id: event.id || '',
      summary: event.summary || '(Ingen titel)',
      description: event.description || null,
      start,
      end,
      allDay,
    }
  })
}

/**
 * Create a new event in Google Calendar
 */
export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: {
    summary: string
    description?: string
    start: Date
    end: Date
    allDay?: boolean
  }
): Promise<string> {
  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: accessToken })

  const calendar = google.calendar({ version: 'v3', auth: client })

  const eventBody: calendar_v3.Schema$Event = {
    summary: event.summary,
    description: event.description,
  }

  if (event.allDay) {
    eventBody.start = { date: event.start.toISOString().split('T')[0] }
    eventBody.end = { date: event.end.toISOString().split('T')[0] }
  } else {
    eventBody.start = { dateTime: event.start.toISOString() }
    eventBody.end = { dateTime: event.end.toISOString() }
  }

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: eventBody,
  })

  return data.id || ''
}

/**
 * Update an existing Google Calendar event
 */
export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: {
    summary?: string
    description?: string
    start?: Date
    end?: Date
    allDay?: boolean
  }
): Promise<void> {
  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: accessToken })

  const calendar = google.calendar({ version: 'v3', auth: client })

  const eventBody: calendar_v3.Schema$Event = {}
  if (event.summary !== undefined) eventBody.summary = event.summary
  if (event.description !== undefined) eventBody.description = event.description

  if (event.start && event.end) {
    if (event.allDay) {
      eventBody.start = { date: event.start.toISOString().split('T')[0] }
      eventBody.end = { date: event.end.toISOString().split('T')[0] }
    } else {
      eventBody.start = { dateTime: event.start.toISOString() }
      eventBody.end = { dateTime: event.end.toISOString() }
    }
  }

  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: eventBody,
  })
}

/**
 * Delete a Google Calendar event
 */
export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const client = getGoogleAuthClient()
  client.setCredentials({ access_token: accessToken })

  const calendar = google.calendar({ version: 'v3', auth: client })
  await calendar.events.delete({ calendarId, eventId })
}

/**
 * Ensure a valid access token, refreshing if needed.
 * Returns the current or refreshed access token.
 */
export async function ensureValidToken(connection: {
  access_token: string
  refresh_token: string
  token_expires_at: string | null
}): Promise<{ access_token: string; expiry_date: number } | null> {
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0

  // Refresh if expiring in less than 5 minutes
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    try {
      return await refreshGoogleToken(connection.refresh_token)
    } catch {
      return null
    }
  }

  return { access_token: connection.access_token, expiry_date: expiresAt }
}
