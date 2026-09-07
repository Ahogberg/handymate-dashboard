# Uppföljning 2026-09-07

Bas: f08d8a9. Testdataöverlämningen i ROLLPROV_TESTFORETAG.md (commit f848ff9)
rapporterar redan skapade företag biz_rollprov_a/b, sju identiteter och P1–P4.
Inga dubbletter skapades. Uppgifterna har lästs i repo, inte verifierats mot live-DB.
Roller, flaggor och tilldelningar finns i den befintliga överlämningen.

## Kvarvarande lucka och rättning

GET /api/projects hade fortfarande `!currentUser || hasPermission(...)`.
Saknad medlemsidentitet gav alltså full list- och ekonomibehörighet trots
att detaljens motsvarande lucka redan hade stängts i 76dcee17.

Listan kräver nu medlemsidentitet för det autentiserade företaget eller
serverns `_impersonation`. Annars 403 före datafrågorna. GET är uttryckligt
dynamisk så att autentiserade svar inte blir statiska. DELETE behåller
owner/admin-only och nekar även verifierad impersonering.

## Verifiering

- `node tests/project-list-identity.cjs`: 8 kontroller gröna med riktig GET-handler,
  syntetisk DB/auth: okänd identitet, serververifierad betraktare, fyra roller,
  återkallad medlemsidentitet mellan anrop samt dynamisk route.
- Samma test mot basens route misslyckades med 200 i stället för 403.
- `tests/rollgranser-r1-r4.spec.ts`: 17 gröna projektions-/källkodskontrakt.

Detta är INTE liveverifiering av autentisering, RLS, ekonomidata eller återkallelse.
Serverns impersoneringsverifiering är inte injektionsprovad av GET-testet;
testet skiljer bara på request-headers och kontexten från auth-helpern.

## Återstår för liveprovet

Testidentiteternas lösenord finns enligt överlämningen i privat kanal. De finns
inte tillgängliga här. Webbläsarens befintliga session tillhör Nordström El,
inte Rollprov A/B. Säker inloggning behövs för att fortsätta med faktiska roller.

1. Verifiera A/B, samtliga medlemsflaggor, P1–P4 och tilldelningar live.
2. Kör tillåtna/nekade projektanrop och granska hela ekonomisvaren.
3. Tilldela PM-off till P1 under provet för att isolera avstängd ekonomi från
   tilldelning (befintlig fixture lämnar PM-off helt otilldelad). Återställ.
4. PM-on: återkalla see_financials och see_all_projects var för sig under samma
   session, kontrollera svar direkt och efter omladdning. Återställ flaggorna.
5. Neka DELETE för PM/anställda på P3, verifiera att posten är kvar. Tillåten
   radering behöver ett separat tomt projekt per owner/admin-prov, eftersom
   samma P4 bara kan raderas en gång.
6. Teamets token-/kostnadsprojektion samt mobilens direkta DB/storagevägar
   behöver egna liveprov. Befintlig fixture har ingen väntande inbjudan.

Ingen produktionsändring eller kontoradering har gjorts i denna uppföljning.
