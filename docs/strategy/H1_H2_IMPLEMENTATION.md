# H1/H2 — Inkorg och uttryckligt samtycke

2026-09-15. Codex implementation från `main c09364e7`, för Claudes granskning. Ägarbeslutet i `TRYGG_OVERLAMNING_BRIEF.md` §4 gäller: **inget implicit samtycke**. Ingen migrering eller flagga har aktiverats av denna leverans.

## Kundens resa

- Befintliga och nya företag får samma fråga om de fyra tillåtna påminnelsetyperna. Ja sparas atomiskt med beviljandet; nej sparas utan nya beviljanden. Ett sparat svar stänger engångsfrågan även efter omladdning. Tidigare beviljanden och uttryckliga avstängningar bevaras.
- Information finns i **Inkorg**, utan svarskrav eller sista svarsdatum. Efter 30 dagar ligger informationen kvar under månadens **Vi la det åt sidan**. Verkliga beslut finns kvar i beslutsvyn.
- Morgonkvittot visar högst tre öppna beslut. Kort med deadline sorteras först på närmast deadline, sedan belopp och ålder; aldrig utgående interna grindar fyller restplatserna efter ålder. Utgångna beslut finns i det beständiga kvittot. Övervakade utskicksförsök redovisas var för sig med känt eller okänt utfall; förtjänad autonomi summerar lyckade försök per typ.
- **Stäng av** kräver ingen andra bekräftelse. Ett misslyckat sparande ger ett synligt fel, aldrig ett falskt avstängt-läge. Servern blockerar nästa försök och erbjudanden i 30 dagar. Den gamla autentiserade revoke-rutten behåller kompatibilitet med klienter utan `expected_business_id`; nya webbklienter skickar det för att upptäcka företagsbyte.

## Databas och integration

`sql/v248_handoff_inbox_consent.sql` är ett **granskningsutkast**. Nummer v248 lämnar utrymme för Claudes H3b; kontrollera numret mot H3b före merge/applicering.

- `pending_approvals.card_kind` härleds i en definer-trigger med låst search_path. Digesttyper och informationshandlingar blir notices. Utgång är en separat, explicit matris: kund-/pengahandlingar får sju dagar, autonomierbjudanden fjorton, notices och de fjorton beslutade interna grindarna ingen. Okända typer får ingen implicit deadline och kontraktstestet kräver en uttrycklig post för varje verklig producent. Backfill kortar aldrig en levande väntetid: befintlig senare deadline bevaras och en gammal/null deadline får minst ett dygn framåt.
- En AFTER UPDATE-trigger samlar alla statusövergångar till expired, oavsett maintenance, tool-router eller specialcron. Unikt `(business_id,source_key)` hindrar dubbla insamlingar. v241:s producenter ändras inte. Integrationstest laddar verkliga v241 och v248 och bevisar en dismissed-händelse respektive en acted-händelse.
- `autonomy_consents` är engångssvaret. `autonomy_controls` är auktoritativt beviljande/avstängning för de nya övergångarna. JSON-formatet i `v3_automation_settings.earned_autonomy` behålls för äldre läsare; beloppsgränser och tidigare förtjänade beviljanden ersätts inte av ett sent samtycke.
- Advisory lock per företag serialiserar consent/off/offer/audit/promotion. Äldre inställningsskrivningar får inte återinföra avstängda nycklar. Autentiserade direktskrivningar får inte ändra `earned_autonomy`; settings-API:t filtrerar fältet och kräver ägare/admin. Nya RPC:er får endast anropas av service_role. Nya tabeller har RLS och inga direkta INSERT/UPDATE-rättigheter ens för service_role; SELECT/DELETE behövs för läsning och kontoradering.
- `handoff_items` sparar ett osäkert försök **före** leverantörsanropet. En andra behörighetskontroll efter preflight/audit fångar återkallelse före anrop. Terminal CAS avslutar försöket. Denna tabell är en revisionslogg, inte H3b:s utskickskö, och får aldrig köras om som en kö.
- `handoff_digests` sparar hela kvittot före push. En claim per företag/svensk kalenderdag hindrar dubbla automatiska pushförsök. Okänt utfall blir inte automatisk retry. `expiry_reported_at` sätts endast när pushleverantören accepterat sammanfattningen.
- Befintlig `push-morgon` anropas på sitt vanliga schema och behåller tyst tid. Handoff har 40 sekunders budget och sidor om 50 företag. Ett handoff-fel hindrar inte frisläppningen av redan hållna pushar. H4:s morgonrapport och gamla hållna pushar har fortfarande sina egna leveransspår; detta paket slår inte ihop dessa med kvittot.
- SMS-motorn, bokningspåminnelser, offertuppföljning, recension och fakturapåminnelse passerar den nya gränsen när de kör på autonomibevis. Mandat och manuellt granskade utskick behåller sina befintliga gränser. Samma belopps-, opt-out-, kvot- och kanalkontroller gäller. Varken ekonomiska kernelkommandon eller moms-/ROT-regler ändras.

## Avvikelser och kvarvarande integration

1. **Pushens Ja/Nej är inte implementerat i native.** Kvittots beslutslänkar öppnar den befintliga granskningen. `send_sms` och `invoice_reminder` är verkliga exekverbara handlingar och befintlig obligatorisk förhandsgranskning kringgås inte. Native kategorier och tillhörande granskning behöver en separat mobiländring; H1:s pushåtgärdspunkt är alltså inte stängd av denna PR.
2. `dispatch_suggestion` och övriga befintliga digesttyper är notices och behåller samtidigt sin rad i "Skött utan dig". Interna grindar som checklista och projektgenomgång förblir beslut men har ingen utgång. `publish_microsite` är fortsatt ett tidsbegränsat kundnära beslut. Kontraktstestet kräver explicit kortsort och utgång för alla verkliga producenter.
3. **Exakt en levererad push inom 24 timmar kan inte garanteras.** En push kan accepteras utan att nå en enhet; nätfel kan ha okänt utfall. Databaskvittot finns kvar, och UI skiljer accepterad avisering från okänd leverans. Automatisk retry undviks vid osäkerhet. Vid större tenantvolym behöver den budgeterade morgonsvepningen en beständig fortsättningspekare för att inte prioritera samma första sida efter tidsbudget.
4. Vid misslyckad preflight skapas H3a:s synliga kanalnotis, inte ett utskickskort som H3a samtidigt skulle blockera. Utskicket sker inte. Auditfel före utskick blockerar också; ett resultat som inte kan sparas förblir okänt i kvittot.
5. **H3b ska koppla cancellation till `stop_supervised_autonomy` under samma företagslås.** Innan dess blockeras nästa försök, men det finns inga outbound_intents att avbryta i denna bas. Redan påbörjade leverantörsanrop kan inte återkallas. H2:s fulla cancel-invariant behöver omprovas tillsammans med H3b före pilot.
6. Den signerade off-tokenen är bunden till företag, nyckel, syfte och sju dagars giltighet. Bara POST kan stänga av; länkskannande GET gör inget. I denna webbimplementation används knappen i det autentiserade kvittot, inte en ny publik mail-landningssida.
7. Promotion behåller befintliga 15 raka, oredigerade mänskliga godkännanden. Automatiska försök fabricerar ingen streak. Ett sparat nej lämnar den befintliga erbjudandevägen orörd.

## Aktivering och återställning

Efter granskning, kompatibilitetsprov mot H3b och godkänt pilotval:

1. Applicera granskad v248. **DDL:n aktiverar kortklassificering och utgångsregler direkt**, även när webbflaggan är av; planera detta tillsammans med H1-aktivering. Inga autonomibevis skapas av migreringen.
2. `HANDOFF_INBOX_ENABLED=true` visar Inkorg och aktiverar morgonkvittot. `CHANNEL_PREFLIGHT_ENABLED=true` måste redan vara verifierad (inklusive Resend-domänläsning).
3. `SUPERVISED_AUTONOMY_ENABLED=true` kräver båda ovan för att samtycke/utskick ska tillåtas. Flaggan ensam beviljar ingenting. `AUTONOMY_OFF_SECRET` är en separat stark serverhemlighet för signerade avstängningar; utan den används autentiserad POST i webbkvittot.
4. Prova nej → omladdning, ja → fyra nycklar, ett godkänt försök → kvitto, leverantörsfel → ärligt utfall, off → inget nytt försök, byte av företag, samt H3b:s väntande-intent-cancellation. S1/V2/V3-flaggorna behåller tidigare separata aktiveringsordning.

Vid paus: stäng först `SUPERVISED_AUTONOMY_ENABLED`. Samtyckesbeviljanden kan inte falla tillbaka till äldre autonomi när flaggan stängs. Radera inte audit/consent/controls eller återställ ett äldre settings-JSON för att backa; behåll avstängningar. Låt inkorg och preflight vara kvar för kundens insyn. SQL-reglerna rullas inte tillbaka genom att en miljöflagga ändras.

## Verifiering

Lokalt: 2479 kontraktstester gröna, ett befintligt skip; CJS 17/17 och activity-harness gröna. Efter sista ändringarna: ytterligare 73 grannprov och 13 SQL-/UI-prov gröna. TypeScript rent och Next-bygge exit 0. CI:s history-recovery-harness har en explicit flaggmiljö och provar listan med H1 både av och på; det riktade harnesset är grönt lokalt. Den fulla lokala approval-integration-körningen stoppades av den lokala Chromium-processen; CI:s browserprov används som grind. Se PR #81 för slutlig CI. Riktade prov kör riktiga moduler, PGlite och riktiga React-komponenter i DOM: consent yes/no/replay, medlems- och tenantgränser, skrivfel, preflight, återkallelse före anrop, okänt leverantörsutfall utan retry, 15-streak, terminal CAS, v241-samexistens, högst tre beslut, tyst tid, notice-arkiv och sena svar vid företagsbyte. Inga produktionskunder, externa utskick eller produktionsskrivningar används i testerna.
