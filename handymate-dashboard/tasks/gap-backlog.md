# Gap-backlog — beslutad 2026-07-11

_Från konkurrensresearch + kodbas-grep 2026-07-11 (tre webbrapporter med källor;
detaljer i Claude-minnet `competitive-landscape-2026-07`). Andreas beslut:
**körs EFTER A-testet** (`tasks/launch-verification.md`) — inget här går före
lanseringsgrindarna (A-test + B7 Stripe-köp)._

## Positionering (in i pitchen, kostar inget)

- [ ] **Approval-kön + förtjänad autonomi UPP i pitchen.** Research-fynd: ingen
      aktör i världen skeppar cross-domain agentteam bakom en godkännandekö med
      graderad autonomi (Housecall Pro har bara brandingen, ServiceTitan bara
      dispatch-accept/reject, Netic/Probook kör autonomi utan kö). Vårt mönster
      är före skeppat state of the art — säg det.
- [ ] **Röst-berättelsen:** Skaala (299 kr/mån, egen hantverkar-sida), Svaria
      m.fl. commoditiserar AI-telefonsvar i Sverige. Vår linje: rösten är
      ingången till loopen — Skaala kan ta samtalet men inte skicka offerten,
      dra ROT, jaga fakturan. Röst-Lisa efter grindarna som planerat, men
      fönstret är inte oändligt.

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

## Nivå 2 — Medel

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

## Öppen research-skuld

- [ ] Svensk funktionsjämförelse (Bygglet/Struqtur/Hantverksdata/Fieldly:
      ID06, egenkontroller, grossistpriser, grön teknik, finansiering) —
      agenten fastnade 2026-07-11 och stoppades. Kör om stramare INNAN
      byggbeslut på nivå 2/3-punkter markerade ⚠.

## Sekvens

1. A-testet + B7 Stripe-köp (lanseringssprinten, `tasks/launch-verification.md`)
2. Merge av Idag-omdesignen (`tasks/todo.md` review-sektion)
3. Nivå 1 → 2 → 3 ovan, med omkörd svensk research före ⚠-beslut
