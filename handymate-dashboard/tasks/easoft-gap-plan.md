# Plan: Stäng Easoft-luckorna — "10 av 10, AI-först"

_2026-08-02, Andreas-beslut. Mål: kunna säga — sant — att varje tidstjuv
Easoft själva listat löses av en agent hos oss, inte av ett formulär.
Slutläge för positioneringen: konkurrentens egen behovslista blir vårt
featurekvitto._

## Utgångsläge (verifierat mot kod 2026-08-02)

| # | Easofts tidstjuv | Vårt läge | Klass |
|---|---|---|---|
| 3 | Ineffektiv kommunikation | Lisa fångar samtal, SMS, kö | ✅ AI-först |
| 4 | Okoordinerade projektplaner | Lars kapacitetsstyrd schemaläggning | ✅ AI-först |
| 7 | Ineffektiv budgethantering | Motor 1: efterkalkyl/facit, lärande | ✅ AI-först |
| 8 | Brist på realtidsdata | Idag-vyn: bevisband + kö = data som handling | ✅ AI-först |
| 1 | Manuell tidsregistrering | Formulär (som Easoft) | 🟡 Digitaliserad, ej agent |
| 9 | Krånglig arbetsorderhantering | Offert→projekt starkt; tilldelning manuell | 🟡 Digitaliserad, ej agent |
| 10 | Kvalitetskontroll | Checklistor utan AI (som Easoft) | 🟡 Digitaliserad, ej agent |
| 2+5 | Dokumenthantering (två punkter, en lucka) | Ren lagring, inget AI-lager | 🔴 Lucka |
| 6 | Inventarier | 73 rader CRUD, noll AI (low_stock_alert-typ finns i kön) | 🔴 Lucka |

**Ärlighetsregel som gäller hela planen:** vi säger aldrig "alla tio" förrän
alla tio är BYGGT★ och demobara. Fram till dess är repliken: "fyra av deras
tio löser vårt team redan i dag — fråga dem vilken av de tio en agent löser
hos dem." Den är sann nu och blir starkare för varje etapp.

**Behovsbevis-nyans:** Easofts lista är deras content marketing = bevis på
vad marknaden SÖKER, inte vad den BETALAR för. Därför är pilotsignal
(Christoffer + första kunderna) gate mellan etapp 2 och 3 — listan styr
riktningen, piloten styr ordningen.

---

## Etapp 1 — Egenkontroll-agenten (tidstjuv #10) 🎯 FÖRST

**Varför först:** närmast befintlig kod (checklistor + projektfoton finns),
mest visuellt demobar ("titta, den SÅG att fuktspärren inte var klar"),
och kvalitetsdokumentation är ett äkta juridiskt behov (besiktning,
försäkring, ÄTA-tvister).

**Bygget (4 increments, en agent-körning per increment):**
1a. **Fotoanalys-kärnan**: när foto laddas upp till ett projekt med aktiv
    checklista → vision-anrop (Sonnet, via befintlig get-model) med
    checklistpunkterna som kontext → strukturerad bedömning per punkt
    (stöds/motsägs/ej synlig). Ren lib-funktion, facit-tester med mockade
    modellsvar. Kostnadsvakt: befintliga cost-guard täcker; fotoanalys
    räknas som bakgrund (respekterar tak).
1b. **Kö-integrationen**: avvikelse → förslag i kön ("Lars flaggade:
    punkt X ser ofullständig ut på foto 3") med foto-tumnagel; bekräftelse
    → punkt markeras m. foto som bevis. NY approval_type i BÅDA
    (tool-definitions + executeApprovalPayload) enligt agentregeln.
    Persona: Lars (projekt/kvalitet = hans domän).
1c. **Projektvy-raden**: "Egenkontroll: N punkter styrkta med foto" i
    Dokumentation-gruppen + åtgärdsraden från canvas-designen
    ("Egenkontroll: 1 punkt kvar — {punkt}") som fas 1 fick utelämna —
    kräver samtidigt att project_checklist får typ/punktnamn exponerat
    (SQL-migration: kolumn `kind` på project_checklist, fil enligt
    sql/v2_*-konvention, Andreas kör manuellt).
1d. **Checklist-förslaget** (tillagd 2026-08-02, adoptionsfynd):
    checklistor skapas INTE automatiskt idag — hantverkaren måste aktivt
    välja mall i Dokumentation-fliken. Utan det steget finns ingen
    checklista för 1a/1b att analysera foton mot, och egenkontroll-agenten
    blir byggt-men-oanvänt. Lösning, i linje med kö-först-principen (inget
    auto-kopplas utan godkännande): när ett projekt skapas → Lars (eller
    Hanna, verifiera vem som redan äger projekt-skapande-flödet) föreslår
    rätt checklista i kön baserat på projektets bransch/jobbtyp, mot
    BEFINTLIGA branschmallar i lib/checklist-defaults.ts (ingen ny
    malldata). "Vill du använda Elsäkerhetskontroll-checklistan för det
    här projektet?" → godkänn = POST till befintlig
    /api/projects/[id]/checklists med template_id. Dedup: inget förslag
    om projektet redan har en checklista (aktiv eller ej). Ny approval_type
    'checklist_forslag' i BÅDA tool-filerna om skapandet triggas av
    agentverktyg — annars systemkod-genererad som 1b:s kort (bedöm utifrån
    var projekt faktiskt skapas: agentflöde vs. UI-formulär).

**DoD:** tsc + build rena; facit-tester på bedömningslogiken (mockade
modellsvar — aldrig live-API i test) OCH på checklist-matchningslogiken
(1d); demobar på demokontot med seedade foton OCH ett nytt projekt utan
checklista som visar 1d:s förslag; capability-inventory uppdaterad till
BYGGT★; SEO-artikelutkast "AI-först egenkontroll" skrivet men INTE
publicerat förrän Andreas testat.

**Får inte:** auto-markera punkter utan godkännande; auto-koppla
checklista utan godkännande (1d — samma princip); analysera foton som
inte hör till projekt; påstå "besiktningsgodkänd av AI" (juridik).

## Etapp 2 — Tidrapport-förslag (tidstjuv #1)

**⚠ OMSKRIVEN 2026-08-02 efter schemaverifiering (samma disciplin som
lärdomen 2026-08-01 kräver — verifierat mot faktisk kod, inte antaget):**

- `booking` har INGET person-tilldelningsfält — en bokning hör till
  business+kund+projekt, aldrig till en namngiven anställd. Planens
  ursprungliga "Du var bokad på Svensson i går 07–15" (per PERSON) går
  därför inte att bygga sant idag.
- `time_entry.business_user_id` finns i schemat (löneexporten läser den,
  app/api/time-reports/payroll-export/route.ts) men SÄTTS ALDRIG av
  någon av de fyra ställen som skapar en time_entry-rad (tool-router,
  checkin/approve, voice/execute, approvals-caset). Separat, redan
  existerande bugg — sannolikt gör löneexporten tyst ofullständig.
  INTE i scope för etapp 2 (ändrar inte matchningens grundmodell), men
  flaggad till Andreas som eget fast-follow-fynd.

**Reviderad kärnidé:** matcha på PROJEKT, inte person. "Projektet
Svensson hade en bokning i går (07–15) men ingen tidrapport än —
förbered en?" → godkänn med ett tryck. Samma värde (tidstjuv #1 löst,
admin bort från hantverkaren), ärligare mot datan. INTE GPS (integritet
+ kräver mobilapp) — kalenderbaserat, som ursprungsplanen.

**Bygget (2 increments):**
2a. **Förslagsmotorn**: dagligt cron (befintligt cron-mönster, registreras
    i vercel.json) som för varje business hittar gårdagens bokningar
    (booking.scheduled_start/end, status som indikerar utfört) utan
    matchande time_entry (project_id + work_date) → förslag i kön PER
    PROJEKT. Ren matchningskärna med facit-tester (bokning+rapport-
    fixtures). Persona: Lars (samma som etapp 1).
2b. **"Ingen tidrapport i går"-raden** i projektvyn (canvas-designen,
    utelämnad i fas 1 pga just denna dataluta) — attribueras nu till
    PROJEKTET, inte en person. Copy justeras ärligt från originalmallen
    (som förutsatte ett namn) — ingen påhittad person i texten.

**DoD:** som etapp 1 + hård regel: tidsförslag är löne-/fakturaunderlag →
godkännande ALLTID, aldrig förtjänad autonomi på denna typ (skriv in i
gating-kommentaren). Demo: demokontots seeds får en bokning-utan-rapport.

## 🚧 GATE: pilotsignal före etapp 3

Efter etapp 1+2: Christoffer + första kunderna använder dem skarpt.
Frågan som avgör ordningen på resten: används godkänn-korten, eller
avvisas de? Vilken lucka NÄMNER kunderna själva? Etapp 3–5 får byta
ordning här utan att planen skrivs om.

## Etapp 3 — Arbetsorder-tilldelning (tidstjuv #9)

Lars föreslår bemanning när projekt/delmoment skapas, baserat på
befintlig kapacitetsdata (kapacitet-fyllnad-cronens pickBestWeek
återanvänds — INGEN ny kapacitetslogik). Förslag i kön → tilldelning +
arbetsorder till den anställde. Mest värd för Storfirman-segmentet
(fler anställda) — därför efter gaten, när vi vet om sådana kunder finns.

## Etapp 4 — Dokument-agenten (tidstjuv #2+5)

Uppladdad fil → Haiku klassificerar (ritning/intyg/faktura/foto/avtal),
namnger, kopplar till projekt → syns i Dokumentation-gruppen sorterad;
Matte kan svara på "var är el-intyget för Svensson?" (verktyg i BÅDA
tool-filerna). Störst yta av etapperna — därför sent, och bara om
piloten visar att dokumentkaos är verklig smärta (Easofts två punkter
antyder det, men det är deras SEO som talar).

## Etapp 5 — Inventarie-agenten (tidstjuv #6)

Minst bygge, tunnast AI-värde: koppla befintlig low_stock_alert-typ till
verklig lagerdata + Hanna/Lars föreslår beställningslista från kommande
projekts produktbanksrader. Endast om ett riktigt kundbehov dykt upp —
annars stryks den och vi säger "9 av 10" med stolthet i stället för att
bygga hyllvärmare.

---

## Marknadsföringsspåret (löper parallellt, per etapp)

- **Per stängd etapp:** capability-inventory → BYGGT★, arsenalens
  Easoft-motdrag uppdateras med den nya punkten, SEO-artikelutkast
  "AI-först {område}" (samma källdisciplin som artikel 1–10).
- **Slutkampanjen** ("Easoft listade tio tidstjuvar. Fråga dem vilka en
  agent löser.") skrivs FÖRST när minst 8/10 är BYGGT★ och minst en kund
  använt varje i drift — annars är vi grammofonen med mikrofon.
- Demo-manuset får en valfri "tidstjuv-akt" efter etapp 2: öppna Easofts
  artikel live på mötet, gå igenom listan punkt för punkt mot vår app.

## Stående regler (alla etapper)

- En byggagent åt gången per repo; jag speccar/granskar/committar.
- Schema verifieras mot FAKTISK databas före varje migration (lärdom
  2026-08-01) — aldrig antas från migrationsfiler.
- Externa regelverk (besiktningskrav, lönehantering) facit-testas mot
  källan, aldrig mot intern konsistens (lärdom 2026-07-30).
- Nya agent-utskick respekterar TD-52-gatingen; inget externt utan kö.
- Marginaltak: nya AI-anrop klassas bakgrund om de inte är kundhändelser.
