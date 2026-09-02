# Partner Launch Gate — GO/NO-GO

**Datum:** 2026-09-02

**Auktoritativt avtal:** `content/partner/partneravtal-v1.md`

**Beslutade standardvillkor:** 20 % av Nettoabonnemangsintäkt i 36 kalendermånader, 0 % därefter. Leads-addon är exkluderad.

## Beslut i dag

**NO-GO för extern avtalslansering och nya skarpa partnerattributioner.**

Motorn, acceptansflödet, självfaktureringen och den nya attributionsgränsen är kodmässigt sammanhängande. NO-GO beror på tydliga kvarvarande aktiverings- och externkontroller, inte på att modellen behöver ritas om:

1. `sql/v204_partner_attribution_claim.sql` och `sql/v205_partner_final_payout.sql` är manuellt körda.
2. Första riktiga databasbeviset stoppade korrekt vid en verklig schemaavvikelse: självfaktureringsfunktionen refererade `business_config.company_name`, men skarpt schema har `business_name`. `sql/v206_partner_self_billing_business_name.sql` korrigerar funktionen och ska köras manuellt innan omprov.
3. Den publicerade partnersidan säger fortfarande 20 % i 12 månader och motsäger avtalet.
4. Juridisk identitet, juristgranskning och redovisningsgodkännande av självfaktureringen saknas.
5. De två partnerkonfigurationer som v189 migrerade behöver informeras och acceptera Partneravtal v1; databasmigration är inte avtalsacceptans.

## Vad som nu finns i produkten

### Attribution

- Partnerkod i registreringsbody kan inte längre direkt bli ekonomisk sanning.
- En enda service-role-RPC avgör attributionen under lås.
- Exakt självhänvisning stoppas via normaliserad e-post eller organisationsnummer.
- Befintligt Handymate-konto och dokumenterad konkret GTM-dialog de senaste 180 dagarna stoppas.
- En unik databasgräns tillåter bara en vinnande partner per företag.
- Samtidiga anspråk avgörs atomiskt; förloraren får ett avvisat, loggat beslut.
- Beslutsloggen innehåller orsak och identiteter men inte rå e-post eller kunddata.
- Den gamla partner-referral-rutten skapar inte längre ekonomiska placeholder-rader före signup.

### Provision och intäktsklassning

- Bara allowlistade grundabonnemangspriser är provisionsgrundande.
- Leads-addon, krediter/bränsle, SMS, telefoni, okända priser och engångsrader är fail-closed exkluderade.
- Årsplan periodiseras över verklig tjänsteperiod.
- Refund och chargeback skapar spårbara negativa rättelser; originalraden skrivs inte om.
- Första betalningsmånaden är månad 1; månad 36 ger 20 %, månad 37 ger 0 %.
- Churn pausar inte kalendern och återkomst återöppnar inte en ny 36-månadersperiod.

### Självfakturering

- Partnerns och Handymates fullständiga faktureringsidentiteter krävs.
- Fakturanummer, snapshot och liggarlänk skapas i samma transaktion.
- Partnern kan godkänna eller bestrida; bestridande kräver skäl.
- Utbetalning kräver verklig betalningsreferens och uppdaterar batch, liggare och cache atomiskt.
- Ordinarie utbetalningar under 500 kr rullas vidare.
- Slututbetalning under 500 kr är en separat adminhändelse med obligatoriskt skäl och fryst märkning i självfakturan.

### Avtalsacceptans och portal

- Registrering har separat, ej förkryssad avtalsruta och servern kräver `true`.
- Version, dokumenthash, tidpunkt och IP loggas.
- Admin kan inte aktivera en partner utan acceptans av gällande version.
- En partner på äldre version möts av avtalsgrind innan portal och nya hänvisningar.
- Portalen visar faktisk sats, kundens månad av 36, 0 %-svansen, liggare, självfakturor, granskning och betalningsreferens.

## Bevis

### Browserlöst deterministiskt facit

Kör:

```bash
npm run test:partner-launch-gate
```

Facitet täcker attributionsordning, body-spoofing, service-role-grants, placeholderförbud, månadsplan, årsplan, partiell refund, självfakturans exakta belopp, månad 36/37 och slututbetalningsundantaget.

### Riktigt databasbevis

Förutsättningar:

1. Kör v204, v205 och v206 manuellt i Supabase SQL Editor i nummerordning.
2. Använd endast de två disponibla testföretagen i `.env.integration`.
3. Kontrollera först att båda företagens `business_config.referred_by` är `NULL`.
4. Sätt säkerhetsspärren:

```env
PARTNER_TEST_ALLOW_DB_WRITES=YES_PARTNER_DISPOSABLE_ACCOUNTS
```

Kör:

```bash
npm run proof:partner
```

Beviset använder den riktiga databasen men anropar inte Stripe och skickar inga meddelanden. Det provar:

- självhänvisning,
- accepterad och idempotent attribution,
- andra partnern på samma företag,
- konkret GTM-relation inom 180 dagar,
- en 181 dagar gammal relation,
- två samtidiga partneranspråk,
- riktig liggare,
- riktig självfaktura,
- partnergranskning,
- markerad utbetalning med referens,
- 100 kr nekat som ordinarie underlag men accepterat som skälbunden slututbetalning,
- egen städning i `finally`.

Testet avbryter före skrivningar om företagen inte är uttryckligt disponibla, projekt-id inte matchar eller befintlig attribution skulle skrivas över.

## Extern kontroll före GO

- [ ] Publicerad partnersida och FAQ säger 20 % i 36 kalendermånader och 0 % därefter.
- [ ] Leads-addon och övriga exkluderade intäkter beskrivs på samma sätt som i Bilaga 1.
- [ ] Handymates juridiska namn, organisationsnummer, adress och avtals-e-post är ifyllda.
- [ ] Svensk affärsjurist har granskat slutversionen.
- [ ] Redovisningskonsult har godkänt självfaktureringsprocessen och momshanteringen.
- [ ] Exakt accepterad avtalsversion kan tillhandahållas varaktigt; gamla versioner arkiveras.
- [ ] De två migrerade partnerna har informerats och accepterat v1 innan nya hänvisningar.
- [x] v204 och v205 är manuellt körda.
- [ ] v206 är manuellt körd och hela databasbeviset omkört grönt.
- [ ] `npm run proof:partner` är grönt mot avsedd testdatabas.
- [ ] Ett visuellt klickpass är gjort: registrering → acceptans → adminaktivering → portal → självfaktura → granskning → utbetalningsreferens.

När samtliga punkter ovan är stängda ändras beslutet till GO genom en daterad rad i detta dokument. Kod som bara är mergead eller en migration som bara är skriven räknas aldrig som skarpbevis.

## Avgränsning

Denna grind skapar inte ett nytt partnersystem. Den använder befintlig partnerportal, avtalsacceptans, provisionsliggare, Stripe-klassning och självfaktura. Den offentliga webbplatsen ligger utanför detta repos produktkod och måste uppdateras i sin egen publiceringsväg.
