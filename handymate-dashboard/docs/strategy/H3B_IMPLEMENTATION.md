# H3b — implementationshandoff

Datum: 2026-09-15. Granskningsgren: `codex/h3b-outbound-intents`, PR #83.

## Levererat

- v249:s tokenfäktade `outbound_intents`, atomisk avstängning och mänskliga upplösning kompletteras med `outbound_messages`: en tenantbunden, oföränderlig källa för meddelanden som tidigare bara fanns i processminnet. Intenten innehåller fortsatt aldrig brödtext eller bilagor. Granskade PDF:er återläses från privat Storage via versionsbunden referens.
- SMS, Resend och Expo/web-push går via record → preflight → claim → provider → finish för H2:s fyra övervakade handlingar, godkända SMS och den granskade dokumentleveransen. Samma producent-ID ger samma kvitto och aldrig ett andra leverantörsanrop.
- Svepet återläser källan inom rätt företag, verifierar mottagare, mall och SHA-256-version och återställer fakturapåminnelsens CAS-kvittens, dokumentjournalen samt autonomikvittot. Flerkanalshandlingar kvitteras först när helheten är säker.
- Outbound får högst 45 sekunder före ekonomiarbetet i den befintliga tiominuterscronen och använder en egen all-tenant-arbetslista.
- Överlämningsinkorgen visar verkligt SMS-/e-post-/pushutfall. Superadmin kan markera levererat, avbryta eller begära nytt försök med obligatoriskt skäl. Kontoradering tar både intent och källa.

## Medvetna skärpningar och avvikelser

1. Briefens antagande att varje producent redan har en beständig textrad stämde inte. `outbound_messages` införs därför som kanonisk källa; den ligger separat från den body-fria leveransledgern, är service-only och raderas med kontot. Källan nycklas på samma `(business_id, dedupe_key)` som leveranslöftet; `(business_id, source, source_id, kind)` är ett vanligt uppslagsindex och får bära flera separata utskick.
2. Ett blandat pushutfall är terminalt `sent` så fort minst en enhet/provider accepterat notisen. Partiella avvisningar sparas som diagnostik; `unknown` reserveras för transport-/prenumerationsosäkerhet när ingen mottagare accepterats. Det förhindrar både omutskick till en redan nådd enhet och ett falskt manuellt ärende per död token.
3. Fakturapåminnelsens avgift, ränta, räknare och nästa datum skrivs i en enda `reminder_count`-CAS. En parallell kanal återläser vinnarens kvitto i stället för att mutera igen.
4. Ett övervakat SMS utan stabilt leverans-ID stoppas när H3b är aktivt. Det får aldrig falla igenom till ett icke återhämtningsbart leverantörsanrop. Vanliga push-anrop utan autonominyckel behåller däremot den gamla leveransvägen under OUTBOUND-rollouten.
5. `autonomy_key` förs bara in i outbound-ledgern när `SUPERVISED_AUTONOMY_ENABLED='true'`. Därmed kan OUTBOUND rullas ut före SUPERVISED utan att befintliga bokningspåminnelser, recensionsförfrågningar eller offertuppföljningar blockeras av ett stängsel som ännu inte är aktiverat.
6. Ett uppskjutet övervakat utskick lämnar autonomikvittot öppet. Svepet äger den slutliga kvittensen efter faktisk leverans; ett preflight-uppskov får aldrig låsa utfallet som `unknown`.
7. Permanenta käll-/versionsfel skjuts inte upp för evigt. De räknas som misslyckade försök, driftlarmas och når samma manuella försökstak som andra definitiva fel. Endast preflight får återbetala försöket genom defer.
8. Native Ja/Nej ingår uttryckligen inte i H3b enligt briefens §7 och ändras inte här.

## Aktivering

Migration och flaggor är orörda. Efter merge: kör och verifiera v249, slå på `CHANNEL_PREFLIGHT_ENABLED` och `OUTBOUND_INTENTS_ENABLED` endast för piloten, bevisa ett återhämtat uppskjutet utskick samt en manuellt upplöst `unknown`, och bredda först därefter. `SUPERVISED_AUTONOMY_ENABLED` aktiveras enligt H1/H2-ordningen. Ingen extern leverans har gjorts i denna implementation.

## Datagallring — uppföljning, inte denna PR

`outbound_messages` innehåller mottagare, brödtext och eventuella bilagereferenser eftersom exakt återspelning kräver den beständiga källan. Före bred rollout ska en separat retention-migration/cron gallra källrader vars motsvarande intent är terminalt och äldre än den beslutade retentionstiden; 30 dagar är ett rimligt startförslag men ska fastställas mot revisions-, support- och rättsliga behov. H3b inför ingen dold gallring och v249 körs inte av denna PR.

## Verifiering

H3b:s egna verifieringar ska köras tillsammans med samma `first-value.yml`-steg som CI, så att "grön" betyder samma sak lokalt och på GitHub:

- `npm run test:durable-followup`
- `npm run test:approval-integration`
- `npm run test:report-continuity`
- `npm run test:my-day`
- `npm run test:customer-relief`
- `npm run test:first-value-ui`
- `npx playwright test tests/first-value-production.ui.spec.ts --no-deps --project=chromium --workers=1 --reporter=line`
- Postgres-jobbet: `npx playwright test tests/financial-kernel-command-concurrency.spec.ts tests/financial-kernel-outbox-concurrency.spec.ts tests/durable-followup.spec.ts tests/report-continuity.spec.ts tests/report-recovery.spec.ts --no-deps --project=chromium --workers=1 --reporter=line`
- H3b: SQL-/state/security/source-kontrollerna i `tests/outbound-intents-sql.spec.ts` och runtime-/integrationsproven i `tests/outbound-promise.spec.ts`.
- Full kontraktssvit: `npm run test:contracts`.
- `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --incremental`.
- `npm run build`.
- Granskad dokumentleverans: befintlig CJS-harness utan externa utskick.
