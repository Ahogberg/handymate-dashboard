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

test.describe('Fortnox Invoice-resursen har inget InvoiceNumber-falt (verifierat mot fortnox-openapi.json)', () => {
  // fortnox_Kf_InvoiceSingleItem (kundfaktura-resursen) har BARA
  // DocumentNumber som identifierande nummerfalt — InvoiceNumber finns
  // bara pa helt andra resurser (betalningsuppfoljning, SupplierInvoice).
  // Att lasa response.Invoice.InvoiceNumber ger alltid undefined, vilket
  // fick VARJE lyckad Fortnox-bokning att tolkas som ett misslyckande —
  // ingen kund kunde nagonsin fa sin faktura for foretag med Fortnox
  // kopplat, och varje omforsok skapade annu en riktig faktura i
  // bokforingen. Fixat 2026-08-20.
  test('lasnyckeln for POST /invoices-svaret ar DocumentNumber, inte InvoiceNumber', () => {
    const idx = FILE.indexOf("const response = await fortnoxRequest")
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 500)
    expect(block).not.toMatch(/response\?\.Invoice\?\.InvoiceNumber/)
    expect(block).toMatch(/response\?\.Invoice\?\.DocumentNumber/)
  })

  test('fortnoxInvoiceNumber-variabeln fylls fran DocumentNumber, inte ett icke-existerande falt', () => {
    const idx = FILE.indexOf('fortnoxInvoiceNumber = response')
    expect(idx).toBeGreaterThan(-1)
    const line = FILE.slice(idx, idx + 80)
    expect(line).toContain('DocumentNumber')
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

test.describe('Nummer-unifiering (2026-08-20) — kunden ser samma nummer overallt', () => {
  // Utrett innan bygget: ingen annan kod tolkar invoice_number-formatet,
  // ingen intern betalningsavstamning slar upp fakturor via ocr_number,
  // OCR-funktionen fungerar pa vilken sifferstrang som helst, och
  // kreditfakturor kopplas via ett stabilt ID (original_invoice_id), inte
  // via nummersträngen. Sakert att skriva over invoice_number/ocr_number
  // med Fortnox nummer nar synken lyckas, INNAN kunden nagonsin ser
  // fakturan (Fortnox-forst-ordningen garanterar det).

  test('importerar generateOCR for att rakna om OCR-numret', () => {
    expect(FILE).toContain("from '@/lib/ocr'")
  })

  test('lyckad synk skriver over bade invoice_number och ocr_number med Fortnox-harledda varden', () => {
    // generateOCR(fortnoxDocumentNumber) beräknas en gång i en variabel
    // (återanvänd för både updateData och returvärdet) — sök brett
    // efter anropet snarare än att anta det inline i updateData-objektet.
    expect(FILE).toMatch(/generateOCR\(fortnoxDocumentNumber\)/)
    const idx = FILE.indexOf('const updateData: Record<string, unknown> = {')
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 400)
    expect(block).toMatch(/invoice_number:\s*fortnoxDocumentNumber/)
    expect(block).toMatch(/ocr_number:\s*\w+/)
  })

  test('foretag utan Fortnox paverkas inte — skipped-vagen andrar aldrig invoice_number', () => {
    const idx = FILE.indexOf('return { success: true, skipped: true }')
    expect(idx).toBeGreaterThan(-1)
    const before = FILE.slice(Math.max(0, idx - 50), idx)
    expect(before).not.toContain('invoice_number')
  })

  test('returnerar de nya vardena sa sendInvoice kan uppdatera sin redan hamtade in-memory-faktura', () => {
    const idx = FILE.lastIndexOf('return {')
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 300)
    expect(block).toMatch(/newInvoiceNumber/)
    expect(block).toMatch(/newOcrNumber/)
  })
})

test.describe('Sista DB-skrivningen (markera synced) — felet kollas, inte tyst svalt (2026-08-21)', () => {
  // Om denna specifika skrivning misslyckas har Fortnox ANDA bokfort
  // fakturan, men lokala raden blir kvar pa fortnox_sync_status='pending'
  // — ett senare omforsok (efter 5-minuters-timeouten) skulle da forsoka
  // POSTa ANNU en gang och skapa en dubblett i Fortnox, trots att den
  // forsta bokforingen redan lyckades. Maste larmas synligt, inte bara
  // console.error som forsvinner i Vercel-loggarna.
  test('updateError fran den slutgiltiga synced-skrivningen kollas explicit', () => {
    const idx = FILE.indexOf("fortnox_sync_status: 'synced',")
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 900)
    expect(block).toMatch(/error:\s*(finalUpdateError|updateError)/)
  })

  test('ett fel dar rapporteras via rapporteraTystFel, inte bara console.error', () => {
    expect(FILE).toContain("from '@/lib/observability/driftlarm'")
    const idx = FILE.indexOf("fortnox_sync_status: 'synced',")
    const block = FILE.slice(idx, idx + 1200)
    expect(block).toMatch(/rapporteraTystFel/)
  })
})
