# Enat fakturautskick (kund + Fortnox) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. Delad arbetskatalog-disciplin — `git status` före varje commit, stagea specifika filer, aldrig `git add -A`.

**Goal:** Fortnox-bokföring och kundleverans av en faktura sker via en och samma "Skicka faktura"-åtgärd, i ordningen Fortnox→kund, med idempotent delfel-hantering och ett tekniskt skydd mot att kunden får fakturan dubbelt.

**Architecture:** Fortnox-skapande-logiken i `app/api/invoices/[id]/send-via-fortnox/route.ts` bryts ut till en självständig, testbar funktion `lib/invoices/sync-to-fortnox.ts`. Den kopplas in som första steget i `sendInvoice()` (`lib/invoices/send-invoice.ts`) — den delade kärnan som redan används av BÅDE den manuella skicka-knappen och `autoInvoiceOnComplete` (server-till-server, projektavslut). Ett nytt `delivery_status`-fält på `invoice` skiljer "bokfört men ej levererat" från övriga tillstånd. Kundens synliga fakturanummer förblir Handymates eget (`invoice.invoice_number`) oförändrat i denna omgång — se "Klargörande av specens scope" nedan.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres), Fortnox REST API, Playwright (facit-idiom, `--no-deps`).

**Spec:** `docs/superpowers/specs/2026-08-20-enat-fakturautskick-fortnox-design.md`

---

## Klargörande av specens scope (upptäckt under planering)

Specens "Utanför scope"-rad ("kunden ser alltid Fortnox officiella
nummer när Fortnox är inblandat, annars Handymates eget") är
självmotsägande som skriven — den beskriver ett beteende under en
rubrik som ska exkludera saker. Efter att ha läst den faktiska
`sendInvoice()`-koden (694 rader, `invoice.invoice_number` används på
minst sex ställen: email-ämnesrad, PDF-mall, SMS-text, `customer_activity`-
logg) skulle ett byte av vilket nummer som visas kräva ändringar
utspridda över hela leveranskärnan — en betydligt större och riskablare
ändring än vad specen avsåg.

**Beslut för denna plan:** kunden ser ALLTID Handymates eget
`invoice.invoice_number`, oförändrat. `fortnox_invoice_number`/
`fortnox_document_number` sparas på fakturan för bokförings-/
uppslagssyfte precis som idag, men trådas INTE in i kund-vända mallar.

**Ytterligare en avvikelse mot specens ordval:** specen skrev att den
gamla Fortnox-knappen skulle döpas om till "Synka om till Fortnox".
Efter att ha läst hur `send-via-fortnox/route.ts` faktiskt kommer
fungera efter denna omgång (Task 3) — en fristående bokförings-åtgärd,
inte en omkörning av något som redan misslyckats — är "Bokför i
Fortnox" en mer korrekt etikett. Samma knapp, samma plats i
"…"-menyn, bara ett annat namn än specens ordval.

Utöver dessa två namn-/textbeslut följer planen specen exakt (ordning,
idempotens, dubbelskydd, arkitektur).

---

## Task 1: Migration — `delivery_status` på `invoice`

**Files:**
- Create: `sql/v163_invoice_delivery_status.sql`

- [ ] **Steg 1: Skriv migrationsfilen**

```sql
-- v163: invoice.delivery_status — skiljer "bokfört i Fortnox men ej
-- levererat till kund" från övriga tillstånd.
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- Enat fakturautskick (docs/superpowers/specs/
-- 2026-08-20-enat-fakturautskick-fortnox-design.md): Fortnox-synk sker
-- nu FÖRE kundutskick i samma flöde. Om Fortnox-steget lyckas men
-- email/SMS misslyckas är fakturan korrekt bokförd men aldrig levererad
-- — invoice.status (draft/sent/paid/...) räcker inte för att uttrycka
-- det tillståndet utan att kollidera med fortnox_sync_status (v58,
-- som redan äger Fortnox-sidans state).
--
-- MODELL
--   NULL/'pending'        → ej försökt levererat än, eller aldrig
--                            aktuellt (Fortnox ej kopplat — vanliga
--                            invoice.status räcker då som idag).
--   'delivered'           → email eller SMS gick faktiskt ut.
--   'delivery_failed'     → Fortnox-steget (om aktuellt) lyckades,
--                            men kundleveransen misslyckades. Retry
--                            ska bara göra om LEVERANSEN, aldrig
--                            Fortnox-anropet.

BEGIN;

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
  CHECK (delivery_status IS NULL OR delivery_status IN ('pending', 'delivered', 'delivery_failed'));

COMMENT ON COLUMN invoice.delivery_status IS
  'Kundleveransens tillstånd, skilt från fortnox_sync_status (v58, bokföringssidan). NULL/pending=ej klart, delivered=kunden fick den, delivery_failed=bokfört men ej levererat — retry ska bara göra om kundleveransen.';

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'invoice' AND column_name = 'delivery_status';
```

- [ ] **Steg 2: Commit**

```bash
git add sql/v163_invoice_delivery_status.sql
git commit -m "feat(db): v163 migration for invoice.delivery_status (vantar pa korning)"
```

---

## Task 2: Extrahera Fortnox-synk till `lib/invoices/sync-to-fortnox.ts`

**Files:**
- Create: `lib/invoices/sync-to-fortnox.ts`
- Test: `tests/facit-sync-to-fortnox.spec.ts`

Detta flyttar logiken från `app/api/invoices/[id]/send-via-fortnox/route.ts`
(rad 61-348, redan läst i sin helhet) till en fristående funktion —
oförändrat beteende, bara ett nytt hem så den kan anropas både från
rutten och från `sendInvoice()`.

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-sync-to-fortnox.spec.ts
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
    const postIdx = FILE.indexOf('fortnoxRequest')
    expect(postIdx).toBeGreaterThan(idx)
  })

  test('returnerar skipped:true om Fortnox inte ar kopplat, inte ett fel', () => {
    expect(FILE).toMatch(/skipped:\s*true/)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-sync-to-fortnox.spec.ts --no-deps --project=chromium`
Expected: FAIL — modulen finns inte.

- [ ] **Steg 3: Skriv `lib/invoices/sync-to-fortnox.ts`**

Flytta logiken från `send-via-fortnox/route.ts` rad 61-348 rakt av,
med dessa ändringar: returnera ett resultatobjekt istället för
`NextResponse`, ta bort auth/params-hantering (anroparens ansvar), och
lägg till `skipped: true` för det ej-kopplade fallet (route.ts idag
returnerar ett hårt 400-fel där — den nya funktionen ska istället låta
anroparen (både `sendInvoice()` och den tunna wrapper-rutten) avgöra
om det är ett fel eller ett giltigt "inget att göra").

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { fortnoxRequest, isFortnoxConnected, syncCustomerToFortnox } from '@/lib/fortnox'
import { prepareInvoiceManifest, markInvoiceDelivered } from '@/lib/invoices/evidence-manifest'

/**
 * Fortnox-bokföringssteget för en kundfaktura. Bruten ut ur
 * app/api/invoices/[id]/send-via-fortnox/route.ts (2026-08-20, enat
 * fakturautskick) så samma logik kan köras från BÅDE den fristående
 * "Bokför i Fortnox"-rutten och sendInvoice() (som körs för både
 * manuellt utskick och autoInvoiceOnComplete).
 *
 * Rör ALDRIG kundleverans (email/SMS) — det är sendInvoice()s ansvar,
 * som anropar denna funktion FÖRE leveransförsöket.
 */

const FORTNOX_PENDING_TIMEOUT_MS = 5 * 60 * 1000

interface InvoiceItem {
  description?: string
  quantity?: number
  unit?: string
  unit_price?: number
}

interface FortnoxInvoiceRow {
  ArticleNumber?: string
  Description: string
  DeliveredQuantity: number
  Price: number
  Unit?: string
  VAT?: number
}

export interface SyncToFortnoxResult {
  success: boolean
  /** true = Fortnox var inte kopplat, inget gjordes. Inte ett fel. */
  skipped?: boolean
  /** true = fakturan var redan synkad, denna körning gjorde inget nytt Fortnox-anrop. */
  idempotent?: boolean
  fortnoxInvoiceNumber?: string
  fortnoxDocumentNumber?: string
  error?: string
}

export async function syncInvoiceToFortnox(
  supabase: SupabaseClient,
  params: { businessId: string; invoiceId: string },
): Promise<SyncToFortnoxResult> {
  const { businessId, invoiceId } = params

  const connected = await isFortnoxConnected(businessId)
  if (!connected) {
    return { success: true, skipped: true }
  }

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoice')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .single()

  if (fetchErr || !invoice) {
    return { success: false, error: 'Faktura hittades inte' }
  }

  if (invoice.customer_id) {
    const { data: customerData, error: customerErr } = await supabase
      .from('customer')
      .select('*')
      .eq('customer_id', invoice.customer_id)
      .maybeSingle()
    if (customerErr) {
      console.error('[sync-to-fortnox] customer fetch error:', customerErr)
      return { success: false, error: 'Kunde inte hämta kunduppgifter för fakturan. Försök igen.' }
    }
    invoice.customer = customerData
  } else {
    invoice.customer = null
  }

  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return { success: false, error: `Fakturan är redan ${invoice.status === 'paid' ? 'betald' : 'avbruten'}` }
  }

  const syncStatus = invoice.fortnox_sync_status as string | null
  const lastAttempt = invoice.fortnox_sync_attempted_at as string | null
  if (syncStatus === 'synced' && invoice.fortnox_invoice_number) {
    return {
      success: true,
      idempotent: true,
      fortnoxInvoiceNumber: invoice.fortnox_invoice_number,
      fortnoxDocumentNumber: invoice.fortnox_document_number,
    }
  }
  if (syncStatus === 'pending' && lastAttempt) {
    const ageMs = Date.now() - new Date(lastAttempt).getTime()
    if (ageMs < FORTNOX_PENDING_TIMEOUT_MS) {
      return { success: false, error: 'Sync pågår redan. Vänta ett par minuter innan du försöker igen.' }
    }
    console.warn(
      `[sync-to-fortnox] invoice ${invoiceId} pending för ${Math.round(ageMs / 1000)}s — antar in-flight-dödad, tillåter retry`,
    )
  }

  let customerNumber = invoice.customer?.fortnox_customer_number as string | null
  if (!customerNumber && invoice.customer_id) {
    const sync = await syncCustomerToFortnox(businessId, invoice.customer_id)
    if (!sync.success || !sync.customerNumber) {
      return { success: false, error: `Kunde inte synka kund till Fortnox: ${sync.error || 'okänt fel'}` }
    }
    customerNumber = sync.customerNumber
  }

  if (!customerNumber) {
    return { success: false, error: 'Ingen kund kopplad till fakturan' }
  }

  const items: InvoiceItem[] = Array.isArray(invoice.items) ? invoice.items : []
  if (items.length === 0) {
    return { success: false, error: 'Fakturan saknar rader' }
  }

  const invoiceRows: FortnoxInvoiceRow[] = items.map(item => ({
    Description: (item.description || 'Arbete').slice(0, 200),
    DeliveredQuantity: Number(item.quantity ?? 1),
    Price: Number(item.unit_price ?? 0),
    Unit: mapUnit(item.unit),
    VAT: 25,
  }))

  const { data: bizConfig } = await supabase
    .from('business_config')
    .select('business_name, contact_name')
    .eq('business_id', businessId)
    .single()

  const today = new Date().toISOString().split('T')[0]
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toISOString().split('T')[0]
    : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const invoicePayload: Record<string, unknown> = {
    CustomerNumber: customerNumber,
    InvoiceDate: today,
    DueDate: dueDate,
    Currency: 'SEK',
    Language: 'SV',
    OurReference: bizConfig?.contact_name || bizConfig?.business_name || undefined,
    YourReference: invoice.customer?.name || undefined,
    InvoiceRows: invoiceRows,
    Remarks: invoice.internal_notes || undefined,
    ExternalInvoiceReference1: invoiceId,
  }

  const isRot = invoice.rot_rut_type === 'ROT' || invoice.rot_rut_type === 'rot'
  const isRut = invoice.rot_rut_type === 'RUT' || invoice.rot_rut_type === 'rut'
  if (isRot || isRut) {
    invoicePayload.TaxReductionType = isRot ? 'ROT' : 'RUT'
    const reductionAmount = Number(invoice.rot_deduction || invoice.rot_rut_deduction || 0)
    const personalNumber = invoice.rot_personal_number || invoice.customer?.personal_number || null
    const propertyDesignation = invoice.rot_property_designation || invoice.customer?.property_designation || null
    if (reductionAmount > 0 && personalNumber) {
      invoicePayload.TaxReduction = {
        Type: isRot ? 'ROT' : 'RUT',
        PropertyType: 'Villa',
        PropertyDesignation: propertyDesignation,
        TaxReductionAmount: reductionAmount,
        AskerSocialSecurityNumber: personalNumber,
      }
    }
  }

  await prepareInvoiceManifest(supabase, {
    businessId,
    invoiceId,
    projectId: invoice.project_id || null,
  })

  const startedAt = new Date().toISOString()
  await supabase
    .from('invoice')
    .update({ fortnox_sync_status: 'pending', fortnox_sync_attempted_at: startedAt })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  let fortnoxInvoiceNumber: string | null = null
  let fortnoxDocumentNumber: string | null = null
  let fortnoxError: string | null = null

  try {
    const response = await fortnoxRequest<{ Invoice: { InvoiceNumber: string; DocumentNumber: string } }>(
      businessId,
      'POST',
      '/invoices',
      { Invoice: invoicePayload },
    )
    fortnoxInvoiceNumber = response?.Invoice?.InvoiceNumber ?? null
    fortnoxDocumentNumber = response?.Invoice?.DocumentNumber ?? null
  } catch (err: any) {
    fortnoxError = err?.message || 'Fortnox-fel'
    console.error('[sync-to-fortnox] Fortnox API failed:', fortnoxError)
  }

  if (fortnoxError || !fortnoxInvoiceNumber) {
    await supabase
      .from('invoice')
      .update({ fortnox_sync_status: 'failed', fortnox_sync_error: fortnoxError || 'No invoice number returned' })
      .eq('invoice_id', invoiceId)
      .eq('business_id', businessId)

    return { success: false, error: fortnoxError || 'No invoice number returned' }
  }

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    fortnox_invoice_number: fortnoxInvoiceNumber,
    fortnox_document_number: fortnoxDocumentNumber,
    fortnox_synced_at: now,
    fortnox_sync_status: 'synced',
    fortnox_sync_error: null,
  }
  if (isRot) {
    updateData.rot_application_status = 'submitted'
  }

  await supabase
    .from('invoice')
    .update(updateData)
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  await markInvoiceDelivered(supabase, { businessId, invoiceId, method: 'fortnox' })

  return { success: true, fortnoxInvoiceNumber, fortnoxDocumentNumber }
}

function mapUnit(u: string | undefined): string | undefined {
  if (!u) return undefined
  const lower = u.toLowerCase()
  if (lower === 'tim' || lower === 'h' || lower === 'timmar') return 'h'
  if (lower === 'st' || lower === 'styck') return 'st'
  if (lower === 'm' || lower === 'meter') return 'm'
  if (lower === 'm2' || lower === 'kvm') return 'm2'
  if (lower === 'kg') return 'kg'
  return undefined
}
```

**VIKTIGT — skillnad mot originalet:** funktionen sätter INTE längre
`invoice.status='sent'` (det gjorde `send-via-fortnox/route.ts` tidigare
— fel ansvar nu när Fortnox-steget är frikopplat från kundleverans).
Status-övergången till `'sent'` sker fortsättningsvis BARA i
`applyInvoiceDeliveryOutcome()` (oförändrad, `send-invoice.ts`), som
redan bara sätter den vid faktisk kundleverans. Detta är en medveten
beteendeändring som Task 3 måste ta hänsyn till (den gamla routens
anropare förväntade sig `status='sent'` efter en lyckad Fortnox-bokning
— se Task 3 steg 4).

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-sync-to-fortnox.spec.ts --no-deps --project=chromium`
Expected: PASS (6/6).

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Commit**

```bash
git add lib/invoices/sync-to-fortnox.ts tests/facit-sync-to-fortnox.spec.ts
git commit -m "feat(invoices): extrahera Fortnox-synk till sync-to-fortnox.ts"
```

---

## Task 3: Gör `send-via-fortnox/route.ts` till en tunn wrapper

**Files:**
- Modify: `app/api/invoices/[id]/send-via-fortnox/route.ts`
- Test: `tests/facit-sync-to-fortnox.spec.ts` (utökas)

- [ ] **Steg 1: Lägg till facit (rött)**

```typescript
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
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-sync-to-fortnox.spec.ts --no-deps --project=chromium -g "tunn wrapper"`
Expected: FAIL (3/3).

- [ ] **Steg 3: Skriv om rutten**

Ersätt hela filens innehåll (rad 1-348) med:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { syncInvoiceToFortnox } from '@/lib/invoices/sync-to-fortnox'

/**
 * POST /api/invoices/[id]/send-via-fortnox
 *
 * Fristående "Bokför i Fortnox"-åtgärd — bokför fakturan i Fortnox UTAN
 * att skicka något till kunden. Sedan 2026-08-20 (enat fakturautskick)
 * är detta INTE längre den primära vägen: "Skicka faktura"-knappen gör
 * numera Fortnox-steget automatiskt FÖRE kundleverans, via samma
 * syncInvoiceToFortnox()-funktion. Denna rutt finns kvar för fall där
 * någon medvetet vill bokföra separat från kundleverans (se
 * app/dashboard/invoices/[id]/components/InvoiceHeader.tsx, "Bokför i
 * Fortnox" i "…"-menyn).
 *
 * status='sent' sätts HÄR (till skillnad från syncInvoiceToFortnox, som
 * inte rör kundleverans-status) — historiskt beteende bevarat för denna
 * fristående knapp: en faktura som medvetet bara bokförs via den här
 * vägen (utan att gå via "Skicka faktura") räknas ändå som "sent" i
 * Handymates mening, eftersom det är den enda bekräftelsen som finns
 * att någon tog en aktiv handling på fakturan.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoiceId = params.id
    const supabase = getServerSupabase()

    const result = await syncInvoiceToFortnox(supabase, {
      businessId: business.business_id,
      invoiceId,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, message: 'Fortnox-synk misslyckades. Försök igen — vi skapar ingen dubblett.' },
        { status: 502 },
      )
    }

    if (result.skipped) {
      return NextResponse.json({ error: 'Fortnox är inte kopplad. Gå till Inställningar → Integrationer.' }, { status: 400 })
    }

    if (!result.idempotent) {
      await supabase
        .from('invoice')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('invoice_id', invoiceId)
        .eq('business_id', business.business_id)
    }

    return NextResponse.json({
      success: true,
      fortnox_invoice_number: result.fortnoxInvoiceNumber,
      fortnox_document_number: result.fortnoxDocumentNumber,
      idempotent: result.idempotent,
      message: result.idempotent
        ? 'Fakturan är redan synkad till Fortnox.'
        : `Faktura ${result.fortnoxInvoiceNumber} skapad i Fortnox.`,
    })
  } catch (err: any) {
    console.error('[send-via-fortnox] error:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
```

**OBS:** de fyra post-send-automationerna (pipeline/projektsteg/smart-
communication/portal-notis) som den gamla rutten körde efter lyckad
sync (rad 331-336 i originalet) tas INTE med i den nya tunna wrappern.
Det är en medveten ändring: den fristående "Bokför i Fortnox"-knappen
ska bara bokföra, inte trigga kundkommunikations-sidoeffekter (som
`invoice_sent`-eventet) — det är precis den sortens dubbel-avisering
till kunden som hela denna omgång ska eliminera. Automationerna hör nu
hemma i `sendInvoice()`s egen `triggerPostSendAutomations()`, som redan
körs vid faktisk kundleverans (Task 4).

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-sync-to-fortnox.spec.ts --no-deps --project=chromium`
Expected: PASS (9/9 totalt i filen).

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Commit**

```bash
git add "app/api/invoices/[id]/send-via-fortnox/route.ts" tests/facit-sync-to-fortnox.spec.ts
git commit -m "refactor(invoices): send-via-fortnox blir tunn wrapper runt syncInvoiceToFortnox"
```

---

## Task 4: Koppla in Fortnox-synk i `sendInvoice()`

**Files:**
- Modify: `lib/invoices/send-invoice.ts`
- Test: `tests/facit-send-invoice-fortnox-first.spec.ts`

Detta är kärnan i hela omgången: `sendInvoice()` (rad 84-355, redan
läst i sin helhet) anropas av BÅDE den manuella skicka-rutten och
`autoInvoiceOnComplete` — genom att lägga Fortnox-steget här, inte i
den tunna route.ts, får båda vägarna samma korrekthetsgaranti utan
duplicerad kod.

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-send-invoice-fortnox-first.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/invoices/send-invoice.ts'),
  'utf8',
)

test.describe('sendInvoice — Fortnox fore kund', () => {
  test('importerar syncInvoiceToFortnox', () => {
    expect(FILE).toContain("from '@/lib/invoices/sync-to-fortnox'")
  })

  test('Fortnox-synken anropas FORE email-forsoket', () => {
    const fortnoxIdx = FILE.indexOf('syncInvoiceToFortnox(')
    const emailIdx = FILE.indexOf('resend.emails.send')
    expect(fortnoxIdx).toBeGreaterThan(-1)
    expect(emailIdx).toBeGreaterThan(-1)
    expect(fortnoxIdx).toBeLessThan(emailIdx)
  })

  test('Fortnox-fel blockerar kundutskick helt (return innan email/sms-blocket)', () => {
    const fortnoxIdx = FILE.indexOf('syncInvoiceToFortnox(')
    const block = FILE.slice(fortnoxIdx, fortnoxIdx + 800)
    expect(block).toMatch(/return\s*\{\s*found:\s*true/)
  })

  test('delivery_status satts till delivery_failed vid misslyckad kundleverans efter lyckad Fortnox-synk', () => {
    expect(FILE).toContain("delivery_status: 'delivery_failed'")
  })

  test('delivery_status satts till delivered vid lyckad leverans', () => {
    expect(FILE).toContain("delivery_status: 'delivered'")
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-send-invoice-fortnox-first.spec.ts --no-deps --project=chromium`
Expected: FAIL (5/5).

- [ ] **Steg 3: Lägg till importen**

I `lib/invoices/send-invoice.ts`, lägg till direkt efter den befintliga
`import { rapporteraTystFel } from '@/lib/observability/driftlarm'`:

```typescript
import { syncInvoiceToFortnox } from '@/lib/invoices/sync-to-fortnox'
```

- [ ] **Steg 4: Lägg till Fortnox-steget i `sendInvoice()`**

Hitta blocket direkt efter fakturans hämtning (efter `if (invoiceError
|| !invoice) { return { found: false, errors: [] } }`, rad 112-114) och
lägg till FÖRE `prepareInvoiceManifest`-anropet (rad 116-123):

```typescript
  if (invoiceError || !invoice) {
    return { found: false, errors: [] }
  }

  // Enat fakturautskick (2026-08-20): Fortnox-bokföring FÖRE
  // kundleverans. Fortnox-fel blockerar HELA leveransen — ingen email/
  // SMS skickas om bokföringen misslyckades. syncInvoiceToFortnox() är
  // idempotent (redan 'synced' → no-op) så en omkörning efter ett
  // tidigare Fortnox-fel gör inte om det som redan lyckades.
  const fortnoxResult = await syncInvoiceToFortnox(supabase, { businessId, invoiceId })
  if (!fortnoxResult.success) {
    return { found: true, errors: [`Fortnox: ${fortnoxResult.error}`] }
  }

  // Etapp P (sql/v148): fryser fakturaunderlaget INNAN fysisk sändning
  // påbörjas. Best-effort — ett prepare-fel får ALDRIG blockera eller
  // fördröja utskicket, returvärdet ignoreras medvetet.
  await prepareInvoiceManifest(supabase, {
```

(Resten av `prepareInvoiceManifest`-anropet är oförändrat — bara den
nya kodblocket infogas före det. OBS att `syncInvoiceToFortnox()` redan
anropar `prepareInvoiceManifest` internt när Fortnox faktiskt är
kopplat och synkar — detta andra anropet här blir då ett harmlöst,
best-effort omfrysning av samma data, oförändrat beteende från innan
denna ändring.)

- [ ] **Steg 5: Skriv `delivery_status` i `applyInvoiceDeliveryOutcome()`**

I samma fil, ersätt HELA funktionskroppen för
`applyInvoiceDeliveryOutcome` (rad 390-464 — behåll funktionens
signatur, ersätt bara kroppen mellan `{` och den avslutande `}`) med:

```typescript
export async function applyInvoiceDeliveryOutcome(
  supabase: SupabaseClient,
  params: InvoiceDeliveryOutcomeParams,
): Promise<InvoiceDeliveryOutcomeResult> {
  const { businessId, invoiceId, invoice, results, source = 'user' } = params

  if (results.email || results.sms) {
    // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): sent_at/
    // sent_method sattes ALDRIG här — InvoiceStatusTimeline.tsx läser
    // BÅDA (rad 48-52) för att visa "Skickad via {metod}"-steget som
    // klart; utan sent_at visas steget som "upcoming" trots att fakturan
    // faktiskt är skickad. Samma buggklass som project.status-fyndet
    // tidigare i samma körning — en statusflip utan sina stödjande fält.
    const sentMethod = results.email && results.sms ? 'both' : results.email ? 'email' : 'sms'
    const { error: statusErr } = await supabase
      .from('invoice')
      .update({ status: 'sent', sent_at: new Date().toISOString(), sent_method: sentMethod, delivery_status: 'delivered' })
      .eq('invoice_id', invoiceId)

    if (statusErr) {
      console.error('[invoices/send] Status update failed after send:', statusErr)
      results.errors.push(`Status: ${statusErr.message}`)
      // Etapp P-härdning: felet svaldes tidigare (bara loggat till
      // console) trots att kunden FAKTISKT redan fått fakturan (email/sms
      // gick iväg innan detta steget). Gör det högt utan att ändra
      // svarssemantiken ovan — driftlarmet (automation_activity) fångar
      // det nu istället för att det försvinner i Vercel-loggarna.
      await rapporteraTystFel(
        supabase,
        businessId,
        'invoice-manifest:status-write-failed-after-delivery',
        statusErr.message,
        { invoiceId },
      )
    }

    // Manifestet markeras levererat OAVSETT om statusskrivningen ovan
    // lyckades — leveransen (email/sms) skedde, och det är den sanningen
    // manifestet fryser. Best-effort, blockerar aldrig svaret.
    await markInvoiceDelivered(supabase, {
      businessId,
      invoiceId,
      method: sentMethod,
    })

    // Logga aktivitet (customer_activity — gamla namnet activity fanns inte)
    // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): activity_id och
    // title är NOT NULL utan default på customer_activity — insertet
    // saknade båda och floppade TYST vid VARJE fakturautskick (ingen
    // .error-koll här, samma tysta-fel-mönster som redan dokumenterat i
    // auto-invoice-on-complete.ts). Fältformen kopierad från den
    // fungerande app/api/quotes/send/route.ts.
    const { error: activityErr } = await supabase
      .from('customer_activity')
      .insert({
        activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
        business_id: invoice.business_id,
        customer_id: invoice.customer_id,
        activity_type: 'invoice_sent',
        title: `Faktura ${invoice.invoice_number} skickad`,
        description: `Faktura ${invoice.invoice_number} skickad${results.email ? ' via email' : ''}${results.sms ? ' via SMS' : ''}`,
        metadata: { invoice_id: invoiceId, ...results },
        // Attributionsregeln: automationens utskick får aldrig se ut som en
        // människas klick — 'automation' när auto-invoice-on-complete skickade.
        created_by: source,
      })
    if (activityErr) {
      console.error('[invoices/send] customer_activity insert failed:', activityErr)
    }

    return { delivered: true, sentMethod }
  }

  // Enat fakturautskick (2026-08-20): om vi kom hit betyder det att
  // varken email eller SMS gick ut. Om Fortnox-steget i sendInvoice()
  // lyckades (fakturan är bokförd) är delivery_status='delivery_failed'
  // den korrekta beskrivningen — "bokfört men inte levererat". Om
  // Fortnox aldrig var inblandat (inte kopplat) är 'delivery_failed'
  // ändå en rimlig beskrivning: leveransförsöket gjordes och
  // misslyckades, oavsett bokföringsläge. Best-effort — ett fel här
  // loggas men blockerar inte returvärdet, samma princip som övriga
  // skrivningar i denna funktion.
  const { error: deliveryStatusErr } = await supabase
    .from('invoice')
    .update({ delivery_status: 'delivery_failed' })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
  if (deliveryStatusErr) {
    console.error('[invoices/send] delivery_status write failed:', deliveryStatusErr)
  }

  return { delivered: false, sentMethod: null }
}
```

- [ ] **Steg 6: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-send-invoice-fortnox-first.spec.ts --no-deps --project=chromium`
Expected: PASS (5/5).

- [ ] **Steg 7: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 8: Regressionskör befintliga fakturafacit**

Run: `Get-ChildItem tests -Filter "*invoice*send*"` (PowerShell) för att
hitta ev. redan existerande tester mot `sendInvoice`/`send/route.ts`,
kör dem: `npx playwright test <hittade filer> --no-deps --project=chromium`.
Om inga finns, notera det i commit-meddelandet — ingen regression att
verifiera mot, bara de nya facit-testerna gäller.

- [ ] **Steg 9: Commit**

```bash
git add lib/invoices/send-invoice.ts tests/facit-send-invoice-fortnox-first.spec.ts
git commit -m "feat(invoices): sendInvoice gor Fortnox-synk fore kundleverans"
```

---

## Task 5: Fortnox-dubbelskydd — markera som skickad i Fortnox

**Files:**
- Modify: `lib/invoices/sync-to-fortnox.ts`
- Test: `tests/facit-sync-to-fortnox.spec.ts` (utökas)

Skyddet mot att en människa manuellt trycker "Skicka" på samma faktura
inne i Fortnox egna gränssnitt. **Detta steg KRÄVER research mot
Fortnox live-dokumentation** (`api.fortnox.se/apidocs`,
`developer.fortnox.se`) för det exakta API-anropet — gissa inte.

- [ ] **Steg 1: Research det exakta Fortnox-anropet**

Sök i Fortnox API-dokumentationen efter hur en redan skapad faktura
markeras som "skickad"/"sent" (troligen en `PUT /invoices/{DocumentNumber}`
med ett fält som `EmailInformation` eller en dedikerad
sent/bookkeep-relaterad property — exakt namn TBD tills dokumentationen
är läst). Om ett pålitligt, dokumenterat sätt hittas: fortsätt till
Steg 2. Om INTE — hoppa till Steg 4 (degraderad väg) och dokumentera
tydligt i commit-meddelandet varför.

- [ ] **Steg 2 (om API-anropet verifierats): skriv det röda facit-testet**

```typescript
test.describe('Fortnox-dubbelskydd — markera som skickad', () => {
  const FILE = fs.readFileSync(
    path.join(__dirname, '..', 'lib/invoices/sync-to-fortnox.ts'),
    'utf8',
  )

  test('gor ett andra Fortnox-anrop for att markera fakturan som skickad', () => {
    const idx = FILE.indexOf('fortnoxDocumentNumber = response')
    const block = FILE.slice(idx, idx + 1500)
    expect(block).toMatch(/fortnoxRequest[\s\S]*?PUT/)
  })

  test('ett misslyckat markera-som-skickad-anrop blockerar INTE flodet', () => {
    const idx = FILE.indexOf('fortnoxDocumentNumber = response')
    const block = FILE.slice(idx, idx + 1500)
    expect(block).toMatch(/catch/)
  })
})
```

- [ ] **Steg 3 (om verifierat): implementera**

Lägg till direkt efter den lyckade `POST /invoices`-blocket i
`syncInvoiceToFortnox()` (efter `fortnoxDocumentNumber =
response?.Invoice?.DocumentNumber ?? null`, före `catch`-blocket
stänger), ett best-effort andra anrop som markerar fakturan skickad —
exakt payload/endpoint enligt vad Steg 1:s research gav. Ett fel här
loggas men returnerar INTE ett fel från funktionen — huvudsyftet
(korrekt bokföring) är redan uppnått vid det här laget.

- [ ] **Steg 4 (degraderad väg, om API-anropet INTE går att verifiera pålitligt):**

Skippa kodändringen. Lägg istället till en synlig textrad i UI:t
(Task 6 hanterar detta) som varnar hantverkaren: "Skicka inte om den
här fakturan från Fortnox — kunden har redan fått den via Handymate."
Dokumentera i commit-meddelandet exakt vad som söktes och varför inget
pålitligt API-anrop hittades, så nästa person inte behöver göra om
samma research förgäves.

- [ ] **Steg 5: Kör och verifiera (om Steg 2-3 gjordes)**

Run: `npx playwright test tests/facit-sync-to-fortnox.spec.ts --no-deps --project=chromium`
Expected: PASS, alla tester i filen gröna.

- [ ] **Steg 6: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 7: Commit**

```bash
git add lib/invoices/sync-to-fortnox.ts tests/facit-sync-to-fortnox.spec.ts
git commit -m "feat(fortnox): teknisk sparr mot dubbelutskick fran Fortnox granssnitt"
```

(Om degraderad väg valdes: `git commit -m "docs(fortnox): dubbelskydd degraderat till UI-varning - se commit-body for research"` med en fullständig `-m`-body som beskriver vad som söktes.)

---

## Task 6: UI — relabel Fortnox-knappen, visa delivery_failed-banner

**Files:**
- Modify: `app/dashboard/invoices/[id]/components/InvoiceHeader.tsx`
- Modify: `app/dashboard/invoices/[id]/page.tsx`
- Test: `tests/facit-invoice-delivery-status-ui.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-invoice-delivery-status-ui.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('InvoiceHeader — omdopt Fortnox-knapp', () => {
  const HEADER = fs.readFileSync(
    path.join(__dirname, '..', 'app/dashboard/invoices/[id]/components/InvoiceHeader.tsx'),
    'utf8',
  )

  test('knappen heter Bokfor i Fortnox, inte Skicka via Fortnox', () => {
    expect(HEADER).toContain('Bokför i Fortnox')
    expect(HEADER).not.toContain('Skicka via Fortnox')
  })

  test('canSendViaFortnox kraver aven att fortnox_sync_status inte redan ar synced', () => {
    const idx = HEADER.indexOf('const canSendViaFortnox')
    const line = HEADER.slice(idx, idx + 200)
    expect(line).toMatch(/fortnox_sync_status/)
  })
})

test.describe('Fakturasidan — delivery_failed-banner', () => {
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', 'app/dashboard/invoices/[id]/page.tsx'),
    'utf8',
  )

  test('visar en banner nar delivery_status ar delivery_failed', () => {
    expect(PAGE).toMatch(/delivery_status/)
    expect(PAGE).toMatch(/delivery_failed/)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-invoice-delivery-status-ui.spec.ts --no-deps --project=chromium`
Expected: FAIL (3/3).

- [ ] **Steg 3: Uppdatera `InvoiceHeader.tsx`**

Ändra `canSendViaFortnox`-raden (rad 104) från:

```typescript
  const canSendViaFortnox = fortnoxConnected && invoice.status === 'draft'
```

till:

```typescript
  const canSendViaFortnox = fortnoxConnected && invoice.status === 'draft' && invoice.fortnox_sync_status !== 'synced'
```

Ändra knapptexten (rad 258-261) från:

```typescript
                {canSendViaFortnox && (
                  <button onClick={() => { setMoreMenuOpen(false); onSendViaFortnox() }} disabled={sendingViaFortnox} className={MENU_ITEM}>
                    <Send className="w-4 h-4 text-slate-400" />
                    {sendingViaFortnox ? 'Skickar…' : 'Skicka via Fortnox'}
                  </button>
                )}
```

till:

```typescript
                {canSendViaFortnox && (
                  <button onClick={() => { setMoreMenuOpen(false); onSendViaFortnox() }} disabled={sendingViaFortnox} className={MENU_ITEM}>
                    <Send className="w-4 h-4 text-slate-400" />
                    {sendingViaFortnox ? 'Bokför…' : 'Bokför i Fortnox'}
                  </button>
                )}
```

- [ ] **Steg 4: Lägg till delivery_failed-banner i `page.tsx`**

Läs filen runt det befintliga bannermönstret (sök `is_credit_note &&`
runt rad 371-384, redan känt från tidigare läsning i denna session) och
lägg till en ny banner enligt samma mönster, direkt efter den
befintliga `invoice.is_credit_note`-bannern:

```typescript
        {invoice.delivery_status === 'delivery_failed' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-amber-700 font-medium">
                  {invoice.fortnox_sync_status === 'synced' ? 'Bokförd i Fortnox, men ej levererad till kunden' : 'Kunde inte levereras till kunden'}
                </p>
                <p className="text-sm text-amber-600">
                  Försök skicka fakturan igen — {invoice.fortnox_sync_status === 'synced' ? 'bokföringen är redan klar, bara' : ''} leveransen görs om.
                </p>
              </div>
            </div>
          </div>
        )}
```

Verifiera att `AlertTriangle` redan är importerad från `lucide-react` i
filens toppsektion (sannolikt redan importerad för andra banderoller —
om inte, lägg till den i den befintliga lucide-react-importsatsen).

- [ ] **Steg 5: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-invoice-delivery-status-ui.spec.ts --no-deps --project=chromium`
Expected: PASS (3/3).

- [ ] **Steg 6: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 7: Commit**

```bash
git add "app/dashboard/invoices/[id]/components/InvoiceHeader.tsx" "app/dashboard/invoices/[id]/page.tsx" tests/facit-invoice-delivery-status-ui.spec.ts
git commit -m "feat(invoices): UI for omdopt Fortnox-knapp och delivery_failed-banner"
```

---

## Task 7: Regression + build

**Files:** inga nya — verifieringssteg.

- [ ] **Steg 1: Kör alla nya facit-filer tillsammans**

Run: `npx playwright test tests/facit-sync-to-fortnox.spec.ts tests/facit-send-invoice-fortnox-first.spec.ts tests/facit-invoice-delivery-status-ui.spec.ts --no-deps --project=chromium`
Expected: PASS, alla gröna.

- [ ] **Steg 2: Regressionskör behörighetskontraktet**

Run: `npx playwright test tests/permission-contract.spec.ts --no-deps --project=chromium`
Expected: PASS, ingen ny röd (ingen ny rutt, `send-via-fortnox` behåller sin befintliga auth-kontroll oförändrad).

- [ ] **Steg 3: `npx tsc --noEmit` + `npx next build`**

Om builden tidigare i sessionen krävt högre minnesgräns
(`NODE_OPTIONS=--max-old-space-size=8192`) på den här maskinen, använd
samma inställning här.

Run: `npx tsc --noEmit` → 0 fel.
Run: `npx next build` → exit 0 (spara utdata till en temp-fil och radera den efteråt).

---

## Plan-status (fylls i under bygget)

- [ ] Alla 7 tasks pushade
- [ ] `sql/v163_invoice_delivery_status.sql` väntar på Andreas körning
- [ ] Task 5 (Fortnox-dubbelskydd): verifierat mot live-API eller degraderat till UI-varning — anges här vilket
- [ ] Manuell rökprövning rekommenderas innan skarp drift: skicka en riktig testfaktura mot ett Fortnox-testkonto, verifiera att bara EN bokföringspost skapas och att kunden bara får EN avisering
