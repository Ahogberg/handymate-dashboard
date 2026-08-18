/**
 * FACIT — lib/mission/bubble-state.ts + Jobbkompisen.tsx:s stängda pillar
 * (Goal-to-Plan V1, Etapp C, tasks/jaunty-pondering-hummingbird.md).
 *
 * Del 1: den rena precedensfunktionen. Del 2: källskanning av
 * Jobbkompisen.tsx (samma idiom som tests/mission-truth-guard.spec.ts) —
 * bubblan får ha EN pill-slot, inte flera samtidiga budskap.
 *
 * Körs: npx playwright test tests/bubble-state.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { deriveBubbleState, KR_PILL_THRESHOLD } from '../lib/mission/bubble-state'

test.describe('deriveBubbleState — precedensen', () => {
  test('aktivt uppdrag + väntande beslut → kraver_beslut, även med stort unseenKr', () => {
    expect(
      deriveBubbleState({ hasActiveMission: true, decisionsOutstanding: 2, unseenKr: 50000 }),
    ).toBe('kraver_beslut')
  })

  test('aktivt uppdrag, inga väntande beslut → aktivt_uppdrag, även med stort unseenKr', () => {
    expect(
      deriveBubbleState({ hasActiveMission: true, decisionsOutstanding: 0, unseenKr: 50000 }),
    ).toBe('aktivt_uppdrag')
  })

  test('inget uppdrag, unseenKr på tröskeln → kr_pill', () => {
    expect(
      deriveBubbleState({ hasActiveMission: false, decisionsOutstanding: 0, unseenKr: KR_PILL_THRESHOLD }),
    ).toBe('kr_pill')
  })

  test('inget uppdrag, unseenKr precis under tröskeln → idle', () => {
    expect(
      deriveBubbleState({ hasActiveMission: false, decisionsOutstanding: 0, unseenKr: KR_PILL_THRESHOLD - 1 }),
    ).toBe('idle')
  })

  test('inget uppdrag, inget unseenKr → idle', () => {
    expect(deriveBubbleState({ hasActiveMission: false, decisionsOutstanding: 0, unseenKr: 0 })).toBe('idle')
  })

  test('decisionsOutstanding>0 utan aktivt uppdrag styr ingenting — kr_pill/idle vinner ändå', () => {
    expect(
      deriveBubbleState({ hasActiveMission: false, decisionsOutstanding: 3, unseenKr: 0 }),
    ).toBe('idle')
    expect(
      deriveBubbleState({ hasActiveMission: false, decisionsOutstanding: 3, unseenKr: KR_PILL_THRESHOLD }),
    ).toBe('kr_pill')
  })
})

test.describe('Jobbkompisen.tsx — bubbelpillarna (källskanning, EN pill-slot)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'Jobbkompisen.tsx'), 'utf8')

  test('importerar deriveBubbleState', () => {
    expect(src).toContain('deriveBubbleState')
  })

  test('"Matte behöver ditt beslut" förekommer exakt en gång', () => {
    const matches = src.match(/Matte behöver ditt beslut/g) || []
    expect(matches.length).toBe(1)
  })

  test('"Uppdrag pågår" förekommer exakt en gång', () => {
    const matches = src.match(/Uppdrag pågår/g) || []
    expect(matches.length).toBe(1)
  })

  test('den befintliga kr-pillens text "hittat" finns kvar oförändrad', () => {
    expect(src).toContain('hittat')
  })

  // Etapp G (expansionspanelen): 'aktivt_uppdrag' öppnar nu panelen i
  // stället för chatten — panelen ÄR den större arbetsytan för uppdraget.
  // 'kraver_beslut' fortsätter öppna chatten oförändrat: beslut är
  // konversationella, inte något panelen ska ta över.
  test('importerar setPanelOpen ur useMission()', () => {
    expect(src).toContain('setPanelOpen')
  })

  test('"Uppdrag pågår"-pillen öppnar expansionspanelen (setPanelOpen), inte chatten', () => {
    const idx = src.indexOf("bubbleState === 'aktivt_uppdrag'")
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 250)
    expect(block).toContain('setPanelOpen(true)')
    expect(block).not.toContain('setIsOpen(true)')
  })

  test('"Matte behöver ditt beslut"-pillen öppnar fortfarande chatten (setIsOpen) — beslut är konversationella', () => {
    const idx = src.indexOf("bubbleState === 'kraver_beslut'")
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 250)
    expect(block).toContain('setIsOpen(true)')
  })
})

// Uppdragsfoten (Andreas 2026-08-18): den ÖPPNA panelens stående redovisning
// av det aktiva uppdraget — en rad i panelens nederkant som öppnar
// expansionspanelen. Bubbelpillarna ovan gäller bara stängd bubbla; utan
// foten försvann uppdraget ur synfältet så fort chatten öppnades.
test.describe('Jobbkompisen.tsx — uppdragsfoten i öppna panelen', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'Jobbkompisen.tsx'), 'utf8')

  test('fottexten förekommer exakt en gång — v144 garanterar max ett aktivt uppdrag, siffran är en ärlig etta', () => {
    const matches = src.match(/1 pågående uppdrag/g) || []
    expect(matches.length).toBe(1)
  })

  test('foten renderas bara vid aktivt uppdrag', () => {
    const idx = src.indexOf('1 pågående uppdrag')
    expect(idx).toBeGreaterThan(-1)
    const guard = src.slice(Math.max(0, idx - 1600), idx)
    expect(guard).toContain("mission.status === 'active'")
  })

  test('foten öppnar expansionspanelen, inte chatten', () => {
    const idx = src.indexOf('1 pågående uppdrag')
    const block = src.slice(Math.max(0, idx - 900), idx + 900)
    expect(block).toContain('setPanelOpen(true)')
    expect(block).not.toContain('setIsOpen(true)')
  })

  test('beslut har företräde framför gapet — samma precedens som bubbelpillarna', () => {
    const idx = src.indexOf('1 pågående uppdrag')
    const block = src.slice(Math.max(0, idx - 900), idx + 900)
    expect(block).toContain('decisions_outstanding')
    expect(block).toContain('beslut väntar')
  })

  test('gaptexten är måltypens egen storhet — alla tre gapfälten läses, aldrig adderade', () => {
    const idx = src.indexOf('1 pågående uppdrag')
    const block = src.slice(Math.max(0, idx - 900), idx + 900)
    expect(block).toContain('gap_kr')
    expect(block).toContain('gap_hours')
    expect(block).toContain('gap_count')
    // Ingen aritmetik mellan gapfälten — de är ömsesidigt uteslutande
    // (tests/mission-progress.spec.ts äger den regeln; här bara att ytan
    // inte hittar på en blandad summa).
    expect(block).not.toMatch(/gap_kr\s*\+/)
    expect(block).not.toMatch(/gap_hours\s*\+/)
    expect(block).not.toMatch(/gap_count\s*\+/)
  })
})
