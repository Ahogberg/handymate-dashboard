# Matchningsförslag + navigationsplacering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. Detta repo arbetar INTE i egna långlivade worktrees för utveckling (delad arbetskatalog-disciplin) — varje etapp körs i en isolerad Agent-worktree (`isolation: "worktree"`), mergas och pushas av kontrollsessionen efteråt, inte av etappagenten själv. `git status` före varje commit, stagea specifika filer, aldrig `git add -A`.

**Goal:** Ge Karins matchningskö en deterministisk förslagsmotor baserad på leverantörshistorik, och ge leverantörsfakturor + underentreprenörer en tydlig, nåbar plats i navigationen.

**Architecture:** Två oberoende etapper (ingen filöverlapp). Etapp 1 (Matchningsförslag) rör `lib/karin/`, `app/api/karin/supplier-invoices/route.ts` och `app/dashboard/karin/page.tsx`. Etapp 2 (Navigation) rör en ny fil `app/dashboard/supplier-invoices/page.tsx` och `components/Sidebar.tsx`. Körs parallellt av två subagenter.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres), Playwright (facit-idiom, `--no-deps`).

**Specs:**
- `docs/superpowers/specs/2026-08-20-leverantorsfaktura-matchningsforslag-design.md`
- `docs/superpowers/specs/2026-08-20-leverantorsfaktura-underentreprenor-navigation-design.md`

---

## Etapp 1: Matchningsförslag

### Task 1.1: Ren förslagsfunktion

**Files:**
- Create: `lib/karin/supplier-invoice-match.ts`
- Test: `tests/facit-supplier-invoice-match.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-supplier-invoice-match.spec.ts
import { test, expect } from '@playwright/test'
import { suggestMatch, type MatchedInvoice } from '../lib/karin/supplier-invoice-match'

test.describe('suggestMatch', () => {
  test('tom historik → inget förslag', () => {
    const result = suggestMatch('Bauhaus AB', [])
    expect(result.project_id).toBeNull()
    expect(result.subcontractor_id).toBeNull()
  })

  test('en tidigare koppling (under tröskeln) → inget förslag', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
    ]
    const result = suggestMatch('Bauhaus AB', history)
    expect(result.project_id).toBeNull()
  })

  test('exakt två tidigare kopplingar mot samma projekt → förslag med count 2', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
    ]
    const result = suggestMatch('Bauhaus AB', history)
    expect(result.project_id).toBe('proj_1')
    expect(result.project_match_count).toBe(2)
  })

  test('tre kopplingar mot samma projekt → förslag med count 3', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
    ]
    const result = suggestMatch('Bauhaus AB', history)
    expect(result.project_match_count).toBe(3)
  })

  test('två projekt med 2+ träffar vardera → tvetydigt, inget förslag', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Beijer Bygg', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_2', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_2', subcontractor_id: null },
    ]
    const result = suggestMatch('Beijer Bygg', history)
    expect(result.project_id).toBeNull()
  })

  test('ett projekt med 2+ och ett annat med bara 1 → inte tvetydigt, föreslår det starka', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Snickeri AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Snickeri AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Snickeri AB', project_id: 'proj_2', subcontractor_id: null },
    ]
    const result = suggestMatch('Snickeri AB', history)
    expect(result.project_id).toBe('proj_1')
  })

  test('projekt och UE beräknas oberoende av varandra', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Elfirman', project_id: 'proj_1', subcontractor_id: 'sub_1' },
      { supplier_name: 'Elfirman', project_id: 'proj_1', subcontractor_id: null },
    ]
    const result = suggestMatch('Elfirman', history)
    expect(result.project_id).toBe('proj_1')
    expect(result.project_match_count).toBe(2)
    expect(result.subcontractor_id).toBeNull()
    expect(result.subcontractor_match_count).toBe(0)
  })

  test('andra leverantörers historik påverkar inte förslaget', () => {
    const history: MatchedInvoice[] = [
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Bauhaus AB', project_id: 'proj_1', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_9', subcontractor_id: null },
      { supplier_name: 'Beijer Bygg', project_id: 'proj_9', subcontractor_id: null },
    ]
    const result = suggestMatch('Bauhaus AB', history)
    expect(result.project_id).toBe('proj_1')
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-supplier-invoice-match.spec.ts --no-deps --project=chromium`
Expected: FAIL — modulen finns inte.

- [ ] **Steg 3: Skriv `lib/karin/supplier-invoice-match.ts`**

```typescript
/**
 * Matchningsförslag för leverantörsfaktura-kön (Karins sida). Ren,
 * deterministisk funktion — ingen DB, inget nätverk. Samma idiom som
 * lib/fortnox/map-supplier-invoice.ts.
 *
 * Regel (docs/superpowers/specs/2026-08-20-leverantorsfaktura-matchningsforslag-design.md):
 * föreslå ett projekt/UE bara om leverantören kopplats till EXAKT en
 * kandidat minst 2 gånger förut, och ingen annan kandidat också har 2+
 * träffar. Annars: inget förslag. Tystnad är alltid ett giltigt utfall.
 */

export interface MatchedInvoice {
  supplier_name: string | null
  project_id: string | null
  subcontractor_id: string | null
}

export interface MatchSuggestion {
  project_id: string | null
  project_match_count: number
  subcontractor_id: string | null
  subcontractor_match_count: number
}

function topUnambiguousCandidate(ids: (string | null)[]): { id: string | null; count: number } {
  const counts = new Map<string, number>()
  for (const id of ids) {
    if (!id) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }

  const qualifying = [...counts.entries()].filter(([, count]) => count >= 2)
  if (qualifying.length !== 1) {
    return { id: null, count: 0 }
  }

  const [id, count] = qualifying[0]
  return { id, count }
}

export function suggestMatch(supplierName: string, matchedInvoices: MatchedInvoice[]): MatchSuggestion {
  const sameSupplier = matchedInvoices.filter(inv => inv.supplier_name === supplierName)

  const project = topUnambiguousCandidate(sameSupplier.map(inv => inv.project_id))
  const subcontractor = topUnambiguousCandidate(sameSupplier.map(inv => inv.subcontractor_id))

  return {
    project_id: project.id,
    project_match_count: project.count,
    subcontractor_id: subcontractor.id,
    subcontractor_match_count: subcontractor.count,
  }
}
```

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-supplier-invoice-match.spec.ts --no-deps --project=chromium`
Expected: PASS (8/8)

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Commit**

```bash
git add lib/karin/supplier-invoice-match.ts tests/facit-supplier-invoice-match.spec.ts
git commit -m "feat(karin): suggestMatch - ren forslagsmotor for leverantorsfaktura-matchning"
```

---

### Task 1.2: Koppla in förslagsmotorn i GET-rutten

**Files:**
- Modify: `app/api/karin/supplier-invoices/route.ts`
- Test: `tests/facit-karin-supplier-invoice-queue.spec.ts` (utökas)

- [ ] **Steg 1: Skriv det röda facit-testet**

Lägg till i `tests/facit-karin-supplier-invoice-queue.spec.ts` (filen finns redan, har `fs`/`path` importerade högst upp):

```typescript
test.describe('GET /api/karin/supplier-invoices — matchningsforslag', () => {
  const ROUTE = fs.readFileSync(
    path.join(__dirname, '..', 'app/api/karin/supplier-invoices/route.ts'),
    'utf8',
  )

  test('GET importerar och anvander suggestMatch', () => {
    expect(ROUTE).toContain("from '@/lib/karin/supplier-invoice-match'")
    expect(ROUTE).toContain('suggestMatch(')
  })

  test('historikfragan filtrerar pa project_id IS NOT NULL', () => {
    const getBlock = ROUTE.slice(ROUTE.indexOf('export async function GET'), ROUTE.indexOf('export async function PATCH'))
    expect(getBlock).toMatch(/\.not\(['"]project_id['"],\s*['"]is['"],\s*null\)/)
  })

  test('svaret bar suggested_project_id och suggested_subcontractor_id', () => {
    const getBlock = ROUTE.slice(ROUTE.indexOf('export async function GET'), ROUTE.indexOf('export async function PATCH'))
    expect(getBlock).toContain('suggested_project_id')
    expect(getBlock).toContain('suggested_subcontractor_id')
  })

  test('tom ko hoppar over historikfragan (ingen anledning att fraga i onodan)', () => {
    const getBlock = ROUTE.slice(ROUTE.indexOf('export async function GET'), ROUTE.indexOf('export async function PATCH'))
    expect(getBlock).toMatch(/queue\.length > 0/)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts --no-deps --project=chromium -g "matchningsforslag"`
Expected: FAIL (4/4).

- [ ] **Steg 3: Skriv om GET-funktionen**

Ersätt hela `export async function GET(request: NextRequest) { ... }`-funktionen i `app/api/karin/supplier-invoices/route.ts` med:

```typescript
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

    const queue = data || []

    // Matchningsförslag (2026-08-20, docs/superpowers/specs/
    // 2026-08-20-leverantorsfaktura-matchningsforslag-design.md): beräknat
    // från leverantörens egen historik. Tom kö → hoppa över historik-
    // frågan helt, ingen anledning att fråga i onödan.
    let queueWithSuggestions: Array<Record<string, unknown>> = queue.map(item => ({
      ...item,
      suggested_project_id: null,
      suggested_project_name: null,
      suggested_project_match_count: 0,
      suggested_subcontractor_id: null,
      suggested_subcontractor_name: null,
      suggested_subcontractor_match_count: 0,
    }))

    if (queue.length > 0) {
      const { data: matchedData, error: matchedError } = await supabase
        .from('supplier_invoices')
        .select('supplier_name, project_id, subcontractor_id')
        .eq('business_id', business.business_id)
        .not('project_id', 'is', null)

      if (matchedError) throw matchedError

      const matchedInvoices: MatchedInvoice[] = matchedData || []
      const suggestions = queue.map(item => suggestMatch(item.supplier_name || '', matchedInvoices))

      const projectIds = [...new Set(suggestions.map(s => s.project_id).filter((id): id is string => !!id))]
      const subcontractorIds = [...new Set(suggestions.map(s => s.subcontractor_id).filter((id): id is string => !!id))]

      const [projectNamesResult, subcontractorNamesResult] = await Promise.all([
        projectIds.length > 0
          ? supabase.from('project').select('project_id, name').in('project_id', projectIds)
          : Promise.resolve({ data: [] as { project_id: string; name: string }[] }),
        subcontractorIds.length > 0
          ? supabase.from('subcontractor').select('subcontractor_id, name').in('subcontractor_id', subcontractorIds)
          : Promise.resolve({ data: [] as { subcontractor_id: string; name: string }[] }),
      ])

      const projectNameById = new Map((projectNamesResult.data || []).map(p => [p.project_id, p.name]))
      const subcontractorNameById = new Map((subcontractorNamesResult.data || []).map(s => [s.subcontractor_id, s.name]))

      queueWithSuggestions = queue.map((item, i) => {
        const s = suggestions[i]
        return {
          ...item,
          suggested_project_id: s.project_id,
          suggested_project_name: s.project_id ? (projectNameById.get(s.project_id) ?? null) : null,
          suggested_project_match_count: s.project_match_count,
          suggested_subcontractor_id: s.subcontractor_id,
          suggested_subcontractor_name: s.subcontractor_id ? (subcontractorNameById.get(s.subcontractor_id) ?? null) : null,
          suggested_subcontractor_match_count: s.subcontractor_match_count,
        }
      })
    }

    return NextResponse.json({ queue: queueWithSuggestions })
  } catch (error: any) {
    console.error('Get karin supplier-invoice queue error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

Lägg till importen högst upp i filen, direkt efter den befintliga `import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'`-raden:

```typescript
import { suggestMatch, type MatchedInvoice } from '@/lib/karin/supplier-invoice-match'
```

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts --no-deps --project=chromium -g "matchningsforslag"`
Expected: PASS (4/4).

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Regressionskör hela filen (PATCH-testerna och Etapp 3:s tidigare tester ska förbli gröna)**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts --no-deps --project=chromium`
Expected: PASS, ingen ny röd.

- [ ] **Steg 7: Commit**

```bash
git add app/api/karin/supplier-invoices/route.ts tests/facit-karin-supplier-invoice-queue.spec.ts
git commit -m "feat(karin): GET-svaret innehaller matchningsforslag per ko-rad"
```

---

### Task 1.3: UI — förifyllda dropdowns + motivering

**Files:**
- Modify: `app/dashboard/karin/page.tsx`
- Test: `tests/facit-karin-supplier-invoice-queue.spec.ts` (utökas)

- [ ] **Steg 1: Skriv det röda facit-testet**

Lägg till:

```typescript
test.describe('LeverantorsfakturaRad — forifyllda forslag', () => {
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', 'app/dashboard/karin/page.tsx'),
    'utf8',
  )

  test('SupplierInvoiceQueueItem-interfacet har de sex nya faltet', () => {
    const ifaceStart = PAGE.indexOf('interface SupplierInvoiceQueueItem')
    const ifaceEnd = PAGE.indexOf('\n}', ifaceStart)
    const block = PAGE.slice(ifaceStart, ifaceEnd)
    for (const field of [
      'suggested_project_id', 'suggested_project_name', 'suggested_project_match_count',
      'suggested_subcontractor_id', 'suggested_subcontractor_name', 'suggested_subcontractor_match_count',
    ]) {
      expect(block).toContain(field)
    }
  })

  test('projectId-state initieras fran item.suggested_project_id', () => {
    expect(PAGE).toContain("useState(item.suggested_project_id || '')")
  })

  test('subcontractorId-state initieras fran item.suggested_subcontractor_id', () => {
    expect(PAGE).toContain("useState(item.suggested_subcontractor_id || '')")
  })

  test('motiveringstext renderas villkorligt pa match_count', () => {
    expect(PAGE).toContain('suggested_project_match_count')
    expect(PAGE).toContain('Föreslaget')
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts --no-deps --project=chromium -g "forifyllda forslag"`
Expected: FAIL (4/4).

- [ ] **Steg 3: Utöka `SupplierInvoiceQueueItem`-interfacet**

I `app/dashboard/karin/page.tsx`, ändra:

```typescript
/** En rad i leverantörsfaktura-matchningskön (Etapp 3, sql/supplier_invoices). */
interface SupplierInvoiceQueueItem {
  id: string
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number | null
  fortnox_supplier_invoice_number: string | null
  created_at: string
}
```

till:

```typescript
/** En rad i leverantörsfaktura-matchningskön (Etapp 3, sql/supplier_invoices). */
interface SupplierInvoiceQueueItem {
  id: string
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number | null
  fortnox_supplier_invoice_number: string | null
  created_at: string
  // Matchningsförslag (2026-08-20) — se lib/karin/supplier-invoice-match.ts
  suggested_project_id: string | null
  suggested_project_name: string | null
  suggested_project_match_count: number
  suggested_subcontractor_id: string | null
  suggested_subcontractor_name: string | null
  suggested_subcontractor_match_count: number
}
```

- [ ] **Steg 4: Förifyll dropdownarna i `LeverantorsfakturaRad`**

Ändra:

```typescript
  const [projectId, setProjectId] = useState('')
  const [subcontractorId, setSubcontractorId] = useState('')
```

till:

```typescript
  const [projectId, setProjectId] = useState(item.suggested_project_id || '')
  const [subcontractorId, setSubcontractorId] = useState(item.suggested_subcontractor_id || '')
```

- [ ] **Steg 5: Lägg till motiveringstexten**

I samma komponent, direkt efter den stängande `</div>` för `flex flex-col sm:flex-row gap-2`-raden (dropdownarna + Koppla-knappen) och innan den yttre `</div>` som stänger hela kortet, lägg till:

```typescript
      {item.suggested_project_match_count > 0 && (
        <p className="text-[12px] text-slate-400 mt-2 mb-0">
          Föreslaget projekt — kopplad hit {item.suggested_project_match_count} gånger förut
        </p>
      )}
      {item.suggested_subcontractor_match_count > 0 && (
        <p className="text-[12px] text-slate-400 mt-0.5 mb-0">
          Föreslagen underentreprenör — kopplad hit {item.suggested_subcontractor_match_count} gånger förut
        </p>
      )}
```

- [ ] **Steg 6: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts --no-deps --project=chromium -g "forifyllda forslag"`
Expected: PASS (4/4).

- [ ] **Steg 7: `npx tsc --noEmit`**

Expected: 0 fel.

---

### Task 1.4: Regression + build

**Files:** inga nya — verifieringssteg.

- [ ] **Steg 1: Kör hela den utökade filen**

Run: `npx playwright test tests/facit-karin-supplier-invoice-queue.spec.ts tests/facit-supplier-invoice-match.spec.ts --no-deps --project=chromium`
Expected: PASS, alla gröna.

- [ ] **Steg 2: Regressionskör Etapp 3:s och behörighetskontraktets tidigare tester**

Run: `npx playwright test tests/karin-custom-events.spec.ts tests/permission-contract.spec.ts --no-deps --project=chromium`
Expected: PASS, ingen ny röd (ingen ny rutt eller grind i denna etapp — GET-svaret har bara nya fält).

- [ ] **Steg 3: `npx tsc --noEmit` + `npx next build`**

Run: `npx tsc --noEmit` → 0 fel.
Run: `npx next build 2>&1 | Tee-Object -FilePath buildlog.txt; echo $LASTEXITCODE` (PowerShell) → 0. Radera `buildlog.txt` efteråt.

- [ ] **Steg 4: Commit**

```bash
git add app/dashboard/karin/page.tsx tests/facit-karin-supplier-invoice-queue.spec.ts
git commit -m "feat(karin): forifyllda matchningsforslag i ko-radens dropdowns"
```

---

## Etapp 2: Navigationsplacering

### Task 2.1: Ny översiktssida för leverantörsfakturor

**Files:**
- Create: `app/dashboard/supplier-invoices/page.tsx`
- Test: `tests/facit-supplier-invoices-page.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-supplier-invoices-page.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const PAGE_PATH = path.join(__dirname, '..', 'app/dashboard/supplier-invoices/page.tsx')

test.describe('app/dashboard/supplier-invoices/page.tsx', () => {
  test('sidan finns', () => {
    expect(fs.existsSync(PAGE_PATH)).toBe(true)
  })

  test('anropar /api/supplier-invoices utan project_id-parameter', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    expect(src).toContain("fetch('/api/supplier-invoices')")
  })

  test('renderar en lank till Karins ko for rader utan projekt', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    expect(src).toContain('/dashboard/karin')
    expect(src).toContain('Ej kopplad')
  })

  test('subcontractors-hamtningen ar fail-soft', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    const idx = src.indexOf('/api/subcontractors')
    expect(idx).toBeGreaterThan(-1)
    const around = src.slice(idx, idx + 300)
    expect(around).toMatch(/catch/)
  })

  test('sidan ar see_financials-gated via PermissionGate', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    expect(src).toContain('permission="see_financials"')
  })

  test('forfallen status harleds av due_date, inte ett lagrat DB-varde', () => {
    const src = fs.readFileSync(PAGE_PATH, 'utf8')
    expect(src).toMatch(/function displayStatus/)
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-supplier-invoices-page.spec.ts --no-deps --project=chromium`
Expected: FAIL — filen finns inte.

- [ ] **Steg 3: Skriv sidan**

```typescript
// app/dashboard/supplier-invoices/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Search } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { PermissionGate } from '@/components/PermissionGate'

interface SupplierInvoice {
  id: string
  supplier_name: string
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number
  status: 'unpaid' | 'paid' | 'invoiced'
  project_id: string | null
  subcontractor_id: string | null
}

interface ProjectOption {
  project_id: string
  name: string
}

interface SubcontractorOption {
  subcontractor_id: string
  name: string
}

type DisplayStatus = 'unpaid' | 'overdue' | 'paid'

/**
 * Härleder klientsidan om en obetald faktura är förfallen — supplier_invoices
 * har ingen egen 'overdue'-status lagrad i databasen (bara unpaid/paid/
 * invoiced), samma princip som Fortnox-importens mappning använder
 * (lib/fortnox/map-supplier-invoice.ts).
 */
function displayStatus(inv: SupplierInvoice): DisplayStatus {
  if (inv.status === 'paid') return 'paid'
  if (inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) return 'overdue'
  return 'unpaid'
}

const STATUS_LABEL: Record<DisplayStatus, string> = {
  unpaid: 'Obetald',
  overdue: 'Förfallen',
  paid: 'Betald',
}

const STATUS_BADGE_CLASS: Record<DisplayStatus, string> = {
  unpaid: 'bg-slate-100 text-slate-600',
  overdue: 'bg-red-50 text-red-700',
  paid: 'bg-green-50 text-green-700',
}

function SupplierInvoicesPageContent() {
  const business = useBusiness()
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | DisplayStatus>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!business.business_id) return

    fetch('/api/supplier-invoices')
      .then(r => r.json())
      .then(d => setInvoices(d.invoices || []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false))

    fetch('/api/projects')
      .then(r => (r.ok ? r.json() : { projects: [] }))
      .then(d => setProjects(d.projects || []))
      .catch(() => setProjects([]))

    // Fail-soft: /api/subcontractors är feature-gated ('subcontractors'-
    // planfunktionen) — ett konto utan den ska bara visa inget UE-namn,
    // aldrig ett fel. Samma mönster som Karins matchningskö.
    fetch('/api/subcontractors?status=active')
      .then(r => (r.ok ? r.json() : { subcontractors: [] }))
      .then(d => setSubcontractors(d.subcontractors || []))
      .catch(() => setSubcontractors([]))
  }, [business.business_id])

  const projectNameById = new Map(projects.map(p => [p.project_id, p.name]))
  const subcontractorNameById = new Map(subcontractors.map(s => [s.subcontractor_id, s.name]))

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && displayStatus(inv) !== statusFilter) return false
    if (search.trim() && !inv.supplier_name.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Leverantörsfakturor</h1>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök leverantör…"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | DisplayStatus)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
        >
          <option value="all">Alla statusar</option>
          <option value="unpaid">Obetald</option>
          <option value="overdue">Förfallen</option>
          <option value="paid">Betald</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500">
          Inga leverantörsfakturor matchar filtret.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => {
            const status = displayStatus(inv)
            const projectName = inv.project_id ? projectNameById.get(inv.project_id) : null
            const subcontractorName = inv.subcontractor_id ? subcontractorNameById.get(inv.subcontractor_id) : null

            return (
              <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-slate-900 truncate m-0">{inv.supplier_name}</h3>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-500 m-0 truncate">
                    {inv.invoice_date || 'Datum saknas'}
                    {inv.invoice_number && ` · Fakturanr ${inv.invoice_number}`}
                    {subcontractorName && ` · ${subcontractorName}`}
                  </p>
                  {projectName ? (
                    <Link href={`/dashboard/projects/${inv.project_id}`} className="text-[13px] text-primary-700 hover:underline">
                      {projectName}
                    </Link>
                  ) : (
                    <Link href="/dashboard/karin" className="text-[13px] text-amber-600 hover:underline">
                      Ej kopplad — matcha i kön
                    </Link>
                  )}
                </div>
                <span className="font-heading text-sm font-bold text-slate-900 whitespace-nowrap shrink-0">
                  {inv.total_amount.toLocaleString('sv-SE')} kr
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SupplierInvoicesPage() {
  return (
    <PermissionGate permission="see_financials">
      <SupplierInvoicesPageContent />
    </PermissionGate>
  )
}
```

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-supplier-invoices-page.spec.ts --no-deps --project=chromium`
Expected: PASS (6/6).

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Commit**

```bash
git add app/dashboard/supplier-invoices/page.tsx tests/facit-supplier-invoices-page.spec.ts
git commit -m "feat(supplier-invoices): ny samlad oversiktssida for leverantorsfakturor"
```

---

### Task 2.2: Nav-poster i Sidebar.tsx

**Files:**
- Modify: `components/Sidebar.tsx`
- Test: `tests/facit-sidebar-supplier-nav.spec.ts`

- [ ] **Steg 1: Skriv det röda facit-testet**

```typescript
// tests/facit-sidebar-supplier-nav.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const SIDEBAR = fs.readFileSync(
  path.join(__dirname, '..', 'components/Sidebar.tsx'),
  'utf8',
)

test.describe('Sidebar — leverantörsfakturor och underentreprenörer', () => {
  test('Leverantörsfakturor-posten finns i jobs-gruppen', () => {
    const jobsStart = SIDEBAR.indexOf("key: 'jobs'")
    const jobsEnd = SIDEBAR.indexOf('],', jobsStart)
    const block = SIDEBAR.slice(jobsStart, jobsEnd)
    expect(block).toContain("href: '/dashboard/supplier-invoices'")
  })

  test('Underentreprenörer-posten finns i jobs-gruppen med featureGate subcontractors', () => {
    const jobsStart = SIDEBAR.indexOf("key: 'jobs'")
    const jobsEnd = SIDEBAR.indexOf('],', jobsStart)
    const block = SIDEBAR.slice(jobsStart, jobsEnd)
    expect(block).toMatch(/href: '\/dashboard\/subcontractors'[\s\S]{0,40}featureGate: 'subcontractors'/)
  })

  test('/dashboard/supplier-invoices är dold för anställda (HIDDEN_CHILDREN_FOR_EMPLOYEE)', () => {
    const hiddenIdx = SIDEBAR.indexOf('HIDDEN_CHILDREN_FOR_EMPLOYEE = new Set([')
    const hiddenEnd = SIDEBAR.indexOf('])', hiddenIdx)
    const block = SIDEBAR.slice(hiddenIdx, hiddenEnd)
    expect(block).toContain("'/dashboard/supplier-invoices'")
  })

  test('/dashboard/subcontractors är INTE i HIDDEN_CHILDREN_FOR_EMPLOYEE (planbaserad grind räcker)', () => {
    const hiddenIdx = SIDEBAR.indexOf('HIDDEN_CHILDREN_FOR_EMPLOYEE = new Set([')
    const hiddenEnd = SIDEBAR.indexOf('])', hiddenIdx)
    const block = SIDEBAR.slice(hiddenIdx, hiddenEnd)
    expect(block).not.toContain("'/dashboard/subcontractors'")
  })
})
```

- [ ] **Steg 2: Kör och verifiera rött**

Run: `npx playwright test tests/facit-sidebar-supplier-nav.spec.ts --no-deps --project=chromium`
Expected: FAIL (4/4).

- [ ] **Steg 3: Lägg till nav-posterna**

I `components/Sidebar.tsx`, ändra `jobs`-gruppens `children`-array (rad 111-118) från:

```typescript
    type: 'group', key: 'jobs', label: 'Jobb', icon: Briefcase,
    children: [
      { label: 'Offerter', href: '/dashboard/quotes' },
      { label: 'Projekt', href: '/dashboard/projects' },
      { label: 'Fakturor', href: '/dashboard/invoices' },
      { label: 'ROT/RUT till Skatteverket', href: '/dashboard/invoices/rot-payment' },
      { label: 'Dokument', href: '/dashboard/documents' },
    ],
```

till:

```typescript
    type: 'group', key: 'jobs', label: 'Jobb', icon: Briefcase,
    children: [
      { label: 'Offerter', href: '/dashboard/quotes' },
      { label: 'Projekt', href: '/dashboard/projects' },
      { label: 'Fakturor', href: '/dashboard/invoices' },
      // Leverantörsfakturor (2026-08-20): tidigare bara synliga per projekt
      // eller i Karins matchningskö (bara de okopplade) — ingen samlad vy
      // fanns. see_financials-skyddad data, samma döljregel som Fakturor.
      { label: 'Leverantörsfakturor', href: '/dashboard/supplier-invoices' },
      // Underentreprenörer (2026-08-20): sidan (app/dashboard/subcontractors)
      // fanns redan sedan tidigare men var helt orphanad — ingen länk till
      // den existerade någonstans i appen.
      { label: 'Underentreprenörer', href: '/dashboard/subcontractors', featureGate: 'subcontractors' },
      { label: 'ROT/RUT till Skatteverket', href: '/dashboard/invoices/rot-payment' },
      { label: 'Dokument', href: '/dashboard/documents' },
    ],
```

Ändra `HIDDEN_CHILDREN_FOR_EMPLOYEE`-raden (rad 583) från:

```typescript
  const HIDDEN_CHILDREN_FOR_EMPLOYEE = new Set(['/dashboard/invoices', '/dashboard/invoices/rot-payment', '/dashboard/settings', '/dashboard/settings/my-prices', '/dashboard/settings/products', '/dashboard/settings/pricelist', '/dashboard/billing', '/dashboard/team', '/dashboard/automations', '/dashboard/settings/quote-templates', '/dashboard/settings/quote-texts', '/dashboard/orders', '/dashboard/campaigns', '/dashboard/website', '/dashboard/analytics'])
```

till:

```typescript
  const HIDDEN_CHILDREN_FOR_EMPLOYEE = new Set(['/dashboard/invoices', '/dashboard/supplier-invoices', '/dashboard/invoices/rot-payment', '/dashboard/settings', '/dashboard/settings/my-prices', '/dashboard/settings/products', '/dashboard/settings/pricelist', '/dashboard/billing', '/dashboard/team', '/dashboard/automations', '/dashboard/settings/quote-templates', '/dashboard/settings/quote-texts', '/dashboard/orders', '/dashboard/campaigns', '/dashboard/website', '/dashboard/analytics'])
```

(`/dashboard/subcontractors` läggs INTE till här — se spec, planbaserad `featureGate`-spärr räcker, UE-kontaktinfo är inte `see_financials`-skyddad data.)

- [ ] **Steg 4: Kör och verifiera grönt**

Run: `npx playwright test tests/facit-sidebar-supplier-nav.spec.ts --no-deps --project=chromium`
Expected: PASS (4/4).

- [ ] **Steg 5: `npx tsc --noEmit`**

Expected: 0 fel.

- [ ] **Steg 6: Commit**

```bash
git add components/Sidebar.tsx tests/facit-sidebar-supplier-nav.spec.ts
git commit -m "feat(nav): leverantorsfakturor och underentreprenorer synliga i Jobb-gruppen"
```

---

### Task 2.3: Regression + build

**Files:** inga nya — verifieringssteg.

- [ ] **Steg 1: Kör hela etappens tester**

Run: `npx playwright test tests/facit-supplier-invoices-page.spec.ts tests/facit-sidebar-supplier-nav.spec.ts --no-deps --project=chromium`
Expected: PASS, alla gröna.

- [ ] **Steg 2: Regressionskör behörighetskontraktet**

Run: `npx playwright test tests/permission-contract.spec.ts --no-deps --project=chromium`
Expected: PASS, ingen ny röd (ingen ny API-rutt eller ändrad grind — sidan återanvänder `GET /api/supplier-invoices` som redan är `see_financials`-gated och redan registrerad).

- [ ] **Steg 3: `npx tsc --noEmit` + `npx next build`**

Run: `npx tsc --noEmit` → 0 fel.
Run: `npx next build 2>&1 | Tee-Object -FilePath buildlog.txt; echo $LASTEXITCODE` (PowerShell) → 0. Radera `buildlog.txt` efteråt.

---

## Plan-status (fylls i under bygget)

- [ ] Etapp 1 (Matchningsförslag) pushad
- [ ] Etapp 2 (Navigation) pushad
- [ ] Ingen ny migration i denna omgång — inga SQL-filer att köra manuellt
