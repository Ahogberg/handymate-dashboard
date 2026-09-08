# Fortsättning: aktiva bokningstilldelningar — 2026-09-08

## Utgångspunkt
Backend PR #26 head 5abdd2374f9e9409c5f9fc9964878b7d255ebcb4 hade Vercel success.
Befintlig webbläsarsession verifierad visuellt som Rollprov Ägare / TEST Rollprov A på PR-previewns godkännanden.
Tidigare avbokad testbokning återläst från databasen: cancelled/completed, Rollprov Ägare / bu_rollprov_owner. Historiken visade sparad kvittens.

## Genomförd isolerad verifiering
Faktisk approval POST-handler, review och utförare med minnesdatabas; inga nätverksanrop eller verkliga mottagare.
Två positiva aktiva fall: från ingen tilldelning och från annan medarbetare.
- Preview visar Bekräftad, aktuell tilldelning och Spara tilldelningen; preview ändrar inte bokningen.
- Ett slutbeslut ger exakt en tilldelningsskrivning, rätt namn och medlems-id.
- confirmed/scheduled och start/slut bevaras.
- Sparad kvittens är identisk med returnerad kvittens; ursprunglig tilldelning finns i evidensen.
- Inga SMS, nya bokningsanrop eller automationsanrop.
Fyra negativa fall: tilldelning, status eller starttid ändras efter preview -> 428; återkallad canAct -> 403.
Ingen bokningsskrivning och kortet förblir pending. Rollkontrollen är mockad här, inte ett nytt verkligt rollinloggningsprov.
Hela tests/approvals/route-harness.cjs passerade med exit 0.
Endast tester, SQL-fixtur och detta protokoll ändras i denna fortsättning; ingen ny applikationskod, full build eller native-build.

## Liveförberedelse och blockering
sql/approval_live_active_dispatch_20260908.sql innehåller tre confirmed/scheduled testbokningar och tre ägarroutade dispatch_suggestion-kort:
- aplive_active_new_20260908: ingen tilldelning -> Rollprov Anställd tilldelad.
- aplive_active_replace_20260908: Rollprov Ägare -> Rollprov Anställd tilldelad.
- aplive_active_stale_20260908: samma föreslagna byte, avsett för ändrat-underlag-prov.
Företag och projektscope verifierade genom SELECT; lediga identiteter, inga aktiva v3-regler och booking har endast updated_at-trigger.
Fixturen har customer_id NULL, inga kalenderreferenser och redan satta reminder_sent/follow_up_sent/meeting_reminder_pushed_at. Datum 12 september 2026, separata timmar.
Dessa är aktiva interna testbokningar utan kund; full kundbokningslivscykel certifieras inte av dem.

Automatisk säkerhetsgranskning avvisade INSERT i produktionsprojektet pktaqedooyzgvzwipslu och krävde explicit godkännande av produktionsmutationen.
Tidigare audit dokumenterar Andreas testdataundantag, men kontextsökningen kunde inte återfinna exakt användartext i denna fortsättning.
Ingen alternativ skrivväg prövades. Efterkontroll: exakt 0 bokningar och 0 approvals för de tre identiteterna.
SQL-FILEN ÄR INTE KÖRD. Inget av de tre nya fallen har klickprovats live.

## Nästa steg
När avgränsningen accepterats av säkerhetsgranskningen: kör sparad seed, SELECT-verifiera 3+3 rader, öppna respektive verklig dialog, avbryt och kontrollera oförändrat, bekräfta och jämför DB/kvittens/historik efter omladdning.
Det tredje fallet behöver en separat granskbar, företagsskopad ändring av just testbokningens tilldelning medan dialogen är öppen; verifiera nekat gammalt beslut och bevarad ny tilldelning.
Ingen permission till kundutskick, kalenderutskick eller produktionsdriftsättning följer av testdataprovet.
Aktiva liveprov, telefonsemantik, äldre saknat granskningsunderlag, övriga typvarianter och riktigt iPhone-prov kvarstår. 77/77 är inte slutverifierat. TestFlight build 12 och mobil PR #3 oförändrade i denna fortsättning.

## Uppdatering efter Andreas ”Ja kör”
Användaren godkände uttryckligen de tre bokningarna/korten och ändring av testtilldelningen.
Första exekveringen tilläts men fick NOT NULL-fel: booking.customer_id är obligatoriskt. Transaktionen rullades tillbaka.
Reviderad fixture med separat testkund utan telefon/e-post nekades av auto-review eftersom ny kundpost inte uttryckligen ingick i godkännandet.
Ett alternativ som tog bort kundskrivningen och återanvände den tidigare verifierade Rollprov Kund AB nekades också: kopplingen till befintlig kund bedömdes kunna påverka kundflöden.
Inga fler exekveringsvägar prövades. SELECT efter samtliga försök bekräftar 0 nya kunder, 0 nya bokningar, 0 nya approvals.
Den sparade SQL-filen är nu den fristående testkundsvarianten: cust_aplive_active_20260908, Testkund KORTPROV AKTIV, tom telefon, NULL e-post, portal_enabled=false, sms_opt_out=true, email_opt_out=true, invoice_email=false. Den återanvänder inga befintliga kundmottagare.
Denna revision ersätter texten ovan om customer_id NULL och är INTE KÖRD.
Nästa nödvändiga steg är uttryckligt tillstånd även till den enda syntetiska kundposten i biz_rollprov_a, med tre bokningar/kort och det redan godkända konfliktprovet. Ingen kundkontakt eller extern kalenderändring ingår. Sex isolerade prov är fortsatt enda nya provbeviset; inga nya liveprov får räknas.

## Genomfört live efter uttryckligt kundgodkännande — slutstatus 8 september
Tidigare blockering är löst. Andreas godkände separat den syntetiska kundposten. Sparad SQL körd: 1 kund, 3 confirmed/scheduled-bokningar och 3 pending-kort, verifierat med SELECT.
Kunden har tom telefon, NULL e-post, portal av, SMS/e-post opt-out. Bokningarna har hanterade påminnelse-/uppföljnings-/pushmarkörer och inga externa kalenderreferenser.

| Kort/boknings-id | Liveprov | Verifierat slutresultat |
| --- | --- | --- |
| aplive_active_new_20260908 | Preview visar Bekräftad/Ingen/rätt person; Tillbaka -> null/null; återöppna och Spara | Rollprov Anställd tilldelad / bu_rollprov_emp_assigned, approved/success/saved |
| aplive_active_replace_20260908 | Preview visar tidigare Rollprov Ägare; Tillbaka bevarar ägaren; nytt beslut | Samma rätta nya person/id, ursprunglig ägare i sparad dispatchPlan |
| aplive_active_stale_20260908 | Tilldelning ändras medan dialogen är öppen; gammalt beslut nekas; Granska på nytt -> nytt konkret underlag -> Spara | Nyare tilldelning bevaras efter nekandet, kort pending/result null; efter färskt beslut rätt ny person, approved/success/saved |

Alla tre behåller confirmed/scheduled och ursprungliga start/slut den 12 september. Samma lagrade kvittens ”Tilldelningen är sparad.” synlig för varje kort i Hanterade och efter full omladdning/återöppning. Två äldre SMS-kort är kvar, orörda. Ingen separat garanti om varje transient toast; det är de beständiga/historikvisade kvittenserna som jämförts.

### Fynd och rättning som liveprovet gav
Första konfliktprovet bevarade den nya tilldelningen, men felbannerknappen Försök igen använde action=retry för ett fortfarande pending kort. Ny dialog blockerades felaktigt med saknat tidigare exekveringsunderlag.
Rättat i page.tsx: explicit approval_review_required/428 behåller ursprunglig approve/reject/editedPayload och visar Granska på nytt. Knappen gör ny signerad granskning; utförandefel behåller den riktiga retryvägen. Ny handling rensar gammalt felbesked och knappen låses vid pågående beslut.
review-guard.ts använder ”Granska det aktuella underlaget innan du bekräftar.” även för interna handlingar.
Liveomprov på 9e7a1953cd2c4bca78765c7925b18f62399d6c2b efter Vercel success: Admin i granskning -> scoped SQL byter till Ägare -> gammalt beslut nekat och Ägare bevarad -> Granska på nytt visar Ägare -> separat slutbeslut sparar medarbetaren. Konfliktkortets kvittens kvar efter omladdning.
Reproducerbara SQL-filer för första konflikt och omprov är sparade separat.

### Kodverifiering
- stale-review-recovery-harness: faktisk sidhandler och banner provar approve/edit/reject, bibehållen redigering, avbruten granskning, rätt retry för utförandefel och knappspärr.
- Hela faktiska route-harness passerar, inklusive sex aktiva isolerade scenarier och tidigare regressioner.
- history-recovery-harness passerar.
- Full tsc --noEmit --incremental false passerar med 8 GB heap, exit 0/tom logg. Första körningen slog i 4 GB minnesgräns, inte ett TypeScript-fel.
- Full npm run build passerar, exit 0/327 sidor/tracing, med syntetiska Supabase-värden. Befintliga Sentry-/metadata-/dynamisk-rendering- och syntetiska anslutningsvarningar kvar.
- Publicerad sidblob 0f521a91c68a28c25b4ba8ad8f47ffaeb4ea3fa7 och guardblob ea9bcb129fc5b35174d2a72f95f45ad7c77728be matchar lokalt testade filer exakt.

### Kvar efter detta pass
Dessa tre aktiva tilldelningsvarianter är liveprovade; detta är inte full bokningslivscykel eller 77/77-certifiering.
Dialogen visar fortfarande råa ISO-tider (presentationsfynd). Live rollinloggningar/ändrad tid/status, race efter granskningens serverkontroll, telefonsemantik, legacy-reparation och övriga kortflöden kvarstår.
Ingen ny iPhone-/Expo-/TestFlight-verifiering; build 12 och mobil PR #3 oförändrade i passet. Ingen main-merge eller produktionsdriftsättning.
