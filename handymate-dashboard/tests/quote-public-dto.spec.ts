import { test, expect } from '@playwright/test'
import { buildPublicQuoteDto } from '../lib/quotes/public-dto'

test.describe('publik offert-DTO', () => {
  test('är en allowlist och släpper inte service-role-radens hemligheter', () => {
    const dto = buildPublicQuoteDto({
      quote: {
        quote_id: 'q1',
        quote_number: 'OF-2026-1',
        title: 'Badrum',
        status: 'sent',
        total: 1250,
        sign_token: 'secret-token',
        signature_data: 'data:image/png;base64,secret',
        signed_by_ip: '192.0.2.1',
        personnummer: '198001011234',
        fastighetsbeteckning: 'HEMLIG 1:2',
        source_transcript: 'internt samtal',
        opened_at: '2026-08-07T10:00:00Z',
        tracking_session_id: 'tracking-secret',
        business_id: 'biz-secret',
        internal_notes: 'internt',
      },
      customer: {
        name: 'Kund',
        email: 'kund@example.se',
        portal_token: 'portal-token',
        personal_number: '198001011234',
        internal_notes: 'kundhemlighet',
      },
      structuredItems: [],
      displayLevel: 'full',
      displayGroups: undefined,
      baseTotals: undefined,
      templateData: null,
      templateStyle: 'modern',
      documentHtml: null,
    })

    expect(dto).toMatchObject({
      quote_id: 'q1',
      quote_number: 'OF-2026-1',
      title: 'Badrum',
      status: 'sent',
      total: 1250,
      customer: { name: 'Kund', email: 'kund@example.se', portal_token: 'portal-token' },
    })
    const serialized = JSON.stringify(dto)
    for (const forbidden of [
      'sign_token', 'signature_data', 'signed_by_ip', 'personnummer',
      'fastighetsbeteckning', 'source_transcript', 'opened_at',
      'tracking_session_id', 'business_id', 'internal_notes', 'personal_number',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
