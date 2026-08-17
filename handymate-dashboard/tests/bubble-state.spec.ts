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
