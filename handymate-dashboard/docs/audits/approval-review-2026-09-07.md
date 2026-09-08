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
- Paket visar valda SMS-, boknings- och materialdelar och ger kvittens per delåtgärd. Informationsdelar räknas inte som utförda handlingar. Säkert misslyckade delar kan köras om utan att redan lyckade delar körs igen; osäkert SMS-läge spärrar omsändning.
- Webbens dokument måste laddas och markeras som granskade före bekräftelse. Mobilen har motsvarande bild-/dokumentvisning och spärr, verifierad med komponentprov; iPhone-slutprov återstår.
- En gemensam serverkvittens skiljer noterat, sparat, köat, accepterat utskick, delvis utfört och misslyckat. Kvittensen sparas i kortets utförandespår och används i de generiska webb- och mobilvägarna. Full kontroll av alla historikytor återstår.
- Tilldelning och tidsattest har företagsfilter och kontrollerade skrivresultat. Ett återförsök efter misslyckad attestering återanvänder samma tidrad. Stabil artefaktidentitet införs även för kundfakta, checklistor, tidsförslag, uppgifter, materialrader, projektlärdomar och försöksrader.
- Fakturapåminnelsens sändare kontrollerar fakturans företag, status och påminnelseräknare före utskick. Resends returnerade fel räknas inte längre som skickat. Misslyckad lagring av avgifter, påminnelsestatus eller historik redovisas som delvis utfört.
- Avvisning rapporterar fel i följdändringar. Intern offertgranskning kontrollerar uppdateringen och skickar en riktad intern notis; ett misslyckat mottagaruppslag får inte bli en notis till hela företaget.
- Generellt återförsök av en redan delvis utförd handling stoppas tills det befintliga resultatet kontrollerats. Ett säkert stopp ersätter inte ett färdigt flöde för återförsök per del.

## Återstående brister – hindrar generell utrullning

1. **Offert-, faktura- och jobbrapportsutskick:** färdigt dokument, exakt meddelande, alla mottagare/kanaler och dokumentversion behöver bindas i samma beslut. Fakturans Fortnox-/e-fakturagren måste ingå. Jobbrapporten skapar faktiskt PDF och kan mejla kunden; den tidigare rapportens beskrivning som en kvittens var fel och är korrigerad här.
2. **Bokning, platsbesök och projektavslut:** generiska tidsförslag, signerad-offertbokning, platsbesök och projektavslut har nu specifika flöden. Beständigt återförsök av varje fristående avslutsföljd återstår.
3. **Betalning och lead:** båda har nu tydliga, signerade följdval och sent skapade kund-/internutskick blir separata kort. Beständig återföring av enskilda workflow-/regelföljder och övriga automationsvarianter återstår.
4. **Övriga automationer och specialvyer:** varje åtgärdsvariant behöver ett eget fullständigt kontrakt. Webbhänvisningar för intäktsfynd, jobbpass, installationer och liknande innebär ingen färdig mobilresa. Mobilen saknar flera motsvarande vyer; dessa kort blir kvar.
5. **Historik och återförsök:** paketdelar och kampanjmottagare har nu beständiga delutfall, selektiv återföring respektive spärr vid osäkert leveransläge. Hela historik-/aktivitetskedjan och motsvarande stöd för övriga flerledade flöden är inte slutprovade.
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
| `confirm_payment` | Visar aktuell faktura, kund, projekt, belopp, ROT/RUT, betalningsövergång och tre följdval. Registrerar betalningen; kundbesked blir separata granskningskort och payment_received-regler tvingas till nya godkännanden. | Versionsbunden granskning och delkvittens; beständig betalningsjournal/per-följd-återförsök återstår |
| `create_booking` | Skapar bokning via boknings-API:t. Nedströms bokningsregler och notiser behöver granskas. | Stopp – komplett granskning återstår |
| `create_quote_draft` | AI genererar och sparar offertutkast; inget kundutskick i denna hanterare. | Internt granskningsunderlag |
| `create_ata_draft` | AI genererar och sparar ÄTA-utkast, med offertutkast som reservväg när projekt saknas. | Internt granskningsunderlag |
| `create_invoice_from_report` | Kvitterar och returnerar navigation till fakturor; skapar ingen faktura. | Hänvisning till webbens specialvy; inget generiskt utförande; mobilresa återstår |
| `autopilot_package` | Verifierar och fryser valda bokningar, kund-SMS och materialrader mot aktuella företagsskopade rader. Projektinformation är en nollhandling. Sparar utfall per del; återför endast säkert misslyckade delar och spärrar osäkra SMS-svar. | Signerad delgranskning, idempotent bokning/material och sammanhängande historikkvittens; verklig kalender/SMS-miljö återstår |
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
| `propose_booking_times` | Hämtar aktuella kalenderluckor, verifierar kund/lead och visar exakt SMS; skapar ingen bokning. | Versionsbunden granskning, beständig evidens och säkert SMS-återförsök; verklig leverantör/app återstår |
| `propose_site_visit` | Förbereder aktuella tidsförslag, verifierar kunden och visar exakt SMS; skickar samma frysta tider/text utan kalender- eller projektändring. | Versionsbunden granskning, beständig evidens och route-integrationstest; verklig leverantör/app återstår |
| `reschedule_request` | Verifierar aktuell kund/lead och eventuell befintlig bokning, hämtar nya kalenderluckor och skickar exakt granskat SMS. Bokningen flyttas inte; svaret hanteras separat. | Versionsbunden granskning, beständig evidens och säkert SMS-återförsök; verklig leverantör/app återstår |
| `new_booking_request` | Vid quote_signing: väljer första aktuella lediga timmen, visar bokning/projekt/fakturaföljd och exakt bekräftelse-SMS, skapar samma bokning och skickar SMS först efter lyckad bokning. Övriga källor skickar verifierade aktuella tidsförslag utan kalenderändring. | Båda grenarna versionsbundna och route-integrationstestade; verklig kalender/app återstår |
| `dispatch_suggestion` | Tilldelar person på bokning/arbetsorder. Befintlig hanterare ignorerar databasfel och saknar företagsscope på uppdateringen. | Verifierat underlag och granskningsbeslut; slutprov återstår |
| `publish_microsite` | Publicerar webbsidan, vilket gör innehållet externt tillgängligt. | Stopp – komplett granskning återstår |
| `invoice_reminder` | Skickar SMS och eventuellt e-post samt uppdaterar påminnelseavgift/ränta och historik. | Granskning av kanaler och avgifter; kontrollerad delutfallskvittens |
| `automation` | Kör en underliggande automationsåtgärd med konfiguration; kan ge andra externa effekter. | SMS/e-post granskas; create_approval kvitteras; reject_lead har aktuell leadpreview, följdval och separat kund-SMS; andra varianter återstår |
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
| `four_eyes_project_close` | Visar aktuellt projekt, kund, ansvarig, ekonomiskt fakturaunderlag och tre uttryckliga val. Avslutar projektet, skapar vid val endast fakturautkast samt separata granskningskort för kunduppföljning, internt fakturabesked och automationshandlingar. | Versionsbundet delval, företagsscope och faktisk delkvittens i webb/app; beständigt återförsök av en enskild misslyckad avslutsföljd återstår |
| `deal_flow_site_visit` | Granskningskort utan specifik utförandehanterare i denna route. | Hänvisning till webbens specialvy; inget generiskt utförande; mobilresa återstår |
| `lead_review` | Visar aktuell lead/kund, befintlig affär, intern SMS-text och tre följdval. Aktiverar leaden; internnotis blir ett separat granskningskort och lead_received-regler tvingas till nya godkännanden. Avvisa markerar lead som lost. | Versionsbunden granskning, företagsscope och idempotenta affär/SMS-följder; per-regel-återförsök återstår |
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
- `npx tsc --noEmit` är nu rent. Full `NEXT_TELEMETRY_DISABLED=1 npm run build` avslutades med exit 0 på slutlig kod, inklusive typkontroll, 327 statiska sidor och tracing. Dokumentruttens slutliga trace innehåller PDF-worker, standardfonter och native canvas-binär (52 relevanta filer, inga saknade filer). Befintliga varningar om metadata/dynamisk renderering finns kvar. Ingen Vercel-/produktionsruntime har slutprovats.
- `pdfjs-dist` 6.3.289 och `@napi-rs/canvas` 1.0.8 är versionslåsta, med lockfil och server-side tracing. Kräver Node >=22.13. Kontrollera paketering/storlek och native-binär i Vercel-preview före release. Ingen produktionsinställning har ändrats.

Fortsättningspunkt, i beställd ordning:

1. **Del 1 kvar:** offert/faktura/Fortnox/e-faktura behöver fortfarande en motsvarande komplett förberedelse och exekvering. Utgå från `app/api/quotes/send/route.ts`, `lib/invoices/send-invoice.ts`, `lib/quotes/quote-email.ts`. Återanvänd principen i dokumentjournalen, men den är ännu jobbrapportsspecifik (bilagans namn) och ska inte kopplas blint till ekonomiflöden. Jobbrapportens äldre publika fotosökvägar, underlagsredigering och gamla försök utan journal behöver riktiga reparationsvyer. Okänt leveransläge behöver leverantörsavstämning; att förhindra omutskick är inte färdig återställning. Om kortkvittensen inte kunde sparas behöver även bulkhistoriken återhämta journalens besked.
2. **Del 2 kvar:** bokning/platsbesök/projektavslut inklusive dynamiska meddelanden och fakturaval.
3. **Del 3 kvar:** betalnings-/leadföljder och resterande automationer, med nya konkreta godkännanden för sent genererade kundutskick.
4. **Del 4 kvar:** återförsök per paketdel, kampanjkö till sändare och sammanhängande historik för alla övriga typer. Den nya dokumentjournalen täcker bara dokumentvägen ovan.
5. **Del 5 kvar:** native specialvyer och TestFlight. Befintlig mobilgranskare kan ta emot den scriptfria dokumentvisningen, men ingen iPhone-/WebView-slutverifiering har gjorts i detta pass. De 11 befintliga mockade mobilproven har körts om och passerar. Mobilkoden i PR #3 och build 12 är oförändrade.

Tekniska källor för nya integrationsdetaljer: [Resend idempotens](https://resend.com/docs/dashboard/emails/idempotency-keys), [Resend bilagor](https://resend.com/docs/dashboard/emails/attachments), [PDF.js exempel](https://mozilla.github.io/pdf.js/examples/). Installerade typdefinitioner och isolerade körningar användes för exakta anrop. Supabases changelog kontrollerades; ingen schemaändring eller produktionsskrivning gjordes.

### Fortsättning 8 september — offert-/fakturasändarnas scope och delutfall

Återupptaget från backend `cd5a16babe5f12504985e1236b186f2c194a744f` och mobil `4dbf0bde9b7a16afb24094e497f5cce7fd78b09a`, med oförändrade draft-PR:er och utan samtidiga kodändringar. **Detta färdigställer inte del 1 eller de fem delarna som helhet.** Den signerade dokumentvägen ovan gäller fortfarande bara jobbrapporten.

Implementerat i sändarnas verkliga kod, inte endast inventerat:

- Offertens gamla åtkomstfallback via ett annat företags kontaktmejl är borttagen. Offert, kund och skaparkontakt läses med företagsscope; token- och statusskrivningar är scopade. Ett tokenanspråk som inte sparats får inte skapa ett utskick med en obrukbar länk.
- `lib/quotes/delivery-envelope.ts` samlar verklig SMS-text, varumärkesmejl, To, BCC och svarsadress. Sändvägen använder detta objekt. Valda kanaler och alla kopiemottagare valideras före offert-/länkändring eller första sändningen; `both` faller inte tyst ned till SMS när e-post saknas. Dubbla adresser, radbrytningsinjektion, ogiltiga belopp/avdrag/datum och oläsbara godkännanderegler nekas. Normaliserade mottagarval följer med en fyrögonsbegäran.
- Gmail väljs fortfarande när kopplingen är aktiverad, men ett misslyckat/osäkert försök följs inte längre av ett automatiskt Resend-mejl. Saknad Resend-referens räknas inte som accepterat. Offertsvaret skiljer bekräftad kanal, delvis utfall och obekräftad e-post; misslyckad status-/historiklagring och kastade följdåtgärdsfel syns i kvittensen. Detta är **inte** en beständig offertjournal eller ett säkert manuellt återförsök.
- Fakturans inbäddade kund verifieras inom företaget **före Fortnox**. Portaluppslag/-skrivning är scopade, tokenbyte villkorat och utebliven sparad rad stoppar den efterföljande mejl-/SMS-länken. Bekräftad e-faktura aktiverar inte längre kundportalen i onödan och skickar som tidigare inte extra mejl/SMS. Felkvittensen skiljer överhoppad Fortnox-synk från genomförd synk.
- Fakturamejl utan Resend-ID ger inte längre `email=true`. Efter accepterad leverans granskas både fel och antal uppdaterade fakturarader; status, leveransunderlag och kundhistorik rapporterar sina separata fel utan att förneka det redan accepterade utskicket. Ett annat företags faktura kan inte få denna kvittens skriven. Inga nya databasfält eller produktionsmutationer.

Verifiering:

- `npm run test:approval-economy`: **23 offertscenarier + 12 fakturascenarier**, kör faktisk route respektive faktisk sändorkestrering. Databas, Fortnox, PDF-renderare i fakturaproven, sändare och automationsadaptrar är isolerade/mockade; förbjudet verkligt nätverk. Bland annat fel företag/kund, fyrögonskö utan utskick, fel vid tokensparning, normaliserad BCC, förlorat Gmail-/Resend-svar, saknat meddelande-ID, blandat kanalutfall, Fortnox-nummer i PDF/mejl och bekräftad e-faktura utan extra sändning.
- **170 Playwright-prov passerade, 1 befintligt prov överhoppat**, i approval-review/preview/receipt/artifact/internal-writes/routing, send-invoice-core, invoice-delivery-truth/evidence-manifest, facit-send-invoice-fortnox-first och quote-sender-identity/created-by/open-tracking. Sex nya fakturakvittensprov täcker scope, noll uppdaterade rader samt status-/historik-/manifestfel. Det överhoppade äldre fakturaprovet kvarstår; den nya isolerade köraren ersätter inte ett verkligt Fortnox-slutprov.
- De fem `test:approval-documents`-sviterna kördes om och passerade, inklusive faktisk PDF-rasterisering i Chromium. De 11 mockade mobilproven kördes om och passerade. Antal testfall är inte antal färdigprovade korttyper.
- `npx tsc --noEmit` är rent. Full `NEXT_TELEMETRY_DISABLED=1 npm run build` kördes på slutlig applikationskod och avslutades med exit 0, inklusive 327 statiska sidor och tracing. Befintliga Sentry-/metadata-/dynamisk-rendering-varningar kvarstår.
- GitHubs Vercel-status för föregående head `cd5a16ba` var success vid läsning. Det är inte bevis för att dokumentrutten fungerar i Vercels runtime eller i en riktig iPhone; sådana slutprov återstår.

**Nästa konkreta arbete, fortsatt i beställd ordning:**

1. Koppla offertens nya leveransobjekt till läsande preview och ett versionsbundet slutbeslut som innehåller den verkliga PDF-filen, alla beloppsdetaljer, avsändarval och följdåtgärder. Dagens offertväg har fortfarande dynamiska portal-/signerings-/spårningslänkar och en nedladdningslänk till ett rörligt dokument. `buildQuoteDeliveryEnvelope` är endast förberedande grund, inte färdig granskningsvy.
2. Separera fakturans Fortnox-förberedelse/bokföring, slutligt nummer/OCR, faktisk PDF och kundsändning i beständiga delsteg. **Särskilt öppet:** `lib/invoices/sync-to-fortnox.ts` fångar fortfarande e-fakturafel och kan falla tillbaka till mejl; ett förlorat e-fakturasvar måste avstämmas och får inte skapa en andra leverans. PDF-fallbacken kan fortfarande ändra dokument efter en framtida preview och måste ingå i det frysta underlaget.
3. Bygg leveransjournal/avstämning för offert och faktura innan återförsök exponeras. Kvittensen i det nya offertsvaret återhämtas ännu inte från historik vid förlorat svar; invoice `delivery_failed` skiljer ännu inte alla osäkra leveranser från säkert avvisade. Ingen dubbelsändningsgaranti lämnas för manuellt omklick, Gmail-interna försök, Fortnox eller dessa äldre sändvägar.
4. Synliggör offertens `fireEvent('quote_sent')`, pipeline och affärsskapande samt fakturans projekt-/pipelinesteg. Kastade offertfel syns nu, men funktioner som returnerar ett delutfall utan att kasta behöver egna delkvittenser. Sent genererade utskick ska få nya konkreta granskningar. Fyrögonskortets återgång till utkast behöver ett beständigt versionsbundet mandat så skaparen inte fastnar i en ny likadan begäran.
5. Därefter kvarstår del 2–5 i föregående fortsättningslista: bokning/projektavslut, betalning/lead/automationer, paket/kampanjkö/historik samt kompletta native specialvyer och testbuild. Mobilkod och TestFlight build 12 är oförändrade; ingen publicering, main-merge eller verklig kundhandling har gjorts.

### Fortsättning 8 september — dynamiskt platsbesök och bokning efter signerad offert

Två del-2-flöden har fått verkliga ersättningsvägar. **Del 2 och alla fem delar är fortfarande inte klara.**

- `propose_site_visit` verifierar nu kund och aktuellt telefonnummer inom företaget, hämtar högst tre aktuella kalenderförslag före beslutet och visar ansvarig, varje tidsintervall, exakt SMS samt uttryckligen att ingen bokning, kalender- eller projektändring görs. Slutbeslutet använder endast det signerade underlaget; ändrade tider eller mottagare kräver ny preview. Exakt mottagare, text, tider och följdbeskrivning sparas som `review_evidence` och återges med utfallet.
- `new_booking_request/source:quote_signing` verifierar aktuell kund, signerad/accepterad offert, företagets arbetstider, befintliga bokningar och eventuell projektkoppling. Förhandsvisningen väljer första verkligt lediga entimmesluckan på kundens önskade dag och visar start/slut, ansvarig, projekt-, kalender-, SMS- och fakturaföljd. Den exakta bokningsraden och SMS-texten binds till beslutet. Bokningen skapas före SMS; inget fakturautskick görs. Om kalendern ändras mellan preview och beslut blir token ogiltig och ett nytt beslut krävs.
- Bokningsanteckningen bär fortsatt stabil kortmarkör. Dubbelklick hittar samma bokning; en befintlig bokning med annan starttid nekas i stället för att få en missvisande SMS-kvittens. Faktiska delar sparas i `execution_result`, inklusive granskningsbeviset.
- Kundens offentliga offertvy säger nu sanningsenligt att veckorna har utrymme att börja och att exakt tid bekräftas senare; den lovar inte att de visade datumen redan är bokningsbara klockslag.

Verifiering utan produktionsdata eller riktiga sändare:

- Faktisk approval-route i minnesharness: läsande platsbesökspreview, ändrade kalendertider som ogiltigförklarar token, exakt skickat SMS, beständig evidens, främmande/saknad kund och saknade tider. Samma harness provar signerad offert, aktuellt ledigt intervall, exakt boknings-POST, projekt-/fakturaföljd, SMS efter bokning och nekad icke-signerad offert.
- **140 riktade Playwright-prov passerar**, inklusive samtliga valda approval-kontrakt, review/preview/receipt/routing och Starttiden. `npm run test:approval-economy` passerar 23 offert- och 12 fakturascenarier. `npm run test:approval-documents` passerar sina fem körbara sviter. `npx tsc --noEmit` är rent. Full Next-produktionsbuild passerar med 327 statiska sidor; befintliga Sentry-/metadata-/dynamisk-rendering-varningar kvarstår.
- Inget verkligt SMS, kalenderinlägg, kundutskick, Fortnox-anrop eller produktionsskrivning gjordes. Ingen iPhone-/TestFlight-verifiering har gjorts och build 12 är fortsatt oförändrad.

Nästa konkreta fortsättningspunkt:

1. Del 1 är fortfarande prioriterad: fryst offert-/fakturadokumentversion, komplett ekonomisammanställning, To/CC/BCC/kanal, Fortnox/e-faktura och beständig återförsöksjournal.
2. I del 2 har `four_eyes_project_close` nu uttryckliga val och separata utfall. Beständigt återförsök av en misslyckad följd samt generiska `propose_booking_times`/`reschedule_request` med samma verifierade kundscope/evidens som platsbesöket återstår.
3. Del 3–5 återstår enligt planen: betalning/lead/automationers följder, paketdelar och avstämningsbara återförsök/historik, därefter fullständiga native specialvyer och en ny verkligt provad TestFlight-build.

### Fortsättning 8 september — projektavslut med uttryckliga delval

`four_eyes_project_close` har nu en verklig gransknings- och exekveringsväg i stället för det tidigare generiska stoppet:

- Den läsande previewn verifierar projekt, kund, kopplad affär och ansvarig inom företaget. Den visar status-/affärsföljd, efterkalkyl/debrief, jobbpass/installationsförslag samt fakturans samtliga rader, exklusive moms, moms, ROT/RUT och vad kunden betalar.
- Beslutet har tre signerade val: skapa fakturautkast, förbered kunduppföljning och kör avslutsautomationer. Endast serverns visade val-id:n accepteras. Ändrat projekt, kund, ansvarig eller fakturaunderlag kräver ny preview.
- Projektavslutet kan inte längre skicka fakturan direkt även om `auto_invoice_on_complete` är på. Det skapar ett utkast och ett separat `review_auto_invoice`-kort. Ägarens fakturabesked skapas som ett eget `send_sms`-kort med exakt text och verifierat internt nummer. Misslyckad lagring av något av dessa kort redovisas som ett partiellt fakturautfall.
- `job_completed` tvingar nu varje faktisk regelhandling genom ett nytt approval-kort även om regeln annars har intjänad autonomi. En regel vars egen handling endast är `create_approval` får fortsatt skapa just förslaget. Motorn returnerar antal matchade, väntande, skapade, överhoppade och misslyckade regler; projektkvittensen återger detta och varje annan avslutsföljd separat.
- Samma delval stöds i webbens riktiga dialog och i den native granskningsmodalen. Appen skickar valt/avvalt per signerad choice-id; bakgrundsläge, kontobyte och avbryt lämnar fortsatt kortet orört.

Verifiering utan produktionsdata eller riktiga sändare:

- Faktisk approval-route i minnesharness provar full projektpreview, aktuell ansvarig, ekonomisammanställning, valt/avvalt, staleness, delkvittens och det efterföljande interna SMS-kortet. Riktig lokal Chromium-dialog provar choice-checkboxar och exakt wire-format.
- 60 riktade Playwright-prov för review, receipt, kanoniskt projektavslut, fyra ögon och automationsgrindar passerar. Därutöver passerar faktisk route- och Chromium-dialog. `npm run test:approval-economy` passerar 23+12 isolerade scenarier och `npm run test:approval-documents` samtliga fem körbara sviter. Backendens `npx tsc --noEmit` är rent.
- Mobilens riktiga granskningskomponent och adapter passerar 13 mockade interaktions-/livscykel-/protokollfall; riktad TypeScript-kontroll är ren. Detta är inte ett iPhone- eller TestFlight-slutprov. Build 12 är oförändrad.

Kvar i beställd ordning: färdig versionsbunden offert/faktura/Fortnox-journal; återförsök per avslutsföljd; betalning/lead och återstående automationsåtgärder; paket/kampanjsändare/sammanhängande historik; därefter återstående native specialvyer och en ny verkligt provad TestFlight-build. Inga kundutskick, produktionsskrivningar, merges eller driftsättningar gjordes.

### Fortsättning 8 september — generiska tidsförslag och ombokningsförslag

De tre vanliga Matte-varianterna `propose_booking_times`, `reschedule_request` och `new_booking_request` använder inte längre kundnummer, fritext eller tider direkt ur det gamla kortets payload:

- Previewn verifierar aktuell kund eller lead inom företaget, mottagarens nuvarande telefonnummer och företagets avsändare. Ett oregistrerat eller främmande mål kan inte skickas till.
- Högst tre aktuella luckor hämtas från kalendern före beslutet. Den gamla AI-texten och gamla `available_slots` används inte som sändunderlag. Exakt mottagare, SMS och ISO-intervall binds till signaturen; ändrade luckor kräver ny preview.
- Vid ombokningsförslag verifieras angiven befintlig bokning, ansvarig och projekt inom företaget och visas i granskningen. Handlingen är fortfarande ett tidsförslag: den flyttar ingen bokning, ändrar ingen ansvarig/projektstatus och inväntar ett separat kundsvar.
- Exekveraren tar bara emot den signerade `executionPayload`; den tidigare vägen byggde om SMS:et från den gamla payloaden. Mottagare, text, tider, befintlig bokning och följdbeskrivningar sparas som `review_evidence` tillsammans med den vanliga kvittensen.
- Efter ett säkert avvisat SMS-försök visar återförsök samma mottagare, text och tider och sänder endast den misslyckade SMS-delen. Nya kalenderluckor ersätter inte tyst det granskade försöket. Ett förlorat leverantörssvar ger i stället en beständig partiell kvittens med omsändningsspärr; ett lyckat eller osäkert utförande får inte skickas om via denna väg.

Verifiering: den faktiska approval-routen kördes med isolerad databas, kalender och SMS-adapter. Proven täcker gammal tid som ersätts före första beslutet, token som blir ogiltig när kalendern ändras, aktuell bokning/ansvarig/projekt, leadmottagare, saknat/främmande mål, definitivt leverantörsfel, beständig felkvittens, exakt återförsök trots senare kalenderändring samt förlorat leverantörssvar utan omsändning. `npx tsc --noEmit` är rent. Inga riktiga meddelanden, kalenderändringar eller produktionsskrivningar gjordes.

Nästa fortsättningspunkt är del 3: `confirm_payment`, `lead_review` och de återstående automationsvarianternas verkliga följder samt separata granskningskort för kundutskick som uppstår först efter huvudhandlingen. Del 1:s dokument-/Fortnox-journal och del 2:s per-följd-återförsök är fortfarande öppna och får inte beskrivas som färdiga.

### Fortsättning 8 september — betalning och lead med synliga följder

Två del-3-flöden har nu riktiga, signerade följdval i stället för att dölja kund- och automationshandlingar bakom huvudbeslutet. **Del 3 och helheten är fortfarande inte klara.**

- `confirm_payment` hämtar aktuell företagsskopad faktura, kund och projekt. Previewn visar fakturabelopp, registrerat belopp, ROT/RUT-avdrag, återstående Skatteverksbelopp och resulterande status. Ändrad faktura, kund eller projekt ogiltigförklarar underlaget.
- Betalningsbeslutet har tre val: uppdatera affär/projekt, förbered kundbesked och kör `payment_received`-regler. Den granskade vägen stänger av det gamla direkta smarta kundutskicket. Portal-/tackmejl och omdömes-SMS skapas med exakt mottagare och text som två separata granskningskort; inget av dem skickas vid betalningsbeslutet. Regelhandlingar tvingas till nya godkännanden.
- `lead_review` visar aktuell lead/kund, källa, beskrivning, status, befintlig affär och exakt internnotis. Beslutet väljer separat affär, internnotis och `lead_received`-regler. Lead- och affärsuppslag samt statusändring är företagsskopade. Befintlig affär återanvänds och internnotisen blir ett separat `send_sms`-kort; inget SMS skickas av leadbeslutet. Regelhandlingar tvingas till nya godkännanden.
- Båda flödena redovisar verkligt utfall per följd i kortkvittensen. Barnkort har stabila id:n per huvudkort; återkörning återanvänder dem. Ett betalningskort för en redan helt betald faktura kvitterar detta utan ny betalning eller följdhandling.

Verifiering med minnesdatabas och ersatta leverantörer:

- Den faktiska approval-routen provar aktuell preview, ekonomiska belopp, tre val, ändrat underlag, valt/avvalt, företagsscope och detaljerad kvittens för betalning och lead.
- Den faktiska betalningskärnan provar ROT-övergång till `customer_paid`, två exakta barnkort, inga direkta kundsändare, tvingade regelgodkännanden och återkörning utan dubbla barnkort.
- Den faktiska leadkärnan provar statusändring, affärsskapande, separat intern-SMS-granskning, tvingade regelgodkännanden, främmande företag samt återkörning utan dubbel affär eller dubbelt SMS-kort.
- `npx tsc --noEmit` är rent. Inga riktiga meddelanden, automationshandlingar eller produktionsskrivningar gjordes.

Nästa fortsättningspunkt är återstående automationsvarianter samt del 4: beständig deljournal och återförsök för endast misslyckade följder, kampanjkö till sändare och samma kvittens i omedelbart svar, historik och återöppning. Del 1:s ekonomidokument/Fortnox-journal och del 2:s följdvisa återförsök är fortsatt öppna. Mobilens TestFlight build 12 är oförändrad.

### Fortsättning 8 september — paketdelar och selektivt återförsök

`autopilot_package` har nu en exekveringsbunden ersättningsväg för samtliga registrerade deltyper i paketproducenten:

- Kund-SMS hämtar kundens aktuella telefon inom företaget och visar exakt text/mottagare. Ett bekräftat leverantörsavslag kan återföras; ett kastat eller saknat leverantörssvar lagras som osäkert och spärrar omsändning.
- Bokningsdelen verifierar aktuell kund, projekt och start/slut före beslut, visar kalender-/projektföljden och skickar inget kundmeddelande eller faktura. En stabil kort-/delmarkör sparas i bokningen. Vid förlorat API-svar hittas samma bokning före ett nytt POST; uppslagsfel blockerar för att undvika dubbla kalenderposter.
- Materialdelen verifierar aktuellt företagsskoppat projekt och varje namn/antal/pris. Varje rad använder stabil artefaktidentitet, så en delvis misslyckad materialdel kan återupptas utan dubbla rader.
- `execution_result.results` bär ett separat beständigt utfall per del. Vid retry skickas bara säkert misslyckade delar till exekveraren; lyckad bokning/SMS/material, informationsdelar och valda bort delar följer med oförändrade i den samlade kvittensen och körs inte igen. Samma sparade kvittens läses av historikkomponenten efter återöppning.

Verifiering: faktisk approval-route med minnesdatabas och mockad boknings-/SMS-adapter provar aktuellt mottagarnummer, full bokningspreview, lyckad bokning kombinerad med avvisat SMS, beständiga delresultat, retry av endast SMS, oförändrat antal bokningar samt osäkert SMS-svar med spärr. 90 riktade regressionsprov och `npx tsc --noEmit` passerar. Inga riktiga bokningar, SMS eller produktionsskrivningar gjordes.

Del 4 är ännu inte komplett: kampanjköns faktiska sändarjobb och förlorade svar ska provas och övriga flerledade flöden behöver samma deljournal. Del 1:s offert/faktura/Fortnox-journal, del 2:s fristående avslutsföljder, återstående automationsvarianter och del 5:s native specialvyer/TestFlight återstår.

### Fortsättning 8 september — kampanjkö till faktisk sändare

Kampanjkedjan efter Hannas köade kort har nu ett isolerat prov av den verkliga sändrutten och följande skydd:

- Varje mottagarrad anspråks atomiskt från `pending` till `sending`. Parallella cron-/webbanrop kan läsa samma lista men bara en arbetare får anropa SMS-leverantören för respektive mottagare.
- Varje mottagare använder en stabil sändidentitet baserad på kampanj och mottagarrad genom den centrala SMS-grinden. Redan loggad leverans återanvänds i stället för att skickas dubbelt.
- Bekräftat leverantörssvar sparas som `sent` eller `failed`. Ett kastat anrop eller svar utan HTTP-status sparas som `unknown`; kampanjen får `needs_reconciliation` och får inte plockas upp av cron igen. En andra anropning skickar inte om terminala eller osäkra mottagarrader.
- Kampanjens levererade/misslyckade antal och slutstatus räknas från de beständiga mottagarraderna. Blandat utfall blir `partial`, inte falskt `sent`. Ett parallellt pågående anrop lämnar kampanjen i `sending` i stället för att skriva en för tidig slutstatus. Kampanjlistan visar nu `Delvis skickad`, `Leverans måste kontrolleras` och `Misslyckad` i stället för tom status.
- Cronjobbet kräver nu både HTTP-framgång och `success:true`. Det skriver inte längre över en detaljerad `partial`/`needs_reconciliation` med ett generiskt `failed`.

Verifiering: `node tests/approvals/campaign-send-harness.cjs` kör den faktiska sändrutten med minnesdatabas och ersatt SMS-leverantör. Det provar blandat accepterat/avvisat utfall, stabila mottagaridentiteter, oförändrat antal sändanrop vid återöppning, förlorat leverantörssvar, beständig avstämningsstatus och omsändningsspärr. `npx tsc --noEmit` passerar. Inget verkligt SMS eller produktionsanrop gjordes.

Del 4 är förbättrad men inte generell: en operatörsvy för att avstämma `unknown` mot 46elks och explicit återställa ett säkert avvisat kampanj-SMS saknas, liksom deljournal för övriga sammansatta typer. Nästa arbete är återstående automationsvarianter och därefter mobilens kompletta specialvyer. Ekonomiflödenas fulla versions-/Fortnox-journal och fristående projektavslutsretry är fortfarande blockerande öppna punkter.

### Fortsättning 8 september — `reject_lead` utan dolt kundutskick

- Previewn verifierar aktuell lead inom företaget och visar nuvarande/ny status, telefon och exakt interpolerad avvisningstext. Ett uttryckligt val styr om ett separat SMS-förslag ska skapas.
- Huvudbeslutet markerar leaden förlorad men skickar aldrig SMS. Om kundbesked valts skapas ett stabilt separat `send_sms`-kort med exakt mottagare/text; resultatet för status och följdkort visas var för sig i kvittensen.
- Även en autonom `reject_lead`-regel har ändrats från direkt SMS till ett konkret granskningskort, så produktfunktionen bevaras utan att kundutskicket göms. Ett fel när följdkortet sparas redovisas efter att leadstatusen redan ändrats.

Faktisk approval-route med isolerade handlers provar preview, staleness, valt kundbesked, barnkort och delkvittens. TypeScript-kontrollen passerar. Övriga automationshandlingar (`update_status`, `notify_owner`, `run_agent`, `generate_quote`, `create_booking`, `schedule_followup`, `sync_to_fortnox`, `create_project`) saknar fortfarande fullständiga egna kontrakt och är nästa konkreta fortsättningspunkt.

### Fortsättning 8 september — intern uppföljning och återställd PR-fil

- `schedule_followup` har nu läsande, signerad granskning av verifierad kund, fullständigt interpolerad text och ett fast datum beräknat från kortets skapandedatum. Validerar datum, antal dagar och olösta platshållare. Ändrat kundunderlag ogiltigförklarar beslutet.
- Den befintliga produktfunktionen är en intern inkorgspost, inte ett tidsstyrt jobb. Granskning och kvittens säger uttryckligen detta, inklusive att ingen person tilldelas, ingen kalenderpost skapas och ingen kund kontaktas.
- Exekvering använder bara granskat underlag och stabil artefaktidentitet. Förlorat insert-svar återhämtas utan dubbel post. Om posten redan finns visar en ny granskning den faktiskt sparade texten och återställer kvittensen, även om kortets text har ändrats. Läsfel ger inget nytt insert.
- Viktigt korrigerat testbevis: en färsk Git-klon av head `6c646def` visade att `app/api/approvals/[id]/route.ts` var binärt skadad, 150060 byte. Samma skada finns från `16c0330`; `959589b` är läsbar UTF-8. Tidigare lokala tester verifierade en hel lokal fil, inte den skadade publicerade filen. Rutten är återställd från den bevarade lokala koden; jämförelse mot `959589b` visar de dokumenterade betalnings-, lead-, paket- och reject_lead-ändringarna plus denna uppföljningsgren. Inga övriga ts/tsx/json/md/cjs-filer i klonen hade UTF-8-fel.
- Verifiering: faktisk approval-route provar läsande preview, staleness, exekvering och samma lagrade/returnerade kvittens. Separat verklig review/executor med isolerad databas provar datum/text, företagsscope, inmatningsfel, förlorat svar, återöppning och deduplicering. 21 befintliga review/receipt/artifact-regressionsprov passerar. Inga externa sändare eller produktionsskrivningar.

Kvar för automationer: `update_status` (inklusive pipelineföljder), `notify_owner` (faktiska pushmål och leveransjournal), `run_agent`, `generate_quote`, `create_booking`, `sync_to_fortnox` och `create_project`. Dessa är inte färdiga ersättningsflöden. Övriga tidigare öppna delar och TestFlight build 12 är oförändrade.

### Fortsättning 8 september — vanliga statusbyten och ärliga regelutfall

- `update_status` utan `stage_key` granskar nu aktuell företagsskopad lead/kund/bokning/offert/faktura, identitet, befintlig status och önskad status. Signaturen omfattar den aktuella raden. UI och kvittens säger uttryckligen att ett statusfält ändras: inget utskick, betalningsregistrering eller kalender-/pipelinejobb utförs.
- Exekveringen tar bara det signerade underlaget. Den jämför aktuell status och eventuell ändringstid och gör en villkorad uppdatering. Ett nollradsresultat är inte framgång. Efteråt läses och verifieras statusen; även ett borttappat mutationssvar kan återhämtas när det önskade värdet faktiskt finns. Redan rätt status kvitteras utan ytterligare skrivning. Befintliga entiteter utan updated_at får ingen skrivning till en saknad kolumn.
- Även den äldre/autonoma statusvägen kontrollerar nu att en rad faktiskt uppdaterades. Regelmotorn rapporterar dessutom fel när dess godkännandekort inte kan sparas, i stället för falskt pending_approval. Samma felstatus och feltext förs till automationsloggen och regelstatistiken.
- Verifiering: ny verklig statusreview/executor-harness provar alla fem entitetsmappningar, företagsscope, ändrat underlag, nollradsresultat, förlorat svar och idempotent återkörning. Faktisk approval-route provar full preview→beslut→ändrad status och samma lagrade/returnerade kvittens. Faktisk automationsmotor provar fel vid kortlagring och nollradsuppdatering med isolerad databas och förbjudna sändare. TypeScript-kontroll passerar.

**Pipelinevarianten av update_status är fortfarande öppen**, inte slutprovad: moveLeadToStage kan köra pipeline_stage_changed-regler och skapa projekt med ytterligare Fortnox-/kontrollisteföljder. Den behöver ett komplett granskat underlag och beständiga delresultat/återförsök. Den befintliga granskningsspärren är ingen färdig produktfunktion. Nästa fortsättningspunkt är denna pipelinevariant, följd av notify_owner, run_agent, generate_quote, create_booking, sync_to_fortnox och create_project. Ekonomijournal och mobil/TestFlight återstår enligt tidigare lista. De 34 riktade review/receipt/automation-regressionsproven passerar.

### Fortsättning 8 september — pipelinekärnans verkliga delutfall

- moveLeadToStage jämför nu företag, lead och föregående pipelinevärde vid själva skrivningen. Noll uppdaterade rader ger inget lyckat flyttbesked och inga följdhandlingar. Även null som föregående steg hanteras uttryckligen.
- Ett misslyckat uppslag av pipeline-stegen får inte längre misstas för tom lista och skapa standardsteg. Läsfel lämnar data orört.
- Flytt, pipeline-regler och projektskapande redovisas separat. Returnerade regel-/projektfel, liksom kastade fel, ger partial:true tillsammans med moved:true när leaden redan flyttats. Automationsmotorn för vidare delresultaten och rapporterar inte generell framgång för detta läge. Regelkontexten inkluderar nu entity_id så att följdförslag har entitetsidentitet.
- Den faktiska pipelinekärnan körs i ny isolerad harness: nollradsresultat, läsfel utan seeding, främmande företag, blandat utfall, normal framgång och null-steg. Befintlig faktisk automationsmotor-harness provar även att partial kommer fram som fel plus detaljer, inte success. Inga riktiga regler, projekt, Fortnox-anrop eller SMS utförs i proven.

Kvar: detta är **kärnrättning, inte ett färdigt pipelinegodkännande**. Ingen ny förhandsgranskning har öppnats för stage_key. createProjectFromLead har fortfarande egna följder (Fortnox, kontrollista, milestones, project_created och intern SMS-notis) som behöver komplett underlag och beständigt delresultat. Ett nytt anrop när leaden redan flyttats kör inte om följderna; detta är inte ett färdigt selektivt återförsök. Nästa implementation behöver en journal för det granskade steget och varje följd, med återhämtning för redan flyttad lead utan dubbelt projekt eller meddelande. Övriga tidigare öppna automations- och mobilflöden kvarstår.

### Fortsättning 8 september — granskad pipelineflytt och journal för följdförslag

- Pipelinekortet har nu en signerad granskning av lead, aktuellt steg/målsteg och följdförslagen. Kundkoppling, steg och regler verifieras inom företaget. Bakåtsteg nekas utom lost. Ändringar före första beslutet ändrar granskningsunderlaget; efter första försöket används den frysta journalplanen.
- Produktbeteendet i denna granskade väg är uttryckligen tvåsteg: leaden flyttas och regel-/projektåtgärder blir separata godkännandekort. Ingen regelåtgärd, projektskapande, Fortnox-synk eller SMS utförs av pipelinebeslutet. Rena create_approval-regler bevarar korttyp och interpolerad titel/beskrivning. Den äldre/autonoma pipelinevägen har inte bytts ut.
- Befintliga v3_automation_logs används som beständig journal med stabilt id per huvudkort, fryst plan i context och separat utfall per del i result. En lyckad flytt körs inte igen; endast misslyckade följdförslag återförs. Alla barnkort har stabila id:n. Förlorade svar från leadflytt, barnkort eller delkvittens kan återhämtas utan ny flytt/dubbla kort. Ett annat aktuellt steg får inte skrivas över vid återförsök.
- Kvittensen räknar skapade granskningsförslag som just förslag, aldrig som utförda projekt/regler. Journalen får success när flytt och samtliga förslag finns, failed vid delproblem. API-kvittensen använder de faktiska delresultaten.
- Ny isolerad harness kör verklig granskning/exekvering/persistenshjälpare: företagsscope, fryst plan, delvis kortlagring, selektiv retry, redan lyckade delar, tappat lead-/barnkortssvar, fel vid journalskrivning och konflikt med senare flytt. Befintlig faktiska route-harness passerar som regression; den nya pipelinegrenens fulla HTTP/Chromium-prov återstår. Typkontroll passerar före sista kundscope-tillägget; ingen iPhone-verifiering.

**Inte hela pipelinekedjan färdig:** projekt- och andra specialiserade barnkort kan fortfarande sakna färdiga exekveringsvyer. Dessa förslag är inte ersättning för ett slutprovat projektskapande. Nästa steg är det konkreta create_project-kortets underlag, projekt/milestones, Fortnox, kontrollista, project_created-regler och internnotis med egna val och journal. Därefter övriga automationsvarianter enligt tidigare lista. Ingen produktion, merge eller verklig sändning har gjorts.

### Fortsättning 8 september — faktisk granskad projektregistrering

- create_project visar nu aktuellt företagsskoppat lead-/kund-/offertunderlag, budget, timmar och delmål. Ett skickat offertunderlag beskrivs som skickat, inte signerat. Projektet skapas aktivt utan påstådd kontraktssignering, ansvarig eller kalenderbokning. Ogiltiga budgetrader och främmande kundkoppling nekas före skrivning.
- Exekveringen skapar det verkliga projektet och project_milestone-raderna från det frysta underlaget. Stabil projektidentitet per lead och stabil identitet per delmål hindrar dubbletter mellan granskade försök. Befintligt projekt verifieras och kvitteras utan nya följder.
- En beständig journal i v3_automation_logs lagrar planen och utfall per artefakt. Lyckade delar skrivs inte igen; bara misslyckade delar återförs. Ändrat offertpris efter första försöket ersätter inte tyst den redan granskade projektbudgeten. Ett förlorat projektsvar återhämtas från samma projekt-id innan fler delar skapas.
- Kontrollista, internnotis, kundens portal-SMS och project_created-regler skapas som separata granskningskort. Den gamla projektskaparen har även ett dolt kund-SMS, vilket inte körs av den nya granskade vägen. Ingen meddelandesändare används här. Rena create_approval-regler bevarar korttyp och interpolerad titel/beskrivning.
- Fortnox är uttryckligen **inte synkat av detta beslut**. Anslutningen visas, men dess färdiga gransknings-/synk-/återhämtningsväg återstår. Detta är en kvarstående produktlucka, inte en färdig ersättning för den gamla synkfunktionen.
- Verifiering: faktisk review/executor/persistenshjälpare med isolerad databas provar skapade projekt och delmål, företagsscope, budget, fel på delmål med selektiv retry, fryst budget efter offertändring, inga dubbla projekt/kort och förlorat svar efter projektinsert. Befintlig route-harness passerar som regression. Ny gren har ännu inget fullständigt HTTP-/Chromium-/iPhone-prov. Typkontroll har passerat på den nya projektvägen; sista malltextjusteringen kontrolleras i samma pass.

Kvar: full Fortnox-projektsynk, hela checklist-/regel-/meddelandekedjans separata beslut och återöppning, roll-/HTTP-/mobilprov samt samtidighet mellan den äldre autonoma projektskaparen och den nya granskade vägen (de delar ännu inte ett databaskrav på unik lead→projekt). Övriga öppna ekonomiflöden, automationer och TestFlight build 12 kvarstår. Ingen produktion eller verklig sändning ändrades.

### Fortsättning 8 september — granskat Fortnox-projekt och återföring av lokal koppling

- Granskat projektskapande lägger nu ett stabilt separat `sync_to_fortnox/entity_type:project`-kort när Fortnox är anslutet. Kortet hämtar det verkliga projektnumret efter registreringen och visar exakt nummer, beskrivning, datum och Fortnox-status. Första beslutet är versionsbundet via befintlig review-signatur. Inga fakturor, betalningar eller meddelanden ingår.
- Exekveringen gör ett faktiskt Fortnox-projektanrop från det granskade underlaget. Beständig journal per företag/projekt fryser underlaget och använder villkorat anspråk innan anrop. Bekräftat projektnummer sparas före lokal länkning. Om lokal lagring misslyckas återförs endast länkningen, utan ett nytt Fortnox-anrop. Förlorat svar från kvittenslagring kan återhämtas från journalen. JSONB:s nyckelordning påverkar inte jämförelsen av fryst underlag.
- Ägare/admin i samma företag krävs även när äldre automationskort har routing_role:any. Projekt som skapats av den granskade vägen hoppas över av äldre automatisk Fortnox-synk så att cron inte kringgår det nya beslutet.
- Äldre projektsynk kvitterar inte längre fel/saknat Fortnox-projektnummer eller noll lokalt uppdaterade rader som framgång. Kopplingen skrivs villkorat och läses efter ett förlorat skrivsvar. Befintlig annan koppling skrivs inte över. Delutfall förs vidare genom projektsynkens wrappers; konfigurationsläsfel är ett fel, inte en frånkopplad integration.
- Testbevis: ny faktisk review/executor/journal-harness med mockad Fortnox-adapter provar fryst underlag, tenant, accepterad synk + misslyckad lokal skrivning, selektiv retry, förlorat acceptanssvar, parallella anspråk, osäkert leverantörssvar utan omsändning, JSONB-ordning och befintlig/konflikterande koppling. Separat harness kör den faktiska äldre Fortnox-kärnan med mockad transport/databas och verifierar referenser, lokalt nollradsresultat/fel/förlorat svar och spärr mot autonom synk av granskade projekt. Projektskaparharness verifierar följdkortet. 36 befintliga/riktade routing- och Fortnox-regressionsprov passerar; route-harness passerar som regression. Full tsc passerar på slutkod. Ingen verklig Fortnox-mutation, kundsändning, produktion eller iPhone-provning.

**Fortfarande öppet, inte färdig funktionsparitet:** journalstatus sending/unknown tillåter inget nytt skapande. Avstämning mot Fortnox med konkret operatörsvy och säkert återupptagande efter definitivt avslag saknas ännu; en spärr räknas inte som färdigt ersättningsflöde. Befintliga projekt skapade i äldre vägar har inte en gemensam synkjournal med det nya kortet, så samtidiga äldre direktsynkar måste konsolideras. Nya grenens fulla HTTP/Chromium-/rollkedja och mobilgranskning återstår. Nästa konkreta steg: färdig avstämning av osäkra Fortnox-projektutfall, följt av notify_owner/run_agent/generate_quote/create_booking och övriga öppna ekonomivariant-/kampanj-/mobilflöden. Alla 77 korttyper är inte slutprovade. TestFlight build 12 oförändrad.

### Fortsättning 8 september — konkret avstämning efter förlorat Fortnox-svar

- Journalstatus `sending`/`unknown` har nu en läsande avstämning mot Fortnox `GET /projects/{ProjectNumber}`. Projektnummer, beskrivning, start/slutdatum och status måste motsvara det frysta underlaget. Ett saknat/felaktigt svar eller annat projekt ger ingen koppling och inget nytt POST-anrop. GET-resursen verifierad mot Fortnox officiella API-dokumentation https://api.fortnox.se/apidocs.
- När projektet återfinns visas ett konkret signerat beslut: **Koppla det hittade Fortnox-projektet**. Beslutet läser tillbaka uppgifterna igen, sparar avstämningsbeviset i journalen och slutför den lokala kopplingen. Ingen ny registerpost, faktura eller kundsändning skapas.
- Faktiskt route-prov avslöjade att den generella partial-spärren tidigare stoppade projektsynkens återförsök innan dess specialiserade journalflöde nåddes. Undantaget gäller nu projektsynken, som kräver en befintlig verifierbar journal när ett tidigare delutfall finns. Saknad journal ger inget nytt skapande. Övriga korttypers spärrar påverkas inte.
- Testbevis: verklig approval-route med isolerad databas/leverantör provar läsande preview, ändrat lokalt underlag, ett POST med förlorat svar, ny avstämningspreview, ändrade Fortnox-uppgifter efter preview, återförsök till sparad koppling och identisk returnerad/lagrad historikkvittens. Fortnox POST körs exakt en gång. Separat faktisk review/executor-harness provar även saknad läsning, annat projekt, fryst journal, selektiv lokal återföring och parallella anspråk. Full tsc passerar på slutkod. Ingen verklig Fortnox-/produktionsmutation eller iPhone-/Chromium-slutprovning.

Kvar i Fortnox-delen: säkert återupptagande när inget projekt återfinns efter ett osäkert svar, särskiljande av definitiva leverantörsavslag samt avstämningsvy för underlagskonflikter. Det nya flödet löser **återfunnet matchande projekt**, inte samtliga felvarianter. Äldre direktsynkar behöver fortfarande gemensam journal. Resterande automationshandlingar, ekonomiflöden, kampanjavstämning och native/TestFlight kvarstår enligt ovan. Alla 77 korttyper är fortfarande inte slutprovade.

### Fortsättning 8 september — återförsök när projektanropet bevisligen inte skickades

- Fortnox-adaptern skiljer nu avsaknad av användbar token före resursanrop från fel efter att anropet påbörjats. `FortnoxRequestNotSentError` får bara kastas före projektregistrets fetch. Nätverksfel och HTTP 400/500 klassas inte som säkert oskickade.
- Projektsynkens beständiga journal sparar `not_sent` när adaptern bevisar att inget projektanrop gjordes. Kortet får ärlig felkvittens och kan efter återställd anslutning återföras med det frysta underlaget och samma villkorade anspråk. Misslyckad journaluppdatering ger fortsatt försiktig delkvittens, inte omsändningsrätt.
- Verifierat: faktisk transportadapter med isolerad token/logg/HTTP visar noll resursanrop utan token, och att nätverk/HTTP-fel aldrig får not-sent-klassen. Faktisk approval-route visar preview→anslutningsfel→ny preview/retry→sparad koppling med exakt ett projektanrop totalt. Befintlig verklig review/executor/journal-harness, äldre Fortnox-kärnharness och full tsc passerar. Inga riktiga Fortnox-anrop eller produktionsmutationer.

Kvar: den här återföringen gäller bara verifierat oskickade projektanrop. Ett saknat projekt efter ett faktiskt men osäkert anrop är inte bevis på avslag. Konflikter mellan förväntat och återfunnet underlag behöver fortfarande en operatörsvy med explicit beslut; äldre direktsynkar behöver gemensam journal. Övriga öppna kortflöden och TestFlight build 12 kvarstår. Ingen generell slutverifiering av alla 77 typer påstås.

### Fortsättning 8 september — uttryckligt beslut vid Fortnox-konflikt

- Vid återfunnet projektnummer med avvikande beskrivning, datum eller status visar granskningen nu både det frysta underlaget och Fortnox-uppgifterna. Ägare/admin kan uttryckligen bekräfta att det är rätt projekt och koppla just den registerposten. Inget fält i Fortnox skrivs över och inget nytt projekt skapas.
- Identitetsbekräftelsen är obligatorisk och inte förvald. Webbens knapp är låst tills den markerats; servern nekar uteblivet delbeslut före mutation. Utföraren kontrollerar dessutom både bekräftelsen och en färsk läsning av hela det visade Fortnox-svaret. Ändrade uppgifter kräver ny granskning.
- Bekräftade avvikelser och återlästa uppgifter sparas i synkjournalen och visas vid återöppning. Kvittensen beskriver en verifierad befintlig koppling, inte ett nytt projektskapande.
- Verifiering: faktisk review/executor/journal-harness och faktisk approval-route med isolerade leverantörer passerar konfliktpreview, nekad obekräftad koppling utan mutation, godkänd koppling utan nytt POST/ändring i Fortnox och samma lagrade/returnerade kvittens. 28 review-/routingprov passerar. Riktig Chromium-dialog passerar inklusive den obligatoriska rutans låsning/upplåsning, dokumentgranskning och övriga delval. Ett äldre timingfel i browserharness rättades genom att invänta dialogen före Escape; slutlig svit passerar. Full tsc passerar på slutkod. Ingen iPhone-verifiering eller produktionsmutation.

Kvar: projekt som inte återfinns efter ett faktiskt osäkert anrop, konsolidering av äldre direktsynkar till gemensam journal samt övriga öppna automations-/ekonomi-/kampanj-/nativeflöden. Konfliktbeslutet är implementerat men innebär inte att alla Fortnox-varianter eller alla 77 korttyper är slutprovade. TestFlight build 12 oförändrad.

### Fortsättning 8 september — notify_owner riktas faktiskt till ägare

- Automationskärnans notify_owner skickade tidigare utan target_user_id och kunde därmed nå andra användare i företaget. Nu läses aktiva ägare inom samma företag, deras auth-user_id verifieras och varje unik användare anges uttryckligen som pushmål. Tomt urval, läsfel eller saknad identitet ger inget utskick; ingen fallback till broadcast.
- Kärnan redovisar utfall per ägare med accepterade/avvisade försök och kanalutfall. Delvis accepterad push och osäkert nätverksutfall ger inte generell framgång. Kvittensen skiljer acceptans i pushtjänsten från att personen har läst notisen.
- Verifiering: faktisk automationsmotor med isolerad DB/pushadapter provar tenant/roll/aktiv-filter, auth-identitet, deduplicering, saknad ägare/identitet/läsfel, blandat kanalutfall och nätverksosäkerhet. Faktisk approval-route passerar som regression. 11 kvittens-/reviewprov och full tsc passerar på slutkod. Inga riktiga pushar eller produktionsändringar.

notify_owner är ännu INTE ett komplett granskat kortflöde: förhandsgranskning av exakt text/mål och beständig journal med återförsök per del saknas fortfarande. Den befintliga granskningsspärren öppnas inte av denna korrigering. Nästa konkreta steg är detta gransknings-/journalarbete; därefter run_agent, generate_quote, create_booking och övriga öppna delar. Fortnox-fallen med osäkert anrop utan återfunnet projekt samt äldre synkvägars gemensamma journal kvarstår. Alla 77 typer är inte slutprovade; TestFlight build 12 oförändrad.

### Fortsättning 8 september — ägarnotisens granskning och journal per enhet

- notify_owner-kortet har nu konkret signerad granskning av interpolerad rubrik/text, intern länk och varje registrerad webb-/mobilmottagare hos aktiva ägare. Ägare/admin i samma företag krävs även på äldre any-routade kort. Registreringarnas hemliga token/nycklar visas inte och sparas inte i beslutsunderlaget; planen innehåller registrerings-id och fingeravtryck.
- Den granskade vägen skickar ett leverantörsanrop per registrerad enhet, utan broadcast eller reservkanal. Journal per kort fryser planen; separata stabila deljournaler använder villkorat anspråk före varje sändning. Aktiv ägarroll och oförändrad mottagarregistrering verifieras igen innan anropet.
- Accepterade försök skickas inte om. Definitivt avvisade försök och konfigurationsfel före webbpush kan återförsökas utan att andra enheter får dubletter. Förlorade/otydliga svar får unknown och skickas inte igen. Förlorat databassvar efter sparad acceptans återhämtas från deljournalen. Samma faktiska kvittens returneras och sparas i korthistoriken.
- Verifiering: ny faktisk review/executor/persistenshjälpare och de verkliga Expo-/webbpush-adaptrarna körs med isolerade transporter/databas. Prov täcker exakt text och enskilt mål, underlag utan nycklar/token, tenant, selektiv mobilretry efter accepterad webbpush, nätverksosäkerhet, förlorat journalsvar, återkallad ägarroll, parallella anspråk och ofullständig Expo-kvittens. Faktisk approval-route provar preview→blandat utfall→retry enbart misslyckad enhet→samma historikkvittens. 31 routing-/kvittensprov och full tsc passerar på slutkod. Inga riktiga pushar eller produktionsskrivningar.

Kvar: operatörsavstämning för unknown/sending efter faktiskt förlorat leverantörssvar, byte/återregistrering av en misslyckad mottagarenhet med nytt granskat underlag samt iPhone-/nativeprov. Äldre autonoma notify_owner-vägen använder ännu inte denna deljournal. Den nya granskade vägens lyckade och säkert återförbara utfall är implementerade; detta innebär inte att samtliga pushfel eller hela 77-typssystemet är färdigt. Fortnox-luckor och övriga automations-/ekonomi-/kampanj-/mobilflöden kvarstår. TestFlight build 12 oförändrad.

### Fortsättning 8 september — samlat omprov och obligatoriska mobilval

- Samtliga 24 befintliga `tests/approvals/*harness.cjs` passerar med isolerade databaser/leverantörer; Chromium-dialogen och PDF-förhandsvisningen körs i riktig lokal Chromium. Detta räknar sviter, inte slutprovade korttyper.
- Ägarnotisens faktiska kärnprov omfattar nu även ändrad Expo-registrering, tomt mottagarurval, saknad VAPID-konfiguration med selektiv webbåterföring, nollradsanspråk, acceptans där journalen inte sparas och Expo HTTP 500. Osäkra försök skickas inte igen.
- 71 prov i approval-action-contract/review/receipt/routing/preview passerar. Ett statiskt kontraktsprov hade en för kort textskiva av automation-grenen; det läser nu hela grenen. Ett nytt faktiskt route-prov verifierar dessutom att create_approval-spärren ger executed:false och noll automations-/artefakt-/SMS-anrop. Route-harness har körts om efter tillägget.
- Full `npm run build` passerar med syntetisk Supabase-/Stripe-konfiguration. Next ger befintliga metadata/themeColor- och Sentry-varningar. Inga riktiga kund-, push- eller Fortnox-anrop gjordes.
- Mobilens tre gransknings-/testfiler återställdes från aktuell PR #3-head 126b4168 och deras ursprungliga blobhashar verifierades. 13 befintliga mockade komponent-/livscykel-/protokollfall passerade. Nytt prov reproducerade att obligatoriskt delval inte låste bekräftelseknappen. Komponenten respekterar nu required och låser åter knappen vid avmarkering; 14 fall passerar efter rättningen. Endast faktisk komponent/API-adapter med mockade native-primitiver och nätverk har provats i en partiell arbetskopia. Ingen full Expo-typkontroll/build eller iPhone-provning påstås.

Detta avslutar det samlade omprovet för den befintliga testuppsättningen, inte produktens samtliga 77 korttyper. Kvar är föregående avsnitts operatörsavstämning/återregistrering för push, äldre autonoma vägars gemensamma journal, run_agent/generate_quote/create_booking, öppna finansiella varianter, kampanjavstämning och full native/TestFlight-verifiering. TestFlight build 12 är oförändrad.

### Nattradens döda länk — 8 september
Nattraden räknade v3_automation_logs men öppnade mobilens automation_logs-vy. Mobilens Visa öppnar nu samma feedposter i en egen modal; servern returnerar samtliga räknade poster (max 50), inte bara tre. Texten beskriver registrerade händelser, inte bevisat slutförda handlingar. Home minskar sitt antal efter hantering/snooze. Nytt verkligt modalprov med två poster och stängning passerar med mockade native-primitiver; 11 backend-hemflödesprov passerar. Ingen iPhone-/Expo-build verifierad. Kvar: utfallsberikning till faktiska kvittenser, gemensam badge/list-uppdatering, den äldre Senaste-vyns ägaruppslag samt tidigare öppna 77-typsluckor. Build 12 oförändrad.

### Hem/list/badge — samlat återhämtningsprov 8 september
Mobilens Hem prenumererar på beslut och foreground, ignorerar gamla svar efter vy-/kontobyte, tömmer gamla användardata och ångratimers vid fokusbyte. Den fullständiga pending-listan bestämmer medlemskap/antal; feeden bestämmer bara ordning och kan inte återinföra gamla kort. Listfel visas uttryckligen. Faktiska Hem-, list- och flikkomponenter passerar isolerade prov för 2→1→0, nätfel, samtidiga försenade svar och kontobyte. Inspelningsfilterrensning, API-köprov, nattmodal och 14 reviewfall passerar också. Nattfeed visar nu lagrad status och modal särskiljer success/failed/pending_approval/rejected/skipped från okänt. Status är loggens rapport, inte en fullständig delkvittens.
Kvar: äldre Senaste-vyn använder fortfarande egen äldre datakälla/ägaruppslag; nattvyn saknar fulla delkvittenser och länkar till följdhandlingar. Full Expo-build/typkontroll och iPhone-prov är inte körda: lokal mobilkopia är partiell, Xcode/EAS CLI saknas och ingen ansluten EAS-byggtjänst är tillgänglig. Ingen ny build skapad, build 12 oförändrad. Övriga dokumenterade 77-typsluckor kvarstår.

### Slutgodkännande per korttyp — beviskrav
Ingen rad blir slutgodkänd av ett gemensamt testantal eller en granskad kodgren. Varje typ och underliggande variant behöver dokumenterat prov på aktuell backend-/mobilversion för: (1) synlighet/rätt roll och samma kö-ID:n i Hem/list/badge, (2) rätt knappar och oförändrande preview, (3) exakt underlag och stale-preview-spärr, (4) faktisk databas-/leverantörseffekt, (5) identisk kvittens direkt/historik/återöppning, (6) avbryt/avvisa och deras följder, (7) selektiv återföring utan dubletter vid fel/förlorat svar, (8) verklig native-resa i angiven TestFlight-build. Ej tillämplig kontroll kräver motivering. Ett blockerat utförande eller webb-hänvisning räknas inte som färdig funktion. Den befintliga 77-radsmatrisen beskriver implementation, inte certifierad täckningsgrad; något verifierat X/77-tal finns ännu inte.

### Senaste — serverkontrollerad historik 8 september
Ny /api/mobile/activity läser både äldre automation_logs och v3_automation_logs i verifierat företag för ägare/admin. Övriga roller nekas uttryckligen; projektspecifik historik för teammedlemmar är fortsatt öppen. Resultaten namnges med källprefix, sorteras tillsammans och visar loggad status. Läsfel ger inte tom framgång. Mobilens Senaste använder rutten och visar hämt-/behörighetsfel med retry. Hem placerar endast rapporterat lyckade rader i sin Klart-lista och läser auto-flaggan från approval_id. Faktisk route-harness verifierar båda källorna, pending-status, käll-ID:n, maxgräns, tenant/roll och databasfel. Fulla per-handling-kvittenser är ännu inte ersatta av dessa statusetiketter. Expo/iPhone och tidigare funktionsluckor kvarstår.

### Sparade kortkvittenser i Senaste — 8 september
Aktivitetsrutten hämtar nu även avslutade godkännandekort i verifierat företag. Den returnerar endast titel/typ/tid och sparad execution_result.receipt-text/state, aldrig övrigt payload. Saknad kvittens beskrivs uttryckligen, inte rekonstruerad framgång. Regelrader med samma approval_id undertrycks när kortkvittensen redan visas. Mobilraden öppnar en läsande modal med fullständig kvittenstext; återöppning hämtar samma sparade resultat. Fokus-/kontobyte ignorerar försenade historiksvar och stänger gamla detaljer.
Prov: faktisk serverrutt med sparad partial-kvittens visar identisk text vid upprepad läsning och läcker inte övrigt payload. Befintliga företag/roll/felfall passerar. Faktisk mobilkomponent öppnar/stänger hela kvittensen och återger den efter avmontering/återmontering; native/API mockade. API-adapterprov och full backend-tsc passerar. Kvar: projektroutad teamhistorik, säkra länkar till följdhandlingar, full native-build/iPhone och alla tidigare funktionella variantluckor. Ingen omsändning/produktion/build gjord.

### Teammedlemmars egna beslut i historiken — 8 september
Senaste tillåter nu egna avslutade kort för teammedlemmar. Databasfrågan filtrerar på verifierat business_id och resolved_by före limit; kortet måste dessutom klara nuvarande canActOnApproval. Andras beslut eller återkallad routingbehörighet visas inte. Företagets två allmänna loggkällor frågas inte alls för teammedlemmar. Ägare/admin behåller företagshistorik. Detta är egen beslutshistorik, inte delad projekthistorik.
Faktisk route-harness med isolerad DB och mockad routingkontroll provar positiv egen kvittens, resolved_by-filter, inga företagsloggfrågor, annan användare och nekad routing samt tidigare tenant-/felprov. Full backend-tsc passerar. Den faktiska routingfunktionens befintliga regressionssvit körs separat. Ingen produktionsdata eller build ändrad. Kvar: delad projekt-/teamhistorik, följdlänkar, 77-typsvariantluckor och verkliga native-prov.

### Projektreferens från aktivitetskvittens — 8 september
Senaste kan nu länka till sparat execution_result.artifacts.project_id. Länkbyggaren kräver giltigt enskilt ID, befintlig projektpost i samma företag och nuvarande project_team-behörighet. Mobilen tillåter bara /projects/<id>, stänger kvittensmodalen och navigerar till befintlig native projektsida. Ingen godtycklig next_url körs.
Faktisk länkbyggare med isolerad DB/routing provar positivt mål, saknad/annan företagsrad, nekad åtkomst, läsfel och otillåtna ID:n. Befintlig route-harness passerar med länkbyggaren mockad; faktisk mobilkomponent provar projektlänken, blockerar extern länk och återöppnar samma kvittens. Detta är projektlänkar, inte alla artefakt-/följdlänkar. Offert/faktura/bokning och övriga typer samt riktig Expo/iPhone-verifiering återstår.

### Bokningslänk — 8 september
Sparad artifacts.booking_id ger nu länk till befintliga /booking/[id] i mobilen. Raden måste finnas i samma företag; ägare/admin, direkt tilldelad person eller aktuell behörighet till kopplat projekt krävs. Mobilens länklista tillåter endast projekt-/bokningsrutter. Isolerad faktisk länkbyggare provar tilldelad/otilldelad/admin och mobilkomponenten provar navigation till båda målen.
Offert-/fakturalänkar är inte färdiga: kontrollerade native-rutter app/quote/[id], app/quotes/[id], app/invoice/[id], app/invoices/[id] saknas på aktuell mobilbranch. Det krävs implementerade dokumentdetaljvyer och verifierad läsbehörighet, inte länkar till påhittade rutter. Full Expo/iPhone och tidigare korttypsluckor kvarstår.

### Native offert-/fakturaläsning — 8 september
Nya app/quotes/[id] och app/invoices/[id] använder gemensam DocumentDetail och serverns /api/mobile/document. Servern verifierar identitet/företag och see_financials, hämtar dokument/kund/rader inom företaget och skickar en uttrycklig fältprojektion utan interna anteckningar. Sparade belopp visas utan omräkning; noll skiljs från saknat. Läsvyn visar rader, kund, status och giltighets-/förfallodatum. Kvittensen kan länka till dokumentet efter ekonomibehörighet och företags-/existenskontroll.
Prov: faktisk serverroute för båda dokumenttyper, scope, nekad behörighet, saknat dokument, ogiltig typ, nollbelopp och sekretessprojektion; faktisk länkbyggare för tillåten/nekad ekonomibehörighet; faktisk native-komponent med båda typer, ID, belopp/status och fel/retry. Native/API/DB är mockade. Backend-tsc passerar.
Begränsning: detta är läsvyer av aktuellt sparat underlag, inte full PDF-/versionsbunden utskicksgranskning, dokumentredigering eller Fortnox/e-faktura. Komplett finansiell dokumentpresentation med alla specialrader/avgifter/villkor och riktig Expo/iPhone-verifiering kvarstår. Inga utskick/build/deploy.

### Dokumentens specialrader — 8 september
Native läsvyer skiljer nu rubrik/text från prisrader, markerar ej valda tillval och kunddolda rader samt visar sparade textvillkor, påminnelseavgift och räntesats i procent. Saknade huvudtotaler visas som Saknas; ogiltiga booleska belopp omvandlas inte till 0/1. Summor beräknas inte på nytt.
Server- och komponentprov täcker tillval/dold rad, villkor, noll/saknat/ogiltigt belopp och procentsats. Det är fortsatt läsning av aktuellt underlag; exakt PDF, mottagarkuvert och versionsbundet utskicksbeslut återstår. Detta steg öppnar ingen tidigare spärrad sändväg och är inget iPhone-slutprov.

### Liveprov 8 september — förberedelse och faktisk blockering
77 typer registrerade i `docs/audits/approval-live-2026-09-08.md`. Första seedfilen `sql/approval_live_ack_batch_20260908.sql` innehåller 19 syntetiska läskvittenser, inte fullständiga producent-/händelseunderlag. Inga kort är livegodkända.

Färska läskontroller: TEST Rollprov A/B finns i Handymates produktionsprojekt, is_demo_tenant=false, inga telefonnummer/kalendrar och noll aktiva v3-regler. Inga användartriggers på pending_approvals. Supabase har ingen utvecklingsbranch. PR-head 7377b9f8 har grön Vercel-status och previewn öppnar inloggningen; ingen autentiserad testsession finns i webbläsaren.

Försöket att skapa första batchen avvisades av automatisk säkerhetsgranskning eftersom målet är produktionsdatabasen och tidigare uppdrag förbjuder produktionsmutationer. Efterkontroll gav noll rader med test_run=approval-live-20260908. Seedfilen är alltså INTE körd. Byt inte demo-flagga eller exekveringsväg för att kringgå avvisningen. Fortsättning: uttryckligt avgränsat godkännande av testdataskrivningar i biz_rollprov_a, alternativt separat godkänd testdatabas. Därefter säker browserAuth-inloggning och första klickbatchen. Externa handlingskort får inga aktiva mottagare utan verifierad testtransport. Alla 77 kompletta fixtures, varianter och native-prov återstår. Build 12 oförändrad.

PR-kommentar från 8 september beskriver separat massutskicksgrind på main d560adba och kommande kompatibilitetsbehov med confirm_recipients/HTTP 428. Bevara den vid framtida integration; main och preview får inte räknas som samma version.

### Genomförd första batch — 8 september
Andreas godkände uttryckligen avgränsade syntetiska testdataskrivningar i biz_rollprov_a efter föregående blockering. Seedfilen kördes framgångsrikt och SELECT verifierade exakt 19 typer/19 pending-rader i rätt företag. Säker browserAuth-inloggning verifierades visuellt som Rollprov Ägare / TEST Rollprov A på PR-previewn.

Alla 19 kort klickades individuellt via den faktiska webbsidan. Köantal 21→2 (två befintliga SMS-kort orörda). Efterkontroll: samtliga 19 approved, kvittens state=acknowledged. Historiken visar 19 kort: 15 med ”Läst och borttagen från listan. Ingenting skickades.”, tre med ”Informationen är noterad.” samt karin_deadline med uttrycklig text att ingen inlämning bekräftas. Omladdning och återöppning visade samma 19 kort och samma kvittensfördelning. mandate_paused_signal tog över 15 sekunder att försvinna; inget nytt beslut skickades, efterläsning visade genomförd kvittens.

Fynd: 18 informations-/påminnelsekort hade generisk Godkänn/Avvisa trots enbart läskvittens; alla historiketiketter sade Godkänd. Detta rättas i approvals/page.tsx med klassbaserad läs-/noteraknapp och historiketikett. monthly_review behåller sin rapportlänk. Sidomenyns badge släpade ibland efter listans antal (30s polling finns); omedelbar samordning återstår.

Begränsningar: ingen generell 19/77-slutcertifiering. Dessa är syntetiska läskvittensprov, inte fulla producentunderlag, roll-/avvisnings-/fel-/retry-/mobilprov. Omedelbar toast fångades inte separat för alla 19; DB/historik bekräftad. Ny etikettkod är typkontrollerad men ännu inte omprovad live. Full build ej omkörd för presentationstillägget. Inga kundutskick, publiceringar eller externa ekonomihandlingar utfördes; build 12 oförändrad. Nästa: liveomprov av etiketter, badge-synk och nästa batch med kompletta interna handlingsunderlag.

### Direktuppdatering och första verkliga interna handlingen — 8 september
Webbens review-client meddelar nu köläsare efter skickat beslut, även vid HTTP-fel och tappat svar. Avbruten/nekad preview meddelar inte. Sidebar lyssnar direkt och ignorerar äldre svar efter nytt anrop/företags-/användarbyte. Fyra isolerade prov av faktisk review-client passerar (success, HTTP-fel, tappat svar, nekad preview). Full tsc passerar. Ingen omsändning introduceras. Badge-ändringen är ännu inte liveomprovad. Historikflikens separata ”0 väntar nu” beräknas fortfarande från historikrader; ytterligare presentationsfynd kvarstår.

meeting_followup skapad med full syntetisk uppgiftsbeskrivning, källcitat, prioritet och deadline i godkänt testföretag. Verklig webbdialog visade underlaget/teamets synlighet. Tillbaka→SELECT task_count=0. Återöppna→Skapa uppgiften→exakt en task-rad 852f085e-4845-5f2a-af50-9e491e836da7, korrekt titel/beskrivning, high, 2026-09-10, visibility=team, status=pending. Kortet approved med receipt saved och ”Uppgiften är skapad och synlig för teamet.” samt samma task_id. Kvittensen synlig i Hanterade.

Fynd: rå prioritet high i preview. Rättad till Hög/Normal enligt utförarens faktiska normalisering. Ingen separat uppgiftsnavigation från kvittensen verifierad; stale-underlag/fel/retry/roller/native återstår för korttypen. Ingen generell 20/77-certifiering. De två äldre SMS-korten orörda, inga externa handlingar. Nästa fortsättning: omprova senaste badge-/etikettkod på ny preview, rätta historikens köantal och fortsätt kompletta interna kortfixtures.

### Kundpreferens och omprov — 8 september
Preview dbecc894: alla tidigare 19 kvittenskort har nu korrekt historiketikett (16 Läst, 3 Noterad). Kundpreferens skapades i godkänt biz_rollprov_a med verifierad testkund. Dialogen visade rätt kund, innehåll och källcitat samt explicit Spara kunduppgiften. Avbryt→noll fakta. Återöppna/bekräfta→exakt en customer_fact b820c3a7-d08e-5af5-ade7-9cf9de647944, rätt customer_id/innehåll/evidence_quote, preference, confirmed, inga due_at/promise_status. Direkt kvittens och Hanterade: Kunduppgiften är sparad. Sparat kortresultat saved med samma fact_id.
Badge var 3 när listan precis blivit 2, återhämtade sig till 2 vid nästa observerade kontroll. Händelserefresh finns, men atomisk gemensam köstate är inte bevisad/löst. Ingen tidsmätt garanti.
Historikens missvisande ”0 väntar nu” rättas genom att endast visa köstatistik på Väntande-fliken, där den hämtade datan gäller. Full tsc passerar; detta presentationstillägg är ännu inte liveomprovat.
Kvar: kundfaktums kontakt-/löftes-/ersättningsvarianter, ändrat underlag, roll/fel/retry, faktisk kundvy, native; badge atomisk samordning, övriga kort. Detta är ett positivt preferensprov, inte generell 21/77-certifiering. Testdata endast i godkänt testföretag, inga externa handlingar.

### Kontakt-/löftesersättning — 8 september
Fynd: granskningen sade att gamla uppgifter ersätts utan att visa vilka, och utföraren uppdaterade alla aktiva kund+typ-rader vid skrivtillfället. Nu visas exakta innehåll/antal i signerad snapshot och sparad review_evidence. Utföraren begränsar varje uppdatering till granskad identitet, innehåll, företag, kund, typ och aktiv status. Ny/ändrad rad kan inte tyst ersättas; noll träff ger partial efter sparat nytt faktum.
Verifierat: customer-fact-replacement-harness kör faktisk prepareApprovalReview och extraherad faktisk executorgren med isolerad DB: exakt underlag, scope, ändrad snapshot, läsfel, preferens, saknad evidens, nytillkomna rader, ändrat innehåll/delutfall och daterat commitment. Full app-tsc passerar. Detta är inte full HTTP-/native-/liveverifiering av ersättningsvarianten. Generell partial-retry är fortfarande spärrad; beständigt reparationsflöde återstår. Automatisk ersättning av alla aktiva fakta av samma typ är befintlig semantik och behöver bedömas per verkligt underlag.
Historikens borttagna falska köstatistik är nu liveomprovad på aab46745: Hanterade visar inte längre ”väntar nu”. Ingen ny extern handling. Nästa: syntetisk kontakt-/löftesfixture, faktisk dialog/avbryt/beslut/DB/historik; därefter fel-/återförsöksvarianter och övriga kort. Ingen generell 77-typscertifiering; TestFlight build 12 oförändrad.

### Livekontakt efter rättning — 8 september, kod 89969cd3
Seed approval_live_contact_replacement_20260908.sql körd inom godkänt biz_rollprov_a efter SELECT visade noll contact/commitment för testkunden. Gammal syntetisk kontakt Test Alfa skapad. Nya Vercel-previewn verifierad success. Dialog visade exakt Test Beta + källcitat + Ersätter uppgift 1: Test Alfa. Tillbaka gav contact_count=1/superseded_count=0. Återöppna/bekräfta skapade exakt en ny rad 325cc19a-ce7b-5677-afe3-553aaebb4064 och pekade gamla ec755aad-a332-4c47-9110-2f22137bd918 till denna. Kort approved/success/saved med samma fact_id och exakt review_evidence för gammal rad. Hanterade visade Kunduppgiften är sparad, även efter full omladdning. Direkt toast fångades inte separat. Befintlig route-harness omkörd exit0.
Kvar: flera ersättningsmål, commitment live (isolering av datumbevakning krävs), ändrat underlag live, roll/fel/retry/native. Partial-reparation är fortfarande inte implementerad. Grammatik i dialogen säger 1 granskade uppgifter och bör justeras. Kvittensen anger sparandet men inte antal ersatta uppgifter. Dessa är uttryckliga nästa förbättringar; ingen generell slutcertifiering. Två äldre SMS-kort orörda.

### Selektiv återhämtning för kundfakta — 8 september
Kontakt/commitment-retry använder sparad review_evidence med ursprungliga ersättningsmål. Granskningen verifierar samma sparade nya faktum och visar Redan ersatt respektive Återstår att ersätta. Ändrat innehåll, främmande kund/typ, ersatt av annat faktum eller saknat evidensunderlag nekar beslut. Ingen ny målinsamling vid retry.
Utföraren läser varje mål före skrivning och efteråt, även efter kastat/förlorat svar. Redan verifierad superseded_by återanvänds utan skrivning. Alla mål behandlas separat; results sparas både vid approve och retry. Kvittensen visar antal och innehåll per lyckad/återstående ersättning. Singular i preview rättad.
Prov: utökad faktisk preparation/executorgren/receipt-harness verifierar två mål, ett skrivfel, signerbart retry-underlag, ingen omskrivning av lyckad del, återläsning efter förlorat skrivsvar, 1 av 2→2 av 2 och saknad evidens/ändrat innehåll. Full tsc och befintlig route-regression passerar. Den nya kundfaktagrenens hela HTTP-/beständighetskedja och livefel/retry är ännu inte provade; mocken isolerar DB och artefaktinsättning. Faktum återanvänds via befintlig stabil artefakthjälpare.
Kvar: förlorad kortkvittens innan review_evidence sparats, verkligt misslyckad nyinsättning där inget faktum finns, konfliktredigering och native. Återförsök kräver nu att det ursprungliga faktumet finns och matchar. Detta är ett fungerande selektivt återförsök för verifierbart sparat faktum, inte en generell lösning på samtliga haverilägen. Nästa: full HTTP/live-provning av flermålsgrenen samt återstående korttyper. Inga nya live-/produktionsdata ändrade i detta pass. TestFlight build 12 oförändrad.

### Full route och live-retry — 8 september, kod ffdae092
Faktisk POST-handler + prepare/guard/receipt + verklig stabil artefakthjälpare körd med isolerad minnesdatabas. Ny gren provar stale-preview 428 utan insert, två mål med ena skrivningen misslyckad, sparad partial-kvittens/results, retry-preview, nekad behörighet 403, återföring med tappat skrivsvar, samma artefakt, ingen omskrivning av lyckad del, samma lagrad/returnerad slutkvittens och upprepat gammalt beslut nekat 428. Befintlig route-regression passerar.
Live: seed approval_live_contact_retry_20260908.sql konstruerade uttryckligen ett syntetiskt delvis färdigt tillstånd i godkänt biz_rollprov_a; det första felet provocerades INTE fram i drift. Fixture kompletterad med resolved_at för att motsvara verklig route och kunna listas i execution_failed. Återförsök finns på Väntande-flikens uppföljningslista, inte direkt i Hanterade. Verklig dialog visade Redan sparad/Redan ersatt/Återstår att ersätta och CTA Slutför ersättningarna. Beslut gav success/retried, exakt tre fixturfakta kvar, båda gamla pekar till samma b4d80604-691b-5af7-a75e-41ab64c5786d. Sparade results har två ok:true och samma ursprungliga review_evidence. Hanterade efter full omladdning visar identisk 2 av 2-kvittens med båda texterna. Ingen extra ny faktarad. Antal write-anrop verifierat isolerat, inte instrumenterat live.
Kvar: historikens direkta återförsöksknapp/statusetikett, saknad evidens efter förlorad kortkvittens, helt utebliven nyinsättning, konfliktredigering, commitment-producent/roller/native samt övriga korttyper. Sju-dagarsgränsen för execution_failed kan gömma äldre ouppklarade ärenden och behöver separat genomgång. Ingen generell 77-typscertifiering eller ny TestFlight-build. Äldre SMS-kort orörda; inga externa handlingar.

### Ouppklarade ärenden och historikknapp — 8 september
GET execution_failed har inte längre en sjudagarsgräns eller krav på resolved_at. Företags-/routingfilter och befintlig maxgräns kvarstår. Därmed försvinner inte ett olöst ärende enbart av ålder; komplett paginering för fler än listgränsen är fortfarande öppet.
Historikens gemensamma kvittenskomponent (vanligt kort och paket) visar Behöver följas upp och Granska återförsök för approved med failed/retrying. Knappen använder befintlig signerad reviewedApprovalFetch, stoppar överordnad klickning och är låst under anrop. Lyckat retry hämtar om historiken så gammal kvittens/CTA inte blir kvar. Serverns gransknings-/omsändningsspärrar gäller oförändrat.
Verifierat med history-recovery-harness: faktisk GET-handler returnerar gammalt och null-daterat misslyckande men inte annat företag, nekat kort eller lyckad handling (DB/routing isolerade); faktisk extraherad React-komponent visar receipt, anropar callback med rätt id, stoppar bubbling, busy-lås och ingen retryknapp vid success. Full tsc passerar. Ingen ny liveprovning av denna UI-version ännu.
Kvar: liveomprov, komplett paginering och synliga fel om uppföljningslistans hämtning misslyckas; statusetiketten Godkänd beskriver fortfarande beslutet även vid partiellt utförande (kompletterande Behöver följas upp finns nu). Övriga 77-typsluckor kvarstår. Ingen ny TestFlight-build eller extern handling.

### Komplett sidläsning och synliga läsfel — 8 september
Webblistan läser samtliga API-sidor för huvudlistan och uppföljningen. API ger next_offset utifrån rå sidlängd före routing, deterministisk created_at/id-sortering och validerad offset. Därmed stoppar inte en behörighetsfiltrerad tom sida nästa tillåtna kort. Identiska id:n dedupliceras. Befintliga klienter kan fortsatt använda enstaka sida.
Gemensam adapter nekar HTTP-fel, trasigt JSON/format och oförändrad/bakåtriktad sidposition. Sidan visar synligt fel/ny läsknapp, aldrig Kön är tom eller 0-statistik som följd av läsfel. Gamla svar ignoreras efter ny hämtning/flikbyte; lyckat retry laddar om.
Prov: faktiska GET-handlern med sidintervall/negativ offset/äldre fel/scope/routing; verklig adapter och extraherad sidladdare med filtrerad tom första sida, senare synligt kort, felaktig cursor, HTTP/formatfel, misslyckad uppföljningsläsning och gamla svar. Båda harness passerar, full tsc passerar efter Array.from-anpassning till repots TS-target.
Begränsningar: offsetpaginering är inte en transaktionell snapshot under samtidiga ändringar; komplett sidläsning kan behöva återhämtas vid aktiv kömutation. Mobil/andra befintliga API-klienter är ännu inte migrerade till multipage. Ny kod inte liveomprovad. Nästa: live historik/äldre fel och fortsatta typanpassade interna fixtures, därefter utskicksvarianter med isolerad transport. Alla 77 fortsatt ej slutverifierade; inget iPhone-/TestFlight-slutprov.

### Prisjustering — 8 september
Price_adjustment kontrollerar nu gammalt pris även i själva skrivningen och läser tillbaka faktisk lagring efter normala/förlorade svar. Granskad före/efter-plan sparas i review_evidence för retry. Redan rätt pris återanvänds utan skrivning, annat senare pris nekas. Null/icke-finit befintligt pris och icke-finit föreslagen nivå nekas i preview.
Faktisk route/prepare/executor/receipt med isolerad DB passerar stale 428, misslyckad skrivning, granskad retry, förlorat skrivsvar, identisk sparad/returnerad kvittens, ingen upprepad update samt tenant-/konfliktnekande. Full tsc passerar. Livefixture för icke-standard testprislista förberedd; ej körd vid denna checkpoint. Saknad evidence/konfliktredigering/native kvarstår. Ingen generell 77-typscertifiering.

### Pris live + samlat omprov — 8 september
Första prisfixturen avvisades av auto-review p.g.a. otillräckligt verifierat testscope. Färsk SELECT verifierade TEST Rollprov A och att pris-id var ledigt; seed ändrad till uttrycklig företag/namn/is_default=false-guard. Därefter godkänd och utförd. Ingen kringgående sändväg använd.
Live: separat icke-standard prislista. Granskning visade namn, 800 och 950; avbryt lämnade 800. På färdigbyggd 16173c9d visade dialogen nytt bindande underlag; Ändra timpriset gav lagrat 950, success/saved och before800/after950 i review_evidence. Hanterade efter omladdning visar Timpriset är ändrat. Äldre SMS-kort orörda, inga externa handlingar.
31/31 isolerade approval-harnesser omkörda på aktuell arbetskopia, alla exit0, inklusive riktig lokal Chromium-dialog/PDF. Detta är inte 31 eller 77 certifierade typer. Prisets live stale-/retry-/roll-/nativevarianter, prislistelänk och äldre saknad review_evidence kvarstår. Nästa kort i interna batchen: project_log_note/agent_memory_confirmation; gemensamma historik-/sidningsändringar behöver fortsatt liveomprov. TestFlight build12 oförändrad.

### Bekräftelse av agentminne — 8 september
agent_memory_confirmation binder skrivning till granskat id/innehåll/agent och aktivt (ej superseded) minne i rätt företag. Återläser efter skrivning/förlorat svar; redan bekräftat minne får inte nytt confirmed_at. Granskning/evidens beskriver exakt minne och redan bekräftad status. Faktisk approval-route med isolerad DB passerar stale-preview, fel/retry, förlorat skrivsvar, oförändrat bekräftelsedatum, tenant-/innehållskonflikt och beständig kvittens. Full tsc passerar före sista superseded-villkoret; ny slutkontroll körs före publicering. Schema och memory_type CHECK verifierade läsande. Syntetisk livefixture förberedd, ännu ej körd. Native/producentvarianter/konfliktredigering kvarstår.

### Dagbokskort — 8 september
project_log_note förbereder exakt normaliserad text och fast datum från call_date eller kortets created_at före beslut; ingen dynamisk dagens-datum-fallback i utföraren. Samma projekt/datum/text används av befintlig createDiaryEntry. Befintlig/dublett-rad måste motsvara underlaget, och faktisk rad läses efter skrivning även vid tappat svar. Projekt-id finns även i återanvänd kvittensartefakt.
Faktisk route och verklig diary-write med isolerad DB passerar datum/text, insertfel, granskad retry, förlorat insertsvar, en stabil rad, konflikt vid dubblett och identisk sparad/returnerad kvittens. Full tsc passerar. Underliggande revisionsloggs felhantering är inte slutverifierad/reparerad i detta steg; lyckad anteckning är inte bevis på full revisionskedja. Samtalsreferensens existens/ägarskap och producentvarianter/native återstår. Ingen liveanteckning skapad vid denna checkpoint.
