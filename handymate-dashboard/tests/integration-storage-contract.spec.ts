/**
 * Facit för integrationshemligheternas lagringsgräns.
 *
 * Google/Gmail-token låg historiskt i calendar_connection, men flera senare
 * anropare läste/skrev påhittade business_config-kolumner. PostgREST avvisade
 * då hela frågan och funktionerna blev tysta no-op-vägar. Testet låser både
 * rätt källa och att den gamla källan inte återinförs.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')

test.describe('Google och Gmail använder integrationslagret', () => {
  test('Gmail-sändaren läser calendar_connection, scope-grindar och sparar refresh där', () => {
    const source = read('lib/gmail-send.ts')
    expect(source).toContain(".from('calendar_connection')")
    expect(source).toContain(".eq('gmail_send_scope_granted', true)")
    expect(source).toContain(".eq('gmail_sync_enabled', true)")
    expect(source).toContain('ensureValidToken({')
    expect(source).toContain('persistAccessToken(connection.id')
    expect(source).not.toContain(".from('business_config')")
    expect(source).not.toMatch(/gmail_send_enabled|gmail_email|google_access_token|google_refresh_token/)
  })

  test('OAuth-callbacken skriver bara token till calendar_connection', () => {
    const source = read('app/api/google/callback/route.ts')
    expect(source).toContain(".from('calendar_connection')")
    expect(source).toContain('refreshTokenField')
    expect(source).not.toContain(".from('business_config')")
    expect(source).not.toMatch(/google_access_token|google_refresh_token|gmail_send_enabled|gmail_email/)
  })

  test('röstkalendern använder giltig token och persisterar en refresh före skrivning', () => {
    const source = read('app/api/voice/execute/route.ts')
    const start = source.indexOf("case 'calendar':")
    const calendarCase = source.slice(start, source.indexOf('default:', start))
    expect(calendarCase).toContain(".from('calendar_connection')")
    expect(calendarCase).toContain('ensureValidToken({')
    expect(calendarCase).toContain('createGoogleEvent(')
    expect(calendarCase).not.toContain(".from('business_config')")
    expect(calendarCase).not.toMatch(/google_access_token|google_calendar_id/)
  })

  test('automationsprovet och maildiagnostiken läser calendar_connection', () => {
    for (const file of ['app/api/automations/test/route.ts', 'app/api/debug/mail/route.ts']) {
      const source = read(file)
      expect(source).toContain(".from('calendar_connection')")
      expect(source).not.toMatch(/\.from\('business_config'\)[\s\S]{0,250}(?:google_|gmail_)/)
    }
  })
})
