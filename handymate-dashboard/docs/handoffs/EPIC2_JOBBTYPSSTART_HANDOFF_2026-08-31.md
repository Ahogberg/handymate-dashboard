# Epic 2 — Jobbtypsstart, första-offerten-aktivering, visuell onboarding — överlämning

Datum: 2026-08-31. **Ingen kod skriven för detta epic ännu — endast research +
konkret specifikation.** Claude fokuserar klart på det pågående
offertomtaget (se `feature/offert-omtag`, planfil
`C:\Users\Gaming\.claude\plans\cozy-crafting-reef.md` på Claudes maskin —
inte i repot). Codex äger Epic 2 från och med nu: jobbtypsstart,
första-offerten-aktivering och den visuella onboardingupplevelsen.

## Mål

När en hantverkare väljer jobbtyp (redan vid affärsskapande, eller vid
offertstart) ska relevanta artiklar, priser och förbehåll komma på plats
automatiskt i stället för att varje offert börjar från noll. Andreas
explicit: bygg detta genom att återanvända befintliga mallar,
artikelregister, reservationsmotor och onboardingsteg — inget nytt
parallellt system.

## Vad som redan finns (verifierat i kod, inte antaget — research gjord
2026-08-31 av en Explore-agent mot `feature/offert-omtag`, men detta gäller
lika mycket `main` eftersom ingen av dessa filer rörts av offertomtaget)

- **`job_types`-tabell** (`sql/v2_deal_job_type.sql`): riktig tabell,
  kolumner `id, business_id, name, slug, color, icon,
  default_hourly_rate, sort_order, is_active, archived_at`. Helper-lib
  `lib/job-types.ts` (slugify, migrering från legacy
  `business_config.services_offered`, färgpalett,
  `findMatchingAssignees`). CRUD: `app/api/job-types/route.ts` +
  `app/api/job-types/[id]/route.ts`. Settings-UI:
  `app/dashboard/settings/job-types/page.tsx`.
- **`deal.job_type`** (TEXT, samma migration) — redan i UI:
  `app/dashboard/pipeline/components/NewDealModal.tsx` (~rad 295-310) har
  en jobbtyp-`<select>` som hämtar `job_types`-rader, med fallback till
  legacy `jobTypes: string[]`, och matchar automatiskt en teammedlem via
  `specialties` (`business_users.specialties TEXT[]`) när en jobbtyp
  väljs. Ingen motsvarande redigering hittad på affärens DETALJ-vy, bara
  vid skapande.
- **`project.job_type`** (TEXT, `sql/v49_project_job_type.sql`),
  backfillas från `deal.job_type` när ett projekt skapas från en affär.
- **`quotes.job_type`** (TEXT, `sql/v7_pricing.sql`) finns redan som
  kolumn. Plus en hel **`pricing_intelligence`**-tabell nyckel på
  `(business_id, job_type)` som aggregerar snitt-/min-/max-/median-pris,
  vinstfrekvens, marginal, trend per jobbtyp — byggd men dess konsumtion
  ej vidare undersökt, utanför detta epics kärnscope.
- `job_type` finns också fritt på `lead`, `project_lesson`,
  `project_outcome`, `operating_experiment`, `serviceavtal`,
  `neighbour_campaigns` — en genomgående fri text/slug-nyckel i hela
  "intelligensskiktet", generellt INTE FK-bunden till `job_types.id`.
- **`lib/ai-quote-generator.ts` använder redan `jobType` meningsfullt**,
  inte en stubb: `fetchRecentLessons(businessId, jobType)` och
  `fetchConfirmedPatterns(businessId, jobType)` returnerar tidigt `[]` om
  `jobType` saknas, annars frågar de `project_lesson`/`business_knowledge`
  filtrerat `.eq('job_type', jobType)` för att väva in tidigare
  lärdomar/mönster i AI-prompten. **`app/api/quotes/ai-generate/route.ts`
  accepterar redan `jobType`/`job_type` i body — men koden har en
  kommentar som ordagrant säger att ingen befintlig UI-anropare skickar
  det ännu.** (Claude löser TRÅDNINGEN av detta fält från offertsidan som
  en del av offertomtaget, Fas 1.6 — men UI:t för att VÄLJA jobbtyp vid
  kallstart, dvs. Epic 2, gör Claude inte.)
- **`quote_templates.category`** (fritext, `sql/quote_overhaul.sql`) är en
  SEPARAT, parallell, jobbtyps-LIK axel — värden som "Badrum", "Kök",
  "Elinstallation", "Service", "Grön teknik", "Besiktning", "Värme",
  "Måleri", "Utomhus", "Allmänt" (fullständig lista i
  `lib/quote-template-defaults.ts`) — men **INTE kopplad till
  `job_types`-tabellen**: ingen FK, inget delat slug-format, en ren
  hårdkodad sträng. Mallväljaren (`components/quotes/TemplateSelector.tsx`,
  öppnad från `QuoteNewStartChooser.tsx`) filtrerar client-side på just
  denna fria `category`.
- **`reservation_triggers`**: bara `trigger_type: 'product'|'category'|
  'keyword'` (`lib/reservations/match.ts`, `app/api/reservations/route.ts`)
  — inget jobbtyps-nivå-triggerslag existerar.
- **`products.category`** är en HELT ANNAN axel (`arbete/material/hyra/
  övrigt` — radtyp, inte jobbtyp) — blanda inte ihop med jobbtyp när ni
  bygger prefill-kedjan.
- **Onboardingens artikelsteg**: `app/onboarding/components/
  StepProductRegister.tsx`, steg-index 6 (0-baserat, 7:e av 8 skärmar,
  `OB_DOTS.productRegister = 5` av `OB_DOT_TOTAL = 6` prickar). Sekvens:
  Step5Activate (Stripe) → StepImportData → **StepProductRegister** →
  Step6LiveTour. Seedar hela branschartikelbanken via
  `POST /api/onboarding/seed-products` (från `lib/product-defaults.ts`),
  visar redan prissatta artiklar grupperade på `products.category`, och
  "10 vanliga att prissätta nu" = de FÖRSTA 10 oprissatta
  `category==='arbete'`-artiklarna i seed-ordning — helt branschbrett,
  NOLL jobbtyps-koppling idag.

## Konkreta delar att bygga

1. **Länka `quote_templates.category` ↔ `job_types`.** Enklast: lägg till
   en `job_type_slug`-kolumn på `quote_templates` (eller matcha på
   normaliserad `slug(category)` mot `job_types.slug` om ni hellre
   undviker en migration — avväg vid implementation). Målet: en vald
   jobbtyp ska deterministiskt peka ut rätt mall(ar), inte bara filtrera
   en fri textlista i UI:t som idag.
2. **Jobbtyp som en tydligt värdefull startpunkt vid offertstart.**
   Kundspråk (redan avstämt med Andreas): "Vad ska du offerera?
   Badrumsrenovering · Servicebesök · Installation · Annat jobb." Om
   offerten startas från en affär MED jobbtyp redan satt (det vanliga
   fallet enligt Andreas: "jobbtyper finns när man skapar deal") — följ
   med automatiskt, fråga aldrig igen. Vid kallstart utan affärskontext:
   visa frågan, men gör den uppenbart värd att svara på — Andreas exakta
   ord: *"kanske behöver vara tydligare att jobbtypen är smart att fylla
   i"*. Konkret: visa VAD som händer om man svarar (t.ex. "→ dina vanliga
   artiklar och priser för badrum fylls i automatiskt") direkt vid
   frågan, inte en tom dropdown utan sammanhang.
3. **Prefill-kedjan**: vald jobbtyp → matchande mall(ar) via (1) →
   mallens artikelrader → reservationsmotorn föreslår samma förbehåll som
   vanligt (ingen ändring av `match.ts` bör behövas — se dock punkt om
   offertomtagets prissanning nedan). `jobType` skickas samtidigt till
   AI-generate (offertomtagets Fas 1.6, se nästa avsnitt) så en
   fritextbeskrivning KAN komplettera mallens rader i stället för att
   ersätta dem.
4. **Onboarding görs jobbtyps-medveten, inte bredare.** Utöka
   `StepProductRegister.tsx`: fråga "Vilka jobb gör ni oftast?" (välj 1–3
   jobbtyper, återanvänd befintlig `job_types`-seedning/UI) FÖRE
   artikellistan, filtrera "10 vanliga att prissätta nu" till artiklar
   som faktiskt förekommer i den valda jobbtypens mall(ar) i stället för
   en ren branschlista. Landa resultatet i den RIKTIGA offertbyggaren (en
   riktig mall-preview), inte en separat demoyta — matchar samma princip
   som offertomtaget använder rakt igenom (ett utseende, inga parallella
   ytor).
5. **Den visuella onboardingupplevelsen** (Andreas explicit nämnt, inget
   djupare specificerat än av Claude) — Codex äger designbeslutet här,
   men bör hålla sig till samma princip som resten av omtaget: minimal ny
   UI, återanvänd befintliga komponenter/mönster, och undvik en separat
   "demo-känsla" skild från den riktiga produkten.

## Beroenden mot det pågående offertomtaget (koordinera, kopiera inte)

- **`jobType`-trådningen till `/api/quotes/ai-generate`** (offertomtagets
  Fas 1.6) görs av Claude i `feature/offert-omtag`, INTE av Epic 2 — Epic
  2 kan förutsätta att fältet snart går att skicka med, men bygg inte en
  egen konkurrerande trådning.
- **Mallarnas prissanning** (offertomtagets Fas 1.7): `lib/quote-
  template-defaults.ts` har idag hårdkodade priser (650 kr/tim
  praktiskt taget överallt, 4 500 kr fast pris för elbesiktning) som
  kopieras rakt in i offerten oavsett företagets egna priser — bekräftat
  i kod. Claude fixar detta (arbetsrader → företagets timpris,
  materialrader → produktbankens riktiga priser, fasta paketpriser →
  samma "prislös tills bekräftat"-princip som resten av prissystemet).
  **Epic 2:s prefill-kedja (punkt 3 ovan) ska byggas OVANPÅ den fixade
  mallpris-logiken, inte parallellt med den** — vänta på att Fas 1.7 är
  klar på `feature/offert-omtag` (eller motsvarande på `main` efter
  merge) innan ni antar att mallradernas priser är korrekta.
- **`QuoteBuilder.tsx`** (den sammanslagna offertbyggaren,
  `app/dashboard/quotes/_shared/QuoteBuilder.tsx`) är den nya, enda
  offertvyn efter omtaget — Epic 2:s "landa i den riktiga offertbyggaren"
  (punkt 4) ska peka dit, inte mot den gamla `new/page.tsx` eller
  `[id]/edit/page.tsx` som snart blir tunna wrappers runt samma
  komponent.

## Explicit inte i scope för Epic 2

- Ingen ny parallell mallmotor eller frågeflödesmotor — allt byggs som
  tunna kopplingar mellan befintliga tabeller/komponenter enligt ovan.
- Det fulla adaptiva frågeflödet (fri-text-baserade uppföljningsfrågor
  per jobbtyp, branschanpassade snabbval) är separat och större än detta
  — Epic 2 handlar om DETERMINISTISK prefill från en vald jobbtyp, inte
  om att AI:n ställer fler frågor.

## Status

Ingen kod skriven. Ingen migration skriven eller körd. Detta dokument är
hela överlämningen — inga andra filer att ta över.
