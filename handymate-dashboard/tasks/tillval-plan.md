# Tillvalsrader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kryssbara tillvalsrader: hantverkaren markerar rader som tillval (med "Förvald"-toggle), kunden kryssar i/ur i portal/offertvy med live-total och signerar med sina val; servern räknar om totalen själv och stämplar valen juridiskt.

**Architecture:** Ny radtyp `option` i auktoritativa `quote_items` (sql/v66: CHECK-utökning + option_selected/option_default + quotes.signed_options JSONB). EN summa-sanning: `calculateQuoteTotals` räknar option-rader endast när valda. Rendering via befintlig itemType-branch i alla ytor. Kundval via befintliga publika GET/POST (portal-modalen delar redan endpoint).

**Tech Stack:** Next.js 14, Supabase, Playwright `--no-deps`. Spec: `tasks/tillval-spec.md`.

**Verifierade fakta (gissa ej):**
- CHECK:en är INLINE/icke-namngiven i `sql/quote_overhaul.sql:48` → Postgres auto-namn `quote_items_item_type_check`.
- `calculateQuoteTotals` (lib/quote-calculations.ts:29-95): `regularItems = filter(item_type==='item')` → for-loop summerar labor/material + rotWorkCost/rutWorkCost via `getItemRotRutType`; discount-rader summeras separat. `QuoteTotals`-fälten returneras (subtotal/vat/total/rot*/rut*).
- `QuoteItemType` union: lib/types/quote.ts:3. `QuoteItem` har is_rot_eligible/is_rut_eligible/rot_rut_type.
- `QuoteTemplateItem.itemType` (post offert-fix): 'item'|'heading'|'text'|'subtotal'|'discount' i lib/quote-templates/types.ts.
- Sign-POST: app/api/quotes/public/[token]/route.ts POST action 'sign' (~rad 170-199): guards (accepted/declined/expired) → update quotes {status, signed_at, signed_by_name, signed_by_ip, signature_data, accepted_at} → pipeline-move. GET:en returnerar redan `structured_items`.
- Portal-modalen (PortalQuoteSigningModal) har quote.sign_token och POST:ar till samma publika endpoint; PDF-länk finns sedan offert-fixen.
- from-quote (post-T6): total omräknas ENDAST för item_type==='item'; övriga behåller stored total.
- Editor: "Fler alternativ"-menyn i QuoteNewItemsSection.tsx:160-177 + QuoteEditItemsSection.tsx:173-178 (byte-identiska); fält-gating i ItemRow.tsx:97-98 (`item`+`discount` får qty/pris/ROT); `createDefaultItem` i lib/quote-calculations.ts:148-176.

**Deploy-ordning (grind):** Andreas kör `sql/v66` i Supabase FÖRE deploy — T4-skyddet failar högljutt på ogiltig item_type, så option-rader före migreringen = misslyckade sparningar.

---

### Task 1: Grunden — sql/v66 + typer + totals-motorn (TDD)

**Files:**
- Create: `sql/v66_quote_option_rows.sql`
- Modify: `lib/types/quote.ts` (union + fält), `lib/quote-calculations.ts` (totals + createDefaultItem + recalculateItems), `lib/quote-templates/types.ts` (itemType + optionSelected)
- Test: `tests/quote-options.spec.ts`

- [ ] **Step 1: sql/v66**

```sql
-- v66_quote_option_rows.sql — Tillvalsrader. Körs manuellt i Supabase FÖRE
-- deploy av tillvals-UI:t (quotes-API:t failar numera högljutt på ogiltig
-- item_type → option-rader före migreringen = misslyckade sparningar).
ALTER TABLE quote_items DROP CONSTRAINT IF EXISTS quote_items_item_type_check;
ALTER TABLE quote_items ADD CONSTRAINT quote_items_item_type_check
  CHECK (item_type IN ('item','heading','text','subtotal','discount','option'));
-- Kundens val (initieras från option_default vid skapande; skrivs vid signering)
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS option_selected BOOLEAN DEFAULT false;
-- Hantverkarens "Förvald"-toggle
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS option_default BOOLEAN DEFAULT false;
-- Juridiskt spår: valda/bortvalda tillval med belopp vid signeringsögonblicket
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_options JSONB;
```

- [ ] **Step 2: Failande tester** — `tests/quote-options.spec.ts`:

```typescript
/**
 * Tillvalsrader — enhetstester för totals-motorn (EN summa-sanning).
 * Körs: npx playwright test tests/quote-options.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { calculateQuoteTotals, createDefaultItem } from '../lib/quote-calculations'
import type { QuoteItem } from '../lib/types/quote'

function item(over: Partial<QuoteItem>): QuoteItem {
  return {
    id: 'x', item_type: 'item', description: 'Rad', quantity: 1, unit: 'st',
    unit_price: 1000, total: 1000, is_rot_eligible: false, is_rut_eligible: false,
    sort_order: 0, ...over,
  } as QuoteItem
}

test.describe('calculateQuoteTotals med tillval', () => {
  test('OVALT tillval räknas INTE i subtotal', () => {
    const t = calculateQuoteTotals([
      item({}),
      item({ item_type: 'option', option_selected: false, unit_price: 500, total: 500 }),
    ])
    expect(t.subtotal).toBe(1000)
  })
  test('VALT tillval räknas som vanlig rad', () => {
    const t = calculateQuoteTotals([
      item({}),
      item({ item_type: 'option', option_selected: true, unit_price: 500, total: 500 }),
    ])
    expect(t.subtotal).toBe(1500)
  })
  test('valt ROT-tillval ökar rotWorkCost; ovalt gör det inte', () => {
    const rotOpt = { item_type: 'option' as const, is_rot_eligible: true, rot_rut_type: 'rot' as const, unit_price: 2000, total: 2000 }
    const on = calculateQuoteTotals([item({ ...rotOpt, option_selected: true })])
    const off = calculateQuoteTotals([item({ ...rotOpt, option_selected: false })])
    expect(on.rotWorkCost).toBe(2000)
    expect(off.rotWorkCost).toBe(0)
  })
  test('tillval + rabattrad samspelar (rabatt dras, valt tillval adderas)', () => {
    const t = calculateQuoteTotals([
      item({ unit_price: 5000, total: 5000 }),
      item({ item_type: 'option', option_selected: true, unit_price: 1000, total: 1000 }),
      item({ item_type: 'discount', quantity: 1, unit_price: 500, total: -500 }),
    ])
    expect(t.subtotal).toBe(6000)
    expect(t.discountAmount).toBe(500)
    expect(t.afterDiscount).toBe(5500)
  })
  test('createDefaultItem(option): quantity 1, selected = default (false)', () => {
    const o = createDefaultItem('option')
    expect(o.item_type).toBe('option')
    expect(o.quantity).toBe(1)
    expect(o.option_selected).toBe(false)
    expect(o.option_default).toBe(false)
  })
})
```

- [ ] **Step 3: Kör → FAIL** (option_selected finns ej på typen / createDefaultItem saknar case)

- [ ] **Step 4: Implementera**

`lib/types/quote.ts`: `export type QuoteItemType = 'item' | 'heading' | 'text' | 'subtotal' | 'discount' | 'option'` + på `QuoteItem`: `option_selected?: boolean` och `option_default?: boolean` (JSDoc: kundens val resp. hantverkarens Förvald).

`lib/quote-calculations.ts` — i `calculateQuoteTotals`, ersätt regularItems-raden:

```typescript
  // Tillvalsrader räknas ENDAST när kunden (eller Förvald) bockat i dem —
  // EN summa-sanning för editor, previews och serverns omräkning vid signering.
  const selectedOptions = items.filter(i => i.item_type === 'option' && i.option_selected === true)
  const regularItems = [...items.filter(i => i.item_type === 'item'), ...selectedOptions]
```
(Resten av funktionen orörd — loopen hanterar därmed ROT/RUT/labor/material för valda tillval automatiskt.)

`createDefaultItem`: lägg case `'option'` → som item-defaults men `quantity: 1`, `option_selected: false`, `option_default: false`. `recalculateItems`: verifiera att den spreadar (behåller option-fälten) och beräknar `total = quantity*unit_price` även för option-rader (läs :181-195; om den specialbehandlar per typ — inkludera option som item där).

`lib/quote-templates/types.ts`: utöka `QuoteTemplateItemType` med `'option'` + lägg `optionSelected?: boolean` på `QuoteTemplateItem`.

- [ ] **Step 5: Kör tester → PASS (10 = 5×2) + tsc tomt. Commit:**
```bash
git add sql/v66_quote_option_rows.sql lib/types/quote.ts lib/quote-calculations.ts lib/quote-templates/types.ts tests/quote-options.spec.ts
git commit -m "feat(tillval): sql/v66 + option-radtyp i typer + totals raknar endast valda tillval"
```

---

### Task 2: Editorn — Tillval i menyn + Förvald-toggle

**Files:** Modify `app/dashboard/quotes/new/components/QuoteNewItemsSection.tsx:160-177`, `app/dashboard/quotes/[id]/edit/components/QuoteEditItemsSection.tsx:173-178`, `components/quotes/... ItemRow.tsx` (hitta exakt path via grep "ItemRow")

- [ ] **Step 1:** Läs ItemRow.tsx helt (fält-gating :97-98) + båda ItemsSections. De två sektionerna är byte-identiska — håll dem så (identiska ändringar i båda).
- [ ] **Step 2:** Lägg `{ type: 'option' as const, label: 'Tillval' }` i BÅDA "Fler alternativ"-listorna (efter Rubrik).
- [ ] **Step 3:** ItemRow: option-rader får SAMMA fält som item (beskrivning/antal/pris/ROT-dropdown — utöka gating-villkoret `item`+`discount` med `option`) PLUS en "Förvald"-toggle (liten checkbox/switch med label "Förvald" som sätter BÅDE `option_default` och `option_selected` via onChange-mönstret raden redan använder) och en synlig "Tillval"-badge (teal, liten) så raden skiljer sig. Följ radens exakta stilmönster.
- [ ] **Step 4:** Verifiera att spara-payloaden (new/page.tsx + edit/page.tsx buildPayload → quote_items-insert i app/api/quotes/route.ts) skickar/persisterar option_selected + option_default — API:ts insert mappar kolumner explicit (~route.ts:399-421 POST, PUT-motsvarigheten): LÄGG TILL de två kolumnerna i båda inserternas mappning.
- [ ] **Step 5:** tsc tomt + build ren + commit: `git add ... && git commit -m "feat(tillval): editor — Tillval-radtyp med Forvald-toggle, persisteras i quote_items"`

---

### Task 3: Rendering i alla ytor

**Files:** `lib/quote-templates/data-builder.ts`, `lib/quote-templates/{modern,premium,friendly}.ts`, `components/quotes/QuotePreview.tsx`, `components/quotes/editable/ModernCanvas.tsx`, `app/quote/[token]/page.tsx` (statisk del)

- [ ] **Step 1 (data-builder):** i mappningen (rad ~53-79): option-rader får `itemType: 'option'`, `optionSelected: i.option_selected === true`; de ingår i items-listan i ordning. Totals kommer redan från quotes-kolumnerna (skrivna av motorn) — ingen summaändring här.
- [ ] **Step 2 (3 mallar):** rendera option-rader som egen rad-stil med kryssruta-symbol: `optionSelected ? '☑' : '☐'` + "Tillval"-etikett + pris. På OSIGNERAD offert (data har `signedAt`? verifiera vilket fält data-builder exponerar — annars skicka med `isSigned` i QuoteTemplateData) visa not under tillvals-raderna: "Välj dina tillval i kundportalen innan du signerar." Escapa ALLT via escapeHtml (XSS-prejudikatet). Anpassa markup per mall (table/grid/cards) som offert-fixen gjorde.
- [ ] **Step 3 (Kompakt QuotePreview):** lägg `case 'option'` i rad-switchen (:274-309-området): kryss-symbol + pris, räknas ej i visade delsummor om ovald (verifiera att QuotePreview använder calculateQuoteTotals — den gör det per audit).
- [ ] **Step 4 (ModernCanvas/Live):** option-rad renderas som item-rad MED kryss-symbol + Tillval-badge, redigerbar som item (namn/pris), Förvald-state visas. (Live-canvasens items kommer från recalculated — itemType passeras redan sedan offert-fixen; utöka rad-branchen.)
- [ ] **Step 5 (publika sidans statiska switch):** interaktiviteten byggs i Task 4 — här: säkerställ att `case 'option'` finns i switchen så inget faller till default fel.
- [ ] **Step 6:** tsc + build + kör render-smoke-mönstret (scratchpad-script genom buildQuoteTemplateData + 3 mallar med option-rad vald/ovald + XSS-namn) + commit: `"feat(tillval): kryssbar rendering i alla ytor (previews, PDF-mallar, publika sidan)"`

---

### Task 4: Kundval + server-side omräkning vid signering

**Files:** `app/api/quotes/public/[token]/route.ts` (POST), `app/quote/[token]/page.tsx` (interaktivitet), `app/portal/[token]/components/PortalQuoteSigningModal.tsx`

- [ ] **Step 1 (sign-POST):** i action 'sign', EFTER guards, FÖRE quotes-updaten:

```typescript
    // ── Tillval: kundens val skrivs + servern räknar om totalen SJÄLV ──
    // (litar aldrig på klientens summa). selected_option_ids valideras mot
    // offertens egna option-rader — okända id:n → 400.
    const selectedOptionIds: string[] = Array.isArray(body.selected_option_ids)
      ? body.selected_option_ids.map(String) : []
    const { data: allRows } = await supabase
      .from('quote_items')
      .select('id, item_type, description, quantity, unit, unit_price, total, is_rot_eligible, is_rut_eligible, sort_order, option_selected, option_default')
      .eq('quote_id', quote.quote_id)
      .order('sort_order', { ascending: true })
    const optionRows = (allRows || []).filter(r => r.item_type === 'option')
    const validIds = new Set(optionRows.map(r => r.id))
    if (selectedOptionIds.some(id => !validIds.has(id))) {
      return NextResponse.json({ error: 'Ogiltiga tillval' }, { status: 400 })
    }
    let signedOptions: any[] | null = null
    let recomputed: ReturnType<typeof calculateQuoteTotals> | null = null
    if (optionRows.length > 0) {
      const chosen = new Set(selectedOptionIds)
      // Skriv kundens val per option-rad
      for (const r of optionRows) {
        await supabase.from('quote_items')
          .update({ option_selected: chosen.has(r.id) })
          .eq('id', r.id).eq('quote_id', quote.quote_id)
      }
      // Räkna om med EN summa-sanning
      const effectiveItems = (allRows || []).map(r => ({
        ...r,
        option_selected: r.item_type === 'option' ? chosen.has(r.id) : r.option_selected,
      }))
      recomputed = calculateQuoteTotals(effectiveItems as any, quote.discount_percent || 0, quote.vat_rate || 25)
      signedOptions = optionRows.map(r => ({
        id: r.id, name: r.description, total: r.total, selected: chosen.has(r.id),
      }))
    }
```

och utöka quotes-updaten med (endast när `recomputed` är satt — annars orörd):
`subtotal, total, rot_work_cost/rot_deduction/customer_pays (via rot/rut-fälten quotes redan har — VERIFIERA exakta kolumnnamn via grep i route-filen/audits: rot_work_cost, rot_deduction, customer_pays, rut-motsvarigheter), signed_options: signedOptions`. Import: `calculateQuoteTotals` från '@/lib/quote-calculations'. VERIFIERA att quote har discount_percent/vat_rate-kolumner (grep quotes-selecten/API:t; om de heter annat — använd verkliga namn; om de saknas, hämta från quotes.* som redan select:as med \*).

- [ ] **Step 2 (publika sidan):** lyft `structured_items` till state; option-rader renderas som togglebara (checkbox-rad, disabled när alreadySigned — visa då option_selected-läget); live-total = `calculateQuoteTotals` på klienten (importera samma funktion — den är ren) med togglat state; sign-anropet skickar `selected_option_ids`. ROT-visningen uppdateras från samma beräkning.
- [ ] **Step 3 (portal-modalen):** hämta `structured_items` via befintliga publika GET:en (`/api/quotes/public/${quote.sign_token}`) vid modal-öppning; om option-rader finns: rendera kryssbar tillvals-lista + live-total i steg 0 (ovanför PDF-länken, samma stilspråk); `sign()`-anropet skickar `selected_option_ids`. Inga nya portal-API-ytor.
- [ ] **Step 4:** tsc + build + 136 tester (alla sviter) + commit: `"feat(tillval): kunden valjer i portal/offertvy — server-side omrakning + signed_options"`

---

### Task 5: from-quote + slutverifiering

**Files:** `app/api/invoices/from-quote/route.ts`

- [ ] **Step 1:** i rad-mappningen (post-T6-brancherna): `option`-rader med `option_selected === true` mappas som **vanliga item-rader** på fakturan (recompute qty×pris, behåll ROT-flaggor); `option_selected !== true` → **exkluderas helt** (fortsätt/filtrera bort). Verifiera att billing-mattan (~:86-89) därmed räknar valda tillval som regularItems.
- [ ] **Step 2:** Full svit + build:
```bash
npx playwright test tests/quote-options.spec.ts tests/test-call.spec.ts tests/earned-autonomy.spec.ts tests/skv-rot-rut.spec.ts --no-deps 2>&1 | tail -2
npx tsc --noEmit 2>&1 | grep -v "^\.next/" | head -3
npx next build 2>&1 | tail -3
git add app/api/invoices/from-quote/route.ts && git commit -m "feat(tillval): from-quote fakturerar exakt kundens val"
```
- [ ] **Step 3 (deploy, gated):** Bekräfta att Andreas kört sql/v66 → `git push origin HEAD:main`.
- [ ] **Step 4 (manuellt facit, Andreas):** skapa offert med 2 tillval (ett Förvalt) → alla previews visar ☑/☐ → skicka → portal: kryssa i/ur, se live-total → signera → quotes-totals + signed_options uppdaterade → faktura innehåller exakt valen → PDF visar valen.

## Kända risker
1. Kolumnnamn i sign-omräkningens quotes-update (rot/rut/discount_percent/vat_rate) — VERIFIERAS i Task 4 mot verklig kod, gissas ej.
2. Klient-total på publika sidan använder samma rena calculateQuoteTotals → semantik-drift omöjlig; servern är ändå enda skrivaren.
3. Pre-v66-sparning failar högljutt (T4-skyddet) — deploy-grinden hanterar.
