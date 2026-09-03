# Handymate — komplett lanseringstestsvit

**Status:** Auktoritativ utförandemanual för lanseringsbevis
**Uppdaterad:** 2026-09-03
**Beslutsprotokoll:** `docs/launch/GO_NO_GO.md`

Den här filen beskriver exakt hur Handymate ska verifieras före lansering.
`GO_NO_GO.md` äger det slutliga lanseringsbeslutet. Den här filen äger hur
bevisen tas fram. Äldre reality- och pilotprotokoll är historiska bevis, inte
ersättning för en ny körning på den release som faktiskt ska lanseras.

## 1. Grundregler

1. Välj en releasekandidat och skriv ned dess exakta Git-SHA.
2. Efter vald releasekandidat görs endast P0/P1-fixar.
3. Varje fix kräver omtest av den berörda kedjan.
4. Om release-SHA ändras ska relevanta bevis köras om.
5. Manuella databasfixar får aldrig användas för att få ett kundflöde grönt.
6. En synlig men obevisad integration är `NO-GO`. Dölj den eller märk den
   tydligt `Kommer snart` om den inte ska ingå vid lanseringen.
7. Ett tekniskt lyckat API-anrop är inte tillräckligt. Kundens faktiska
   resultat, status, meddelande och efterföljande data ska stämma.
8. Systemet får aldrig visa framgång när leverantören eller databasskrivningen
   misslyckades.
9. Inga leverantörshemligheter, lösenord eller personuppgifter sparas i
   bevisdokumenten.

## 2. Roller

| Roll | Ansvar |
|---|---|
| Andreas | Utför mänskliga handlingar: signup, betalning, telefonsamtal, SMS, e-postöppning, mobil/push, Fortnox och branschgranskning. |
| Bevisförare | Verifierar produktionsutfall read-only i databas och leverantörsloggar, sparar bevis och uppdaterar stationsstatus. |
| Fixägare | Rotorsaksanalyserar och korrigerar ett isolerat P0/P1-fel, verifierar tester och lämnar tillbaka till omtest. |
| Releaseansvarig | Låser SHA och fattar slutligt `GO` eller `NO-GO` från samlade bevis. |

Samma person kan ha flera roller, men den som byggt en fix bör om möjligt inte
ensam godkänna det skarpa slutbeviset.

## 3. Bevismapp och protokoll

Skapa ett underlag per release:

```text
docs/launch/evidence/<YYYY-MM-DD>-<kort-release-SHA>.md
```

Varje station ska bokföras med:

```text
Station:
Release-SHA:
Miljö:
Körd datum/tid (Europe/Stockholm):
Ansvarig:
Testföretag/business_id:
Handling:
Förväntat utfall:
Observerat utfall:
Databas-/leverantörsbevis:
Skärmbild eller skärminspelning:
Status: PASS / FAIL / BLOCKERAD / UNDANTAGEN-DOLD
Avvikelse och ägare:
Omtestad datum/tid:
```

`BLOCKERAD` räknas aldrig som `PASS`.

## 4. Förkrav med extern ledtid

Dessa ska lösas först. De får inte vänta till integrationsdagarna.

### 4.1 46elks

- [ ] Kontot har positivt saldo med rimlig marginal.
- [ ] Testföretaget har ett `assigned_phone_number`.
- [ ] Numret är kopplat till produktionswebhookarna.
- [ ] En extern testtelefon finns och tillhör inte en verklig kund.
- [ ] Leverantörens call- och SMS-loggar kan läsas vid provet.

### 4.2 Stripe

- [ ] Produktionsmiljön använder live-nycklar.
- [ ] Live-webhooken är konfigurerad och signerad.
- [ ] Fem aktiva priser eller den aktuella beslutade prisuppsättningen finns.
- [ ] Ett riktigt kort finns tillgängligt för 100-kronorsprovet.
- [ ] Den som testar kan kontrollera Stripe-event och kvitto.

### 4.3 Övriga externa konton

- [ ] Extern e-postinkorg finns för offert- och fakturaprov.
- [ ] Google-konto utanför eventuell testlista finns.
- [ ] Fysisk iPhone med aktuell iOS och Safari finns.
- [ ] Riktigt Fortnox-testbolag och behörig kontakt finns.

## 5. Kontoklassificering före räddningskön

Samtliga befintliga företag i produktionsdatabasen ska klassificeras innan
räddningskön och dag 0–14-uppföljningen används skarpt.

Tillåtna kategorier:

- verklig betalande kund
- aktiv pilot eller `comp`
- demo
- internt testkonto
- okänd — måste utredas

För varje rad sparas minst `business_id`, företagsnamn, kategori, grund för
klassificering, ansvarig och kontrolldatum. Använd befintliga fält som
`is_pilot`, `is_demo_tenant`, abonnemangsstatus och ägaruppgifter, men lita
inte enbart på namnheuristik.

Om produkten saknar en hållbar explicit markering för interna testföretag ska
det rapporteras som ett separat korrekthetsgap. Räddningskön får aldrig blanda
interna testkonton med riktiga kunder.

## 6. Branschgrind före relevansprov

Följande fyra startpaket ska vara mänskligt granskade innan agenternas första
förslag bedöms som branschrelevant:

- [ ] Bygg
- [ ] El
- [ ] Måleri
- [ ] VVS/HVAC

För varje bransch granskas:

- benämningar och svensk branschterminologi
- jobbtyper
- rimliga startartiklar
- reservationer och vanligt förekommande risker
- att inga priser, marginaler eller arbetsmoment presenteras som universella
- att innehållet är hjälpande startdata och inte ett påstående om kundens
  faktiska verksamhet

Färskkontoprovet har därefter två separata facit:

1. teknisk aktivering och fungerande kärnflöde
2. relevant och begriplig första agentupplevelse

## 7. Grind A — maskinell sanning

### 7.1 Ren installationskontroll

Repo använder `package-lock.json`. I en färsk checkout körs:

```powershell
npm ci
```

Npm-skript hittar lokala binärer genom `node_modules/.bin`. Lägg inte till
`npx` i skripten för att maskera en trasig installation. Om `playwright` inte
hittas trots installerat paket ska installationen repareras och rotorsaken
noteras.

### 7.2 Kod- och kontraktsgrind

Kör från repo-roten:

```powershell
npx tsc --noEmit
npm run build
npm run test:contracts
npm run test:partner-launch-gate
```

Aktuell lokalt verifierad baslinje 2026-09-03:

- `test:contracts`: 355/355 gröna
- `test:partner-launch-gate`: 11/11 gröna

Baslinjen är inte ett lanseringsbevis. Kommandona ska köras igen på den låsta
release-SHA:n.

### 7.3 Produktionsberedskap

Efter deploy:

1. Logga in på `https://app.handymate.se` med ett godkänt adminkonto.
2. Öppna `https://app.handymate.se/api/admin/launch-readiness`.
3. Spara hela JSON-svaret med release-SHA och klockslag.
4. Kör:

```powershell
npm run launch:smoke
```

Grind A är `PASS` endast när:

- adminrutten svarar `READY_FOR_MANUAL_PROOF`
- `summary.blocked` är `0`
- `launch:smoke` slutar med `PASS`
- health-svaret är färskare än fem minuter

### 7.4 Partnergrinden och v206

`business_config.company_name` ska inte finnas. Den verkliga kolumnen heter
`business_name`. v206 verifieras genom funktionssignatur och funktionsdefinition:

```sql
SELECT to_regprocedure(
  'public.create_partner_self_billing_batch(uuid,text,jsonb,text,boolean,text)'
);

SELECT pg_get_functiondef(
  'public.create_partner_self_billing_batch(uuid,text,jsonb,text,boolean,text)'::regprocedure
);
```

Godkänt när:

- sexparameterssignaturen finns
- definitionen använder `b.business_name`
- definitionen inte använder `b.company_name`
- den gamla funktionssignaturen inte går att använda
- grants är begränsade enligt migrationen

## 8. Grind B — verkliga externa bevis

### 8.1 Stripe live och Bränsle

Handling:

1. Köp minsta Bränsle-påfyllningen på 100 kr med ett riktigt kort.
2. Vänta på den signerade live-webhooken.
3. Läs kvittot i Stripe.

Godkänt när:

- checkout lyckas exakt en gång
- ett verkligt live-event har behandlats
- exakt en relevant `billing_event` finns
- `fuel_ledger` ökar exakt 10 000 öre
- kvitto och belopp stämmer
- omladdning, dubbelklick eller webhook-retry ger ingen dubbel kreditering

Spara checkout session-id, Stripe event-id, `billing_event`-id och skärmbild.

Negativa prov:

- [ ] Avbruten checkout ger ingen aktiv betalning eller Bränsleökning.
- [ ] Samma webhook-event två gånger behandlas högst en gång.
- [ ] En eventuell refund speglas enligt den beslutade ekonomiska modellen.

### 8.2 Lisa och 46elks

Följ även `docs/launch/LISA_SHARP_PROOF.md`.

| Station | Handling | Godkänt när |
|---:|---|---|
| 1 | Armera ringtestet | UI/API visar företagets verkliga tilldelade nummer och fönstret är aktivt. |
| 2 | Ring från extern telefon | Signerad 46elks-webhook träffar produktion och rätt tenant identifieras. |
| 3 | Kontrollera inflödet | Kund skapas eller återanvänds; lead och affär skapas i samma tenant. |
| 4 | Kontrollera telefonen | Ett verkligt SMS mottas exakt en gång utan rå leverantörstext. |
| 5 | Svara med tydlig kundfråga | Inkommande SMS hamnar i rätt tenants konversation. |
| 6 | Vänta på Lisa | Relevant utgående svar och agentkörning finns exakt en gång. |
| 7 | Kontrollera tenant två | Inga kund-, lead-, deal-, meddelande- eller notisrader finns där. |

Verifiera dessutom:

- [ ] SMS-STOPP blockerar efterföljande utskick.
- [ ] SMS-kvoten och Bränsletaket används på den verkliga vägen.
- [ ] Leverantörsfel visas som begripligt Handymate-fel, aldrig framgång.
- [ ] Flödet påstår inte att Lisa för ett fritt talat AI-samtal om detta inte
      ingår i den lanserade funktionen.

### 8.3 E-post

1. Skicka en riktig offert till en extern inkorg.
2. Verifiera avsändare, ämne och innehåll.
3. Öppna länken och PDF:en på desktop och mobil.
4. Kontrollera offertens status och aktivitetsrad.
5. Skicka en riktig faktura till samma eller annan extern inkorg.
6. Kontrollera länk, PDF, status och aktivitetsrad.

Godkänt när:

- ett mejl skickas per handling
- SPF/DKIM och leveransresultat är godkända
- rätt kund och objekt visas
- länkar och filer fungerar utan inloggning endast där det är avsiktligt
- dubbelklick eller retry skickar inte dubbelt
- leverantörsfel ger aldrig status `sent` eller framgångstext

### 8.4 Google

1. Koppla ett Google-konto som inte ligger på en testlista.
2. Slutför OAuth utan testvarning.
3. Läs en verklig kalenderhändelse.
4. Skapa eller synka en Handymate-händelse.
5. Kör samma synk igen.

Godkänt när:

- OAuth-state är giltigt och bundet till rätt session/tenant
- händelsen läses och skrivs korrekt
- återkörning skapar ingen dubblett
- frånkoppling eller utgånget tokenläge visas begripligt
- fel tenant aldrig kan påverkas

### 8.5 iPhone PWA och push

1. Installera Handymate från Safari på en fysisk iPhone.
2. Tillåt push.
3. Skapa ett riktigt godkännandekort.
4. Vänta på pushen och öppna den.
5. Godkänn handlingen.
6. Försök godkänna samma handling igen.

Godkänt när:

- pushen går till rätt person
- riktad push faller aldrig tillbaka till hela företaget
- pushen öppnar rätt objekt
- handlingen verkställs högst en gång
- webpush-frånvaro blockerar inte en giltig mobilpush
- tyst tid och TTL följer den beslutade policyn

### 8.6 Fortnox

Kör den separata Fortnox-checklistan med behörig kontakt och ett riktigt bolag.
Minimikedjan är:

1. skapa eller synka kund
2. skapa eller synka artikel
3. skapa och skicka faktura
4. registrera eller hämta betalning
5. kör hela synken igen

Godkänt när:

- kund, artikel, faktura och belopp matchar mellan systemen
- moms, ROT/RUT och totaler följer den avsedda konventionen
- rätt Fortnox-id:n är sparade på rätt Handymate-objekt
- återkörning skapar noll dubbletter
- frånkoppling och utgånget tokenläge ger en synlig åtgärd
- ett Fortnox-fel aldrig presenteras som skickad eller betald faktura

## 9. Fyra färskkontoprov

Skapa fyra helt nya företag:

1. bygg
2. el
3. måleri
4. VVS/HVAC

Använd nya autentiserade konton och genomför varje flöde utan databasfix.

### 9.1 Obligatorisk kedja per konto

- [ ] Registrering och verifierad inloggning.
- [ ] Företag, roll och bransch sparas.
- [ ] Genomgången visar bara verkliga uppgifter.
- [ ] Plan väljs och betalning fungerar enligt rätt läge.
- [ ] Import genomförs eller hoppas över utan återvändsgränd.
- [ ] Relevanta jobbtyper/startdata finns efter godkänd branschseed.
- [ ] Minst 3–5 egna nyckelartiklar kan skapas eller prissättas.
- [ ] Minst en kundinflödeskanal verifieras.
- [ ] Första kund/lead/affär skapas via verkligt inflöde.
- [ ] Första riktiga offert skapas och skickas.
- [ ] Accepterad offert kan bli projekt utan tappad kund- eller jobbtypsrelation.
- [ ] Första Uppdraget till teamet kan startas.
- [ ] Första agentförslag är relevant, begripligt och bygger på verkliga data.
- [ ] Första godkända handling ger ett sant resultat/kvitto.
- [ ] Kontot fungerar vid återbesök nästa dag.

### 9.2 Mätvärden per konto

- minuter till slutförd onboarding
- minuter till verifierad kanal
- minuter till första skickade offert
- minuter till första Uppdraget
- minuter till första verifierade värde
- antal gånger användaren behövde hjälp
- antal blockerande fel
- antal manuella dataingrepp — målvärde `0`
- första stället där användaren tvekar
- första agentförslagets relevans och begriplighet

### 9.3 Maskinellt tvåkontosbevis

Kör:

```powershell
npm run proof:onboarding:two-account
npm run test:tenant-isolation
```

`test:tenant-isolation` ska använda två autentiserade konton i olika företag
mot den avsedda testdatabasen och prova `SELECT`, `INSERT`, `UPDATE` och
`DELETE` över tenantgränsen.

## 10. Tenant- och behörighetsmatris

För följande objekt ska konto A försöka läsa och mutera konto B:s rader:

| Objekt | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|:---:|:---:|
| `project` | nekas | nekas | nekas | nekas |
| `project_change` | nekas | nekas | nekas | nekas |
| `project_material` | nekas | nekas | nekas | nekas |
| `time_entry` | nekas | nekas | nekas | nekas |
| `supplier_invoices` | nekas | nekas | nekas | nekas |
| `business_config` | nekas | nekas | nekas | nekas |

Dessutom:

- [ ] `business_integration_credentials` kan inte läsas som `authenticated`.
- [ ] `is_business_member` är `SECURITY DEFINER` med avsedd ägare och säkert
      `search_path`.
- [ ] Anon/PUBLIC saknar farliga tabellgrants.
- [ ] Service-role-rutter validerar business och ägarskap före första skrivning.
- [ ] Godkännandekort kan bara läsas och ageras på av rätt roll/mottagare.

## 11. Publika token- och felvägsprov

### 11.1 Publika tokenrutter

Prova giltig, ogiltig, manipulerad och utgången token där relevant:

- offert
- kundportal
- leadportal
- Jobbpass
- fältrapport
- bokningslänk
- partner/referral

Godkänt när en ogiltig token aldrig ger data, cross-tenant-resultat eller 500.

### 11.2 Idempotens

Prova:

- dubbelt webhook-event
- dubbelklick på Skicka
- dubbelklick på Godkänn
- cron-retry
- nätverksretry efter timeout
- återkörd Fortnox-synk
- upprepad offertacceptans
- upprepad betalningsbekräftelse

Varje verklig affärshändelse får skapas eller verkställas högst en gång.

### 11.3 Leverantörsfel

Simulera eller framkalla kontrollerat:

- otillräckligt 46elks-saldo
- SMS-leveransfel
- e-postleveransfel
- Stripe-avbrott eller avbruten checkout
- Fortnox 401/utgånget token
- Google-token som löpt ut
- AI-leverantör utan saldo eller med timeout

Godkänt när:

- felet är synligt för rätt person
- kundtexten är begriplig och utan rå leverantörstext
- rå teknisk information finns i intern logg
- systemet aldrig visar falsk framgång
- retryvägen är säker

### 11.4 Handlingsgränser

- [ ] SMS-STOPP respekteras på den verkliga leveransvägen.
- [ ] Bränsletak stoppar ytterligare kostnad på rätt nivå.
- [ ] Högriskhandling kräver rätt godkännande.
- [ ] En informativ signal kan inte mutera data.
- [ ] En review-required-handling kan inte skickas externt.
- [ ] Fel mottagare kan inte läsa eller godkänna ett riktat kort.

## 12. Gyllene affärskedjan

Kör minst en sammanhängande verklig kedja på lanseringskandidaten:

```text
kundinflöde
→ kund + lead + affär
→ offert
→ kund öppnar och accepterar
→ projekt
→ tid/material/ÄTA
→ projektavslut och bevisbedömning
→ faktura
→ Fortnox
→ leverans
→ betalning
→ verifierat värde/resultat
```

Godkänt när:

- identiteter och relationer följer med genom hela kedjan
- jobbtyp och valda underlag inte tappas
- statusar speglar verkliga händelser
- inga dubbletter skapas
- ingen kundkontakt sker utan avsedd grind
- bevismanifest och ekonomiska belopp stämmer
- Matte och specialisterna beskriver resultatet utan att överdriva

Historiska Golden Path-bevis i `docs/REALITY-WEEK.md` är stöd, men den här
kedjan ska köras igen på den faktiska release-SHA:n.

## 13. De första tio kunderna

Varje ny kund får en namngiven ansvarig och följs enligt samma schema.

### Dag 0

- betalning och kontostatus verifierad
- onboarding slutförd
- minst en inflödeskanal verifierad
- första kunddata eller verkligt inflöde inne
- första offert eller första relevanta Uppdrag startat

### Dag 1

- kunden har återvänt
- inga öppna räddningssignaler utan ägare
- kunden förstår nästa steg
- eventuellt integrationsfel är åtgärdat eller ärligt kommunicerat

### Dag 3

- första konkreta värde eller genomförda kärnhandling identifierad
- varje blockerare har rotorsak och ägare
- produktfeedback är loggad med kundens egna ord

### Dag 7

- resultatgenomgång med kunden
- användning och relevans bedömd
- kundens viktigaste nästa arbetsflöde aktiverat
- referens/citat efterfrågas bara om kunden faktiskt fått värde

### Dag 14

- fortsatt användning och risk för avhopp bedömd
- support- och onboardingbehov kategoriserat
- nästa mätbara värdemål bestämt

Räddningsärenden ska alltid ha ägare, rotorsak, faktisk åtgärd, verifierad
lösning och kategori: produktfel, onboarding, utbildning, integration eller
kundförutsättning.

## 14. Felklassning och stoppregler

### P0 — omedelbart `NO-GO`

- tenant- eller personuppgiftsläcka
- fel kund kontaktas
- fel eller dubbel debitering
- obehörig handling
- falskt påstående om skickad offert, faktura, SMS eller betalning
- permanent dataförlust eller korruption
- möjlighet att kringgå godkännande för en högriskhandling

### P1 — måste lösas före lansering

- färskt konto når inte första värdet utan Handymates hjälp
- synlig integration fungerar inte
- kärnkedjan offert → projekt → faktura bryts
- kunden fastnar utan begriplig återhämtning
- kritisk push/notis når fel person eller ingen alls
- agenten ger materiellt felaktiga råd av data som produkten påstår sig förstå
- en vanlig kundhandling kräver manuell databasfix

### P2 — kan dokumenteras efter lansering

- kosmetiskt fel
- mindre copyproblem
- ineffektivitet med tydlig fungerande väg runt
- avancerad funktion som inte ingår i lanseringslöftet

P2 får inte användas för att nedklassa en trasig eller vilseledande kärnresa.

## 15. Rekommenderad körordning inför 14 september 2026

| Datum | Fokus |
|---|---|
| 3–4 september | Förkrav, 46elks, Stripe live, v206-bevis, kontoklassificering och branschgranskning. |
| 5–7 september | Fyra färska konton och tvåtenantbevis. |
| 8–10 september | Stripe, Lisa, e-post, Google, fysisk iPhone/PWA och Fortnox. |
| 11 september | Sammanhängande kundinflöde → betald faktura. |
| 12 september | P0/P1-buffert, fixar och avgränsade omtest. |
| 13 september | Slutlig Grind A och Grind B på exakt release-SHA. |
| 14 september | Lansering endast efter dokumenterat `GO`. |

## 16. Slutligt GO/NO-GO-protokoll

Kopiera följande till releasebeviset:

```text
Release-SHA:
Deployad:
Körd:
Ansvarig:

Kontoklassificering: PASS / FAIL
Branschgrind: PASS / FAIL / AVGRÄNSAD
Build/tsc: PASS / FAIL
Kontraktsgrind: PASS / FAIL
Partnergrind: PASS / FAIL
Launch readiness: PASS / FAIL
Publikt smoke: PASS / FAIL

Stripe live: PASS / BLOCKERAD / FAIL
Lisa/46elks: PASS / BLOCKERAD / FAIL
E-post: PASS / BLOCKERAD / FAIL
Google: PASS / UNDANTAGEN-DOLD / BLOCKERAD / FAIL
iPhone PWA/push: PASS / BLOCKERAD / FAIL
Fortnox: PASS / UNDANTAGEN-DOLD / BLOCKERAD / FAIL

Färskkonto bygg: PASS / FAIL
Färskkonto el: PASS / FAIL
Färskkonto måleri: PASS / FAIL
Färskkonto VVS/HVAC: PASS / FAIL
Tenantisolering: PASS / FAIL
Token-/felvägar: PASS / FAIL
Gyllene affärskedjan: PASS / FAIL

Öppna P0:
Öppna P1:
Öppna P2 med ägare och deadline:

Beslut: GO / NO-GO
Beslutat av:
Beslutat datum/tid:
```

`GO` kräver:

- Grind A `PASS`
- tenantisolering och felvägar `PASS`
- samtliga synliga externa integrationer `PASS`
- fyra färskkonton utan P0/P1
- sammanhängande gyllene affärskedja `PASS`
- noll öppna P0 och P1

## 17. Direkt nästa handling

1. Fyll på 46elks och kontrollera testnumret.
2. Kör Stripe live-provet på 100 kr.
3. Verifiera v206 genom funktionsdefinitionen.
4. Klassificera de befintliga produktionskontona.
5. Godkänn de fyra branschpaketen.
6. Lås release-SHA och skapa releasebeviset.
7. Kör Grind A.
8. Kör fyra färskkonton.
9. Kör Grind B och felvägar.
10. Fatta och dokumentera `GO` eller `NO-GO`.
