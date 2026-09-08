# Handymate – granskning av godkännanden, 7 september 2026

**Bedömning: alla godkännandeflöden är inte godkända för utrullning.** Hannas kampanj visar ett verkligt produktproblem: beslut begärs utan innehåll och mottagare. Källkoden bekräftar att kortet kan köa kundutskick direkt. Ändra kan också godkänna och utföra.

Denna genomgång täcker samtliga **77 registrerade korttyper i pending_approvals**, deras centrala utförandehanterare samt de generiska ingångarna i mobil och webb. Den är en källkodsgranskning och avgränsade mockprov, inte ett intyg om att alla appens övriga specialflöden, betalnings-/signeringssidor eller autonoma körningar har slutprovats.

## Källor och miljö

- Backend: Ahogberg/handymate-dashboard, main `fcc0305438ed7b7d34555f684778e7fdf99f5653`.
- Mobil: Ahogberg/handymate-mobile, main `4ec114c18d22c1458232b4c98534884feeb7ce1d`.
- Användarens observation: TestFlight 1.0.0 build 12, Hanna-kortet på Hem. Bilden visar en beskrivning och Godkänn men ingen fullständig text/mottagarlista.
- Huvudkällor: `app/api/approvals/[id]/route.ts`, `lib/approvals/action-contract.ts`, `lib/jarvis/approval-preview.ts`, mobilens `lib/api.ts`, `components/ApprovalCard.tsx`, Hem och Godkänn. Kampanjkedjan går vidare genom `app/api/cron/send-campaigns/route.ts` och `app/api/campaigns/send/route.ts`.

## Implementerat i PR-utkasten – utökad genomgång

- Första klicket gör en läsande granskning. Full text, mottagare, kanal och ämne visas. Även avvisning visar sina följder och kräver ett separat bekräftat beslut.
- Beslutet binds till kort, företag, användare, handling, ändringar, paketets delåtgärder och verifierade aktuella underlag. Ändrat pris eller annat ändrat underlag kräver ny granskning.
- Intern granskning har utökats till tidsattest, tilldelning, tidsförslag, checklistor, fotobaserad egenkontroll, kundfakta, minnen, projektlärdomar, intern offertgranskning, försöksupplägg, försöksbeslut och framtida autonomi. Detta är implementerat stöd med villkor, inte ett godkänt slutprov av samtliga typer.
- Tidsförslags-SMS använder samma textbyggare i granskning och utförande. Knappen lovar uttryckligen inte en bokning eller ombokning.
- Fakturapåminnelser visar kanaler, avgift, ränta och nästa påminnelse. E-postinnehåll visas i en isolerad HTML-vy. SMS/e-postautomationer har stöd för färdig meddelandegranskning; andra automationer behöver fortsatt arbete.
- Paket visar valda SMS- och materialdelar och ger kvittens per delåtgärd. Paket med vald bokningsdel är fortfarande inte färdiga. Informationsdelar räknas inte som utförda handlingar.
- Webbens dokument måste laddas och markeras som granskade före bekräftelse. Mobilen har motsvarande bild-/dokumentvisning och spärr, verifierad med komponentprov; iPhone-slutprov återstår.
- En gemensam serverkvittens skiljer noterat, sparat, köat, accepterat utskick, delvis utfört och misslyckat. Kvittensen sparas i kortets utförandespår och används i de generiska webb- och mobilvägarna. Full kontroll av alla historikytor återstår.
- Tilldelning och tidsattest har företagsfilter och kontrollerade skrivresultat. Ett återförsök efter misslyckad attestering återanvänder samma tidrad. Stabil artefaktidentitet införs även för kundfakta, checklistor, tidsförslag, uppgifter, materialrader, projektlärdomar och försöksrader.
- Fakturapåminnelsens sändare kontrollerar fakturans företag, status och påminnelseräknare före utskick. Resends returnerade fel räknas inte längre som skickat. Misslyckad lagring av avgifter, påminnelsestatus eller historik redovisas som delvis utfört.
- Avvisning rapporterar fel i följdändringar. Intern offertgranskning kontrollerar uppdateringen och skickar en riktad intern notis; ett misslyckat mottagaruppslag får inte bli en notis till hela företaget.
- Generellt återförsök av en redan delvis utförd handling stoppas tills det befintliga resultatet kontrollerats. Ett säkert stopp ersätter inte ett färdigt flöde för återförsök per del.

## Återstående brister – hindrar generell utrullning

1. **Offert-, faktura- och jobbrapportsutskick:** färdigt dokument, exakt meddelande, alla mottagare/kanaler och dokumentversion behöver bindas i samma beslut. Fakturans Fortnox-/e-fakturagren måste ingå. Jobbrapporten skapar faktiskt PDF och kan mejla kunden; den tidigare rapportens beskrivning som en kvittens var fel och är korrigerad här.
2. **Bokning, platsbesök och projektavslut:** dynamiska tider, kalenderkoppling, projektändringar, kundbekräftelser och eventuell faktura behöver kompletta gransknings- och delutfallsflöden. Pakets bokningsdel återstår.
3. **Betalning och lead:** betalningsregistrering kan starta automation och portalmeddelande. Leadaktivering skapar affär, kan skicka internt SMS och triggar lead_received-regler. Detta är mer än en statusändring och måste slutföras med tydliga följdval.
4. **Övriga automationer och specialvyer:** varje åtgärdsvariant behöver ett eget fullständigt kontrakt. Webbhänvisningar för intäktsfynd, jobbpass, installationer och liknande innebär ingen färdig mobilresa. Mobilen saknar flera motsvarande vyer; dessa kort blir kvar.
5. **Historik och återförsök:** nya kvittenser finns, men hela historik-/aktivitetskedjan och återförsök av enbart misslyckade paketdelar är inte slutprovade. Leveranskedjan efter kampanjköning behöver egna prov.
6. **Slutprov och release:** inga riktiga kundutskick har gjorts. Ny Expo-build och samordnad backendversion krävs. TestFlight 1.0.0 build 12 är oförändrad. PR-utkasten är inte en färdig generell release.

## Matris – alla 77 korttyper

”Granskning” betyder implementerat stöd i detta utkast, inte godkänd produktionstest. ”Stopp” betyder inget generiskt utförande och kortet kvar för fortsatt handläggning. ”Kvittens” betyder läst/intygat, inte att kunduppdraget är slutfört.

| Korttyp | Vad befintlig hanterare faktiskt gör | Utkastets behandling |
|---|---|---|
| `send_sms` | Skickar payload.message via SMS till to/customer_phone. | Full meddelandegranskning |
| `send_email` | Skickar e-post med ämne och body till to. | Full meddelandegranskning |
| `send_quote` | Skickar befintlig offert via vald kanal, normalt både SMS och e-post. Extra mottagare och BCC kan ingå. | Stopp – komplett granskning återstår |
| `send_invoice` | Skickar befintlig faktura via e-post och/eller SMS. | Stopp – komplett granskning återstår |
| `send_matte_customer_reply` | Skickar customer_reply_pending, annars message, till entity.phone. | Full meddelandegranskning |
| `quote_nudge` | Skickar uppföljnings-SMS; är inte bara en påminnelse till ägaren. | Full meddelandegranskning |
| `confirm_payment` | Registrerar betalningsbeslut och kan trigga pipeline-/projektregler, payment_received och portalmeddelande. | Stopp – komplett granskning återstår |
| `create_booking` | Skapar bokning via boknings-API:t. Nedströms bokningsregler och notiser behöver granskas. | Stopp – komplett granskning återstår |
| `create_quote_draft` | AI genererar och sparar offertutkast; inget kundutskick i denna hanterare. | Internt granskningsunderlag |
| `create_ata_draft` | AI genererar och sparar ÄTA-utkast, med offertutkast som reservväg när projekt saknas. | Internt granskningsunderlag |
| `create_invoice_from_report` | Kvitterar och returnerar navigation till fakturor; skapar ingen faktura. | Hänvisning till webbens specialvy; inget generiskt utförande; mobilresa återstår |
| `autopilot_package` | Utför valda delåtgärder: bokning, kund-SMS och materialrader. Projektinformation är en nollhandling. Delvis fel är möjligt. | Valda SMS-/materialdelar granskas; bokningsdel återstår |
| `autonomy_offer` | Beviljar framtida autonomi för en åtgärdstyp. Kan därmed möjliggöra senare utskick utan nytt kortbeslut. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `review_request` | Skickar SMS om recension och skriver uppföljningsmetadata. | Full meddelandegranskning |
| `scheduled_review_request` | Skickar SMS om recension och skriver uppföljningsmetadata. | Full meddelandegranskning |
| `yearly_followup` | Skickar SMS med årsuppföljning och skriver uppföljningsmetadata. | Full meddelandegranskning |
| `proactive_care` | Skickar suggested_sms till customer_phone, efter kvot- och proaktiv kontaktkontroll. | Full meddelandegranskning |
| `warranty_followup` | Skickar suggested_sms till customer_phone, efter kvot- och proaktiv kontaktkontroll. | Full meddelandegranskning |
| `seasonal_campaign` | Skapar kampanj och mottagarrader och köar utskick. Cron anropar sedan kampanjsändaren; inte bevis på levererat SMS. | Full meddelandegranskning |
| `customer_reactivation` | Skickar suggested_sms till customer_phone. | Full meddelandegranskning |
| `customer_message` | Kan spara portalsvar och skicka separat SMS-notis med portallänk. Utan svar kvitteras endast kortet. | Stopp – komplett granskning återstår |
| `customer_quote_question` | Samma portalsvarsflöde som customer_message, inklusive möjlig SMS-notis. | Stopp – komplett granskning återstår |
| `quote_request` | AI genererar och sparar offertutkast. | Stopp – komplett granskning återstår |
| `quote_addition` | AI genererar och sparar offertutkast utifrån önskat tillägg. | Stopp – komplett granskning återstår |
| `propose_booking_times` | Skickar SMS med svar eller föreslagna tider; skapar normalt ingen bokning. | Exakt SMS-granskning; ingen bokning utlovas |
| `propose_site_visit` | Hämtar tillgängliga tider vid utförandet och bygger/skickar ett SMS då. | Stopp – komplett granskning återstår |
| `reschedule_request` | Skickar SMS med svar eller föreslagna tider; själva ombokningen måste särskiljas från förslaget. | Exakt SMS-granskning; ingen bokning utlovas |
| `new_booking_request` | Vid quote_signing: skapar bokning och försöker skicka bekräftelse-SMS. Övriga källor: skickar tidsförslag via SMS. | SMS-grenen stöds; offertsigneringens bokningsgren återstår |
| `dispatch_suggestion` | Tilldelar person på bokning/arbetsorder. Befintlig hanterare ignorerar databasfel och saknar företagsscope på uppdateringen. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `publish_microsite` | Publicerar webbsidan, vilket gör innehållet externt tillgängligt. | Stopp – komplett granskning återstår |
| `invoice_reminder` | Skickar SMS och eventuellt e-post samt uppdaterar påminnelseavgift/ränta och historik. | Granskning av kanaler och avgifter; kontrollerad delutfallskvittens |
| `automation` | Kör en underliggande automationsåtgärd med konfiguration; kan ge andra externa effekter. | SMS/e-post granskas; create_approval kvitteras; andra varianter återstår |
| `price_adjustment` | Ändrar prislistans ordinarie timpris. Ny granskning kräver även identifierande prislistenamn. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `fakturera_projekt` | Återskapar fakturaunderlag, jämför med snapshot, skapar och skickar faktura. | Stopp – komplett granskning återstår |
| `project_debrief` | Sparar bekräftade projektlärdomar från svaren; tomma svar är giltiga. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `playbook_pattern_confirmation` | Sparar mönster i företagskunskapen och kan skapa separat förslag om ett arbetssättsförsök. | Internt granskningsunderlag |
| `playbook_kickoff_suggestion` | Skapar kontrollpunkt på projektet och kan koppla projektet till ett aktivt försök. | Internt granskningsunderlag |
| `operating_experiment_proposal` | Startar ett internt försök med hypotes, åtgärd, skyddsregler och mätetal. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `operating_experiment_readout` | Beslutet fortsätter försöket eller gör arbetssättet till standard; kräver uttryckligt beslut från egen sida. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `missad_intakt` | Ger granskningsinformation, ingen faktura eller automatisk intäktsåtervinning. | Hänvisning till webbens specialvy; inget generiskt utförande; mobilresa återstår |
| `manual_project_create` | Reparations-/granskningskort, skapar inte projekt via den generiska hanteraren. | Hänvisning till webbens specialvy; inget generiskt utförande; mobilresa återstår |
| `jobbpass_proposal` | Kräver separat urval/granskning/publicering. Köbeslut ska inte publicera ett jobbpass. | Hänvisning till webbens specialvy; inget generiskt utförande; mobilresa återstår |
| `installation_register` | Kräver separat bekräftelse av installationer rad för rad; köp innebär inte installation. | Hänvisning till webbens specialvy; inget generiskt utförande; mobilresa återstår |
| `review_auto_invoice` | Skickar faktura trots klassningen REVIEW_REQUIRED. | Stopp – komplett granskning återstår |
| `four_eyes_quote` | Återställer offerten till utkast efter granskning och skickar intern push till skaparen. Skickar inte offerten till kunden. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `four_eyes_project_close` | Avslutar projektet; kan automatiskt skapa och skicka faktura som följd. | Stopp – komplett granskning återstår |
| `deal_flow_site_visit` | Granskningskort utan specifik utförandehanterare i denna route. | Hänvisning till webbens specialvy; inget generiskt utförande; mobilresa återstår |
| `lead_review` | Aktiverar lead, skapar pipelineaffär, kan skicka internt SMS och triggar lead_received-automation. Avvisa markerar lead som lost. | Stopp – komplett granskning återstår |
| `time_attestation` | Attesterar incheckning och skapar godkänd, fakturerbar tid. Befintliga databasfel ignoreras; flera skrivningar saknar företagsscope. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `tidrapport_forslag` | Skapar godkänd, fakturerbar tid med vald person/projekt/datum/minuter. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `checklist_forslag` | Skapar projektchecklista från mallpunkterna. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `egenkontroll_foto` | Markerar föreslagna checklistpunkter och kopplar fotoreferens. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `egenkontroll_avvikelse` | Kvitterar avvikelsen; avvikelsen behöver fortsatt saklig hantering. | Uttrycklig läskvittens; avvikelsen markeras inte åtgärdad |
| `job_report` | Förbereder verkliga PDF-bytes och exakt mejl, visar alla sidor och bifogar den granskade PDF-filen efter beslut. | Ny gransknings-/leveransväg integrationstestad; legacyunderlag, återställning av okända leveranser och iPhone-slutprov återstår |
| `karin_deadline` | Kvitterar att skyldigheten har setts; innebär inte att något har lämnats in. | Kvittens |
| `cert_expiry_reminder` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `low_stock_alert` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `agent_insight` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `monthly_review` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `monday_brief` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `quote_signed` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `ata_signed_notification` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `ata_declined_notification` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `profitability_warning` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `meeting_summary` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `meeting_followup` | Skapar intern teamuppgift med beskrivning, källcitat, prioritet och eventuell deadline. | Internt granskningsunderlag |
| `project_log_note` | Sparar samtalssammanfattning i projektets dagbok via gemensam skrivfunktion. | Internt granskningsunderlag |
| `customer_fact` | Sparar kundfakta/löfte och kan ersätta tidigare fakta samt sätta bevakad deadline. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `agent_memory_confirmation` | Bekräftar en redan lagrad minnesrad; det faktiska minnet måste läsas och visas först. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `autonomy_revoked` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `team_intro` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `expectation_drift_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `promise_deadline_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `mandate_paused_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `external_delivery_failure_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `payment_failed_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `kort_gar_ut` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |

## Verifiering i denna utökning

- Riktade kontrakt-/regressionsprov för granskning, kvittenser, idempotenta skrivningar, paket, påminnelsebelopp och automationstexter. Testantal anges i PR-beskrivningen efter sista körningen; antalet prov är inte antalet slutprovade korttyper.
- Faktisk POST-route med minnesdatabas och förbjudet nätverk: behörighet, läsande preview, ändrad text, köning och dubbelklick.
- Faktisk påminnelsefunktion med mockade sändtjänster: accepterat och avvisat e-postsvar, fel vid databasuppdatering och inget utskick när fakturan inte kan verifieras.
- **Riktig Chromium:** full text, första klicket utan utförande, avbryt, separat bekräftelse, renderat HTML-dokument, obligatorisk granskningsmarkering, 403 på underlag och isolerad e-post-HTML. Alla nätverksanrop är lokalt ersatta; ingen produktionssession används.
- **11 mobilprov:** verklig granskningskomponent och nätverksadapter, med mockade Native-primitiver och sändare. Nytt prov kontrollerar bildladdning, granskningsmarkering och bildfel. Ingen TestFlight-build har byggts/slutprovats i detta arbete.
- Backendens typkontroll har fortsatt tre befintliga fel kring den saknade lib/portal/review. Inga nya typfel i senaste kontrollerade ändringar.
- Ingen merge, produktionsdriftsättning eller verklig kundhandling har gjorts. Den fulla 77-typsmatrisen är **inte** godkänd som fungerande från början till slut.

## Manuella slutprov efter färdigställande och ny build

1. Öppna Hanna-kampanj från Hem och Godkänn. Kontrollera hela texten, alla mottagare och köknapp.
2. Avbryt och kontrollera att kortet är kvar och ingen kampanj är köad.
3. Ändra text, gå vidare till granskning, avbryt och återuppta. Ingen ändring får skickas förrän sista beslutet.
4. Bekräfta med isolerad testsändare. Jämför mottagare och text i granskning, kö och utgående meddelande.
5. Upprepa med lång text, många mottagare, dålig uppkoppling, bakgrundsläge och kontobyte.
6. Kör varje återstående typ från matrisen när dess fulla granskning är byggd, inklusive Avvisa och misslyckad/delvis lyckad handling.

### Direktstart 8 september — jobbrapportens felkvittens

Jobbrapporten verifierar nu projekt och aktuell kundadress inom företaget före PDF-uppladdning. Ett fel vid registrering av kort/dokument, signering av PDF-länk eller mejl accepteras inte längre som ett lyckat utskick. Ett accepterat mejl vars historik inte kunde sparas redovisas som delvis utfört med uttrycklig information att inte skicka igen. Projekt/kunduppslag vid förberedelse är företagsskopade; fältrapporternas id hämtas så fotoassociationen kan fungera.

Verifiering: nio isolerade scenarier i `node tests/approvals/job-report-harness.cjs` testar faktisk hjälpkod med mockad databas, PDF och mejltjänst. Befintligt route-harness godkänt. TypeScript har samma tre tidigare portal/review-fel, inga nya. Ingen verklig leverans eller iPhone-verifiering.

Återstår: exakt dokument- och mejlförhandsvisning, versionsbindning, foton i PDF och idempotent leverans med återupptagning. Kortets befintliga spärr kvarstår tills hela flödet är verifierat. Övriga delar i nattplanen är fortfarande öppna.

### Nattpass 8 september — granskat dokument till beständig leveransjournal

Ovanstående direktstartsstatus för jobbrapporten är nu delvis ersatt av följande kod och prov. **Alla fem arbetsdelarna är fortfarande inte klara.**

- Jobbrapporten har en verklig ersättningsväg: läsande förberedelse av full PDF och exakt mejl, synlig mottagare/avsändare/svarsadress, uttryckligen inga kopior/BCC/SMS/faktura/pipelineändringar. PDF-filen skickas som bilaga i stället för en tidsbegränsad länk. Granskningsbeviset binder hash av faktiska PDF-bytes plus hela mejlkuvertet. Exekveraren använder samma förberedda objekt, inte en ny rendering efter beslutet.
- Autentiserad `GET /api/approvals/[id]/document?version=...` kontrollerar företag, beslutsbehörighet och version. Ändrat dokument ger 409. Jobbrapporten kräver samma `create_invoices`-befogenhet som offert/fakturautskick; äldre `routing_role=any` kringgår inte kontrollen.
- Ett faktiskt Chromium-prov hittade tom PDF-ruta i sandboxen. Därför rasteriseras nu den verkliga PDF-filen server-side till scriptfria sidbilder. Webb/app kan visa dem utan PDF-plugin. Sidbilder och obligatorisk granskningsmarkering är provade i Chromium; rå PDF accepteras inte längre av webbgranskaren. Stora bildsidor JPEG-komprimeras, hela svaret begränsas till cirka 4 MB efter base64; högst 30 sidor.
- jsPDF använder stabilt dokument-ID och datum. Det gamla autoTable-anropet fungerade inte med den installerade versionen och är rättat. Långa arbets-/avvikelsetexter sidbryts före sidfoten. Verifierade PNG/JPEG-foton från företagets privata `project-files`-sökvägar ingår nu i PDF. Externa URL:er/andra företags sökvägar nekas före hämtning; max sex foton, 5 MB per foto och 15 MB PDF.
- `document-delivery.ts` sparar en stabil dokumentrad per kort, PDF-sökväg, kuvert, version, försök och leveransläge. Atomiskt anspråk före uppladdning/utskick hindrar parallella sändare. Tidigare accepterat utskick återger sin referens; säkert avvisat försök kan återföras med samma underlag. Timeout/okänt svar/förlorad slutkvittens leder aldrig till automatiskt omutskick. Resends tidsbegränsade idempotensnyckel är extra skydd, inte det enda skyddet.
- `sendEmail` kan bära bilaga och idempotensnyckel; saknad leveransreferens/5xx/nätverksfel är okänt utfall, inte framgång. Ingen dold pipelineändring aktiveras i denna dokumentväg. Kortets vanliga kvittens och dokument-/meddelande-ID sparas och är kontrollerade efter återöppning.
- Den saknade `lib/portal/review.ts` hämtades **oförändrad från aktuell main**, blob `5d91d5cf509f32dba56b859b7ddf7b74655edb21`. De tre tidigare typfelen är därmed borta; ingen main-merge gjordes.

Verifiering i detta pass:

- `npm run test:approval-documents`: fem körbara sviter för faktisk mejladapter, beständig dokumentjournal, verklig PDF-förberedelse, faktiska approval-/document-rutter och riktig Chromium-rendering. Databas och leverantörer är isolerade/mockade; inga riktiga kundhandlingar.
- Dokumentproven täcker bland annat samtidiga klick, accepterat återspel, avvisat återförsök, borttappad kvittens, okänt leveranssvar, ändrade bytes/mottagare, CAS-konflikt, fel vid uppladdning, 401/403/409, ändrat granskningsbevis och samma kvittens efter återöppning.
- 97 riktade Playwright-prov passerade (tidigare 79 plus hela routingsviten, inklusive det nya dokumentbehörighetsprovet). Testantalet är inte antal slutprovade korttyper.
- Befintliga route-, reminder-, job-report- och Chromium-harness passerade. Tre PDF-varianter granskade visuellt: vanlig rapport, syntetiskt foto och lång text; alla 1 200 upprepade textmarkörer finns kvar i tresidorsprovet.
- `npx tsc --noEmit` är nu rent. Nexts produktionskompilering och typkontroll passerade efter återställningen av portalmodulen; slutlig build-/tracingstatus redovisas i PR-beskrivningen.
- `pdfjs-dist` 6.3.289 och `@napi-rs/canvas` 1.0.8 är versionslåsta, med lockfil och server-side tracing. Kräver Node >=22.13. Kontrollera paketering/storlek och native-binär i Vercel-preview före release. Ingen produktionsinställning har ändrats.

Fortsättningspunkt, i beställd ordning:

1. **Del 1 kvar:** offert/faktura/Fortnox/e-faktura behöver fortfarande en motsvarande komplett förberedelse och exekvering. Utgå från `app/api/quotes/send/route.ts`, `lib/invoices/send-invoice.ts`, `lib/quotes/quote-email.ts`. Återanvänd principen i dokumentjournalen, men den är ännu jobbrapportsspecifik (bilagans namn) och ska inte kopplas blint till ekonomiflöden. Jobbrapportens äldre publika fotosökvägar, underlagsredigering och gamla försök utan journal behöver riktiga reparationsvyer. Okänt leveransläge behöver leverantörsavstämning; att förhindra omutskick är inte färdig återställning. Om kortkvittensen inte kunde sparas behöver även bulkhistoriken återhämta journalens besked.
2. **Del 2 kvar:** bokning/platsbesök/projektavslut inklusive dynamiska meddelanden och fakturaval.
3. **Del 3 kvar:** betalnings-/leadföljder och resterande automationer, med nya konkreta godkännanden för sent genererade kundutskick.
4. **Del 4 kvar:** återförsök per paketdel, kampanjkö till sändare och sammanhängande historik för alla övriga typer. Den nya dokumentjournalen täcker bara dokumentvägen ovan.
5. **Del 5 kvar:** native specialvyer och TestFlight. Befintlig mobilgranskare kan ta emot den scriptfria dokumentvisningen, men ingen iPhone-/WebView-slutverifiering har gjorts i detta pass. Mobil-PR #3 och build 12 är oförändrade.

Tekniska källor för nya integrationsdetaljer: [Resend idempotens](https://resend.com/docs/dashboard/emails/idempotency-keys), [Resend bilagor](https://resend.com/docs/dashboard/emails/attachments), [PDF.js exempel](https://mozilla.github.io/pdf.js/examples/). Installerade typdefinitioner och isolerade körningar användes för exakta anrop. Supabases changelog kontrollerades; ingen schemaändring eller produktionsskrivning gjordes.
