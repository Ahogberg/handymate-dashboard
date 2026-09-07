# Varumärkeslagret för kundmail — I PROD 2026-09-07 (Claude, abb215fa)

Andreas: "vi hjälper dom också att se mer professionella ut" → Design-
briefer 01 (kundmailen) + 07 (Så ser dina kunder dig) skrivna, sedan
"Ja kör det" på förarbetet: en sanning för varumärket + en masterlayout.

- [x] `lib/branding/get-branding.ts` — loadBranding/brandingFromConfig,
      accent valideras (#rrggbb annars teal), kastar aldrig, fallback-select
      utan attribution_link_enabled (v202-fällan), stämpeln ur samma rad
- [x] `emailLayout()` + byggstenar i lib/email-templates.ts — Claude Designs
      master byts i EN fil, anroparna märker inget
- [x] Åtta kundvägar genom layouten: offert, faktura, påminnelse, portal-
      notiser, signeringsbekräftelse, jobbrapport, V3 send_email, nurture,
      legacy auto-generate. orders/send (B2B) medvetet kvar på direkt stämpel
- [x] Påminnelsekortets emailBody = FRAGMENT nu; leveransen lägger layouten.
      Kort skapade före 2026-09-07 bär hela dokument → arRedanHeltMejl()
      känner igen dem och stämplar bara. Ta bort grenen när kön är tömd.
- [x] Facit: tests/brand-layer.spec.ts (runtime) + facit-attribution-email
      (källskanning). 17 specar: 270 gröna, 1 skipped. tsc 0.
- [x] Claude Designs master INTAGEN 2026-09-07 (f2c751cc): emailLayout med
      meta-etikett/compact, amountBlock, paymentBlock (Swish primär +
      bankgiro/OCR-kort), statusBand, summaryTable/summaryCard, rotRutNotice,
      steps, dateCard, personRow, receiptCard, signature, formatDag.
      Åtta ytor omskrivna med designens copy (offert, bekräftelse med/utan
      ROT-uppgifter, faktura, fyra påminnelsenivåer, portalnotis kompakt,
      jobbrapport, auto-faktura). Visuellt granskat mot design-1.html.
- [x] emoji-fältet i EVENT_COPY rensat (samma commit)
- Beslut att nämna för Andreas: påminnelsen visar avgift/ränta som
  "tillkommer"-rader när de är konfigurerade (designen visade inga);
  Swish-länken bär fakturabeloppet. Bokning/Kvitto/Omdöme har block men
  ingen egen sändväg än (nurture/jobCompletedEmail är de som finns).
- Facit-fälla: invoice-reminder-send måste innehålla EXAKT
  `html = emailLayout(branding, messages.emailBody)` — ingen meta där.
- [x] Yta 7 "Så ser dina kunder dig" — I PROD 2026-09-07 (a1a45571):
      /dashboard/settings/kundvy (ägare/admin), länkad från Företag →
      Uppgifter. Logotyp, accent (sex förval + hex, kontrastvarning < 4,5:1),
      offertmall, härledd SMS-signatur, Färdig att skicka x/7, sju kort +
      stor vy (mail i iframe på 375 px skalad, SMS-bubbla, sidmockuper),
      testmail till egen adress. Offertmailets byggare utbruten till
      lib/quotes/quote-email.ts (send-routen + preview använder SAMMA).
      Visuellt granskat desktop 1380 + mobil 390 mot dev-servern.
- Beslut/lärdomar yta 7: bokning + omdöme visas som SMS (så går de på
  riktigt, designen visade mail); bara exempeldata (Anna Lindqvist), inte
  senaste offerten; SMS-signaturen härleds ur firmanamnet — ingen kolumn
  (följdpunkt om Andreas vill kunna ändra den); firmanamn = business_name
  före display_name, samma som brandingFromConfig (testkontot har olika).
- Lokala arbetsträdet ligger LÅNGT bakom origin (merge-base 1a345735) —
  verifiering gjordes mot origin/main-export + mina 18 filer i scratchpad
  (junction till node_modules). 40 röda i gaten där = identiska på ren
  origin/main i samma miljö (.github saknas i exporten, ESM-laddning,
  @electric-sql/pglite ej installerad lokalt). Inte mina.
- [x] Yta 3 fältrapportens signeringssida — I PROD 2026-09-07 (dcc6e4d3):
      /sign/report/{token} är syskon till offertsidan (logotyp, accent,
      sektioner, foton Före/Efter, Utförare + F-skatt, Godkänn arbetet med
      namn + kryss, invändning som kräver text). Publika routen bär
      loadBranding + stämpel. Sign-routen ORÖRD. Facit
      tests/faltrapport-signering.spec.ts. Fyra lägen granskade visuellt
      (visning, invändning, godkänd, avvisad) desktop 1380 + mobil 390.
- Lärdomar yta 3: gamla sidan ignorerade res.ok (ett 400 blev "Signerat!")
  och saknade avvisat-läge. field_reports har 0 rader i prod — funktionen
  har aldrig använts. Länken skickas ALDRIG automatiskt till kund; hant-
  verkaren kopierar den från projektsidan (gap att besluta om). Cookie-
  bannern ligger över de publika sidorna (global, inte min). QA-raden
  (fr-qa-claude-visual-check-2026-09-07) raderad efter skärmdumparna.
- [x] Yta 4 portalens beslutskort — BYGGD 2026-09-07 (Design: "Kundportal
      beslut.dc.html"). Fyra ytor i app/portal/[token]: Hem "Väntar på dig"
      (EN sanning: GET /api/portal/[token]/decisions → ÄTA i 'sent', obetalda
      fakturor + öppet confirm_payment-kort, omdöme efterfrågat men ej lämnat;
      varje rad går rakt in i beslutet; röd räknare på Fakturor), ÄTA
      "Tilläggsarbete att godkänna" (PortalAtaDecision: namn + bindande kryss
      som standard, ritad signatur per firma via
      business_config.portal_ata_signature_mode, "Tacka nej" med meddelande,
      samma /api/ata/sign/[token] som SMS-länken; projektvyn signerar inte
      längre inline — ÄTA-kortet öppnar beslutsvyn), Faktura "Att betala"
      (PortalInvoiceDetail: hero med status, "Det här ingår" med godkända ÄTA
      ur portalens ÄTA-lista, Swish-block med EN knapp + QR bara ≥768 px,
      bankgiro/OCR som reserv, "Jag har betalat" utanför Swish-blocket,
      dokumentet öppet nedanför med oförändrat återförsök), Omdöme "Hur blev
      det?" (PortalReviewCTA + POST/PATCH /api/portal/[token]/review: 1–3 →
      sparas + går som meddelande i tråden, aldrig Google; 4–5 → sparas +
      Google-kort; 409 = ett omdöme per kund). PortalFooter (firma, org.nr,
      F-skatt, stämpel) på alla tre beslutsvyerna. Migration
      sql/v221_portal_beslut.sql (portal_review + RLS enligt v101,
      portal_ata_signature_mode) — KÖRS FÖRE push, annars 500 i portalen.
      Facit tests/portal-beslutskort.spec.ts (22); decisions + review
      registrerade i launch-public-token-contract och portal-error-swallow;
      portal-invoice-recovery.ui mockar nu ./PortalFooter. tsc 0, build grön.
- Beslut yta 4: ÄTA-foton visas INTE i beslutsvyn (portalens projekt-route
  exponerar inga bilagor — följdpunkt); Offerter får ingen räknare (Hem
  laddar inte offertantalet — inga uppfunna siffror); fakturadokumentet
  öppet som standard (recovery-facitet läser det på mount); Swish-QR bara
  på desktop (man skannar inte sin egen skärm); "Jag har betalat" gäller
  även bankgiro-firmor.
- Lärdomar yta 4: recovery-facitet transpilerar PortalInvoiceDetail mot en
  fast modulkarta — varje ny import i komponenten måste in i kartan, annars
  faller testet med "Error: ./X" i pageerror. Kolumnen på pending_approvals
  heter approval_type, inte type.
- [ ] Yta 4 kvar: skarptest med två telefoner — ÄTA-godkännande (SMS →
  portal → godkänd → ÄTA på slutfakturan), "Jag har betalat" →
  confirm_payment-kort hos hantverkaren, lågt omdöme → tråden, högt →
  Google-länk. Aldrig signera via UI på testkonto utan att radera raderna.
- [x] Yta 2 dokumentfamiljen (PDF) — pushad 2026-09-07: EN helper
      lib/branding/pdf.ts (loadPdfBranding/pdfBrandingFrom/loadPdfLogo,
      drawBrandHeader → content-y, drawBrandFooter med "Sida i av n";
      stämpeln ritar renderaren själv — facit-attribution-pdf kräver
      literalen). Sex renderare går genom den: byggdagbok, egenkontroll/
      formulärsvar, arbetsorder, ÄTA (pdf-data laddar brand, pdf.ts tar
      `brand`), jobbrapporten (brand laddas FÄRSKT vid approve, payloaden
      kan vara dagar gammal; margin-option 15 mm) och faktura-jsPDF-
      fallbacken (accent + logga via logo_base64/logo_format; HTML→Chromium-
      vägen är primär och orörd). AuthenticatedBusiness typad med
      logo_url/accent_color/f_skatt_registered (raden är select('*')).
      Facit tests/pdf-varumarke.spec.ts (31: källskanning + riktig jsPDF-
      rendering). tsc 0 (körs från handymate-dashboard/handymate-dashboard —
      från repo-roten sväljer tsc syskonprojekt och OOM:ar).
- Fälla yta 2: lokala lib/ata/pdf.ts låg FÖRE Codex F10-fix (d79fb2ac,
  notes ur kund-PDF:en) — hade återinfört ANTECKNINGAR-blocket. Fångat i
  baskontrollen mot origin, rättat, livegenomgang-f10 grönt. Rött lokalt
  utan koppling: work-report.spec (matte/chat äldre lokalt + CRLF) och
  F11 (data-builder äldre lokalt).
- [ ] Yta 2 kvar: skarptest — öppna en byggdagbok-, ÄTA- och arbetsorder-
      PDF på ett konto MED logga (Bee) och ett UTAN; jobbrapport vid approve.
- [x] v221 KÖRD i prod 2026-09-07 (verifierad: 10 kolumner, RLS, två
      policyer, anon utan rättigheter, default name_checkbox) → yta 4 pushad.
- [x] Yta 5 BOKNINGSFLÖDET — BYGGD 2026-09-07 (Design "Bokning.dc.html").
      Beslut: hemsidan (/site/[slug]) designas INTE om — ICP 5–20 anställda
      har egen hemsida; bokningslänken är det de saknar. Bygge:
      app/site/[slug]/boka omskriven i brand-lagret (BrandMark + accent-ramp,
      mobil: kort med veckopil/dagchips/tidsluckor → summering "Ändra" →
      formulär; desktop: två kolumner med löftet "Vi kommer ut och tittar.
      Sedan får du en offert." + tre steg, kortet till höger), bekräftelse
      "Tack {förnamn}. Besöket är bokat." med "Lägg i kalendern" (ICS byggs
      i klienten, buildVisitIcs) + "Vad händer nu" + "ändra via telefon";
      409 → listan laddas om + lugn ruta, 429 → hänvisning till telefon,
      inga alert(). EN publik route GET /api/public/booking-page/[slug]
      (force-dynamic, is_published-grind som availability, loadBranding,
      14 dagars slots med samma computeAvailableSlots, telefon formaterad).
      Ren logik i lib/bookings/booking-page.ts (veckor, svenska datum,
      ISO-vecka, hoursSummary, ICS). Kundvyn: "Din bokningslänk" (kopiera/
      öppna; utan slug → Hemsida; opublicerad → amber) + reglaget "Besöket
      kostar inget" (business_config.booking_visit_free, sql/v222, default
      false — sidan säger "kostar inget" BARA då). Facit
      tests/bokningsflodet.spec.ts (21). tsc 0, build grön (NODE_OPTIONS=
      --max-old-space-size=8192 krävs, annars OOM vid typkollen). Visuellt
      granskat mot dev-server + prod-data (slug test) 390 + 1280: val,
      formulär, bekräftelse, 409, 429, 400, 404.
- Fynd yta 5: fyra seed/testkonton (biz_rollprov_a/b, elexperten_sthlm,
  biz_al7pjuu5smi) har working_hours i legacyform {start,end} utan
  `active` → gamla availability-routen gav 0 tider varje dag. Rättat i
  lib/bookings/availability.ts (isWorkingDayActive: saknat active = aktiv
  när tider finns; kanoniska rader opåverkade). Riktiga konton (onboarding/
  settings) skriver alltid {active,start,end}.
- Beslut/lärdomar yta 5: is_published-grinden BEHÅLLS (bokningslänken
  kräver publicerad hemsida — följdfråga om länken ska funka utan);
  "vem som kommer" = contact_name annars firmanamnet; footnoten
  "mån–fre 08–17" härleds ur firmans working_hours, inte påhittad; cookie-
  bannern (global, teal) ligger över bokningssidan liksom över portalen.
  Facit-inventeringen: yta 4:s decisions + review pushades UTAN post i
  PUBLIC_BY_DESIGN och utan höjt tak — rättat nu (151, räknat på origin),
  docs/audits/TENANT_SWEEP uppdaterad; production-schema-columns.json får
  booking_visit_free (kolumnkontraktet). Playwright-skript måste ligga i
  projektkatalogen (scratchpad hittar inte modulen) — kopiera in, kör, radera.
- [x] v222 KÖRD i prod 2026-09-07 (booking_visit_free finns, default false).
- [ ] Yta 5 kvar — skarptest: boka på /site/test/boka med eget nummer →
      SMS + lead hos Nordström El AB (radera efteråt), kundvyns kort +
      reglage, mobil Safari (ICS-nedladdning). Lisa/Matte skickar länken =
      ny feature, EFTER lansering.
- [x] Yta 9 DEMO-OFFERTEN — dashboard-sidan BYGGD 2026-09-08 (Design
      "Demo-offert block.dc.html"). Portal-first på riktigt: besökaren får
      det RIKTIGA offert-SMS:et från demo-företaget Ekström Bygg AB
      (biz_demo_ekstrom, sql/v223), öppnar den riktiga portalen, godkänner,
      finalizeAcceptedQuote skapar projekt + vinner affären, SMS 2 från
      "Handymate" länkar tillbaka till efteråt-vyn (?demo=TOKEN#demo-offert).
      Filer: lib/quotes/quote-sms.ts (offert-SMS:et utbrutet ur send-routen —
      EN text för riktiga och demo), lib/demo/demo-quote{,-data,-cleanup}.ts,
      app/api/public/demo-quote (POST, 3 fail-closed tak) +
      [token]/status (GET, låst till demo-företaget), finalize-hooken,
      maintenance-cronen sektion 6 (städning efter 7 dagar via RPC),
      lib/sms/sender-id.ts (åäö→ascii: "EkstromBygg" i stället för
      "EkstrmBygg" — gäller ALLA avsändare), tests/demo-offert.spec.ts,
      route-inventeringen 151→153.
- Beslut yta 9: ROT räknas på RIKTIGT (13 500 kr → kunden betalar 64 000,
  inte designens 38 750); offertnummer i riktigt format; SMS 2 påstår bara
  det som faktiskt hände (projectCreated/dealMoved); firmanamn som
  avsändare INTE byggt (Ekström alltid — firm är bara leaddata); "Boka en
  demo" → kanoniska "Boka en genomgång"-mailto; demo-företaget har
  agents_globally_paused + automation_settings av (inga påminnelser till
  besökare); phone_number NULL → "Frågor? Ring"-raden utelämnas (tidigare
  skrevs "Ring null" när numret saknades — rättat för alla).
- Lärdom yta 9: arbetskatalogen ligger EFTER origin (Codex-rutter som
  preparation/[token] saknas lokalt) → route-inventeringen kan bara köras
  i ett exporterat träd: `git archive origin/main … | tar -x` i scratchpad,
  egna filer ovanpå, junction till node_modules. Två facit (demo-reset,
  cogs-matare) faller där av exportskäl (CRLF, supabase/ saknas) — inte fel.
- [x] v223 KÖRD i prod 2026-09-08 (dashboard-pushen 04304363). Fälla:
      business_config.subscription_plan har check-constraint
      starter|professional|enterprise — 'business' avvisades, 'professional'
      insatt. Verifierat: is_demo_tenant/agents_globally_paused true,
      automation av, 0 business_users, cleanup('biz_finns_inte') kastar.
- [ ] Yta 9 kvar: landningssidan (handymate-landing: #demo-offert-blocket,
      save-lead allowlist 'demo-offert' + e-post-kravet); 46elks-saldo
      0,20 kr → fyll på före skarptest; NEXT_PUBLIC_LANDING_URL i Vercel
      (default https://handymate.se); skarptest med eget nummer: SMS 1 →
      portal → godkänn → SMS 2 → efteråt-vyn; kör
      demo_quote_cleanup('biz_demo_ekstrom', 0) efteråt.
- [ ] Design-ytorna 6, 8, 10 (ej påbörjade)

# Partnergrinden GRÖN 2026-09-07 (Claude)

- [x] sql/v206 var REDAN KÖRD (verifierat i prod: funktionen
      create_partner_self_billing_batch läser business_name, fantomfältet
      company_name är borta). Todo-raden var föråldrad — v208:s efterskrift
      dokumenterade körningen.
- [x] `npm run proof:partner` GRÖNT mot riktig databas: hela kedjan
      claim → konflikt → 180 dagar → självfaktura → betald, 1 passed.
- [x] Städningen verifierad efteråt: 0 kvarvarande testpartners, 0 provisions-
      rader, 0 attributionsbeslut, 0 referral kvar på testkontona.
- Förutsättning som saknades: `.env.integration` fanns inte (gitignorerad).
  Skapad lokalt från .env.local + PARTNER_TEST_ALLOW_DB_WRITES-spärren.
- FÄLLA för nästa körning: testet skapar en partner med testföretagets EGEN
  contact_email (för att pröva självhänvisningsspärren). Konton med
  andreashogberg93@gmail.com krockar därför med den riktiga partner-raden
  från mars. Använd konton med unik mejl — nu satta till biz_lc0g3raeu4
  (test@test.com) och biz_5is3beewoe9 (asads@asd.com).
- KVAR för partner-GO enligt Codex: publicerad 12-månaderstext ersatt,
  juridik/redovisning stängd, de två migrerade partnernas acceptans.
  Notera: 0 av 2 partners har accepterat avtalet ännu.

# P1-fynd 2026-09-04: kundskapande gick inte via Ny deal (Andreas hittade)

Rotorsak: kundskapande går via TVÅ API:er och bara den ena hade fixats.
Kunder-sidan → /api/actions create_customer (fixad 2026-08-27).
Ny deal-modalen → /api/customers POST (aldrig fixad) = anonymt 500 vid
upptaget telefonnummer, och modalen läste inte ens serverns felkropp.

- [x] 87dd34fa: 23505/unique_phone_per_business → 409 phone_taken med
      förklaring; NewDealModal visar serverns meddelande i båda vägarna
- [x] 521d1da2: dubblettkontrollen likriktad (findCustomerDuplicates +
      force_create). I deal-flödet väljer ett klick den BEFINTLIGA kunden
      till affären — Kunder-sidan navigerar bort, vilket skulle tappa dealen
- [x] tsc 0; 69 kontrakt gröna
- [ ] Efter GO: bryt ut kundskapandet till en delad helper så nästa fix inte
      kan hamna på bara ena vägen
- [ ] Efter GO: död kod bort i NewDealModal — inline-snabbkundformen ligger
      kvar wrappad i `{false && ...}` sedan CustomerModal tog över (~40 rader)

# Lanseringsprogrammet — testkörning (Andreas + Claude, startar 2026-09-04)

Codex program (mål GO 14 sept), sanningskälla docs/launch/GO_NO_GO.md.
Claudes förmätning 2026-09-03, allt verifierat lokalt/via MCP:

- [ ] BESLUT (Andreas): fixa kodgrinden — `npm install` (lokalt) ELLER
      npx-prefix i de fyra package.json-skripten (Codex fil, robustare).
      node_modules/.bin/ är TOMT ⇒ test:contracts/test:partner-launch-gate/
      proof:partner/test:tenant-isolation är okörbara som de står.
- [x] Testinnehållet friskt: samma grind via npx = 344/344 gröna 2026-09-03
      (Codex två röda i genomgang-fore-betalning + kundminne-kanaler åtgärdade)
- [ ] Kör sql/v206 manuellt (business_config.company_name saknas i prod —
      MCP-verifierat) → sedan `npm run proof:partner` grönt före push/GO
- [ ] Grind A: build + contracts + partner-gate + launch:smoke + admin-JSON
      (READY_FOR_MANUAL_PROOF, blocked=0) — spara JSON+SHA+tid i docs/launch/
- [ ] Stripe-skarpbeviset ALDRIG kört: enda fuel_topup_completed är
      evt_test_... (14 aug), fuel_ledger har 1 rad. Live-priser finns (5 st).
      100 kr riktigt kort → exakt 10000 öre; Claude verifierar via MCP+Stripe-MCP
- [ ] 46elks: saldo var 0 kr — påfyllning + nummer har LEDTID, förkrav för
      Lisa-stationen (LISA_SHARP_PROOF.md), ordna FÖRE 8-10 sept
- [ ] Färskkontoprovet (4 konton bygg/el/måleri/VVS): granska branschlistorna
      i docs/bransch/ FÖRST — annars mäter provet ett system utan branschdata
      (2/27 konton har jobbtyper idag)
- [ ] Märk upp vilka av de 27 kontona (5 aktiva prenumerationer) som är
      riktiga vs testkonton före 10-kundersprogrammet
- [ ] Portalens beslutskort (yta 4, Claude 2026-09-07) — skarptest med två
      telefoner på testkontot, EFTER att v221 körts och koden pushats:
      (a) ÄTA: skicka ÄTA → SMS-länk → portalen visar "Väntar på dig" →
      "Granska och godkänn" med namn+kryss → status Godkänd i portal +
      dashboard, ÄTA:n med på slutfakturan; (b) "Tacka nej" på en andra
      ÄTA → meddelandet syns i tråden hos hantverkaren; (c) faktura: Swish-
      knapp öppnar appen med belopp/meddelande, "Jag har betalat" → EN
      confirm_payment-kort, andra tryck ger "Redan anmält"; (d) omdöme 2/5
      → hamnar i tråden, ALDRIG Google-kort; nytt konto/omdöme 5/5 → Google-
      kort, andra försök = 409; (e) ogiltig portal-token → 404 utan 500.
      Radera QA-raderna (project_change, portal_review, pending_approvals)
      efteråt. Bevis: skärmbilder + id:n i docs/launch/.
- Regel under programmet: inga nya features, bara P0/P1 mot låst release-SHA;
  varje bevis bokförs i docs/launch/ med SHA + tidpunkt; BLOCKERAD ≠ PASS

## ÄTA-belopp utan rader (Codex 2026-09-07)

- [x] Läs senaste kod, PR:er, CI och producent/konsument för dagsrapport → ÄTA → faktura.
- [x] Reproducera att automatunderlaget tappar godkänd ÄTA med `items: []` och sparat totalbelopp (4 röda / 30 gröna före fix).
- [x] Låt tom radlista använda samma befintliga beloppsfallback som saknade rader; bevara avgående tecken och statusfilter.
- [x] Kör riktade beteendeprov, typkontroll, lint och bygg där miljön medger; dokumentera begränsningar separat.
- [x] Skriv kodförankrat innovations- och granskningsunderlag för draft-PR. Ingen produktion, merge eller kundkommunikation.

Review: 15 nya regressioner i befintlig testfil. 4 röda / 30 gröna före fix;
150/150 riktade kontroller efter fix. TypeScript och produktionsbygge exit 0.
Lint är inte verifierad: kommandot öppnar ESLint-konfiguration. Ingen ändring
av queries, schema eller beroenden. Riktigt DB-/mobilprov återstår.
Underlag: [Nästa produktsteg](../docs/handoffs/NEXT_PRODUCT_STEP_2026-09-07.md).

## Offertupplevelse (Codex 2026-09-05)

- [x] Skissa och bygg enligt [planen](../docs/design/quote-experience/PLAN.md).
- [x] Verifiera återställning, prisval, reservationer, mobil och bygg.
- [x] Lämna sida och PR för granskning.

Review: 100 riktade tester godkända. Öppningsbar skiss och granskning finns i planen.
## Kundförberedelse (Codex 2026-09-05)

- [x] Implementera [byggplanens V1](customer-preparation-plan.md): kundunderlag och jobbstart. 56 tester, typkontroll och produktionsbygge gröna.
- [ ] Driftsättningsprov: kör migration och verifiera riktig DB/storage samt autentiserat kundkort före aktivering.
## Leverans 2 (Codex 2026-09-05)

- [x] Bygg och verifiera [offertpaketering och dagsavslut](quote-packages-day-close-plan.md).
## Leverans 3: intäktskö (Codex 2026-09-05)

- [x] Bygg intäktskö med sökning, prioritering och nästa steg.
- [x] Behåll hemsidans tre kort och återanvänd befintligt behörighetsskydd och läsmodell.
- [x] Verifiera fel, behörighet, filtrering, mobilvy, typkontroll och bygg.
- [x] Dokumentera skarpa prov och lämna separat PR.

Review: 31 riktade tester, typkontroll och produktionsbygg godkända.
Mobil- och skrivbordsvy granskade. Skarpa prov återstår enligt
[leveransplanen](revenue-work-queue.md). Inga nya databasfrågor eller migrationer.

# Launch Truth & Operations (Codex 2026-09-03)

- [x] Baslinjegranska den lokala Support & drift-leveransen mot befintliga
      driftkällor, auth, mobilvy och felbeteende.
- [x] Kartlägg publika produktlöften, pris-/planvillkor, onboardinglöften,
      agentlöften och synliga integrationer mot faktisk kod och skarpbevis.
- [x] Skapa ett underordnat löfte–bevis-register som pekar på den befintliga
      `GO_NO_GO.md`-grinden och `LAUNCH_TEST_SUITE.md`-manualen utan att bli en
      ny konkurrerande checklista.
- [x] Åtgärda endast konkreta P0/P1-fynd som är isolerade och säkra; övriga
      blockerare får ägare och exakt beviskrav.
- [x] Kör riktade facit, full kontraktsgrind, `npx tsc --noEmit` och
      `npm run build`; diffgranska endast denna lanes filer.
- [x] Dokumentera verifiering, kända externa blockerare och nästa mänskliga
      skarpa prov i en review-sektion här.

## Review

- Support & drift återanvänder den befintliga supportytan och läser fyra
  verkliga driftkällor plus kredit-/leverantörshälsa. Källfel visas som
  `unavailable`, aldrig som en tom grön kö.
- Publika löften har synkats med bevisläget: ingen gratisperiod, ingen gissad
  Easoft-prisuppgift, ingen 15-minuters- eller 24-timmarsgaranti och
  leverantörsberoende funktioner är villkorade.
- Löfte–bevis-index: `docs/launch/LAUNCH_PROMISE_PROOF_MATRIX.md`.
- Verifiering 2026-09-03: riktade facit 20/20, kontraktsgrind 355/355,
  partnerns browserlösa grind 11/11, `npx tsc --noEmit` rent,
  `npm run build` exit 0 och publikt rökprov 5/5.
- Kvarvarande blockerare: det skrivande partnerbeviset får inte köras utan
  uttryckligt godkännande för att skapa och rensa testattribution, liggare och
  självfakturaunderlag på de två disponibla testföretagen. v206 är rapporterad
  körd, men detta är inte samma sak som ett grönt databasbevis.
- Nästa mänskliga prov är färsk-konto-resan enligt
  `docs/launch/LAUNCH_TEST_SUITE.md`, därefter externa 46elks-, Stripe-,
  e-post-, Google-, Gmail- och Fortnox-stationer på exakt release-SHA.

# Partner Launch Gate (Codex 2026-09-02)

- [x] Kartlägg partnerregistrering, attribution, provisionsmotor och självfaktura mot Partneravtal v1.
- [x] Inför atomisk, fail-closed partnerattribution med exakt självhänvisningskontroll, dokumenterad 180-dagarsregel och en vinnande partner per företag.
- [x] Skriv migrationerna v204/v205 i `sql/` men kör dem inte programmatiskt.
- [x] Bygg browserlösa kontrakt och ett avgränsat riktigt DB-bevis för attribution, månad/år, refund, chargeback, churn, återkomst, månad 36/37, självfaktura och slututbetalning.
- [x] Synka den interna publiceringskontrollen med faktisk kod och leverera ett separat partner-GO/NO-GO.
- [x] Verifiera riktade tester, `npx tsc --noEmit` och `npm run build`.
- [x] Kör v204/v205 manuellt.
- [ ] Kör `sql/v206_partner_self_billing_business_name.sql` manuellt. Första riktiga partnerbeviset stoppade korrekt på att v193/v205 använde den obefintliga `business_config.company_name`.
- [ ] Kör därefter `npm run proof:partner` igen och kräv hela claim → konflikt → 180 dagar → självfaktura → betalning → slututbetalning grönt innan push/GO.
- [ ] Bred kontraktsgrind: 341/343 gröna; två röda ligger utanför partnerlanen i `genomgang-fore-betalning.spec.ts` och `kundminne-kanaler.spec.ts` och lämnas till respektive aktiva lane.

## Review

- Partnergrinden är fortsatt **NO-GO** tills migrationerna och DB-beviset är körda, den publicerade 12-månaderstexten är ersatt samt juridik/redovisning och de två migrerade partnernas acceptans är stängda.
- Riktat facit: 40/40 inklusive befintlig partnerprovision och självfakturaportal; ny grind: 10/10.
- `npx tsc --noEmit`: rent. `npm run build`: exit 0.
- Full browserlös kontraktsgrind: 341 gröna, två orelaterade röda i parallell onboarding-/kundminneskod; inga partnerfacit röda.

---

# Etapp B: Självgående onboarding härdad (Claude 2026-09-02)

Plan: `C:\Users\Gaming\.claude\plans\cozy-crafting-reef.md` (godkänd 2026-09-02).
Måttet: ett nytt företag aktivt på ≥4 ytor inom 30 dagar utan att en grundare
varit inblandad. Worktree `.worktrees/onboarding-hardening`, branch
`feature/onboarding-hardening`, basad på origin/main (Codex arbetar parallellt).

- [x] B1 `lib/admin/adoption.ts` — 8 ytor, 30-dagarsfönster från
      onboarding_completed_at (utesluter importen i steg 4), tröskel 4;
      kolumn + KPI-kort i adminvyn; `tests/adoption.spec.ts` (05521ca8)
- [x] B2 betalgrinden: allowlist (active/comp) + fail closed, server-härlett
      `paid` i GET, ny verify-rutt mot Stripe med session_id, PUT-tak 8,
      delad `lib/billing/write-billing-update.ts`, döda trial-rutterna
      raderade, `paymentPending`-läge i Step5Activate (54003bf3)
- [x] B3 självläkning: `lib/email/provision-inbound-route.ts` (lead-adress vid
      finalize + Inställningar delar en funktion), daglig cron
      `phone-provision-retry` med larm efter tre dygn (3941d75c)
- [x] B4 livscykelmail dag 2/7/14 ur kontots verkliga luckor;
      `lib/onboarding/lifecycle-emails.ts` + `kom-igang-signals.ts`;
      dag 14 bara till konton under adoptionströskeln (d6da9166)
- [x] B5 genomgången får rader för en ny firma utan import — timpris ×
      personer × 52, materialpåslag, tjänster, AI-numret (3f2fc3e7)
- [x] B6 `app/api/debug/e2e-onboarding-fresh` + facit: grinden bevisas i BÅDA
      riktningarna för ett färskt konto, adoptionen måste vara 0/8 (fa52ee07)
- [x] Verifiering: tsc 0 fel, `npm run build` ren, 6859 playwright gröna
      (hela chromium-sviten), 0 röda
- [x] Egen granskning av diffen mot origin/main — se nedan

## Granskning (2026-09-02)

Åtgärdat:
- **Demoregression**: `paid` i GET använde grindens demoundantag → demokontot
  hade hoppat över HELA betalsteget i stället för att visa demon av det.
  `arOnboardingBetald(rad, null)` stänger av undantaget där; facit låser båda
  riktningarna.
- **Tyst 20-sekundersspinner** efter Stripe-retur när verify svarar pending →
  fem försök (10 s), sedan tar "Kontrollera igen" på betalsteget vid.
- Noterat i cron-kommentaren att numret svepet köper är samma köp webhooken
  redan gör — ingen ny kostnadskälla.

Medvetet lämnat:
- `hamtaAdoptionHandelser` skickar alla business_id i en `.in()` — fine vid
  27 konton, kan behöva batchas långt över hundra.
- Dag 30 (månadskvittot) ingår inte i livscykeln; egen punkt på bygglistan,
  skelettet gör det till en mall till.
- B2:s kontrollfråga mot prod kördes: sex rader utan betald status, alla
  E2E-harnessens och egna testkonton. Inga riktiga kunder, ingen backfill.

Kvar för Andreas (skarptest):
- `POST /api/debug/e2e-onboarding-fresh` mot prod som admin — ska ge alla steg
  gröna och tomt `leftover`
- Registrera ett riktigt konto och försöka finalisera utan att betala → 402
- `?payment=success` utan session_id landar INTE på steg 7
- `GET /api/admin/pilots` → adoptionsraden + KPI-kortet i /admin/onboard

---

# Nattpass 10: Lanseringsboost pass 1 — Företagsskannern + webbplatssignaler (Claude + 3 Sonnet-agenter 2026-09-02)

Program: docs/gtm/LANSERINGSBOOST_PROGRAM.md (sju idéer som pass).
- [x] Företagsskannern (app.handymate.se/foretagsskannern): kundlista-CSV +
      valfri faktura-CSV läses I WEBBLÄSAREN, riktiga fynd (kunder, utan
      telefon, dubbletter, förfallna fakturor + kr), "Skapa konto och ta med
      underlaget" via sessionStorage → StepImportData erbjuder importen.
      Onboardingvariant 'skanner' i tratten. Spårrutt med IP-tak + honeypot,
      ingen tabell. Plan: tasks/plan-foretagsskannern.md
- [x] Webbplatssignaler i Launch Desk: SSRF-skyddad hämtning utbruten till
      lib/onboarding/website-fetch.ts (delad med onboardingens scrape), nio
      deterministiska signaler med citat (ingen bokning, bara telefon,
      svarstid, gammalt årtal, säsong, anställer, ROT, recensioner,
      tjänster) i brief_source_snapshot.signals; AI-utkastet öppnar med
      starkaste signalen; batch 25; UI-sektion. Kostnadsmätning bara med
      HANDYMATE_HOUSE_BUSINESS_ID. Plan: tasks/plan-launch-desk-signaler.md
- [x] Smärtkartan docs/gtm/SMARTKARTA_KONKURRENTER_2026-09-02.md — OBS:
      proxyn blockerade direkta sidhämtningar, underlaget är sökmotor-
      sammanfattningar; tunna konkurrenter markerade "underlag saknas"
- [x] Facit tests/foretagsskannern.spec.ts + tests/launch-desk-signaler.spec.ts
      i kontraktsgrinden; tsc 0, 449 kontrakt gröna
- Lärdom: två agenter som kör next build samtidigt i samma .next slår
  varandra (ENOENT/OOM). Bygg alltid seriellt, en agent i taget.
- Kvar i programmet: pass 2 (budskapsbibliotek + jämförelsesidor), 3
  (timing-signaler: Platsbanken/JobTech, bolagsålder), 4 (Offertgranskaren,
  efter branschpaketen), 5 (byråspåret), 6 (Matte-demo via SMS, kräver
  46elks), 7 (veckorapporten)

---

# Nattpass 9: Första 10 kunderna — räddningskön + lanseringsbevis (Claude + Sonnet-agent 2026-09-02)

Program: docs/launch/FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md (Codex förslag,
Claudes justering: två bevisnivåer, P1 = kunden når inte första värdet,
inga manuella DB-fixar, frysdatum). Plan: tasks/plan-raddningsko.md.

- [x] sql/v203 (KÖRD som v202 + verifierad; omdöpt, nummerkollision): raddningsarende (unik öppen rad per
      företag+signal), lanseringsbevis (Grind B-stationer som rader)
- [x] lib/raddning/signaler.ts: nio rena bedömare med trösklar
- [x] /api/cron/raddningsko 05:25 UTC (cron-hemlighet eller admin): urval
      pilot/klar/ny ≤ 30 d, aldrig demo/test; svep per signal (fail-soft);
      upsert öppna, stänger försvunna (resolved_by system), rör aldrig
      manuell_fix_kravdes; digest-mejl bara när något är öppet
- [x] Admin: flik "Räddning" (/admin?tab=rescue): Tar det / Löst / Avfärda,
      bokför manuell fix, sektion Lanseringsbevis med formulär
- [x] /api/admin/launch-readiness: manual_proofs läses ur lanseringsbevis
      (pass ur riktig rad, annars manual som förut)
- [x] Facit tests/raddningsko.spec.ts i kontraktsgrinden; cron-auth 44/43;
      tsc 0, 397 kontrakt gröna, build ren
- Kända val: Fortnox-synkfel utan tidsstämpel (proxy: registrerat fel);
  företag som åldrats ut ur 30-dagarsfönstret rörs inte av cronen
- Byggagenten fastnade ~2 h i utforskning innan den skrev; nudge via
  meddelande löste det. Lärdom: sätt "börja skriva efter N minuter" i
  agentprompten

---
# Bygglistan 1–2: Referral-stämpeln + självgående onboarding (2026-09-02)

Plan: `C:\Users\Gaming\.claude\plans\cozy-crafting-reef.md` (godkänd 2026-09-02).
Beslut från Andreas: belöning = en månad gratis (Stripe-kundsaldo); stämpeln på alla kundvända dokument.

## Etapp A — "Skickat via Handymate" (worktree `.worktrees/attribution`, branch `feature/attribution-stamp`)

- [x] A1 `lib/branding/attribution.ts` — helper + rena tester (a4a072c3)
- [x] A5 `sql/v202_attribution_link_enabled.sql` + toggle i Inställningar (1f4e4ddb) — omdöpt från v200 (Codex tog v200/v201), KÖRD+verifierad via MCP 2026-09-02
- [x] A3 `app/via/[code]/page.tsx` — publik landningssida + `landing_events`-logg (33cacbf4)
- [x] A2a e-postvägar: quotes/send, send-invoice, invoice-reminder-send, portal notification-emails, orders/send (cbe8eba6)
- [x] A2b PDF: quote-/invoice-templates (4), pdf-generator (2), ata/pdf, job-report (cbe8eba6)
- [x] A2c publika sidor: PortalHandymateAttribution (+monteringar), quote/[token], jobbpass, lead-portal, rekommendera, widget (d1646ab4)
- [x] A4 belöningen: `grantReferralMonthCredit` (Stripe-kredit), död kod bort, SMS/sidtext (54d55bcf)
- [x] A6 facit — delat på fyra specar (`facit-attribution-{email,pdf,pages}`, `attribution-helper`, `via-landing`, `referral-reward`) i stället för en; parity-tester gröna
- [x] Verifiering 2026-09-02: tsc 0 fel, 242/242 playwright gröna (listan + partner-*, parity, onboarding-*, permission-contract, activation-metrics, facit-outbound-truth); npm run build — se granskning
- [x] Oberoende granskning av hela diffen (subagent) + åtgärder (95c6fd63) — 250/250 gröna, build exit 0 efteråt

## Etapp B — självgående onboarding (worktree `.worktrees/onboarding-hardening`)

- [ ] B1 `lib/admin/adoption.ts` + pilots-route + admin-vy + `tests/adoption.spec.ts`
- [ ] B2 betalgrind allowlist, `paid` från GET, verify-route + polling, PUT-tak `<= 8`, döda routes bort, tester
- [ ] B3 `email_inbound_route` auto-provision vid finalize + 46elks-retry-cron
- [ ] B4 livscykelmail dag 2/14 (generaliserad dag-7-cron)
- [ ] B5 Genomgången för ny firma utan import
- [ ] B6 `tests/e2e-onboarding-fresh.spec.ts`
- [ ] Verifiering: tsc, next build, playwright-listan, MCP-SELECT för berörda konton

# Parkerat (Andreas 2026-09-02): minnesförstärkning 3 + 4, om några dagar
- 3: citat ur källan som krav för varje agent_memories-rad (samma regel som
  customer_fact); det som inte kan citeras sparas inte.
- 4: kortens utfall tillbaka i minnesvikten — minne som ledde till godkänt
  kort vinner, till avvisat tappar (access_count + execution_result finns).
- Skäl att vänta: 4 kräver riktiga kortutfall (piloten + Bee Service),
  3 ändrar skrivvägen men datamängden är 29 rader. Bäst efter en vecka
  med genomgången före betalningen och pass 1–3 i drift.

# Nattpass 8: kundminnet, pass 3 — ett läs-API + relevanssökning (Claude + Sonnet-agent 2026-09-02)

- [x] sql/v201_agent_memories_fts.sql (KÖRD + verifierad): content_tsv
      (svensk ordbok) + GIN på agent_memories
- [x] lib/agents/memory.ts: byggMinnesfraga (ord ≥ 4, max 12, OR),
      relevansfråga via textSearch(websearch, swedish) slås ihop före
      viktighetsrankningen (dedupe på id, TOP_N+3); buildMemoryPrompt
      "Relevant för det här:" / "Om kunden:" / "Om företaget:"
- [x] lib/context/kundkontext.ts: hamtaKundkontext = Företagsmodellen +
      kundfakta + senaste samtal/SMS/mejl/portal + minnen i ETT block
      "## Vad Handymate vet" med källspår; tak 2 500 tecken (hela sektioner,
      aldrig mitt i mening); tomt ⇒ ''. Alla frågor scopade på business_id
- [x] Inkopplat (ersatt, inte ovanpå): Matte-chatten (verifierat kund-id,
      fråga = senaste meddelandet), agent-triggern, röstanalysen (efter
      branschblocket), get_customer-verktyget (fält kontext)
- [x] Facit tests/kundminne-pass3.spec.ts (40) i kontraktsgrinden;
      tsc 0, 343 kontrakt gröna, build ren
- Känt: getRelevantMemories använder getServerSupabase internt (före
  passet) — kontextens minnesdel hoppar tyst utan env; annars normalt

---

# Nattpass 7: kundminnet, pass 2 (Claude + Sonnet-agent 2026-09-02)

- [x] Gap 6: agent_memories.customer_id (sql/v200, KÖRD + verifierad).
      extractAndSaveMemory/getRelevantMemories tar customerId; utan kund
      läses bara företagsnivå (customer_id null), med kund läses båda och
      kundens egna rankas först (+0.2 boost). Dedupe jämför aldrig mot
      annan kunds minne. Fail-soft vid saknad kolumn. Anropare: agent-
      triggern (trigger_data.customer_id) och Matte-chatten (verifierat
      sidkontext-id). Claude la till safeMemoryCustomerId (bara säkra
      tecken i .or-filtret)
- [x] Gap 7: Hanna läser customer_fact före kundvårdskortet: fakta på
      kortet (payload.kundfakta + "Att tänka på"), spärr vid "inte sms"/
      "ej sms"/"ring" (factBlocked). SMS-texten oförändrad
- [x] Facit tests/kundminne-pass2.spec.ts i kontraktsgrinden; tsc 0,
      302 kontrakt gröna, build ren

---

# Nattpass 6: kundminnet över kanaler, pass 1 (Claude + Sonnet-agent 2026-09-02)

Revision: docs/audits/KUNDMINNE_REVISION_2026-09-02.md. Plan:
tasks/plan-kundminne-pass1.md. Byggt av Sonnet, granskat + verifierat här.

- [x] Gap 1: SMS-historik per kund (phoneCandidates + .in) i tidslinje + trail
- [x] Gap 2: Mattes resolver matchar kund via findCustomerByPhone (normaliserat)
- [x] Gap 3: resolvern läser 5 senaste sammanfattade samtal (channel 'call')
- [x] Gap 4: ägare/teammedlem som SMS:ar det tilldelade numret körs aldrig
      som kund (lib/matte/owner-sender.ts isTeamPhone, fail-closed = kund)
- [x] Gap 5: kundens egna ord från lead-formulär i tidslinjen + trailen ('form')
- [x] Gap 8: customer_fact i compliance-trailen ('note')
- [x] Gap 9: död röstparser app/api/voice/process borttagen
- [x] Facit tests/kundminne-kanaler.spec.ts i kontraktsgrinden; tsc 0,
      274 kontrakt gröna, build ren
- Pass 2 (ej byggt, väntar på beslut): gap 6 agentminne per kund (ny kolumn),
  gap 7 Daniel/Hanna läser kundfakta när de skriver
- Pre-existing rött, orört: tests/lisa-launch-proof.spec.ts (2 tester,
  voice/incoming lead/deal-koppling + product-language-copy) — röda även
  före passet, ligger i nattsviten

---
# Branschförståelse steg 1 — "laga ledningen" (Claude 2026-09-02)

Andreas: "Kör steg 1 direkt." Pushad 496f20a3, auto-deployad. Inga migrationer.

- [x] lib/branch: 15 bransch-ID:n + svensk etikett/yrke/företagsord + alias-
      tabell (svenska namn, snickeri, vvs, hantverkare, prefix "Måleri AB");
      resolveBusinessBranch (branch först, industry bara reserv), describeBranches
- [x] lib/branch/trade-context: specialties[] + företagets jobbtyper → block
      "## Bransch och inriktning" i agent-triggern, Matte-chatten, röstanalysen
- [x] 12 AI-/prompt-ytor rewirade från `industry` ('hantverkare' på ALLA konton)
      till `branch`; ingen gissar 'Bygg'/'hantverkare' längre (facit hittade
      tre till i första körningen: approve-actions, e2e-deal-flow, kampanj-SMS)
- [x] Biblioteken normaliserar via aliastabellen: produktbank, kunskap,
      offertmallar, säsongsteman (plumber→vvs, "Måleri AB" är inte el),
      SKV-kategori (mark→MarkDraneringarbete, allround gissas ALDRIG som Bygg)
- [x] Facit tests/branschledningen.spec.ts; tsc 0, 306 gröna i regressionen

## Kvar i programmet (omordnat av Andreas 2026-09-02 — INTE påbörjat)
- Princip: en bransch exponeras i onboardingen FÖRST när den har källbelagt
  startpaket + branschprompt. Ordningen är därför jobbtyper → paket → exponering.
- [ ] Steg 4 (sist): exponera de branscher som fått paket (snickare/golv/hvac/
      trädgård/låssmed/städ/flytt) i onboardingen, eller ta bort ur biblioteken;
      mark/totalentreprenad saknar innehåll
- [ ] Steg 3: branschpaket (Codex Branschbevis V1-form) + branschspecifika
      systemprompter
- [ ] Steg 2 (PÅGÅR): startpaket per bransch med VERKLIGA, källbelagda jobbtyper.
      Andreas 2026-09-02: gör ALLA branscher FÖRST, granska sedan samlat — då
      kan jobbtyper tas bort och ROT/RUT fastställas i ett svep, konsekvent
      över branscher (samma jobbtyp återkommer i flera).
      docs/bransch/: el.md KLAR (11 källor, 18 startpaket + 9 tillägg + 4 ute).
      Sonnet-agenter kör vvs, bygg, snickeri, maleri, tak, mark, ventilation,
      totalentreprenad, allround på samma mall. ALLA märkta OGRANSKAD tills
      Andreas sagt sitt. Golv/trädgård/låssmed/städ/flytt: utanför scope.
      Mall per fil: källhierarki myndighet → Skatteverket ROT/RUT → 5–7 riktiga
      firmor; ≥3 källor = startpaket, 2 = tillägg, 1 = ute; ROT-kolumn
      ROT/RUT/ROT*/Nej/? där bara SKV:s egen sida får ge ett ROT-påstående.

# Nattpass 5: genomgången före betalningen (Claude + Sonnet-agent 2026-09-02)

Andreas: "Kör!" — betalningen ligger EFTER importen och en genomgång av
kundens egen firma. Ingen prova-på: ingen dashboard, inga agenter, inga
kort före betalningen. Byggt av en Sonnet-agent efter
tasks/plan-genomgang-fore-betalning.md, granskat och verifierat här.

- [x] Ny stegordning (TOTAL_STEPS = 9): 4 Import → 5 Genomgången (NY,
      StepGenomgang) → 6 Aktivera → 7 Artikelregister → 8 Rundtur
- [x] lib/onboarding/company-scan-rows.ts: buildScanRows utbruten (ren) +
      teamGorNarDuAktiverar (vad teamet gör per rad, aldrig belopp/löften)
- [x] Step5Activate visar fynden överst; paid-guard (server-härlett via
      GET /api/onboarding) så redan betalande aldrig ser betalsteget igen
- [x] Prickar 7, MatteSetupGuide 9 texter, tratt-etiketter 1–9,
      dashboard-grind onboarding_step >= 9 (prod: alla ≥ 8 är klara)
- [x] Facit tests/genomgang-fore-betalning.spec.ts i kontraktsgrinden;
      tsc 0, 256 kontrakt gröna, build ren
- Medveten oskärpa: onboarding_step sparade före 2026-09-02 tolkas i nya
  ordningen (gamla 4 = betalning läses som import)

## Morgonkontroll 2026-09-02 05:40 UTC
- Kreditbevakning: 46elks-saldo 0 kr (varning), Stripe-nyckel i TESTLÄGE,
  Anthropic ok, databas ok
- Nattsviten fyrade inte på schema (02:00 UTC); workflow_dispatch ger 403
  för integrationen — Andreas kör manuellt från Actions
- Sentry Handymate: inga nya ärenden

---

# Nattpass 4: Aktivera senare + fyra ogrindade automationer (Claude 2026-09-02)

Andreas beslut i chatten: "Ta punkt 1 och 5 du så tar vi 3 och 4 imorgon."

## Punkt 1 — betalfrågan förtjänt, men INGEN gratis prova-på
- [x] ~~"Aktivera senare"-knapp förbi Stripe~~ ÅTERTAGEN 03:50: Andreas
      vill uttryckligen inte ha en gratis prova-på-period (lockar folk som
      signar upp och avbryter direkt). Kortet krävs i steg 4 som förut.
      BESLUT 04:05: ingen prova-på-period alls, inte heller med kort.
      Modellen är betala direkt + resultatgaranti. Kvar av passet:
      första kvittot i /api/billing, bannern som nu syns, aktiva-konton
- [x] lib/billing/forsta-kvitto.ts: första verifierade kvittot ur
      pending_approvals (RECEIPT_APPROVAL_TYPES + execution_result.outcome
      = success + buildValueReceipt). GET /api/billing → first_receipt;
      'trial' räknas nu som provperiod (is_trialing/days_left)
- [x] components/BillingStatusBanner.tsx: läste data.subscription_status som
      rutten aldrig returnerat → bannern var osynlig för ALLA. Läser nu
      subscription.status/trial.ends_at/first_receipt. Ny teal-banner
      "Teamet har levererat sitt första resultat: … Aktivera Handymate" när
      kontot saknar Stripe-prenumeration. Utgången provperiod vinner
- [x] lib/billing/aktiva-konton.ts: morgonbrief + nästa-bästa-handling
      filtrerade hårt på subscription_status = 'active' — provperiodskonton
      fick varken brief eller kort och kunde aldrig få ett kvitto. Nu ingår
      trial/trialing med klar onboarding och giltig trial_ends_at
- Kvar oförändrat (beslut): 14 dagars trial_ends_at är fortfarande gränsen
  (lib/auth.ts checkSubscriptionStatus). Betalfrågan ställs vid kvittot,
  senast vid provperiodens slut

## Punkt 5 — Launch Truth Gate punkt 8 (fyra ogrindade mot kund)
- [x] 1. Bokningspåminnelse 24 h: kräver uttryckligt
      automation_settings.sms_day_before_reminder = true (isolerad,
      fail-closed läsning) + ligger nu bakom agents_globally_paused i
      agent-context. Prod: 0 rader i automation_settings, 0 skickade/30 d
- [x] 2+3. Mattes kundsvar SMS/mejl: business_config.matte_customer_reply_enabled
      (sql/v199, KÖRD, default false). Av → svaret blir ett send_sms-kort
      ("Matte vill svara …") som ägaren godkänner. Prod: 0 matte_reply/30 d
- [x] 4. Recensionsförfrågan via tidsutgång i maintenance BORTTAGEN: ett
      obesvarat kort expirerar i steg 1, skickar aldrig. Manuellt
      godkännande kvar. Prod: 0 väntande kort
- [x] Facit: tests/facit-ogrindade-automationer.spec.ts +
      tests/aktivera-senare.spec.ts i kontraktsgrinden
- [x] tests/pricing-truth.spec.ts: Firman users 5 → null (följer Andreas
      2a6eda7 "ta bort Firmans användartak"; var röd på main)

## Sparade beslut (Andreas 2026-09-02: "de två besluten kan vi ju spara ner")
- INGEN prova-på-period, varken gratis eller med kort på fil. Betala
  direkt + resultatgaranti. Skälet: en period där man kan klicka runt och
  avbryta lockar oinvesterade konton. Bygg aldrig en trial-väg utan att
  Andreas sagt det uttryckligen.
- Tyst tid för push är konstant 21:00–07:00 svensk tid. Per-företag/
  per-person-inställning ("stör inte mellan …") byggs när någon ber om det.
- lib/smart-communication.ts isQuietHours räknar på serverns UTC-klocka
  (canSendMessage, kund-SMS via communication-ai). Ska peka på
  lib/tysta-timmar.ts som hub-gate och push gör. Inte rört.

## Imorgon (Andreas + Claude): punkt 3 "Säg det en gång" mobilt och
   punkt 4 veckorapport med värdekvitton — spec först, sedan bygge.

---

# Nattpass 3: tyst tid för push + två gamla facit (Claude 2026-09-02)

- [x] tests/first-focus + tests/job-type-start: pekade på Step6LiveTour för
      logik som flyttat till FirstAssignmentFinal — gröna igen (d4abcf9)
- [x] lib/tysta-timmar.ts: isWithinQuietHours + stockholmMinutesNow flyttade
      ut ur hub-gate (re-export kvar) så SMS-grind och push delar klocka
- [x] lib/notifications/tyst-tid.ts: 21:00–07:00 svensk tid; hant +
      teamuppdatering hålls, beslut aldrig; morgonsammanfattning (1 rad =
      som den är, flera = "N saker hände medan du var borta" + rubriker),
      gruppering per företag+riktad mottagare, rader >36 h utgår
- [x] lib/notifications/push-held.ts + sql/v197_push_held.sql (KÖRD +
      verifierad: RLS, partiellt unikt index på öppna dedupe-nycklar):
      fail-open — kan raden inte hållas skickas pushen direkt som förut
- [x] sendApprovalPush: hållning efter dedupe, före fetch
- [x] /api/cron/push-morgon (05:10 + 06:10 UTC = 07:10 svensk tid sommar/
      vinter; körningen inom tyst tid hoppar): släpper per mottagare via
      sendInternalPush, stämplar released_at/release_outcome, bokför i
      push_dispatch_log. ?force=1 bara för admin
- [x] sql/v198_push_subscriptions_hardened.sql (KÖRD): push_subscriptions
      fanns aldrig i produktion — v2 kördes aldrig, PWA-push har fallerat
      tyst hela tiden. Samma tabell utan v2:s USING(true)-policy
- [x] tests/push-tyst-tid.spec.ts i kontraktsgrinden; cron-auth 43/42;
      tsc 0; test:contracts 225 gröna

## Att läsa av
- push_held: SELECT release_outcome, count(*) FROM push_held GROUP BY 1
  efter första morgonen. Cron-svaret loggar held/expired/released/groups.
- push_subscriptions: efter nästa PWA-installation ska en rad dyka upp.

## Beslut för Andreas
- Fönstret är konstant (21:00–07:00). Per-företag/per-person-inställning
  ("stör inte mellan …") är nästa steg om någon ber om det.
- lib/smart-communication.ts isQuietHours räknar på serverns UTC-klocka
  (canSendMessage) — SMS-grinden i hub-gate är rätt, men communication-ai
  går via canSendMessage. Inte rört i natt.

---

# ÄTA + byggdagbok-sprinten (Claude 2026-09-02)

Plan: ~/.claude/plans/recursive-painting-possum.md. Beslut: project_log = Byggdagbok,
field_reports = Fältrapport; ÄTA = fällorna + dokumentet (fullt affärssystem = spår framåt);
mobil = dagboksvy + ÄTA-skicka + etiketter; väder = GPS→SMHI i mobilen, manuellt på desktop.
Deploy-ordning: v195 → ÄTA-kod → v196 → dagbokskod → mobil.

## DEL 1 — ÄTA
- [x] A1 En sanning för "avtalad": ATA_AVTALADE_STATUSAR/ATA_FAKTURERBARA_STATUSAR i lifecycle.ts, fyra ekonomisiter
- [x] A2 sql/v195_ata_dokumentet.sql (vat_rate, project_document.change_id, backfill av namnlösa rader)
- [x] A3 lib/ata/{labels,items,totals,send-message,create-ata}.ts
- [x] B API-fällorna: send (canTransitionAta + business_id + ingen JSON-fallback + GET), sign (livscykel), [id] (404/400), changes (skapaAta, svenska), executor name:, portal (items/summor/pdf_url), documents change_id
- [x] C1 lib/ata/pdf.ts + /api/ata/[id]/pdf + /api/ata/sign/[token]/pdf
- [x] C2 Portal: kundetiketter, rader, summor, PDF, foton
- [x] C3 Desktop: SendAtaDialog, synliga åtgärder, Kopiera länk, PDF-knapp, invoice-preview, foton, ChangeModal-fix, "Skapa & skicka", onNewAta, preview.items
- [x] C4 tests/ata-dokumentet.spec.ts + regressionslistan grön
- [x] v195 KÖRD + verifierad 2026-09-02 (3/7 ÄTA:er backfillade; rad.change_id→src.change_id rättad vid körning)

## DEL 2 — Byggdagbok
- [x] D1 rot_rut_documents DEL 4 → live-schema; kundtidslinjen; voice/execute; jobbuddy; addWorkNote; project_log_note via helper
- [x] D2 sql/v196_byggdagboken.sql (ata_change_id, attest, locked_at, addendum, project_log_revision + RLS)
- [x] D3 lib/diary/{weather,locking,permissions,write,photos,smhi,time-summary}.ts
- [x] D4 API: GET/POST logs, PATCH/DELETE [logId] med lås 409 + actions, POST/DELETE photos, GET /api/weather
- [x] E1 components/projects/diary/* + montering i page.tsx (LogModal bort)
- [x] E2 PDF: foton, timmar, attest, LÅST, from/to, ensureSpace före ritning
- [x] E3 lib/job-report.ts läser dagboken (log_report_%-vakt)
- [x] E4 tests/byggdagboken.spec.ts + work-report/matte-time-logging uppdaterade + regressionslistan grön
- [x] F display:{type_label,agent,approve_label} i GET /api/approvals + /api/mobile/home
- [x] v196 KÖRD + verifierad 2026-09-02 (5 kolumner, 2 index, project_log_revision + 2 RLS-policyer)

## DEL 3 — Mobil (handymate-mobile, main)
- [x] E1 lib/api: Byggdagbok-block, väder, display, Project.customer_id (90a12f9)
- [x] E2 ÄTA-skicka från projektvyn + beskrivningsvakt (77f8362)
- [x] E3 DiaryList + CreateDiarySheet + projektkort + /projects/[id]/diary + lib/weather + GDPR-text (ee61dae)
- [x] E4 approvals: etiketter från backend, Projekt-filter, död Bokningar bort (c995f2a)
- [x] E5 foton på ÄTA bakom ATA_ATTACHMENTS_ENABLED=true (a53c737)
- [x] tsc + jest gröna (26 suiter / 188 tester), pushat till origin/main 2026-09-02

## Verifiering
- [x] tsc 0, next build ren, playwright-listan i planen grön
- [ ] Skarptest ÄTA + dagbok (plan §Verifiering 4–5); mobil efter EAS-bygge (Andreas)

---

# Nattpass 2: onboardingtratten (Claude 2026-09-02)

Stöd för Andreas onboarding-A/B. Ingen migration — tidsstämplarna bor under
onboarding_data._funnel (servern äger nyckeln).

- [x] lib/onboarding/funnel.ts: markStepReached (första gången vinner),
      markFinalized, readFunnel, stripFunnelFromClientData, sammanstallTratt
      (nådde/bortfall/median per steg, per variant studio/classic, var de
      ofullbordade står, legacy-fallback på onboarding_step, testkonton
      exkluderade men listade)
- [x] PUT /api/onboarding stämplar steg + variant; POST finalize stämplar
      finalized_at best-effort; app/onboarding/page.tsx skickar variant
- [x] GET /api/admin/onboarding-funnel?days=30|90|365 + /admin/onboarding-
      funnel (isAdmin), länk från /admin
- [x] tests/onboarding-funnel.spec.ts i kontraktsgrinden
- [x] tsc 0, 12 onboarding-sviter + facit 176 gröna, test:contracts 209
- [x] Merge av origin/main (partner-självfaktura, samtalsefterarbete,
      v191→v193) utan konflikter; tsc + contracts gröna på merged tree

## Rött på main före passet (inte rört — nattsviten kommer flagga)
- tests/first-focus.spec.ts + tests/job-type-start.spec.ts pekar på
  Step6LiveTour för logik som flyttade till FirstAssignmentFinal i
  8df45b0/0ecda0b (buildFirstMissionPrompt anropas inte längre alls).

## Att läsa av i morgon
- /admin/onboarding-funnel: konton skapade efter deploy får tid per steg;
  äldre konton visas "(utan tid)" på nuvarande steg. Variant blir 'classic'
  tills NEXT_PUBLIC_SETUP_STUDIO_ENABLED sätts.

---

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

### Etapp A (2026-09-02, oberoende Fable-granskare över origin/main..HEAD)

Inget blockerande. Multi-tenant håller (alla `loadAttribution` på rätt business_id), v202-toleransen verklig (kolumnen bara i helperns primär-select med fallback + settings egna update), inga queries i loopar, `/via` läcker bara det som redan är publikt på storefronten. `referrals`-tabellen är tom i prod → statusändringen `active`→retry påverkar inga legacy-rader.

Åtgärdat (95c6fd63):
- **Dubbelkredit-fönstret**: `rewarded`-uppdateringen saknade felkoll och låg efter SMS:et; Stripes idempotencyKey gäller 24 h. Nu: rewarded direkt efter krediten + felkoll, `metadata.referral_id` på saldotransaktionen + kontroll mot `listBalanceTransactions` före skrivning = permanent idempotens.
- **Osynlig utebliven kredit**: ingen adminyta listar kund-referrals → `rapporteraTystFel` i båda felgrenarna.
- **Toasten ljög före v202**: sa "sparat" när länkvalet inte gick att spara → egen feltoast.
- `/via`: `cache()` runt uppslaget (var två queries/visning), okända koder loggas inte.
- Riktiga enhetstester för `loadAttribution`-fallbacken och `stampAttributionOnPdf` (var bara källskannade).

Medvetet lämnat:
- Dubbel stämpel på `/quote/[token]` (dokumentets fot i iframen + sidans fot) — länken i sandbox-iframen öppnas inuti A4-rutan. Kosmetiskt; åtgärd = `allow-popups` + `target=_blank` i dokumentvarianten. Ta vid Claude Design-passet på offertytan.
- `quotes/send` bygger stämpeln på inloggat konto, inte `quote.business_id` — samma som `business_name`/`logo_url` redan gör i multikonto-fallbacken; befintligt mönster.
- Årskund som referrer får krediten på nästa faktura (kan vara 11 mån bort). Beslut, inte bugg.
- Ingen rate-limit på `/via` (koder = ~9 000 gissningar per prefix; det som läcker är redan publikt).

Kvar för Andreas: skarptest enligt planen (offert → fot → `/via` → `landing_events`; toggeln av → utan länk), Stripe test-mode-prov av krediten.
# Admin Support & drift — samma operativa yta (Codex 2026-09-03)

- [x] Kartlägg och lås befintliga support-/driftkällor utan ny tabell eller parallellt incidentflöde.
- [x] Bygg en superadmin-grindad läsrutt för senaste 25 timmarnas leveransfel och sparad plattformshälsa.
- [x] Utöka befintliga `SupportQueueTab` med lägesrad, oförändrad supportkö och tydligt separat driftsektion.
- [x] Visa trasiga/otillgängliga kontroller som okända — aldrig som gröna eller tomma.
- [x] Lägg browserlösa kontrakttester och koppla dem till den befintliga kontraktsgrinden.
- [x] Verifiera riktade tester, `npx tsc --noEmit` och `npm run build`.

## Review

- `/admin`-fliken heter nu `Support & drift`: fyra lägeskort, befintlig
  supportkö, fyra driftkällor och sparad plattforms-/leverantörshälsa.
- Ingen migration och inga nya incidentrader. Vyn läser samma sanning som
  driftlarmet; en trasig källa visas uttryckligen som okänd.
- Riktigt DB-prov 2026-09-03: samtliga fem queries gröna; 1 SMS-fel,
  0 mejlfel, 0 betalningsfel, 8 automationsfel och 4 hälsokontroller.
- Kontraktsgrind 350/350, `npx tsc --noEmit` rent, `npm run build` exit 0.

## 2026-09-06 — Två ROT-fynd från Codex driftprov (main, Claude)
- [x] "Ingen ROT eller RUT" i underlaget gav ändå ROT: `lib/rot/instruktion.ts` tolkar hantverkarens uttryckliga nej och går före `bedomAvdrag`; slår även modellens `suggestedDeductionType`; skälet syns i reasoning.
- [x] Arbetsrad med enheten "st" blev material när avdraget slogs av: `labor_amount > 0` är nu första signalen i `get-quote-budget-derivation` och `get-quote-context`, kolumnen hämtas i båda selectarna.
- [x] Tredje fyndet (#2026004): artikelkopplingen skrev över det belagda nejet med artikelns standardflagga. `rotRutEfterArtikelkoppling` i `generated-to-quote-items.ts`, använd i `linkAiItemsToProducts`. Belagt nej vinner; okänt och belagt ja lämnar artikeln orörd.
- [x] Facit `tests/rot-instruktion.spec.ts` (28 prov: tolkningen, inkopplingen, klassningen med beteendeprov) inkopplat i package.json och CI.
- [x] Driftprovat av Codex i #16 (offert #2026006 → projekt P-1015): arbetsraden under Arbete, inget avdrag.
- [x] Två visningsfel därefter: "Arbete 0 kr" i offertsummeringen (calculateQuoteTotals läste bara avdragstyp och enhet; arbetsandelen avgör nu när avdrag saknas) och "Skapa projekt" trots befintligt projekt (quotes GET slår upp project.quote_id, headern visar Öppna projekt). Facit +5 prov.
- [ ] Codex provar om på Nordström El efter deploy: samma instruktion ⇒ inga ROT-flaggor och "Inget avdrag" i offertbyggaren; arbetsraden kvar som arbete i projektvyn.

## 2026-09-06 — Codex livegenomgång (nio fynd), Claudes del på main
- [x] F02 kundunderlag nekas: `rate_limit_check` (sql/v25) fanns aldrig i produktion och den publika grinden är fail-closed ⇒ tolv publika rutter nekade sedan svepet 1 sep. v25 körd och verifierad.
- [x] F01 godkänd checklista misslyckas: `project_checklist.order_id` NOT NULL i produktion. v215 körd: nullable + villkor projekt-eller-order.
- [x] F08 08–09 blev 10–11: naiv lokaltid lagrades som UTC. `svNaiveToIso` stämplar Stockholm-offset i schemats POST/PUT.
- [x] F09 söndag saknas i veckovyn: `end_date=YYYY-MM-DD` = midnatt. `svDayRange` ger halvöppet dygnsintervall i GET.
- [x] F05 offertsummering: rättad tidigare i dag (0c1c3c9), saknades i previewn vid provet.
- [x] Facit `tests/schema-tider.spec.ts`: offset/DST, normalisering, intervall, inkoppling, v215, och att varje `.rpc()` har CREATE FUNCTION i sql/ — två saknade (auto-approve-räknare, storefront-visningar) fick v216, körd.
- [ ] Kvar för Codex/andra: F03 dölj lanseringsgrindade länkar, F04 veckonummer i attest, F06 fliken Uppgifter, F07 inställningsetikett.

# Push när Lisa fångar ett missat samtal (Claude 2026-09-06, lanseringsplanen)

- [x] Fynd: vanligaste vägen (vidarekoppling som ingen svarade på →
      app/api/voice/missed) gav ägaren INGEN signal — bara catch-SMS till
      uppringaren + engångs-SMS:et vid första händelsen. Röstbrevlådegrenen
      (voice/incoming) skrev in-app-notis men pushade inte. Analyserade
      inspelningar pushade redan (meeting_summary/phone_call).
- [x] lib/voice/fangat-samtal.ts: meddelaFangatSamtal() = in-app-notis +
      push via sendApprovalPush (typ missed_call_captured, klass hant, dedupe
      per call_id). "Lisa fångade ett samtal" bara när en sms_log-rad med
      status 'sent' (automation_rule, till uppringaren, yngre än webhook-
      starten) finns — annars "Missat samtal … ring upp". Fail-soft.
- [x] Båda vägarna inkopplade: voice/missed (ny) och voice/incoming
      (ersätter direktanropet till notifyMissedCall). url /dashboard/calls.
- [x] Facit tests/lisa-fangat-samtal.spec.ts (13 prov) i test:contracts +
      contracts.yml. tsc rent, 1097/1097 kontraktsprov gröna.
- Läge i produktion: push_subscriptions har NOLL rader (ingen har
  installerat PWA/app-push ännu) och call_recording inbound senaste 30 d
  är 0 — pushen kan inte driftprovas förrän en telefon prenumererar.
  Provsteg: installera PWA på Nordström El, ring numret, låt det gå till
  missat → push + rad i push_dispatch_log (eller push_held 21–07).

# Livegenomgången F10/F11 (Claude 2026-09-06)

- [x] F10: `project_change.notes` ("Intern notering" i ÄTA-formuläret) ritades
      i ÄTA-PDF:en under ANTECKNINGAR — samma PDF som kunden får via
      /api/ata/sign/[token]/pdf. Blocket och fältet borttagna ur lib/ata/pdf.ts.
      Sign-API:t (JSON) plockade redan fält uttryckligen utan notes.
- [x] F11: deriveStatus räknade förfallodagar utan att se statusen; utkastet
      FV-2026-003 (due_date 2026-06-10, aldrig skickat) fick 88 dagars ränta
      (625 → 637 kr). draft/cancelled/credited ⇒ unpaid, 0 dagar, ingen ränta.
- [x] Facit tests/livegenomgang-f10-f11.spec.ts i test:contracts + CI.
      tsc rent, 1103/1103 gröna.
## 2026-09-05 — Gemensam integrationskontroll, PR #7–#10
- [x] Samla de fyra oförändrade leveranserna i en granskningsgren; ta med mains CI-rättningar.
- [x] Kundunderlag: säkert överlämnande till offertens befintliga intag och beständig källtext.
- [x] Dagsavslut: uppdatera projektet efter bekräftat sparande och visa nästa väg för ÄTA-förslag.
- [x] Offert: stäng glapp mellan lokal återställning, autospar och explicit sparande.
- [x] Kör gemensamma kontrakt, integrationsprov, TypeScript och produktionbygge.
- [x] Dokumentera vad som är bevisat respektive kräver autentiserad driftkontroll.

Granskningsresultat och kvarvarande drift-/Lars-beroenden: tasks/integration-gap-review.md. Kodrättningarna är verifierade lokalt; hela driftkedjan är inte godkänd ännu.

## Lars kundunderlagskontroll och korrigeringar
- [x] Samma testspecar lokalt och CI, korrekt debounce/navigeringsflush, inga interna ID:n i AI-text.
- [x] Beständig AI-granskning med källhänvisningar, bränslegrind, bildkontroll och serververifierad projektkoppling.
- [x] Hantverkaren granskar och kan skapa idempotent ÄTA-förslag i befintliga godkännandekön.
- [x] Regressionstester, TypeScript, build och granskningsbar SQL/PR.
- [ ] Verifiera migration och inloggat flöde mot riktig AI/DB när åtkomst finns.

## 2026-09-05 — Hela uppdragsresan
- [x] Kontrollera faktisk browser-/driftåtkomst och senaste PR-status.
- [x] Följ godkänd offert → projekt → tid/material → ÄTA → fakturaunderlag och betalstatus.
- [x] Reproducera och rätta överlämningsfel med verkliga produktionsfunktioner och isolerade beroenden.
- [x] Kör relevanta regressioner, TypeScript/build och dokumentera bevisnivå per steg.
- [x] Uppdatera gransknings-PR; skilj driftbevis från simulerade prov.

Review: tasks/whole-job-journey-review.md. Åtta överlämningsfel rättade. Tre ytterligare risker öppet dokumenterade; inloggat driftprov inte genomfört eftersom session/DB-åtkomst saknas.

## PR #11 — CI och befintlig slutfaktura efter granskning
- [x] Ta in main e2b9740 och ta bort backslash i vikt YAML-block.
- [x] Stoppa slutfakturaskapande när projektet redan har faktura; läsfel får inte öppna vägen.
- [x] Testa befintlig faktura, företagsisolering, läsfel och exakt CI-kommando.
- [ ] TypeScript/build, uppdatera PR och verifiera CI på nya huvudet.
- [ ] Inloggat demoprov återstår; delbetalning/avdragsparitet efter lansering enligt granskningen.
## 2026-09-06 — Första nyttan från onboarding
- [x] Kartlägg befintlig första-uppdragsfinal, startlista, offertstart och turer.
- [x] Skiss och avgränsning: docs/design/first-value/PLAN.md.
- [x] Bygg målanknuten start, säker överlämning och frivillig offertguide.
- [x] Verifiera mobil/desktop, kontobyte, fel och integrationskontrakt.
- [ ] Leverera separat granskningsgren med ärligt provningsläge.

Första nyttan: 1 104 kontrakt och fyra Chromiumprov gröna lokalt.
Riktiga komponenter, avlyssnade API-svar. Inloggat AI-/DB-prov återstår.
Skiss, screenshots och provningsordning: docs/design/first-value/PLAN.md.

## 2026-09-06 — Sammanhängande jobbtyp → offertstandard (bygger på PR #13)
- [x] Konkreta branschjobb, egen jobbtyp direkt, bevara äldre val.
- [x] Spara onboardingval som riktiga jobbtyper idempotent; återanvänd i offertsteget.
- [x] Standardrader direkt: välj/skapa artikel, mängd, pris, förhandsvisning i onboarding/inställningar.
- [x] Återanvänd valda rader från offert som jobbstandard med explicit val och samtidighetsskydd.
- [x] Behåll artikelreferenser, reservationsförslag, offertögonblicksbilder och affär/projektkoppling.
- [x] Verifiera serverkontrakt, mobilflöde, tsc, build. Redovisa separat kvarstående driftprov.

Design: samma job_types används genom resan. Föreslagna namn ändrar aldrig befintliga jobb. Inga automatiska priser eller reservationer. Standardrader använder befintliga quote_templates; inga nya databaskolumner. Befintliga mallar redigeras radvis med updated_at-konfliktskydd och övriga fält bevaras. Nyskapad standard får deterministiskt id per jobb så dubbla klick inte skapar två standarder. Flera redan kopplade mallar kräver uttryckligt val. Egen artikel använder befintligt artikel-API och dess dubbletthantering.

Verifieringsresultat och kvarstående inloggat prov: `docs/handoffs/JOB_STANDARDS_2026-09-06.md`. PostgreSQL- och UI-proven är isolerade, inga produktionsskrivningar.

Slutkontroll 2026-09-06: 1 152 kontraktstester gröna (inklusive 12 nya PostgreSQL-prov), två jobb-/artikelresor i Chromium gröna, tsc rent och produktionsbygge exit 0. Mobilfixarna för PR #13 har separat prov för samtliga fem tipssteg vid 375×812 och 1280×900; båda gröna.


## 2026-09-06 — Första riktiga jobbet: integrationskontroll
- [x] Kontrollera main och PR #11–#14 samt demoåtkomst. #11 är ännu inte integrerad; dess rättningar ska inte dupliceras. Webbläsaren står på inloggning och lokal DB/session saknas.
- [x] Följ kodens övergångar onboarding → offert → accept → projekt → fakturering; driftresan är fortfarande blockerad av session och sammanslagen version.
- [x] Reproducera och rätta samtidig manuell accept, återförsök och läsfel med 11 beteendeprov.
- [x] Kontrakt 1 163 gröna, separat #11-fakturaprov 57 gröna, TypeScript rent. Bevisnivå och inloggad körordning dokumenterade. Build slutstatus i PR-leveransen.
- [x] Publicerat PR #15 utan ändring av #14. Kodversionens CI och produktionsbygge gröna. Säker inloggning lyckades men öppnade Bee Service AB i äldre onboarding; kontots lämplighet och gemensam granskningsversion måste bekräftas före skrivande driftprov.

# Skisser 2026-09-06 → ytor (beslut Andreas 2026-09-06 kväll)

Tre Claude Design-skisser i docs/design/skisser-2026-09-06/. Kartläggning
mot koden gjord (tre utforskningar). Beslut: två byggs före lansering,
två skrivs som spec till efter lansering.

- [x] A. Företagsskanningen (21fefd62) (components/tour/CompanyScan.tsx + API):
      tvådelad desktopvy (teal Matte-panel + fyndlista med progress),
      etikett per rad Importerat/Möjlighet/Uppskattat i ScanRow, nya fält
      overdueCount + oldestStaleQuoteDays, sanna källor ("Går igenom",
      aldrig Gmail/Fortnox som inte är kopplat), slutkort, smal mobilvy.
      CTA heter aldrig "Command Center" (internt namn, capability-inventory).
      Alla facit-låsta strängar i tests/company-scan.spec.ts behålls.
- [x] B. Daniels agentrad (2fac2a03) på offertsidan (app/dashboard/quotes/[id]):
      rad under åtgärderna när efterkalkylen har ≥3 liknande jobb och
      varnar; "Visa varför" (exakt etikett, SYNLIG-INTELLIGENS) med de
      enskilda projekten + debrief-citat ur project_lesson; "Lägg till N h"
      / "Behåll N h" skriver learning_events (quote_price_adjusted);
      snooza/avfärda per offert. Marginalnotisen (Karin) byggs INTE nu.
- [x] C. Spec efter lansering (eb6a2703, punkt 13 och 14): Field Command (mobilappen, punkt 1 i
      efter-lansering) och Karins marginalnotis (jämförelsemotor möte→rader,
      stabila rad-id). Skisserna är underlaget.

# Liveprov onboarding → fakturaunderlag: F17, F20, F21 (Claude 2026-09-06 kväll)

- [x] F17: kolumn-DEFAULT på business_config.pricing_settings seedade
      hourly_rate 650 på varje nytt konto (v79 städade bara raderna). v218 KÖRD:
      ny DEFAULT utan timpris + 7 rader städade. Testkontot: 850, inget skuggande.
- [x] F20: en kronformatering (lib/format-price formatKronor/formatKronorTal):
      hela kronor utan decimaler, öre med två. Dokumentmotorn, offertbyggarens
      rader, portalen, fakturaskaparen och alla fyra mallarna använder den.
- [x] F21: förfallodatum via svDatePlusDays (svensk kalenderdag), fakturadatum/
      betaldatum/giltig-till via svDateStr. Ingen toISOString().split('T')[0]
      kvar i faktura-/offertskaparna eller create-invoice.
- [x] Facit tests/livegenomgang-f20-f21.spec.ts (9) i test:contracts + CI.
      tsc rent, 1664/1664 (1 skipped), pglite 17/17.
- Codex: F16, F18, F19, F03, F06, F07. Omprov i produktion, inte previewn.
- [x] F22 (ur Codex ÄTA-prov): "Kopiera signeringslänken i stället" markerar
      nu ÄTA:n som skickad (method=link, utan SMS) så den syns i kundportalen
      och PDF:en låses upp. Facit tests/livegenomgang-f22.spec.ts.
- [x] Samtidiga slutfaktura-anrop (Codex dubblettprov täckte bara upprepade):
      v219 KÖRD — partiellt unikt index, högst en levande slutfaktura per
      projekt; create-final-invoice fångar 23505 och återanvänder vinnaren.
      Facit: kapplöpningsprov i tests/project-invoice-journey.spec.ts.
      Guarden i routen är medvetet bred (alla projektfakturor, inte bara
      final) — den skyddar mot dubbelfakturering efter en delfaktura.
- [x] F04: attestvyn räknade veckor från 1 januari med söndag som veckostart
      (söndag 6 sep = "Vecka 37" mot V36 i veckovyn). Nu ISO-vecka via
      isoWeekInfo, måndag i UTC ur datumsträngen. Facit livegenomgang-f04.
- [x] F23–F26 (produktionsprov 7 sep, #18-beskrivningen): "Skicka faktura"
      heter "Skapa faktura" + förklaring att den skapas som utkast;
      förhandsgranskningen visar befintlig faktura i stället för nästa
      nummer; 41 kronbelopp via toLocaleString bytta till formatKronor;
      Fakturerat räknar bara utfärdade fakturor (aldrig utkast) och korten
      jämför netto mot netto; framdriftens nämnare = grundoffert + signerad
      ÄTA. Paritetsbaselinen uppdaterad till öre-regeln (45,50 / 14 045,50).
- [x] Mobilprov utan telefon: nio ui-specar körda headless i 375 px och
      1280 px, 37 prov gröna (se lessons om headless-shell-symlinken).
      Kvar: inloggade flöden på riktig telefon (Andreas i morgon).

# Nattsviten ärlig igen (Claude 2026-09-07 morgon)

- [x] Sviten hade dött i OOM i tsc varje natt sedan 2 sep (ecc4d38c gav
      heap). Första riktiga körningen 06:46 UTC: 7707 gröna, 25 röda i 20 filer.
- [x] Triage i tre grupper. Två riktiga regressioner rättade i kod:
      "dygnet runt" i partnermaterialet (leave-behind, partnerdeck) → "varje
      dag"; Obesvarat-märket i inspelningslistan hade aldrig blivit committat
      (facit fanns, koden saknades) → call_status + märke återställt.
- [x] 22 facit-uppdateringar till medvetna ändringar (PR #13/#14, transkrip-
      tionsmodulen 9e400e55, kom-igang-signalerna, per-företags-nycklar i
      HemTur, A/B-presentatören, launch-truth-copyn), var och en med commit-
      referens i specen. Ingen intent försvagad.
- [x] Miljö: tests/customer-preparation/ ignoreras av standardkonfigen (kräver
      dev-server; körs via playwright.preparation.config.ts). Filming-isolering
      intakt. Ny allowlist-post för veckorapportens ägar-SMS (recipient internal).
- [x] Lokalt: 454 prov i de berörda filerna gröna, kontraktsgrinden 1694 gröna.
      Nästa nattkörning ~06:30 UTC 8 sep ska vara helt grön.
# Kundens första intryck och värde (Codex 2026-09-07)

- [x] Granska första tio minuterna: intro, val, telefon, import, betalning, första uppgift och tom start.
- [x] Granska beställarens offert-, ÄTA- och fakturaresa inklusive kvitton och felvägar.
- [x] Jämför offentliga löften, partnertexter och köpflöde med aktuell kod och launch-underlag.
- [x] Genomför avgränsade förbättringar och skapa färdiga kundstarts-/partnermallar.
- [x] Kör relevanta lokala kontroller, typkontroll och bygge; redovisa gränsen mot skarpa prov.
- [x] Leverera draft-PR och samlad rapport, utan merge/deployment/utskick.

Levererat: dashboard draft-PR #20 och landing draft-PR #2.

Review: se [kundupplevelserapporten](../docs/handoffs/CUSTOMER_EXPERIENCE_2026-09-07.md) för leverans, verifiering och återstående skarpa prov.

# Tre små kundstartsfixar (Codex 2026-09-07)

- [x] Skilj läsfel från tom firma i genomgången, med återförsök och skydd mot sena svar.
- [x] Märk mejlens tidsvärde som uppskattning och länka till förklaringen på Översikt.
- [x] Dela kanalbevis och prioriteringsunderlag mellan startsidan och livscykelmejlen, med bevarad auth och tenantfiltrering.
- [x] Kör riktade fel-/återhämtningsprov, tidsfacit, kanal-/prioriteringsprov, typkontroll och bygge.
- [x] Lämna separat draft-PR och dokumentera miljöbegränsningar.

Om kanalunderlaget inte kan läsas får mejlet ingen gissad prioritet; startsidan visar läsfel med återförsök. Inga nya tabeller, utskick eller skarpa kundprov. Större kundstartsfunktioner ligger efter lansering.

Review: 9 röda / 2 gröna nya prov före rättning. Efteråt 94 riktade kod-/kontraktskontroller + 4 browserprov gröna, tsc och Next-produktionsbygge exit 0. Lint öppnar konfigurationsdialog och är inte verifierad. Rapport: [tre kundstartsfixar](../docs/handoffs/ONBOARDING_TRUTH_FIXES_2026-09-07.md). Ingen produktion eller kundkontakt.

# Rollgränser admin/projektledare/anställd (Codex 2026-09-07)

- [x] Kartlägg befintlig rollpolicy och inventera API-metoder, UI och agentvägar.
- [x] Prova kritiska läs-/skrivgränser isolerat med olika roller och projekttilldelningar.
- [x] Dokumentera bekräftade luckor, avsedda rättigheter och ej verifierade områden.
- [x] Lämna granskningsbart underlag med reproduktioner och nästa avgränsade åtgärd.

Företagsmedlemskap är inte rollbehörighet. Ingen produktionsdata, riktiga inbjudningar, SMS, betalningar eller användarändringar används i granskningen.

Underlag: docs/security/role-audit-2026-09-07/README.md. Fyra reproducerade luckor; 14 syntetiska observationer; 60 befintliga källkodskontrakt passerar. Ingen produktfix eller fullständig plattformscertifiering.
