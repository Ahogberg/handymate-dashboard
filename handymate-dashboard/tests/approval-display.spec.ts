/**
 * Facit för approval-display (Etapp F, 2026-09-02).
 *
 * Mobilen hade egna etikettkartor som drev isär från desktop:
 * create_ata_draft/project_log_note föll till "Förslag" i appen fast
 * desktop sa "ÄTA-förslag"/"Dagboksanteckning". Nu skickar backend
 * `display: {type_label, agent, approve_label}` med varje kort, byggt av
 * de rena funktionerna i lib/jarvis/approval-view.ts (typeLabel,
 * agentForApproval, approveLabel) — EN källa för hur ett ärende presenteras.
 *
 *   npx playwright test tests/approval-display.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { approvalDisplay, typeLabel, agentForApproval, approveLabel } from '../lib/jarvis/approval-view'

const ROOT = path.resolve(__dirname, '..')
const kod = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

test('GET /api/approvals skickar display byggt av approvalDisplay', () => {
  const src = kod('app/api/approvals/route.ts')
  expect(src).toContain("import { approvalDisplay } from '@/lib/jarvis/approval-view'")
  expect(src).toContain('display: approvalDisplay(')
  expect(src).toContain('NextResponse.json({ approvals })')
})

test('GET /api/mobile/home skickar display på varje kort i kön (NBA och fallback)', () => {
  const src = kod('app/api/mobile/home/route.ts')
  expect(src).toContain("import { approvalDisplay } from '@/lib/jarvis/approval-view'")
  expect(src).toContain('display: approvalDisplay(a)')
  // Både NBA-vägen (synligaById) och fallback-vägen bygger på raderna MED display.
  expect(src).toContain('new Map(medDisplay.map(')
  expect(src).toContain('fallbackSortera(medDisplay)')
})

test('approvalDisplay = typeLabel + agentForApproval + approveLabel', () => {
  const ata = { approval_type: 'create_ata_draft', payload: { project_id: 'p1' } }
  const dagbok = { approval_type: 'project_log_note', payload: { project_id: 'p1' } }
  for (const a of [ata, dagbok]) {
    const d = approvalDisplay(a)
    expect(d.type_label).toBe(typeLabel(a.approval_type))
    expect(d.agent).toBe(agentForApproval(a))
    expect(d.approve_label).toBe(approveLabel(a.approval_type, a.payload))
  }
  expect(approvalDisplay(ata).type_label).toBe('ÄTA-förslag')
  expect(approvalDisplay(dagbok).type_label).toBe('Dagboksanteckning')
  expect(approvalDisplay(dagbok).approve_label).toBe('Spara i dagboken')
  // Explicit routing i payloaden vinner alltid.
  expect(approvalDisplay({ approval_type: 'create_ata_draft', payload: { routed_agent: 'karin' } }).agent).toBe('karin')
})
