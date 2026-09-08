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
