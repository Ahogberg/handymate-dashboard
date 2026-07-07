# Produktbank + sammansatta produkter + visningsfilter — design-spec

_Datum: 2026-07-07 · STOPP 1 godkänd (utöka v12 + full konsolidering) · STOPP 2: schema-granskning pågår_
_Grund: tasks/produktbank-steg0.md (verifierat mot prod). Pilotkrav från Christoffer/Bee Service._

## Bärande beslut

1. **Utöka v12 `products`** — inte femte prissystemet. `quote_items.linked_product_id` (v47-FK) återanvänds.
2. **Snapshot-princip**: allt en offert behöver kopieras IN i quote_items-raden vid skapande.
   Produktändringar efteråt rör ALDRIG befintliga offerter. Referensen (`linked_product_id`)
   finns kvar enbart för spårbarhet/efterkalkyl.
3. **ROT på split, inte totalsumma**: raden bär `labor_amount`/`material_amount`; ROT-motorn
   läser arbetsandelen när den finns, annars exakt dagens beteende (bakåtkompatibelt).
4. **Del C återanvänder befintliga kolumner** (`detail_level`, `show_unit_prices`,
   `show_quantities`) — EN nivåväljare skriver koherenta kombinationer; alla renderare kopplas in.

---

## Schema — sql/v67_produktbank.sql

### 1. Kategorier (exakt 2 nivåer)

```sql
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES product_categories(id) ON DELETE CASCADE, -- NULL = huvudrubrik
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_categories_biz ON product_categories(business_id, parent_id);
```

2-nivåersregeln (en underrubrik kan inte själv ha barn) enforc:as i API:t (`parent.parent_id
IS NULL` krävs) + DB-trigger som backstopp:

```sql
CREATE OR REPLACE FUNCTION enforce_two_level_categories() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT parent_id FROM product_categories WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Max två kategorinivåer';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_two_level_categories BEFORE INSERT OR UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION enforce_two_level_categories();
```

### 2. products — utökning av v12

```sql
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_labor_share NUMERIC
    CHECK (default_labor_share IS NULL OR (default_labor_share >= 0 AND default_labor_share <= 1));

-- Artikelnr: v12:s befintliga sku-kolumn används. Unikt per business (case-insensitivt),
-- NULL tillåts (produkt utan artikelnr).
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique
  ON products (business_id, LOWER(sku)) WHERE sku IS NOT NULL;
```

Befintliga v12-fält som täcker Christoffers Del A rakt av: `name`, `sku` (artikelnr),
`unit`, `sales_price` (pris/enhet), `vat_rate` (moms), `rot_eligible`/`rut_eligible`,
`is_active`, `purchase_price` (framtida marginal — byggs inte nu), `is_favorite`.
Legacy-TEXT-kolumnen `category` ('material'/'arbete'/...) behålls orörd som typindikator
för enkla produkter (arbete → ROT-bas), hierarkin ligger i `category_id`.

`default_labor_share`: för ENKLA produkter utan komponenter — andel av priset som är
arbete (1.0 = rent arbete, 0 = rent material, 0.6 = blandat). Ger ROT-split även utan
komponentkalkyl. Sammansatta produkter härleder spliten från komponenterna i stället.

### 3. Komponenter (Del B — interna, expanderar aldrig till synliga rader)

```sql
CREATE TABLE IF NOT EXISTS product_components (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  component_type TEXT NOT NULL CHECK (component_type IN ('arbete', 'material')),
  description TEXT NOT NULL,                -- "Målningsarbete", "Grundfärg"
  quantity_per_unit NUMERIC NOT NULL DEFAULT 1,  -- 0.13 (tim per kvm), 0.2 (liter per kvm)
  unit TEXT NOT NULL DEFAULT 'st',          -- tim/l/kg/st — komponentens egen enhet
  unit_cost NUMERIC NOT NULL DEFAULT 0,     -- kr per komponentenhet (intern kalkyl)
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_components_product ON product_components(product_id);
```

Exempel Fasadmålning (450 kr/kvm, enhet kvm):
`{arbete, "Målningsarbete", 0.13, tim, 550}` + `{material, "Grundfärg", 0.1, l, 89}` +
`{material, "Täckfärg", 0.15, l, 105}`. Kalkylkostnad/kvm = 0.13×550 + 0.1×89 + 0.15×105
= 96,15 kr → marginal mot 450 kr synlig internt (framtida yta; lagras inte nu).
**Arbetsandel** = arbetskomponenternas kostnadsandel av totala komponentkostnaden
(71,5/96,15 ≈ 0,7436) → appliceras på radpriset för ROT-basen.

### 4. quote_items — snapshot-kolumner (Del B-kärnan)

```sql
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS labor_amount NUMERIC,        -- kr av radens total som är arbete
  ADD COLUMN IF NOT EXISTS material_amount NUMERIC,     -- kr av radens total som är material
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC,     -- kalkylerade timmar (efterkalkyl)
  ADD COLUMN IF NOT EXISTS component_snapshot JSONB,    -- fryst komponentlista vid skapande
  ADD COLUMN IF NOT EXISTS show_components_to_customer BOOLEAN DEFAULT false;
```

- `component_snapshot`: exakt kopia av product_components-raderna + produktens namn/sku/pris
  vid infogningsögonblicket. Offerten är juridiskt fristående från produktbanken.
- `labor_amount`/`material_amount`: **auktoritativa för ROT**. Invariant
  `labor_amount + material_amount = total` (valideras vid spara). Vid mängdändring i editorn
  räknas de om från snapshotens per-enhets-värden.
- `estimated_hours` = quantity × Σ(arbetskomponenters quantity_per_unit). Flödar in i
  befintliga `getQuoteBudgetDerivation` → `project.budget_hours` → jämförs mot time_entry.
  **Efterkalkyl-VYN byggs inte nu** (TD-loggad) — men kedjan bär datat från dag 1.
- `show_components_to_customer`: per-rad-override (default AV). PÅ → renderaren visar
  komponentbeskrivningarna (ej interna kostnader) som specifikation under raden.

### 5. ROT-motorn — ändring i lib/quote-calculations.ts

```
FÖRE (per rad): eligible → hela radens total räknas som arbete i ROT-basen
EFTER (per rad): eligible → (labor_amount ?? total) räknas i ROT-basen
```
Rader utan `labor_amount` (alla befintliga + fritext + AI-genererade) → `?? total` =
exakt dagens beteende. Noll migrering behövs. Samma ändring i server-omräkningen vid
signering och i `from-quote`-fakturaflödet (arbetsandelen följer med till fakturan
via befintliga rot_work_cost-fält).

### 6. Datamigrering (Bee + alla)

```sql
-- Christoffers 5 rader från price_list_items_v2 → products
INSERT INTO products (business_id, name, unit, sales_price, rot_eligible, rut_eligible, category, is_active)
SELECT business_id, name, unit, price, is_rot_eligible, is_rut_eligible,
       CASE WHEN unit IN ('tim','h') THEN 'arbete' ELSE 'övrigt' END, true
FROM price_list_items_v2
WHERE NOT EXISTS (
  SELECT 1 FROM products p
  WHERE p.business_id = price_list_items_v2.business_id
    AND LOWER(p.name) = LOWER(price_list_items_v2.name)
);
```
`price_lists_v2` (timpriser/påslag per kundsegment) behålls som kundprissättningslager —
rör inte. Tomma `price_list`-tabellen fasas ut ur offertflödet (kodändring, ingen DROP).

---

## Flöden

### Snabbsök i offertraden (Del A)
Rad-inmatningen får combobox: skriv artikelnr ELLER namn → dropdown (sku · namn ·
pris/enhet) från `GET /api/products?q=` (ILIKE på name+sku, is_active, max 8) → välj →
raden förfylls (beskrivning, enhet, à-pris, ROT-flagga, linked_product_id + snapshot +
split + timmar) → ange mängd → allt räknas om. Fritext förblir förstahandsvägen —
banken är ett tillägg, inget krav.

### Konsolidering
- `usePriceListLookup` → läser `products` (i stället för döda `price_list`)
- AI-promptens priskontext-fallback → `products`; kundspecifik `price_lists_v2` kvar som topp-prio
- settings/my-prices → ersätts av redirect till settings/products (produktbanks-UI:t)
- Agent-toolen `create_quote` (legacy JSONB) rörs INTE — fallback-vägen i motorn består

### Visningsfilter (Del C) — EN väljare, tre lägen
Editorn får "Vad ska kunden se?" med exakt tre val som skriver koherenta kombinationer:

| Läge | detail_level | show_quantities | show_unit_prices |
|---|---|---|---|
| Bara delsummor | `subtotals_only` | false | false |
| Rad för rad | `detailed` | false | false |
| Full detalj | `detailed` | true | true |

- Inga nya kolumner; omöjliga kombinationer kan inte längre skapas (väljaren är enda skrivvägen; gamla värden mappas vid läsning).
- **Delsummor grupperar på befintliga heading-rader** (offertens egna sektioner; produktbankens
  kategorinamn blir förslag på heading vid infogning). Saknas headings → en grupp
  ("Arbete och material") + totalsumman.
- **Kopplas in i ALLA renderare**: `lib/quote-templates/data-builder.ts` filtrerar
  rader/kolumner INNAN mallarna (modern/premium/friendly) får datat; public-API:t
  (`/api/quotes/public/[token]`) filtrerar server-side (kunden kan inte läsa dolda
  à-priser ur nätverkssvaret); portal-modalen + legacy-PDF läser samma sanning.
- **Alltid synligt oavsett läge**: totalsumma, moms, ROT/RUT-avdrag, att-betala, tillval
  (kryssrutorna visas alltid — de är kundens val). Filtret döljer detaljer, aldrig priset.
- Per-rad `show_components_to_customer` = undantag som visar EN rads komponentspec.
- Förhandsgranskningen (Slutdesign) visar exakt kundens vy — samma renderare.

### Sammansatt produkt i kundens dokument
Kunden ser: `Fasadmålning · 120 kvm × 450 kr — 54 000 kr`. Internt i editorn:
expanderbar komponentvy + arbete/material-split + kalkylerade timmar. ROT beräknas
på 54 000 × 0,7436 ≈ 40 156 kr (arbetsandelen), inte på 54 000.

---

## Ytor (implementation, efter STOPP 2)

1. **sql/v67_produktbank.sql** (Andreas kör manuellt)
2. **API/lib**: /api/products utökas (sök, kategorier, komponenter CRUD),
   snapshot-byggare `lib/products/build-item-snapshot.ts`, ROT-motoränd ringen,
   data-builder-filtret
3. **Produktbank-UI**: settings/products görs om — kategoriträd (2 nivåer),
   produktlista med komponentredigering, migrerings-banner
4. **Offert-snabbsök**: combobox i QuoteNewItemsSection + QuoteEditItemsSection,
   my-prices-omkopplingen
5. **Visningsfilter**: nivåväljare + rendering i data-builder/mallar/public/portal/PDF +
   server-side-filtrering

Varje steg: tsc 0 fel + ren build + enhetstester på split/snapshot/filter. Egen branch
`feat/produktbank` från main.

## Slutverifiering (Christoffers facit)
Kategori Målare→Utvändigt → produkt Fasadmålning 450 kr/kvm ROT med komponenter
(0.13 tim/kvm à 550 + grundfärg + täckfärg) → ny offert → sök "fasad" → 120 kvm →
(a) kunden ser EN rad 54 000 kr, (b) ROT på arbetsandelen (bas ≈ 40 156 kr → ≈ 12 047 kr),
inte 16 200, (c) tre visningslägen växlar i förhandsgranskning + PDF + portal,
(d) totalsumma + ROT alltid synliga, (e) befintliga/AI-offerter renderar oförändrat,
(f) höj produktpriset → offerten OFÖRÄNDRAD (snapshot).

## Avgränsning (bekräftad)
Inte: lagersaldo, marginalvyer, leverantörskoppling, CSV-import (TD), efterkalkyl-VY (TD),
>2 kategorinivåer. Rör inte execution-chain/approvals. AI-items-formatet bevaras.

## Addendum efter fullständig kartläggning (tredje agenten, 2026-07-07)

1. **Snabbsöken finns delvis redan**: `QuoteProductSearchModal` (_shared, används i både
   new- och edit-vyn) söker `/api/products` och skapar rader med sku→article_number +
   ROT-flaggor; "Spara i prislistan"-flödet skriver redan rader → products →
   `linked_product_id`. **Del A blir därmed:** (a) utöka API-söket till artikelnr
   (idag bara `ilike('name')`), (b) inline-combobox direkt i radens beskrivningsfält
   (Christoffers "skriv artikelnr eller namn → dropdown" — modalen kräver extra klick),
   (c) kategoristöd i modal + API, (d) snapshot/split/timmar vid val. Modalen behålls
   som bläddringsväg.
2. **Fjärde visningsflaggan**: `showCategorySubtotals` är klient-state (ej DB-kolumn) i
   edit-vyn + gamla QuotePreview. Nivåväljaren ersätter den — "Bara delsummor"-läget
   tar över jobbet; togglen tas bort ur UI:t (ingen DB-migrering behövs).
3. **AI-konverteringen bekräftad**: `convertLegacyItems` (quotes/new) mappar AI:ns
   `type:'labor'|'material'` → `item_type:'item'` + ROT-flaggor; agent-toolen skriver
   legacy-JSONB. Båda vägarna orörda av designen — motorns `?? total`-fallback täcker dem.

## TD-logg
- Efterkalkyl-vy: jämför estimated_hours (offert) mot time_entry per projekt — datamodellen klar
- CSV-import av produkter
- Marginalvy (purchase_price finns redan i v12)
- Kategoribaserad auto-gruppering av delsummor utan headings (v1: heading-rader styr)
