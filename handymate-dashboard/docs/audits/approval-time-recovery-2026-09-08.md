# Tidrapportsförslag: återläsning och ändrad befintlig tid — 2026-09-08

## Problem och ändring
insertApprovalArtifact kunde ha sparat tidraden trots ett felaktigt/förlorat svar. Utföraren rapporterade då failed utan efterläsning. Granskningen läste inte befintlig stabil tidrad och kunde lova nyregistrering trots att raden fanns, eller upptäcka en ändrad tidrad först efter beslutet.

Nu delar preview och utförare exakta förväntade fält genom lib/approvals/time-proposal.ts: företagsskopad medarbetarreferens (eller NULL utan gissning), projekt, giltigt kalenderdatum, positiva heltalsminuter, beskrivning, fakturerbar=true och approval_status=approved.
Preview läser den stabila time_entry-identiteten i rätt företag och binder befintlig rad eller frånvaro till granskningen. Matchande rad ger Bekräfta registrerad tid och ”Ingen ny tid registreras”. Avvikande rad eller läsfel blockerar före beslut. Beskrivningen visas uttryckligen.
Utföraren försöker aldrig en andra insert i samma anrop. Efter artefakthjälparen, inklusive kastat/förlorat svar, återläser den samma stabila identitet och kräver exakt matchning. Saknad eller avvikande rad ger ett ärligt fel. Återförsök återanvänder matchande rad.

## Verifiering
- Faktisk POST/preview/utförare/artefakthjälpare i isolerad DB: returnerat fel efter sparad insert, kastat svar efter sparad insert, faktiskt osparad insert + lyckat retry, matchande befintlig tid utan extra insert, ändrade minuter/beskrivning/datum/person/fakturerbarhet/atteststatus, läsfel och ändring efter preview.
- Ändrad befintlig tid ger HTTP 422 (granskningen är blockerad), inte falskt sparat och inte en överskrivning.
- Hela route-harness passerar, inklusive tidigare tilldelnings-/kontakt-/ekonomiflöden med isolerade leverantörer.
- 38 befintliga tidförslags-/interna skrivprov passerar genom Playwright-runnern; dessa är inte 38 live-/nativeprov.
- Full tsc --noEmit --incremental false med 8 GB heap exit 0/tom logg.
- Full build exit 0, 327 sidor och tracing, syntetiska Supabase-värden; tidigare byggvarningar kvar.
- Publicerad kod matchar lokalt testade blobbar: time-proposal 8cdb2bdc3f06d86a39907acfe3b48474f37183c3, prepare-review c7704517d7fb3524a46b37c5740b7ee01536abe7, API route 7026bd54be1e930d5a1a026dad6c1388ae190077, route-harness eda1ac88e7d61dde8ce6b811e8e116b09dded252.

## Liveåterhämtning
På Vercel-success 46718f9a113e6e065b1d5ca5e987c4c6561b4cff, inloggad Rollprov Ägare / TEST Rollprov A.
Återanvände tidigare syntetiskt kort aplive_20260908_timeproposal och dess tidrad 3d4966cb-ab2b-5812-ac4a-7b13dd981f3e (75 minuter, 8 september, testägaren, P1).
sql/approval_live_time_recovery_20260908.sql rekonstruerade ett failed-kvittensläge på just kortet. Ingen tidrad eller projektrad skapades/ändrades av seed. Ursprungligt nätverksfel inducerades inte i produktion.

Dialog visade rätt person/projekt/datum/75 minuter/exakt beskrivning och Bekräfta registrerad tid.
Tillbaka lämnade kortets failed och exakt en oförändrad tidrad.
Återöppna/bekräfta gav success/retried/saved med samma time_entry_id/project_id.
Före, efter avbryt och efter slutbeslut: count=1 och MD5 av hela to_jsonb(time_entry)=fbbdf14db7f77ff04f6957eb06bd6935.
Det visar oförändrad sparad rad, inklusive approved_at och updated_at. Write-anropsantal bevisas separat isolerat.
Sparad kvittens ”Tidrapporten är registrerad och godkänd.” matchar Hanterade även efter full omladdning. Uppföljningslistan är tom; de två äldre SMS-korten är kvar orörda.

## Gränser och fortsättning
Live bevisar återhämtning från ett rekonstruerat fel på redan sparad syntetisk tid. Verkligt nätverksavbrott, live redigerad tidrad, flera rollinloggningar och native är inte nyprovade.
En ändrad befintlig tidrad ska fortsatt granskas/rättas i sitt eget flöde; denna kod skriver inte över den eller skapar en ersättningsrad automatiskt.
Kvar bland interna kort: incheckningsdatumets proveniens/tidszon/statuskonflikter, fulla checklistvarianter, dispatch-legacykonflikternas nya beslutsflöde och native. Ekonomi/externa sändar-/paketvarianter och den fulla 77-matrisen har fortfarande öppna luckor enligt huvudauditen.
Ingen main-merge, produktionsdriftsättning eller ny TestFlight-build. Build 12 oförändrad.
