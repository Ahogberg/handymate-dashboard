import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/invoices/sync-to-fortnox.ts'),
  'utf8',
)

test.describe('lib/invoices/sync-to-fortnox.ts', () => {
  test('exporterar syncInvoiceToFortnox', () => {
    expect(FILE).toMatch(/export async function syncInvoiceToFortnox/)
  })

  test('idempotens: redan synced returnerar success utan nytt Fortnox-anrop', () => {
    const idx = FILE.indexOf('export async function syncInvoiceToFortnox')
    const block = FILE.slice(idx, idx + 3000)
    expect(block).toMatch(/fortnox_sync_status/)
    expect(block).toMatch(/synced/)
  })

  test('in-flight-skydd (pending + timeout) ar oforandrat med fran originalet', () => {
    expect(FILE).toContain('FORTNOX_PENDING_TIMEOUT_MS')
  })

  test('bygger ROT/RUT-payload som originalet', () => {
    expect(FILE).toContain('TaxReductionType')
    expect(FILE).toContain('TaxReduction')
  })

  test('markerar sync som pending FORE Fortnox-anropet', () => {
    const idx = FILE.indexOf("fortnox_sync_status: 'pending'")
    expect(idx).toBeGreaterThan(-1)
    // Sök EFTER idx (inte FILE.indexOf från start) — 'fortnoxRequest' finns
    // redan i importsatsen högst upp i filen, så en osökt indexOf skulle
    // alltid hitta den och göra testet meningslöst. Vi vill hitta det
    // FAKTISKA anropet i try-blocket, inte identifierarens första nämning.
    const postIdx = FILE.indexOf('fortnoxRequest', idx)
    expect(postIdx).toBeGreaterThan(idx)
  })

  test('returnerar skipped:true om Fortnox inte ar kopplat, inte ett fel', () => {
    expect(FILE).toMatch(/skipped:\s*true/)
  })
})

test.describe('send-via-fortnox/route.ts ar en tunn wrapper', () => {
  const ROUTE = fs.readFileSync(
    path.join(__dirname, '..', 'app/api/invoices/[id]/send-via-fortnox/route.ts'),
    'utf8',
  )

  test('anvander syncInvoiceToFortnox istallet for egen Fortnox-logik', () => {
    expect(ROUTE).toContain("from '@/lib/invoices/sync-to-fortnox'")
    expect(ROUTE).toContain('syncInvoiceToFortnox(')
  })

  test('POST-anropet mot Fortnox finns bara i sync-to-fortnox.ts, inte har langre', () => {
    expect(ROUTE).not.toMatch(/fortnoxRequest\(/)
  })

  test('satter fortfarande status=sent for bakatkompatibilitet med den fristaende knappen', () => {
    expect(ROUTE).toContain("status: 'sent'")
  })
})

test.describe('Fortnox-dubbelskydd — markera som skickad (verifierat mot fortnox-openapi.json)', () => {
  test('gor ett PUT-anrop mot externalprint-endpointen for att markera fakturan som skickad', () => {
    const idx = FILE.indexOf('fortnoxDocumentNumber = response')
    const block = FILE.slice(idx, idx + 2000)
    expect(block).toMatch(/fortnoxRequest[\s\S]*?'PUT'[\s\S]*?externalprint/)
  })

  test('ett misslyckat markera-som-skickad-anrop blockerar INTE flodet', () => {
    // Hitta try/catch-blocket för externalprint-anropet specifikt (inte det
    // första POST /invoices-blocket längre upp i filen) och verifiera att
    // catch-grenen bara loggar — ingen `return { success: false` eller
    // omkastning av felet, så bokföringen (redan klar vid det här laget)
    // aldrig rapporteras som misslyckad bara för att markera-som-skickad
    // strular.
    const idx = FILE.indexOf('externalprint')
    expect(idx).toBeGreaterThan(-1)
    const catchIdx = FILE.indexOf('catch (markSentErr', idx)
    expect(catchIdx).toBeGreaterThan(idx)
    const catchBlock = FILE.slice(catchIdx, catchIdx + 300)
    expect(catchBlock).not.toMatch(/return \{ success: false/)
  })
})
