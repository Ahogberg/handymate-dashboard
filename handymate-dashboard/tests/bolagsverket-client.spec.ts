/**
 * Facit för lib/bolagsverket/client.ts:s rena delar (2026-08-15).
 * Token-hämtning/HTTP-anropet mockas inte här — bara logiken som INTE
 * kräver nätverk: token-cache-giltighet + defensiv svarstolkning.
 *
 *   npx playwright test tests/bolagsverket-client.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { isTokenValid, parseOrganisationResponse } from '../lib/bolagsverket/client'

test.describe('isTokenValid — 60s marginal, hellre hämta en ny token för tidigt', () => {
  test('null token är aldrig giltig', () => {
    expect(isTokenValid(null, Date.now())).toBe(false)
  })

  test('token med gott om tid kvar är giltig', () => {
    const nu = 1_000_000
    expect(isTokenValid({ accessToken: 'x', expiresAtMs: nu + 300_000 }, nu)).toBe(true)
  })

  test('token inom 60s-marginalen räknas som ogiltig', () => {
    const nu = 1_000_000
    expect(isTokenValid({ accessToken: 'x', expiresAtMs: nu + 30_000 }, nu)).toBe(false)
  })

  test('redan utgången token är ogiltig', () => {
    const nu = 1_000_000
    expect(isTokenValid({ accessToken: 'x', expiresAtMs: nu - 1 }, nu)).toBe(false)
  })
})

test.describe('parseOrganisationResponse — defensiv, aldrig påhittad data', () => {
  test('null/icke-objekt ger null, kastar aldrig', () => {
    expect(parseOrganisationResponse(null)).toBeNull()
    expect(parseOrganisationResponse(undefined)).toBeNull()
    expect(parseOrganisationResponse('sträng')).toBeNull()
    expect(parseOrganisationResponse(42)).toBeNull()
  })

  test('helt okänd form (inget igenkänt fält) ger null i stället för ett tomt objekt', () => {
    expect(parseOrganisationResponse({ helt_okant_falt: 'x' })).toBeNull()
  })

  test('ett fullständigt, förväntat svar tolkas korrekt', () => {
    const raw = {
      organisationsnamn: { organisationsnamnLista: [{ namn: 'Bee El AB' }] },
      organisationsform: { klartext: 'Aktiebolag' },
      postadressOrganisation: {
        utdelningsadress: 'Storgatan 1',
        postnummer: '123 45',
        postort: 'Stockholm',
      },
      naringsgrensindelning: [{ kod: '43210' }],
    }
    const parsed = parseOrganisationResponse(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.name).toBe('Bee El AB')
    expect(parsed!.companyForm).toBe('Aktiebolag')
    expect(parsed!.address).toEqual({ street: 'Storgatan 1', postalCode: '123 45', city: 'Stockholm' })
    expect(parsed!.sniCode).toBe('43210')
  })

  test('delvis svar (bara namn, ingen adress) tolkas ändå — fälten som saknas blir null, inte gissade', () => {
    const raw = { organisationsnamn: { organisationsnamnLista: [{ namn: 'Solo Bygg' }] } }
    const parsed = parseOrganisationResponse(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.name).toBe('Solo Bygg')
    expect(parsed!.address).toBeNull()
    expect(parsed!.companyForm).toBeNull()
  })

  test('tom organisationsnamnLista ger null-namn, inte en krasch', () => {
    const raw = { organisationsnamn: { organisationsnamnLista: [] }, organisationsform: { klartext: 'Enskild firma' } }
    const parsed = parseOrganisationResponse(raw)
    expect(parsed!.name).toBeNull()
    expect(parsed!.companyForm).toBe('Enskild firma')
  })
})
