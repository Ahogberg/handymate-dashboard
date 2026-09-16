# Artiklar, offertmallar och ROT på arbetsdelen — brief till Codex

> Claude, 2026-09-16, efter Andreas fråga om artikelsystemet, offertmallarna och ROT-redovisningen, och
> Christoffers förslag att bryta ner varje artikel i arbete, material och resor. Beslut med Andreas samma dag:
> delningen ligger **inuti raden** (en kundrad per artikel), Claude skriver brief, Codex bygger.
> Underlag från Christoffer: "Article Breakdown for ROT-Compliant Quoting" (byggs nu, invävt i §1 och §4) samt
> "Work-Type Categorization" och "Staged Timeline" (framtida faser, registrerade i §11, byggs inte nu).
> Migrationen `sql/v252_line_split_travel.sql` är utkastad och bevisad i PGlite (§6, 29/29). Samma regler som
> övriga briefer: handoff-block under §10, Claude granskar mot orkestreringens §6 A + B + D.

## 0. Varför

Skatteverket ger ROT (och RUT) bara på **arbetskostnaden**, aldrig på material, resor eller utrustning. 2026:
30 % av arbetskostnaden inklusive moms, högst 50 000 kr per person och år, ROT + RUT tillsammans högst
75 000 kr. Arbetskostnaden ska framgå separat av fakturan. Vid fast pris godtas en skälig fördelning, men den
ska gå att motivera. (Den tillfälliga höjningen till 50 % gällde 12 maj–31 december 2025; koden räknar 30 %
utan datumlogik, vilket är rätt för 2026. 2025-fakturor räknades alltså med 30 %, det åtgärdas inte här.)

I dag, verifierat i kod och produktion 2026-09-16:

| Läge | Fakta |
|---|---|
| Artiklar ↔ offerter | Kopplade: `quote_items.linked_product_id` (v47), produktväljare i `QuoteBuilder` via `applyProductToItem.ts` som fryser `component_snapshot` och sätter `labor_amount`/`material_amount`. 29 företag, 24 har artiklar (2 075, nästan alla seedade), 31 av 122 offertrader har länkad artikel, **10** rader har `labor_amount > 0`. `product_components` (v67) har **0 rader**. |
| Delningen | Finns i schemat (`products.default_labor_share`, `quote_items.labor_amount/material_amount`, `quote_categories.rot_eligible`) men är frivillig. Ingen resa-del på raden. `category_slug` följer inte med till fakturan; fakturaraden har ingen resa-flagga. |
| ROT-motorn | Rätt på offertsidan: `lib/rot-rut.ts` `rotRutDeductionInclVat` = min(arbete ex moms × 1,25 × 30 %, tak), `lib/quote-calculations.ts:204-210` använder `labor_amount ?? radtotal`. **Fel på sex ställen** (§1 punkt 2). Produktion: 5 av 8 ROT-offerter har kvoten avdrag/arbetskostnad = 0,30 (legacy-grenen utan momsuppräkning), 3 har 0,375 (rätt). |
| Mallar | 45 mallar hos 8 företag, 3 med `job_type_slug`, **2** offerter av 39 har använt en mall. 14 jobbtyper hos 3 företag. Branschmallarna som seedas vid finalize saknar `job_type_slug`, så jobbtypsstarten (`lib/quotes/job-type-start.ts`) kan inte använda dem. |
| Agenter | `lib/quotes/quote-generation-context.ts` läser artiklar, mallar och jobbtyp; tool-routerns `create_quote` namnmatchar artiklar men rör inte mallar och ger raderna ingen delning. |

## 1. Claude-beslut

| Beslut | Varför |
|---|---|
| **En rad per artikel, obligatorisk delning i raden.** `labor_amount + material_amount + travel_amount = total` för varje `item`-rad i offert och faktura, låst med CHECK `quote_items_split_sum` efter backfill. Kunden ser en rad; dokumentet visar "varav arbetskostnad X kr"; `show_components_to_customer` fäller ut raden i Arbete / Material / Resa när kunden vill se det. | Christoffers modell i sak, men hantverkaren slipper redigera tre rader per artikel. Skatteverket kräver att arbetskostnaden framgår, inte att varje rad delas. |
| **ROT-basen är alltid Σ `labor_amount` över berättigade rader, via en enda funktion.** `lib/rot-rut-basis.ts` (flyttad ut ur `quote-to-invoice-items.ts`) med `rotRutLaborBasis(items, type)` och `splitLine(total, laborShare, travelShare)`. De sex ställena nedan anropar den, följt av `rotRutDeductionInclVat` och årstaket i `lib/rot-rut-limits.ts`: (a) `lib/invoice-calculations.ts:23-27`, (b) `app/api/quotes/route.ts:424-428` och `:907-911`, (c) `lib/agreements/invoice-visit.ts:126-127`, (d) `app/api/agent/trigger/tool-router.ts:891-893, 1001`, (e) `app/api/invoices/from-quote/route.ts:125-134` och `lib/invoices/project-invoice-draft.ts:234-240`, (f) `components/invoices/ProjectInvoiceModal.tsx:131,148-149`. | Ett ställe att ha rätt på. (a) är Andreas fall på fakturan, där Skatteverket tittar. (f) gör i dag varje tidpost ROT-berättigad, även Restid, Material, Möte och Admin (`components/time/TimeEntryModal.tsx:45-51`). |
| **Tidposter är arbete bara när de är arbete.** `work` → `labor_amount = total`; `travel` → `travel_amount = total`, aldrig ROT; `material_pickup`, `meeting`, `admin` → material respektive 0 ROT-bas. | Restid är resa, inte arbete. |
| **Artikeln bär delningen.** `products.default_travel_share` (ny, default 0) bredvid `default_labor_share`, summa ≤ 1 (`products_share_sum_check`); resten är material. `product_components.component_type` får `'resa'`. Komponenter är den normala vägen att sätta delningen, inte en dold funktion. | `resolveLaborShare` i `lib/products/build-item-snapshot.ts` härleder redan andelen ur komponenterna; den får en tvilling för resa. |
| **Raderna under artikeln är redigerbara per offert och har ett delat schema.** En komponent är en rad med namn, artikelnummer, enhet, antal, à-pris ut och självkostnad, av typen arbete, material eller resa, hur många som helst per typ. Den kan hämtas ur katalogen (`linked_product_id`) eller skrivas på plats för just den offerten, och en fritt skriven rad kan sparas tillbaka till katalogen. I offerten lever raderna i `component_snapshot` (frysta vid infogning, redigerbara där); när rader finns är de auktoritativa: radens total = Σ antal × à-pris, och arbete/material/resa = Σ per typ. Artikelns andelar är reservvägen för artiklar utan rader. Artikelns namn, prisvisning och reservationstext ändras inte. | Christoffers underlag, ordagrant: nedbrytningen ska vara rader med samma schema, inte en procentsats. Andelarna finns kvar för de 2 000 seedade artiklarna tills någon skrivit rader. |
| **Varje rad bär en egen ROT-flagga**, `is_rot_eligible`, som default följer typen (arbete → sant) men kan slås av, och som CHECK förbjuder på material och resa. ROT-basen är Σ radbelopp med flaggan satt. | Christoffers krav: logiken ska hålla om reglerna ändras, utan att typen ensam avgör. Att flaggan aldrig kan sättas på material eller resa är det Skatteverket kräver i dag. |
| **Kostnad mot utpris per artikel.** Artikelvyn i offerten visar Σ självkostnad (antal × `unit_cost`) och Σ utpris (antal × `unit_price`) över raderna, alltså marginalen per artikel. `quotes.expected_margin_snapshot` fortsätter bära offertens helhet. | Christoffers underlag. Självkostnaden fanns redan på komponenten; utpriset saknades. |
| **`rot_work_cost`/`rut_work_cost` (ex moms) skrivs på varje fakturaväg.** `lib/invoices/create-invoice.ts:210-212` får dem ur `rotRutLaborBasis`, inte bara `from-project`-vägen. | Skatteverket-filen (`lib/skv/validate-rot-request.ts:146-154`), kärnans kund/Skatteverket-delning (`sql/v238:192-228` via `customer_pays`/`rot_rut_deduction`) och Fortnox ska utgå från samma tal. |
| **Fortnox: en blandad rad delas vid export.** Fortnox sätter `HouseWork` på hela radbeloppet, så en rad med `0 < labor_amount < total` exporteras som en HouseWork-rad (arbete) och en vanlig rad (material + resa) via ny `splitRowsForHouseWork` i fakturamapparen; `isHouseWorkRow` returnerar false när `labor_amount = 0` även om raden är flaggad. Bara fakturor som inte redan synkats. | Annars får Fortnox och därmed Skatteverket ROT på material. |
| **Backfill med snäv heuristik, aldrig omräkning av skickade offerter.** Kategori → enhet → ROT/RUT-flagga → material (se §3). `rot_deduction` på befintliga offerter skrivs inte om; nytt värde vid nästa sparning. `quote_templates.job_type_slug` backfillas inte (v187: uttryckligt val, ingen namngissning); seedningen sätter den framåt i kod. | Historik är historik. Ett fel i en skickad offert rättas av människan som skickar nästa version. |
| **Jobbtypsmallen är standardstarten.** `seedQuoteTemplates` ger varje branschmall en `job_type_slug` och säkrar jobbtypen via `ensureOnboardingJobTypes`; `qstd_*`-raderna bär artikelns delning; "Ny offert" förvalet är jobbtypsstart när företaget har jobbtyper (vanliga vägen finns kvar); agenternas offertkontext föredrar jobbtypsmallens rader och varje genererad rad får en delning via `splitLine` innan den sparas. | Mallen är bara värd något om den är startpunkten. 2 av 39 offerter i dag. |
| **Ändras inte.** Kärnans eventkontrakt och receivable-delning, `calculateQuoteTotals` signatur (bara additivt `travelTotal`), `rotRutDeductionInclVat` och taken, NUMERIC kronor i dessa tabeller, `quotes.items`-JSON (2 legacy-offerter läser den, rörs inte). | |

## 2. Läs först

`sql/v67_produktbank.sql` (delningens ursprung och snapshot-principen), `lib/products/build-item-snapshot.ts`
(öres-invariant härledning: `material = total − labor`), `lib/quote-calculations.ts:195-260`,
`lib/invoice-calculations.ts`, `lib/invoices/quote-to-invoice-items.ts` (`rotRutLaborBasis` som ska flytta),
`lib/rot-rut.ts` + `lib/rot-rut-limits.ts`, `lib/fortnox/housework.ts`, `lib/skv/validate-rot-request.ts`,
`lib/quotes/job-standard-server.ts` + `lib/quotes/job-type-start.ts` + `lib/quotes/hydrate-standard-products.ts`,
`lib/quote-template-defaults.ts` (`seedQuoteTemplates`), `lib/quotes/quote-generation-context.ts`,
testerna i §6 som redan pinnar beteendet (`rot-split`, `rot-moms-facit`, `rot-instruktion`, `quote-to-invoice-mapper`).

## 3. Migrationen — `sql/v252_line_split_travel.sql`

Utkastad, idempotent, inte körd. Codex får ändra den; varje ändring av CHECK-villkoret eller backfill-ordningen
behöver en rad i handoffen.

| Del | Gör |
|---|---|
| `products.default_travel_share` | Ny, `0–1`, default 0; `products_share_sum_check`: labor + travel ≤ 1. Backfill: `arbete` utan andel → 1; `material`/`hyra` utan andel → 0; artiklar vars namn börjar på `resa`, `resor`, `restid`, `framkörning`, `servicebil`, `milersättning`, `utkörning` → resa 1, arbete 0, `rot_eligible = false` (snäv lista: `res%` träffar reservdelar). |
| `product_components` | `component_type IN ('arbete','material','resa')`; nya `article_number`, `unit_price` (à-pris ut, bredvid `unit_cost`), `linked_product_id` → `products`, `is_rot_eligible` (backfill: sant för arbete) med CHECK `product_components_rot_only_labour`. |
| `quote_items.travel_amount` | Ny. Backfill A: rader med `labor_amount` får `material = total − labor − travel`, `travel = 0`. Backfill B, rader utan: `arbete_*` → arbete; `resa` → resa; `material_*`/`hyra`/`ue`/`ovrigt` → material; timenhet → arbete; ROT/RUT-flaggad → arbete; annars material. `quote_items_split_sum` läggs `NOT VALID` och valideras direkt (produktion: 0 rader avviker i dag, 137 rader totalt). Rubrik-, text-, delsumme- och rabattrader är undantagna. |
| `quotes.travel_total` | Ny, default 0, backfillad som Σ `travel_amount` per offert. |

## 4. Scope, i fasordning

```text
Fas 1 — SQL
  sql/v252_line_split_travel.sql                   (utkast; §3)
  lib/account/radera.ts                            (inga nya tabeller; kontoraderingsvakten ska vara grön)
  tests/column-contract.spec.ts                    (travel_amount, default_travel_share, travel_total finns i sql/)

Fas 2 — delad ROT-bas + de sex rättningarna
  lib/rot-rut-basis.ts                             (rotRutLaborBasis, splitLine; re-export från quote-to-invoice-items.ts)
  lib/invoice-calculations.ts                      (a: labor_amount ?? radtotal, som offertmotorn; travelTotal)
  app/api/quotes/route.ts                          (b: legacy-grenen borttagen, samma motor som PUT/POST-huvudvägen; travel_total)
  lib/agreements/invoice-visit.ts                  (c)
  app/api/agent/trigger/tool-router.ts             (d; create_quote-rader får delning från matchad artikel)
  app/api/invoices/from-quote/route.ts, lib/invoices/project-invoice-draft.ts   (e: ingen bakvänd härledning)
  components/invoices/ProjectInvoiceModal.tsx      (f: tidpostens kategori styr; Restid aldrig ROT)
  lib/quote-calculations.ts                        (travel_amount på radtypen, travelTotal additivt)
  app/dashboard/quotes/_shared/applyProductToItem.ts, lib/products/build-item-snapshot.ts
                                                   (resolveLaborShare → {laborShare, travelShare}; snapshot skriver travel_amount)
  radredigeraren (RowEditSheet/useQuoteItems)      (räknar om delningen från frysta andelar när antal/pris ändras;
                                                    lämnar aldrig en item-rad utan delning: arbete om ROT-flaggad, annars material)

Fas 3 — artiklar och komponenter i UI
  app/dashboard/settings/products/{types.ts,ProductEditorModal.tsx}   ("Reseandel" bredvid "Arbetsandel", summa ≤ 1, komponenttyp "Resa")
  app/api/products/route.ts, app/api/product-catalog/route.ts, app/api/admin/backfill-products/route.ts
  app/dashboard/quotes/_shared/QuoteProductSearchModal.tsx            ("Arbete X % · Material Y % · Resa Z %")
  lib/seed-defaults.ts                             (resartiklar: default_travel_share 1, rot_eligible false)
  komponentraderna i offerten (RowEditSheet + component_snapshot)   (delat schema: namn, artikelnummer, enhet, antal, à-pris, typ, ROT-flagga;
                                                    lägg till/ta bort rader, hämta ur katalogen eller skriv fritt, "spara som artikel";
                                                    radens total och delning härleds ur raderna när de finns; kostnad mot utpris per artikel)
  lib/products/build-item-snapshot.ts              (SnapshotComponent får article_number, unit_price, is_rot_eligible, linked_product_id;
                                                    resolveLaborShare läser is_rot_eligible, inte bara typen)

Fas 4 — fakturavägar, dokument, Fortnox, Skatteverket
  lib/types/invoice.ts, lib/invoices/quote-to-invoice-items.ts        (material_amount, travel_amount, category_slug följer med)
  lib/invoices/create-invoice.ts                   (rot_work_cost/rut_work_cost på varje väg)
  components/quotes/document/QuoteDocument.tsx, lib/invoices/build-invoice-pdf.ts
                                                   ("varav arbetskostnad", "ROT-avdrag (30 % av arbetskostnaden inkl. moms)", utfällning)
  portalens offert-DTO                             (labor_total, travel_total)
  lib/fortnox/housework.ts + fakturamapparen       (splitRowsForHouseWork; isHouseWorkRow false vid labor_amount = 0)

Fas 5 — mallar, onboarding, agenter
  lib/quote-template-defaults.ts (seedQuoteTemplates) + lib/job-types.ts   (job_type_slug på varje seedad mall)
  lib/quotes/job-standard-server.ts, job-type-setup-server.ts, hydrate-standard-products.ts   (raderna bär delningen)
  "Ny offert"                                      (jobbtypsstart som förval när jobbtyper finns)
  lib/quotes/quote-generation-context.ts, job-type-generation.ts, lib/products/match-generated-items.ts,
  lib/quotes/generated-to-quote-items.ts, tool-routerns create_quote      (varje agentrad får splitLine)

Fas 6 — tester (§6)
```

## 5. Invarianter

1. För varje `item`-rad i offert och faktura: `labor_amount + material_amount + travel_amount = total` (öre-exakt, CHECK i SQL, samma regel i TypeScript för faktura-JSON).
2. ROT-/RUT-basen är Σ `labor_amount` över berättigade `item`-rader. Material och resa ingår aldrig, oavsett flagga.
3. Avdraget = min(bas ex moms × (1 + moms) × rabattfaktor × sats, årstak) på **alla** vägar; kvoten avdrag/arbetskostnad ex moms är 0,375 vid 25 % moms utan rabatt.
4. En tidpost av kategorin Restid, Material, Möte eller Admin ger aldrig ROT-bas.
5. `rot_work_cost` (ex moms) på fakturan är lika med basen i punkt 2 på varje skapandeväg, och det är det tal Skatteverket-filen, Fortnox HouseWork-raderna och kärnans kund/Skatteverket-delning utgår från.
6. En artikel har `default_labor_share + default_travel_share ≤ 1`; en rad som fryser artikeln ärver båda andelarna; ändrad artikel rör aldrig befintliga rader (snapshot-principen, v67).
7. En Fortnox-rad är antingen helt HouseWork eller inte alls; en blandad Handymate-rad exporteras som två.
8. Redan sparade offerters `rot_deduction` ändras inte av migrationen; `quote_templates.job_type_slug` sätts aldrig genom namngissning.
9. Varje seedad mall har en jobbtyp; varje `qstd_*`-rad och varje agentgenererad rad har en delning innan den sparas.
10. När en rad har komponentrader är radens total Σ antal × à-pris över raderna, och arbete/material/resa Σ per typ; en komponentrad med ROT-flagga är alltid av typen arbete.
11. `calculateQuoteTotals`/`calculateInvoiceTotals` behåller signatur och returnycklar (bara `travelTotal` tillkommer); kärnans events och receivable-delning skrivs aldrig om.

## 6. Acceptans

**SQL, 29 kontroller gröna i PGlite på utkastet** (Claude 2026-09-16, fixtur som speglar v12+v67, quote_overhaul+v10+v13+v47+v67 och `quotes`). Codex gör om dem till `tests/line-split-sql.spec.ts`; en kontroll som måste försvagas behöver en rad i handoffen.

- **Artiklar (7):** arbete utan andel → 1/0; material och hyra utan andel → 0; befintlig andel behålls; resartikel på namn → resa 1, arbete 0, aldrig ROT; "Reservdel" träffas inte; andel > 1 och summa > 1 avvisas, summa ≤ 1 godtas; ny artikel får resa 0.
- **Komponenter (3):** `resa` godtas, okänd typ avvisas; det delade radschemat (artikelnummer, enhet, antal, självkostnad, à-pris) godtas, ROT-flagga på material avvisas, befintlig resa-komponent har flaggan av; katalogkoppling godtas och okänd artikel avvisas.
- **Backfill (11):** `arbete_*` → arbete; `resa` → resa; `material_*` → material; `hyra` → material; timenhet → arbete; `st` + ROT-flagga → arbete; `st` utan flagga → material; befintlig arbetsdel → resten material, 0 resa; befintlig exakt delning behålls öre-exakt (740,74 + 493,82); rubrik och rabatt lämnas utan delning; ingen item-rad utan delning.
- **Invarianten (6):** villkoret är validerat; item-rad utan delning avvisas; delar som inte summerar avvisas; exakt delning godtas, även negativ item-rad; rubrik utan delning godtas; en ändring av `total` som bryter summan avvisas.
- **Huvud och idempotens (2):** `quotes.travel_total` = Σ resa; migrationen kan köras igen.

**TypeScript-specar (Playwright i `tests/`, registrerade i `contracts.yml` och `package.json`):**

| Spec | Bevisar |
|---|---|
| `line-split-invariant.spec.ts` | `splitLine` öre-exakt, andelssumma ≤ 1, `resa`-komponent i `resolveLaborShare`-tvillingen; med komponentrader är radens total Σ antal × à-pris och delningen Σ per typ. |
| `component-rows-editor.spec.ts` | lägg till/ta bort rader av valfri typ, hämta ur katalogen, skriv fritt och spara som artikel, ROT-flaggan kan bara sättas på arbete, kostnad mot utpris per artikel. |
| `rot-basis-shared.spec.ts` | `rotRutLaborBasis` på blandade rader, resa-rader, legacy-JSON; kvoten 0,375 på alla sex vägar (regression för b). |
| `invoice-calculations-rot-split.spec.ts` | (a): blandad rad 60/40 ger bas 60 %, inte 100 %. |
| `project-invoice-restid.spec.ts` | (f): Restid/Material/Möte/Admin ger 0 bas; `work` ger hela. |
| `fortnox-housework-split.spec.ts` | blandad rad → två Fortnox-rader; `labor_amount = 0` → aldrig HouseWork; redan synkad faktura rörs inte. |
| `invoice-rot-work-cost-all-paths.spec.ts` | `rot_work_cost` skrivs av create-invoice, from-quote, avtal och tool-router; Skatteverket-filen validerar. |
| `quote-template-job-type-default.spec.ts` | varje seedad mall har `job_type_slug`; jobbtypen finns; agentkontexten föredrar den. |
| `document-varav-arbetskostnad.spec.ts` | offert- och fakturadokumentet visar "varav arbetskostnad" och rätt ROT-text; utfällning vid `show_components_to_customer`. |
| Utökas | `rot-split`, `rot-moms-facit`, `rot-instruktion`, `quote-to-invoice-mapper`, `facit-produktbank`, `column-contract`. |

## 7. Inte i detta paket

Datumlogik för 2025 års 50 %. Grön teknik (räknas på hela raden i dag, orörd). RUT-specifika ytor. Prislistor per
kundsegment (`price_lists_v2`). Kärnans kontering av ROT-fordran (C9). En ny offertredigerare. Migrering av de två
legacy-offerterna med JSON-rader.

## 8. Aktivering

Ingen flagga. v252 körs efter granskning och merge, med verifieringen i filens fot. Efter körning: fakturor som
skapas får rätt bas direkt; befintliga fakturor och skickade offerter är oförändrade. Innan bred kommunikation
till kunder: en ROT-faktura med blandad artikel exporteras till Fortnox i piloten och kontrolleras rad för rad.

## 9. Ägargrindar (Christoffer)

| Grind | Vad | Blockerar |
|---|---|---|
| Standardandelar per artikel | Gå igenom startlistan i `lib/seed-defaults.ts` per bransch och sätta arbete/material/resa-andel per artikel. Skatteverket godtar en skälig fördelning vid fast pris, men den ska gå att motivera, och det är hantverkarens blick som gör den rimlig. | Fas 3 seedning; inte koden. |
| Jobbtyper och artiklar per bransch | Vilka jobbtyper och vilka artiklar en elektriker, rörmokare, snickare och målare faktiskt återanvänder. | Fas 5 mallinnehåll; inte koden. |
| Skatteverket-kontroll | Bekräfta mot Skatteverkets aktuella sidor att 30 %, 50 000/75 000 och "arbetskostnad inkl. moms" stämmer för 2026, och vad som gäller resor i samband med arbetet (framkörning är inte arbete). | Aktivering. |

## 10. Handoff

_Codex fyller i: paket/scope, filer, avvikelser från §1 med skäl, migrationens avvikelser från §3, de 27
SQL-kontrollernas utfall, TypeScript-specarna med utfall, körda kommandon (`tsc`, `next build`, kontraktssviten och
`first-value.yml`-stegen), och vad som återstår. Claude granskar mot orkestreringens §6 A + B + D och matrisen._

## 11. Framtida faser (registrerade, byggs inte nu)

| Fas | Christoffers idé | Vad som redan finns att bygga på | Beror på |
|---|---|---|---|
| Arbetstyper på artiklar | Tagga artiklar med den typ av jobb de hör till (fasadmålning, nytt badrum, altan, avlopp …) så att hantverkaren filtrerar snabbare och agenten matchar artiklar och standardreservationer utan att gissa. Öppet: en eller flera typer per artikel, fast lista eller egna, hur agenten läser strukturen, hur typens reservationer möter artikelns egna. | `job_types` per företag, `quote_templates.job_type_slug` och `qstd_*`-mallens artikelrader är redan en koppling artikel ↔ jobbtyp per mall; reservationer finns i `reservation_texts`/`reservation_triggers` (v91) och `quotes.reservations_snapshot`. Det som saknas är en direkt märkning på artikeln (många-till-många) och att triggers kan hänga på jobbtypen. | Fas 5 här (jobbtypsmallen som standardstart) och att artikelraderna är stabila. |
| Etappindelning av stora artiklar | En stor artikel (hela badrummet) delas i etapper (rivning, VVS, plattsättning, avslut) med ansvarig per etapp och en uppskattad total tid; efter kundens godkännande blir etapperna arbetsschemat. Öppet: sekventiellt eller överlappande, koppling etapp ↔ komponentrader, hur förseningar kommuniceras, om kunden ser tidslinjen. | Projektets planering (#80: flera dagar × personer, timbudget, `schedule_entry`), `estimated_hours` på raden och `project_assignment`. Etappen blir ett mellanled mellan artikel och schemaposter. | Komponentraderna (denna brief) stabila; planeringen från #80 i drift. |
