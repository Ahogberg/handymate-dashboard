# Resurs-masterplan: Schema/Tid/Team i världsklass — "En dag, en sanning"

_2026-08-04, Andreas-beställning: omfattande förbättring av Planering
(tidrapportering/schema/resursplanering) för Easoft-paritet UTAN deras
komplexitet, Schema som egen huvudflik med profilkort. Underlag: intern
anatomikartläggning + tasks/competitive-easoft-planering-2026-08.md.
Design: ALLT byggs i befintliga designsystemet (teal primary-700, Space
Grotesk/DM Sans, rounded-2xl border-slate-200, eyebrows) — Claude Design
polerar per etapp, samma handoff-modell som offert-/fakturasprintarna._

## Nordstjärna

Matcha Easofts funktionsvärde, vinn där de är svaga: **mobilen** (deras
kalendervy sågas i recensioner sedan okt 2025), **enhetlighet** (deras
appflora är fragmenterad), **certifikat** (de har noll), **beläggnings-
KPI** (de saknar), och **agenterna som redan bor här** (dispatch,
kapacitet-fyllnad, tidrapportförslag förstärks — byggs aldrig förbi).

## Interna fynd som styr (kartläggning 2026-08-04)

- Persondagen FRAGMENTERAD: kundjobb i booking/Kalender, allt annat
  (internt/frånvaro/resa) i schedule_entry/Schema — ingen förenad vy.
- Utilization-heatmapen (finns, begravd i schedule/page.tsx 1915 rader)
  räknar INTE bookings → beläggningen missar kundjobben helt.
- dispatch.ts läser skills-JSONB som SAKNAR skriv-UI (matchningen i
  praktiken död); specialties[] (har UI, kopplad job_types) är okopplad.
- Team-profilerna begravda som Settings-tab; ingen sidebar-länk.
- Tidsmodulen: TVÅ incheckningsmodeller (time_entry vs time_checkins) +
  orphanad attestationssida (time/attestation, ingen nav-länk).
- tidrapport_forslag är projektnivå pga antagande (ingen boknings-
  tilldelning) som Storfirman-Etapp 5 gjort INAKTUELLT.
- TodayView.tsx 1030 rader; time-modulens tab-router är däremot ett
  BRA mönster att återanvända.
- Kapacitet per person = multi-employee-parity-planens Etapp 8
  ("FRAMTIDA EGEN PLAN") — realiseras i R5.

## R0 — Navigations-/strukturskifte — KLAR (0404741f)

Ny huvudflik **"Schema"** ersätter Planering-gruppens splittring:
- Undersidor: Översikt (R2:s resurstavla, ny), Kalender (dagens
  /dashboard/calendar flyttar in), Tid (dagens time-tabbar), Team
  (profilerna UT ur Settings).
- Fordon + Lager flyttar till lämplig grupp (Verktyg/Övrigt — minsta
  vettiga). Redirect-stubbar för alla gamla routes (mönstret finns i
  time/weekly m.fl.). Sidebar.tsx enda navkällan.
- Settings?tab=team blir redirect till nya Team-ytan.

## R1 — Datafundamentet: en persondag — KLAR (0404741f)

- **lib/schedule/person-day.ts**: förenad läsning booking
  (assigned_user_id) + schedule_entry per person/datumintervall. Ren
  sammanslagningskärna (facit-testas hårt: överlapp, heldag vs tid,
  frånvaro vinner-regler) + fetch-wrapper.
- **Beläggning byggs om** på persondagen (kundjobb räknas ÄNTLIGEN);
  behåll schedule-sidans heatmap-UI som konsument tills R2 ersätter.
- **skills↔specialties konsolideras**: specialties[] blir sanningen;
  dispatch.ts läser den; skills-JSONB pensioneras (migration sql/v83,
  Andreas kör; dispatch får fallback tills körd).
- **tidrapport_forslag → per person** när bokningen har tilldelning
  (antagandet inaktuellt); projektnivå kvar som fallback. Uppdatera
  lib/egenkontroll/suggest-time-entry.ts + facit-tester.
- **Incheckningskonsolidering**: time_checkins-flödet migreras in i
  time_entry-attestering; orphanade attestation-sidan pensioneras
  (redirect). Verifieras mot payroll-exporten (får inte ändra löne-
  underlaget — facit-test på exportens urval före/efter).

## R2 — Resursöversikten (nya flikens hjärta) — KLAR (950a1b40)

- **Veckotavla per person**: rader=anställda, kolumner=dagar; renderar
  persondagen (R1); beläggnings-% per person/vecka (KPI Easoft saknar);
  frånvaro inline (time_off_request); färgkodning per typ.
- **Drag-drop**: obemannade bokningar/pass dras till person — vid drop
  visas dispatch-rankingens kandidatbedömning (kompetens/närhet/
  tillgänglighet — ÅTERANVÄND lib/dispatch.ts-logiken, exponera som
  förslag); krockvarning via samma kontroll.
- **Projektvy-toggle**: LaneView återanvänds = Easofts dubbelkalender
  (person + projekt samtidigt växlingsbart).
- **Mobil**: förenklad dag/veckolista per person byggd för tummen
  (bottom-sheet-mönstret från offert-E3) — INTE krympt tavla. Detta är
  vinstytan mot deras sågade mobilkalender.

## R3 — Teamfliken: profilkort med operationell kontext — KLAR (986cafc5)

- Kortgrid: avatar/roll/kontakt, specialiteter (=dispatch-sanningen
  efter R1), aktuell beläggning, veckans pass, frånvarosaldo.
- **Certifikat/behörigheter** (differentieraren — Easoft har NOLL):
  ny tabell (sql/v84: cert-typ, nummer, utfärdat, giltigt-till, fil-ref)
  + UI på kortet + **agentpåminnelse före utgång** (systemgenererad
  approval_type cert_expiry_reminder via daglig cron-check; routing
  owner_admin).
- Redigering: team/page.tsx-logiken bryts ut ur Settings-inbäddningen.

## R4 — Tidsflödet poleras — KLAR (7e4158d8)

- TodayView (1030 rader) delas upp i komponenter.
- Traktamente/resor (TravelSection) in i huvudflödet inline (som
  Easoft) istället för separat kort.
- GPS-stämpling: datat finns (start_lat/lng) — synliggör som opt-in-
  badge i attestvyn (integritetsmedvetet: av som default).
- **Mobilpush vid schemaändring**: ny/ändrad tilldelning (booking.
  assigned_user_id ändras, schedule_entry skapas för annan) → riktad
  push till den anställde (push-infra + targeting från Storfirman-E4
  finns). Fire-and-forget, aldrig blockerar skrivvägen.
- **Lönsamhet per person** (medvetet designat, känsligt): owner/admin-
  gated rad i efterkalkylen — performed_by på fakturarader +
  project_outcome + internal_hourly_cost finns. Ingen smygintroduktion:
  egen sektion med tydlig behörighetsgräns.

## R5 — Agentlagret — KLAR (672ed83d)

- Nytt verktyg **get_person_schedule** (persondagen; BÅDA tool-filerna;
  Lars + Matte).
- **Resursplaneringskortet**: obemannad bokning inom X dagar →
  dispatch-ranking + cert-data → kort: "Fredag obemannad på Svensson —
  Micke är ledig och har elbehörighet, tilldela?" (approval_type
  dispatch_suggestion FINNS — berika payload med cert/beläggning).
- **Kapacitet-fyllnad per person**: week-capacity får per-person-läge
  ovanpå persondagen (Etapp 8 ur multi-employee-parity-plan realiseras);
  Hannas tunn-vecka-logik uppgraderas medvetet (hennes cron + trösklar
  ses över så aggregatbeteendet inte tyst ändras — dokumentera).

## Ordning & verifiering

R0+R1 (fundament, en körning eller två) → R2 → R3 → R4 → R5.
Per etapp: tsc + FULL next build (lessons.md-regeln) + facit-tester
(persondags-sammanslagningen och beläggningsberäkningen hårdast). R2:s
drag-drop testas mot dev-server. Nya migrationer (v83 skills-pensionering,
v84 certifikat) på Andreas körlista med deploy-först-ordning där det
krävs. BYGGT→LIVE kräver Andreas skarptest per sprintslut; demokontot
seedas med flerpersons-schema för demo (R2-DoD).

## SPRINTSTATUS 2026-08-05: R0-R5 BYGGT (ej skarptestat)

Alla sex etapper committade och deployade (0404741f → 672ed83d).
SQL körd: v83 (2026-08-04). KVAR för Andreas: **sql/v84_certifikat.sql**
(certifikattabellen — API/kort/cron degraderar snyggt tills den körts)
+ skarptest enligt slutrapporten.

Kända uppföljningar (medvetna, ej byggda):
- Approvals-executorn sätter inte business_user_id på auto-skapad
  time_entry vid tidrapport_forslag-godkännande trots att payload nu
  bär assigned_user_id — personattributionen syns i kortet men slår
  inte igenom i löneunderlaget. Egen liten uppföljningssprint.
- skills-JSONB-kolumnen ligger kvar odroppade (medvetet — v83
  dokumenterar); drop + dispatch-fallback-borttagning i städsprint.
- Demokontot bör seedas med flerpersons-schema för säljdemos (R2-DoD).
- Claude Design-polish per R2/R3-yta kvarstår som möjlighet — byggt i
  designsystemet men inte designgranskad.
