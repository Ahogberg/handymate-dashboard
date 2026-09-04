/**
 * Facit för dygnsdigesten "Senaste dygnet" (Tur 4 etapp 6).
 *
 * Det som testas hårdast är FÖNSTRET och GRINDARNA: midnattsfiltret gjorde
 * listan tom klockan 07 trots en natt full av cron-arbete; det rullande
 * dygnet ska visa nattens arbete — men aldrig misslyckanden, agentprat
 * eller aggregat som redan sägs bättre någon annanstans.
 *
 *   npx playwright test tests/dygnsdigest.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { byggDygnsdigest, halsningsBevis, DIGEST_TIMMAR } from '../lib/jarvis/dygnsdigest'

const ROOT = path.resolve(__dirname, '..')
const NU = new Date('2026-08-10T07:00:00.000Z')

const akt = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  source: 'automation',
  agent_id: 'karin',
  description: 'Skickade påminnelse för faktura 2026-014',
  status: 'success',
  created_at: '2026-08-10T02:00:00.000Z', // mitt i natten — poängen med fönstret
  ...over,
})

test.describe('fönstret är 24 h rullande — inte midnatt', () => {
  test('nattens arbete syns klockan 07', () => {
    const rader = byggDygnsdigest({ aktiviteter: [akt('a', { created_at: '2026-08-10T02:00:00.000Z' })], nu: NU })
    expect(rader).toHaveLength(1)
  })

  test('gårdagens förmiddag är inom fönstret, förrgår är utanför', () => {
    const rader = byggDygnsdigest({
      aktiviteter: [
        akt('inne', { created_at: '2026-08-09T09:00:00.000Z' }),   // 22 h sedan
        akt('ute', { created_at: '2026-08-09T05:00:00.000Z' }),    // 26 h sedan
      ],
      nu: NU,
    })
    expect(rader.map(r => r.key)).toEqual(['automation-inne'])
    expect(DIGEST_TIMMAR).toBe(24)
  })

  test('framtida tidsstämplar och skräpdatum släpps aldrig in', () => {
    expect(byggDygnsdigest({ aktiviteter: [akt('f', { created_at: '2026-08-10T09:00:00.000Z' })], nu: NU })).toEqual([])
    expect(byggDygnsdigest({ aktiviteter: [akt('s', { created_at: 'inte-ett-datum' })], nu: NU })).toEqual([])
  })
})

test.describe('grindarna', () => {
  test('misslyckanden är inte utförda handlingar', () => {
    expect(byggDygnsdigest({ aktiviteter: [akt('x', { status: 'failed' })], nu: NU })).toEqual([])
  })

  test('rader utan beskrivning faller', () => {
    expect(byggDygnsdigest({ aktiviteter: [akt('x', { description: null })], nu: NU })).toEqual([])
    expect(byggDygnsdigest({ aktiviteter: [akt('x', { description: '   ' })], nu: NU })).toEqual([])
  })

  test('självpresentationer och analyser är brus — deterministiskt', () => {
    for (const beskrivning of [
      'Jag är Karin och håller koll på fakturorna',
      'Hej! Jag har tittat på veckan',
      'Av 11 offerter har 4 accepterats',
    ]) {
      expect(byggDygnsdigest({ aktiviteter: [akt('x', { description: beskrivning })], nu: NU }),
        `"${beskrivning}" slapp igenom`).toEqual([])
    }
  })

  test('tom indata ger tom lista', () => {
    expect(byggDygnsdigest({ aktiviteter: [], nu: NU })).toEqual([])
  })
})

test.describe('dåtidsaggregatet för samtalen', () => {
  test('prependas i dåtid när samtal finns', () => {
    const rader = byggDygnsdigest({ aktiviteter: [akt('a')], samtal: { antal: 7, bokade: 2 }, nu: NU })
    expect(rader[0].agentId).toBe('lisa')
    expect(rader[0].text).toBe('Lisa tog 7 samtal — 2 blev bokade besök')
  })

  test('bokade besök påstås BARA när siffran är sann', () => {
    const rader = byggDygnsdigest({ aktiviteter: [], samtal: { antal: 7, bokade: 0 }, nu: NU })
    expect(rader[0].text).toBe('Lisa tog 7 samtal')
    expect(rader[0].text).not.toContain('bokade')
  })

  test('noll samtal ger ingen rad', () => {
    expect(byggDygnsdigest({ aktiviteter: [], samtal: { antal: 0, bokade: 0 }, nu: NU })).toEqual([])
  })
})

test.describe('hälsningens bevis', () => {
  test('tyst dygn utan beslut: inget behövde dig', () => {
    expect(halsningsBevis('7 samtal och 2 offerter', 0))
      .toBe('Senaste dygnet: 7 samtal och 2 offerter — inget behövde dig')
  })

  test('med beslut: förrän nu', () => {
    expect(halsningsBevis('7 samtal', 3))
      .toBe('Senaste dygnet: 7 samtal — inget behövde dig förrän nu')
  })

  test('utan delar finns ingen rad — aldrig en tom mening', () => {
    expect(halsningsBevis(null, 0)).toBeNull()
  })
})

test.describe('ytan', () => {
  // Etapp C3 (2026-08-17): digestens JSX flyttade från JarvisHome till
  // components/jarvis/home/SkottUtanDig.tsx — auto-raderna lyfta till en
  // synlig checklista, hela listan bakom "Visa alla". Datat (dygnsRader)
  // byggs kvar i JarvisHome och skickas som prop — EN sanning.
  const home = fs.readFileSync(path.join(ROOT, 'components/jarvis/JarvisHome.tsx'), 'utf8')
  const skott = fs.readFileSync(path.join(ROOT, 'components/jarvis/home/SkottUtanDig.tsx'), 'utf8')

  test('digesten ligger under besluten, före bevakningen — monterad som SkottUtanDig', () => {
    // Pass C, del 2 (2026-09-04): SkottUtanDig fick en `titel`-prop byggd av
    // "sedan du var här senast"-fönstret (lib/jarvis/senast-sedd.ts) —
    // monteringspunkten/ordningen den här texten faktiskt testar är orörd.
    expect(home).toContain('<SkottUtanDig rader={dygnsRader} titel={skottUtanDigTitel} />')
    const digestPos = home.indexOf('<SkottUtanDig rader={dygnsRader} titel={skottUtanDigTitel} />')
    const bevakningPos = home.indexOf('<TeamBevakning')
    const nyheterPos = home.indexOf('── Värt att veta ──')
    expect(digestPos).toBeLessThan(bevakningPos)
    expect(bevakningPos).toBeLessThan(nyheterPos)
    // Midnattsfiltret är borta ur ytan — fönstret bor i lib:en.
    expect(home).not.toContain('midnatt')
  })

  test('sektionen heter vad den mäter och skiljer automatiskt från godkänt', () => {
    expect(skott).toContain('Skött utan dig sedan i går')
    // Bara auto-raderna i checklistan; de användargodkända bor i den
    // utfällda listan — aldrig en andra kopia.
    expect(skott).toContain('rader.filter(r => r.auto)')
    expect(skott).toContain('Visa alla {rader.length}')
    expect(skott).toContain('Automatiskt')
    expect(skott).toContain('Godkänt av dig')
  })

  test('hälsningen använder bevisraden och färska beslut prependas orörda', () => {
    expect(home).toContain('halsningsBevis(proof, beslut)')
    // executeSend-prepend till doneRows är orörd — färskt beslut syns direkt.
    expect(home).toContain('setDoneRows(prev => [{')
    expect(home).toContain('...doneRows,')
  })

  test('agentfärgad prick per rad — färgen ur personakartan', () => {
    expect(skott).toContain('AGENT_INFO[r.agent]?.dot')
  })

  test('närvarobandets lib är städad', () => {
    expect(fs.existsSync(path.join(ROOT, 'lib/jarvis/team-presence.ts'))).toBe(false)
    expect(home).not.toContain('byggNarvaro')
  })
})
