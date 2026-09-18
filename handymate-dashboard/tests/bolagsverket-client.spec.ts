/**
 * Facit för lib/bolagsverket/client.ts:s rena delar (2026-08-15).
 * Token-hämtning/HTTP-anropet mockas inte här — bara logiken som INTE
 * kräver nätverk: token-cache-giltighet + defensiv svarstolkning.
 *
 *   npx playwright test tests/bolagsverket-client.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { isTokenValid, parseOrganisationResponse, topLevelKeys } from '../lib/bolagsverket/client'

const PROD = 'https://portal.api.bolagsverket.se/oauth2/token'
const ACCEPT = 'https://portal-accept2.api.bolagsverket.se/oauth2/token'

test.describe('isTokenValid — 60s marginal, hellre hämta en ny token för tidigt', () => {
  test('null token är aldrig giltig', () => {
    expect(isTokenValid(null, Date.now(), PROD)).toBe(false)
  })

  test('token med gott om tid kvar är giltig', () => {
    const nu = 1_000_000
    expect(isTokenValid({ accessToken: 'x', expiresAtMs: nu + 300_000, tokenUrl: PROD }, nu, PROD)).toBe(true)
  })

  test('token inom 60s-marginalen räknas som ogiltig', () => {
    const nu = 1_000_000
    expect(isTokenValid({ accessToken: 'x', expiresAtMs: nu + 30_000, tokenUrl: PROD }, nu, PROD)).toBe(false)
  })

  test('redan utgången token är ogiltig', () => {
    const nu = 1_000_000
    expect(isTokenValid({ accessToken: 'x', expiresAtMs: nu - 1, tokenUrl: PROD }, nu, PROD)).toBe(false)
  })

  test('en token från en ANNAN miljö är aldrig giltig, hur färsk den än är', () => {
    // Byter BOLAGSVERKET_ENV på en varm lambda skulle acceptans-token annars
    // serverats mot produktionsgatewayen — ett 401 utan förklaring.
    const nu = 1_000_000
    const fran_accept = { accessToken: 'x', expiresAtMs: nu + 300_000, tokenUrl: ACCEPT }
    expect(isTokenValid(fran_accept, nu, ACCEPT)).toBe(true)
    expect(isTokenValid(fran_accept, nu, PROD)).toBe(false)
  })
})

test.describe('topLevelKeys — namnen, aldrig värdena', () => {
  test('objekt ger fältnamnen, inte innehållet', () => {
    const keys = topLevelKeys({ organisationsnamn: { namn: 'Bee El AB' }, personnummer: '19850101-1234' })
    expect(keys).toBe('organisationsnamn,personnummer')
    expect(keys).not.toContain('Bee El')
    expect(keys).not.toContain('19850101')
  })

  test('accept2:s uppräkning av tillåtna testnummer syns som en array, inte som numren', () => {
    expect(topLevelKeys(['165560000000', '165560000001'])).toBe('array(2)')
  })

  test('tomt objekt och icke-objekt kastar aldrig', () => {
    expect(topLevelKeys({})).toBe('(inga fält)')
    expect(topLevelKeys(null)).toBe('null')
    expect(topLevelKeys('sträng')).toBe('string')
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
