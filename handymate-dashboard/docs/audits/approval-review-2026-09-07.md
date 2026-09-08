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
