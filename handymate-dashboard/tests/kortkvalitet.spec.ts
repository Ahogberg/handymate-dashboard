/**
 * Facit för lib/approvals/kortkvalitet.ts + noise-gate.ts (2026-09-01).
 *
 * Låser:
 *  - summeraKort räknar rätt per typ/företag och bedömer mot konstanterna
 *  - brusgrinden: < 5 avgjorda = öppen; ett godkänt = öppen; ≥ 80 %
 *    utgångna = paus 14 dagar från senaste avgjorda; efter pausen släpps
 *    EXAKT ett kort (pending nyare än senaste avgjorda = vänta)
 *  - källskanning: båda brusgrindade producenterna anropar brusgrind()
 *    FÖRE sin insert, BRUSGRINDADE_TYPER innehåller exakt de två, och
 *    noise-gate är fail-open
 *
 * Körs: npx playwright test tests/kortkvalitet.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  bedomBrusgrind,
  bedomKortkvalitet,
  summeraKort,
  arBrusgrindadTyp,
  BRUSGRINDADE_TYPER,
  KORTKVALITET_MIN_SAMPLE,
  KORTKVALITET_BRUS_EXPIRED_PCT,
  KORTKVALITET_PAUS_DAGAR,
} from '../lib/approvals/kortkvalitet'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const NOW = '2026-09-01T12:00:00.000Z'
const dagarSedan = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString()

function kort(status: string, dagar: number) {
  return { status, created_at: dagarSedan(dagar) }
}

test.describe('konstanterna', () => {
  test('är de dokumenterade värdena', () => {
    expect(KORTKVALITET_MIN_SAMPLE).toBe(5)
    expect(KORTKVALITET_BRUS_EXPIRED_PCT).toBe(80)
    expect(KORTKVALITET_PAUS_DAGAR).toBe(14)
    expect([...BRUSGRINDADE_TYPER]).toEqual(['dispatch_suggestion', 'checklist_forslag'])
    expect(arBrusgrindadTyp('dispatch_suggestion')).toBe(true)
    expect(arBrusgrindadTyp('send_sms')).toBe(false)
    expect(arBrusgrindadTyp('four_eyes_quote')).toBe(false)
  })
})

test.describe('summeraKort', () => {
  test('räknar per typ och per företag+typ, sorterat på skapade', () => {
    const rows = [
      { business_id: 'b1', approval_type: 'dispatch_suggestion', status: 'expired', created_at: NOW },
      { business_id: 'b1', approval_type: 'dispatch_suggestion', status: 'expired', created_at: NOW },
      { business_id: 'b1', approval_type: 'dispatch_suggestion', status: 'pending', created_at: NOW },
      { business_id: 'b2', approval_type: 'dispatch_suggestion', status: 'approved', created_at: NOW },
      { business_id: 'b1', approval_type: 'send_sms', status: 'rejected', created_at: NOW },
      { business_id: 'b1', approval_type: 'send_sms', status: 'executed', created_at: NOW },
    ]
    const r = summeraKort(rows)
    expect(r.totalt).toMatchObject({ skapade: 6, godkanda: 1, avvisade: 1, utgangna: 2, vantande: 1, ovriga: 1 })
    expect(r.per_typ[0].approval_type).toBe('dispatch_suggestion')
    expect(r.per_typ[0]).toMatchObject({ skapade: 4, godkanda: 1, utgangna: 2, vantande: 1 })
    const b1d = r.per_foretag_typ.find(x => x.business_id === 'b1' && x.approval_type === 'dispatch_suggestion')
    expect(b1d).toMatchObject({ skapade: 3, utgangna: 2, vantande: 1, utgangna_pct: 100, bedomning: 'for_fa' })
  })

  test('bedömningen: för få under 5 avgjorda, brus ≥ 80 %, annars signal', () => {
    expect(bedomKortkvalitet({ godkanda: 0, avvisade: 0, utgangna: 0 })).toEqual({ utgangna_pct: null, bedomning: 'for_fa' })
    expect(bedomKortkvalitet({ godkanda: 0, avvisade: 0, utgangna: 4 })).toEqual({ utgangna_pct: 100, bedomning: 'for_fa' })
    expect(bedomKortkvalitet({ godkanda: 0, avvisade: 1, utgangna: 4 })).toEqual({ utgangna_pct: 80, bedomning: 'brus' })
    expect(bedomKortkvalitet({ godkanda: 1, avvisade: 1, utgangna: 3 })).toEqual({ utgangna_pct: 60, bedomning: 'signal' })
    expect(bedomKortkvalitet({ godkanda: 5, avvisade: 0, utgangna: 0 })).toEqual({ utgangna_pct: 0, bedomning: 'signal' })
  })
})

test.describe('bedomBrusgrind', () => {
  test('färre än 5 avgjorda → öppen (för få)', () => {
    const r = bedomBrusgrind([kort('expired', 1), kort('expired', 2), kort('expired', 3), kort('expired', 4)], NOW)
    expect(r.tysta).toBe(false)
    expect(r.skal).toContain('för få')
    expect(r.underlag.avgjorda).toBe(4)
  })

  test('pending räknas inte som avgjort', () => {
    const r = bedomBrusgrind([kort('pending', 0), kort('expired', 1), kort('expired', 2), kort('expired', 3), kort('expired', 4)], NOW)
    expect(r.tysta).toBe(false)
    expect(r.underlag.avgjorda).toBe(4)
  })

  test('5 utgångna i rad → pausad i 14 dagar från senaste avgjorda', () => {
    const r = bedomBrusgrind([kort('expired', 1), kort('expired', 3), kort('expired', 5), kort('expired', 7), kort('expired', 9)], NOW)
    expect(r.tysta).toBe(true)
    expect(r.oppnar_igen).toBe(new Date(Date.parse(dagarSedan(1)) + KORTKVALITET_PAUS_DAGAR * 86_400_000).toISOString())
    expect(r.underlag).toEqual({ avgjorda: 5, utgangna: 5, godkanda: 0, utgangna_pct: 100 })
  })

  test('ett godkänt bland de 5 senaste → öppen, även med 4 utgångna', () => {
    const r = bedomBrusgrind([kort('expired', 1), kort('expired', 2), kort('approved', 3), kort('expired', 4), kort('expired', 5)], NOW)
    expect(r.tysta).toBe(false)
    expect(r.skal).toContain('godkändes')
  })

  test('4 utgångna + 1 avvisat = 80 % → brus (avvisat är inte godkänt)', () => {
    const r = bedomBrusgrind([kort('expired', 1), kort('rejected', 2), kort('expired', 3), kort('expired', 4), kort('expired', 5)], NOW)
    expect(r.tysta).toBe(true)
    expect(r.underlag.utgangna_pct).toBe(80)
  })

  test('3 utgångna + 2 avvisade = 60 % → öppen', () => {
    const r = bedomBrusgrind([kort('expired', 1), kort('rejected', 2), kort('expired', 3), kort('rejected', 4), kort('expired', 5)], NOW)
    expect(r.tysta).toBe(false)
    expect(r.skal).toContain('under 80 %')
  })

  test('bara de 5 SENASTE avgjorda räknas — ett gammalt godkänt räddar inte', () => {
    const r = bedomBrusgrind([
      kort('expired', 1), kort('expired', 2), kort('expired', 3), kort('expired', 4), kort('expired', 5),
      kort('approved', 6),
    ], NOW)
    expect(r.tysta).toBe(true)
    expect(r.underlag.godkanda).toBe(0)
  })

  test('pausen passerad → öppen, ett kort släpps', () => {
    const r = bedomBrusgrind([kort('expired', 15), kort('expired', 16), kort('expired', 17), kort('expired', 18), kort('expired', 19)], NOW)
    expect(r.tysta).toBe(false)
    expect(r.skal).toContain('släpps igenom')
  })

  test('pausen passerad men ett kort redan släppt (pending nyare) → vänta på dess utfall', () => {
    const r = bedomBrusgrind([
      kort('pending', 0),
      kort('expired', 15), kort('expired', 16), kort('expired', 17), kort('expired', 18), kort('expired', 19),
    ], NOW)
    expect(r.tysta).toBe(true)
    expect(r.skal).toContain('redan släppt')
  })

  test('dagen före pausens slut är fortfarande pausad', () => {
    const r = bedomBrusgrind([kort('expired', 13), kort('expired', 14), kort('expired', 15), kort('expired', 16), kort('expired', 17)], NOW)
    expect(r.tysta).toBe(true)
  })

  test('tom historik → öppen', () => {
    expect(bedomBrusgrind([], NOW).tysta).toBe(false)
  })
})

test.describe('källskanning — grinden sitter före insert och är fail-open', () => {
  test('lib/dispatch.ts anropar brusgrind före pending_approvals-insert', () => {
    const src = read('lib/dispatch.ts')
    expect(src).toContain("from '@/lib/approvals/noise-gate'")
    const grind = src.indexOf("brusgrind(supabase, params.businessId, 'dispatch_suggestion')")
    const insert = src.indexOf("approval_type: 'dispatch_suggestion'")
    expect(grind).toBeGreaterThan(0)
    expect(insert).toBeGreaterThan(grind)
    expect(src).toContain('suppressed: true')
  })

  test('lib/egenkontroll/suggest-checklist.ts anropar brusgrind före insert', () => {
    const src = read('lib/egenkontroll/suggest-checklist.ts')
    expect(src).toContain("from '@/lib/approvals/noise-gate'")
    const grind = src.indexOf("brusgrind(supabase, businessId, 'checklist_forslag')")
    const insert = src.indexOf("approval_type: 'checklist_forslag'")
    expect(grind).toBeGreaterThan(0)
    expect(insert).toBeGreaterThan(grind)
  })

  test('noise-gate är fail-open och bokför pausen som skipped', () => {
    const src = read('lib/approvals/noise-gate.ts')
    expect(src).toContain('fail-open')
    expect(src).toMatch(/if \(error\) \{[\s\S]*return oppen\(/)
    expect(src).toContain("status: 'skipped'")
    expect(src).toContain("automation_type: KORTKVALITET_ACTIVITY_TYPE")
    // Kastar aldrig: yttre try/catch runt hela läsningen.
    expect(src).toMatch(/try \{[\s\S]*from\('pending_approvals'\)[\s\S]*\} catch \(err\) \{[\s\S]*return oppen\(/)
  })

  test('kortkvalitet.ts är ren — ingen I/O, ingen kausalitet', () => {
    const src = read('lib/approvals/kortkvalitet.ts')
    expect(src).not.toMatch(/from '@\/lib\/supabase'/)
    // Tabellanrop (supabase.from('...')), inte Array.from(...).
    expect(src).not.toMatch(/\.from\('/)
    expect(src).not.toMatch(/fetch\(/)
    expect(src).not.toMatch(/orsakar|beror på|leder till/i)
  })

  test('admin-rutten och sidan finns och är isAdmin-grindade', () => {
    const route = read('app/api/admin/kortkvalitet/route.ts')
    expect(route).toContain('isAdmin(request)')
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(fs.existsSync(path.join(ROOT, 'app/admin/kortkvalitet/page.tsx'))).toBe(true)
    expect(read('app/admin/page.tsx')).toContain('href="/admin/kortkvalitet"')
  })
})
