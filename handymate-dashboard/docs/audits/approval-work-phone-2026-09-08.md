# Arbetsordertilldelning: telefon och äldre kvittenser — 2026-09-08

## Rättning
Tidigare ändrades assigned_to men assigned_phone kunde ligga kvar från föregående person. Arbetsorderns separata SMS-rutt använder assigned_phone, så en senare sändning riskerade fel mottagare.
Nu granskas och sparas namn/telefon tillsammans från aktuell företagsskopad business_users-rad. Saknad eller tom medarbetartelefon blir NULL och tar bort tidigare arbetsordernummer. Före-värdet binds till signerad granskning och villkorad uppdatering; en annan senare telefon får inte skrivas över. Kvittensen bygger på återläst rad.

Äldre dispatch-kort som saknar plan, eller äldre arbetsorderplaner utan telefonfält, kan återställa kvittensen enbart om aktuell tilldelning exakt motsvarar det aktuella förslaget inklusive telefon. Dialogen säger Bekräfta befintlig tilldelning och uttryckligen att ingenting ändras/skickas. Planens before=after innebär antingen verifierad befintlig rad eller nekande, aldrig ny tilldelningsskrivning.
Konflikter eller avvikande telefon förblir blockerade och kräver ett nytt granskat tilldelningsförslag. Detta är en begränsad kvittensreparation, inte full reparation av alla äldre misslyckanden.

## Isolerade prov
Faktisk POST-handler/granskning/utförare med isolerad DB:
- Nytt telefonnummer från medarbetaren, trimning och saknad telefon.
- Gammal/ny telefon synlig; granskning gör inga skrivningar.
- Ändrad medarbetartelefon efter preview ger 428 utan skrivning.
- Skrivfel -> failed med ursprunglig plan; signerat retry med förlorat skrivsvar -> rätt rad/saved.
- Upprepat framgångsutfall skriver inte igen; enbart ändrad telefon blockerar överskrivning.
- Legacy för booking och work_order återställer korrekt befintligt resultat utan någon tilldelningsskrivning; avvikande namn/telefon blockeras.
- Äldre work_order-plan som saknar telefonfält får samma läsande återhämtning.
Hela route-harness samt stale-review-recovery-harness passerar. Full tsc med 8 GB heap exit 0/tom logg. Full build exit 0, 327 sidor/tracing, syntetisk Supabase-konfiguration och tidigare varningar.

## Livebevis
På verifierad Vercel-success 3081badb0871391ca49d15d101eff6181d7848c1, Rollprov Ägare / TEST Rollprov A.
Seed sql/approval_live_work_phone_20260908.sql skapade två separata arbetsorderutkast och två kort. Inga nya/ändrade kunder eller användare, inga aktiva mottagarnummer eller datum. Arbetsordertabellen har inga användartriggers. Medarbetarens telefon saknas.

| Identitet | Genomfört |
| --- | --- |
| aplive_wo_phone_20260908 | Granskning visar Tidigare testperson, TEST-EJ-RINGBART och att gamla telefonen tas bort. Tillbaka bevarar namn/telefon. Ny granskning + Spara ger Rollprov Anställd tilldelad, NULL telefon, draft, sent_at NULL, saved och exakt före/efter-plan. |
| aplive_wo_legacy_20260908 | Syntetiskt failed-tillstånd utan review_evidence, redan rätt person/NULL telefon. Återförsöksdialog visar Bekräfta befintlig tilldelning. Tillbaka bevarar failed. Slutbeslut ger success/retried/saved och before=after, medan namn/telefon/status/sent_at/dispatch_reasoning/updated_at är oförändrade. |

Båda sparade kvittenserna säger Tilldelningen är sparad och matchar Hanterade före/efter full omladdning. Legacy-ärendet försvann från uppföljningslistan; två äldre SMS-kort är orörda.
Det äldre ursprungsfelet var rekonstruerat i testdata, inte inducerat i drift. Noll tilldelnings-write-anrop verifierades isolerat; live verifierades oförändrade sparade fält, inte instrumenterad write-räkning.
Varianten med faktiskt nytt telefonnummer är isolerat provad; live använde saknad telefon och ett icke-ringbart föregående markörvärde. Inga SMS skickades.

## Versionsbevis och kvarstående
Publicerade blobbar matchar lokalt testade filer: internal-writes a0a3dc6956189d77e0f31e3eeca583d340e4f0e2, prepare-review 53168f43e07e7ad6bd29ba545ba7cdbe02e67bf5, route-harness aef686b802511b5d54f56290421a4fda8f5e6050.
Kvar: legacy-konflikternas nya beslutsflöde, live nummerbyte/rollvarianter, samtidighet efter granskningens slutkontroll, native och övriga 77-typsluckor. Nästa interna område: tidrapportsförslagets svarsförlust och ändrade befintliga tidrader.
Ingen main-merge/produktionsrelease eller ny TestFlight-build. Build 12 oförändrad.
