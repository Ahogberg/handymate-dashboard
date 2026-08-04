# Konkurrentresearch: Easofts tidrapportering/schema/resursplanering

_2026-08-04, Sonnet-researchagent. Metodnotis: textbaserad webfetch —
skärmdumpar kunde INTE granskas visuellt; allt är "påstår" om inte annat
anges. Underlag för RESURS-SPRINTEN (tasks/resurs-masterplan.md)._

## A. Deras tidrapportering (påstådd funktionslista)

- Mobilapp-stämpling in/ut "ett par klick"; efterregistrering möjlig
- **GPS-geotaggning av varje stämpling** — marknadsförs som "unik"
- Per projekt/arbetsmoment, jämförs mot målarbetstimmar
- Attest med korrigeringsbegäran till anställd; inbyggda kontroller
- Lönexport: Fortnox, Visma, Procountor, Talenom m.fl.
- **Traktamente/km/måltid/verktygsersättning direkt i appen** (inline,
  inte separat steg)
- Övertid/rast-regler "anpassningsbar för kollektivavtal med varningar"
- Finska varianten: Valtti-kort/taggar, "vem är på arbetsplatsen nu"

## B. Deras schema/resursplanering

- **Dubbla kalendrar SAMTIDIGT**: montörskalender (per person) +
  projektkalender (per arbetsplats) — kärnan i deras pitch
- **Drag-and-drop** bekräftat på flera ställen ("ersätter kalkylblad")
- **Auto-flöde offert→schema**: godkänd offert → projektet läggs
  automatiskt i bokningskalendern (arbetslängd definierad i offertskedet)
- Tre konfigurerbara ansvarsmodeller (en styr allt / auto-tilldelning /
  montörer väljer själva)
- Frånvaro/semester: administrativ överblick, med i löneunderlag —
  tunt beskrivet, ingen dedikerad modul-sida
- **INGEN kompetens-/certifikathantering** — arbetsordersidan bekräftar
  uttryckligen att uppgifter INTE kopplas till kompetenskrav
- **INGEN beläggningsgrad-KPI** hittad — bara "holistisk bild" i graf/tabell
- Ingen bekräftelse på återkommande scheman
- Mobilpush/SMS vid schemaändring; montörer kollar "senaste planeringen"
  på morgonen; projektdokument följer tilldelningen
- Lönsamhet per arbetsplats/montör kopplad till tid (finska sidan)

## C. Anställdprofiler

Svagt: identitet för schema/tid/lön, realtidsinsyn i egna timmar/lön,
dokument via Docs-modulen. INGET certifikatregister, inga HR-fält.

## D. Recensioner — hyllningar vs klagomål (GULDET)

Hyllat: support-snabbhet, fältdokumentation med foton, "resource
allocation"-styrkan (kundcase Pratos/Herosähkö/Sorcolor).

Klagomål (Trustmary, 68/100 totalt):
- **Mobilappens kalendervy svår att använda sedan okt 2025** — exakt
  ytan vi ska vinna på
- Underbemannad onboarding/implementering
- "Grundläggande funktioner saknas"; "development hasn't met promised
  timelines"
- Enstaka tvåveckors supportsvarstider

## E. Syntes → RESURS-SPRINTENS styrning

**Must-match** (vårt läge inom parentes):
1. Auto offert→schema (**HAR** — create-from-quote + autopilot-paketet)
2. Dubbla person+projekt-kalendrar samtidigt (LaneView = projektdelen;
   persondelen byggs i R2)
3. Drag-drop-ombokning (R2)
4. Mobilpush vid schemaändring (R4 — push-infra + targeting finns)
5. Tid→lön/faktura utan manuell överföring (**HAR** payroll-export +
   from-time-entries; attest-konsolidering i R1)
6. GPS-stämpling opt-in (**HAR datat** — start_lat/lng; synliggörs R4)
7. Traktamente inline (**HAR** TravelSection; in i huvudflödet R4)
8. Lönsamhet per montör (R4 — performed_by + project_outcome finns nu)

**Skippa medvetet** (deras over-engineering):
- Kollektivavtalsregelmotor med lagvarningar
- Tre konfigurerbara ansvarsmodeller (konfigurationsdjungel) — EN tydlig
  modell hos oss
- Fragmenterade appar (ERP/Docs/Firasor med egen PIN-inloggning)

**Vinn där de är svaga:**
- Mobil schemavy byggd för tummen (deras sågas) — R2:s mobilläge
- Certifikat/behörigheter med utgångspåminnelser via agentkö (de har
  NOLL) — R3-differentieraren
- Beläggnings-KPI per person/vecka (de saknar) — R2
- Snabb självbetjänings-onboarding (deras är underbemannad)

**Andreas-uppföljning:** boka deras gratis-demo (easoft.se/gratis-demo)
för att SE UI:t — textresearch kan inte bedöma deras drag-drop-känsla.
