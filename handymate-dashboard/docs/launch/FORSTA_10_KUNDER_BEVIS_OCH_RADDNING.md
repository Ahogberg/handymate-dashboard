# Första 10 kunderna: bevis och räddning (2026-09-02)

Beslut (Andreas, efter Codex förslag och Claudes justering): efter att
branschpaketen landat FRYSER vi ny bredd. Därefter bevisar vi att nya
kunder når värdet utan vår hjälp, och bygger en smal räddningsloop för de
första 10–30 kunderna. Ingen ny funktion som inte proven kräver.

Det här dokumentet ÄR programmet. Det ersätter inte lanseringschecklistan:
Grind A och B lever i docs/launch/GO_NO_GO.md och /api/admin/launch-readiness.
Nytt är bara (1) två bevisnivåer, (2) en räddningskö, (3) att manuella
lanseringsbevis sparas som rader i stället för prosa.

## 0. Frysdatum
Branschpaketen får ett datum: ____ (Andreas sätter). Frysen börjar det
datumet oavsett hur färdigt paketet är. Efter datumet: bara P0/P1 ur
proven, räddningskön, och det som Grind B kräver.

## 1. Två bevisnivåer

Hur lång en riktig kundresa är vet vi inte: inget pilotkonto har hittills
använt Handymate fullt ut som affärssystem. Tiderna mäts i provet, inte
antas.

**Nivå A — värde dag ett, på fyra färska konton (bygg, måleri, el, VVS):**
betalning → onboarding → verifierad inflödeskanal → första offert skickad
→ första uppdrag till teamet. Mäts i timmar från konto skapat. Körs på
fysisk mobil, riktiga mejl, SMS, samtal, push och OAuth. Nivå A är det
alla nya kunder möter första veckan och där alla externa signups hittills
stannat.

**Nivå B — pengaloopen, en gång på riktigt:** offert signerad → projekt →
tid/material/ÄTA i mobilen → avslut → faktura → Fortnox → betald. Bee
Service (riktig kund) plus ETT av de fyra färska kontona. Ett bevisat varv
räcker för att veta att kedjan håller; fyra varv är en månad utan extern
kund.

## 2. Regler under provet
- **Inga manuella databasfixar.** Behövs en blir det ett P0-ärende med
  kodfix, aldrig SQL. Gäller Andreas, Claude och Codex lika. Varje sådan
  frestelse bokförs i räddningskön som signal `manuell_fix_kravdes`.
- **P1 definieras av kunden, inte av allvarlighet:** P1 = kunden når inte
  första värdet (nivå A) utan vår hjälp. P0 = pengar, data eller
  integritet fel. Allt annat väntar till efter frysen.
- **Mät med det som finns:** onboardingtratten (/admin/onboarding-funnel),
  aktiveringsmåtten (/api/admin/pilots: första fynd, beslut, utförande,
  kvitto), kanalhälsan, kortkvaliteten. Ingen ny instrumentering.
- **Grind A körs före varje nivå-A-konto** (samma JSON + SHA som GO_NO_GO
  kräver), inte en gång i början.

## 3. Räddningskön (byggs, tasks/plan-raddningsko.md)
En daglig intern körning gör risksignaler till ärenden som en person
äger. Bara för de första kunderna (is_pilot eller klar onboarding senaste
30 dagarna, aldrig demo/test).

| Signal | Betyder | Källa som redan finns |
|---|---|---|
| onboarding_stannat | ingen ny stämpel på 24 h (medel) / 72 h (hög) före finalize | tratten |
| ingen_verifierad_kanal | klar sedan 48 h, ingen kanal verifierad | kanalhälsan |
| ingen_aktivering | klar sedan 72 h, inget godkänt kort | aktiveringsmåtten |
| ingen_offert | klar sedan 7 d, ingen offert skickad | quotes.sent_at |
| inget_uppdrag | klar sedan 3 d, inget uppdrag | mission |
| integration_bruten | Fortnox-token utgången eller synkfel senaste dygnet | tenant_credentials, *.fortnox_sync_error |
| misslyckad_handling | misslyckad automation senaste dygnet (hög vid ≥ 3) | automation_activity |
| fastnat_kort | kort väntar > 5 d, eller går ut inom 24 h efter > 48 h | pending_approvals |
| falsk_framgang | "lyckat" kort av kvittotyp utan bevis | execution_result utan artifacts |
| manuell_fix_kravdes | bokförs för hand av den som ville in i databasen | – |

Ett öppet ärende per företag och signal (unikt index), uppdateras med
last_seen_at, stängs automatiskt när signalen är borta. Digest-mejl till
OPS_ALERT_EMAIL när något är öppet; tystnad betyder att vi tittade och det
var rent. Adminflik "Räddning" bredvid Support: öppna ärenden, evidens,
"Tar det" och "Löst" med anteckning.

## 4. Personlig uppföljning dag 0, 1, 3, 7
Kön är verktyget, människan är loopen. Dag 0: Andreas ringer eller SMS:ar
varje nytt konto samma dag. Dag 1: kanal verifierad? Dag 3: första offert
eller uppdrag? Dag 7: dag-7-mejlet (finns, cron onboarding-followup) plus
ett samtal om något ärende är öppet. Varje kontakt bokförs som atgard på
ärendet.

## 5. De hårda externa grindarna (Grind B, oförändrade)
1. 46elks påfyllt (saldot var 0 kr 2026-09-02) och Lisa bevisad på riktigt nummer.
2. Stripe live (produktionsnyckeln var en TESTNYCKEL 2026-09-02): köp, webhook, Bränsle, återbetalning.
3. Fortnox: en komplett fakturakedja utan dubbletter.
4. Google OAuth verifierad för icke-testanvändare.
5. Push, djuplänkar och röst på fysisk mobil (push_subscriptions fanns inte i produktion förrän 2026-09-02).
6. Extern mejlleverans och svarsväg.

Bevisen sparas som rader (lanseringsbevis: station, konto, bevis, vem,
när) så /api/admin/launch-readiness kan visa pass ur en riktig rad i
stället för en konstant. Prosan i docs/REALITY-WEEK.md fortsätter som
dagbok, men raden är sanningen.

## 6. Klart när
- Fyra nivå-A-konton har nått första offert och första uppdrag utan
  manuell fix, med tider bokförda.
- Ett nivå-B-varv är betalt i Fortnox utan dubblett.
- Alla sex stationer i Grind B har en bevisrad.
- Räddningskön har gått i sju dagar och varje ärende har en ägare och en
  åtgärd.
