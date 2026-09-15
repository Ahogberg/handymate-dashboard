# H3b — implementationshandoff

Datum: 2026-09-15. Granskningsgren: `codex/h3b-outbound-intents`, PR #83.

## Levererat

- v249:s tokenfäktade `outbound_intents`, atomisk avstängning och mänskliga upplösning kompletteras med `outbound_messages`: en tenantbunden, oföränderlig källa för meddelanden som tidigare bara fanns i processminnet. Intenten innehåller fortsatt aldrig brödtext eller bilagor. Granskade PDF:er återläses från privat Storage via versionsbunden referens.
- SMS, Resend och Expo/web-push går via record → preflight → claim → provider → finish för H2:s fyra övervakade handlingar, godkända SMS och den granskade dokumentleveransen. Samma producent-ID ger samma kvitto och aldrig ett andra leverantörsanrop.
- Svepet återläser källan inom rätt företag, verifierar mottagare, mall och SHA-256-version och återställer fakturapåminnelsens CAS-kvittens, dokumentjournalen samt autonomikvittot. Flerkanalshandlingar kvitteras först när helheten är säker.
- Outbound får högst 45 sekunder före ekonomiarbetet i den befintliga tiominuterscronen och använder en egen all-tenant-arbetslista.
- Överlämningsinkorgen visar verkligt SMS-/e-post-/pushutfall. Superadmin kan markera levererat, avbryta eller begära nytt försök med obligatoriskt skäl. Kontoradering tar både intent och källa.

## Medvetna skärpningar och avvikelser

1. Briefens antagande att varje producent redan har en beständig textrad stämde inte. `outbound_messages` införs därför som kanonisk källa; den ligger separat från den body-fria leveransledgern, är service-only och raderas med kontot.
2. Ett blandat pushutfall blir `unknown`, även om minst en enhet accepterade notisen. Det förhindrar att en redan nådd enhet kontaktas igen automatiskt.
3. Fakturapåminnelsens avgift, ränta, räknare och nästa datum skrivs i en enda `reminder_count`-CAS. En parallell kanal återläser vinnarens kvitto i stället för att mutera igen.
4. Ett övervakat SMS utan stabilt leverans-ID stoppas när H3b är aktivt. Det får aldrig falla igenom till ett icke återhämtningsbart leverantörsanrop.
5. Native Ja/Nej ingår uttryckligen inte i H3b enligt briefens §7 och ändras inte här.

## Aktivering

Migration och flaggor är orörda. Efter merge: kör och verifiera v249, slå på `CHANNEL_PREFLIGHT_ENABLED` och `OUTBOUND_INTENTS_ENABLED` endast för piloten, bevisa ett återhämtat uppskjutet utskick samt en manuellt upplöst `unknown`, och bredda först därefter. `SUPERVISED_AUTONOMY_ENABLED` aktiveras enligt H1/H2-ordningen. Ingen extern leverans har gjorts i denna implementation.

## Verifiering

- H3b: 53 PGlite-kontroller och 29 runtime-/integrationsprov.
- Full kontraktssvit: 2 566 godkända, 1 avsiktligt hoppat.
- `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --incremental`: rent.
- `npm run build`: exit 0, `Compiled successfully`. De befintliga prerender-varningarna utan Supabase-nycklar kvarstår.
- Granskad dokumentleverans: befintlig CJS-harness grön utan externa utskick.
