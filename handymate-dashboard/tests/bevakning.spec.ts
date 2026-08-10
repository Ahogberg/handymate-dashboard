/**
 * Facit för "Teamet just nu" — bevakningen (Tur 4 etapp 3).
 *
 * Kärnregeln: en rad renderas ENDAST vid aktiv bevakning, och grön puls
 * betyder ett vakande öga — aldrig ett kron-schema, aldrig en fråga. Ett
 * bevakningskort som pulserar om ingenting vore samma lögn som "skickade:"
 * på ett kort som inte skickade.
 *
 *   npx playwright test tests/bevakning.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { byggBevakning } from '../lib/jarvis/bevakning'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('hela teamet syns — men bara när datat finns', () => {
  test('tom indata ger tom lista — vi påstår aldrig bevakning vi inte sett', () => {
    expect(byggBevakning({})).toEqual([])
  })

  test('noll händelser är ÄRLIG standby, inte tystnad (produktbeslut 2026-08-10)', () => {
    // Andreas fynd: "hela teamets kollegor syns inte" kändes som ett fel.
    // Karin bevakar fakturorna även när noll är obetalda — raden säger det.
    const rader = byggBevakning({ fakturor: { bevakade: 0 }, offerter: { oppna: 0, followupDagar: 5 } })
    expect(rader.map(r => r.agentId)).toEqual(['karin', 'daniel'])
    expect(rader[0].rubrik).toBe('Bevakar fakturorna')
    expect(rader[0].detalj).toBe('inga obetalda just nu')
    expect(rader[1].rubrik).toBe('Bevakar offerterna')
    // Standby är fortfarande aktiv bevakning — pulsen står på.
    expect(rader.every(r => r.aktiv)).toBe(true)
  })

  test('full indata ger hela teamet — sex rader', () => {
    const rader = byggBevakning({
      fakturor: { bevakade: 2 },
      offerter: { oppna: 1, followupDagar: 5 },
      telefon: { aktiv: true, samtal: 0 },
      nastaBokning: null,
      veckosammanfattning: true,
      hannaFragor: [],
    })
    expect(rader.map(r => r.agentId)).toEqual(['karin', 'daniel', 'lisa', 'lars', 'matte', 'hanna'])
  })

  test('okopplad telefon är ärlig standby utan puls — aldrig påstådd bevakning', () => {
    const [rad] = byggBevakning({ telefon: { aktiv: false, samtal: 7 } })
    expect(rad.agentId).toBe('lisa')
    expect(rad.rubrik).toBe('Telefonen är inte kopplad ännu')
    expect(rad.aktiv).toBe(false)
  })

  test('Karin bevakar fakturor — antal, aldrig belopp', () => {
    const [rad] = byggBevakning({ fakturor: { bevakade: 3 } })
    expect(rad.agentId).toBe('karin')
    expect(rad.rubrik).toBe('Bevakar 3 fakturor')
    expect(rad.detalj).toBe('säger till dagen efter förfallodatum')
    expect(rad.aktiv).toBe(true)
    expect(rad.rubrik + rad.detalj).not.toMatch(/kr/)
  })

  test('singular när det är en', () => {
    expect(byggBevakning({ fakturor: { bevakade: 1 } })[0].rubrik).toBe('Bevakar 1 faktura')
    expect(byggBevakning({ offerter: { oppna: 1, followupDagar: 5 } })[0].rubrik).toBe('1 öppna offert')
  })
})

test.describe('Daniels dag-nummer följer inställningarna', () => {
  test('dagen kommer ur indata — inte mockupens 7', () => {
    const [rad] = byggBevakning({ offerter: { oppna: 4, followupDagar: 5 } })
    expect(rad.agentId).toBe('daniel')
    expect(rad.rubrik).toBe('4 öppna offerter')
    expect(rad.detalj).toBe('föreslår påminnelse på dag 5')
  })

  test('en ändrad cadence syns direkt', () => {
    expect(byggBevakning({ offerter: { oppna: 2, followupDagar: 9 } })[0].detalj)
      .toBe('föreslår påminnelse på dag 9')
  })
})

test.describe('Lisa, Lars och Matte', () => {
  test('Lisa: samtalsutfall när det finns, annars löftet', () => {
    expect(byggBevakning({ telefon: { aktiv: true, samtal: 6 } })[0].detalj).toBe('6 samtal senaste dygnet')
    expect(byggBevakning({ telefon: { aktiv: true, samtal: 0 } })[0].detalj).toBe('svarar när du inte kan')
  })

  test('Lars: nästa bokning med kund och deterministisk etikett', () => {
    const [rad] = byggBevakning({ nastaBokning: { start: '2026-08-12T09:00:00.000Z', kund: 'Eriksson' } })
    expect(rad.agentId).toBe('lars')
    expect(rad.rubrik).toContain('Nästa bokning')
    expect(rad.detalj).toContain('hos Eriksson')
    expect(rad.aktiv).toBe(true)
  })

  test('Lars: trasigt datum eller ingen bokning ger standby — aldrig en gissad tid', () => {
    for (const nastaBokning of [{ start: 'inte-ett-datum' }, null]) {
      const [rad] = byggBevakning({ nastaBokning })
      expect(rad.agentId).toBe('lars')
      expect(rad.rubrik).toBe('Bevakar schemat')
      expect(rad.detalj).toBe('inget bokat framåt just nu')
    }
    // undefined = datat saknas helt → ingen rad, inget påstående.
    expect(byggBevakning({})).toEqual([])
  })

  test('Matte: schemalagd sammanfattning renderas men pulserar INTE', () => {
    const [rad] = byggBevakning({ veckosammanfattning: true })
    expect(rad.agentId).toBe('matte')
    expect(rad.rubrik).toBe('Veckosammanfattning söndag 06:00')
    expect(rad.aktiv).toBe(false)
  })
})

test.describe('Hannas mjuka fråga', () => {
  test('max EN fråga — två frågor är ett formulär', () => {
    const rader = byggBevakning({ hannaFragor: ['Ska jag be Eriksson om en recension?', 'Ska jag skicka kampanjen?'] })
    expect(rader).toHaveLength(1)
    expect(rader[0].agentId).toBe('hanna')
    expect(rader[0].fraga).toBe(true)
    expect(rader[0].rubrik).toBe('Ska jag be Eriksson om en recension?')
  })

  test('puls aldrig på frågeraden', () => {
    const [rad] = byggBevakning({ hannaFragor: ['Ska jag fråga?'] })
    expect(rad.aktiv).toBe(false)
  })

  test('tomma strängar räknas inte som frågor — men Hanna syns som standby', () => {
    const [rad] = byggBevakning({ hannaFragor: ['', '  '] })
    expect(rad.agentId).toBe('hanna')
    expect(rad.rubrik).toBe('Inget att fråga om just nu')
    expect(rad.fraga).toBeUndefined()
    expect(rad.aktiv).toBe(false)
  })
})

test.describe('ytan och datakällan', () => {
  test('JarvisHome renderar bevakningen EFTER besluten, med den explicita tröskeln', () => {
    const s = read('components/jarvis/JarvisHome.tsx')
    expect(s).toContain('<TeamBevakning rader={bevakning} kompakt={beslut >= 2} />')
    // Efter beslutssektionen, före Värt att veta. Sektionsmarkören, inte
    // frasen — "Värt att veta" står även i filhuvudets doc-kommentar.
    const beslutSlut = s.indexOf('Se alla i Godkännanden')
    const bevakningPos = s.indexOf('<TeamBevakning')
    const nyheterPos = s.indexOf('── Värt att veta ──')
    expect(bevakningPos).toBeGreaterThan(beslutSlut)
    expect(bevakningPos).toBeLessThan(nyheterPos)
    // Det gamla bandet är borta ur ytan.
    expect(s).not.toContain('TeamPresenceBand')
  })

  test('watch-blocket bär antal och datum — aldrig belopp', () => {
    const s = read('app/api/dashboard/team-activity/route.ts')
    expect(s).toContain('const watch = {')
    // Slutankaret måste sökas EFTER startpositionen — 'return NextResponse.json'
    // förekommer redan i 401-grenen högst upp i filen.
    const start = s.indexOf('const watch = {')
    const block = s.slice(start, s.indexOf('agents:', start))
    for (const forbjudet of ['total', 'amount', 'belopp', '_kr']) {
      expect(block, `watch-blocket läcker belopp (${forbjudet})`).not.toContain(forbjudet)
    }
    expect(block).toContain('followupDagar')
    expect(block).toContain('quote_followup_days ?? 5')
  })

  test('inga embeds i watch-frågorna — kundnamnet hämtas separat', () => {
    const s = read('app/api/dashboard/team-activity/route.ts')
    const watchDel = s.slice(s.indexOf('WATCH-BLOCKET'))
    expect(watchDel).not.toContain('customer:customer_id(')
  })
})
