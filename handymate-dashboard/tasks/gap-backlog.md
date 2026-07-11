# Gap-backlog — beslutad 2026-07-11

_Från konkurrensresearch + kodbas-grep 2026-07-11 (tre webbrapporter med källor;
detaljer i Claude-minnet `competitive-landscape-2026-07`). Andreas beslut:
**körs EFTER A-testet** (`tasks/launch-verification.md`) — inget här går före
lanseringsgrindarna (A-test + B7 Stripe-köp)._

## Positionering (in i pitchen, kostar inget)

- [ ] **Approval-kön + förtjänad autonomi UPP i pitchen — med PRECIS claim.**
      Sen research-korrigering 2026-07-11: ServiceTitan skeppade "Max" i juni
      2026 (orkestrerat agentteam, enterprise-nivå) och Avoca kör multi-agent-
      framing — så säg ALDRIG "ingen har agentteam" (falsifierbart i demo).
      Det som håller: **ingen skeppar approval-kö-modellen** — alla kör
      agera-först-eskalera-sen; graderad FÖRTJÄNAD autonomi finns bara i
      horisontell agent-infra-litteratur, inte produktiserad i någon
      field-service-produkt. På SMB-nivån (Jobber/HCP) finns inte ens teamet.
- [ ] **EU AI Act-vinkeln i pitchen:** Artikel 14 (human oversight) träder i
      kraft aug 2026 — vår människa-godkänner-före-handling-modell är en
      compliance-berättelse som USA-aktörernas eskalerings-modell inte har.
- [ ] **Sentiment-fakta för demo/design:** missed-call-text-back är den
      universellt hyllade featuren (validerar vår Tier 0-kärnkil); röst-AI får
      delat betyg — äldre kunder lägger på för robotröster (viktigt för
      Röst-Lisa-designen: ärlig disclosure + snabb human-eskalering), och
      Jobbers receptionist kostar $450-600/mån all-in (vår prispunkt kan slå).
- [ ] **Röst-berättelsen:** Skaala (299 kr/mån, egen hantverkar-sida), Svaria
      m.fl. commoditiserar AI-telefonsvar i Sverige. Vår linje: rösten är
      ingången till loopen — Skaala kan ta samtalet men inte skicka offerten,
      dra ROT, jaga fakturan. Röst-Lisa efter grindarna som planerat, men
      fönstret är inte oändligt.
- [ ] **ROI-aritmetik-säljmotionen (från ServiceTitan Max):** sälj "vad kostar
      ett missat samtal / en tom torsdag / en obetald faktura", inte funktioner.
      ST motiverar en DUBBLAD månadskostnad mot undviken personal. Vi har redan
      produktbeviset i appen (veckovärde + saved-scoreboard) — samma aritmetik
      motiverar Fortnox-licensens 149 kr.
- [ ] **Scarcity-pilotprogram:** Max säljs som "ansök om early access" + white-
      glove för första kohorten → casestudies som säljer nästa hundra. Passar
      vår garanti-modell: pilotprogram som "ansök om plats" istället för öppen
      signup; Christoffers nätverk = kohort 1.
- [ ] **Anti-ServiceTitan-argumentet:** STs största kundkritik är prisopacitet
      ($245–500/tekniker/mån + hemliga tillägg) och data-som-gisslan (BBB/
      Reddit: kunder behöver jurist för att få ut sin data). Vi kör transparent
      pris + fri export — säg det mot hela kategorin.

## Nivå 1 — Snabba vinster

- [ ] **Grön teknik-avdrag** (solceller/laddbox/batteri — Skatteverkets separata
      avdrag, andra procentsatser än ROT, dras på fakturan). Kodgrep bekräftar:
      saknas HELT — laddbox finns som tjänst i kunskapsbas + proactive-care men
      noll avdragsmekanik. ROT/RUT-motorn (årstak, personnummer) återanvänds
      med andra parametrar. Öppnar el-segmentet.
- [ ] **Outbound-paketering "Vilande pengar".** Premium-segmentet i USA
      (Avoca $1 mdr-värdering, Netic, Hatch à $1–3k/mån) är OUTBOUND: rehash av
      osålda offerter, service-recall, återbokning. Våra råvaror finns redan
      (Daniels quote-follow-up, Hannas reaktivering, proactive-care, warranties)
      — gapet är paketering: ett samlat koncept mätt i återvunna kronor.
      **Max-tillägg:** (a) kapacitetsdriven trigger — "tunn vecka → Hanna
      föreslår 'vi har tider'-SMS till gamla kunder/osålda offerter" som
      KÖ-KORT (aldrig autonomt; STs egen skeppade version är bara alerts).
      Fyll egna CRM:et före annonsplattformar. Kräver kapacitets-primitiven
      (Nivå 2). (b) "Jobb markerat klart → fakturautkast i kön" med betallänk
      — ST claimar 14 dagar → 24 tim till faktura; Karins dunning finns redan.

## Nivå 2 — Medel

- [ ] **Kapacitets-primitiven (från ServiceTitan Max — deras viktigaste
      mekanik).** En enda siffra alla kanaler läser:
      `ledig kapacitet = skift (fallback: öppettider) − bokade jobb − övriga
      händelser`, per kompetens/zon, med %-tak som regler ("boka max 75%,
      reservera 25% för akutjobb"). Vi har råvarorna: booking + schedule +
      tidrapportering; CashRadar läser redan "tunna veckor" för pengar — detta
      är samma mönster för TID. Förutsättning för både Röst-Lisas bokning
      (boka bara slots som faktiskt finns) och kapacitetsdriven outbound
      (Nivå 1). Kräver realistiska default-durationer per jobbtyp — annars
      överbokning (STs dokumenterade fallgrop).
- [ ] **Serviceavtal/återkommande jobb** — avtalskoncept ovanpå warranties +
      proactive-care (årlig service → automatisk bokning + faktura).
      Förutsägbar intäkt för hantverkaren, churn-skydd för oss.
- [ ] **BankID-signering av offerter** (Criipto el. likn.) — svensk trust-signal,
      juridiskt starkare accept. Är SPEC i kapabilitets-inventeringen.
- [ ] **Kvitto/utläggsfångst** — foto → tolkning → kostnad på projekt → Fortnox.
      Saknas helt; mobilens kamera-infra (QuoteCamera) återanvänds. Stärker
      efterkalkylen.

## Nivå 3 — Strategiska

- [ ] **Röst-Lisa** (redan beslutad, efter sprinten — se ovan för positionering).
      **Max-designkrav till specen:** eskalering-först (boka de rutinmässiga
      70–90%, sömlös överlämning till människa — inte "AI svarar allt");
      kapacitetsjusterad **bokningsgrad som huvud-KPI** (STs mått: 90%
      kapacitetsjusterat / 70% totalt); boka mot kapacitets-primitiven i
      realtid; ärlig AI-disclosure + snabb human-väg (sentiment: äldre kunder
      lägger på för robotröster).
- [ ] **Offert-ur-diagnos i fält (från Max):** hantverkaren dikterar/fotar
      felet på plats → agent utkastar märkt offert (ev. good/better/best) med
      produktbanks-rader + automatiska ROT-rader → signering på plats innan
      man lämnar uppfarten. ST claimar 3× close vs muntlig offert. Råvarorna
      finns: Matte-röst + QuoteCamera i mobilen, produktbank med prishistorik,
      agent-offerter med riktiga rader (AB1-fixen). ROT-delen kan ST inte
      kopiera.
- [ ] **Grossistprislistor i produktbanken** (Ahlsell/Solar/Dahl-feeds;
      `manual_supplier_products` ligger halvdöd i schemat). ⚠ Konkurrenslägget
      OVERIFIERAT — kör riktad research före byggbeslut.
- [ ] **AI-prissättning** (långsiktig option): ingen på SMB-nivå har knäckt
      AI-*prissatta* offerter (bara AI-beskrivna). Vår datagrund finns:
      produktbank + prishistorik + efterkalkyl + ROT-logik.

## Partner/skippa — bygg inte

- **ID06-personalliggare** (lagkrav) + **certifierade egenkontroller**
  (GVK/Säker Vatten): SmartDok/Infobric äger området; utanför AI-berättelsen.
  Generisk checklist-infra finns redan för resten. ⚠ Overifierat konkurrensläge.
- **Konsumentfinansiering** (Wasa/Resurs/Svea): partneravtal, nästan ingen kod.
  Betalningsplan i offerten finns redan.

## Referens: ServiceTitan Max-prissättningen (för egen prisdesign)

Max = hemligt pris, contact-sales, ansökningsgrindat; **per-tekniker**-prissatt
ovanpå bas ($245–500/tekniker/mån + $5–50k implementation), men **röstagenterna
är usage-baserade** — ST tar betalt per konsumtion just där konsumtion = ersatt
arbete (besvarade samtal). Analytiker: Max-kunder dubblar ofta månadskostnaden;
säljs mot undviken personal. Lärdom för oss: hybrid är legitim — fast bas +
ev. usage-komponent på röst när Röst-Lisa kommer; och transparens är vårt vapen
(se Anti-ServiceTitan-argumentet ovan). Full research i plan-filen
`vad-kan-vi-kopiera-snug-phoenix.md` + Claude-minnet.

## Öppen research-skuld

- [ ] Svensk funktionsjämförelse (Bygglet/Struqtur/Hantverksdata/Fieldly:
      ID06, egenkontroller, grossistpriser, grön teknik, finansiering) —
      agenten fastnade 2026-07-11 och stoppades. Kör om stramare INNAN
      byggbeslut på nivå 2/3-punkter markerade ⚠.

## Sekvens

1. A-testet + B7 Stripe-köp (lanseringssprinten, `tasks/launch-verification.md`)
2. Merge av Idag-omdesignen (`tasks/todo.md` review-sektion)
3. Nivå 1 → 2 → 3 ovan, med omkörd svensk research före ⚠-beslut
