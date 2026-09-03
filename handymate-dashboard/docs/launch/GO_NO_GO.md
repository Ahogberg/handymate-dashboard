# Lanseringsgrind — körprotokoll

Det här protokollet ersätter inte den levande lanseringschecklistan. Det är
beviskedjan som avgör om en viss release får gå till betalande kunder.
Den kompletta utförandemanualen finns i
`docs/launch/LAUNCH_TEST_SUITE.md`.
Kopplingen mellan publika kundlöften och respektive bevisstation finns i
`docs/launch/LAUNCH_PROMISE_PROOF_MATRIX.md`; den är ett index, inte en egen
beslutsgrind.

## Grind A — maskinell sanning

Efter deploy:

1. Logga in på `https://app.handymate.se` med ett `@handymate.se`-konto eller
   en adress som finns i `ADMIN_EMAILS`.
2. Öppna `https://app.handymate.se/api/admin/launch-readiness`.
3. Spara hela JSON-svaret tillsammans med release-SHA och klockslag.
4. Kör från repo-roten:

   ```powershell
   npm run launch:smoke
   ```

Adminrutten läser den körande produktionsmiljön. Den kontrollerar att
obligatoriska miljövariabler finns (aldrig deras värden), att de senaste
lanseringskritiska schemakontrakten v165/v173–v179 finns i databasen, att
runtime-buckets finns och att månads- och årspriser har riktiga Stripe
price-id:n.

Det publika rökprovet kontrollerar aktuell health-respons, att ogiltiga
offert-, portal- och Jobbpass-token nekas utan 500 samt att en cron utan
hemlighet svarar 401. Health-responsen måste vara yngre än fem minuter; ett
gammalt grönt cachesvar är ett fel.

**Grind A är godkänd endast när:**

- adminrutten säger `READY_FOR_MANUAL_PROOF`;
- `summary.blocked` är `0`;
- `npm run launch:smoke` slutar med `PASS`.

`READY_FOR_MANUAL_PROOF` betyder inte att produkten är lanseringsklar. Det
betyder att konfiguration och databas är redo för riktiga leverantörsprov.

## Grind B — verkliga externa bevis

Kör varje station med ett avgränsat Handymate-testföretag. Spara inga
leverantörshemligheter i protokollet.

| Station | Minsta verkliga handling | Godkänt när | Bevis som sparas |
|---|---|---|---|
| Stripe live | Köp minsta Bränsle-påfyllningen på 100 kr med ett riktigt kort | Checkout lyckas exakt en gång, signerad webhook ger `billing_event`, `fuel_ledger` ökar exakt 10 000 öre och kvittot finns i Stripe | checkout session-id, event-id, billing_event-id, skärmbild |
| Lisa / 46elks | Följ `docs/launch/LISA_SHARP_PROOF.md` från extern telefon | Alla sju stationer passerar och fel tenant är tom | call-id, SMS-id, customer/lead/deal-id, skärmbilder |
| E-post | Skicka en offert och en faktura till en extern inkorg | Ett mejl per handling, korrekt avsändare, fungerande länk/PDF, status och aktivitetsrad uppdateras | message-id, objekt-id, skärmbild, SPF/DKIM-resultat |
| Google | Koppla ett konto som inte ligger på Googles testlista | OAuth saknar testvarning, kalenderhändelse läses och en Handymate-händelse skrivs utan dubblett | Google-konto, event-id, skärmbild |
| iPhone PWA | Installera från Safari, tillåt push och skapa ett riktigt godkännandekort | En push kommer, öppnar rätt objekt och samma handling kan bara godkännas en gång | iOS-version, kort-id, skärminspelning |
| Fortnox | Kör den separata Fortnox-checklistan mot riktigt bolag | Kund/artikel/faktura matchar och en återkörning skapar ingen dubblett | Fortnox-id:n, Handymate-id:n, synklogg |

Om en integration inte ska vara tillgänglig vid lansering får stationen bara
undantas om funktionen är tydligt dold eller märkt `Kommer snart` för samtliga
nya kunder. En synlig men obevisad funktion är `NO-GO`.

## Felvägsprov före GO

Kör dessutom följande med två testföretag:

- ett företag kan inte läsa eller mutera det andras kund, projekt, offert,
  faktura, tid, material eller leverantörsfaktura;
- en ogiltig/offentlig token ger aldrig data eller 500;
- ett dubbelt webhook-anrop, dubbelklick eller cron-retry skapar högst en
  affärshändelse;
- en leverantör som svarar med fel får aldrig presenteras som lyckad;
- SMS-STOPP, Bränsletak och godkännandegrind testas på den verkliga
  leveransvägen.

## Slutligt beslut

Releasebeslutet skrivs så här:

```text
Release SHA:
Körd:
Ansvarig:
Grind A: PASS / FAIL
Stripe: PASS / BLOCKERAD / FAIL
Lisa: PASS / BLOCKERAD / FAIL
E-post: PASS / BLOCKERAD / FAIL
Google: PASS / UNDANTAGEN-DOLD / BLOCKERAD / FAIL
iPhone PWA: PASS / BLOCKERAD / FAIL
Fortnox: PASS / UNDANTAGEN-DOLD / BLOCKERAD / FAIL
Tenant/felvägar: PASS / FAIL
Beslut: GO / NO-GO
Öppna fel med ägare och deadline:
```

`GO` kräver Grind A PASS, tenant/felvägar PASS och PASS på varje synlig
extern funktion. `BLOCKERAD` är aldrig samma sak som PASS.
