/**
 * Facit för lib/bolagsverket/client.ts:s rena delar (2026-08-15).
 * Token-hämtning/HTTP-anropet mockas inte här — bara logiken som INTE
 * kräver nätverk: token-cache-giltighet + defensiv svarstolkning.
 *
 *   npx playwright test tests/bolagsverket-client.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { apiErrorCodes, foretagsnamn, isTokenValid, parseOrganisationResponse, topLevelKeys, valdOrganisation } from '../lib/bolagsverket/client'

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

test.describe('parseOrganisationResponse — facit mot Bolagsverkets EGNA svarsexempel', () => {
  // Fixturen är klippt rakt ur "VärdefullaDatamängder v1" (devportal → Download
  // Swagger), components.examples. Inga påhittade svar: tolkningen var tidigare
  // skriven mot en gissad form och läste varje fält en nivå för högt.
  const exempel = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/bolagsverket-organisationer.json'), 'utf8'),
  ) as { aktiebolag: unknown; enskildNaringsidkare: unknown; fel: Record<string, unknown> }

  test('aktiebolagsexemplet ger namn, bolagsform, adress, SNI och verksamhet', () => {
    const p = parseOrganisationResponse(exempel.aktiebolag)
    expect(p).not.toBeNull()
    // FORETAGSNAMN, inte listans första bästa: exemplet bär även "Mopedbolaget AB"
    // (särskilt företagsnamn) och "Bicycle expert" (främmande språk).
    expect(p!.name).toBe('Cykelbolaget AB')
    expect(p!.companyForm).toBe('Aktiebolag')
    expect(p!.address).toEqual({ street: 'Jobbstigen 2', postalCode: '12345', city: 'Grönköping' })
    expect(p!.sniCode).toBe('47642')
    expect(p!.description).toBe('Bedriva handel med cyklar och tillbehör till cyklar')
  })

  test('adressen läses ur postadressOrganisation.postadress, inte en nivå för högt', () => {
    // Den gamla koden läste postadressOrganisation.utdelningsadress direkt och
    // fick alltid null. Facit: adressen ligger ett steg ner.
    const platt = { organisationer: [{ postadressOrganisation: { utdelningsadress: 'Fel nivå' } }] }
    expect(parseOrganisationResponse(platt)).toBeNull()
  })

  test('enskild näringsidkare: flera firmor på samma personnummer hanteras', () => {
    const svar = exempel.enskildNaringsidkare as { organisationer: unknown[] }
    expect(svar.organisationer.length).toBeGreaterThan(1)
    const p = parseOrganisationResponse(svar)
    expect(p).not.toBeNull()
    expect(p!.companyForm).toBe('Enskild näringsidkare')
    // Beskrivningen i deras exempel inleds med tecknen \ och n — ett artefakt i
    // dokumentationsfilen, inte en radbrytning. Vi trimmar äkta blanktecken och
    // låter innehållet vara: att strippa bakstreck-n hade varit att bygga in en
    // egenhet hos exempelfilen i tolkningen av skarpa svar.
    expect(p!.description).toContain('HANDEL MED SKOR.')
  })

  test('äkta blanktecken runt verksamhetsbeskrivningen trimmas bort', () => {
    const svar = { organisationer: [{ organisationsform: { klartext: 'Aktiebolag' }, verksamhetsbeskrivning: { beskrivning: '\n   Bygg och anläggning.  \t' } }] }
    expect(parseOrganisationResponse(svar)!.description).toBe('Bygg och anläggning.')
    // Enbart blanktecken är inget innehåll.
    const tomt = { organisationer: [{ organisationsform: { klartext: 'Aktiebolag' }, verksamhetsbeskrivning: { beskrivning: '   ' } }] }
    expect(parseOrganisationResponse(tomt)!.description).toBeNull()
  })

  test('en aktiv firma väljs före en avregistrerad', () => {
    const aktiv = { organisationsform: { klartext: 'Enskild näringsidkare' }, avregistreradOrganisation: { avregistreringsdatum: null },
      organisationsnamn: { organisationsnamnLista: [{ namn: 'Aktiva Firman', organisationsnamntyp: { kod: 'FORETAGSNAMN' } }] } }
    const avreg = { organisationsform: { klartext: 'Enskild näringsidkare' }, avregistreradOrganisation: { avregistreringsdatum: 984614400000 },
      organisationsnamn: { organisationsnamnLista: [{ namn: 'Avvecklade Firman', organisationsnamntyp: { kod: 'FORETAGSNAMN' } }] } }
    expect(parseOrganisationResponse({ organisationer: [avreg, aktiv] })!.name).toBe('Aktiva Firman')
    // Bara avregistrerade: ge något hellre än inget.
    expect(parseOrganisationResponse({ organisationer: [avreg] })!.name).toBe('Avvecklade Firman')
  })

  test('valdOrganisation och foretagsnamn är rena och kraschar aldrig på skräp', () => {
    expect(valdOrganisation([])).toBeNull()
    expect(valdOrganisation([null, undefined, 'sträng'])).toBeNull()
    expect(foretagsnamn(null)).toBeNull()
    expect(foretagsnamn({ organisationsnamnLista: [] })).toBeNull()
    expect(foretagsnamn({ organisationsnamnLista: [{ namn: '   ' }] })).toBeNull()
    // Utan typ-kod: första posten med ett namn, hellre än inget.
    expect(foretagsnamn({ organisationsnamnLista: [{ namn: 'Utan typ' }] })).toBe('Utan typ')
  })

  test('null/icke-objekt och fel svarsform ger null, kastar aldrig', () => {
    for (const v of [null, undefined, 'sträng', 42, {}, { organisationer: null }, { organisationer: [] }]) {
      expect(parseOrganisationResponse(v), JSON.stringify(v) ?? 'undefined').toBeNull()
    }
  })

  test('ett svar utan igenkänt innehåll ger null i stället för ett tomt objekt', () => {
    expect(parseOrganisationResponse({ organisationer: [{ helt_okant_falt: 'x' }] })).toBeNull()
    // Bara SNI räcker inte — det är inget att prefylla onboardingen med.
    expect(parseOrganisationResponse({ organisationer: [{ naringsgrenOrganisation: { sni: [{ kod: '43210' }] } }] })).toBeNull()
  })

  test('delvis svar tolkas ändå — det som saknas blir null, aldrig gissat', () => {
    const bara_namn = { organisationer: [{ organisationsnamn: { organisationsnamnLista: [{ namn: 'Solo Bygg', organisationsnamntyp: { kod: 'FORETAGSNAMN' } }] } }] }
    const p = parseOrganisationResponse(bara_namn)
    expect(p!.name).toBe('Solo Bygg')
    expect(p!.address).toBeNull()
    expect(p!.companyForm).toBeNull()
    expect(p!.sniCode).toBeNull()
    expect(p!.description).toBeNull()
  })
})

test.describe('apiErrorCodes — Bolagsverkets RFC 7807-felsvar, koderna men aldrig fritexten', () => {
  const fel = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/bolagsverket-organisationer.json'), 'utf8'),
  ).fel as Record<string, Record<string, unknown>>

  test('felkod och requestId plockas ur deras egna exempel', () => {
    const rad = apiErrorCodes(fel['ApiError-felbegaran'])
    expect(rad).toContain('client.error')
    expect(rad).toContain('requestId=f628a504-4631-4c04-8358-f17fc370ac79')
  })

  test('detail loggas ALDRIG — den bär tillbaka det vi skickade in', () => {
    // Deras eget exempel: "Identitetsbeteckning har ogiltig kontrollsiffra."
    // För en enskild firma är det fältet ett personnummer.
    for (const e of Object.values(fel)) {
      const rad = apiErrorCodes(e)
      expect(rad, JSON.stringify(e)).not.toContain(String(e.detail))
      expect(rad).not.toContain(String(e.title))
    }
  })

  test('serverfel skiljs från klientfel på instance', () => {
    expect(apiErrorCodes(fel['ApiError-servicefel'])).toContain('server.error')
    expect(apiErrorCodes(fel['ApiError-ejhittad'])).toContain('client.error')
  })

  test('skräp och tomt svar kraschar aldrig, och säger vad som fanns', () => {
    expect(apiErrorCodes(null)).toBe('(inget läsbart felsvar)')
    expect(apiErrorCodes('sträng')).toBe('(inget läsbart felsvar)')
    expect(apiErrorCodes({ nagot: 1 })).toContain('nagot')
  })
})
