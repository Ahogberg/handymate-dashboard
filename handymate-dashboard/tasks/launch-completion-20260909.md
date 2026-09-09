# Lanseringsmål och beständig arbetskö — 2026-09-09

Detta är aktuell genomförandeplan. tasks/six-outcomes-20260909.md beskriver de sex kundutfallen och historiken; de sex leveransblocken nedan är arbetsindelningen, inte sex slutgodkända kundutfall.

## Mål
En byggfirma ska kunna gå från företagsstart till första förfrågan, från förfrågan till accepterad offert/projekt och från utfört arbete till rapport, godkänd ÄTA och verifierat fakturaunderlag i ekonomisystemet. Avbrott, nekad behörighet och återförsök får inte orsaka förlust, dubletter eller falsk kvittens.

## Gemensamma färdigvillkor
1. Kontext och objektkopplingar följer hela kedjan; nästa steg och ansvar är synliga.
2. Fel, avbrott, dubbelklick, tappat svar, behörighetsnekande och återförsök har verifierade säkra utfall.
3. Resultat och kvittenser stöds av sparade bevis; skapat, skickat, levererat och betalt skiljs åt.
4. Andreas och Christopher klarar verkliga byggscenarier utan utvecklarhjälp.

Status: planerad → pågår → tekniskt verifierad → kundgodkänd. Externt blockerad är en separat markering och räknas inte som klar. En grön PR är inte ett slutgodkänt kundflöde.

## Arbetskö
| Block | Status vid start | Nästa arbete och tekniskt facit |
|---|---|---|
| 1 Säker fakturering | Tekniskt verifierad i PR35, kundprov öppet | Bevara atomiska källmarkeringar och replay-skydd. Kontrollera klientnyckel för fria fakturor; testa verklig provider separat. |
| 2 Fullständig offertaccept | Tekniskt verifierad i PR35, kundprov öppet | Bevara beständig completion/recovery. Osäkert bekräftelsemejl kräver avstämning; ingen blind omsändning. |
| 3 Tillförlitligt inflöde och uppföljning | Nästa | Kartlägg samtliga skapare; anslut först lead-portal till beständig mottagning. Bevisa sparat mottagande före sidoeffekter, samma ID vid retry och synlig återhämtning. Därefter verifiera uppföljningens aktivering, heartbeat och stopp vid svar/nej/signering. |
| 4 Rapport till ekonomisystem | Planerad | Kontrollera befintlig mobilåterupptagning, spara oskickade utkast där det saknas, bevisa rapport→ÄTA→fakturakällor och avstämning. Separera internt godkänd rapport från kundgodkänd ÄTA. Riktigt telefon-/Fortnoxprov öppet. |
| 5 Företagsstart och mejl | Planerad | Rätta Gmail opt-out, pagination och cursor vid partiella fel innan aktivering. Verifiera faktisk OAuth-onboarding och Bolagsverkets kontrakt; bekräftad företagsprofil ska nå offert/agent. Microsoft kräver separat verifierad appregistrering och samtycke; redovisa vad som faktiskt fungerar. |
| 6 Sammanhängande release | Planerad | Samla exakta backend-/mobil-SHA, migrationer, flaggor, miljö, EAS-profil och testbevis. Kör gemensamma roll-/tenant-/kedjeprov. Lista återstående kundprov och externa blockerare innan releasebeslut. |

## Startbevis
PR35: https://github.com/Ahogberg/handymate-dashboard/pull/35
Verifierat remote HEAD: 1ca2720936c95a04b13481f4f951c65addda552c.
Fem GitHub-grindar och två Vercel-previewbyggen gröna på detta HEAD enligt föregående leverans.
35 nya integritetsprov; sprintsvit 168 prov. Ingen produktionsmigration, main-merge eller ny EAS utförd i leveransen.
Detaljer: docs/handoffs/INVOICE_ACCEPTANCE_INTEGRITY_2026-09-09.md.
Lokal full build får inte beskrivas som lyckad: ENOTEMPTY vid städning; fulla Vercel-byggen gav byggbevis.

## Arbetsprotokoll för varje fortsättning
1. Läs denna fil, repo-instruktioner och aktuell GitHub-status. Återställ repo från GitHub om scratch saknas.
2. Kontrollera pågående arbete/branch-HEAD innan ändringar. Skriv aldrig över andras ändringar och använd inte force-push.
3. Välj första oblockerade del i kön. Läs implementation, återge konkret fel, rätta grundorsak och testa verklig route/helper/SQL/render där relevant.
4. Vid fel i verifieringen: iterera tills orsaken är löst eller konkret extern blockerare är belagd.
5. Spara ändring och checkpoint i egen gren/draft-PR. Uppdatera denna fil med exakt SHA, provresultat, kvarstående risk och nästa körbara steg. Fortsätt automatiskt till nästa oblockerade del; vänta inte på ett nytt ”kör”.
6. Om en del kräver extern åtkomst: dokumentera exakt behov och fortsätt med övriga delar. Kalla aldrig mockade prov för liveprov.
7. Rapportera bara verifierade framsteg, misslyckanden och återstående användaråtgärder.

## Gränser
Ingen merge/push till main, produktionsmigration eller skarp kundkommunikation under nattpassen. Förbered granskbar leverans och befintliga kontraktsgrindar. Inga nya agentstartpunkter eller osanna schemalöften i mobilen. Bygg inte om befintlig SavedReportPanel utan att först läsa implementationen.
Kundgodkännande kräver Andreas/Christopher; externa OAuth-/leverantörsbeslut får inte antas vara klara.

## Nästa körbara steg
Läs app/api/lead-portal/[code]/route.ts och lib för durable lead intake. Återge lead-sparat/deal-fel samt dubbelinskick i routeprov och koppla portalen till beständig mottagning med kompatibel återförsöksnyckel.

## Checkpoint
2026-09-09: planen etablerad; block 3–6 inte slutförda. Nattpassen ska prioritera kod och lokala/CI-bevis och lämna en exakt lista över telefonprov och externa beroenden.
