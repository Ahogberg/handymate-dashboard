# Leverantörsfakturor — Fortnox-synk + projekt-/UE-koppling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. Detta repo arbetar INTE i worktrees (delad arbetskatalog-disciplin, se CLAUDE.md) — kör direkt på `main`, `git status` före varje commit, stagea specifika filer, aldrig `git add -A`.

**Goal:** Reda ut dubbelräkningsrisken mellan `supplier_invoices` och `project_material`, hämta leverantörsfakturor från Fortnox, och ge ägaren en manuell matchningskö som en framtida agent-föreslagen matchning kan byggas ovanpå utan omskrivning.

**Architecture:** Tre oberoende etapper (matchar sessionens etablerade en-etapp-per-subagent-mönster). Etapp 1 är en ren datamodell-/beräkningsfix (ingen Fortnox-beroende). Etapp 2 bygger pull-synken (beroende av Etapp 1:s `subcontractor_id`-kolumn för konsekvent leverantörskoppling, annars fristående). Etapp 3 bygger matchningskön (kräver Etapp 2:s importerade rader för att vara meningsfull, men fungerar tekniskt även på manuellt skapade rader).

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), Fortnox REST API, Playwright (facit-idiom, `--no-deps` för browserlösa tester).

**Spec:** `docs/superpowers/specs/2026-08-19-leverantorsfakturor-design.md`

---

## Etapp 1: Länkningen (datamodell + dubbelräkningsregel)

### Task 1.1: Migrationen

**Files:**
- Create: `sql/v161_supplier_invoice_linking.sql`

- [ ] **Steg 1: Skriv migrationsfilen**

```sql
-- v161: Leverantörsfakturor — länkning mot material + underentreprenörer
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- supplier_invoices och project_material kan idag registrera samma inköp
-- två gånger (lib/efterkalkyl/freeze-outcome.ts har en aktiv spärr,
-- material_source_overlap_free, som blockerar ekonomisk inlärning när båda
-- har rader på samma projekt). Se docs/superpowers/specs/
-- 2026-08-19-leverantorsfakturor-design.md, Lager 1.
--
-- BESLUT
-- project_material.supplier_invoice_id länkar en materialrad till den
-- faktura den kom ifrån (TD-79:s egen skiss, tasks/tech-debt.md).
-- supplier_invoices.subcontractor_id ger en riktig koppling mot en
-- registrerad underentreprenör — supplier_name förblir fritext för
-- materialleverantörer (Bauhaus, Beijer) som aldrig registreras.

BEGIN;

ALTER TABLE project_material
  ADD COLUMN IF NOT EXISTS supplier_invoice_id TEXT
    REFERENCES supplier_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_material_supplier_invoice
  ON project_material(supplier_invoice_id);

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS subcontractor_id TEXT
    REFERENCES subcontractor(subcontractor_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_subcontractor
  ON supplier_invoices(subcontractor_id);

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'project_material' AND column_name = 'supplier_invoice_id';
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'supplier_invoices' AND column_name = 'subcontractor_id';
```

- [ ] **Steg 2: Notera i planens statusfält (se botten av filen) att v161 väntar på Andreas körning.** Resten av Etapp 1:s kod fungerar mot en databas UTAN kolumnerna körda (Supabase-klienten kastar bara vid faktisk läsning/skrivning av de nya fälten) — men testerna i denna etapp kör mot facit/källskanning, inte en riktig databas, så de är gröna oavsett migrationsstatus. Skriv INTE kod som antar kolumnerna finns i produktion förrän Andreas bekräftat körningen.

---

### Task 1.2: `project_material`-API accepterar `supplier_invoice_id`

**Files:**
- Modify: `app/api/projects/[id]/materials/route.ts:115-178` (PUT-handlern)
- Test: `tests/facit-material-supplier-link.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-material-supplier-link.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROUTE = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/projects/[id]/materials/route.ts'),
  'utf8',
)

test.describe('PUT /api/projects/[id]/materials — supplier_invoice_id', () => {
  test('PUT-handlern läser supplier_invoice_id ur body och skriver den till updates', () => {
    const putStart = ROUTE.indexOf('export async function PUT')
    const putBody = ROUTE.slice(putStart, ROUTE.indexOf('export async function DELETE'))
    expect(putBody).toContain('body.supplier_invoice_id')
  })

  test('supplier_invoice_id kan nollställas explicit (null tillåts, inte bara undefined-skip)', () => {
    const putStart = ROUTE.indexOf('export async function PUT')
    const putBody = ROUTE.slice(putStart, ROUTE.indexOf('export async function DELETE'))
    // Mönstret i filen är "if (x !== undefined) updates.x = x" — det tillåter
    // redan explicit null (bara undefined hoppas över), så samma villkor
    // som notes/name räcker. Detta facit bevakar att koden faktiskt
    // ANVÄNDER det mönstret för det nya fältet, inte ett strngare `if (x)`.
    const idx = putBody.indexOf('supplier_invoice_id')
    expect(idx).toBeGreaterThan(-1)
    const line = putBody.slice(idx - 40, idx + 60)
    expect(line).toContain('!== undefined')
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-material-supplier-link.spec.ts --no-deps --project=chromium`
Expected: FAIL — `body.supplier_invoice_id` finns inte i filen ännu.

- [ ] **Steg 3: Lägg till fältet i PUT-handlern**

I `app/api/projects/[id]/materials/route.ts`, i `PUT`-funktionen, lägg raden efter `if (body.name !== undefined) updates.name = body.name` (rad 151):

```typescript
    if (body.name !== undefined) updates.name = body.name
    if (body.supplier_invoice_id !== undefined) updates.supplier_invoice_id = body.supplier_invoice_id
```

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-material-supplier-link.spec.ts --no-deps --project=chromium`
Expected: PASS (2/2)

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Commit**

```bash
git status
git add app/api/projects/[id]/materials/route.ts tests/facit-material-supplier-link.spec.ts
git commit -m "feat(materials): PUT accepterar supplier_invoice_id (Etapp 1 leverantörsfakturor)"
```

---

### Task 1.3: Material-tabens UI — länka/avlänka mot en faktura

**Files:**
- Modify: `app/dashboard/projects/[id]/page.tsx` (materialrad-rendering, rad ~3308-3390, samt `SupplierInvoiceModal`, rad ~5761-5900)
- Test: `tests/facit-material-supplier-link.spec.ts` (utökas)

Sidan har redan `supplierInvoices` som state (rad 673, `any[]`, redan hämtad för "Leverantörer"-fliken) — ingen ny fetch behövs, bara ny rendering i den befintliga materialrad-loopen.

- [ ] **Steg 1: Lägg till facit för UI-källskanningen (rött)**

Lägg till i `tests/facit-material-supplier-link.spec.ts`:

```typescript
test.describe('Material-tabens UI — länk mot leverantörsfaktura', () => {
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', 'app/dashboard/projects/[id]/page.tsx'),
    'utf8',
  )

  test('materialradens rendering läser mat.supplier_invoice_id', () => {
    const matRowStart = PAGE.indexOf('{materials.map(mat =>')
    const matRowEnd = PAGE.indexOf('{/* Product search modal */}')
    const block = PAGE.slice(matRowStart, matRowEnd)
    expect(block).toContain('mat.supplier_invoice_id')
  })

  test('länkningen anropar PUT /api/projects/[id]/materials med supplier_invoice_id i body', () => {
    expect(PAGE).toMatch(/supplier_invoice_id:\s*\w/)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-material-supplier-link.spec.ts --no-deps --project=chromium -g "Material-tabens UI"`
Expected: FAIL (2/2 röda).

- [ ] **Steg 3: Bygg `MaterialInvoiceLink`-komponenten**

Lägg till en ny liten komponent i `app/dashboard/projects/[id]/page.tsx`, direkt FÖRE `function SupplierInvoiceModal({` (rad 5761):

```typescript
/**
 * Länk-/avlänkningsaffordans mellan en project_material-rad och den
 * supplier_invoices-rad kostnaden faktiskt hör till (Etapp 1 leverantörs-
 * fakturor). Egen lokal state — rör INTE editingMaterial/editValues, som
 * äger kvantitet/påslag-redigeringen.
 */
function MaterialInvoiceLink({
  materialId,
  projectId,
  currentInvoiceId,
  invoices,
  onLinked,
}: {
  materialId: string
  projectId: string
  currentInvoiceId: string | null
  invoices: any[]
  onLinked: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)

  const linked = invoices.find(inv => inv.id === currentInvoiceId)

  const save = async (invoiceId: string | null) => {
    setSaving(true)
    try {
      await fetch(`/api/projects/${projectId}/materials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_id: materialId, supplier_invoice_id: invoiceId }),
      })
      onLinked()
    } finally {
      setSaving(false)
      setPicking(false)
    }
  }

  if (linked) {
    return (
      <button
        onClick={() => save(null)}
        disabled={saving}
        className="text-xs text-primary-700 hover:text-primary-800 underline underline-offset-2 disabled:opacity-50"
        title="Klicka för att avlänka"
      >
        {linked.supplier_name} · {linked.invoice_number || 'utan nr'}
      </button>
    )
  }

  if (picking) {
    return (
      <select
        autoFocus
        disabled={saving}
        onChange={e => { if (e.target.value) save(e.target.value) }}
        onBlur={() => setPicking(false)}
        className="text-xs bg-gray-50 border border-[#E2E8F0] rounded px-1 py-0.5"
      >
        <option value="">Välj faktura…</option>
        {invoices.map(inv => (
          <option key={inv.id} value={inv.id}>
            {inv.supplier_name} · {inv.invoice_number || 'utan nr'} · {inv.total_amount} kr
          </option>
        ))}
      </select>
    )
  }

  return (
    <button
      onClick={() => setPicking(true)}
      className="text-xs text-gray-400 hover:text-primary-700 underline underline-offset-2"
    >
      Koppla faktura
    </button>
  )
}
```

- [ ] **Steg 4: Rendera den i materialradens supplier_name-cell**

I samma fil, ersätt rad 3314:

```typescript
                    <div className="col-span-2 text-sm text-gray-500 truncate">{mat.supplier_name || '-'}</div>
```

med:

```typescript
                    <div className="col-span-2 text-sm text-gray-500 truncate">
                      {mat.supplier_name && <p className="m-0 truncate">{mat.supplier_name}</p>}
                      {invoices.length === 0 ? null : (
                        <MaterialInvoiceLink
                          materialId={mat.material_id}
                          projectId={project.project_id}
                          currentInvoiceId={mat.supplier_invoice_id ?? null}
                          invoices={supplierInvoices}
                          onLinked={loadMaterials}
                        />
                      )}
                    </div>
```

**OBS till den som bygger:** `invoices` i villkoret ovan är en kopieringsfel — det ska vara `supplierInvoices.length === 0 ? null : (...)`. Läs `loadMaterials`-funktionsnamnet i filen (sök `const loadMaterials|fetchMaterials|loadProjectMaterials`) och använd det verkliga namnet som `onLinked`-callbacken — filen kan ha ett annat namn än exemplet ovan; syftet är "hämta om materiallistan efter en lyckad PATCH/PUT".

- [ ] **Steg 5: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-material-supplier-link.spec.ts --no-deps --project=chromium`
Expected: PASS (4/4)

- [ ] **Steg 6: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 7: Commit**

```bash
git status
git add app/dashboard/projects/[id]/page.tsx tests/facit-material-supplier-link.spec.ts
git commit -m "feat(materials): lank/avlanka materialrad mot leverantorsfaktura i UI"
```

---

### Task 1.4: `SupplierInvoiceModal` — koppling mot underentreprenör

**Files:**
- Modify: `app/dashboard/projects/[id]/page.tsx:5761-5900+` (`SupplierInvoiceModal`)
- Test: `tests/facit-supplier-invoice-subcontractor-link.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-supplier-invoice-subcontractor-link.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const PAGE = fs.readFileSync(
  path.join(__dirname, '..', 'app/dashboard/projects/[id]/page.tsx'),
  'utf8',
)

function modalBody(): string {
  const start = PAGE.indexOf('function SupplierInvoiceModal(')
  const end = PAGE.indexOf('\nfunction ', start + 10)
  return PAGE.slice(start, end === -1 ? undefined : end)
}

test.describe('SupplierInvoiceModal — underentreprenor-koppling', () => {
  test('modalen hämtar subcontractors och håller ett valt subcontractorId i state', () => {
    const body = modalBody()
    expect(body).toContain("useState")
    expect(body).toMatch(/subcontractorId/)
  })

  test('/api/subcontractors-anropet är fail-soft — ingen kastad throw vid 403 (feature-gated)', () => {
    const body = modalBody()
    const fetchIdx = body.indexOf("/api/subcontractors")
    expect(fetchIdx).toBeGreaterThan(-1)
    const around = body.slice(fetchIdx, fetchIdx + 400)
    // Feature-gaten på GET /api/subcontractors kan 403:a för konton utan
    // planfunktionen — UI:t ska degradera tyst till fritext, aldrig krascha
    // eller visa ett fel för en funktion kontot inte betalar för.
    expect(around).toMatch(/catch/)
  })

  test('sparningen skickar subcontractor_id i PATCH/POST-payloaden', () => {
    const body = modalBody()
    expect(body).toMatch(/subcontractor_id:\s*subcontractorId/)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-supplier-invoice-subcontractor-link.spec.ts --no-deps --project=chromium`
Expected: FAIL (3/3 röda).

- [ ] **Steg 3: Lägg till subcontractor-state och fail-soft-hämtning**

I `SupplierInvoiceModal`, direkt efter raden `const [notes, setNotes] = useState(editing?.notes || '')` (rad 5776):

```typescript
  const [notes, setNotes] = useState(editing?.notes || '')
  const [subcontractorId, setSubcontractorId] = useState<string>(editing?.subcontractor_id || '')
  const [subcontractors, setSubcontractors] = useState<any[]>([])

  useEffect(() => {
    // Fail-soft: /api/subcontractors är feature-gated ('subcontractors'-
    // planfunktionen) — ett konto utan den ska bara se fritext-fältet,
    // aldrig ett fel. 403/nätverksfel lämnar bara listan tom.
    fetch('/api/subcontractors?status=active')
      .then(r => (r.ok ? r.json() : { subcontractors: [] }))
      .then(d => setSubcontractors(d.subcontractors || []))
      .catch(() => setSubcontractors([]))
  }, [])
```

Lägg till `useEffect` i importsatsen högst upp i filen om den inte redan är importerad från `'react'` (den är det redan — komponenten använder `useState` som redan importeras från samma ställe).

- [ ] **Steg 4: Skicka med i sparningen**

I samma komponents `handleSave`, lägg till i `payload`-objektet (rad ~5791-5804), direkt efter `notes: notes.trim() || null,`:

```typescript
        notes: notes.trim() || null,
        subcontractor_id: subcontractorId || null,
```

- [ ] **Steg 5: Rendera valet i UI:t**

Direkt efter Leverantör-fältet (rad 5834-5837), lägg till:

```typescript
          {/* Leverantör */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Leverantör *</label>
            <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="T.ex. Byggmaterial AB" className={inputCls} />
          </div>

          {subcontractors.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Underentreprenör (valfritt)</label>
              <select
                value={subcontractorId}
                onChange={e => {
                  setSubcontractorId(e.target.value)
                  const chosen = subcontractors.find(s => s.subcontractor_id === e.target.value)
                  if (chosen) setSupplierName(chosen.name)
                }}
                className={inputCls}
              >
                <option value="">Ingen — fritext ovan</option>
                {subcontractors.map(s => (
                  <option key={s.subcontractor_id} value={s.subcontractor_id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
```

- [ ] **Steg 6: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-supplier-invoice-subcontractor-link.spec.ts --no-deps --project=chromium`
Expected: PASS (3/3)

- [ ] **Steg 7: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 8: Commit**

```bash
git status
git add app/dashboard/projects/[id]/page.tsx tests/facit-supplier-invoice-subcontractor-link.spec.ts
git commit -m "feat(supplier-invoices): koppling mot registrerad underentreprenor i UI"
```

---

### Task 1.5: `supplier-invoices`-API skriver `subcontractor_id`

**Files:**
- Modify: `app/api/supplier-invoices/route.ts:83-108` (POST), `:146-151` (PATCH `allowed`-listan)
- Test: `tests/facit-supplier-invoice-subcontractor-link.spec.ts` (utökas)

- [ ] **Steg 1: Lägg till facit (rött)**

```typescript
test.describe('API — supplier_invoices skriver subcontractor_id', () => {
  const ROUTE = fs.readFileSync(
    path.join(__dirname, '..', 'app/api/supplier-invoices/route.ts'),
    'utf8',
  )

  test('POST-insert bär subcontractor_id', () => {
    const postStart = ROUTE.indexOf('export async function POST')
    const postBody = ROUTE.slice(postStart, ROUTE.indexOf('export async function PATCH'))
    expect(postBody).toContain('subcontractor_id')
  })

  test('PATCH allowed-listan tillåter subcontractor_id', () => {
    const patchStart = ROUTE.indexOf('export async function PATCH')
    const patchBody = ROUTE.slice(patchStart, ROUTE.indexOf('export async function DELETE'))
    expect(patchBody).toMatch(/allowed\s*=\s*\[[\s\S]*?'subcontractor_id'[\s\S]*?\]/)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-supplier-invoice-subcontractor-link.spec.ts --no-deps --project=chromium -g "skriver subcontractor_id"`
Expected: FAIL (2/2).

- [ ] **Steg 3: Lägg till fältet i POST**

I `app/api/supplier-invoices/route.ts`, i insert-objektet (rad 91-108), lägg till efter `project_id: body.project_id || null,`:

```typescript
        project_id: body.project_id || null,
        subcontractor_id: body.subcontractor_id || null,
```

- [ ] **Steg 4: Lägg till fältet i PATCH allowed-listan**

Ändra rad 146-151 från:

```typescript
    const allowed = [
      'supplier_name', 'invoice_number', 'invoice_date', 'due_date',
      'amount_excl_vat', 'vat_amount', 'total_amount',
      'markup_percent', 'billable_to_customer', 'show_to_customer',
      'status', 'paid_at', 'receipt_url', 'notes',
    ]
```

till:

```typescript
    const allowed = [
      'supplier_name', 'invoice_number', 'invoice_date', 'due_date',
      'amount_excl_vat', 'vat_amount', 'total_amount',
      'markup_percent', 'billable_to_customer', 'show_to_customer',
      'status', 'paid_at', 'receipt_url', 'notes', 'subcontractor_id',
      'project_id',
    ]
```

**OBS:** `project_id` läggs också till här — matchningskön i Etapp 3 behöver kunna PATCH:a `project_id` på en befintlig `supplier_invoices`-rad (idag går det bara att sätta vid POST). Lägg till en `verifyOwnership`-koll för `project_id` i PATCH-handlern på samma sätt som POST redan gör (rad 73-81), så en PATCH inte kan koppla en faktura mot ett projekt som tillhör ett annat företag:

I PATCH-funktionen, direkt efter `const { id, ...rest } = body` (rad 140), lägg till:

```typescript
    const { id, ...rest } = body

    if (rest.project_id) {
      const ownership = await verifyOwnership(supabase, business.business_id, [
        { table: 'project', idColumn: 'project_id', idValue: rest.project_id, label: 'projekt' },
      ])
      if (!ownership.ok) {
        return NextResponse.json(
          { error: `Du har inte tillgång till: ${ownership.missing.join(', ')}` },
          { status: 403 },
        )
      }
    }
```

- [ ] **Steg 5: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-supplier-invoice-subcontractor-link.spec.ts --no-deps --project=chromium`
Expected: PASS (5/5 totalt i filen).

- [ ] **Steg 6: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 7: Commit**

```bash
git status
git add app/api/supplier-invoices/route.ts tests/facit-supplier-invoice-subcontractor-link.spec.ts
git commit -m "feat(supplier-invoices): API skriver subcontractor_id + PATCH project_id med agarskapskontroll"
```

---

### Task 1.6: Dubbelräkningsregeln i `compute-economics.ts`

**Files:**
- Modify: `lib/projects/compute-economics.ts:384-414, 495-496, 517-518`
- Test: `tests/facit-material-double-count.spec.ts`

Detta är den ekonomiskt känsligaste tasken i hela planen. Nuvarande kod (rad 384-414) summerar `supplier_invoices.total_amount` OCH `project_material.total_purchase` rakt av — om samma inköp finns i båda tabellerna räknas det två gånger. Regeln: en `supplier_invoices`-rad räknas via sina länkade `project_material`-rader OM minst en sådan finns, annars räknas den som fristående kostnad.

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-material-double-count.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/projects/compute-economics.ts'),
  'utf8',
)

test.describe('compute-economics — ingen dubbelräkning av lankade fakturor', () => {
  test('supplier_invoices-frågan läser id (behövs för att avgöra vilka som är länkade)', () => {
    const idx = FILE.indexOf(".from('supplier_invoices')")
    const block = FILE.slice(idx, idx + 300)
    expect(block).toMatch(/\.select\(['"`][^'"`]*\bid\b/)
  })

  test('project_material-frågan läser supplier_invoice_id', () => {
    const idx = FILE.indexOf(".from('project_material')")
    const block = FILE.slice(idx, idx + 300)
    expect(block).toContain('supplier_invoice_id')
  })

  test('en fakturas total_amount räknas ALDRIG med om den har minst en länkad materialrad', () => {
    // Källskanning på att koden bygger en uteslutningsmängd (Set) av
    // länkade fakturaid:n och filtrerar supplier-summan mot den — inte
    // bara adderar allt rakt av som förut.
    const idx = FILE.indexOf('── 5. Supplier invoices')
    const block = FILE.slice(idx, idx + 1200)
    expect(block).toMatch(/linkedInvoiceIds|länkade.*Set|new Set\(/)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-material-double-count.spec.ts --no-deps --project=chromium`
Expected: FAIL (3/3).

- [ ] **Steg 3: Skriv om beräkningen**

Ersätt hela blocket rad 384-414 (från `// ── 5. Supplier invoices` till slutet av `project_material`-loopen) med:

```typescript
  // ── 5. Supplier invoices (material-inköp) ────────────────────
  const { data: supplierData, error: supplierError } = await supabase
    .from('supplier_invoices')
    .select('id, total_amount, billable_to_customer')
    .eq('business_id', businessId)
    .eq('project_id', projectId)

  assertSourceRead('supplier_invoices', supplierError)

  const supplierInvoices = (supplierData || []) as (SupplierInvoiceRow & { id: string })[]

  // Material registrerat via materials-UI (project_material). En rad kan
  // vara LÄNKAD till en supplier_invoices-rad (supplier_invoice_id satt) —
  // då representerar den fakturans faktiska kostnadsrader, och fakturans
  // total_amount ska INTE ockå räknas separat (dubbelräkning). En rad utan
  // länk är fristående inköp utanför fakturaflödet (Etapp 1,
  // docs/superpowers/specs/2026-08-19-leverantorsfakturor-design.md).
  const { data: projectMaterials, error: projectMaterialsError } = await supabase
    .from('project_material')
    .select('total_purchase, total_sell, supplier_invoice_id')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
  assertSourceRead('project_material', projectMaterialsError)

  const materialRows = (projectMaterials || []) as Array<{
    total_purchase: number | null
    total_sell: number | null
    supplier_invoice_id: string | null
  }>

  const linkedInvoiceIds = new Set(
    materialRows.map(m => m.supplier_invoice_id).filter((id): id is string => !!id),
  )

  let materialInkop = 0
  let materialBillable = 0

  // Fakturor UTAN någon länkad materialrad räknas som fristående kostnad.
  // Länkade fakturor hoppas över här — deras belopp kommer in via
  // materialraderna nedan i stället, så det räknas exakt en gång.
  for (const s of supplierInvoices) {
    if (linkedInvoiceIds.has(s.id)) continue
    const v = Number(s.total_amount || 0)
    materialInkop += v
    if (s.billable_to_customer) materialBillable += v
  }

  for (const m of materialRows) {
    materialInkop += Number(m.total_purchase || 0)
    materialBillable += Number(m.total_sell || 0)
  }
```

- [ ] **Steg 4: Uppdatera `meta`-fälten**

Rad 517-518 (`supplier_invoice_count`/`project_material_count`) refererar redan `supplierInvoices.length`/`(projectMaterials || []).length` — dessa variabelnamn är oförändrade av omskrivningen ovan (`supplierInvoices` och `projectMaterials` finns kvar), så ingen ändring behövs där. Verifiera bara att `SupplierInvoiceRow`-typen (sök `interface SupplierInvoiceRow` i samma fil) har ett `id`-fält — om inte, lägg till `id: string` i den typdefinitionen.

- [ ] **Steg 5: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-material-double-count.spec.ts --no-deps --project=chromium`
Expected: PASS (3/3).

- [ ] **Steg 6: Regressionskör befintliga ekonomifacit**

Run: `npx playwright test tests/price-vat-roundtrip.spec.ts tests/canonical-project-completion.spec.ts --no-deps --project=chromium`
Expected: PASS, ingen ny röd.

- [ ] **Steg 7: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 8: Commit**

```bash
git status
git add lib/projects/compute-economics.ts tests/facit-material-double-count.spec.ts
git commit -m "fix(economics): lankade leverantorsfakturor rakknas inte dubbelt mot material"
```

---

### Task 1.7: `material_source_overlap_free`-flaggan i `freeze-outcome.ts`

**Files:**
- Modify: `lib/efterkalkyl/freeze-outcome.ts:211-216`
- Test: `tests/facit-material-double-count.spec.ts` (utökas)

Nuvarande regel (rad 214-216) blockerar blint så fort BÅDA källorna har rader på ett projekt, oavsett länkning. Ny regel: blockera bara om det finns en OLÄNKAD `project_material`-rad SAMTIDIGT som en OLÄNKAD `supplier_invoices`-rad (verklig kvarstående dubbelräkningsrisk). Detta kräver att `computeProjectEconomics` exponerar antalet olänkade rader i `meta` — lägg till det som en del av denna task.

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
test.describe('freeze-outcome — overlap-flaggan respekterar lankning', () => {
  const FILE = fs.readFileSync(
    path.join(__dirname, '..', 'lib/efterkalkyl/freeze-outcome.ts'),
    'utf8',
  )

  test('overlap-regeln läser olänkade rader, inte bara totala antal', () => {
    const idx = FILE.indexOf('materialSourceOverlapFree')
    const block = FILE.slice(idx, idx + 400)
    expect(block).toMatch(/unlinked|olankad|olänkad/i)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-material-double-count.spec.ts --no-deps --project=chromium -g "overlap-flaggan"`
Expected: FAIL.

- [ ] **Steg 3: Exponera olänkade-räknare i `compute-economics.ts`**

I samma block som Task 1.6 skrev om, lägg till räknarna direkt efter `linkedInvoiceIds`-deklarationen:

```typescript
  const linkedInvoiceIds = new Set(
    materialRows.map(m => m.supplier_invoice_id).filter((id): id is string => !!id),
  )
  const unlinkedSupplierInvoiceCount = supplierInvoices.filter(s => !linkedInvoiceIds.has(s.id)).length
  const unlinkedProjectMaterialCount = materialRows.filter(m => !m.supplier_invoice_id).length
```

Lägg till fälten i `meta`-objektet (rad ~512-522), efter `project_material_count: (projectMaterials || []).length,`:

```typescript
      project_material_count: (projectMaterials || []).length,
      unlinked_supplier_invoice_count: unlinkedSupplierInvoiceCount,
      unlinked_project_material_count: unlinkedProjectMaterialCount,
```

- [ ] **Steg 4: Uppdatera overlap-regeln i `freeze-outcome.ts`**

Ersätt rad 211-216:

```typescript
  // Supplierfakturor och manuella materialrader kan i dagens modell avse
  // samma inköp. Tills X2d äger dedupliceringen får sådana projekt visas,
  // men de får inte bli finansiell lärdata.
  const materialSourceOverlapFree = !(
    sourceCounts.supplier_invoice > 0 && sourceCounts.project_material > 0
  )
```

med:

```typescript
  // Etapp 1 leverantörsfakturor (2026-08-19): en supplier_invoices-rad och
  // en project_material-rad kan avse samma inköp — men bara om INGEN av dem
  // är länkad (project_material.supplier_invoice_id). Länkade par har
  // dubbelräkningen bevisat undanröjd i compute-economics.ts (fakturan
  // räknas via materialraden, aldrig separat), så bara KVARSTÅENDE olänkad
  // överlappning blockerar lärdata.
  const materialSourceOverlapFree = !(
    input.economics.meta.unlinked_supplier_invoice_count > 0 &&
    input.economics.meta.unlinked_project_material_count > 0
  )
```

- [ ] **Steg 5: Uppdatera `EconomicsMeta`-typen**

Sök `interface` eller `type` som deklarerar `meta`-formen `computeProjectEconomics` returnerar (troligen i `lib/projects/compute-economics.ts`, samma fil som Task 1.6 redan är öppen i) och lägg till de två nya fälten:

```typescript
  unlinked_supplier_invoice_count: number
  unlinked_project_material_count: number
```

- [ ] **Steg 6: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-material-double-count.spec.ts --no-deps --project=chromium`
Expected: PASS (4/4 totalt).

- [ ] **Steg 7: Regressionskör hela efterkalkyl-sviten**

Run: `npx playwright test tests/outcome-quality-gate.spec.ts --no-deps --project=chromium`
Expected: PASS, ingen ny röd.

- [ ] **Steg 8: `npx tsc --noEmit` + build**

Run: `npx tsc --noEmit` → 0 fel.
Run: `npx next build > buildlog.txt 2>&1; echo $LASTEXITCODE` → 0. Radera `buildlog.txt` efteråt.

- [ ] **Steg 9: Commit**

```bash
git status
git add lib/efterkalkyl/freeze-outcome.ts lib/projects/compute-economics.ts tests/facit-material-double-count.spec.ts
git commit -m "fix(efterkalkyl): overlap-flaggan blockerar bara kvarstaende olankad dubbelrakning"
```

---

### Task 1.8: Registrera i behörighetskontraktet

**Files:**
- Modify: `tests/permission-contract.spec.ts`

- [ ] **Steg 1: Verifiera att inget nytt behörighetsbeteende faktiskt tillkommit**

`app/api/projects/[id]/materials/route.ts` hade INGEN `hasPermission`-grind före denna etapp (bara `getAuthenticatedBusiness`) — Task 1.2 lade inte till en ny grind (medvetet, se Task 1.2: att strama åt en befintlig rutt är en separat, orelaterad ändring). `app/api/supplier-invoices/route.ts` hade redan `see_financials` registrerad (rad 282-285 i kontraktsfilen) före denna etapp — Task 1.5 lade bara till fler TILLÅTNA fält på PATCH, inte en ny rutt eller ändrad grind. **Ingen ny kontraktsrad behövs för Etapp 1** — detta steg är en medveten no-op, dokumenterad här så nästa person inte undrar varför.

- [ ] **Steg 2: Kör hela behörighetskontraktet ändå, som regression**

Run: `npx playwright test tests/permission-contract.spec.ts --no-deps --project=chromium`
Expected: PASS, ingen ny röd (bekräftar att Etapp 1 inte tyst ändrat någon grind).

---

## Etapp 2: Fortnox pull-synk för leverantörsfakturor

**Förutsättning:** Etapp 1 pushad. `sql/v161` behöver INTE vara körd av Andreas för att Etapp 2 ska gå att bygga och testa (Etapp 2:s kod berör inte `subcontractor_id`/`supplier_invoice_id`-kolumnerna) — men bör vara körd innan Etapp 2 går till produktion, så att importerade fakturor kan länkas direkt.

### Task 2.1: Migrationen

**Files:**
- Create: `sql/v16X_supplier_invoice_fortnox.sql` (**numret bestäms vid byggtillfället** — kör `git log --oneline -- sql/ | head -5` eller sök högsta `vNNN`-prefix i `sql/`-mappen för att hitta nästa lediga nummer; v161 togs av Etapp 1 samma dag)

- [ ] **Steg 1: Skriv migrationsfilen** (byt `v16X` mot det verifierade numret)

```sql
-- v16X: Leverantörsfakturor — Fortnox pull-synk
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- Fortnox SupplierInvoice-resursen har aldrig rörts av integrationen
-- tidigare (bara Invoice/Customer). Se docs/superpowers/specs/
-- 2026-08-19-leverantorsfakturor-design.md, Lager 2.
--
-- VIKTIGT: kräver att befintliga Fortnox-anslutna konton ÅTERANSLUTER
-- (nytt OAuth-scope, "supplierinvoice", saknas i dagens beviljade scope
-- "invoice customer companyinformation"). Import-rutten känner igen och
-- svarar tydligt på scope-fel — se app/api/integrations/fortnox/import/
-- supplier-invoices/route.ts.

BEGIN;

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS fortnox_supplier_invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_supplier_number TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_fortnox_number
  ON supplier_invoices(business_id, fortnox_supplier_invoice_number)
  WHERE fortnox_supplier_invoice_number IS NOT NULL;

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'supplier_invoices'
--   AND column_name LIKE 'fortnox_%';
```

- [ ] **Steg 2: Notera i planens statusfält att v16X väntar på Andreas.**

---

### Task 2.2: Utöka Fortnox OAuth-scopet

**Files:**
- Modify: `app/api/integrations/fortnox/connect/route.ts:22`
- Test: `tests/facit-fortnox-supplier-invoice-scope.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-fortnox-supplier-invoice-scope.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test('Fortnox-scopet inkluderar supplierinvoice', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '..', 'app/api/integrations/fortnox/connect/route.ts'),
    'utf8',
  )
  const scopeLine = file.match(/const FORTNOX_SCOPES = '([^']+)'/)
  expect(scopeLine).not.toBeNull()
  expect(scopeLine![1].split(' ')).toContain('supplierinvoice')
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-scope.spec.ts --no-deps --project=chromium`
Expected: FAIL.

- [ ] **Steg 3: Utöka scopet**

I `app/api/integrations/fortnox/connect/route.ts`, ändra rad 22 från:

```typescript
const FORTNOX_SCOPES = 'invoice customer companyinformation'
```

till:

```typescript
const FORTNOX_SCOPES = 'invoice customer companyinformation supplierinvoice'
```

Lägg till en kommentar precis ovanför (samma stil som filens befintliga historik-kommentar rad 7-19) som förklarar att redan anslutna konton måste återansluta för att få det nya scopet — inget kodfel, bara en OAuth-verklighet.

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-scope.spec.ts --no-deps --project=chromium`
Expected: PASS.

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Commit**

```bash
git status
git add app/api/integrations/fortnox/connect/route.ts tests/facit-fortnox-supplier-invoice-scope.spec.ts
git commit -m "feat(fortnox): utoka OAuth-scope med supplierinvoice"
```

---

### Task 2.3: `getFortnoxSupplierInvoices()` — hämtningsfunktionen

**Files:**
- Modify: `lib/fortnox.ts` (lägg till nära `getFortnoxInvoices`, rad ~747)
- Test: `tests/facit-fortnox-supplier-invoice-fetch.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-fortnox-supplier-invoice-fetch.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/fortnox.ts'),
  'utf8',
)

test.describe('getFortnoxSupplierInvoices', () => {
  test('funktionen finns och exporteras', () => {
    expect(FILE).toMatch(/export async function getFortnoxSupplierInvoices/)
  })

  test('anropar /supplierinvoices, inte /invoices', () => {
    const idx = FILE.indexOf('export async function getFortnoxSupplierInvoices')
    const block = FILE.slice(idx, idx + 1500)
    expect(block).toMatch(/\/supplierinvoices/)
    expect(block).not.toMatch(/'\/invoices/)
  })

  test('återanvänder fortnoxRequest (token-refresh + audit-logg), skriver inte ett eget fetch-anrop', () => {
    const idx = FILE.indexOf('export async function getFortnoxSupplierInvoices')
    const block = FILE.slice(idx, idx + 1500)
    expect(block).toContain('fortnoxRequest')
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-fetch.spec.ts --no-deps --project=chromium`
Expected: FAIL (3/3).

- [ ] **Steg 3: Lägg till typen och funktionen**

I `lib/fortnox.ts`, direkt efter `interface FortnoxInvoiceListItem { ... }`-blocket (rad 640-653), lägg till:

```typescript
export interface FortnoxSupplierInvoiceListItem {
  GivenNumber?: string
  InvoiceNumber?: string
  SupplierNumber?: string
  SupplierName?: string
  InvoiceDate?: string
  DueDate?: string
  Total?: number
  Balance?: number
  Currency?: string
  Cancelled?: boolean
  Booked?: boolean
}

interface FortnoxSupplierInvoicesListResponse {
  SupplierInvoices?: FortnoxSupplierInvoiceListItem[]
  MetaInformation?: { '@TotalPages'?: number; '@CurrentPage'?: number }
}
```

Direkt efter `fetchFortnoxInvoicePages`-funktionen (rad 673-693), lägg till en spegling för leverantörsfakturor:

```typescript
async function fetchFortnoxSupplierInvoicePages(
  businessId: string,
  queryParams: string,
): Promise<FortnoxSupplierInvoiceListItem[]> {
  const all: FortnoxSupplierInvoiceListItem[] = []
  for (let page = 1; page <= INVOICE_PULL_MAX_PAGES; page++) {
    const response = await fortnoxRequest<FortnoxSupplierInvoicesListResponse>(
      businessId,
      'GET',
      `/supplierinvoices?${queryParams}&page=${page}`
    )

    const rows = response.SupplierInvoices ?? []
    all.push(...rows)

    const totalPages = response.MetaInformation?.['@TotalPages'] ?? 1
    const currentPage = response.MetaInformation?.['@CurrentPage'] ?? page
    if (rows.length === 0 || currentPage >= totalPages) break
  }
  return all
}

/**
 * Hämtar leverantörsfakturor från Fortnox — samma två-pull-strategi som
 * getFortnoxInvoices (obetalda utan tidsgräns + senaste 12 månaderna),
 * pull-only (Fortnox förblir bokföringens källa, se
 * docs/superpowers/specs/2026-08-19-leverantorsfakturor-design.md).
 */
export async function getFortnoxSupplierInvoices(
  businessId: string
): Promise<FortnoxSupplierInvoiceListItem[]> {
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 12)
  const fromDate = twelveMonthsAgo.toISOString().slice(0, 10)

  try {
    const [unpaid, recent] = await Promise.all([
      fetchFortnoxSupplierInvoicePages(businessId, 'filter=unpaid'),
      fetchFortnoxSupplierInvoicePages(businessId, `fromdate=${fromDate}`),
    ])
    const seen = new Set<string>()
    const merged: FortnoxSupplierInvoiceListItem[] = []
    for (const inv of [...unpaid, ...recent]) {
      const key = inv.GivenNumber ?? inv.InvoiceNumber
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(inv)
    }
    return merged.filter(inv => !inv.Cancelled)
  } catch (error) {
    console.error('Get Fortnox supplier invoices error:', error)
    throw error
  }
}
```

**OBS till den som bygger:** Fortnox `SupplierInvoice`-resursens exakta dokumentnummer-fält (`GivenNumber` ovan är en rimlig gissning baserat på Fortnox API-mönster där kundfakturor har `DocumentNumber`/`InvoiceNumber`) MÅSTE verifieras mot Fortnox live API-dokumentation (`https://developer.fortnox.se/documentation/resources/supplier-invoices/`) innan denna task committas — se spec-filens "Öppen implementationsdetalj". Justera fältnamnen i interfacet och funktionerna ovan om dokumentationen visar annat.

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-fetch.spec.ts --no-deps --project=chromium`
Expected: PASS (3/3).

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Commit**

```bash
git status
git add lib/fortnox.ts tests/facit-fortnox-supplier-invoice-fetch.spec.ts
git commit -m "feat(fortnox): getFortnoxSupplierInvoices - hamtning av leverantorsfakturor"
```

---

### Task 2.4: `mapFortnoxSupplierInvoice` — ren mappningsfunktion

**Files:**
- Create: `lib/fortnox/map-supplier-invoice.ts`
- Test: `tests/facit-fortnox-supplier-invoice-map.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-fortnox-supplier-invoice-map.spec.ts
import { test, expect } from '@playwright/test'
import { mapFortnoxSupplierInvoice, resolveSupplierDocNumber } from '../lib/fortnox/map-supplier-invoice'
import type { FortnoxSupplierInvoiceListItem } from '../lib/fortnox'

const TODAY = '2026-08-20'

test.describe('mapFortnoxSupplierInvoice', () => {
  test('saknat dokumentnummer → null (skip)', () => {
    const fi: FortnoxSupplierInvoiceListItem = { Total: 1000 }
    expect(mapFortnoxSupplierInvoice(fi, TODAY)).toBeNull()
    expect(resolveSupplierDocNumber(fi)).toBeNull()
  })

  test('obetald, ej förfallen → status sent', () => {
    const fi: FortnoxSupplierInvoiceListItem = {
      GivenNumber: 'SI-1', Total: 5000, Balance: 5000, DueDate: '2026-09-01',
    }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.status).toBe('unpaid')
  })

  test('förfallodatum passerat, obetald → status overdue', () => {
    const fi: FortnoxSupplierInvoiceListItem = {
      GivenNumber: 'SI-2', Total: 5000, Balance: 5000, DueDate: '2026-08-01',
    }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.status).toBe('overdue')
  })

  test('Balance 0 → status paid oavsett förfallodatum', () => {
    const fi: FortnoxSupplierInvoiceListItem = {
      GivenNumber: 'SI-3', Total: 5000, Balance: 0, DueDate: '2026-01-01',
    }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.status).toBe('paid')
  })

  test('dokumentnumret hamnar i fortnox_supplier_invoice_number', () => {
    const fi: FortnoxSupplierInvoiceListItem = { GivenNumber: 'SI-4', Total: 100, Balance: 100 }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.fortnox_supplier_invoice_number).toBe('SI-4')
  })

  test('SupplierNumber hamnar i fortnox_supplier_number, SupplierName i supplier_name', () => {
    const fi: FortnoxSupplierInvoiceListItem = {
      GivenNumber: 'SI-5', Total: 100, Balance: 100,
      SupplierNumber: '42', SupplierName: 'Bauhaus AB',
    }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.fortnox_supplier_number).toBe('42')
    expect(mapped?.row.supplier_name).toBe('Bauhaus AB')
  })

  test('saknat SupplierName → fallback "Okänd leverantör" (aldrig tom sträng i UI)', () => {
    const fi: FortnoxSupplierInvoiceListItem = { GivenNumber: 'SI-6', Total: 100, Balance: 100 }
    const mapped = mapFortnoxSupplierInvoice(fi, TODAY)
    expect(mapped?.row.supplier_name).toBe('Okänd leverantör')
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-map.spec.ts --no-deps --project=chromium`
Expected: FAIL — modulen finns inte.

- [ ] **Steg 3: Skriv `lib/fortnox/map-supplier-invoice.ts`**

```typescript
/**
 * Fortnox-leverantörsfakturamappning — ren, deterministisk översättning av
 * en Fortnox SupplierInvoice-rad till den lokala supplier_invoices-insert-
 * payloaden. Ingen DB, ingen tid (dagens datum matas in) → enhetstestbar
 * (tests/facit-fortnox-supplier-invoice-map.spec.ts). Speglar
 * lib/fortnox/map-invoice.ts:s idiom exakt.
 *
 * Rutten (app/api/integrations/fortnox/import/supplier-invoices/route.ts)
 * lägger till business_id och fortnox_synced_at (icke-deterministisk tid)
 * innan insert. project_id och subcontractor_id sätts ALDRIG av importen —
 * det är matchningsköns jobb (Etapp 3).
 */

import type { FortnoxSupplierInvoiceListItem } from '../fortnox'

export interface MappedSupplierInvoiceRow {
  supplier_name: string
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  amount_excl_vat: number
  vat_amount: number
  total_amount: number
  status: 'unpaid' | 'overdue' | 'paid'
  fortnox_supplier_invoice_number: string
  fortnox_supplier_number: string | null
}

export interface MappedSupplierInvoice {
  docNumber: string
  row: MappedSupplierInvoiceRow
}

/** Dokumentnummer att dedup:a/peka tillbaka på. Null → fakturan hoppas över. */
export function resolveSupplierDocNumber(fi: FortnoxSupplierInvoiceListItem): string | null {
  return fi.GivenNumber ?? fi.InvoiceNumber ?? null
}

/**
 * Mappar en Fortnox-leverantörsfaktura → lokal supplier_invoices-rad.
 *
 * @param today ISO-datum (YYYY-MM-DD) — förfallen om due_date < today.
 * @returns null om fakturan saknar dokumentnummer → rutten räknar den som
 *          `skipped`.
 */
export function mapFortnoxSupplierInvoice(
  fi: FortnoxSupplierInvoiceListItem,
  today: string,
): MappedSupplierInvoice | null {
  const docNumber = resolveSupplierDocNumber(fi)
  if (!docNumber) return null

  const total = Number(fi.Total) || 0
  const balance = fi.Balance != null ? Number(fi.Balance) || 0 : total
  const isPaid = balance <= 0
  const due_date = fi.DueDate ?? null

  const status: 'unpaid' | 'overdue' | 'paid' = isPaid
    ? 'paid'
    : (due_date && due_date < today ? 'overdue' : 'unpaid')

  return {
    docNumber,
    row: {
      supplier_name: fi.SupplierName?.trim() || 'Okänd leverantör',
      invoice_number: fi.InvoiceNumber ?? docNumber,
      invoice_date: fi.InvoiceDate ?? null,
      due_date,
      amount_excl_vat: total,
      vat_amount: 0,
      total_amount: total,
      status,
      fortnox_supplier_invoice_number: docNumber,
      fortnox_supplier_number: fi.SupplierNumber ?? null,
    },
  }
}
```

**OBS:** `amount_excl_vat: total` (momsbeloppet sätts till 0, totalen bär hela summan exkl.-fältet) är en medveten förenkling — Fortnox SupplierInvoice-listresursen exponerar troligen inte moms uppdelat i listvyn (samma begränsning gäller inte kundfakturor eftersom `map-invoice.ts` inte heller bryter ut moms där). Verifiera mot Fortnox-dokumentationen i samma veva som Task 2.3:s fältnamn — om ett `VAT`-fält finns i listresursen, mappa det till `vat_amount` och `amount_excl_vat = total - vat`.

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-map.spec.ts --no-deps --project=chromium`
Expected: PASS (7/7).

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Commit**

```bash
git status
git add lib/fortnox/map-supplier-invoice.ts tests/facit-fortnox-supplier-invoice-map.spec.ts
git commit -m "feat(fortnox): mapFortnoxSupplierInvoice - ren mappningsfunktion"
```

---

### Task 2.5: Import-rutten

**Files:**
- Create: `app/api/integrations/fortnox/import/supplier-invoices/route.ts`
- Modify: `lib/fortnox/api-log.ts` (om `logFortnoxOperation`s typsignatur för `operation`-strängen är en sluten union — läs filen; om den är `string` behövs ingen ändring)
- Test: `tests/facit-fortnox-supplier-invoice-import.spec.ts`

- [ ] **Steg 1: Läs `logFortnoxOperation`s signatur**

Öppna `lib/fortnox/api-log.ts` och kontrollera om `operation`-parametern är typad som en sluten sträng-union (t.ex. `'import_invoices' | 'import_customers' | ...`) eller bred `string`. Om sluten union: lägg till `'import_supplier_invoices'` i unionen som en del av detta steg.

- [ ] **Steg 2: Skriv det röda facit-testet**

```typescript
// tests/facit-fortnox-supplier-invoice-import.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROUTE_PATH = path.join(
  __dirname, '..', 'app/api/integrations/fortnox/import/supplier-invoices/route.ts',
)

test.describe('POST /api/integrations/fortnox/import/supplier-invoices', () => {
  test('rutten finns och exporterar POST', () => {
    expect(fs.existsSync(ROUTE_PATH)).toBe(true)
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toContain('export async function POST')
  })

  test('kräver autentisering före allt annat', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    const authIdx = src.indexOf('getAuthenticatedBusiness')
    const fetchIdx = src.indexOf('getFortnoxSupplierInvoices')
    expect(authIdx).toBeGreaterThan(-1)
    expect(fetchIdx).toBeGreaterThan(authIdx)
  })

  test('dedup mot befintliga fortnox_supplier_invoice_number', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toContain('fortnox_supplier_invoice_number')
    expect(src).toMatch(/new Set\(/)
  })

  test('nya rader skapas ALDRIG med project_id eller subcontractor_id satt', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    const insertIdx = src.indexOf(".from('supplier_invoices')\n      .insert(")
    expect(insertIdx).toBeGreaterThan(-1)
    const insertBlock = src.slice(insertIdx, insertIdx + 500)
    // project_id/subcontractor_id får INTE förekomma i insert-payloaden —
    // Etapp 3:s matchningskö äger den skrivningen, aldrig importen.
    expect(insertBlock).not.toMatch(/project_id:/)
    expect(insertBlock).not.toMatch(/subcontractor_id:/)
  })

  test('scope-fel (403 fran Fortnox) ger en tydlig svensk atenanslut-text, inte ett generiskt fel', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toMatch(/[åa]teranslut/i)
  })

  test('per-rad felisolering — ett trasigt insert stoppar inte hela batchen', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toMatch(/results\.errors\.push/)
  })
})
```

- [ ] **Steg 3: Kör och verifiera rött**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-import.spec.ts --no-deps --project=chromium`
Expected: FAIL (filen finns inte).

- [ ] **Steg 4: Skriv rutten**

```typescript
// app/api/integrations/fortnox/import/supplier-invoices/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isFortnoxConnected, getFortnoxSupplierInvoices } from '@/lib/fortnox'
import { mapFortnoxSupplierInvoice } from '@/lib/fortnox/map-supplier-invoice'
import { logFortnoxOperation } from '@/lib/fortnox/api-log'

interface ExistingSupplierInvoice {
  fortnox_supplier_invoice_number: string | null
}

/**
 * POST /api/integrations/fortnox/import/supplier-invoices
 *
 * Importerar leverantörsfakturor från Fortnox till lokala supplier_invoices-
 * rader. PULL-ONLY (Fortnox förblir bokföringens källa, se
 * docs/superpowers/specs/2026-08-19-leverantorsfakturor-design.md, Lager 2).
 *
 * Nya rader börjar ALLTID med project_id=NULL och subcontractor_id=NULL —
 * matchningskön på Karins sida (Etapp 3) äger den kopplingen, aldrig
 * importen.
 *
 * DEDUP: hoppar över fakturor vars fortnox_supplier_invoice_number redan
 * finns lokalt.
 *
 * SCOPE: kräver Fortnox-scopet "supplierinvoice" (utökat 2026-08-19) —
 * konton anslutna innan dess saknar rättigheten och måste återansluta.
 */
export async function POST(request: NextRequest) {
  let businessId: string | null = null
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    businessId = business.business_id

    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    let fortnoxSupplierInvoices
    try {
      fortnoxSupplierInvoices = await getFortnoxSupplierInvoices(businessId)
    } catch (fetchError: unknown) {
      const message = fetchError instanceof Error ? fetchError.message : ''
      if (message.includes('403') || message.toLowerCase().includes('scope')) {
        return NextResponse.json(
          { error: 'Återanslut Fortnox för att hämta leverantörsfakturor — behörigheten saknas på den nuvarande anslutningen.' },
          { status: 403 },
        )
      }
      throw fetchError
    }

    const { data: existingInvoices } = await supabase
      .from('supplier_invoices')
      .select('fortnox_supplier_invoice_number')
      .eq('business_id', businessId)
      .not('fortnox_supplier_invoice_number', 'is', null)

    const existingDocNumbers = new Set(
      (existingInvoices as ExistingSupplierInvoice[] | null)
        ?.map(i => i.fortnox_supplier_invoice_number)
        .filter((n): n is string => !!n) ?? []
    )

    const results = {
      imported: 0,
      skipped: 0,
      total_amount_kr: 0,
      errors: [] as { documentNumber: string; error: string }[],
    }

    const today = new Date().toISOString().split('T')[0]

    for (const fi of fortnoxSupplierInvoices) {
      const mapped = mapFortnoxSupplierInvoice(fi, today)
      if (!mapped) {
        results.skipped++
        continue
      }

      const { docNumber, row } = mapped

      if (existingDocNumbers.has(docNumber)) {
        results.skipped++
        continue
      }

      try {
        const id = `sinv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        const { error: insertError } = await supabase
          .from('supplier_invoices')
          .insert({
            id,
            business_id: businessId,
            supplier_name: row.supplier_name,
            invoice_number: row.invoice_number,
            invoice_date: row.invoice_date,
            due_date: row.due_date,
            amount_excl_vat: row.amount_excl_vat,
            vat_amount: row.vat_amount,
            total_amount: row.total_amount,
            status: row.status === 'overdue' ? 'unpaid' : row.status,
            fortnox_supplier_invoice_number: row.fortnox_supplier_invoice_number,
            fortnox_supplier_number: row.fortnox_supplier_number,
            fortnox_synced_at: new Date().toISOString(),
          })

        if (insertError) throw insertError

        existingDocNumbers.add(docNumber)
        results.imported++
        results.total_amount_kr += row.total_amount
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push({ documentNumber: docNumber, error: errorMessage })
      }
    }

    await logFortnoxOperation(businessId, 'import_supplier_invoices', {
      imported: results.imported,
      skipped: results.skipped,
      total: fortnoxSupplierInvoices.length,
      total_amount_kr: Math.round(results.total_amount_kr),
      error_count: results.errors.length,
    })

    return NextResponse.json({
      success: true,
      imported: results.imported,
      skipped: results.skipped,
      total: fortnoxSupplierInvoices.length,
      total_amount_kr: Math.round(results.total_amount_kr),
      errors: results.errors,
    })
  } catch (error: unknown) {
    console.error('Import supplier invoices error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Import failed'
    if (businessId) {
      await logFortnoxOperation(businessId, 'import_supplier_invoices', null, errorMessage)
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
```

**OBS:** `supplier_invoices.status` bär värdena `'unpaid' | 'paid' | 'invoiced'` (v11-schemat, se Task 1.1) — mappningsfunktionens `'overdue'`-status finns inte som ett DB-värde där, bara i UI-härledning (jämför med hur `invoice`-tabellen faktiskt HAR en `overdue`-status men `supplier_invoices` inte gör det). Raden `status: row.status === 'overdue' ? 'unpaid' : row.status` normaliserar det — förfallenhet visas i UI:t genom att jämföra `due_date` mot dagens datum, inte genom ett lagrat `overdue`-värde. Verifiera detta mot `app/dashboard/projects/[id]/page.tsx`s befintliga rendering av `supplier_invoices.status` (sök `inv.status` i "Leverantörer"-fliken) innan denna task committas, för att bekräfta att UI:t redan härleder förfallenhet klientsidan snarare än att förvänta ett `overdue`-DB-värde.

- [ ] **Steg 5: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-import.spec.ts --no-deps --project=chromium`
Expected: PASS (6/6).

- [ ] **Steg 6: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 7: Commit**

```bash
git status
git add app/api/integrations/fortnox/import/supplier-invoices/route.ts tests/facit-fortnox-supplier-invoice-import.spec.ts
git commit -m "feat(fortnox): import-rutt for leverantorsfakturor (pull-only)"
```

---

### Task 2.6: UI — foga in i "Hämta historik"

**Files:**
- Modify: `app/dashboard/settings/integrations/page.tsx:143-163`
- Test: `tests/facit-fortnox-supplier-invoice-import.spec.ts` (utökas)

- [ ] **Steg 1: Lägg till facit (rött)**

```typescript
test.describe('Installningar - Hamta historik inkluderar leverantorsfakturor', () => {
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', 'app/dashboard/settings/integrations/page.tsx'),
    'utf8',
  )

  test('handleFortnoxImportHistory anropar import/supplier-invoices', () => {
    const start = PAGE.indexOf('async function handleFortnoxImportHistory')
    const end = PAGE.indexOf('async function handleFortnoxDisconnect')
    const block = PAGE.slice(start, end)
    expect(block).toContain('/api/integrations/fortnox/import/supplier-invoices')
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-import.spec.ts --no-deps --project=chromium -g "Hamta historik"`
Expected: FAIL.

- [ ] **Steg 3: Lägg till anropet**

I `app/dashboard/settings/integrations/page.tsx`, i `handleFortnoxImportHistory` (rad 143-163), lägg till ett tredje sekventiellt anrop efter kundfaktura-importen:

```typescript
  async function handleFortnoxImportHistory() {
    setFortnoxAction('importing')
    try {
      await fetch('/api/integrations/fortnox/import/customers', { method: 'POST' })
      const res = await fetch('/api/integrations/fortnox/import/invoices', { method: 'POST' })
      const data = await res.json()

      let supplierMessage = ''
      try {
        const supplierRes = await fetch('/api/integrations/fortnox/import/supplier-invoices', { method: 'POST' })
        const supplierData = await supplierRes.json()
        if (supplierRes.ok && supplierData.imported > 0) {
          supplierMessage = ` + ${supplierData.imported} leverantörsfakturor`
        }
        // Scope-fel (403, gammal anslutning utan supplierinvoice-rättighet)
        // stoppar INTE kundfaktura-flödet — det lyckades redan ovan. Fångas
        // tyst här; ägaren ser status i "Synka nu"-flödet vid behov.
      } catch {
        // Nätverksfel på det tredje anropet ska inte förstöra toasten för
        // de två som redan lyckades.
      }

      if (res.ok) {
        setFortnoxToast(
          `Historik hämtad: ${data.imported} fakturor importerade${data.skipped ? `, ${data.skipped} redan kända` : ''}${supplierMessage}`
        )
      } else {
        setFortnoxToast(`Historik-hämtning misslyckades: ${data.error || 'okänt fel'}`)
      }
      await refreshFortnox()
    } catch (err: any) {
      setFortnoxToast(`Historik-hämtning misslyckades: ${err.message || 'okänt fel'}`)
    } finally {
      setFortnoxAction(null)
      setTimeout(() => setFortnoxToast(null), 6000)
    }
  }
```

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-import.spec.ts --no-deps --project=chromium`
Expected: PASS (7/7 totalt i filen).

- [ ] **Steg 5: `npx tsc --noEmit` + build**

Run: `npx tsc --noEmit` → 0 fel.
Run: `npx next build > buildlog.txt 2>&1; echo $LASTEXITCODE` → 0. Radera `buildlog.txt`.

- [ ] **Steg 6: Commit**

```bash
git status
git add app/dashboard/settings/integrations/page.tsx tests/facit-fortnox-supplier-invoice-import.spec.ts
git commit -m "feat(fortnox): Hamta historik hamtar aven leverantorsfakturor"
```

---

### Task 2.7: Cron — friska upp betalstatus

**Files:**
- Modify: `app/api/cron/fortnox-sync/route.ts`
- Test: `tests/facit-fortnox-supplier-invoice-cron.spec.ts`

- [ ] **Steg 1: Läs den befintliga cron-loopens exakta form**

Öppna `app/api/cron/fortnox-sync/route.ts` och `lib/fortnox/sync-payments.ts` för att se den exakta funktionssignaturen som synkar betalstatus för kundfakturor (troligen `syncInvoicePayments(businessId)` eller liknande, anropad per ansluten business i cronet). Detta steg kräver läsning av live-koden innan skrivning — signaturen är INTE gissad här eftersom `sync-payments.ts` inte lästs i planeringsfasen.

- [ ] **Steg 2: Skriv det röda facit-testet**

```typescript
// tests/facit-fortnox-supplier-invoice-cron.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test('fortnox-sync-cronet friskar aven upp leverantorsfakturors betalstatus', () => {
  const file = fs.readFileSync(
    path.join(__dirname, '..', 'app/api/cron/fortnox-sync/route.ts'),
    'utf8',
  )
  expect(file).toMatch(/supplier.invoice/i)
})
```

- [ ] **Steg 3: Kör och verifiera rött**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-cron.spec.ts --no-deps --project=chromium`
Expected: FAIL.

- [ ] **Steg 4: Skriv `syncSupplierInvoicePayments` i `lib/fortnox/sync-payments.ts`**

Speglar den befintliga betalstatus-synkfunktionen för kundfakturor rad för rad, men mot `supplier_invoices`: hämtar rader med `fortnox_supplier_invoice_number IS NOT NULL` och `status != 'paid'`, slår upp `GET /supplierinvoices/{GivenNumber}` via `fortnoxRequest`, sätter `status='paid'` om `Balance <= 0`. **Ingen sidoeffekt** (till skillnad från kundfakturors `markInvoicePaid` som triggar portalnotiser/automationer — en leverantörsfaktura som blir betald i Fortnox ska INTE trigga något utskick eller pipeline-steg, bara uppdatera statusfältet). Läs den exakta befintliga funktionen (Steg 1) och spegla dess struktur, kolumnnamn och felhantering — skriv inte om från grunden.

- [ ] **Steg 5: Anropa den från cron-rutten**

I `app/api/cron/fortnox-sync/route.ts`, i samma per-business-loop som redan finns (samma try/catch-per-business-isolering som befintlig kod), lägg till anropet till `syncSupplierInvoicePayments(businessId)` bredvid det befintliga kundfaktura-anropet.

- [ ] **Steg 6: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-fortnox-supplier-invoice-cron.spec.ts --no-deps --project=chromium`
Expected: PASS.

- [ ] **Steg 7: Regressionskör**

Run: `npx playwright test tests/permission-contract.spec.ts --no-deps --project=chromium`
Expected: PASS.

- [ ] **Steg 8: `npx tsc --noEmit` + build**

Run: `npx tsc --noEmit` → 0 fel.
Run: `npx next build > buildlog.txt 2>&1; echo $LASTEXITCODE` → 0. Radera `buildlog.txt`.

- [ ] **Steg 9: Commit**

```bash
git status
git add app/api/cron/fortnox-sync/route.ts lib/fortnox/sync-payments.ts tests/facit-fortnox-supplier-invoice-cron.spec.ts
git commit -m "feat(fortnox): cronet friskar aven upp leverantorsfakturors betalstatus"
```

---

## Etapp 3: Matchningskön på Karins sida

**Förutsättning:** Etapp 2 pushad (kön är mest meningsfull med Fortnox-importerade rader, men fungerar tekniskt även på manuellt skapade `supplier_invoices`-rader med `project_id IS NULL` — testas mot båda).

### Task 3.1: API-rutten

**Files:**
- Create: `app/api/karin/supplier-invoices/route.ts`
- Test: `tests/facit-karin-supplier-invoice-queue.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-karin-supplier-invoice-queue.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROUTE_PATH = path.join(__dirname, '..', 'app/api/karin/supplier-invoices/route.ts')

test.describe('GET/PATCH /api/karin/supplier-invoices', () => {
  test('rutten finns med GET och PATCH', () => {
    expect(fs.existsSync(ROUTE_PATH)).toBe(true)
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toContain('export async function GET')
    expect(src).toContain('export async function PATCH')
  })

  test('bada metoderna ar agare/admin-grindade, samma monster som karin/events', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    const getBlock = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function PATCH'))
    const patchBlock = src.slice(src.indexOf('export async function PATCH'))
    for (const block of [getBlock, patchBlock]) {
      expect(block).toContain('getAuthenticatedBusiness')
      expect(block).toMatch(/isOwnerOrAdmin/)
    }
  })

  test('GET filtrerar pa project_id IS NULL', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    expect(src).toMatch(/\.is\(['"]project_id['"],\s*null\)/)
  })

  test('PATCH kontrollerar projekt-agarskap via verifyOwnership innan skrivning', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    const patchBlock = src.slice(src.indexOf('export async function PATCH'))
    expect(patchBlock).toContain('verifyOwnership')
  })

  test('GET lackar aldrig interna marginalfalt (markup_percent/billable_to_customer daljs eller ar ok att visa - men amount_excl_vat/total_amount ar det enda beloppet, ingen kostnadsjamforelse mot kundpris i svaret)', () => {
    // Kön visar leverantörens faktura, inte projektets marginal — GET ska
    // inte joina in projektets budget/marginal i samma svar.
    const src = fs.readFileSync(ROUTE_PATH, 'utf8')
    const getBlock = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function PATCH'))
    expect(getBlock).not.toMatch(/marginal|budget_amount/)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts --no-deps --project=chromium`
Expected: FAIL.

- [ ] **Steg 3: Skriv rutten**

```typescript
// app/api/karin/supplier-invoices/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { verifyOwnership } from '@/lib/auth/verify-ownership'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'

/**
 * GET/PATCH /api/karin/supplier-invoices — matchningskön (Etapp 3
 * leverantörsfakturor). Fakturor importerade från Fortnox (eller manuellt
 * skapade) utan projektkoppling hamnar här. Ägaren väljer projekt +
 * leverantör; sparad rad lämnar kön (project_id blir icke-null) och syns
 * i projektets befintliga "Leverantörer"-flik.
 *
 * Samma tre-lagers rollskydd som resten av Karins yta: länken döljs i
 * inställningarna, sidan redirectar, API:et 403:ar (se app/dashboard/
 * karin/page.tsx docstring).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('supplier_invoices')
      .select('id, supplier_name, invoice_number, invoice_date, due_date, total_amount, fortnox_supplier_invoice_number, created_at')
      .eq('business_id', business.business_id)
      .is('project_id', null)
      .order('invoice_date', { ascending: false, nullsFirst: false })

    if (error) throw error

    return NextResponse.json({ queue: data || [] })
  } catch (error: any) {
    console.error('Get karin supplier-invoice queue error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH — matchar en kö-rad mot ett projekt och (valfritt) en registrerad
 * underentreprenör eller fritext-leverantörsnamn.
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id, project_id, subcontractor_id, supplier_name } = body

    if (!id || !project_id) {
      return NextResponse.json({ error: 'id och project_id krävs' }, { status: 400 })
    }

    const ownership = await verifyOwnership(supabase, business.business_id, [
      { table: 'project', idColumn: 'project_id', idValue: project_id, label: 'projekt' },
    ])
    if (!ownership.ok) {
      return NextResponse.json(
        { error: `Du har inte tillgång till: ${ownership.missing.join(', ')}` },
        { status: 403 },
      )
    }

    const updates: Record<string, any> = { project_id, updated_at: new Date().toISOString() }
    if (subcontractor_id !== undefined) updates.subcontractor_id = subcontractor_id
    if (supplier_name !== undefined && supplier_name.trim()) updates.supplier_name = supplier_name.trim()

    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ invoice })
  } catch (error: any) {
    console.error('Patch karin supplier-invoice queue error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts --no-deps --project=chromium`
Expected: PASS (5/5).

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Registrera i behörighetskontraktet**

I `tests/permission-contract.spec.ts`, i sektionen `'Bolagskalendern (egna poster)'` (rad 365-376), lägg till efter `karin/events/[id]`-posten:

```typescript
    {
      route: 'karin/supplier-invoices',
      requires: 'owner-admin',
      why: 'Matchningskön för leverantörsfakturor utan projekt — samma ägare/admin-grind som resten av Karins yta. GET/PATCH rör inköpspriser och kan koppla en faktura mot vilket projekt som helst; en anställd ska inte kunna göra det obevakat.',
    },
```

Run: `npx playwright test tests/permission-contract.spec.ts --no-deps --project=chromium`
Expected: PASS, den nya raden bekräftar sig själv (kontraktsfacit läser sin egen array).

- [ ] **Steg 7: Commit**

```bash
git status
git add app/api/karin/supplier-invoices/route.ts tests/facit-karin-supplier-invoice-queue.spec.ts tests/permission-contract.spec.ts
git commit -m "feat(karin): matchningsko-API for leverantorsfakturor utan projekt"
```

---

### Task 3.2: UI — kön på Karins sida

**Files:**
- Modify: `app/dashboard/karin/page.tsx`
- Test: `tests/facit-karin-supplier-invoice-queue.spec.ts` (utökas)

- [ ] **Steg 1: Läs sidans befintliga struktur i sin helhet**

Läs `app/dashboard/karin/page.tsx` från rad 1 till slutet (filen är hanterlig, byggd 2026-08-07 och senast utökad med egna poster). Notera: `CalendarResponse`-typen (rad 38-46), hur `laddaKalender` hämtar och sätter state, hur "Lägg till"-modalen (från den nyligen byggda etapp) öppnas/stängs, och sidans generella layoutmönster (kort, rubriker, färgspråk) — den nya kön ska följa SAMMA visuella grammatik, inte introducera ett nytt UI-idiom.

- [ ] **Steg 2: Skriv det röda facit-testet**

```typescript
test.describe('Karin-sidan renderar leverantorsfaktura-kon', () => {
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', 'app/dashboard/karin/page.tsx'),
    'utf8',
  )

  test('sidan hamtar /api/karin/supplier-invoices', () => {
    expect(PAGE).toContain('/api/karin/supplier-invoices')
  })

  test('varje ko-rad har bade projekt- och leverantorsval', () => {
    expect(PAGE).toMatch(/project_id/)
    expect(PAGE).toMatch(/subcontractor_id/)
  })

  test('subcontractors-hamtningen ar fail-soft (feature-gated rutt)', () => {
    const idx = PAGE.indexOf('/api/subcontractors')
    expect(idx).toBeGreaterThan(-1)
    const around = PAGE.slice(idx, idx + 300)
    expect(around).toMatch(/catch/)
  })

  test('en matchad rad forsvinner ur kon (omhamtning eller lokal filtrering efter PATCH)', () => {
    const idx = PAGE.indexOf("method: 'PATCH'")
    expect(idx).toBeGreaterThan(-1)
    const around = PAGE.slice(Math.max(0, idx - 100), idx + 500)
    expect(around).toMatch(/laddaKalender|setQueue|filter\(/)
  })
})
```

- [ ] **Steg 3: Kör och verifiera rött**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts --no-deps --project=chromium -g "renderar leverantorsfaktura-kon"`
Expected: FAIL (4/4).

- [ ] **Steg 4: Bygg kön**

Lägg till en `SupplierInvoiceQueue`-sektion i `app/dashboard/karin/page.tsx`. Exakt placering (ovanför/under kalenderns "Kräver din uppmärksamhet"-lista) och komponentuppdelning avgörs av hur filen faktiskt ser ut efter Steg 1:s läsning — men KRAVEN är fasta:

- Egen `useState<QueueItem[]>` för kön, hämtad via `GET /api/karin/supplier-invoices` i samma `useEffect`/laddningsfunktion som kalendern, eller en egen parallell hämtning — välj det som stör minst i den befintliga laddningslogiken.
- Egen `useState`-hämtning av `subcontractors` (fail-soft mot 403, exakt samma mönster som Task 1.4:s `SupplierInvoiceModal`-tillägg — kopiera den `useEffect`-formen).
- Egen liten `projects`-hämtning (aktiva/nyliga projekt) för projektdropdownen — sök om sidan redan har en lista av projekt tillgänglig (den gör troligen inte, Karin-sidan är ekonomiadministrativ, inte projektcentrerad); om inte, en enkel `GET /api/projects?status=active` (verifiera att den rutten finns och stödjer statusfiltret innan den används — annars `GET /api/projects` orfiltrerat och filtrera klientsidan på `status !== 'completed'`).
- Varje kö-rad: leverantörsnamn, fakturadatum, belopp (`toLocaleString('sv-SE')` + ' kr', samma formattering som resten av filen redan använder — sök `toLocaleString` i filen och återanvänd samma anropsform), en `<select>` för projekt och en `<select>` för leverantör (registrerad UE eller "Annan leverantör" som avslöjar ett textfält), en "Koppla"-knapp som PATCH:ar och sedan tar bort raden ur lokal state (`setQueue(prev => prev.filter(q => q.id !== item.id))`) i stället för en full omladdning — snabbare känsla, samma mönster som andra optimistiska UI-uppdateringar i huset.
- Tomt-läge: om kön är tom, rendera INGENTING (ingen sektion alls) — samma "tystnad om det inte finns något att göra"-princip som resten av Karins sida redan följer (se filens egna "TRE LÖFTEN"-kommentar, rad 25-32).

- [ ] **Steg 5: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts --no-deps --project=chromium`
Expected: PASS (samtliga tester i filen, både API- och UI-delen).

- [ ] **Steg 6: `npx tsc --noEmit` + build**

Run: `npx tsc --noEmit` → 0 fel.
Run: `npx next build > buildlog.txt 2>&1; echo $LASTEXITCODE` → 0. Radera `buildlog.txt`.

- [ ] **Steg 7: Regressionskör hela Karin-sviten**

Run: `npx playwright test tests/karin-custom-events.spec.ts tests/permission-contract.spec.ts --no-deps --project=chromium`
Expected: PASS, ingen ny röd.

- [ ] **Steg 8: Commit**

```bash
git status
git add app/dashboard/karin/page.tsx tests/facit-karin-supplier-invoice-queue.spec.ts
git commit -m "feat(karin): matchningsko-UI for leverantorsfakturor utan projekt"
```

---

## Plan-status (fylls i under bygget)

- [ ] Etapp 1 pushad — `sql/v161_supplier_invoice_linking.sql` väntar på Andreas körning
- [ ] Etapp 2 pushad — `sql/v16X_supplier_invoice_fortnox.sql` väntar på Andreas körning (nummer bestäms vid byggtillfället)
- [ ] Etapp 3 pushad
- [ ] Fortnox-fältnamnen (Task 2.3, 2.4) verifierade mot live API-dokumentation
- [ ] Andreas har återanslutit Fortnox (nytt scope) för att testa importen skarpt
