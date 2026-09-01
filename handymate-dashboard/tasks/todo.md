# Nattpass 1: tenant-svep av rutterna utanför standardgrinden (Claude 2026-09-01→02)

Andreas: "kör igenom nummer 1 och sen nummer 2 direkt när det är klart,
pausa inte för accesser". Rapport: docs/audits/TENANT_SWEEP_2026-09-01.md.

- [x] Inventering: 554 rutter, 120 utan getAuthenticatedBusiness, 38 utan
      igenkänd grind granskade rad för rad (tre parallella granskningar)
- [x] KRITISKT: reminders hade hårdkodad reservhemlighet → verifyCronSecret
- [x] HÖGT: google/callback osignerad OAuth-state → HMAC + sessionsmatchning
      (lib/google/oauth-state.ts); karin-deadlines, invoices/auto-generate,
      morning-brief: "Bearer undefined"-mönstret → verifyCronSecret
- [x] Google Calendar-webhooken kräver kanaltoken (lib/google/channel-token.ts)
- [x] quotes/track kräver sign_token; portal messages, quotes/public
      fråga/bokning, lead-portal, public/book, storefront/track,
      partners/register: fail-closed rate limits (checkPublicRateLimitDb)
- [x] ÄTA-signering atomisk, fältrapport-reject engångs, inbjudan utan
      utgång = utgången, Swish-QR validerar, voice/greeting signeras,
      inbound-mejl faller bara tillbaka vid saknat schema, auth/register
      kryptografiskt business_id, portalens customer_message business-filtrerad
- [x] Facit: tests/facit-tenant-sweep.spec.ts + tests/facit-route-auth-
      inventory.spec.ts (PUBLIC_BY_DESIGN är beslutet) — i CI-grinden
- [x] Rött på main före passet: cogs-matare räknade 2 bokforMatteUsage,
      efb8d69 lade till en tredje — facit uppdaterat
- [x] tsc 0, 27 berörda sviter + nya facit 208 gröna, test:contracts grön

## Beslut för Andreas (INTE ändrat)
- public-dto exponerar customer.portal_token i offertsvaret (offert→portal-
  redirect). Scope-eskalering inom samma kund. Gata efter accept?
- admin/partners/[id]/approve är muterande GET (mejllänk).
- Portaltoken utan utgång, återaktiveras vid ny länk.

---

# Lanseringsgrund: CI-grind, driftsynlighet, kortkvalitet (Claude 2026-09-01)

Andreas ask efter genomgången "nästa utvecklingssteg inför lansering":
punkt 3 (korten signal före notiser), 4 (driftsynlighet) och 5 (CI).
Andreas kör själv Grind B + onboarding-A/B parallellt. Branch
claude/next-dev-steps-launch-b4xqwu.

## 5 — CI
- [x] `.github/workflows/contracts.yml`: push/PR-grind = tsc + 12 browserlösa
      sviter, inga hemligheter, inga browsers, < 3 min. Root-filen
      "contracts-workflow-att-lagga-in.yml" flyttad in och borttagen.
- [x] `.github/workflows/playwright.yml` (fulla prod-sviten m. service-role-
      nyckel): NATTLIG 02:00 UTC + workflow_dispatch, inte längre på push/PR.
- [x] Nytt jobb `tenant-isolation` i den nattliga: kör
      `npm run test:tenant-isolation` när TENANT_*-secrets finns, hoppar
      SYNLIGT (::warning::) annars. Secrets att lägga i repot: se filhuvudet.
- [x] `types/react-dom-server-browser.d.ts`: tsc var röd på färsk checkout
      (TS7016 i två offertdokument-facit från 269641f) — ambient modul.
- [x] npm-script `test:contracts` = exakt CI-listan.
- [x] Facit: tests/facit-ci-grind.spec.ts.

## 4 — Driftsynlighet
- [x] Sentry (@sentry/nextjs 10.73): sentry.{client,server,edge}.config.ts,
      instrumentation.ts, withSentryConfig + instrumentationHook i
      next.config.js. PÅ bara med DSN; sendDefaultPii=false; ingen replay.
      Adapter lib/observability/sentry.ts (kastar aldrig) — ErrorBoundary,
      app/global-error.tsx och rapporteraTystFel går via den.
- [x] Kreditbevakning `/api/cron/credit-watch` 05:05 UTC
      (lib/observability/credit-watch.ts): 46elks-saldo (/a1/me, gräns
      CREDIT_WATCH_ELKS_MIN_SEK=300), Anthropic 1-token-probe (kreditstopp =
      error), Stripe /v1/balance (nyckel + livemode), databas. Mejl vid
      warn/error, SMS via HANDYMATE_SUPPORT_ALERT_PHONES vid error.
- [x] `/api/health` visar sparat kreditläge (platform_health_check) — anropar
      ALDRIG leverantörer själv. error → 503, warn → 200 + warnings[].
- [x] Facit: tests/facit-driftsynlighet.spec.ts + tests/credit-watch.spec.ts.

## 3 — Kortkvalitet
- [x] lib/approvals/kortkvalitet.ts (rent): summeraKort + bedomBrusgrind.
      Konstanter: MIN_SAMPLE=5, BRUS_EXPIRED_PCT=80, PAUS_DAGAR=14,
      BRUSGRINDADE_TYPER = dispatch_suggestion, checklist_forslag.
- [x] lib/approvals/noise-gate.ts (fail-open) inkopplad FÖRE insert i
      lib/dispatch.ts och lib/egenkontroll/suggest-checklist.ts. Paus
      bokförs en gång som automation_activity 'kortkvalitet'/skipped.
- [x] Admin: GET /api/admin/kortkvalitet?days=30|90 + /admin/kortkvalitet
      (per typ, per företag+typ, brusgrindens läge). Länk från /admin.
- [x] Push TTL/prioritet/dedupe vid SÄNDNING: lib/notifications/push-policy.ts
      (tre klasser beslut/hant/teamuppdatering), push_dispatch_log
      (fail-open), sendApprovalPush deduplicerar före fetch och bokför efter,
      /api/push/send skickar TTL+urgency (web-push) och ttl+priority (Expo).
- [x] Facit: tests/kortkvalitet.spec.ts + tests/push-policy.spec.ts.

## Migration
- [x] `sql/v191_platform_health_and_push_dispatch.sql` KÖRD via MCP
      2026-09-01 (Andreas "Kör!"), facit-SELECT verifierad: relrowsecurity
      = true på båda, 0 grants till anon/authenticated, dedupe-indexet finns.

## Verifiering
- [x] tsc 0 fel (var 2 fel på färsk checkout före types/-filen)
- [x] test:contracts 158/158; grannsviter push/dispatch/checklist/driftlarm
      102/102; outbound-truth/innehållskontrakt/feature-gates 86/86
- [x] next build exit 0 (689 rutter); Kontraktsgrind grön på branchen (run 33553161185, 2,5 min)
- [ ] Efter deploy: sätt NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN i Vercel,
      kör v191, trigga /api/cron/credit-watch manuellt (admin-session
      räcker), läs /api/health och /admin/kortkvalitet.

---

# Prisslingan V2 — pass 5: faktura-UI + materialpåslag + städ (Claude 2026-08-31)

Pass 4 + Work Report V1 LIVE (ea5078e9). v183 KÖRD+verifierad.

- [ ] UX4a: InvoiceAddRowCombo (QuoteAddRowCombo-mönstret på delad useProductSearch — flytta hooken till neutral plats) monterad i LineItemEditor; "Sätt pris"-etikett för prislösa; ROT-flagga bara när fakturans globala typ matchar
- [ ] Materialpåslag (beslut 4): projektmaterial-prissättningen använder kundlista → pricing_settings.material_markup_pct → inget påslag + varning; hårdkodade 20 bort ur projects/[id]/materials-routen; onboarding-värdet från steg 3 börjar verka
- [ ] v184_drop_price_list.sql: DROP TABLE price_list CASCADE (0 rader — bevisat) — visa Andreas + "kör" före MCP-körning; + v185 drop supplier_pricelist (0 rader, 0 refs) i samma granskning
- [ ] UX6: sql-vy prisloop_metrics (prissatt-andel per business, andel quote_items 30d med linked_product_id, AI-rader pris 0) + enkel admin-tabell
- [ ] Facit + tsc + sviter + build + REN-worktree-tsc → push → deploy → SLUTRAPPORT för hela Prisslingan V2

---

# Prisslingan V2 — pass 4: agenterna + reservationer serverside (Claude 2026-08-31)

Pass 3 LIVE (aa4e840c). v183 väntar Andreas "kör v183".

- [x] UX3a: lib/products/price-context.ts → Matte-chattens kontext (create_quote hade NOLL priskontext), intent-agenten (regeln rad 87 har äntligen en lista), tool-routerns createQuote namnmatchar → linked_product_id + article_number (rör aldrig modellens pris)
- [x] UX3b: lib/reservations/suggest-for-items.ts → approvals create_quote_draft skickar reservations_snapshot fail-soft (tool-routern: medvetet EJ — createCanonicalQuote saknar fältet, dokumenterat)
- [x] D1: kundlistan är ÖVERLÄGG i buildPriceContext — [P#]-handtagen skrivs ALLTID; facit i ai-quote-product-linking
- [x] D3: GET /api/pricing/resolve (priceListId + priceList, force-dynamic); quotes/new-prefillen bytte två anon-nyckel-queries mot ETT fetch
- [x] UX5: getDefaultReservations string|string[] (union) + seedReservations får productBranches
- [x] Facit (pass 4-describe i prisloop-ux2 + D1-test) — tsc 0, 12 sviter gröna
- [ ] build + REN-worktree-tsc → push → deploy → rapport

---

# Prisslingan V2 — pass 3: dedup + unikt index + upsert (Claude 2026-08-31)

Pass 2 LIVE (4533d1e8). v183 är DESTRUKTIV (DELETE av dubblettrader) —
filen visas för Andreas och körs via MCP först efter hans uttryckliga "kör".

- [x] C1 källfix: namn+enhet-dedup i getDefaultProducts (Lärling fanns i TIO branscher efter långsvansen — analysskript bekräftade 13 tvärs-nycklar + 1 inom-bransch); HM-BYG-018 omdöpt 'Tillbyggnad (stomme och tätt hus)'; C1-facit i product-register.spec
- [x] v183_products_dedup_unique.sql SKRIVEN (dry-run-frågor + verifierings-SELECT inbäddade; prod-läget dokumenterat: 15 grupper/11 businesses, Bee-tien avgörs på äldst) — EJ KÖRD, väntar Andreas granskning + "kör v183"
- [x] C3: POST /api/products upsert (ilike-namn+enhet m. wildcard-escape, hitta+prissätt → updated_price, 23505-nät, kanoniskKategori v88-normalisering, created:true/false i svaret)
- [x] C4: quotes/new auto-create speglar created:false+updated_price via setLocalPrice
- [x] Facit: products-upsert.spec + C1-namndedup — tsc 0, tio riktade sviter gröna
- [ ] build + REN-worktree-tsc → push → deploy → visa v183 för Andreas

---

# Prisslingan V2 — pass 2: kanonisering + beta-av + branscher (Claude 2026-08-31)

Andreas "Kör" efter pass 1-avstämningen. Pass 1 LIVE (f2fa8c9).

- [x] B1: lib/products/price-list-view.ts (getPublicPriceList, sales_price>0) + 6 läsare omkopplade + voice/analyze → products (grossistpriserna borta ur samtalsanalysen)
- [x] B2: död kod bort — sync-price-list, seedPriceList, /api/price-list/seed-from-onboarding (0 anropare), getDefaultPriceList/PriceListEntry/price-list-defaults, approvals legacy-gren, tests/price-list-sync; 4 facit omskrivna till nya kontraktet
- [x] v182_pricing_v2_rls_members.sql KÖRD via MCP + policy-SELECT verifierad (alla 4 bär business_users-UNION)
- [x] UX2a: "Saknar pris (N)"-pill (?filter=saknar-pris) + Prissätt snabbt (delad QuickPriceInput, Enter=spara, raden lämnar filtret)
- [x] UX2b: pricedCount/unpricedCount i oversikt; AgentReadinessCard levande text + filter-länk; checklistan matas med prissatta
- [x] UX2c: StepProductRegister "10 vanliga att prissätta nu"
- [x] UX2d: OB_DOTS/OB_DOT_TOTAL i constants — 7 hårdkodade ställen ersatta, facit uppdaterat
- [x] Nollställning: 147 gissade fastpriser → 0 i 11 branscher (timartiklar kvar för overlay 1f); prispolicyn dokumenterad i filhuvudet
- [x] Branscher: lib/product-defaults-longtail.ts (subagent, 571 prislösa artiklar, 11 branscher, deduction-fördelning granskad — enda RUT-raden i carpenter är korrekt Möbelmontering) + mergad i getDefaultProducts (kärnan först, seed-index bevaras)
- [ ] Facit + REN-worktree-tsc + build + regression (ALDRIG pipat) → push → deploy-verifiering → rapport

---

# Prisslingan V2 — pass 1: pengasanning + offertloopen (Claude 2026-08-31)

Godkänd plan (C:\Users\Gaming\.claude\plans\recursive-painting-possum.md).
Avstämning med Andreas efter pass 1. Inga migrationer i detta pass.

- [x] A1: delad quote→invoice-mappare (lib/invoices/quote-to-invoice-items.ts) + rotRutLaborBasis; from-quote/create-final-invoice/project-invoice-draft/tool-router/invoices-POST byggs om; InvoiceItem får labor_amount + linked_product_id
- [x] A2: ROT-sanning server-side i PUT /api/invoices (calculateCappedDeduction + excludeInvoiceId — som var en DÖD parameter och nu trätts in i usage-frågan)
- [x] A3: buildFortnoxInvoiceRows (VAT-arv, negativ rabatt, subtotal bort, heading/text→textrader, ArticleNumber fasad)
- [x] A4: påminnelsens total (inkl-moms + avgifter, beraknaPaminnelseTotaler) + femte ROT-formeln bort
- [x] A5: prislös tid — bort med ||500/||895, warnings visas i ProjectInvoiceModal + from-time-entries returnerar warnings
- [x] A6 FULL: ROT/RUT-val per ÄTA-rad i ChangeModal + AI-ÄTA-flaggor + create-final-invoice/draft/invoice-preview respekterar (TD-26 stängd)
- [x] 1a: applyProductToItem — radpris överlever prislös artikel
- [x] 1b: priceLabel i tre desktopväljare
- [x] 1c: standardpris-erbjudandet i ItemRow (desktop) + trådning genom QuoteItemsSection till båda sidorna
- [x] 1d: AI-prompten: prissatta + prislösa i separata block, handtag intakta
- [x] 1e: auto-create prissätter bankartikeln i stället för dubblett (PUT-väg + namnmatch-vakt)
- [x] 1f: timpris → seedade arbetsartiklar (applyHourlyRateToDefaults, seedProducts/finalize/seed-products-routen) + materialpåslags-fält i Step3HowYouWork → pricing_settings-merge i PUT /api/onboarding
- [x] 1g: QuoteQuickstartCard i samklang med seeden (450/1200)
- [x] Facit: quote-to-invoice-mapper, fortnox-row-builder, reminder-totals, apply-product-pricing, ai-quote-product-linking-utökning, onboarding-overlay — tsc 0 fel, 63/63 + 19/19 gröna
- [ ] next build + bred riktad regression (ALDRIG pipat) → push → rapport till Andreas (AVSTÄMNING före pass 2)

---

# Rapportera dagens arbete V1 — Codex 2026-08-31

Godkänt: projektbunden röst/text i native-appen, samma Matte/Lars och
befintliga log_time/add_work_note. Ingen migration, fakturering, utskick,
projektavslut eller deploy. Mobilen byggs från GitHub-snapshot 1d078364 i
separat arbetskopia; Claudes lokala mobiländringar lämnas orörda.

- [x] Spåra röst, MatteSheet, projektkontext, bekräftelse och verkliga skrivare.
- [x] Avgränsat rapportläge med serverägd person/projekt/datum, behörighet och timerkontroll.
- [x] Mobil ingång för röst/text, bevarad kontext och tydliga separata bekräftelser/kvitton.
- [x] 174 riktade backendtester och 130 mobiltester; tsc rent i båda; next build exit 0; lokal Android/iOS-export; hash-/schema-/constraintkontroll; 9/9 skrivskyddade PostgREST-prober; granskbar mobilpatch.
- [ ] Efter merge/deploy: fysisk telefon, faktisk medarbetare och tvåtenant-/återförsöksprov enligt docs/handoffs/WORK_REPORT_V1_2026-08-31.md. Ingen EAS-build eller deploy gjord här.

Mobilpatch och gränser: docs/handoffs/WORK_REPORT_MOBILE_V1.patch och
docs/handoffs/WORK_REPORT_V1_2026-08-31.md. Separat fynd: portalens äldre
project_log-läsning använder fel kolumner; rätta först efter beslut om
vilka historiska anteckningar kunden får se. Nya rapportanteckningar har
uttryckligt portalfilter, oberoende av detta gamla frågefel.

---

# Inför nästa jobb V1 — Codex 2026-08-31

Andreas har godkänt bygget. Läsande förberedelse för verifierad bokning och
projekt, Lars som avsändare och befintlig Matte-chatt som nästa steg.
Inga utskick, nya godkännanden, migrationer eller agentmotorer. Native-appen
ändras inte; webbytorna ska fungera på mobil och desktop. Tidigare ändringar
i CSV/import, marknadsföring och dokument bevaras.

- [x] Verifiera körande schema och befintliga behörighets-/källvägar.
- [x] En läsande modell + autentiserad API-rutt; inga sidoeffekter vid GET.
- [x] Förberedelse i dagsplan, bokning och projekt; källor, luckor och fel synliga.
- [x] Fråga Matte via befintlig prompt-ingång, ingen automatisk chattur/åtgärd.
- [x] 138 riktade tester gröna (60 nya), slutbuild exit 0, separat tsc exit 0, 11/11 läsande PostgREST-schema/filter-prober godkända.
- [x] Dokumentera vad som är lokalt testat respektive skarpt verifierat i docs/audits/NEXT_JOB_PREPARATION_V1_2026-08-31.md.

Lokalt färdig, inte committad/pushad/deployad. Kvar efter deploy: inloggat
prov av en verklig testbokning, medarbetar-/tvåtenantprov och frivillig
Matte-tur. Databasproberna läste noll kundrader och är inte det skarpbeviset.

---

# Nu-fördjupning inför lansering — Codex 2026-08-31

Godkänt av Andreas efter konkurrentresearchen. Avgränsat till CSV-importens
sanningskontrakt, kundspråk/operating plan och säkra verifieringar. Ingen ny
lanseringschecklista, ingen Fortnox-/röstombyggnad, inga produktionsskrivningar.

- [x] En serverväg för de två CSV-ytorna; returfel och noll bekräftade skrivningar räknas aldrig som lyckade.
- [x] Båda importytorna visar delvis resultat och misslyckade rader ärligt; gemensam CSV-parser skyddar citerade fält och saknade kolumner.
- [x] Synka produktbudskap och Christoffers första-dagen-/demoupplägg.
- [x] 190 riktade tester gröna (44 nya), slutbygge exit 0, separat tsc exit 0, publikt läsande rökprov 5/5.
- [x] Lokala bevis och kvarvarande skarpa kundresor särredovisade i docs/audits/PRELAUNCH_NOW_2026-08-31.md.

Granskningsstatus: inga commits/push/deploy/migrationer i detta pass. Ingen
aktuell tvåtenant-/telefon-/betalningsresa körd. Fortnox-kärnan och tidigare
marketingändringar orörda. Befintlig extern checklista behåller go/no-go.

---

# Samtalsefterarbete — Codex 2026-08-30

Andreas godkände fortsatt bygge: säker affärsmatchning, återförsök, samlat
samtalsutfall/push och avstängd gallring enligt policyförslaget. Inga skarpa
raderingar eller migrationer körs i detta pass. Claudes mobil-/Mattearbete
och alla befintliga marketingändringar lämnas orörda.

- [x] Ta bort automatisk vunnen/förlorad-matchning på senaste kundaffär.
- [x] Bearbetningslås, sparad analys och atomisk/idempotent kortpublicering.
- [x] Samlad läsmodell, behörig samtalsvy och en diskret push efter sparning.
- [x] Explicit, tenant-verifierad projektkoppling; återanvänd kundtidslinjen.
- [x] Gallringskod + migration v180; avstängd tills policy/leverantör verifierats.
- [x] Felvägstester, kolumnkontrakt, tsc/build och överlämningsprotokoll.

## Granskning

Lokalt klart, inte committat/deployat. Dashboard: 289 browserlösa facit gröna,
tsc exit 0 och next build exit 0. Expo: tsc rent, 17 sviter/112 tester gröna.
Migration v180 kompilerad och provad med 29 gröna kontroller i isolerad
PGlite/PostgreSQL — aldrig körd mot Supabase. Live-schema läst enbart via
information_schema. Webbvyn visuellt kontrollerad i 390 px mobilbredd.
Builden loggar även miljö-/metadata-/cachevarningar; exitkoden är 0, men det
är inte ett skarpbevis av integrationerna eller hela sessionsberoende sviten.

Se docs/audits/CALL_POSTPROCESSING_V1_HANDOFF.md för filområden, återförsöks-
begränsningar och aktiveringsordning. Leverantörsradering, policybeslut och
fysisk telefon-/mobilprovning återstår som skarpa grindar. Inspelning vidare-
kopplar oinspelat utan explicit godkännande/leverantörsverifiering/ljudmanus.
Gallring är avstängd. Ingen ny behandling eller radering har aktiverats i prod.

---

# Matte Mobile Voice V1 — röst först på hemskärmen (2026-08-30, Claude-branchen claude/lisa-prata-matte-integration-ao7nv3)

Andreas ask: mobilappen (PWA:n) ska vara klar; "Prata med Matte" lättillgänglig direkt på
första skärmen enligt Codex-designen. Deconfliction: Codex arbetar samtidigt lokalt i
tool-definitions.ts + tool-router.ts + app/api/voice/* + handymate-mobile — de filerna är
INTE rörda här (se pausade punkter).

## Klart (verifierat: tsc 0 fel, ren next build, 49/49 i voice-boundaries + matte-page-context + jarvis-hem)
- [x] Hemskärmens mikrofon är riktig: SkrivRads mic-knapp (båda lägena) öppnar Jobbkompisen
      på Röst-fliken och AUTOSTARTAR inspelningen (pendingVoice i JobbuddyContext). Textytan
      öppnar chatten som förut. ETT tryck → prata.
- [x] EN röstväg: Jobbkompisens inline-MediaRecorder ersatt med delade hooks/useAudioRecording
      (iOS audio/mp4-fallback, 5 min-tak, spårstädning) och transkriberingen flyttad från
      legacy /api/jobbuddy/voice till kanoniska /api/matte/transcribe (auth + bränslegrind +
      kostnadsmätning — routen var byggd men oanvänd). denied/unsupported visas i UI:t.
- [x] Serverägd sidkontext: /api/matte/chat ägarskapsverifierar customer/project/quote/
      invoice-id mot business_id innan de styr trådval eller nämns i systemprompten
      (verifyPageContextOwnership — främmande ID släpps + loggas, felar aldrig chatten).
- [x] Serverägd identitet: INLOGGAD ANVÄNDARE-block i systemprompten ("jag/mig" = alltid
      autentiserad business_user, aldrig modellgissning). Bekräftelsevägen trår nu också
      businessUserId in i ToolContext (handleConfirmedExternalAction).
- [x] Bekräftelsekort för tid: confirm-gaten (HMAC-token, extern-confirm) omfattar nu även
      log_time när require_confirm_external är satt — "Matte uppfattade: logga X timmar…"
      med knappen [Logga]/[Avbryt]. Mobilappens anrop utan parametern är opåverkade.

## Klart efter att Codex arbete pushats till main och mergats in (samma dag)
- [x] Beständig mikrofon: mic-knapp intill Matte-bubblan, som är monterad i dashboard-
      layouten och därmed följer med till projektsidor, kundkort och verksamhetsvyn.
      Inspelningen startas synkront i klicket — iOS Safari kräver getUserMedia inuti gesten.
- [x] log_time-ombyggnaden gjordes av Codex (identitet, projekt, duration utan påhittade
      klockslag, kanonisk taxa). Granskad och verifierad av Claude: kolumnerna
      default_hourly_rate/pricing_settings/time_require_description/require_project finns
      i live-DB, svDateStr importeras, project-ai-eventet 'time_logged' finns.
- [x] DUBBELSKYDD (lucka i skarven mellan arbetena): bekräftelse-token är giltig i 15 min
      och är ingen engångsnyckel, så ett dubbeltryck skrev två tidrader. Skyddet ligger nu
      vid skrivningen via lib/agent/recent-duplicate.ts — gäller alla vägar in, inte bara
      chattknappen, och används av alla tre fältskrivningarna.
- [x] Fältverktygen log_material (project_material) + add_work_note (project_log) klara,
      med tenantvakt på projektet, dubbelskydd, Lars allowlist och bekräftelsekort med rätt
      verb (Bokför / Spara). project_log skrivs med livekolumnerna order_id/date/
      work_performed — sql/rot_rut_documents.sql är föråldrad och får inte användas som facit.
- [x] Facit: tests/matte-time-logging.spec.ts (16 tester) täcker rätt person, inga påhittade
      klockslag, ingen dubblett, mänskligt ja före skrivning, samt fältverktygens tenantvakt
      och kolumnnamn.
- [x] Verifierat på hela det sammanslagna trädet: tsc 0 fel, ren build (345 sidor), hela
      Playwright-sviten 5591 gröna / 1 överhoppad.

## ÅTERSTÅR — i Ahogberg/handymate-mobile (annat repo)
- [ ] Codex punkt E: Expo-röstvyn (live text + servertranskribering, redigerbar bekräftelse,
      fel-fallback, projektkontext från projektsidan). Dashboard-sidan av kontraktet är klar —
      /api/matte/chat verifierar sidkontextens id:n mot tenanten och injicerar inloggad
      användare, så mobilen kan lita på svaret.
- [ ] Codex punkt H: verifiera mobile (Jest-facit + tsc).

---

# Projektöversikten: datum, dynamiska steg, status + nästa att-göra i listan (2026-08-26, PLAN — väntar på avstämning)

> Aktiv Codex-lane 2026-08-30: [Prelaunch Voice V1](./codex-prelaunch-voice-v1.md)
> — Lisa samtalsefterarbete + Matte-röst i mobilappen. Fortnox/preflight-lanen
> lämnas orörd.

Andreas ask: projektlistan ska redovisa start/slut tydligt; stegen MÅSTE flytta dynamiskt
på riktiga events/automationer; projektets status + nästa "att göra" (Lars m.m.) ska synas
direkt i listan. Kartlagt av tre utforskare + live-DB (34 projekt i prod: 29 saknar steg helt).

## P0 — buggfixar som inte kan vänta (görs direkt, ren korrekthet)
- [x] `project.address` finns inte → alla tre automatiska skapare (quote/lead/booking) skrev
      `address:` → 42703 → skapandet avvisades tyst. Förklarar REALITY-WEEK #2. Lead→projekt och
      bokning→projekt har ALDRIG fungerat i prod. + `customer.address` (död) i booking-vägen.
      Facit: tests/facit-project-create-no-phantom-columns.spec.ts
- [x] `advanceProjectStageForward` returnerar `{moved:true}` vid no-op → nu `{moved:false, skipped:true, reason}`,
      2 anropare uppdaterade (ce44690f)
- [x] `onQuoteAccepted` delegerar till `createProjectFromQuote` (en skapare; sendSms:false bevarar
      dagens beteende; start_date=idag vid signering borttaget) (ce44690f)
      → BESLUT FÖR ANDREAS: ska "Ny deal vunnen"-SMS till ägaren + portal-SMS till kunden (steg 7–8 i
      create-from-quote, aldrig live hittills) slås på vid signering? Idag: nej.

## Del A — Datum i listan (ingen migration: start_date/end_date/completed_at finns redan) — KLAR
- [x] `GET /api/projects`: `actual_start` (min(time_entry.work_date, passerad bekräftad/genomförd
      booking.scheduled_start)) + `dates` via lib/projects/derive-dates.ts på varje rad; `is_late`
      = samma härledning; listan skickar `include=workflow`
- [x] Rad-UI: datumraden med ton (sen/klart/kommande); milstolpe märkt som milstolpe
- [x] maybe-create-from-booking → start_date = bokningens dag; onQuoteAccepted gissar inte längre
      start_date=idag. (Offert→projekt får start via Del B: första bokningen sätter start_date om null)
- [x] Detaljsidan: start/slut redigerbara inline i TwinStrip via befintlig PUT
- [x] tests/project-derive-dates.spec.ts (12) + tests/facit-project-list-dates.spec.ts

## Del B — Stegen flyttar på riktiga events (en brygga, forward-only, idempotent) — KLAR
- [x] `lib/project-stages/event-bridge.ts` `bumpProjectStage` (projectId → invoice/quote → booking →
      kund vid exakt ett aktivt projekt; forward-only; kastar aldrig; läser resultatet)
- [x] ps-01 bara vid signering: lead-/bokningsfödda startar på NULL ("Inget steg ännu");
      quote_signed för befintligt projekt → ps-01
- [x] ps-02: bokningsrutten i realtid + cron-svep (skyddsnät för de andra nio bokningsvägarna);
      sätter start_date om saknas
- [x] ps-03: tidrapport i realtid via onTimeLogged (+ check-in + cron)
- [x] ps-04: varje milstolpe + signerad ÄTA. (progress ≥ 50 utan milstolpar: EJ byggt — bedömt som
      gissning, inte händelse)
- [x] ps-05: färdig egenkontroll + signerad fältrapport + completeProject
- [x] ps-06/07 genom bryggan; ps-07 först när ALLA fakturor är isCustomerSettled.
      (invoice.project_id i ALLA fakturaskapare: EJ svept — auto-invoice/quote-vägen sätter det redan;
      ad hoc-fakturor utan projekt får inget steg, ärligt)
- [x] Manuell bakåtflytt kräver `allow_backwards`, sker tyst (409 + requires_confirmation annars)
- [x] En stegtabell: lib/project-stages/stages.ts (motor + UI)
- [x] Facit: tests/facit-project-stage-producers.spec.ts; utfallsfangst ompekat

## Del C — Status + nästa att-göra i listan (en beräkning, två ytor) — KLAR
- [x] `lib/projects/derive-todo.ts`: deriveTodoMode (lyft ur detaljsidan), pickTopCard (risk → äldst),
      deriveProjectTodo (kort vinner), TODO_PRIMARY_LABEL + getStageBucket flyttade hit
- [x] `GET /api/projects`: EN pending_approvals-query; per rad `stage` + `next_todo` + `dates` + `actual_start`
- [x] Rad-UI: stegchip + "Nästa: … — Lars (+N till)"; sortering needsAction → försenad → väntande kort
- [x] Detaljsidan använder deriveTodoMode — inline-kopian borttagen
- [x] tests/project-derive-todo.spec.ts (14) + tests/facit-project-list-next-todo.spec.ts

## Verifiering
- [x] tsc (exkl. Codex WIP i CustomerTimeline) → riktade (324 gröna) — per del
- [x] full svit lokalt 5421/5421; CI-grind grön på Del C-koden (run 32990227485, 7be335c4).
      `next build` lokalt EJ körd — Codex WIP i CustomerTimeline.tsx är tsc-röd i arbetsträdet; Vercel
      bygger committad kod (list-API:t live-verifierat i prod → deployen är grön)
- [x] Live-probe prod (demo-ägaren): tillfälligt projekt → list-API ger `dates` ("20 aug – 24 aug ·
      försenad 2 dagar"), `stage` (inget steg — ärligt), `next_todo` (Lars checklistekort) → raderat
- [x] Golden Path 16/16 grönt mot prod (inkl. Station 7 "Projektsteget flyttar sig självt", Station 11)
- [ ] Live: skapa bokning för kund utan offert → projekt föds (första gången någonsin) + ps-02 —
      kräver en riktig bokning på ett riktigt konto; Bee Service är kandidaten (Andreas)
- [ ] Polish (ej blockerande): "Nästa"-etiketten visar kortets fulla titel (kan bli en lång fråga);
      överväg `typeLabel: titel` eller trunkering på ordgräns

## Del D — Statusbandet (Claude Design-handoffen, Andreas "kör på" 2026-08-26) — KLAR (69a7ee93)
- [x] components/projects/ProjectStatusBand.tsx: 3-stegs stepper + "Visa alla 8 steg" (stegmodalen),
      ekonomistaplar + prognos (Planering: bara offererat), Redo att fakturera som KLARSPRÅK
      ("Ja — X kr ofakturerat" / "Nej — värsta blockeraren") i stället för procenten, marginal per
      5-statskontraktet
- [x] Sidhuvud: livscykelchip (sex lägen), datumraden (ProjectDatesInline, redigerbar), primärknapp
      = deriveTodoMode (fyra lägen), Fler åtgärder; Att göra döljer sin egen primärknapp
- [x] Översikt: Att göra + Framdrift vänster, Personal-chips + Projektinfo + Att tänka på höger,
      snabbåtgärder; TwinStrip/ProjectStatusCard/RedoAttFakturera/EkonomiPulsCard borta från Översikt
- [x] Fakturorna hämtas vid sidladdning (livscykelchipen sann från start)
- [ ] Skärmdump mot prod efter deploy (scratchpad/screenshot-project.mjs) → till Andreas

## Del E — förbättringsytor 2 + 5 (Andreas "kör på" 2026-08-26) — KLAR
- [x] Fortnox ROT/RUT i Fortnox form: lib/fortnox/housework.ts (kategori → HouseWorkType, radfält,
      /taxreductions-payload), det påhittade TaxReduction-objektet borta, 'submitted' bara vid lyckad
      begäran (ROT + RUT), driftlarm vid saknad kategori/personnummer. FLAGGAT Pass 3/I2: fältnamnen.
- [x] Sidebar-badge på Leverantörsfakturor = okopplade rader (Karins kö), 30s-puls
- [ ] Kvar från listan: "Koppla faktura till projekt"-knapp (6), "Nästa"-etikett (7), agentattribuering
      i en fil (8), facit som låser fasmodellerna mot varandra (9)

## Del F — leverantörsfakturor ↔ projekt från Fortnox (Andreas "Ja kör" 2026-08-26)
- [x] Steg 1: detaljhämtning per ny faktura (Project/CostCenter/referenser/rader) + VAT
- [x] Steg 2: deterministisk matchning fortnox_project → row_project → reference → Karins kö;
      svep i cronen för redan importerade okopplade rader. sql/v171 skriven.
- [x] v171 körd via MCP 2026-08-26 (Andreas "Kör"), facit-SELECT: 6 kolumner → pushad
- [x] Steg 3 (Andreas "Kör steg 3"): märkning (projektnummer) i materialbeställningens ämne+infobox
      (via offerten) och i arbetsorderns SMS; projektet skapas i Fortnox projektregister vid
      födseln (syncNewProjectToFortnox på fyra skapandevägar + batchSync 'project' i cronen);
      kundfakturan bokförs med Project; matchningen använder exakt Fortnox-nummer först. sql/v172.
- [x] v172 körd via MCP 2026-08-27 (Andreas "Kör!"), facit-SELECT: 3 kolumner + index → pushad
- [ ] Radvis allokering inom samma faktura (fortnox_rows finns nu) — bara om ett riktigt fall dyker upp
- FLAGGAT Pass 3/I2: fältnamnen på SupplierInvoice-detaljen; om Fortnox fyller YourReference vid tolkning

## Del G — Utgående kommunikation, Etapp 0 (OUTBOUND_COMMUNICATION_INVENTORY, Andreas "kör allihop" 2026-08-27)
- [x] 8.1: tio sessionslösa serveranrop till /api/sms/send → sendSmsViaElks, resultatet läses
- [x] 8.2: V3 send_email via lib/email; tool-routerns 404-rutter borta (faktura via sändkärnan,
      send_quote fail-closed)
- [x] 8.4: /api/push/send kräver x-cron-secret eller ägande session; 21 anropare via
      internalPushHeaders(); notify_owner läser delivered
- [x] 8.5/8.6: Smart Communications dubblerande SMS efter offert/faktura borttagna
- [x] tests/facit-outbound-truth.spec.ts (allowlist + push-signatur + inga 404-rutter)
- [ ] Etapp 1–4 (eventregister, konsolidering av tre uppföljningsmotorer, e-poststrypunkt, hubben) —
      efter lansering

## Öppet för Andreas
- ps-08 Recension mottagen har ingen automatisk källa (ingen Google-webhook) — förblir manuell.
- Handoffens "Framdrift"-kort och "Personal"-chips är byggda; ProjectInfoCard (beskrivning/offert)
  finns kvar bara under Ekonomi & offert — säg till om beskrivningen ska synas på Översikt.

---

# Read-only inventering av alla utskick (2026-08-26)

## Plan

- [x] Avgränsa samtliga verkliga SMS-, e-post-, push- och interna notifieringsvägar
- [x] Spåra varje utskick till trigger, mottagare, textkälla, transport, loggning och nuvarande kontroll
- [x] Klassificera kundresa, interna händelser, obligatoriska systemmeddelanden, dubletter och döda mallar
- [x] Dokumentera ett kanoniskt eventregister och rekommenderad migreringsordning för Kommunikationshubben
- [x] Kvalitetssäkra rapportens filreferenser och kontrollera att ingen produktionskod eller SQL ändrats

## Review

- Leverans: `docs/audits/OUTBOUND_COMMUNICATION_INVENTORY.md`.
- Rapporten kartlägger kund-, ägar-, team-, system- och tredjepartsutskick med trigger, kanal,
  mottagare, budskap, textkälla, kontroll och verklig status.
- Bekräftade huvudfynd: auth-trasiga server-SMS, saknad V3-emailroute, trasig Smart
  Communication-email, parallella offert/faktura-/reminder-/reviewmotorer, frikopplad
  email_template-yta och pushroute utan intern authgräns.
- Verifiering: samtliga 67 relativa fillänkar i rapporten finns. Endast rapporten och denna
  uppgiftslogg berördes av inventeringen; ingen produktionskod, SQL eller migration ändrades.

---

# Fortnox: kundsynk vid skapande, leverantörsfakturor i cronen, delbetalning/ROT (2026-08-26, pågår)

Godkänd plan: `~/.claude/plans/ja-d-beh-ver-vi-sorted-avalanche.md`. Andreas-beslut: allt före
1 sep trots freeze; explicit status `customer_paid`; kundsynk direkt på alla fem vägar.

## Migrationer (skrivs nu, körs bara efter "kör", migration FÖRE deploy)
- [x] sql/v169_customer_fortnox_sync_error.sql — fantomkolumnen som gav dubblettkunder i Fortnox
- [x] sql/v170_invoice_customer_paid.sql — ny status + paid_amount/settled_at/cancelled_at + 'credited' i CHECK
- [x] Båda körda via MCP 2026-08-26 (Andreas: "Kör du även de nya SQL 169 och 170") + facit-SELECT verifierad: CHECK innehåller customer_paid+credited, 4 kolumner finns, settled_at-backfill 2 rader / 0 saknade, index finns

## Del 1 — kundsynk vid skapande (commit ae0b7d32)
- [x] P0: `syncCustomerToFortnox` returnerar aldrig success när numret inte persisterats; läser .error; scopar på business_id; rapporteraTystFel
- [x] `syncNewCustomerToFortnox` (kortslut på fortnox_connected → syncCustomerWithTracking → tyst-fel-rapport)
- [x] Fem anropsplatser: actions/create_customer, customers POST, tool-router createCustomer, golden-path lead→kund, approve-actions createCustomer
- [x] `batchSync` ordnar på created_at + läser .error; 2h-cronen sveper kunder per företag
- [x] Serverimporterna (import/bulk) anropar batchSync efter loopen
- [x] `sync/customers`-rutten går genom syncCustomerWithTracking (Type/OrgNr/GLN följer med)
- [x] tests/facit-customer-fortnox-create.spec.ts grönt; facit-fortnox-einvoice orört grönt

## Del 2 — leverantörsfakturor i cronen (commit 6921bfea)
- [x] lib/fortnox/import-supplier-invoices.ts (ruttens rad 42–128 flyttade oförändrade, needs_reconnect vid 403)
- [x] Rutten tunn (auth + isFortnoxConnected + Återanslut-mappning kvar)
- [x] Cronen: import FÖRE betalstatus, needs_reconnect separat + dygnsdedupad tyst-fel-rapport
- [x] facit-fortnox-supplier-invoice-import ompekad; nytt cron-facit

## Del 3 — customer_paid
- [x] Rena helpers + tester: status.ts, customer-share.ts, payment-decision.ts, fortnox/classify-payment.ts; typer (paid_via ersätter payment_method)
- [x] apply-payment-kärnan (transition, paid_amount/paid_via/settled_at, bort med registerFortnoxPayment, exporterad runPostPaymentAutomations + handleProjectEvent)
- [x] sync-payments via klassificeraren, alla UPDATE läser error, en runPostPaymentAutomations
- [x] Rutter: status PATCH via kärnan (Golden Path tack-SMS kvar), mark-paid-text, confirm_payment paidVia, claim-paid/reminder-spärr, portal-API-filter
- [x] ROT-grind: validate-rot-request, eligible/generate `.in('status',[paid,customer_paid])`, skv_requested, import-decision
- [x] Konsumenter via isCustomerSettled + minimal UI (badge/timeline/modal)
- [x] Facit + utökade skv-rot-rut/invoice-derive-status; alla listade "måste förbli gröna" gröna

## Verifiering
- [x] tsc 0 fel
- [x] riktade specar gröna; full svit 5322 gröna (2 facit medvetet ompekade: invoices-page-design filter, stegkedjan sync-payments); next build exit 0
- [ ] v169 + v170 körda efter "kör" → push → CI-grind grön → Vercel-deploy
- [x] docs/REALITY-WEEK.md avvikelser #23–26; tasks/lessons.md om fantomkolumn-klassen (cbcfb372)

---

# Etapp Å — Owner Absence V1 ("Matte håller ställningarna")

Frånvarofönster: normala händelser samlas, en sluten lista deterministiska
eskaleringsklasser pushar igenom, ingen ny behörighet någonsin, deterministisk
återkomstrapport (ingen LLM avgör vad som är akut).

## Migration
- [x] sql/v153_owner_absence.sql — `automation_settings.owner_absence JSONB`
      (samma precedent som auto_approve_config). {from,to,set_by,set_at}.

## Lib (facit först)
- [x] lib/absence/absence-window.ts — isAbsenceActive (ren), read/write helpers
- [x] lib/absence/escalation.ts — classifyAbsenceEvent, sluten AbsenceEvent-union,
      uttömmande switch + never-check
- [x] lib/absence/franvarorapport.ts — byggFranvarorapport, återanvänder
      byggDygnsdigest (generaliserad med `from`) + classifyAbsenceEvent
- [x] lib/jarvis/dygnsdigest.ts — lägg till valfritt `from`-fält (bakåtkompatibelt)

## Push-strypunkt
- [x] lib/notifications/approval-push.ts — absence-gate i sendApprovalPush
      (enda chokepoint), risk_level tillagt i ApprovalLike
- [x] app/api/cron/driftlarm/route.ts — per-business ägar-push för
      payment_failed/automation_activity-failed under aktiv frånvaro

## Cap-avslag-loggning
- [x] app/api/cron/send-reminders/route.ts + quote-follow-up/route.ts —
      tagga payload.cap_exceeded på redan skapat godkännandekort

## API
- [x] app/api/absence/route.ts — GET/POST/DELETE, owner-admin
- [x] app/api/absence/report/route.ts — GET, owner-admin
- [x] tests/permission-contract.spec.ts — registrera båda rutterna

## UI
- [x] components/jarvis/home/MatteHero.tsx — absenceBand-slot (uppdragBand-mönstret)
- [x] components/jarvis/home/AbsenceBand.tsx — snabbknapp, statusrad, avfärdbar
      återkomstrapport (localStorage-dismiss, mandagsmote-mönstret)
- [x] components/jarvis/JarvisHome.tsx — montera AbsenceBand

## Verifiering
- [x] Riktade tester (rött→grönt)
- [x] npx tsc --noEmit
- [x] npx next build
- [x] git status, commit specifika filer, ingen push

---

# Etapp Ä — Jobbpass V1 (Closeout-to-Lifetime)

Digitalt jobbpass som Lars föreslår vid projektavslut: accepterad omfattning,
godkända ÄTA, utfört arbete (signerad fältrapport), UTVALDA foton (ägaren
väljer), egenkontroll, fakturareferens, standardgaranti, valfri
service-samtycke. Inget nytt utskick — bara data + en publik länk.

## Migration
- [x] sql/v154_jobbpass.sql — ny tabell `jobbpass` (id jp_-prefix, business_id,
      project_id UNIQUE, selected_photo_ids JSONB, service_consent boolean,
      status draft/published, token, published_at). RLS: service_role only
      (samma mönster som v148). EJ körd — Andreas kör manuellt.

## Lib (facit först — rött innan bygge)
- [x] lib/jobbpass/jobbpass.ts
      - JOBBPASS_ALLOWED_FIELDS (exporterad allowlist-konstant)
      - deriveJobbpassView() — REN funktion, bygger kundvyn genom EXPLICIT
        fältplock (aldrig spread av råa DB-rader) → strukturellt omöjligt
        att läcka ett fält som inte står i allowlisten
      - loadJobbpassSourceData() — I/O, smala .select()-listor, fail-soft
      - loadSelectedJobbpassPhotos() — .in('id', selectedIds) — bara valda
      - getOrCreateDraftJobbpass / setJobbpassSelection / publishJobbpass /
        getPublishedJobbpassByToken / getJobbpassServiceConsent (I/O)
      - Kommentarer beskriver förbjudna fält i PROSA, aldrig kolumnnamnen
        ordagrant (självreferens-fällan mot källskanningsfacit)
- [x] tests/jobbpass.spec.ts — facit (a)-(f) + källskanning + fake-supabase
      derivationstest för foturvalet (52 tester, gröna)

## Closeout-hook
- [x] lib/projects/complete-project.ts — nytt effect-steg 'jobbpass_proposal'
      i runCompletionEffects (samma dedupe/idempotens-idiom som
      scheduled_review_request/project_debrief), tillagt i completion_batch
      .in()-listan, CloseoutEffectName + userWarningForEffect uppdaterade

## Ägar-ytan
- [x] app/api/projects/[id]/jobbpass/route.ts — GET (kandidatfoton signerade
      + nuvarande urval) / PATCH (foturval + samtycke), owner-admin
- [x] app/api/projects/[id]/jobbpass/publish/route.ts — POST publicera
      (genererar token), owner-admin
- [x] app/dashboard/projects/[id]/jobbpass/page.tsx — fotoval, förhandsgranskning,
      samtyckesbock, publicera-knapp, kopiera länk

## Publik portalvy
- [x] app/api/jobbpass/public/[token]/route.ts — GET, publik, 404 om ej published
- [x] app/jobbpass/[token]/page.tsx — svensk, ljus/teal, mobiloptimerad

## Approvals-UI
- [x] app/dashboard/approvals/page.tsx — TYPE_CONFIG-post + särskild gren för

---

# Etapp L1 — Paketeringens sanningsbuggar (2026-08-18)

Bugfixar/konsolidering under launch freeze, inga nya funktioner, inga nya
priser/copy-beslut. 10 verifierade fynd, alla åtgärdade.

- [x] app/dashboard/settings/billing/page.tsx — läste billing.plan.status/
      trialEndsAt/currentPeriodEnd som aldrig fanns i /api/billing-svaret
      (plan/subscription/trial). BillingData-interfacet skrivet om mot
      faktiskt API-svar; lokal PLANS-priskonstant ersatt med
      getPlanPrice/getPlanLabel.
- [x] app/dashboard/settings/page.tsx:~4347 — `currentPlan === 'Professional'`
      matchade aldrig lowercase-DB-värdet → visade alltid 2 495 kr. Bytt till
      useBusinessPlan().plan + getPlanPrice/getPlanLabel. (Sido-notering: den
      lokala SMSUsageWidget-komponenten i samma fil, rad ~241/243, har samma
      casing-bugg mot egna hårdkodade SMS-siffror som redan avviker från
      SMS_QUOTAS — INTE fixad, utanför de 10 fynden, flaggad separat.)
- [x] components/UpgradeModal.tsx + app/dashboard/agent/page.tsx:~1457 —
      hårdkodat "Professional — 5 995 kr/mån" ersatt med
      getPlanLabel('professional')/getPlanPrice('professional').
- [x] app/dashboard/marketing/leads/page.tsx — villkorlig return före
      useEffect (Rules of Hooks-brott) flyttad till efter alla hooks,
      tillsammans med addon-gaten.
- [x] lib/feature-gates.ts hasFeature() — fail-closed på okänd nyckel
      (var fail-open). Alla callsites grep-verifierade mot FEATURE_GATES,
      se tests/feature-gates-fail-closed.spec.ts för facit-listan.
- [x] app/api/agent/trigger/route.ts — TEAM_AGENTS_ALLOWED upprätthålls nu
      server-side (isAgentAllowed) för externt (cookie-)autentiserade anrop.
      internalSecret-anrop (webhooks/crons/agent_handoff) undantagna
      medvetet — Lisa svarar på inkommande samtal/SMS på alla planer.
- [x] app/onboarding/components/StepPayment.tsx — död komponent (ingen
      importerar den, verifierat), raderad.
- [x] lib/feature-gates.ts — gate-tabellens team_members/users-limit (var
      3/25/∞) alignad till USER_LIMITS (3/5/∞), kommentar om att USER_LIMITS
      är kanonisk.
- [x] app/api/team/invite/route.ts:~54 — defaultplan vid saknad DB-rad
      ändrad 'professional' → 'starter', konsekvent med lib/auth.ts,
      lib/get-plan.ts, lib/useBusinessPlan.ts.
- [x] Prishårdkodningar konsoliderade till getPlanPrice:
      app/onboarding/components/Step5Activate.tsx (Firman/Storfirman-kort),
      app/api/admin/metrics/route.ts (PLAN_PRICES-fallback).

Verifiering: nya tester tests/feature-gates-fail-closed.spec.ts +
tests/team-agent-gate.spec.ts (grönt, 108/108 tillsammans med befintliga
td52-gating/agent-team-spec), `npx tsc --noEmit` 0 fel, `npx next build` 0.

      'jobbpass_proposal' (länk till ägar-ytan i st f rakt godkänn, samma
      mönster som project_debrief), "Hoppa över" avvisar

## Hanna-kopplingen
- [x] getJobbpassServiceConsent(projectId) — läsfunktion, dokumenterad var den
      SKA läsas (befintlig recensions-/rekommendationsflöde), inte kopplad
      till någon cron nu

## Behörighetskontrakt
- [x] tests/permission-contract.spec.ts — registrerade
      projects/[id]/jobbpass + projects/[id]/jobbpass/publish (owner-admin)

## Verifiering
- [x] npx playwright test tests/jobbpass.spec.ts --no-deps (rött → grönt, 52 st)
- [x] npx playwright test tests/permission-contract.spec.ts --no-deps (26 st)
- [x] npx playwright test tests/canonical-project-completion.spec.ts
      tests/project-closeout-copilot.spec.ts --no-deps (26 st, oberörda)
- [x] npx tsc --noEmit (0 fel)
- [x] npx next build (ren build)
- [x] git status + ett commit med specifika filer, ingen push

---

# OperatingExperiment Etapp 2 — förslag/beslutslager (2026-08-19)

Bygger på Etapp 1 (e2644c1e): sql/v157 (EJ körd), lib/experiment/types.ts,
lib/experiment/measure.ts (läs-only). Etapp 2 = förslag → bekräftelse →
inskrivning → redovisning → ägarbeslut. INGEN LLM. Allt fail-soft mot
saknad v157 (42P01).

## Lib
- [x] lib/experiment/types.ts — + EXPERIMENT_DEFAULT_MEASURES (sena_andringar,
      extra_timmar, marginal)
- [x] lib/experiment/propose.ts — proposeExperiment(), dedupe (livstid,
      pending_approvals + operating_experiment, per source_pattern_id),
      opts.allowDuplicate för continue_testing-grenen
- [x] lib/experiment/enroll.ts — maybeEnrollProject(), tids-/kapacitetscheck,
      aldrig blockerande
- [x] lib/experiment/report.ts — buildReadoutBody/buildReadoutCardCopy (rena),
      sweepExperimentReadouts (I/O, concluded+frozen_summary EN gång)

## Approvals-flödet
- [x] app/api/approvals/[id]/route.ts
      - GET (hämta ett kort, business-scoped) — decision-sidan behöver den
      - case 'playbook_pattern_confirmation' — fire-and-forget proposeExperiment
        efter lyckad business_knowledge-insert
      - case 'playbook_kickoff_suggestion' — fire-and-forget maybeEnrollProject
        efter lyckad checklist-insert
      - case 'operating_experiment_proposal' — godkänn: INSERT operating_experiment
        (status active). Avvisa: ingen skrivning. Fail-soft 42P01.
      - case 'operating_experiment_readout' — decision via edited_payload.decision
        (continue_testing|made_standard), reject-side-effect (rejected)
- [x] lib/approvals/action-contract.ts — båda nya typer EXECUTABLE_ACTION
- [x] lib/approvals/routing.ts — båda owner_admin

## UI
- [x] app/dashboard/approvals/page.tsx — TYPE_CONFIG + särskild gren för
      'operating_experiment_readout' (Link till beslutssida, husets
      target_route-idiom som jobbpass_proposal — INGA nya fetch(`/api/approvals)-anrop)
- [x] app/dashboard/experiments/[approvalId]/page.tsx — beslutssidan, tre knappar

## Cron
- [x] app/api/cron/maintenance/route.ts — steg 5, sweepExperimentReadouts per
      företag (rider på befintlig daglig cron, ingen ny vercel.json-rad)

## Facit
- [x] tests/operating-experiment.spec.ts — utökad (Etapp 2-delarna)
- [x] tests/e2e-golden-path/experiment-proof.spec.ts — eget playwright-projekt,
      SKIP ärligt om v157 saknas
- [x] playwright.config.ts — --project=experiment-proof

## Verifiering
- [x] Riktade playwright-körningar (rött→grönt)
- [x] npx tsc --noEmit (0 fel)
- [x] npx next build > buildlog.txt 2>&1 (0)
- [x] git status, ETT commit specifika filer, ingen push
# Launch hardening — Codex lane (2026-08-22)

Avgränsning: Claudes externa, DB-verifierade lanseringschecklista är ensam
kanonisk. Denna arbetslista omfattar bara kod, facit och tekniska bevis och
skapar ingen konkurrerande launch-checklista eller roadmap.

- [x] Supporteskalering rapporterar sanningen om ticket respektive internt larm
- [x] Google-recensionslänk villkoras inte av positiv nöjdhet (ingen review gating)
- [x] Browserlösa facit täcker larmfel, dedupe/ägarskap och nöjdhetsflödet
- [x] Kritiska publika/tokenbaserade rutter får ett smalt regressionsfacit
- [x] Tvåtenant-harneset valideras lokalt och körs om disponibla env/testkonton finns
- [x] `npx tsc --noEmit`, riktade tester och `npx next build` är gröna

## Review

- Supportticketen och 46elks-larmet är nu två separata sanningar. Saknad
  konfiguration, noll mottagare och transportfel ger explicit icke-levererat
  utfall; kundtexten påstår aldrig att teamet notifierats då.
- Modellretry/dubbelklick återanvänder öppet supportärende inom samma tenant,
  tråd och kategori. Ett löst ärende blockerar inte en senare eskalering.
- Nöjdhet lagras internt, medan Google-länken är neutral för båda svaren.
- Publik offert/ÄTA/portal har smal regressionsvakt för dynamiska svar,
  allowlistade DTO:er, tenant-/kundbindning, dedupe och generiska serverfel.
- CI-kontraktslistan + nya launchfacit: 108/108 gröna. Supportsviten: 37/37.
  Det publika/tokenbaserade urvalet: 91/91. `npx tsc --noEmit`: 0 fel.
  `npx next build`: exit 0.
- Full standardsvit startades men innehåller skarpa anrop mot app.handymate.se;
  i den nätverksbegränsade miljön stoppades den vid 907/5166 med EACCES-fel,
  alltså inte ett produktfacit för denna diff.
- Tvåtenant-harneset och dess säkerhetsspärr är validerade. Skarpkörningen
  2026-08-22 mot två autentiserade konton i olika disponibla företag gav
  51/51 gröna API/RLS-kontroller: egenläsning fungerar; främmande SELECT,
  INSERT, UPDATE och DELETE nekas för samtliga sex tabeller; credentials är
  helt oläsbar. Två direkt-SQL-katalogkontroller hoppades ärligt över utan
  delat databaslösenord och verifierades separat av databasägaren: funktionen
  är SECURITY DEFINER och grants stämmer. Read-only cleanup-stickprov gav
  noll kvarvarande `rls_it_*`-rader i alla fem fixturetabeller.

Resultaten rapporteras till Claude för den kanoniska lanseringsartefakten;
denna sektion är endast utvecklingsbokföring.

---

# Kreativt slutgenomsvep — gemensam avsändare (2026-08-26)

- [x] Ta bort dekorativa etiketter i övre högra hörnet från samtliga bildkällor
- [x] Ta bort sidfotens vänstertexter och centrera `handymate.se`
- [x] Förstora och standardisera H-logotypen till vänster
- [x] Anpassa artikelomslag och social launch-kit till samma kontrakt
- [x] Rendera om hela biblioteket och båda kontaktarken
- [x] Facit- och visuellt granska desktop-, 4:5- och 9:16-original

## Review

- Båda renderkällorna använder nu en ren topp med en optiskt beskuren och
  större H-symbol till vänster; ingen kampanjetikett renderas i övre höger.
- Sidfoten innehåller endast `handymate.se`, centrerad oberoende av format.
- 52 biblioteksoriginal, sju artikelomslag och åtta social-launch-original är
  omrenderade. Det samlade slutarkivet innehåller även den nya logotypmastern
  och social-launch-kitet under en egen mapp.
- Layoutfacit: 21/21 Playwright-tester gröna. Fullstorlekskontroll utförd på
  agentkort, mörk 4:5-bild, artikelomslag och socialt original.
- Projektkontroll: `npx tsc --noEmit` och `npx next build` gröna. Builden
  behåller projektets befintliga varningar om dynamiska serverrutter.

---

# Verksamhetsöversikt — direkt stegbyte och projekt-header (2026-08-26)

- [x] Utöka den delade åttastegsstripen med hoverkort, mini-ikoner och tydliga
  interaktions-/laddningstillstånd
- [x] Koppla verksamhetsöversikten till befintlig tenant-säkrad stage-route
  med lokal bekräftelse, felåterställning och omedelbar UI-uppdatering
- [x] Ta bort radens generella utfällning och göra `Öppna projekt` till en
  större, separat primär handling
- [x] Montera den delade åttastegsöversikten som kompakt header på projektsidan
  utan att duplicera ekonomi- eller statuskortets ansvar
- [x] Lägg browserlösa kontraktstester för direktbytet, hoverkontraktet och
  projekt-headerns återanvändning
- [x] Verifiera riktade tester, `npx tsc --noEmit`, `npx next build` och diff

## Review

- Verksamhetsöversikten byter nu projektsteg via den befintliga
  `/api/projects/[id]/advance-stage`-rutten. Klicket öppnar en liten lokal
  bekräftelserad eftersom stage-motorn kan starta automationer; ingen generell
  dropdown eller projektutfällning används.
- Lyckat byte uppdaterar både deal-kopplade projekt och orphan-projekt i
  parent-state direkt. Fel lämnar föregående steg orört och visas på kortet.
- Den delade stripen visar åtta Lucide-ikoner, hover/fokus-kort, laddning och
  en namngiven header-variant. Projektsidan återanvänder exakt samma komponent.
- `Öppna projekt` är nu en separat teal primärknapp och är enda vägen från
  projektkortet till projektsidan; stegklick navigerar aldrig.
- Verifiering: 16/16 riktade stage-/UX-facit gröna, `npx tsc --noEmit` rent,
  `npx next build` exit 0. Builden visar endast projektets befintliga
  statiska auth-/saknad lokal Supabase-env-varningar.
- Shared-worktree-notering: Claudes Fortnox-commit `2896a6dc` inkluderade de
  spårade UI-filerna medan verifieringen pågick. Inget har återställts eller
  force-flyttats; det nya facittestet ligger separat i arbetskatalogen.

---

# GTM-strategi + Operating Plan för Christoffer (2026-08-23)

- [x] Stäm av juliplanerna mot dagens produkt-, pris- och lanseringsläge
- [x] Uppdatera strategisk position, ICP, erbjudande och kanalordning
- [x] Ersätt kalla mass-SMS som standard med peer selling och juridiskt grindad prospektering
- [x] Skriv en konkret sexveckorsplan med roller, kvoter, demo och uppföljning
- [x] Lås dokumenthierarkin så den tekniska lanseringschecklistan inte dubbleras
- [x] Korsgranska dokumenten och verifiera interna hänvisningar

## Review

- Båda julidokumenten är ersatta med ett dagens-läge-kontrakt: strategin
  håller position, ICP, erbjudande och kanalordning; Operating Plan håller
  Christoffers sexveckorsutförande, demo, uppföljning och mätetavla.
- Kalla mass-SMS till okända är borttaget som standardkanal. Manuell riktad
  kontakt ligger bakom separat relevans-, laggrunds- och kanalbedömning.
- Dokumenthierarkin hänvisar till den externa tekniska lanseringschecklistan
  utan att duplicera den.
- Firman och Storfirman, månads- och årsvis, verifierades skrivskyddat mot den
  körande databasens `billing_plan`; samtliga fyra Stripe-priser är satta.

---

# Nedladdningsbart innehållsbibliotek V1 (2026-08-23)

- [x] Förankra publik namnhierarki: digitalt team, Matte som chefsagent och Uppdrag som en produktberättelse
- [x] Skapa kampanjfamiljen “Hälsa på ditt team” med riktiga agentprofiler
- [x] Skapa kampanjfamiljen “2006 → 2026” utan obelagda konkurrentpåståenden
- [x] Skapa kampanjfamiljen “Så arbetar teamet åt dig” med konkreta automationskedjor
- [x] Skapa fristående inlägg, Reel-omslag, captions, alt-texter och publiceringsguide
- [x] Rendera, visuellt granska, testa och paketera allt som en nedladdningsbar ZIP

## Review

- 29 publiceringsklara bilder: tre karuseller, fyra fristående inlägg och tre
  vertikala Reel/Story-omslag. Därtill fem kontaktark och sex lokala
  agentporträtt.
- Budskapsguide och kampanjcopy låser “det digitala teamet”, Matte som
  chefsagent och Uppdrag som en av flera produktberättelser.
- Visuell QA genomförd mot alla kontaktark samt fullstora agent-, framtids-,
  automations- och reaktiveringsbilder.
- Nedladdningspaket: `public/marketing/handymate-content-library-v1.zip`.
- `tests/content-library-v1.spec.ts`: 12/12 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# Förlanseringshype + samlad publiceringskalender (2026-08-23)

- [x] Sätt en trestegsdramaturgi: utmana → avslöja → bevisa
- [x] Skapa tio separata förlanseringsassets för T–21 till T0
- [x] Skriv P1–P10 med CTA och gemensam alt-text
- [x] Mappa varje publiceringsdag till kanal, format, exakt fil och copy
- [x] Lås karusellordning och markera kontaktark som ej publicerbara
- [x] Uppdatera ZIP-paket, renderare och regressionsfacit

## Review

- Arbetsdatum för lansering är 2026-09-14; kalendern är relativ och kan flyttas
  utan att dramaturgin ändras.
- Tio nya bilder tillkom: sju 4:5-teasers/reveals och tre 9:16-bilder för
  T–3, T–1 och T0. Biblioteket innehåller nu 39 publiceringsklara PNG-filer.
- Kalendern täcker 24 augusti–9 oktober med exakt filordning, kanal, format,
  copy-ID, CTA och efterlanseringssekvens.
- Visuell QA genomförd mot förlanseringens kontaktark och fullstora nyckelbilder.
- `tests/content-library-v1.spec.ts`: 14/14 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# Video Production Pack + Seedance 2.5 (2026-08-23)

- [x] Verifiera Seedance 2.5 mot ByteDances officiella källor
- [x] Definiera hybridgränsen mellan verklig film, verklig UI och AI-B-roll
- [x] Skapa fem videokoncept med manus, storyboard och shot list
- [x] Skapa produktionsklara Seedance-prompter och kvalitetsgrind
- [x] Lägg videorna i publiceringskalendern och nedladdningspaketet
- [x] Kör dokumentfacit, tsc och produktionsbygge

## Review

- Seedance 2.5 verifierades mot ByteDances officiella lansering och modellsida:
  30 sekunder per generering, förlängning och multimodala referenser; officiell
  API-åtkomst beskrevs som kommande via BytePlus ModelArk.
- Fem filmer är produktionssatta: grundarmanifest, 45-sekunders produktbevis,
  team-reveal, 2006→2026 och en verklig automationskedja.
- Hybridgränsen är explicit: Andreas och produkt-UI är verkliga; Seedance äger
  B-roll, miljöer, kontrollerad porträttrörelse och konceptövergångar.
- Sex färdiga Seedance-prompter, referenspaket och kvalitetsgrind ingår i ZIP.
- `tests/content-library-v1.spec.ts`: 18/18 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# Profilbildspaket (2026-08-23)

- [x] Skapa primär mörk teal profilbild med optiskt centrerad H-symbol
- [x] Skapa ljus, inverterad teal och transparent 1080×1080-master
- [x] Skapa intern safe-area-guide för rund och kvadratisk beskärning
- [x] Dokumentera kanalval och vad som aldrig ska publiceras
- [x] Uppdatera ZIP, facit och produktionsverifiering

## Review

- Fem 1080×1080-original levereras: primär mörk teal, ljus, inverterad,
  transparent master och en intern safe-area-guide.
- Den transparenta mastern är verifierad som riktig RGBA-PNG; den primära
  mörka varianten är rekommenderad profilbild i sociala kanaler.
- Innehållsbiblioteket omfattar nu 52 publiceringsklara bilder och nio
  kontaktark. Safe-area-guiden är uttryckligen märkt som intern.
- `tests/content-library-v1.spec.ts`: 20/20 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# LinkedIn-banner (2026-08-23)

- [x] Verifiera aktuell företagssidesstorlek mot LinkedIns officiella hjälp
- [x] Skapa ett tidlöst, on-brand omslag i central säker zon
- [x] Rendera, visuellt granska och lägga i nedladdningspaketet
- [x] Kör facit, tsc och produktionsbygge

## Review

- LinkedIns aktuella rekommendation verifierades mot officiell hjälp:
  4200×700 px, PNG/JPEG och högst 3 MB.
- Slutfilen är 4200×700, 2,29 MB och visuellt granskad i originalformat.
  Huvudbudskapet ligger centralt; dekorativa ytterelement tål beskärning.
- Renderaren isolerar nu varje original före export och skriver PNG-filer via
  buffert med retry, så ultrabreda format inte kan påverka övriga kampanjer.
- `tests/content-library-v1.spec.ts`: 22/22 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# LinkedIn-artikelserie (2026-08-23)

- [x] Förankra format och newsletter-upplägg i LinkedIns aktuella riktlinjer
- [x] Skriva sju kompletta artiklar ur Handymates verifierade produktberättelse
- [x] Förankra reaktiveringsartikeln i svensk lag och IMY:s vägledning
- [x] Skapa sju egna 1920×1080-omslag och inlinebildplan
- [x] Visuellt granska samtliga omslag och uppdatera nedladdningspaketet
- [x] Kör artikel-, bild-, typ- och produktionsfacit

## Review

- Sju artiklar om 707–909 ord levereras i serien `Framtidens
  hantverksföretag`, färdiga för publicering från Andreas profil.
- Serien går varje torsdag 27 augusti–8 oktober och är införd i den auktoritativa
  publiceringskalendern utan att skapa dubbla företagsinlägg samma dag.
- Sju sammanhållna 1920×1080-omslag och exakta inlinebildplaceringar ingår.
  Kontaktark och tre typografiskt svåraste original granskades visuellt.
- Reaktiveringsartikeln håller GDPR:s laggrund separat från
  marknadsföringslagens kanalregler och länkar Riksdagen, IMY och
  Konsumentverket. Texten ger inte juridiska garantier.
- `tests/content-library-v1.spec.ts`: 26/26 gröna över desktop + mobil.
  `npx tsc --noEmit`: 0 fel. `npx next build`: exit 0.

---

# Social Launch Kit — kampanj 01 (2026-08-23)

- [x] Förankra tonalitet, färg och budskap i Handymates designsystem
- [x] Skapa 30-dagars contentplan och kanalprinciper
- [x] Skapa kampanjmanus: LinkedIn-karusell, Instagram och Reel
- [x] Generera ImageGen-bakgrunder utan produktpåståenden eller fejkad UI
- [x] Rendera publiceringsklara assets med riktig logotyp och exakt svensk text
- [x] Visuell QA, filinventering och leveransnotering

## Review

- Två dokumentära, nordiska ImageGen-källbilder skapades utan text, UI,
  logotyper, belopp eller testimonial-påståenden.
- Åtta finalassets renderades deterministiskt: sex LinkedIn-slides,
  Instagram 4:5 och Reel 9:16. Riktig Handymate-logotyp samt lokala
  Space Grotesk/DM Sans används.
- Kampanjmanus, captions, alt-texter, Reel-storyboard, 30-dagarsplan och
  återanvändbara bildprompts ligger i `docs/marketing/social-launch-kit/`.
- Visuell QA genomförd mot kontaktark och tre fullstora nyckelassets.
- `tests/social-launch-kit.spec.ts`: 5/5 gröna. `npx tsc --noEmit`: 0 fel.

---

# Handymate Launch Desk V1 (2026-08-24)

- [x] Lås service-role-only datakontrakt för prospekt, kontaktutfall och spärrar
- [x] Bygg rena domänregler för juridisk kanalgrind, fit-poäng och daglig prioritering
- [x] Bygg superadmin-API för import, sökning, uppdatering, aktivitetslogg och spärr
- [x] Bygg klickstyrd AI-brief som bara får använda källmärkta prospektfakta
- [x] Bygg mobilvänlig intern arbetsyta under `/admin/launch`
- [x] Lägg till CSV-mall/import och länk från befintlig adminpanel
- [x] Facit-testa auth, ingen autosändning, källkrav, spärr och mättratt
- [x] Kör riktade tester, `npx tsc --noEmit` och `npx next build`

## Scopegränser

- Launch Desk är Handymates interna säljstöd, aldrig kundernas `leads_outbound`.
- V1 skickar inga SMS, mejl, brev eller LinkedIn-meddelanden. En människa
  verkställer alltid kontakten utanför ytan och loggar utfallet.
- AI får formulera brief och utkast från sparade fakta, men får inte göra
  research, lägga till osourcade fakta eller välja bort spärrar.
- Kalla SMS ingår inte. Oklassad bolagsform får bara manuell telefonbedömning
  eller ingen kontakt; systemet gissar aldrig kanalbehörighet.

## Review

- Ny superadminyta under `/admin/launch`: källkontrollerad CSV-import,
  deterministisk fit, daglig prioritering, kontaktkomplettering, klickstyrd
  AI-brief, manuell utfallslogg, nästa steg och permanent spärr.
- `gtm_account`, `gtm_activity` och `gtm_suppression` är service-role-only.
  Kontaktutfall + pipeline-status och spärr + auditnotering sker atomiskt via
  två snäva RPC:er. Migrationen ligger i `sql/v166_launch_desk.sql` och ska
  köras manuellt före användning.
- Kall kontakt till enskild/okänd/oklassad bolagsform är stängd i både kod
  och RPC. SMS finns inte som kanal. Launch Desk importerar eller skriver
  aldrig i kundernas `leads`/`leads_outbound`.
- Varje rad bär ändamål, rättslig grund, källa, kontrolldatum och ett
  granskningsdatum efter 180 dagar. AI-snapshoten utesluter e-post och telefon,
  och varje e-postutkast får en obligatorisk stoppformulering.
- `tests/launch-desk.spec.ts` + kolumn-, schema- och permissionsfacit:
  128/128 gröna över desktop och mobil. `npx tsc --noEmit`: 0 fel.
  `npx next build`: exit 0 (befintliga miljö-/dynamic-route-varningar kvar).

---

# Lanseringspaket — kommersiell sanning och produktbevis (2026-08-26)

## 1. Bränsle som verkligt tak

- [x] Kartlägg alla kostnadsbärande strypunkter och definiera ett fail-closed entitlement-kontrakt
- [x] Bygg valbara, namngivna påfyllningsnivåer från en kanonisk serverkonfiguration
- [x] Stoppa ny kostnadsbärande agentverkställighet vid tomt Bränsle utan att stoppa läsning, användarens manuella arbete eller redan pågående externa leveranser
- [x] Visa exakt vad som pausas, vad som fortsätter och hur en påfyllning återstartar teamet
- [ ] Facit-testa nollgräns, påfyllning, samtidighet, ägargrind, Stripe-webhook och fail-closed mätfel — allt utom atomisk samtidighetsreservation är täckt; V1 stoppar nästa nya kostnad men två exakt samtidiga anrop kan fortfarande passera samma sista saldoavläsning

## 2. En enda prissanning

- [x] Konsolidera planvolymer, användargränser, månads-/årspris och garantitext till kanoniska källor
- [x] Synka onboarding, billing, publik copy i detta repo och marknadsdokumentation
- [x] Bestäm och implementera grundarkundsgarantin konsekvent
- [x] Förklara årsbetalning, uppsägning och Bränsle utan intern kredit-/COGS-vokabulär

## 3. Lisa — skarpbevis

- [x] Definiera exakt marknadsförd kedja och skilj bevisade delsteg från framtida röstagentfunktion
- [x] Bygg/utöka ett säkert käll- och kontraktsbevis för inkommande/missat samtal → kund/lead/deal → SMS/dialog → synligt facit
- [ ] Kör hela kedjan inklusive bokning mot disponibel test-/demomiljö — blockerat av tomt 46elks-saldo och avsaknad av tilldelat telefonnummer på testföretagen
- [x] Justera copy så ingen yta påstår att Lisa redan är en fri talande röstagent

## 4. Namn och resultatlandningssidor

- [x] Standardisera Matte som "chefsagent" i kundvänd copy; behåll Uppdrag som funktionsnamn
- [x] Skapa tre publika resultatberättelser: hitta pengar, skydda marginal, ta bort administration
- [x] Återanvänd verkliga produktkedjor, godkännanden och verifierade utfall; inga fejkade kundcase
- [x] Lägg till browserlösa copy-/route-facit

## 5. Oklippt produktdemo

- [x] Synka demo-manus mot sexstegsstoryn och nuvarande pris-/produktlöften
- [x] Skapa en reproducerbar inspelningskörning med demoreset, exakta klick och fallback
- [x] Verifiera de nya publika landningarna visuellt i riktig webbläsare på desktop och mobil
- [ ] Spela in den oklippta produktfilmen — körplanen är klar men den anslutna webbläsarytan saknar videoexport och produktionsdemon kräver en godkänd inloggning

## Slutverifiering

- [x] Riktade facit gröna
- [x] `npx tsc --noEmit` rent
- [x] `npx next build` grönt
- [x] Visuell mobil/desktop-QA på de publika ytorna
- [x] Review-sektion med exakta kvarvarande externa blockerare

## Review

- Bränsle är nu en serverauktoritativ stoppgrind före Matte, agenttrigger,
  central SMS-sändning och de direkta AI-/röstvägarna. Påfyllning erbjuds som
  tre namngivna, planrelativa nivåer; klienten kan inte bestämma beloppet och
  Stripe-retry kan inte fylla på två gånger för samma checkout-session.
- Planpris, årspris, användare, SMS, samtal och garanti läses från samma
  kommersiella fakta i onboarding och billing. Ett äldre `null`-fel i
  obegränsade användar-/samtalsnivåer upptäcktes och rättades samtidigt.
- Matte heter publikt Chefsagent och funktionen Uppdrag. `Mission Control`
  förblir ett internt arkitekturnamn. Tre riktiga resultatlandningar finns i
  applikationen och sitemapen och har granskats i desktop- och mobilbredd.
- Lisas kodkedja har ett separat lanseringsfacit och ett skarpt
  sjustegsprotokoll. Det externa facitet är INTE grönt än: 46elks har tomt
  saldo och testföretagen saknar tilldelade nummer. Ingen kundcopy lovar därför
  en komplett talande röstagent.
- Den oklippta sexstegsdemon har ett synkat manus och en exakt
  inspelningskörning. En MP4 skapades inte eftersom webbläsarverktyget saknar
  videoexport; inspelningen är ett mänskligt capture-steg efter inloggning och
  demoreset.
- Kvarvarande Bränslebegränsning: stoppet är praktiskt fail-closed före varje
  nytt kostnadsanrop, men är inte en atomisk reservationsmotor. Två anrop som
  startar i exakt samma ögonblick kan läsa samma sista saldo. En strikt
  öresgräns under samtidighet kräver ett separat reservations-/avräkningssteg.
- Slutfacit: 102/102 riktade tester gröna, `npx tsc --noEmit` 0 fel och
  `npx next build` exit 0. Fullsviten startades men de sessionsberoende testerna
  anropar `app.handymate.se`; nätverksgrinden gav `EACCES`, inte produktfel, och
  körningen avbröts vid 1 100/5 246.

---

# Kundtidslinje per projekt (2026-08-26)

## Plan

- [x] Kartlägg vilka tidslinjehändelser som har en bevisbar projektkoppling
- [x] Lägg ett gemensamt, tenant-säkert projektkontextlager på tidslinjesvaret
- [x] Bygg en mobilvänlig projektgrupperad vy med kanalöversikt och kronologiskt alternativ
- [x] Låt osäkra kundövergripande kontakter ligga i en tydlig restgrupp — gissa aldrig projekt
- [x] Lägg browserlösa facit för resolver, tenantfilter, grupperings-UX och direktlänkar
- [x] Kör riktade tester, `npx tsc --noEmit` och `npx next build`

## Review

- Kundtidslinjen startar nu projektgrupperad men kan växlas tillbaka till en
  enda kronologisk lista. Varje projektgrupp visar sina bevisade kanaler,
  händelseantal och en direktlänk till projektet.
- Projektkopplingen är fail-closed och accepterar bara direkt `project_id`
  eller tenant-/kundfiltrerade kedjor via bokning, faktura, ärende, offert
  eller lead. Fritext och "kundens enda projekt" används aldrig som gissning.
- Utgående SMS läses nu ur revisionskällan `sms_log`, så säkra relationer för
  offert-, faktura-, boknings- och projektstegs-SMS kan följa med. Den enklare
  speglingen i `sms_conversation` dedupliceras mekaniskt.
- 53/53 riktade kommunikations-/resolverfacit gröna, `npx tsc --noEmit` rent
  och `npx next build` exit 0. Kolumnvakten hade ett samtidigt, orelaterat
  rött fynd i `lib/project-ai-engine.ts` (`project_milestone.id`); inga nya
  fel pekade på kundtidslinjens frågor.

---

# Tilldela projekt från vunnen-affären (2026-08-26)

## Plan

- [x] Återanvänd affärens befintliga ansvarige och projektets `project_assignment`
- [x] Lägg ett frivilligt, mobilvänligt personval i Grattis-modalen
- [x] Validera behörighet, aktiv användare och tenant före projektskapandet
- [x] Skapa tilldelningen server-side och visa ett ärligt delresultat om just tilldelningen misslyckas
- [x] Lägg browserlösa facit och kör tester, `tsc` och build

## Review

- Grattis-modalen har nu ett frivilligt personval som förväljer affärens aktiva ansvarige när det finns en sådan.
- Samma projektskapandeanrop skapar en riktig `project_assignment`; behörighet, aktiv användare och tenant valideras före första projektskrivningen.
- Deduplicerings- och retry-vägarna återanvänder samma idempotenta tilldelning, och ett tilldelningsfel visas som ett ärligt delresultat utan falskt lyckandebesked.
- Verifierat: 43/43 riktade browserlösa facit gröna, `npx tsc --noEmit` rent och `npx next build` exit 0.

---

---

## Plan: AI-kostnad — varje token mäts per kund, Bränsletaket (15 %) gäller överallt (2026-08-27)

Andreas: "väldigt viktigt att säkerställa att alla anrop som kostar tokens faktiskt mäts av för respektive kund" + taket = 15 % av planpriset (finns redan som Bränsle, `FUEL_PLAN_BUDGET_ORE`).

Källgranskning 2026-08-27 (47 externa AI-anropsplatser i lib/ + app/):
- Omätta: `lib/agent/orchestrator.ts` (V3 run_agent: flat-taxa 0.000009/token, bara agent_runs — aldrig cost_event/Bränsle), `lib/pipeline-ai.ts` (Haiku via voice/analyze), `lib/ai.ts` (död kod).
- Ogrindade (kostar tokens utan Bränslekoll): ai-copilot, onboarding-chat/scrape, generate-insights-cron, agent-context-cron (context/preferences/pricing/proactive-care), communication/evaluate, gmail-lead-import + email/inbound, leads/outbound + neighbours, monthly-review, meeting-worker (Whisper), playbook-pattern, storefront/generate, quotes/ai-generate, Matte intent-agent (SMS + Gmail), customer-facts, quote-nudge, autopilot-SMS, seasonality, orchestrator.
- Inkonsekvens: `checkFuelGate` ger `fuel_unavailable` för planen `enterprise` (1 konto i prod) medan `fuelBudgetOreForPlan` dokumenterat faller till Storfirman-nivån → det kontot har SMS + agenter avstängda i tysthet.

Princip: **Bränsle slut/oläsbart ⇒ samma väg som saknad API-nyckel** (fail-closed, deterministisk fallback, aldrig krasch).

- [x] `lib/costs/fuel.ts`: `fuelAllows(supabase, businessId, site)` en-radare; enterprise-konsekvens; ny bucket `pipeline_call_analysis`
- [x] Mätning: orchestrator (riktig usage×modell via `meterDirectLlmCall`, flat-taxan bort), pipeline-ai, ta bort `lib/ai.ts`
- [x] Grindar i libs (fallback-vägen): intent-agent, customer-facts, quote-nudge, autopilot generate-sms, seasonality, neighbour/letter, monthly-review, detect-pattern, context-engine ×2, pricing-engine, proactive-care, process-job (släpper claim), orchestrator (`checkCostGuards`), next-best-action-prompt (användes via relativ import — inte död)
- [x] Grindar i rutter (402 + `code`): ai-copilot, onboarding ×2 (bara med session), communication/evaluate, leads/outbound, leads/neighbours, monthly-review POST, storefront/generate, quotes/ai-generate; crons: generate-insights, gmail-lead-import (meddelanden lämnas olästa), email/inbound (arkiveras, ingen lead)
- [x] "Ingen kund ⇒ ingen LLM": generate-letter/neighbour/autopilot-SMS kör malltext utan business_id; `isLikelyLead`/`parseLeadFromEmail` kräver mätkontext
- [x] Facit `tests/facit-ai-kostnad-sanning.spec.ts` (16 tester): varje extern AI-fil mäts (själv eller av namngiven anropare) och grindas (själv eller i namngiven entrypoint); explicit, motiverad undantagslista (launch-desk = intern COGS); orchestrator utan flat-taxa; taket = 15 % av planpriset ±1 kr
- [x] tsc rent, riktade specar (99), full svit 5499/5499; REALITY-WEEK #29–30; lessons

Medvetet utanför: `app/api/admin/support-tickets/[id]/reply` (Handymate-adminens eget supportsvar bokförs i dag på kundens business — vår kostnad, borde bokföras internt; ingen grind, avsiktligt). `isLikelyLead` anropar modellen även för förhandsgodkända avsändare ("Always return YES") — en deterministisk kortslutning skulle spara tokens; inte ändrad nu (beteende, inte sanning).

### Påfyllning av Bränsle — fasta kronor (2026-08-27, Andreas-beslut)
- [x] Nivåer 100/250/500 kr, samma för alla planer (`FUEL_TOPUP_TIERS`), självkostnad utan påslag (internt beslut, skrivs inte ut i kundytan)
- [x] "Vad räcker det till" som bunt ur prislistan (`topupExamples`: 100 kr ≈ 90 SMS och 50 AI-svar), nedåt till tiotal — styckpris går inte att räkna baklänges
- [x] "I din takt: ≈ N dagar till" ur kontots egen dygnsförbrukning (`avgDailyOre` → `topupDaysAtPace`)
- [x] Kortet: "Priser exklusive moms"; facit låser att kortet aldrig visar styckpris/självkostnad/påslag
- [ ] Stripe automatic tax: INTE påslaget — Stripe Tax är inte aktiverat på kontot (webhook-kommentaren "Idag kör Stripe utan automatic_tax"); aktivering i Stripe-dashboarden är ett Andreas-steg, sedan `automatic_tax: { enabled: true }` i fuel-topup + övriga checkouts

---

## Onboarding & första dagarna — Codex-analysen granskad, plan godkänd (2026-08-27)

Lanseringen flyttad minst en vecka (Andreas 2026-08-27). Plan: `.claude/plans/ja-d-beh-ver-vi-sorted-avalanche.md`.
Verifierat: 8 steg (inte 10), Company Scan + Hemtur körs på /dashboard efter finalize, dag 0 finns noll riktiga kort.

### Lager 1 — sanning/korrekthet/hygien
- [x] A0 grind-buggen `onboarding_step >= 7` → `>= 8` (REALITY-WEEK #31) + facit
- [x] A2 LiveTouren: "5 aktiva" → `{teamRow.length} på plats`, "5 aktiva"-statruta → `TEAM.length` "i ditt team", "Komplettera setup 2/5 klart / 40 %" → mock av Kom igång-railen utan tal + facit
- [x] A1 MalNudge ut ur "Det här behöver dig idag" → månadsrapporten före MalBlock + facit omskrivet
- [x] A4 hygien: CLAUDE.md onboarding-sektion, GYLLENE-VAGEN 8 steg, OnboardingHeader default 6, döda Step1BusinessAccount/Step3Phone/StepProgress borta + facit
- [x] A3 värdekvitto på hemkön (`buildValueReceipt` i `JarvisHome.executeSend`, röd flash vid misslyckat utförande)

### Lager 2 — första besöket slutar med en verklig handling
- [x] Steg 1: `lib/onboarding/first-action.ts` (ren picker + copy) + `tests/first-action.spec.ts` (22)
- [x] Steg 2: `lib/invoice-reminder-card.ts` ur send-reminders (verbatim, cronen 583→289 rader, alla pinnade strängar kvar) + `lib/agents/daniel/quote-follow-up-card.ts` + `buildOpenedQuoteFollowUpMessage`
- [x] Steg 3: POST `/api/onboarding/first-action` + rutt-facit
- [x] Steg 6 + A3: `value-receipt.ts` send_sms + hemkön
- [x] Steg 4–5: CompanyScan-CTA ("Börja med X →" / "Visa mig runt först" / "Lägg till din första kund"), JarvisHome (omhämtning, expandera, scroll+ring, Hemtur väntar på första beslutet), facits, Golden Path-overlay
- [x] Steg 8: Daniel-dedup i quote-follow-up (168 h, alla statusar, `filterOutConflicting`)
- [x] Full svit 5541/5541 lokalt, CI grön (c8eb273c), Golden Path 19/19 mot prod (efter Station 3-fixen, REALITY-WEEK #32), liveprobe: POST first-action som demoägare → `{ kind: null }` (0 kandidater — förväntat). Skärmdump av skanningens slutskärm EJ tagen: kräver ett konto med `welcome_tour_seen IS NULL` OCH en kandidat (förfallen faktura/gammal offert) — finns inte i prod ännu; första riktiga kontot med data blir beviset

### Lager 3 — KLART 2026-08-27 (Andreas: "Vi kör även lager 3")
- [x] B9 dag-7-mailet: "Nästa bästa steg" (Mattes topp-kort, annars äldsta väntande, aldrig testdata) med djuplänk; fönstret från onboarding_completed_at
- [x] B8 aktiveringsmått: tid till första fynd/beslut/utförda/kvitto ur befintliga tidsstämplar (ingen tabell/vy), kolumn i admin/onboard; RECEIPT_APPROVAL_TYPES facit-låst mot kvittot
- [x] B6 "Vad vill du att teamet hjälper dig med först?" (5 chips, onboarding_data.firstFocus — ingen migration) ersätter årsmålet; första Matte-frågan + NBA-bakgrundsrad läser fokuset
- [x] B7 adaptiv Kom igång: Lisa → Karin → Daniel → Matte → Hanna → push ur riktiga luckor; LiveTourens mock läser samma lib
- [x] B10 ekonomifrågorna ut ur steg 2; Karin ber om skatterytmen i kalenderkortet, Lars om timkostnad i statusbandet
- Öppet: kommunikationshubben som dag 1–2-steg först efter OUTBOUND Etapp 1–4; LiveTouren kan på sikt krympas till payoff + CTA

---

## Fastighetspasset V1 (Andreas "Kör!" 2026-08-27, lansering ~14 sep)

Princip: Handymate slutar inte arbeta när projektet fakturerats. Jobbpasset (v154) är 80 % — V1 är sammankoppling + ett installationsregister. Kedjan: utfört arbete → installerad tillgång → garanti → servicebehov → återkommande intäkt.

### Andreas fem sanningsgrindar (2026-08-27) — varje grind får ett facit
1. `project_material` får bara skapa installations**utkast** — inköpt/förbrukat material bevisar inte att produkten installerades.
2. Serienummer får aldrig blockera projektavslut generellt — Lars frågar bara vid relevanta installationer, med "ej tillämpligt" / "komplettera senare".
3. Garanti skiljer på produktgaranti, utförandegaranti och serviceavtal; garantigivare + källa ska framgå — portalen får aldrig lova mer än företaget ansvarar för.
4. Serviceintervall bara från bekräftad produktinformation eller hantverkarens val — aldrig en modellgissning.
5. Publicering och utskick är separata handlingar — passet kan publiceras vid godkännande, men mejl/SMS följer kommunikationshubben och befintlig utskicksgrind.
+ Installationen bär en adress-/platsögonblicksbild från projektet (samma kund kan ha flera fastigheter; "värmepump i källaren" pekar inte ut byggnaden).

### Steg 1 — passet in i kundportalen (inga nya tabeller) — KLART 2026-08-27
- [x] Delad `components/jobbpass/JobbpassView.tsx` (publika sidan + portalen renderar samma sak); delad sammansättning `assembleJobbpassView` i `lib/jobbpass/jobbpass.ts`
- [x] `GET /api/portal/[token]/jobbpass` — kundens publicerade pass (project.customer_id → jobbpass status published), signerade foton
- [x] Portal: "Ditt hem" på startsidan, jobbpass-CTA i projektdetaljen, `?tab=jobbpass&project=` djuplänk; dokumentfliken läser customer_document/project_document/generated_document (`GET /api/portal/[token]/documents`, filter "Filer"); fältrapporter (`/reports` hade ingen anropare) visas i projektdetaljen
- [x] Grind 5: publish-rutten skickar INGET; utskicket är `POST /api/projects/[id]/jobbpass/notify` = ägarens knapp "Meddela kunden via mejl" genom `sendPortalNotification('jobbpass_published')` (portal på, e-post, 1 h-dedup, aldrig SMS); ärliga svenska svar per utfall. `?tab=photos`-buggen rättad (→ `?tab=project`)
- [x] Facits: `facit-fastighetspass` (ny), portal-error-swallow + launch-public-token-contract (nya rutter registrerade), permission-contract (notify owner-admin), jobbpass — allt grönt, tsc 0 fel
- [x] Bevis mot prod (2026-08-27, biz_eaj2vp3xf2, projekt e53d9edb…): projekt → utkast → publicerat (svaret bär ingen notis-flagga) → portal-API 1 pass → portalen "Ditt hem" → passvyn → djuplänk ?tab=jobbpass&project= → dokumentfliken "Filer" → ägarsidan "Meddela kunden via mejl" (inte klickad: kundens e-post är en testadress). Skärmdumpar proof-fp-1..4.

### Steg 2 — installationsregistret (v174) — KLART 2026-08-27
- [x] `sql/v174_installation.sql`: installation (project, customer, material_id, namn/tillverkare/modell/serienummer/sku/leverantör/placering, **site_* adressögonblicksbild**, installed_at, status draft/confirmed/not_applicable, serial_pending, service_interval_months + service_interval_source (product_info|craftsman) med CHECK "båda eller ingen", care_instructions, source project_material|manual). RLS service_role. Unikt utkast per materialrad.
- [x] `lib/installation/installation.ts`: rena regler (installationRelevance, snapshotSiteAddress, draftFromMaterial, validateInstallationPatch) + DB (ensureMaterialDrafts idempotent, create/update/delete, listConfirmed…)
- [x] `/api/projects/[id]/installations` GET (synkar utkast) / POST / PATCH / DELETE; ägarsida `/dashboard/projects/[id]/installationer` med Bekräfta · Ej tillämpligt · Komplettera serienumret senare · Spara
- [x] Avslutsmotorn: effekt `installation_register` — bara vid relevans (material eller produktord i namn/beskrivning), efter att projektet redan är klart, REVIEW_REQUIRED-kort med target_route, 30 dagar; grind 1 (bara utkast ur material), grind 2 (blockerar aldrig)
- [x] Jobbpasset: "Det här sitter hos dig" — bara status confirmed, intervall visas alltid med källa (grind 4); allowlisten utökad
- [x] Facit `tests/facit-installation.spec.ts` (grind 1, 2, 4, adress, kundvy) + jobbpass.spec
- [x] v174 körd via MCP 2026-08-27 (28 kolumner, 6 CHECK, RLS, 1 policy verifierat med SELECT). Prod-bevis (Provfirman biz_eaj2vp3xf2, projekt 56435441…): avslut → effekt installation_register succeeded → relevans keyword "varmepump" → intervall utan källa 400 → manuell rad → bekräftad → publik vy bär installationen, ingen warranty-nyckel → portalen "Det här sitter hos dig" → Lars-kortet i kön med "Registrera installationer" → registersidan. Skärmdumpar proof-inst-1..3.
### Steg 3 — garantisanning, service ur installationen, hubbens grind, Min bostad — KLART 2026-08-27 (v175 körd, bevisat i prod)
- [x] `sql/v175_warranty_truth.sql` (körd via MCP, verifierad): warranty + project_id, installation_id, warranty_kind (product|workmanship|service_agreement), issuer, source (product_info|contract|craftsman); CHECK "typ ⇒ garantigivare + källa" (grind 3). Äldre rader/warranty_type orörda och når aldrig kunden.
- [x] `lib/warranty/warranty-truth.ts` (validateWarrantyTruth, customerWarrantiesFromRows — bara aktiva, registrerade, gällande) · `/api/warranties` validerar · garantisidan: sort/garantigivare/källa, inget förifyllt 2-årsdatum, badge "Visas inte för kunden" på äldre rader · installationssidan länkar "Registrera garanti →" (förifyllt)
- [x] Jobbpasset: sektionen "Garantier" bara ur registrerade rader, alltid med garantigivare + källa; allowlisten utökad
- [x] Grind 4: proactive-care läser bekräftade installationer — intervall + källa styr; registrerad tillgång utan intervall ⇒ ingen påminnelse (ingen gissning); nyckelordstabellen bara för projekt utan installation; `jobbpass.service_consent = false` stoppar; payload bär installation_id/interval_source
- [x] Grind 5: `lib/outbound/hub-gate.ts` (tysta timmar + veckotak ur communication_settings, aldrig auto-inställningen) kopplad i approvals-caset för proactive_care och warranty_followup före sendSms — stoppat utskick = ärligt "Godkänt — men …" med Försök igen
- [x] Min bostad: `GET /api/portal/[token]/installations` (bara confirmed, nästa service ur installed_at + intervall) · `bostad.ts` grupperar per adressögonblicksbild · PortalHome "Min bostad" ersätter "Ditt hem" (installationer överst, passen under)
- [x] Facit `tests/facit-fastighetspass-steg3.spec.ts` (grind 3, 4, 5, Min bostad) + steg 1-facitet uppdaterat
- [x] Prod-bevis 2026-08-27 (Provfirman): portal-API bär installationen med nästa service 2027-08-27 "enligt produktinformationen" → Hem visar "Min bostad / DET HÄR SITTER HOS DIG" → garantirad (Nibe, produkt, produktinformationen) insatt direkt i DB (kontot saknar warranty_tracking ⇒ API 403) → publik vy + passet visar "Garantier" med garantigivare och källa. CHECK-avvisningen bevisad i enhetstest, inte i prod (verktyget stoppade det avsiktligt felaktiga INSERT:et). Skärmdumpar proof-s3-1..2.
- Känt: dedupen i proactive-care är fortfarande livstids per projekt+kund ⇒ installationsdrivna påminnelser blir engångs, inte återkommande (kräver datumavgränsad dedup per installation — separat beslut)

---

## Launch Promise Gauntlet — adversarial lanseringsbevis (Codex, 2026-08-27)

Avgränsning: bevisa och vid behov laga skarvarna i kärnresorna. Fortnox,
Stripe-live och externa kundutskick ligger utanför. Detta är ett testprotokoll,
inte en andra lanseringschecklista.

- [ ] Baslinje: arbetskatalog, befintliga harnessar och aktuella lane-gränser verifierade
- [ ] Tvåtenantbeviset körs mot riktig databas med två authenticated-konton
- [ ] Kund → affär → dokument: relation, lagring, listning och visning bevisas
- [ ] Affär/offert → vunnen → projekt: kund, ansvarig och dokument bevaras
- [ ] Projekt → tid/material/ÄTA → avslut → fakturaunderlag bevisas utan extern leverans
- [ ] Owner/anställd och fel tenant: mutationer nekas på rätt lager
- [ ] Felvägar ger synligt fel och aldrig falskt lyckat svar
- [ ] Mobil/PWA samt reload/återbesök verifieras för kärnytorna
- [ ] Varje reproducerad defekt rotorsaksfixas och får regressionstest
- [ ] Riktade facit, `npx tsc --noEmit` och `npx next build` är gröna
- [ ] Smalt resultatprotokoll skrivs med BYGGT/KODBEVISAT/SKARPBEVISAT per löfte

### Review

- Pågår.

## Launch Truth Closure — Codex, 2026-08-30

Avgränsning: stäng kvarvarande kodmässig lanseringsrisk och gör de externa
go/no-go-bevisen körbara. Fortnox-lanen ägs samtidigt av Claude och rörs inte.

- [x] Fastställ en kanonisk ägare för förfallna fakturor och förhindra dubbla
      `automation`/`invoice_reminder`-kort för samma faktura och påminnelsenivå.
- [x] Skriv regressionstest som reproducerar REALITY-WEEK #36 och fäller vid
      två synliga åtgärder för samma faktura.
- [x] Bygg en read-only launch preflight som redovisar konfiguration och färsk
      körsignal för Stripe, 46elks, Resend, Google, push och produktionscrons.
- [x] Preflight får aldrig skicka SMS/mejl/push, skapa betalning eller mutera
      leverantörs-/kunddata.
- [x] Uppdatera befintlig lanseringsrunbook med manuella stationer för verkligt
      Stripe-köp, STOPP/inbound-SMS, mejlleverans, OAuth och fysisk iPhone/Android.
- [x] Kör riktade facit, `npx tsc --noEmit` och `npx next build`; dokumentera
      exakt vad som är KODBEVISAT respektive fortfarande kräver extern verklighet.

### Review

- Klart i arbetsytan, ej committat eller deployat. `66/66` riktade facit
  gröna (launch readiness, påminnelseägarskap, Lisa-kontrakt och cron-auth),
  `npx tsc --noEmit` rent och `npx next build` exit 0.
- Publikt rökprov mot gamla produktionen: fyra felvägar PASS (ogiltig offert-,
  portal- och Jobbpass-token = 404; cron utan hemlighet = 401), health FAIL
  eftersom produktionen serverar gårdagens cachade gröna timestamp. Fix finns
  i arbetsytan; omtest sker efter deploy.
- Hela standardkommandot `npx playwright test --no-deps` startades men är inte
  en browserlös kontraktssvit i nuvarande config (11 472 tester inklusive
  sessions-/produktionsprojekt). Det stoppades efter att `comprehensive.spec`
  gav upprepade `connect EACCES` mot app.handymate.se i sandboxen; inga sådana
  nätverksfel räknas som produktfel eller som ett grönt bevis.
- KODBEVISAT: kanonisk V3-ägare för fakturapåminnelser; reservvägen dedupar
  även pending-kort; superadmin-/no-store-preflight; verkliga schemaprober;
  Stripe-plan-/Storage-kontroll; read-only token/cron-smoke.
- EXTERN VERKLIGHET KVAR: Stripe live, Lisa/46elks, extern e-post, Google,
  fysisk iPhone/PWA, Fortnox samt omtest av health och dubblettfix efter deploy.

## Block A — webbkanalens inflöde, sant (Codex, 2026-08-28)

- [x] A1: alla synliga installationssnippets använder `/widget/loader.js` + `data-business-id`; legacy `public/embed.js` lämnas orörd
- [x] A2: v178 + throttlad loader-signal + autentiserad statusrutt med fem ärliga lägen
- [x] A2 UI: Integrationer visar aldrig ”Kopplad” ur en flagga och länkar till enda installationsytan
- [x] A3: storefront-kontakt går via `createLeadAndDeal`, med honeypot och databasbaserad rate limit
- [x] A4: facit låser installationskontrakt, sann status och Golden Path för samtliga strukturerade webbinflöden
- [x] Verifiering: riktade facit, `npx tsc --noEmit` och `npx next build`
- [x] v178 levereras som fil men körs inte

### Review

- Klart i arbetsytan. `467/467` facit gröna, riktade kontrakt `73/73`,
  `npx tsc --noEmit` rent och `npx next build` exit 0. v178 är medvetet
  okörd. Skarpa statusövergångar och storefront-dedup lämnas till Claudes
  prodbevis enligt uppdragsbeskrivningen.

## Projektöversikten — uppgifter + projektnummer (Andreas 2026-08-27: "Kör A och B")

Bakgrund: efter statusbandet (26 aug) var "Att göra" på Översikt bara agenternas kort — uppgiftsytan låg gömd under Planering efter delmomenten, "Ny uppgift" saknades bland snabbåtgärderna, "Mina uppgifter" var olänkad. Projektnumret renderades ingenstans på sidan, söktes inte i listan, dubblerades i pipelinen ("P-P-1042") och saknades på 19 av 37 projekt (bara POST /api/projects satte det, och tappade det tyst vid fel).

### A — projektnumret — KLART 2026-08-27 (v176 körd)
- [x] Kopierbar chip i headern (`data-testid=project-number-chip`), fältet typat
- [x] Listan: sök på "1042"/"P-1042", tydlig chip
- [x] Pipelinen: dubbelprefixet bort
- [x] Portalen: "Ärende P-1042" på projektkortet (Hem) och i projektdetaljen; DTO bär numret
- [x] v176: BEFORE INSERT-trigger ur `increment_counter` (alla sju skapare täcks), backfill i skapandeordning (19 → 0 utan nummer, verifierat), unikt per företag; skaparen kör aldrig om utan nummer
- [ ] Ej gjort: numret på offert-/faktura-PDF (ingen projektreferens finns i PDF-mallarna i dag — separat beslut)

### B — uppgifter — KLART 2026-08-27
- [x] `components/projects/ProjectTasksBlock.tsx` på Översikt, ovanför agenternas kort: öppna uppgifter (försenade först), bock direkt, inline-skapande (titel + ansvarig + datum), "Visa alla →"
- [x] Agentblocket heter "Väntar på ditt OK" — hantverkarens uppgifter och agenternas förslag är två saker
- [x] Egen flik "Uppgifter" med räknare ("N öppna") — bort från Planering
- [x] Snabbåtgärd "Ny uppgift" (fokuserar fältet)
- [x] "Mina uppgifter" i sidomenyn under Jobb
- [x] Facit `tests/facit-projekt-uppgifter-nummer.spec.ts`; 183 kringliggande tester gröna
- [ ] Steg 2 (efter lansering): förfallna/dagens uppgifter in i hemmets "Dagens plan" + signal till Matte

## "Lars tipsar" — uppgiftstips ur steg och data (Andreas 2026-08-28: "Love it", max litet antal)
- [x] `lib/tasks/lars-tips.ts`: rena regler (startmöte, material, delmoment, ROT-uppgifter, egenkontroll våtrum/el, tid, slutbesiktning, serienummer v174, jobbpass ej meddelat) — varje tips med varför-rad ur data; dedup mot öppna uppgifter + avvisade; **max 2** åt gången
- [x] `GET/POST /api/projects/[id]/tips` — GET skriver aldrig; POST accept = riktig uppgift (tilldelad projektledaren) + minne, dismiss = minne (v177 `project_tip_dismissal`, körd)
- [x] Blocket: "Lars tipsar" under listan, + / Inte aktuellt
- [x] Facit `tests/facit-lars-tipsar.spec.ts` (regler, cap, dedup, tyst-när-tomt, rutten skriver inget i GET)
- [x] Prod-bevis 2026-08-28 (Provfirman P-1003/P-1004): start om 6 dagar → "Boka startmöte" + "Beställ material" med varför-rader → accept skapade uppgiften → nästa regel fyllde på till max två. Fynd: snabbt "Inte aktuellt" på ett nyss accepterat tips skrev över accepted→dismissed (UI:t väntade på omhämtning) → fix f8425876: accept vinner alltid i rutten + optimistiskt borttag i blocket; bevisat igen (dismiss på accepterat → unchanged:true, task_id kvar)
- Steg 2: samma tips i hemmets "Dagens plan" för projektledaren; fler regler från Andreas hantverkskunskap

## "Dagens plan" på startsidan — uppgifter i dag + Lars tips globalt (Andreas 2026-08-28: "Kör!")
- [x] `lib/tasks/lars-tips-batch.ts`: batchad laddning (en fråga per tabell över alla projekt) + `suggestHomeTips` — max 3 totalt, max 2 per projekt, prioritet passerat slut → besök i dag → närmast start; dagens bokning prefixar varför-raden
- [x] `GET /api/tips/home`: dina uppgifter i dag (förfallna + dagens, rollgräns via `resolveTaskScope`) + tips; ägare/admin alla aktiva projekt, anställd projekt hen är med i; läser bara
- [x] `components/jarvis/DagensPlanExtra.tsx` monterad i "Dagens plan"-kortet under bokningarna; bock via /api/tasks, accept/avvisa via projektets tips-rutt (samma minne); tyst vid fel/tomt
- [x] Facit `tests/facit-dagens-plan.spec.ts` + jarvis-hem/hemtur/att-hamta gröna
- [x] Prod-bevis 2026-08-28: /api/tips/home → 1 uppgift (P-1002 försenad) + 3 tips (P-1004 material/delmoment, P-1003 material) → kortet på startsidan under "Inget bokat idag". Skärmdump proof-dagens-plan.png

### Block A — Claudes granskning och prod-bevis (2026-08-28)
- [x] Granskat + committat som Codex (5448a4a0); kolumnerna koden lutar sig på verifierade i prod; fail-soft före v178 bekräftad
- [x] v178 + v179 körda ("kör"), verifierade med SELECT
- [x] Prod-bevis: honeypot tyst 200 · storefront → Golden Path: ny kund → lead + affär, Anna → dedup (1 rad) + lead + affär · widget-status "Inte aktiverad" (0 företag har widgeten på) · ingen embed.js/data-key i integrationssidans HTML
- [x] Avvikelse #34 (leads.lead_number saknades — ingen Golden Path-lead har någonsin sparats) → v179
- [x] Avvikelse #35 (onboardingens stegseeder skrev fel form — 14/27 företag utan steg, ingen affär) → 2a1e40cf + backfill av de 13 återstående företagen
- [ ] Block B: kanalhälsa på Kom igång-railen (Claude/Codex på befintliga rälsar)
  - [x] Codex: ren `lib/onboarding/channel-health.ts` med fyra bevisnivåer per kanal: inte aktiverad → aktiverad men oprövad → kanal verifierad → lead + affär verifierade
  - [x] Codex: tenant-säker `GET /api/onboarding/channel-health`; telefon ur test_call, e-post ur inbound-rutt, webb ur widget/storefront; inga flaggor får ensamma bevisa inflöde
  - [x] Codex: browserlösa facit för sanningsordning, auth, business_id-filter och att både lead- och dealrad krävs för starkaste nivån
  - [ ] Claude: koppla de härledda signalerna till befintlig Kom igång-rail för "Få in fler jobb" utan nytt onboardingsteg eller lanseringsspärr

## "Kontaktad" gäller alla kontaktvägar (Andreas 2026-08-28) — KLART
- [x] `lib/pipeline/contacted.ts`: en regel, moveDeal som system (framåt-only, aldrig bakåt), idempotent, kastar aldrig
- [x] Kopplad i: SMS-strypunkten (alla SMS), lib/email med kundkontext (+ nurture, offertbekräftelsen), agentens mejl (Gmail + Resend), portalmeddelande, bokat besök, smart kundkommunikation
- [x] Facit `tests/facit-kontaktad.spec.ts`
- [x] Prod-bevis: affär i Ny förfrågan → bokat besök via API → Kontaktad ("Flyttad till Kontaktad")
- Kvar utanför: inkommande samtal (Lisa) räknas inte som "vi kontaktade kunden" — medvetet; ändra om du vill

## Block B — kundinflödet i Kom igång-railen (2026-08-28)
- [x] Codex: `lib/onboarding/channel-health.ts` + `GET /api/onboarding/channel-health` (fyra ärliga nivåer per kanal, fail-closed, facit) — committat baed0868
- [x] Claude: uppgiften "Kundinflödet" i `deriveKomIgangTasks` — bara `any_lead_verified` = bevisat; nådd kanal ändrar bara formuleringen; först vid "Få in fler jobb", annars efter Lisa; saknad signal ⇒ ingen uppgift. Rutten anropar Codex kanalhälsa som funktion med samma request. Facit `facit-kundinflode-rail`
- [x] Prod-bevis 2026-08-28: channel-health → phone not_enabled, email not_enabled, web lead_verified; any_lead_verified true → kom-igang-uppgiften "Kundinflödet är bevisat — en riktig förfrågan blev lead och affär" (klar, kanalrad med alla tre) i ordningen ring → kundinflode → …

## Pass 2/3 Block A — Golden Path, cron-hälsa, A2, A7, inventering (2026-08-28)

Rapport: `docs/reality-week/pass2-block-a-2026-08-28.md`.

- [x] Golden Path mot prod på HEAD → 16/16 (3.6 min)
- [x] Cron-hälsa ur DB-fotavtryck (Launch Truth Gate punkt 6, delvis) — tabell i rapporten §B
- [x] A2: `POST /api/cron/send-reminders?business_id=` admin-grindad scope:ad körning (`2583a741`, facit `facit-paminnelse-scope`, 128 påminnelse-tester gröna, CI grön) — live: 403 oinloggad, 200 som admin, vakterna höll
- [x] A7 live: samma `idempotency_key` → samma `run_id`, `duplicate:true`
- [x] Automationsinventering (punkt 8) — 28 st, fyra helt ogrindade mot kund (rapporten §F)
- [x] Avvikelse #36: två kort för samma förfallna faktura (V3 + check-overdue); trappan avstängd för 26/26 företag
- [ ] Andreas: trappan end-to-end på Provfirman (toggle på + V3-regeln av → scope:ad körning → återställ) — blockerades som prod-konfigändring
- [ ] Andreas: beslut punkt 8 (stäng av 1–4 i §F) och #36 (vilken väg äger dag 7+)
- [ ] A4 live — lämnad på kontraktsnivå

## Inspelningsläge + referenspaket för Video Creative Bible (2026-08-28)

Beslut Andreas: "Ja kör det" — inspelningsläge (seed + Playwright-inspelning) för F08, F07, F06 samt referenspaketet
(Codex slog i token-taket). Sanningsjustering: Lisa SVARAR inte på samtal — all Lisa-copy gäller webb/mejl. Matte ska
kunna bli en levande huvudperson i fler annonser.

- [x] Kartläggning: brand-assets/porträtt, Golden Path-harness + målsidor, seed-vägar för de tre tillstånden
- [x] `tests/filming/` — eget Playwright-projekt `filming` (432×768 @2.5 = 1080×1920, egen kontext med recordVideo, overlays bort,
      presentatörsbandet dolt via CSS — demoverktyg, inte produkt)
- [x] Seed per film via produktens egna vägar: F08 hemsidans formulär → kund/lead/affär (nr 1030, "Ny förfrågan"); F06 kund → offert →
      riktigt mejlutskick → sent_at backdaterat 6 dagar (det enda produkten inte kan) → Daniels kort via produktens byggare;
      F07 kund → offert → skickad → accepterad (projekt) → tid → ÄTA (utkast → skickad) → avslutad → readiness `blocked`
      med exakt "ÄTA 1 väntar på kundgodkännande"
- [x] Inspelning: webm + PNG per beat + sanningsfil per film i `docs/marketing/recordings/<film>/` (gitignorerat — körs om)
- [x] Referenspaket `docs/marketing/reference-pack/` (README, brand kit, agenter, Matte-huvudperson i tre nivåer, ljus/miljö,
      negativ lista, promptlogg-mall) + `scripts/marketing/build-reference-pack.mjs --zip` (assets gitignorerade, byggs om)
- [x] Facit `tests/facit-inspelningslage.spec.ts` (7/7): spärr på is_demo_tenant före första skrivning, inga testdata-namn,
      inga cron-/debug-anrop, Daniels kort bara via produktens byggare, readiness via produktens funktion
- [x] tsc 0, alla tre filmerna gröna mot prod-demokontot, zip:ar skickade till Andreas
- [x] Bonusfynd: hemskärmen 499 px bred på 432 px-skärm (avvikelse #37, `450b7575` grid-cols-1) — hittad av overflow-mätningen
- [ ] Andreas: demokontots contact_name är "Demo" → Daniels SMS slutar "Mvh Demo". Sätt ett riktigt förnamn på demokontot
      (Inställningar → Företag) innan F06 klipps
- [ ] Andreas: 46elks-saldo → kör `FILMING_APPROVE=1` för F06 beat 6 ("skickat"-utfallet)
- [ ] Sanningsjustering i handboken (Codex eller jag): F07 shotlist rad 2–3 → "Matte namnger blockeraren" (Evidence-to-Payment har
      ingen egen sida); F08 "hemsidan eller mejlen" → "hemsidan"; F11 Lisa-raden

## Filmfabriken — automatiserat videoannons-flöde via Higgsfield MCP (2026-08-28)

- [x] Higgsfield MCP kartlagd: workflows-katalog, modellkostnader preflightade (Kling 7,5 / Veo 11 / Seedance 32,5 kr per klipp)
- [x] Pilot F04 "AI-knappen" end-to-end: Veo 3.1-hook (11 krediter) + riktigt produktbevis (F07 Matte-svar) + slutkort,
      ihopsatt med ffmpeg i Higgsfield-sandboxen (Space Grotesk hämtad per körning), QA via frame-extraktion, master 14,8 s levererad
- [x] Två V01-fynd fixade: Playwright skalar aldrig upp video (FILM_VIDEO_SIZE = viewport; skarpa stillbilder för statiska bevis)
      och handymate-mark-transparent.png är VIT (slutkort använder public/logo.png)
- [x] Körbok docs/marketing/film-factory.md — "kör F06" är hela flödet; saldo 65 → 54 krediter
- [ ] Andreas: riktigt frilagd teal-SVG av loggan (dagens PNG har svag grå platta); VO-röst; fler krediter innan hel filmserie

---

# P0-6 + P0-9 — lås partnerattributionen, avtalsacceptans för befintliga partners (Claude 2026-09-01)

Ur PARTNER_REVENUE_REALITY_AUDIT_2026-09-01. Codex äger motorn (P0-1–5, 7, 8); Claude äger v190,
referral-RLS, referred_by-triggern, portalens acceptansyta och adminens approve-rutter.

- [x] sql/v191: referrals_tenant_member FOR ALL → FOR SELECT; BEFORE UPDATE-trigger som låser
      business_config.referred_by för allt utom service_role/postgres. Bara fil tills Andreas säger kör.
- [x] lib/partners/agreement.ts: delad version/hash/IP + capability-token + recordAgreementAcceptance.
- [x] POST /api/partners/agreement: cookie (aktiv partner) ELLER engångslänk (väntande partner).
- [x] Portalgrind: dashboard-payload bär agreement_required; AgreementGate före allt annat.
- [x] /partners/avtal/acceptera?partner=&token= för partners som inte kan logga in än.
- [x] Admin: båda approve-vägarna 409 utan acceptans; action send_agreement mejlar länken; UI-indikator.
- [x] Facit: tests/partner-attribution-lock.spec.ts (RLS-källfacit + grindarna).
- [x] tsc, riktade tester, smoke mot lokal dev (8/8 gröna 2026-09-01: gate, engångslänk, fel purpose 403, idempotent bevis, hash = fil), commit + push. Kvar: v190 efter "kör".

