# Pilot-körbok: skarpbevisning av de tre kedjorna

Syfte: bevisa Mission Control, löfteskedjan och Evidence-to-Payment på ett
RIKTIGT pilotflöde (spår 1, 2026-08-18). Databasnivån är redan bevisad
(`--project=mission-proof`, 8/8 två körningar) — det här är människonivån:
en riktig pilotkund, riktiga kunder, riktiga pengar. Samma anda som
GYLLENE-VAGEN.md.

Förkrav: v144–v148 körda (v148 återstår vid skrivande stund), pilotkonto
med minst en förfallen faktura eller ofakturerat arbete, ägarroll.

## Kedja 1 — Mission Control (pengamål)

1. Öppna dashboarden → skriv i uppdragsbandet eller Matte-chatten:
   "Frigör [belopp] kr före [datum]" (välj belopp som portföljen täcker —
   kolla Pengar på bordet först).
2. **Observera:** Matte föreslår en plan med pf_-poster ur VERKLIGA data —
   varje steg ska gå att känna igen ("det där ÄR vår förfallna faktura").
   Matte får ALDRIG föreslå något ni inte känner igen → i så fall: stopp,
   rapportera.
3. Starta uppdraget → heron växlar till uppdragsläge (gap/deadline/beslut).
4. Godkänn åtgärdskorten allteftersom (bubbelpillen "Matte behöver ditt
   beslut" ska dyka upp när kort väntar).
5. När en riktig betalning landar: **bevispunkten** — gapet minskar med
   exakt fakturans belopp, aldrig mer ("verifierat betalt" får aldrig
   överstiga vad banken sett). Panelen visar per-agent-utfall.
6. Avsluta/låt gå i mål → historiken visar uppdraget; Lärdomar säger
   "för tidigt att se mönster" (korrekt vid <3 uppdrag — grinden är beviset).

**Godkänt när:** planens alla steg var igenkännbara, progress aldrig
översteg verkligheten, och inget nådde kund utan godkännande.

## Kedja 2 — Löften (efter v147, körd)

1. Ha ett riktigt möte/samtal där ni säger något i stil med "vi hör av oss
   senast [dag]" — eller mejla det.
2. **Observera:** commitment-kortet som dyker upp ska bära det FÖRESLAGNA
   datumet (bara om ni faktiskt nämnde en tid — annars inget datum: aldrig
   gissat).
3. Bekräfta kortet → löftet blir bevakat (syns i get_customer_commitments
   via Matte: "vilka löften har vi ute?").
4. Låt deadline närma sig → 07:20-cronen ska ge påminnelsekort ~48h före.
5. Gör det ni lovade via ett kort (uppföljnings-SMS e.d.) → godkänn →
   **bevispunkten:** löftet markeras uppfyllt med bevisreferens.
6. Negativtest: låt ett löfte passera → passerat-kort ska komma, men
   löftet får ALDRIG automatiskt bli "brutet" — det avgör människan.

**Godkänt när:** datum aldrig gissades, bevakningen kom i tid, uppfyllelsen
bar referens till det verkliga kortet.

## Kedja 3 — Evidence-to-Payment (efter v148)

1. Välj ett projekt nära fakturering. Fråga Matte: "Är [projekt] klart att
   fakturera?"
2. **Observera:** svaret ska namnge konkreta blockerare ("ÄTA väntar på
   kundgodkännande") eller ge grönt med underlag — ALDRIG bara en procent.
   needs_review ska vinna när underlaget motsäger sig.
3. Åtgärda blockeraren på riktigt (få ÄTA:n signerad etc.) → fråga igen →
   verdictet ska flippa av verkligheten, inte av tid.
4. Skicka fakturan (vanliga vägen) → **bevispunkten:**
   GET /api/invoices/[id]/evidence-manifest visar fryst snapshot med
   status 'delivered', rätt versioner, och referenser till exakt de
   underlag som fanns.
5. Skicka om fakturan → manifestet ska vara OFÖRÄNDRAT (första leveransen
   är frysningen — idempotensbeviset).
6. Negativtest (om möjligt i testmiljö): bryt mark-steget → manifestet ska
   hamna i 'incomplete', driftlarmet ska fånga det, och admin-reconcilern
   ska läka det.

**Godkänt när:** verdictet speglade verkligheten, manifestet frös vid
första leverans och överlevde omskick oförändrat.

## Rapportering

Per kedja: datum, konto, vad som observerades, avvikelser (även små
formuleringsproblem — pilotens språk är produktens språk). Avvikelser →
tasks/tech-debt.md eller direkt fix beroende på allvar. När alla tre är
godkända på riktigt flöde: uppdatera docs/council/ACTIVE_ROADMAP.md —
kedje-grindarna är då öppnade för nästa lager (Mission Learning-insikter,
kundvänt manifest, Full Drift).
