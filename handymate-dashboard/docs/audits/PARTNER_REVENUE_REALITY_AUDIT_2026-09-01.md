# Partner Revenue Reality Audit

**Datum:** 2026-09-01  
**Status:** Read-only granskning av avtal, kod, migrationer och produktionsdata  
**Baseline:** `70862148` (`content/partner/partneravtal-v1.md`, publiceringskontroll, två DOCX-versioner och reproducerbara generatorskript)  
**Kommersiellt beslut som inte omprövas här:** 20 % av Nettoabonnemangsintäkten i 36 kalendermånader, 0 % därefter.

## 1. Sammanfattande dom

Partnerprogrammet är **delvis byggt men inte redo för skarpa provisionsutbetalningar eller extern avtalsacceptans**.

Det som fungerar:

- nya standardkonfigurationer och de två befintliga partnerkonfigurationerna står på 20 % / 36 månader / 0 % därefter;
- partnerregistreringen har en obligatorisk, ej förkryssad avtalsruta;
- servern hashar avtalstexten och lagrar version, hash, tidpunkt och IP för nya registreringar;
- partnerattribution via en aktiv `P-`-kod kan skapa en partnerkopplad referral;
- provisionen härleds från registrerade `payment_succeeded`-händelser, inte från listpris;
- en liggare per partner × kund × period finns och är idempotensankrad;
- partnerportalen filtrerar data per partner och provisions-/partnerhemligheter ligger bakom service-role-rutter.

Det som blockerar skarp drift:

1. motorn mäter **betalda månader**, avtalet **kalendermånader**;
2. årsbetalning provisionsförs i sin helhet i betalningsmånaden, avtalet kräver linjär periodisering;
3. återbetalningar, chargebacks och exkluderade tilläggsintäkter avräknas inte pålitligt;
4. produkten skapar ännu ingen riktig självfaktura och saknar partnerns faktureringsuppgifter/godkännandeflöde;
5. skapande och betalmarkering av utbetalningsbatchar är inte transaktionella;
6. partnerattributionen ligger i rader/fält som den hänvisade kundens autentiserade användare i dag kan mutera direkt via RLS;
7. de två migrerade partnerna har inte accepterat den avtalsversion som den nya konfigurationen bygger på.

**Lanseringsbeslut:** blockera första externa partneracceptans och första provisionsutbetalning tills P0-punkterna i avsnitt 8 är stängda och reality-harnesset i avsnitt 9 är grönt.

## 2. Granskad kedja

```text
Partneransökan
→ avtalsacceptans
→ admin-godkännande
→ partnerkod/länk
→ kundregistrering
→ referral-rad
→ första betalning/konvertering
→ payment_succeeded
→ provisionsliggare
→ fryst utbetalningsbatch
→ självfaktura
→ partnerns godkännande/invändning
→ faktisk utbetalning
→ betalmarkering och korrigering
```

Primära källor:

- `content/partner/partneravtal-v1.md`
- `content/partner/PARTNERAVTAL_PUBLICERINGSKONTROLL.md`
- `sql/v117_partner_commission_v2.sql`
- `sql/v189_partner_flat_commission_and_agreement.sql`
- `lib/partners/commission-engine.ts`
- `lib/partners/commission.ts`
- `lib/partners/auth.ts`
- `lib/referral/discounts.ts`
- `app/api/auth/route.ts`
- `app/api/billing/webhook/route.ts`
- `app/api/partners/register/route.ts`
- `app/api/partners/dashboard/route.ts`
- `app/api/admin/partners/commission/route.ts`
- `app/partners/dashboard/components/StatementSection.tsx`
- `tests/partner-commission.spec.ts`

## 3. Produktionssnapshot: de två v189-migrerade partnerna

Snapshoten lästes med service-role via Supabase REST och innehöll inga mutationer. Identifierare och personuppgifter redovisas inte i rapporten.

| Kontroll | Partner A | Partner B |
|---|---:|---:|
| Status | Aktiv | Väntar på godkännande |
| Provisionssats | 20 % | 20 % |
| Provisionsperiod | 36 | 36 |
| Sats efter perioden | 0 % | 0 % |
| Referral-rader | 0 | 0 |
| Liggarrader | 0 | 0 |
| Utbetalningsbatchar | 0 | 0 |
| Intjänad/pending provision | 0 kr | 0 kr |
| Loggad avtalsversion | Saknas | Saknas |
| Loggad avtalshash | Saknas | Saknas |
| Loggad acceptanstid | Saknas | Saknas |

### Slutsats

v189 har ändrat båda konfigurationerna, men migrationen utgör inte i sig en avtalsacceptans. Eftersom inga kunder, provisionsrader eller utbetalningar finns har ändringen **inte påverkat intjänade ekonomiska rättigheter**. Det finns därför inget belopp att korrigera och ingen kundattribution att flytta.

### Beslut: ska de informeras?

**Partner A, aktiv: JA.**

- Informera skriftligt om 20 % i 36 kalendermånader och att modellen ersätter den tidigare standardtrappan.
- Förklara att inga hänvisningar eller provisionsbelopp har påverkats.
- Kräv uttrycklig acceptans av Partneravtal v1 innan partnern lämnar sin första nya hänvisning.
- Registrera version, hash, accepterande person, tidpunkt och nödvändig teknisk bevisning. Sätt inte acceptansfälten manuellt som om en acceptans redan hade skett.

**Partner B, väntar på godkännande: INGEN separat ändringsavisering behövs, men partnern får inte godkännas i nuvarande skick.**

- Skicka partnern till den aktuella acceptansytan för Partneravtal v1.
- Godkänn ansökan först efter att acceptansfälten är kompletta.
- Om den gamla ansökan inte kan kompletteras säkert: låt partnern återregistrera sig eller använd en särskild engångslänk för avtalsacceptans.

Detta är ett produkt- och bevisbeslut. Slutlig juridisk formulering av ändringsinformationen ska granskas av svensk affärsjurist.

## 4. Avtal mot verklig implementation

| Avtalskrav | Verkligt läge | Dom |
|---|---|---|
| 20 % som standard | v189 och kodfallbackar använder 20 % | Implementerat |
| 36 **kalendermånader** från första godkända betalning | `customer_month` räknar antalet tidigare liggarrader/betalande månader; obetalda månader pausar räknaren | **Fel semantik, P0** |
| 0 % efter månad 36 | Motorn ger 0 % efter `customer_month > 36`, men eftersom räknaren kan pausas kan 20 % fortsätta efter den 36:e kalendermånaden | **Delvis, P0** |
| Årsplan periodiseras linjärt | Ett `payment_succeeded` för årsbeloppet tas upp som hela basen i samma period | **Saknas, P0** |
| Bara mottagen och behållen nettoabonnemangsintäkt | Lyckade betalningar läses, men refunds/chargebacks saknar korrigeringsväg | **Delvis, P0** |
| Leads-addon, bränsle, SMS, telefoni och andra tillägg exkluderas | Bilaga 1 undantar dem uttryckligen, men motorn läser totalen i varje `payment_succeeded`; källan bär inga provisionsgrundande rader eller produktklassning | **Avtalet klart, implementation saknas, P0 före addon-fakturering** |
| Upp-/nedgradering följer faktisk betalning | Proraterade Stripe-betalningar kan räknas som faktiska belopp | Delvis; kräver skarpfixture |
| Churn/återkomst pausar inte 36-månadersfönstret | Betald-månadsräknaren pausar vid churn/obetald period | **Fel semantik, P0** |
| Första giltiga och verifierbara attribution | P-kod slås upp mot aktiv partner och referral skapas | Delvis |
| Självhänvisning och befintlig relation undantas | Ingen organisations-/ägaridentitet finns på partnern och ingen servervakt genomför reglerna | **Saknas, P1** |
| En partner per kund | Ingen tydlig partiell unik constraint hindrar två partner-referrals för samma business | **Saknas, P1** |
| Fryst provisionsunderlag | JSON-snapshot skapas i `partner_payout_batch` | Delvis |
| Självfaktura med separat nummerserie och obligatoriska fakturauppgifter | Ingen fakturanummerserie, fakturadatum, momsrad, juridisk partneridentitet, PDF eller e-postleverans | **Saknas, P0** |
| Partnern granskar/godkänner varje självfaktura | Ingen status eller åtgärd för godkänd/invänd/anses godkänd efter tio dagar | **Saknas, P0** |
| Minsta ordinarie utbetalning 500 kr | `createPayoutBatch` buntar även lägre belopp | **Saknas, P1** |
| Korrigering/återkrav | Ingen fungerande negativ justerings- eller refundkedja används | **Saknas, P0** |
| 30 dagars betalningsvillkor | Ingen förfallodag eller uppföljning lagras | Saknas, P1 |
| Partnerportal visar samma sanning | Portalen läser liggaren men säger fortfarande att partnern ska fakturera Handymate och visar “betalda månader” | **Fel copy/semantik, P1** |

## 5. Viktiga kodfynd

### P0-A — Kalenderperioden är implementerad som en betalningsräknare

`processCommissionPeriod` räknar tidigare liggarrader och sätter nästa `customerMonth`. `computeLedgerRows` använder därefter `customerMonth <= ladderMonths`. Detta gör att uteblivna betalningar, churn och uppehåll förlänger provisionsrätten, i strid med avtalet.

Minsta korrekta modell är ett oföränderligt `commission_started_at`/`converted_at` och en kalenderbaserad månad beräknad från periodens datum. En gammal liggarrad får aldrig styra hur lång avtalsperioden är.

### P0-B — Årsplanen kan betala ut tolv månaders provision direkt

Årspriset debiteras som en Stripe-prenumeration. `invoice.payment_succeeded` sparar fakturans hela betalning och motorn lägger hela beloppet i betalningsperioden. Avtalet kräver linjär periodisering över tjänsteperioden.

Reality Harness måste bevisa att ett årsbelopp skapar tolv periodiserade provisionsposter eller motsvarande fryst periodisering — aldrig en omedelbar klumpsumma som sedan dessutom kan påverka `customer_month` fel.

### P0-C — Addons och återbetalningar saknar ekonomisk klassning

Leads-addon är en egen återkommande Stripe-prenumeration på samma Stripe-kund. Webhooken sparar `invoice.payment_succeeded` som en total utan produkt-/line-item-klassning. Motorn kan därför inte bevisa att beloppet är grundabonnemang och inte addon.

Webhooken hanterar inte en komplett korrigeringskedja för refund/chargeback. En redan skapad liggarrad kan därmed förbli provisionsgrundande trots att Handymate inte längre har behållit intäkten.

### P0-D — “Självfakturan” är bara ett internt statement

`partner_payout_batch.statement` innehåller kund, period, månad, bas, sats, belopp och källa. Det är användbart som underlag men uppfyller inte avtalets egen beskrivning av en självfaktura. Partner-tabellen saknar dessutom de flesta uppgifter som avtalet kräver för faktureringen.

Portaltexten säger samtidigt: “du fakturerar oss beloppet”, vilket är motsatsen till den beslutade standardmodellen där Handymate utfärdar fakturan i partnerns namn.

### P0-E — Batchskapande och betalmarkering kan lämna delat tillstånd

`createPayoutBatch` skapar först batchen och länkar sedan liggarraderna. Om andra operationen misslyckas finns en batch utan länkade rader. `markBatchPaid` markerar först liggarraderna och sedan batchen; om batchuppdateringen misslyckas säger källorna olika saker.

Detta ska ligga i en SECURITY DEFINER-RPC eller annan verkligt atomisk databastransaktion med explicit service-role-grant och revisionsfält.

### P0-F — Attributionen är inte tekniskt oföränderlig

`business_config.referred_by` skrivs bara vid registrering i produktkoden, men det gör inte fältet oföränderligt. `business_config` är en tenant-redigerbar rad och RLS skyddar raden, inte enskilda kolumner. En autentiserad medlem kan därför tekniskt försöka skriva om `referred_by` direkt via PostgREST/Supabase.

Allvarligare: `referrals_tenant_member` i v112 ger `SELECT, INSERT, UPDATE, DELETE` till `authenticated` när användaren är medlem i antingen hänvisande eller hänvisat företag. Den hänvisade kunden kan därmed mutera den referral-rad som bland annat bär `partner_id`, `referrer_type`, `status` och `converted_at`. Det är inte en tillräcklig grund för ekonomisk attribution.

Ekonomisk partnerattribution måste vara service-role-only eller skyddas av en databasgrind som förbjuder klienten att ändra partner-, källa-, konverterings- och provisionsfält. Portalvisning och provisionsmotor ska läsa den låsta källan, aldrig `business_config.referred_by` som ekonomiskt facit.

### P1-A — Attributionen saknar dessutom konfliktgrindar

- ogiltig partnerkod sparas i dag på `business_config.referred_by` innan det verifieras att en aktiv partner finns;
- servern saknar självhänvisningskontroll;
- servern saknar 180-dagarskontroll för befintlig relation;
- två partnerkopplade referral-rader för samma kund är inte strukturellt uteslutna;
- `handleFirstPaymentReferral(...).single()` får ett tvetydigt fel om dubbletter redan finns.

### P1-B — Avtalsversionen är hashad men inte fullt arkiverad för partnern

Hash + version + tid + IP är en bra början. Den renderade avtalssidan läser dock den nuvarande filen på samma route. Partnern mejlas inte en varaktig kopia av exakt version, och gamla versioner har ännu ingen publik, oföränderlig URL.

### P1-C — Flera databasfel kan se ut som tomt affärsläge

Flera Supabase-anrop i provisionsorkestreringen, totalsummeringen och partnerdashboarden läser inte `error`. Ett queryfel kan därför bli “inga referrals”, “inga betalningar” eller nolltotaler i stället för ett synligt fel.

## 6. Säkerhets- och tenantbedömning

Kod och migrationer visar att `partners`, `partner_commission_ledger`, `partner_payout_batch` och `partner_followups` är service-role-only. Partnerportalen använder signerad partner-JWT och filtrerar alla rader på tokenens `partner.id`.

Det skyddet omfattar däremot inte själva `referrals`-raden eller `business_config.referred_by`. Båda ligger på tenant-redigerbara rader. Den ekonomiska attributionen är därför inte låst trots att provisionsliggaren är det.

Detta är rätt grundmodell, men följande måste ingå i det permanenta beviset:

- Partner A kan aldrig läsa Partner B:s referrals, liggare, batchar eller events.
- Manipulerat `partner_id` i partnerportalen ignoreras; identiteten kommer alltid från JWT.
- Endast Handymate-admin kan ändra provisionsvillkor, skapa batch och markera betalt.
- Anon och Supabase `authenticated` har inga grants mot partnerhemligheter eller provisionsdata.
- Webhook-/API-hemligheter exponeras aldrig i dashboardpayloaden.

## 7. Rekommenderad sanningsmodell

Ingen ny generell ekonomiplattform behövs. Behåll nuvarande tabeller men gör varje gräns explicit:

1. **Attribution:** en unik, verifierad partner → business-relation med beslutstid, källa och konfliktorsak.
2. **Entitlement:** `commission_started_at` + 36 kalenderbaserade månader; inga pauser.
3. **Revenue classification:** varje Stripe-rad klassas server-side som `core_subscription`, `excluded_addon`, `refund`, `chargeback` eller `unknown`; `unknown` är fail-closed för provision.
4. **Accrual:** liggarrader härleds idempotent från klassade intäktsrader och periodisering.
5. **Self-billing:** fryst, numrerad självfaktura med moms-/partuppgifter, status och leveransbevis.
6. **Payment:** separat verifierad utbetalningshändelse; “markerad betald” får aldrig vara enda beviset om bankunderlag senare kan kopplas.
7. **Correction:** negativ justeringsrad som pekar på ursprunglig liggarrad och ekonomisk källa.

## 8. Prioriterad stängningsplan

### P0 — före partneravtalet publiceras eller någon provision betalas

1. Byt från betald-månadsräknare till kalenderbaserad rättighetsperiod.
2. Periodisera årsplaner linjärt enligt avtalet.
3. Klassificera Stripe line items och exkludera leads-addon, bränsle och övriga undantag fail-closed.
4. Hantera refund/chargeback med spårbar korrigering.
5. Gör batchskapande och betalmarkering atomiska.
6. Lås partnerattributionen i databasen; autentiserade kunder får aldrig kunna skriva `partner_id`, källa, konvertering eller ekonomisk status.
7. Bygg den faktiska självfakturan: nummerserie, parter, moms, datum, villkor, leverans och partnerns godkännande/invändning.
8. Samla in partnerns juridiska/faktureringsmässiga uppgifter.
9. Hämta uttrycklig v1-acceptans från den aktiva partnern och före godkännande av den väntande partnern.

### P1 — före partnerkanalen skalas

1. Självhänvisnings- och befintlig-relationsgrind.
2. Unik partnerattribution per kund och tydlig konfliktlösning.
3. Minimiutbetalning, slututbetalning och 30-dagarsuppföljning.
4. Oföränderliga avtalsversioner med varaktig partnerkopia.
5. Fail-closed felhantering i provisions- och dashboardqueries.
6. Synka portalcopy från trappa/betalda månader/partnerfaktura till avtalsmodellen.

### P2 — efter första verkliga utbetalningscykeln

1. Automatiserad avstämning mot faktisk bankutbetalning.
2. Partnerexport/redovisning och korrigerad självfaktura.
3. Driftsmått: oklassad Stripe-intäkt, orphan batch, obetald förfallen självfaktura, avvikande partnerkonfiguration och misslyckad avtalsleverans.

## 9. Partner Revenue Reality Harness

Harnesset ska använda Stripe testläge + isolerad testpartner/testkund och kontrollera faktisk databas efter varje station.

| Station | Bevis |
|---|---|
| 1. Avtal | Version/hash/tid/accepterande person lagrade; exakt kopia kan hämtas |
| 2. Attribution | Rätt partner kopplas; fel kod, dubblett, självhänvisning och befintlig relation nekas |
| 3. Månadsplan | 20 % av betald, behållen grundintäkt exkl. moms |
| 4. Årsplan | Tolv periodiserade delar; ingen klumpprovision |
| 5. Upgrade/downgrade | Faktiska prorateringar klassas korrekt |
| 6. Obetald månad | Ingen provision för perioden men 36-månadersklockan fortsätter |
| 7. Churn/återkomst | Återkomst ger provision bara inom ursprungligt kalenderfönster |
| 8. Månad 36/37 | Månad 36 = 20 %, månad 37 = 0 % |
| 9. Leads-addon/bränsle | 0 kr provision på exkluderade rader |
| 10. Refund/chargeback | Spårbar negativ korrigering; ingen dold överskattning |
| 11. Självfaktura | Fryst nummer, obligatoriska uppgifter, moms, leverans och godkännande |
| 12. Atomiskt felprov | Avbruten batch-/betaloperation lämnar allt gammalt state intakt |
| 13. Två partners | Ingen korsläsning och aldrig dubbel provision för samma kund |
| 14. Utbetalning | Bank-/adminbevis, liggare, batch och totalsummor överensstämmer |

Harnesset får aldrig köra destruktivt mot verkliga partner- eller kundrader. Det ska skapa och städa egna explicit märkta testobjekt eller använda en isolerad testdatabas.

## 10. Slutlig rekommendation

Bygg inte en ny provisionsplattform. Reparera den befintliga kedjan i följande ordning:

```text
kalenderperiod + intäktsklassning
→ periodisering + korrigering
→ atomisk liggare/batch
→ riktig självfaktura
→ tvåpartner-isolering
→ Stripe Reality Harness
→ informera/inhämta acceptans
→ öppna partnerprogrammet
```

De två befintliga partnerna gör situationen enklare, inte svårare: eftersom ingen av dem har hänvisningar eller ekonomiska rader kan Handymate stänga kontrakts- och produktgapet innan någon pengarättighet uppstår.
