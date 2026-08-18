/**
 * Facit för Godkännanden-sidans reskin till Command Center-språket
 * (2026-08-18, docs/HANDYMATE_DESIGN_SYSTEM.md).
 *
 * Ren visuell reskin — ZERO ändrad data/handlers. Testet är därför ett
 * käll-scan (samma idiom som tests/jarvis-hem.spec.ts:s
 * "producentens format är oförändrat"-test), inte ett DOM-test: vi läser
 * app/dashboard/approvals/page.tsx som text och låser
 *
 * 1. Boss-frame-undertiteln och det varma tomt-state-uttrycket finns kvar
 *    ordagrant (copy-regressioner syns annars aldrig i en tsc/build-körning).
 * 2. <AgentAvatar> används (GorDettaForst-idiomet, inte den gamla lokala
 *    fyra-kopiors-agentkartan).
 * 3. Ingen andra mörk hero läggs till — JarvisHome äger den enda
 *    bg-grad-dark-hero-ytan (§4.0 i designsystemet).
 * 4. De faktiska handler-anropen (requestApprove/handleAction/submitEdit/
 *    openDebriefModal/handleAutopilotApprove) står kvar oförändrade — en
 *    ren restyling kan aldrig byta ut VAD en knapp gör.
 * 5. min-h-[44px] finns på handlingsraderna (mobil tumzon).
 *
 * Körs utan browser/session:
 *   npx playwright test tests/approvals-page-design.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PAGE_PATH = path.join(ROOT, 'app/dashboard/approvals/page.tsx')
const source = fs.readFileSync(PAGE_PATH, 'utf8')

test.describe('Godkännanden — Command Center-reskin', () => {
  test('boss-frame-undertiteln finns ordagrant', () => {
    expect(source).toContain('Inget når en kund utan ditt OK — här är allt som väntar.')
  })

  test('det varma tomt-state-uttrycket finns ordagrant', () => {
    expect(source).toContain('Kön är tom — teamet jobbar vidare och säger till när något behöver dig.')
  })

  test('AgentAvatar importeras och används — inte den gamla lokala agentkartan', () => {
    expect(source).toContain("import { AgentAvatar } from '@/components/agents/AgentAvatar'")
    expect(source).toContain('<AgentAvatar')
    // Spår D1:s fjärde kopia (nämnd i agentPersonas.ts:s filhuvud) ska vara
    // borta — agenten härleds nu genom samma agentForApproval som
    // hemskärmen/GorDettaForst redan använder.
    expect(source).not.toContain('function getAgentFromApproval')
    expect(source).toContain('agentForApproval(approval)')
  })

  test('ingen andra mörk hero — JarvisHome äger den enda bg-grad-dark-hero-ytan', () => {
    const matches = source.match(/bg-grad-dark-hero/g) || []
    expect(matches.length).toBe(0)
  })

  test('handler-anropen är oförändrade — restylingen bytte aldrig VAD en knapp gör', () => {
    expect(source).toContain('onClick={() => requestApprove(approval)}')
    expect(source).toContain("onClick={() => handleAction(approval.id, 'reject')}")
    expect(source).toContain('onClick={() => submitEdit(approval)}')
    expect(source).toContain('onClick={() => openDebriefModal(approval)}')
    expect(source).toContain('onClick={() => handleAutopilotApprove(approval, Array.from(rejectedSet))}')
    expect(source).toContain('onClick={() => handleRetry(')
    expect(source).toContain('onClick={() => setActiveTab(tab)}')
  })

  test('min-h-[44px] finns på handlingsknapparna (mobil tumzon)', () => {
    const matches = source.match(/min-h-\[44px\]/g) || []
    // Godkänn/Avvisa/Redigera/Svara/Hoppa över/Godkänn med ändringar/
    // tabbarna/autopilot-raden/uppdatera-knappen — gott om marginal mot
    // en enda glömd knapp, men inte en exakt siffra som spricker vid varje
    // ordbyte.
    expect(matches.length).toBeGreaterThanOrEqual(10)
  })

  test('stat-tiles är härledda ur samma redan hämtade lista — ingen ny fetch', () => {
    // Baslinjen är sex /api/approvals-anrop, alla redan där innan reskinnet
    // (fetchApprovals x2 + handleRetry/handleAction/submitDebrief/
    // handleAutopilotApprove x1 var). "Avklarade idag" hade krävt ett
    // sjunde — den tilen är därför medvetet UTELÄMNAD (se filhuvudet i
    // page.tsx), och stat-tiles-blocket läser bara redan hämtad `approvals`.
    const fetchCalls = source.match(/fetch\(`\/api\/approvals/g) || []
    expect(fetchCalls.length).toBe(6)
    expect(source).toContain('väntar nu')
    expect(source).toContain('äldsta väntande')
    expect(source).not.toContain('avklarade idag')
  })

  test('dag-grupperingen sorterar aldrig om — samma `approvals`-array, bara en rubrik insatt', () => {
    expect(source).toContain('approvals.map((approval, idx) => {')
    expect(source).not.toMatch(/approvals\s*\.\s*sort\(/)
    expect(source).not.toMatch(/\[\s*\.\.\.approvals\s*\]\s*\.sort/)
  })
})
