# Produktbank + visningsfilter — Steg 0-kartläggning

_Datum: 2026-07-07 · Verifierat mot prod-databasen (read-only) + koden. STOPP 1: väntar Andreas beslut._

## Chockfyndet: det finns FYRA parallella prissystem — tre är halvdöda

| System | Tabell | Data i prod | UI | Används i offertflödet? |
|---|---|---|---|---|
| "Mina priser" | `price_list` | **0 rader (alla businesses)** | settings/my-prices | Ja — quick-add i editorn + AI-fallback, men tabellen är TOM → syns aldrig |
| Prisstruktur v14 | `price_lists_v2` + `price_list_items_v2` | **LEVER — Christoffer har 2 listor, 5 rader** ("Minimidebitering": Arbete 650 kr/tim ROT, Servicebil, Leadkost, Admin) | settings/pricing | Bara som AI-promptkontext (kundspecifik prislista) — INTE i manuella editorn |
| Produktregister v12 | `products` | **0 rader (alla businesses)** | settings/products → /api/products | Nej — men `quote_items.linked_product_id` (v47) pekar hit, aldrig använd |
| Leverantörsprodukter v20 | `manual_supplier_products` | — | settings/pricelist | Nej (inköpssida, annat syfte) |

**Slutsats:** Christoffer har lagt SIN prisdata i v14-systemet (enda som har levande UI-koppling han hittat), men offert-editorns snabbval läser den tomma `price_list`-tabellen → han har aldrig sett funktionen. Detta förklarar direkt varför han ber om en produktbank — den finns i tre versioner men ingen är ihopkopplad.

## Vad quote_items REDAN har (förberedd men outnyttjad infrastruktur)

- `article_number` TEXT — finns, 0 av 75 rader använder
- `cost_price` NUMERIC — finns, aldrig använd
- `linked_product_id` TEXT → FK `products(id)` ON DELETE SET NULL (v47) — finns, aldrig använd
- `group_name` TEXT — finns, aldrig använd (headings används i stället: 5 rader)
- `item_type` CHECK: item/heading/text/subtotal/discount/option — headings + subtotal finns redan som sektionsstruktur
- `quote_categories` (v13): 12 systemkategorier med `rot_eligible`/`rut_eligible` + custom per business

**v12 `products`-tabellen har nästan exakt Del A-fälten:** name, sku (=artikelnr), category, unit, sales_price, purchase_price, vat_rate, rot_eligible/rut_eligible, is_active, is_favorite. Saknas: 2-nivåers kategorihierarki (category är idag bara TEXT 'material'/'arbete'/...), unikhetskrav på sku per business.

## ROT-beräkningen (för Del B-splitten)

Kedjan: per rad avgör `rot_rut_type` ('rot'/'rut') ELLER `unit IN ('tim','h')` ELLER `is_rot_eligible` → radens HELA total räknas som arbete → `rotWorkCost = SUM(...)` → `rotDeduction = MIN(rotWorkCost × 0.30, 50 000)` (`lib/quote-calculations.ts:47-78`). Årstak per person valideras server-side vid faktura (`lib/rot-rut-limits.ts`).

**En rad är 100 % arbete eller 100 % material — ingen partiell split finns.** Klumpsumme-raden ("Fasadmålning 54 000 kr" med 60/40-split) kräver ny mekanism: antingen nya kolumner på raden (t.ex. `labor_amount`/`material_amount` i snapshotten) eller härledning från komponenterna. Detta är kärnan i Del B.

## Visningsfälten (för Del C) — halvlevande

`detail_level` ('detailed'/'subtotals_only'/'total_only'), `show_unit_prices`, `show_quantities`:
- **SÄTTS** i offert-editorn + mall-editorn (levande UI)
- **HEDRAS** bara i legacy-HTML-routen `app/api/quotes/pdf/route.ts` (rad 322/508-548)
- **IGNORERAS** av nya mallsystemet (`lib/quote-templates/*` — det som Slutdesign + skickade dokumentet använder), portalens signeringsmodal och public-sidan

Prod-datan visar att Christoffer FAKTISKT provat: 1 offert med `total_only` + prices/qty av. Det bet inte på alla ytor → hans frustration är en verifierad bugg, inte bara en featureönskan. Christoffers tre lägen mappar dessutom 1:1 mot befintliga värdena: BARA DELSUMMOR=`subtotals_only`, RAD FÖR RAD=`detailed`+`show_unit_prices=false`, FULL DETALJ=`detailed`+allt på. **Del C = koppla in befintliga fält i ALLA renderare + en koherent nivåväljare** — inte nya kolumner.

## Offertskapandet + AI-kompatibilitet

- Manuellt: fritext-rader i `QuoteNewItemsSection`/`QuoteEditItemsSection`; "Snabbval från prislista"-knappar finns redan (läser tomma `price_list`) — ingen sök/autocomplete på artikelnr
- Editor sparar till `quote_items`-tabellen (auktoritativ sedan offert-fixvågen)
- AI-vägar: `ai-generate`/`from-photo` returnerar items till editor-state (kompatibla automatiskt); **agent-toolen `create_quote` (`app/api/agent/trigger/tool-router.ts:221`) skriver fortfarande legacy `items` JSONB** med `{description, quantity, unit_price, type:'labor'|'material'}` — får inte brytas; `calculateQuoteTotals` har redan JSONB-fallback
- AI-promptens priskontext (`lib/ai-quote-generator.ts:86`) läser kundens `price_lists_v2` + fallback `price_list`

## Tidskopplingen (Del B efterkalkyl-förberedelse)

Kedjan FINNS: quote accept → `createProjectFromQuote` sätter `project.quote_id` (9 projekt använder) → `time_entry.project_id` (11 poster) → dashboard-lönsamhet summerar `duration_minutes`. `project.budget_hours` härleds REDAN från offertens tim-rader vid accept (`lib/quotes/get-quote-budget-derivation.ts`). Efterkalkyl-förberedelsen = se till att produktens kalkylerade timmar hamnar i snapshotten så budget_hours-härledningen kan läsa den. Nästan gratis.

## FK-disciplin

Konvention sedan v61+: riktiga `REFERENCES ... ON DELETE CASCADE`. `quote_items→quotes` har FK, `linked_product_id→products` har FK (v47). Nya tabeller följer detta.

## Rekommendation (utöka vs nybygg per del)

- **DEL A: UTÖKA v12 `products`** — tabellen är byggd för exakt detta och `linked_product_id`-FK:n finns redan. Lägg till: kategoritabell (2 nivåer, FK), unik `sku` per business, koppla settings/products-UI:t. **Konsolidera:** migrera Christoffers 5 v14-rader in som produkter; `price_list`/my-prices fasas ut ur offertflödet (quick-add + AI-fallback pekas om). v14:s timpriser/påslag per kundsegment behålls som separat lager (kundprissättning ≠ produktbank).
- **DEL B: NYTT `product_components`** + snapshot-kolumner på `quote_items` (komponenter kopieras in i raden vid skapande; `labor_amount`/`material_amount` per rad driver ROT-basen; kalkyltimmar → budget_hours-härledningen). Enda genuint nya bygget.
- **DEL C: KOPPLA IN befintliga visningsfält** i nya mallsystemet + portalen + public-sidan (idag bara legacy-PDF). Inga nya kolumner — en nivåväljare i editorn som sätter koherenta kombinationer.

## Öppen fråga till Andreas (STOPP 1)

1. Bekräfta riktningen ovan (utöka v12 + nytt komponentlager + koppla in visningsfälten)?
2. Konsolideringen: OK att offertflödets prisuppslag pekas om från döda `price_list` till produktbanken, och att Christoffers 5 v14-rader migreras in? (my-prices-sidan kan sedan pensioneras — en produktbank, en sanning.)
