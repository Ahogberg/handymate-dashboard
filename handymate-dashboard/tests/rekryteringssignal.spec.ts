/**
 * Facit för rekryteringssignalen (2026-09-03).
 *
 * Testas mot ett RIKTIGT svar från jobsearch.api.jobtechdev.se, sparat i
 * tests/fixtures/jobtech-elektriker.json. Ingen fältstruktur i modulen är
 * gissad — API:et var blockerat från utvecklingsmiljön, så svaret hämtades
 * på en riktig maskin först. Det är samma lärdom som resten av dagen:
 * en parser mot en overifierad form är en bugg som väntar.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  harledRekryteringssignal,
  normaliseraOrgnummer,
  REKRYTERING_FONSTER_DAGAR,
  type PlatsbankenTraff,
} from '../lib/launch-desk/rekryteringssignal'

const fixtur = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'fixtures/jobtech-elektriker.json'), 'utf8'),
) as { hits: PlatsbankenTraff[] }

// Fixturens annonser är publicerade 2026-09-01 och 2026-09-03.
const NU = new Date('2026-09-04T08:00:00+02:00')

test.describe('normaliseraOrgnummer', () => {
  test('bindestreck spelar ingen roll — JobTech svarar utan, register har med', () => {
    expect(normaliseraOrgnummer('556093-6949')).toBe('5560936949')
    expect(normaliseraOrgnummer('5560936949')).toBe('5560936949')
  })

  test('sekelprefix skalas bort', () => {
    expect(normaliseraOrgnummer('165560936949')).toBe('5560936949')
  })

  test('skräp ger tom sträng, inte en halv matchning', () => {
    expect(normaliseraOrgnummer(null)).toBe('')
    expect(normaliseraOrgnummer('okänt')).toBe('')
  })
})

test.describe('harledRekryteringssignal — mot riktig Platsbanken-data', () => {
  test('träff på organisationsnumret ger en signal med länk till annonsen', () => {
    const signal = harledRekryteringssignal(fixtur.hits, '556093-6949', NU)
    expect(signal).not.toBeNull()
    expect(signal!.key).toBe('rekryterar')
    expect(signal!.evidence).toContain('arbetsformedlingen.se/platsbanken/annonser/31422979')
    expect(signal!.evidence).toContain('2026-09-01')
  })

  test('ORGANISATIONSNUMRET är grinden, inte fritextsökningen', () => {
    // Fixturen innehåller Jönköpings kommun och SkiStar — båda helt utanför
    // målgruppen, båda hemhämtade av en sökning på "elektriker". Ett företag
    // som inte finns bland träffarna får ingen signal, hur många annonser
    // sökningen än returnerade.
    expect(harledRekryteringssignal(fixtur.hits, '556677-8899', NU)).toBeNull()
  })

  test('utan organisationsnummer ges ingen signal — vi gissar aldrig på namn', () => {
    expect(harledRekryteringssignal(fixtur.hits, null, NU)).toBeNull()
    expect(harledRekryteringssignal(fixtur.hits, '5560', NU)).toBeNull()
  })

  test('en borttagen annons räknas inte', () => {
    const borttagen = fixtur.hits.map(h => ({ ...h, removed: true }))
    expect(harledRekryteringssignal(borttagen, '5560936949', NU)).toBeNull()
  })

  test('en gammal annons säger inget om läget just nu', () => {
    const senare = new Date(NU.getTime() + (REKRYTERING_FONSTER_DAGAR + 1) * 86400000)
    expect(harledRekryteringssignal(fixtur.hits, '5560936949', senare)).toBeNull()
  })

  test('en annons daterad i framtiden räknas inte', () => {
    const tidigare = new Date('2026-08-01T08:00:00+02:00')
    expect(harledRekryteringssignal(fixtur.hits, '5560936949', tidigare)).toBeNull()
  })

  test('flera annonser ger starkare signal än en', () => {
    const en = harledRekryteringssignal(fixtur.hits, '5560936949', NU)
    const tva = harledRekryteringssignal(
      [...fixtur.hits, { ...fixtur.hits[1], id: '999', publication_date: '2026-09-02T09:00:00' }],
      '5560936949', NU,
    )
    expect(en!.styrka).toBe(2)
    expect(tva!.styrka).toBe(3)
    expect(tva!.label).toContain('2 annonser')
  })

  test('senaste annonsen bär beviset — den är mest aktuell i ett samtal', () => {
    const signal = harledRekryteringssignal(
      [
        { ...fixtur.hits[1], id: 'gammal', publication_date: '2026-07-01T09:00:00', webpage_url: 'https://x/gammal' },
        { ...fixtur.hits[1], id: 'ny', publication_date: '2026-09-02T09:00:00', webpage_url: 'https://x/ny' },
      ],
      '5560936949', NU,
    )
    expect(signal!.evidence).toContain('/ny')
    expect(signal!.evidence).not.toContain('/gammal')
  })

  test('tom lista och skräp ger null, aldrig ett kast', () => {
    expect(harledRekryteringssignal([], '5560936949', NU)).toBeNull()
    expect(harledRekryteringssignal([{}, { employer: null }], '5560936949', NU)).toBeNull()
  })
})

test.describe('hämtningen är fail-soft', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../lib/launch-desk/rekryteringssignal.ts'), 'utf8')

  test('nätverksfel ger tom lista, aldrig ett kast — en utebliven signal får inte fälla briefen', () => {
    expect(src).toMatch(/catch[\s\S]{0,200}return \[\]/)
  })

  test('anropet har en timeout', () => {
    expect(src).toContain('AbortSignal.timeout')
  })

  test('bara verifierade parametrar används', () => {
    expect(src).toContain('search?q=')
    expect(src).toContain('&limit=')
    // employer-filtret är inte verifierat mot ett riktigt svar och används
    // därför inte — en ogiltig parameter ger tyst noll träffar.
    expect(src).not.toMatch(/search\?[^`'"]*employer=/)
  })
})

test.describe('inkopplingen', () => {
  const runner = fs.readFileSync(path.resolve(__dirname, '../lib/launch-desk/signaler-runner.ts'), 'utf8')
  const rutt = fs.readFileSync(path.resolve(__dirname, '../app/api/admin/launch/accounts/[id]/signaler/route.ts'), 'utf8')
  const sida = fs.readFileSync(path.resolve(__dirname, '../app/admin/launch/page.tsx'), 'utf8')

  test('runnern hämtar rekryteringen OBEROENDE av webbplatsen', () => {
    // Många av de bästa prospekten — små firmor med en telefon och inget mer
    // — har ingen sajt alls. De ska inte tappa signalen för det.
    expect(runner).toContain('rekryteringPromise')
    expect(runner.indexOf('const rekryteringPromise')).toBeLessThan(runner.indexOf('if (!account.website)'))
  })

  test('signalen sparas även när webbläsningen faller', () => {
    const felBlock = runner.slice(runner.indexOf('async function fel('), runner.indexOf('if (!account.website)'))
    expect(felBlock).toContain('await rekryteringPromise')
    expect(felBlock).toContain('rekrytering ? [rekrytering] : []')
  })

  test('rutten kräver inte längre en webbplats när orgnummer finns', () => {
    expect(rutt).toContain('!account.website && !account.org_number')
  })

  test('rekryteringen läggs först bland signalerna — starkast öppning', () => {
    expect(runner).toContain('[rekrytering, ...webbsignaler]')
  })

  test('listan visar anställda och rekrytering som egna kolumner', () => {
    expect(sida).toContain('>Anställda<')
    expect(sida).toContain('>Växer<')
    expect(sida).toContain('Rekryterar')
  })

  test('rekryterande firmor sorteras först och går att sålla på', () => {
    expect(sida).toContain('baraRekryterande')
    expect(sida).toContain('const rek = Number(Boolean(rekryteringssignal(b)))')
  })
})
