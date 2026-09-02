# Spec: "Säg det en gång" (mobilt) + "Veckan med Handymate" (2026-09-02)

Status: UTKAST för Andreas godkännande. Byggs inte förrän det står "kör".
Bakgrund: punkt 3 och 4 i helhetsbedömningen (chatten 2026-09-02).
Skriven mot koden som den ser ut på main 46c9f7d — varje "finns" nedan är
verifierat i källan, inte i dokumentation.

Lackmustestet (docs/strategy/BUSINESS_TWIN_VISION.md): gör detta
Handymates bild av firman bättre, och Handymate bättre på att agera på
den? Del A matar bilden utan tangentbord. Del B bevisar värdet av att
Handymate agerat. Ingen av delarna får hitta på något.

---

## Del A — Säg det en gång

### Mål
Hantverkaren säger EN gång, i telefonen på bygget, vad som hände:
"Två timmar extra hos Andersson idag, kunden vill ha en extra list i
hallen, återbesök nästa torsdag." Teamet svarar inom sekunder med kort:
ÄTA-utkast (om projektet är entydigt), uppföljning/påminnelse, bokning,
dagboksrad. Ett tryck: "Godkänn alla 3". Inget skrivs utan godkännande.

### Vad som finns (bygg på, skriv inte om)
| Kapacitet | Läge | Var |
|---|---|---|
| Mikrofon i Matte-chatten (PWA/mobilwebb) → transkript | Finns | components/jarvis/SkrivRad.tsx → /api/matte/transcribe → Jobbkompisen processVoice |
| Samtal/möte → kort (ÄTA-utkast, uppföljning, offertutkast, kundfakta, dagboksrad, sammanfattning) | Finns | app/api/voice/analyze/route.ts (840–1010), dedupe call_card_key, evidens source_text + decision_record |
| Projektupplösning utan gissning | Finns | lib/voice/resolve-call-project.ts resolveCallProject (2 kandidater ⇒ null) |
| Kortkontraktet (EXECUTABLE: create_ata_draft, project_log_note, customer_fact, meeting_followup, create_booking, create_quote_draft, send_sms) | Finns | lib/approvals/action-contract.ts |
| Spara + pusha kort med dedupe och dagstak | Finns | lib/agents/shared/save-and-push.ts (MAX 3/agent/dag) |
| Push-mall per korttyp | Delvis | lib/notifications/approval-push.ts — INGEN mall för create_ata_draft, project_log_note, customer_fact, create_booking, meeting_followup ⇒ dessa kort ger ingen push alls |
| Ägar-SMS in | Saknas | app/api/sms/incoming behandlar ALLA avsändare som kund/lead; ägaren som SMS:ar sitt eget nummer hamnar hos Mattes kundflöde |
| Röstparser för ägarens egna anteckningar | Död kapacitet | app/api/voice/process (Whisper → Haiku → actions[]) har ingen anropare; skriver aldrig pending_approvals |
| Mobilappen (Expo) | Annat repo | handymate-mobile; dashboard-sidan har push_tokens + /api/mobile/home |

### Delta — det som byggs
1. **Ett läge, inte en ny hjärna.** Ny rutt `POST /api/matte/sag-det`:
   in = transkript eller text (+ valfritt customer_name-hint), ut = lista
   av kort som SKAPATS (pending) med gemensam `bundle_key`. Parsern
   återanvänder analyze-rutans åtgärdsextraktion (samma prompt-idiom,
   samma evidenskrav: varje kort bär `source_text` = citatet ur det sagda
   och `decision_record`). voice/process och jobbuddy/voice pekas ut som
   döda i docs och tas bort i samma pass.
2. **Ingång i mobilen:** i Matte-chattens mikrofonflöde får transkriptet
   en fråga innan det skickas som chatt: "Skapa kort av det här?" med
   två knappar (Skapa kort / Fråga Matte). Skapa kort → sag-det. Samma
   i textrutan via ett prefix-fritt val (ingen slash-syntax; svensk UI).
3. **Korttyper V1** (alla redan EXECUTABLE, ingen kontraktsändring):
   create_ata_draft (bara när resolveCallProject-idiomet ger exakt ett
   projekt OCH inget väntande ÄTA finns), project_log_note,
   meeting_followup (reminder/follow_up/reschedule), create_booking
   (bara med explicit tid + kund), customer_fact. Inte tidrapport (ingen
   EXECUTABLE-typ finns; blir eget beslut), inte faktura, inte SMS till
   kund (går via Mattes befintliga svarsväg).
4. **"Godkänn alla N":** ingen ny korttyp. Korten delar `payload.bundle_key`
   och `payload.bundle_size`; godkännandelistan grupperar på nyckeln och
   erbjuder en knapp som anropar befintlig godkänn-endpoint per kort i
   ordning och stannar på första felet (visar vilket). Mobil-hemmet
   (lib/approvals/mobile-home.ts) visar bunten som en grupp.
5. **Push med exakt länk:** buildPushTemplate får mallar för de fem
   typerna; url = `/dashboard/approvals?focus=<approval_id>` (aldrig en
   fri URL, blueprint §10). Bunten ger EN push: "Matte gjorde 3 kort av
   det du sa" (klass beslut, dedupe på bundle_key).
6. **Ägarens SMS (beslut 1 nedan):** sms/incoming får en avsändargrind:
   matchar `from` (E.164) en aktiv business_users.phone för businessen
   → ägarintag (sag-det med text), ALDRIG Mattes kundflöde. Fail-closed:
   okänt nummer = kund som idag.

### Grindar som gäller
- Entitet oklar (två kunder heter Andersson, två aktiva projekt) ⇒ inget
  kort av den delen; svaret listar "Vem menade du?" som chattfråga.
  Aldrig en gissning i ett kort.
- Pris/belopp sätts aldrig ur rösten. ÄTA-utkastet bär omfattning +
  citat, beloppet lämnas till Daniels befintliga ÄTA-väg.
- Dagstaket i save-and-push gäller agentinitierade kort; ägarinitierade
  bundlar räknas inte mot det men dedupas på bundle_key (samma text inom
  10 min = samma bunt).
- Bränsle: sag-det bokförs via bokforMatteUsage (facit-ai-kostnad).
- Tyst tid berör inte detta (ägaren agerar själv).

### Acceptans (facit-tester, browserlösa)
- Ren parser: fixtur "två timmar extra hos Andersson, extra list i hallen,
  återbesök torsdag" med EN Andersson + ett aktivt projekt ⇒ exakt
  [create_ata_draft, project_log_note, meeting_followup]; med TVÅ
  Andersson ⇒ noll ÄTA-kort + fråga.
- Varje skapat kort bär source_text som är en delsträng av inmatningen.
- Ingen prisinferens: ÄTA-payload saknar amount/total.
- Godkänn-alla stannar på första felet, resterande förblir pending.
- Push-mall finns för alla fem typerna och länkar med approval_id.
- sms/incoming: ägarnummer ⇒ aldrig executeMatteActions.
- voice/process och jobbuddy/voice borttagna; dead-code-facit uppdaterat.

### Beslut för Andreas
1. Ägar-SMS i V1 (punkt 6) eller bara mikrofon/text i appen?
2. Tidrapport som korttyp (kräver ny EXECUTABLE-typ + executor) i V1 eller
   senare?
3. "Godkänn alla" som sekventiellt anrop (föreslaget, inga nya
   transaktioner) eller en riktig batch-endpoint?

Omfattning: två nattpass (1: rutt + parser + kort + push, 2: mobil-UI +
bunt + ägar-SMS).

---

## Del B — Veckan med Handymate

### Mål
Varje måndagsmorgon får ägaren, utan att fråga, en ärlig bild: vad
teamet gjorde i veckan, vad det bevisligen gav i kronor, vad som behöver
ägaren nu. Retentionsmotorn. "Här är vad Handymate gjorde och vad det
var värt" — men bara det som går att belägga.

### Vad som finns
| Kapacitet | Läge | Var |
|---|---|---|
| Måndagskort (Resultat: månadens Identifierat/Agerat/Fakturerat/Betalt, Lärdomar, Risker, Förtroende) | Finns | lib/jarvis/monday-brief.ts, cron morning-brief (måndagar), MandagskortCard + MandagsmoteTakeover |
| Fyrstegsliggaren med kr bara ur riktiga fakturor | Finns | lib/value/ledger.ts |
| Värdekvitto per månad (confirmed_kr, potential_kr separat, ärlig nolla) | Finns | lib/value/vardekvitto.ts |
| Ägarrapport per månad (bekräftat, uppskattat, vilande, kostnad) | Finns, bara pull | lib/value/agarrapport.ts, AgarrapportBlock |
| Kvitto per utförd handling | Finns | lib/approvals/value-receipt.ts |
| Veckoperiod | Saknas | allt ovan räknar kalendermånad |
| Sektioner Projekt, Sälj, per agent | Saknas | ACTIVE_ROADMAP.md:678 |
| Leverans till ägaren (mejl/push) | Saknas | inga ägarmallar i lib/email-templates.ts; morning_report_sms_enabled läses ingenstans (död kolumn) |

### Delta — det som byggs
1. **`lib/value/veckorapport.ts` (ren, testbar):** `byggVeckorapport(rader,
   vecka)` över mån–sön svensk tid. Återanvänder ledger/vardekvitto-
   funktionerna med ett veckofönster i stället för månad — INGEN ny
   attributionslogik. Sektioner enligt POST_REALITY_LAUNCH_VALUE_WAVE §5:
   - Pengar: signerade offerter, ÄTA, fakturerat, betalt (fyra tal,
     aldrig summerade), "behöver dig" = förfallna/väntande kort med belopp
   - Projekt: enligt plan / behöver dig / avslutade (project-health-
     signalerna som redan finns)
   - Sälj: nya leads, skickade offerter, att följa upp
   - Teamet: antal kort skapade/godkända/utförda per agent (pending_
     approvals.payload.agent_id + automation_activity)
   - Lärt sig: max 3 observationer, alltid i formen "X observerades
     tillsammans med Y, N gånger" (kausalitetsförbudet, ACTIVE_ROADMAP)
   - Tom vecka: "Inget bekräftat värde den här veckan" + vad teamet
     ändå gjorde. Aldrig en tom sida, aldrig en påhittad siffra.
2. **En källa, tre ytor:** samma byggare matar (a) måndagskortet
   (ersätter dagens Resultat-sektion med veckans tal, månadstalen kvar
   som rad), (b) ett ägarmejl, (c) `/dashboard/veckan?v=2026-W36` som
   mejlet länkar till.
3. **Leverans:** cron `veckorapport` måndag 06:30 svensk tid (04:30 +
   05:30 UTC, samma dubbelkörning som push-morgon med guard). Mejl till
   ägaren (business_users role owner, e-post), push av klass
   teamuppdatering med länk (hålls till 07:10 om tyst tid). Bara till
   konton med aktivt team (lib/billing/aktiva-konton.ts).
4. **Opt-out:** ny kolumn business_config.veckorapport_email_enabled
   default true (migration v197), reglage under Inställningar →
   Notiser. Den döda morning_report_sms_enabled dokumenteras som död
   och rörs inte.
5. **Kostnadsraden** (agarrapport.kostnad) visas bara för betalande;
   under provperiod visas i stället "X dagar kvar" + första kvittot (som
   BillingStatusBanner) — samma förtjänta betalfråga, inte en ny.

### Grindar som gäller
- Kronor bara ur riktiga fakturor/betalningar (ledger). Uppskattningar
  har egen rubrik och summeras aldrig med bekräftat.
- Identifierat, agerat, fakturerat, betalt är fyra tal, aldrig ett.
- Ingen mening i mejlet får säga "orsakade", "tack vare", "gav dig".
  Facit låser ordlistan.
- Mejlet skickas ALDRIG om byggaren kastar; en trasig vecka loggas till
  Sentry, kunden får inget halvt mejl.

### Acceptans (facit)
- Fixturvecka med två signerade offerter, en betald faktura, ett förfallet
  kort ⇒ exakt fyra tal i Pengar, "behöver dig" = 1, per-agent-tabell
  stämmer.
- Tom fixtur ⇒ tom-veckan-texten, inga kronor, mejlet renderas ändå.
- Förbjudna ord finns inte i mall eller byggare.
- Cron: cron-hemlighet, dubbelkörningsguard, opt-out respekteras, bara
  aktiva-konton-helpern.
- Måndagskortet och mejlet byggs av samma funktion (källskanning).

### Beslut för Andreas
1. Mejl + push (föreslaget) eller bara push/kort?
2. Opt-out default på (föreslaget, det är själva retentionsmotorn) eller av?
3. Ska veckan ersätta månadens Resultat i måndagskortet, eller ligga
   bredvid?
4. Ska Bee Service få den första riktiga rapporten nästa måndag (8 sep)
   som test?

Omfattning: ett nattpass för byggare + mall + cron + facit, ett pass för
sidan och reglaget.

---

## Ordning som föreslås
B först (en natt, direkt värde för piloten och för din A/B), sedan A.
B kräver inget nytt av kunden; A kräver att någon faktiskt pratar in.
