# Produktbank — implementationsplan (feat/produktbank)

> Byggkontrakt: tasks/produktbank-spec.md (inkl. addendum) + de FYRA TILLÄGGEN nedan.
> Subagent-driven: färsk implementer per commit + spec- och kvalitetsgranskning.
> Varje commit: `npx tsc --noEmit` 0 fel + `npx next build` grön. Lokala commits tills merge-STOPP.

## DE FYRA TILLÄGGEN (STOPP 2-granskningen — gäller över allt annat)

1. **KONFLIKTREGEL**: vid motsägelse research↔spec gäller SPECEN. `usePriceListLookup`
   migreras till `products` (artikelregistret), INTE `price_lists_v2` (kundprissättning —
   timpriser/påslag per segment, RÖRS EJ).
2. **HÄRLEDNINGSORDNING** (öres-invariant per konstruktion):
   `labor_amount = round2(total × arbetsandel)`; `material_amount = total − labor_amount`
   (härledd, aldrig egen beräkning). Invariant-validering vid spara = backstopp.
   `??` (nullish), ALDRIG `||` — `labor_share = 0` är giltigt (ren material), inte falsy.
3. **LÄS-MAPPNING** detail_level: `subtotals_only` → "Bara delsummor"; `total_only` →
   SAMMA läge. (Christoffers "Montering av handledare" ska äntligen rendera som avsett.)
4. **TD, byggs INTE nu**: AI/agent-normaliseringslager till quote_items → tasks/tech-debt.md.

---

## Commit 1 — SCHEMA: sql/v67_produktbank.sql

Exakt enligt spec §Schema: product_categories (+2-nivåers-trigger), products-utökningen
(category_id FK, default_labor_share CHECK 0–1, unikt sku-index per business LOWER),
product_components, quote_items-kolumnerna (labor_amount, material_amount,
estimated_hours, component_snapshot JSONB, show_components_to_customer BOOLEAN DEFAULT
false), migreringen price_list_items_v2→products (dubblettskydd via NOT EXISTS på
LOWER(name) per business). RLS på nya tabeller enligt v14-mönstret (service_role +
auth-policy). Alla statements idempotenta (IF NOT EXISTS / OR REPLACE).
**→ STOPP: Andreas kör mot prod, bekräftar innan slutverifiering (bygget fortsätter lokalt).**

## Commit 2 — API/LIB + MOTOR + TESTER

**Filer:** `app/api/products/route.ts` (ändra), `app/api/products/categories/route.ts` (ny),
`app/api/products/[id]/components/route.ts` (ny), `lib/products/build-item-snapshot.ts` (ny),
`lib/quote-calculations.ts` (ändra), `tests/product-snapshot.spec.ts` (ny),
`tests/rot-split.spec.ts` (ny).

- **Sök**: GET /api/products `search` → `.or('name.ilike.%q%,sku.ilike.%q%')` + ny param
  `category_id`. Svar utökas med `category_id`, `default_labor_share` och (vid
  `include=components`) komponenterna.
- **Kategorier-CRUD**: GET (träd: huvudrubriker + children), POST (kräver
  `parent.parent_id IS NULL` om parent_id sätts — 400 'Max två nivåer' annars), PATCH
  (namn/sort_order), DELETE (barn + produkter får category_id NULL via FK).
  Auth: `getAuthenticatedBusiness` (som befintliga products-routen).
- **Komponenter-CRUD**: GET/PUT per produkt (PUT ersätter hela listan atomiskt:
  delete + insert, validera component_type in ('arbete','material'), quantity_per_unit > 0).
- **Snapshot-byggaren** (`lib/products/build-item-snapshot.ts`, RENA funktioner):
  ```ts
  export interface SnapshotComponent { component_type: 'arbete'|'material'; description: string;
    quantity_per_unit: number; unit: string; unit_cost: number }
  export interface ItemSnapshotResult {
    component_snapshot: { product_id: string; product_name: string; sku: string|null;
      sales_price: number; components: SnapshotComponent[] } | null
    labor_share: number | null   // null = ingen split (legacy-beteende)
    labor_amount: number | null; material_amount: number | null
    estimated_hours: number | null
  }
  export function resolveLaborShare(components: SnapshotComponent[], defaultLaborShare: number|null|undefined): number|null {
    if (components.length > 0) {
      const cost = (c: SnapshotComponent) => c.quantity_per_unit * c.unit_cost
      const totalCost = components.reduce((s, c) => s + cost(c), 0)
      if (totalCost <= 0) return defaultLaborShare ?? null
      return components.filter(c => c.component_type === 'arbete').reduce((s, c) => s + cost(c), 0) / totalCost
    }
    return defaultLaborShare ?? null   // ?? — 0 är giltigt!
  }
  export function splitAmount(total: number, laborShare: number|null): { labor_amount: number|null; material_amount: number|null } {
    if (laborShare === null) return { labor_amount: null, material_amount: null }
    const labor = Math.round(total * laborShare * 100) / 100
    return { labor_amount: labor, material_amount: Math.round((total - labor) * 100) / 100 }  // härledd
  }
  export function estimateHours(components: SnapshotComponent[], quantity: number): number|null {
    const laborComponents = components.filter(c => c.component_type === 'arbete')
    if (laborComponents.length === 0) return null
    return quantity * laborComponents.reduce((s, c) => s + c.quantity_per_unit, 0)
  }
  export function buildItemSnapshot(product, components, quantity, rowTotal): ItemSnapshotResult
  ```
- **ROT-motorn** (`lib/quote-calculations.ts` calculateQuoteTotals): i ROT-bas-summan per
  berättigad rad: `rotBase += (item.labor_amount ?? itemTotal)` (och motsvarande RUT).
  QuoteItem-typen (`lib/types/quote.ts`) utökas med labor_amount/material_amount/
  estimated_hours/component_snapshot/show_components_to_customer (alla optional).
  Samma motor används av server-omräkningen vid signering (public sign-POST) och
  from-quote — verifiera att båda skickar med de nya fälten från quote_items-SELECT:en
  (lägg till kolumnerna i `.select()` där structured_items hämtas).
- **Invariant-backstopp**: i POST/PUT quotes-save: om labor_amount != null och
  |labor_amount + material_amount − total| > 0.01 → korrigera material_amount = total −
  labor_amount (logga console.warn, blockera inte).
- **Tester** (Playwright pure, `--no-deps`):
  - resolveLaborShare: komponentderivering (74%-fallet ur specen), tom lista + default 0.6,
    **default 0 → 0 (inte null!)**, undefined → null, totalCost 0 → fallback
  - splitAmount: (h) andel 1/3 på 999.99 → labor + material === total EXAKT;
    (g) share 0 → labor_amount === 0 (inte null), material === total; null → null/null
  - estimateHours: 120 kvm × 0.13 = 15.6; inga arbetskomponenter → null
  - ROT-motorn: rad med labor_amount 39960 av total 54000 eligible → bas 39960 →
    avdrag 11988; rad UTAN labor_amount → bas = total (legacy); labor_amount 0 → bas 0;
    blandade rader summerar rätt; RUT-motsvarigheten

## Commit 3 — PRODUKTBANK-UI

**Filer:** `app/dashboard/settings/products/page.tsx` (görs om),
`app/dashboard/settings/my-prices/page.tsx` (ersätts med redirect),
ev. delkomponenter i `app/dashboard/settings/products/components/`.

- Vänsterspalt: kategoriträd 2 nivåer (skapa/byt namn/ta bort, indragna underrubriker,
  "Alla produkter" + "Utan kategori" som filter). Högerspalt: produktlista (namn, sku,
  pris/enhet, ROT-badge, aktiv-toggle) filtrerad på vald kategori + sökfält.
- Produktkort/-modal: befintliga fält + kategori-dropdown (grupperad 2 nivåer) +
  default_labor_share-reglage ("Andel arbete: 0–100 %", visas bara när komponenter
  saknas) + **komponentsektion**: rader typ/beskrivning/mängd per enhet/enhet/kostnad,
  summering "Kalkylkostnad per {enhet}: X kr · Arbetsandel: Y %", spara via PUT
  components-routen.
- Migrerings-banner: om products är tom OCH price_list_items_v2 har rader för
  businessen → "Vi hittade N rader i din gamla prislista — importerade som produkter"
  (v67-migreringen gör jobbet; bannern läser bara resultatet, visas en gång via
  localStorage-flagga).
- my-prices/page.tsx → `redirect('/dashboard/settings/products')` (server-side).
  Sidebar/settings-länkar till my-prices pekas om (`app/dashboard/settings/page.tsx:1638`).
- Svenska, teal, mobilanpassat. INGA engelska termer.

## Commit 4 — OFFERT-SNABBSÖK

**Filer:** `app/dashboard/quotes/_shared/QuoteRowProductCombo.tsx` (ny),
`QuoteNewItemsSection.tsx` + `QuoteEditItemsSection.tsx` (ändra),
`app/dashboard/quotes/_shared/QuoteProductSearchModal.tsx` (kategoristöd),
`app/dashboard/quotes/_shared/usePriceListLookup.ts` (→ products),
new/page.tsx + edit/page.tsx (koppla förfyllningen).

- **Inline-combobox**: i radens beskrivningsfält — när användaren skriver ≥2 tecken,
  debounced (250 ms) GET /api/products?search=q (name+sku), dropdown under fältet:
  `{sku} · {namn} · {pris} kr/{enhet}` (max 8). Pil/Enter/Escape-navigering. Välj →
  förfyll rad: description=namn, unit, unit_price=sales_price, article_number=sku,
  ROT/RUT-flaggor, linked_product_id, **+ buildItemSnapshot** (hämta komponenter via
  include=components) → labor_amount/material_amount/estimated_hours/component_snapshot.
  Mängdändring efteråt → räkna om split/timmar från snapshotens per-enhets-data
  (labor_share ligger i snapshot-resultatet — spara labor_share-värdet i
  component_snapshot så omräkningen inte behöver API:t).
  Fritext förblir förstahandsvägen: ingen dropdown förrän träffar finns, aldrig blockerande.
- **Modalen**: kategori-dropdown överst (GET categories-trädet), filtrerar sökningen.
  Vid välj: samma förfyllnings-väg som combon (dela hjälpfunktion `applyProductToItem`).
- **usePriceListLookup** → läser `products` (is_active) i stället för döda `price_list`
  (TILLÄGG 1: INTE price_lists_v2). "Snabbval"-knapparna (8 st) visar favoriter först
  (is_favorite), sen namn. AI-fallback-kontexten i ai-generate-routen pekas också om
  price_list → products (name/unit/sales_price/category-mappning i buildPriceContext-
  anropet — formatet PriceListItem behålls, bara källan byts).
- Spara-vägen: POST/PUT quotes skriver de nya radfälten till quote_items (+ i
  `.select()`-listorna vid läsning: edit-load, public GET, from-quote, sign-POST).

## Commit 5 — VISNINGSFILTER

**Filer:** `app/dashboard/quotes/[id]/edit/components/QuoteEditDisplaySettingsSection.tsx`
(nivåväljare), motsvarande i new-vyn, `lib/quote-templates/types.ts` + `data-builder.ts` +
`modern.ts`/`premium.ts`/`friendly.ts`, `app/api/quotes/public/[token]/route.ts`,
`app/portal/[token]/components/PortalQuoteSigningModal.tsx`, `app/quote/[token]/page.tsx`,
`app/api/quotes/pdf/route.ts` (läs-mappning), `components/quotes/QuotePreview.tsx`
(showCategorySubtotals bort).

- **Nivåväljaren** "Vad ska kunden se?" — tre radioval (Bara delsummor / Rad för rad /
  Full detalj) som skriver koherent per specens tabell. LÄS-mappning (TILLÄGG 3):
  `subtotals_only` OCH `total_only` → "Bara delsummor"; `detailed` + show_unit_prices →
  "Full detalj"; `detailed` utan → "Rad för rad". Skrivning använder ENDAST
  subtotals_only/detailed (total_only skrivs aldrig mer).
  Exportera mappningen som ren funktion `lib/quotes/display-level.ts`:
  `resolveDisplayLevel(quote) → 'summary'|'rows'|'full'` + `displayLevelToColumns(level)`.
  ALLA renderare använder dessa två — en sanning.
- **data-builder.ts**: läser quote.detail_level/show_* → `resolveDisplayLevel` →
  filtrerar/transformerar items INNAN mallarna: 'summary' → ersätt rader med
  gruppsummor per heading (rader utan heading → grupp "Arbete och material";
  tillvalsrader visas ALLTID som egna rader — kundens val); 'rows' → rader utan
  quantity/unit_price-kolumner (radtotal kvar); 'full' → allt. Mallarna får
  `displayLevel` + kolumnflaggor i QuoteTemplateData och renderar villkorat.
- **Public-API:t**: GET filtrerar structured_items SERVER-SIDE efter samma funktion —
  'summary' → gruppsummor + tillval (med option-fälten), aldrig råa à-priser i svaret;
  'rows' → strippa unit_price/quantity från items i svaret (behåll total per rad).
  OBS: sign-POST:ens omräkning använder ALLTID fulla rader server-side (påverkas ej).
  `calculatePublicQuoteTotals`-flödet för tillval måste fortsätta fungera i alla lägen —
  tillvalsraderna behåller därför sina belopp i svaret.
- **Portalen + public-sidan**: rendera efter samma nivådata (gruppsummor/rader).
  **Alltid synligt**: totalsumma, moms, ROT/RUT, att-betala, tillvals-kryssrutor.
- **Legacy-PDF-routen**: byt intern logik till resolveDisplayLevel (total_only-mappningen).
- **showCategorySubtotals**: bort ur edit-UI + QuotePreview (nivåväljaren äger jobbet).
- **Per-rad-override**: show_components_to_customer=true → radens komponentbeskrivningar
  (description + mängd/enhet, ALDRIG unit_cost) som spec-lista under raden i
  mallarna/public/portal, oavsett nivå.
- **Slutdesign-förhandsvisningen** använder data-buildern → visar automatiskt kundens vy.
- Tester: `tests/display-level.spec.ts` — mappningstabellen (inkl. total_only→summary),
  kolumnflaggor, gruppsummering per heading (belopp + utan-heading-fallback),
  tillval-alltid-synliga.

## Slutverifiering (rapportera per punkt — särskilt (g) och (i))

Setup enligt STOPP 2-direktivet (Målare→Utvändigt, Fasadmålning 450 kr/kvm ROT,
0.13 tim/kvm à 550 + grundfärg 0.1 l à 89 + täckfärg 0.15 l à 105 → kalkylkostnad/kvm
= 71.50 + 8.90 + 15.75 = 96.15 kr, arbetsandel 71.5/96.15 ≈ 0.7436; 120 kvm):
(a) EN rad 54 000 kr · (b) ROT-bas = round2(54 000 × 0.7436...) = 40 156.01 →
avdrag ≈ 12 046.80 (exakta värden från splitAmount — INTE 16 200) · (c) tre lägen i förhandsgranskning +
PDF + portal + public-API · (d) totalsumma/ROT alltid synliga · (e) befintliga + AI-
offerter oförändrade · (f) prisändring → offert oförändrad (snapshot) · (g)
default_labor_share=0 → labor_amount=0 → ROT-bas EXAKT 0 · (h) 1/3-andel på ojämnt
belopp → labor+material=total exakt · (i) REGRESSION "Montering av handledare"
(quote_pd9u4o1gz, total_only) → renderar som Bara delsummor i ALLA ytor.
(b)-notering: specens exempel ~39 960/11 988 använde avrundad 0.74 — facit är den
oavrundade andelen; verifieringen godkänner splitAmount-värdet, inte spec-exemplets.

STOPP: efter Commit 1 (Andreas kör v67 mot prod) och efter slutverifieringen
(Andreas godkänner merge till main). Bygget fortsätter lokalt på branchen mellan stoppen.

## Avgränsning (upprepning)
Rör INTE execution-chain/approvals. AI-items-formatet bevaras (convertLegacyItems +
agent-toolens legacy-JSONB orörda). Inte: lager, marginalvyer, CSV-import,
efterkalkyl-VY, >2 nivåer, price_lists_v2-ändringar.
