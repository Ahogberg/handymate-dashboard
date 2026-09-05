/**
 * Saldolarmet (2026-09-05). SMS var dött 13 aug–5 sep: 85 utskick föll på
 * "Not enough credits" — däribland fakturapåminnelser ägaren godkänt — och
 * raderna drunknade bland andra fel i driftlarmets digest. Det här facit
 * låser fast att saldot läses rakt av, att det vinner ämnesraden, och att
 * ett tomt saldo aldrig kan bli en tyst rad igen.
 *
 * Körs utan browser: npx playwright test tests/driftlarm-saldo.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { bedomSaldo, hamta46elksSaldo, ELKS_ENHETER_PER_KRONA, SALDO_GOLV_KR } from '../lib/sms/saldo'

const ROOT = path.resolve(__dirname, '..')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
const rutt = utanKommentarer(fs.readFileSync(path.join(ROOT, 'app/api/cron/driftlarm/route.ts'), 'utf8'))

test.describe('bedomSaldo — ren bedömning', () => {
  test('golvet gäller även utan förbrukning', () => {
    const b = bedomSaldo(10, 0)
    expect(b.granKr).toBe(SALDO_GOLV_KR)
    expect(b.racker).toBe(false)
  })
  test('veckoförbrukningen höjer gränsen över golvet', () => {
    const b = bedomSaldo(100, 400) // 400 × 0,35 = 140 kr
    expect(b.veckoforbrukningKr).toBe(140)
    expect(b.granKr).toBe(140)
    expect(b.racker).toBe(false)
    expect(bedomSaldo(200, 400).racker).toBe(true)
  })
  test('noll kronor räcker aldrig', () => {
    expect(bedomSaldo(0, 0).racker).toBe(false)
  })
})

test.describe('hamta46elksSaldo — fail-soft och uttrycklig enhet', () => {
  test('saknade nycklar ger ok:false utan nätverksanrop', async () => {
    let anrop = 0
    const r = await hamta46elksSaldo((async () => { anrop++; return new Response('{}') }) as any, undefined, undefined)
    expect(r.ok).toBe(false)
    expect(anrop).toBe(0)
  })
  test('balance i tiotusendelar blir kronor, råvärdet följer med', async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ balance: 35000, currency: 'SEK' }))) as any
    const r = await hamta46elksSaldo(fakeFetch, 'u', 'p')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.kr).toBe(3.5)
      expect(r.raw).toBe(35000)
      expect(ELKS_ENHETER_PER_KRONA).toBe(10_000)
    }
  })
  test('ett 401 eller ett trasigt svar blir ok:false med skäl, aldrig ett kast', async () => {
    const r1 = await hamta46elksSaldo((async () => new Response('nej', { status: 401 })) as any, 'u', 'p')
    expect(r1.ok).toBe(false)
    const r2 = await hamta46elksSaldo((async () => { throw new Error('nätet') }) as any, 'u', 'p')
    expect(r2.ok).toBe(false)
  })
})

test.describe('driftlarmet — saldot står överst och tystnad är omöjlig', () => {
  test('rutten läser saldot och räknar utskick som föll på saldo', () => {
    expect(rutt).toContain('hamta46elksSaldo()')
    expect(rutt).toContain("ilike('error_message', '%Not enough credits%')")
  })
  test('sms_log räknas på sms_id — kolumnen id finns inte', () => {
    expect(rutt).not.toMatch(/from\('sms_log'\)\s*\.select\('id'/)
    expect(rutt).toMatch(/from\('sms_log'\)\s*\.select\('sms_id', \{ count: 'exact', head: true \}\)/)
  })
  test('ett oläsbart eller tomt saldo utlöser mejlet även när inget annat fel finns', () => {
    expect(rutt).toContain("const saldoKritiskt = saldoLarm !== null || saldoFel > 0 || !saldo.ok")
    expect(rutt).toMatch(/if \(totalErrors > 0 \|\| brokenSweeps\.length > 0 \|\| usageSignal\.count > 0 \|\| saldoKritiskt\)/)
  })
  test('saldot vinner ämnesraden framför felräkningen', () => {
    const subj = rutt.indexOf('const subject = saldoLarm || saldoFel > 0')
    expect(subj).toBeGreaterThan(-1)
    expect(rutt.slice(subj, subj + 400)).toContain('🔴 46elks-saldo')
    expect(rutt.slice(subj, subj + 400)).toContain('SMS gick inte ut')
  })
  test('saldosektionen ligger först i mejlet och säger att utskicken inte är gjorda', () => {
    const sections = rutt.indexOf('const sections = [')
    expect(rutt.slice(sections, sections + 120)).toContain('saldoSection(saldo, saldoLarm, saldoFel)')
    expect(rutt).toContain('De utskicken är inte gjorda')
    expect(rutt).toContain('(råvärde ${saldo.raw})')
  })
})
