# Liveprov — 77 korttyper, 8 september 2026

Backend före prov: `7377b9f8e59eebf07f02adaca3ea22a35779f6db`. Testföretag: `biz_rollprov_a`.

Ingen korttyp är slutgodkänd av detta register. Första batchen är syntetiska läskvittenser, inte kompletta producent-/händelseunderlag. Övriga typer behöver typanpassade data och verifierad isolering av externa effekter innan seedning. Alla varianter behöver separata bevis.

| Typ | Klass | Första batch | Webbprov | Mobilprov | Effekt/historik/återförsök |
|---|---|---|---|---|---|
| `send_sms` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `send_email` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `send_quote` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `send_invoice` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `send_matte_customer_reply` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `quote_nudge` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `confirm_payment` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `create_booking` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `create_quote_draft` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `create_ata_draft` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `create_invoice_from_report` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `autopilot_package` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `autonomy_offer` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `review_request` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `scheduled_review_request` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `yearly_followup` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `proactive_care` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `warranty_followup` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `seasonal_campaign` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `customer_reactivation` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `customer_message` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `customer_quote_question` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `quote_request` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `quote_addition` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `propose_booking_times` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `propose_site_visit` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `reschedule_request` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `new_booking_request` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `dispatch_suggestion` | EXECUTABLE_ACTION | Syntetiskt grundfall skapat | Webb: granska/avbryt/beslut | Faktisk skrivning verifierad | Grundfall + historik efter omladdning; ej slutverifierad |
| `publish_microsite` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `invoice_reminder` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `automation` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `price_adjustment` | EXECUTABLE_ACTION | Isolerad prislista skapad | Preview/avbryt/800→950 | Ej kört | Faktiskt pris + sparad/återläst kvittens; retry/scope isolerat provat |
| `fakturera_projekt` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `project_debrief` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `playbook_pattern_confirmation` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `playbook_kickoff_suggestion` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `operating_experiment_proposal` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `operating_experiment_readout` | EXECUTABLE_ACTION | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `missad_intakt` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `manual_project_create` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `jobbpass_proposal` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `installation_register` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `review_auto_invoice` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `four_eyes_quote` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `four_eyes_project_close` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `deal_flow_site_visit` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `lead_review` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `time_attestation` | REVIEW_REQUIRED | Syntetiskt grundfall skapat | Webb: granska/avbryt/beslut | Faktisk skrivning verifierad | Grundfall + historik efter omladdning; ej slutverifierad |
| `tidrapport_forslag` | REVIEW_REQUIRED | Syntetiskt grundfall skapat | Webb: granska/avbryt/beslut | Faktisk skrivning verifierad | Grundfall + historik efter omladdning; ej slutverifierad |
| `checklist_forslag` | REVIEW_REQUIRED | Syntetiska punkter skapade | Preview/avbryt/skapa | Ej kört | En checklista, korrekt initialstatus och sparad kvittens; övriga varianter öppna |
| `egenkontroll_foto` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `egenkontroll_avvikelse` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `job_report` | REVIEW_REQUIRED | Ej skapad | Ej kört | Ej kört | Ej verifierat |
| `karin_deadline` | ACKNOWLEDGEMENT | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `cert_expiry_reminder` | ACKNOWLEDGEMENT | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `low_stock_alert` | ACKNOWLEDGEMENT | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `agent_insight` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `monthly_review` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `monday_brief` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `quote_signed` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `ata_signed_notification` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `ata_declined_notification` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `profitability_warning` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `meeting_summary` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `meeting_followup` | EXECUTABLE_ACTION | Skapad | Preview/avbryt/spara | Ej kört | En task + sparad historikkvittens; övriga varianter öppna |
| `project_log_note` | EXECUTABLE_ACTION | Syntetiskt underlag skapat | Preview/avbryt/bekräfta | Ej kört | Faktisk rad + återläst kvittens; fel/retry isolerat, övrigt öppet |
| `customer_fact` | EXECUTABLE_ACTION | Preferens/kontakt/retry skapade | Preview/avbryt/spara/retry | Ej kört | Faktiska rader + återläst kvittens; commitment/konflikter kvar |
| `agent_memory_confirmation` | EXECUTABLE_ACTION | Syntetiskt underlag skapat | Preview/avbryt/bekräfta | Ej kört | Faktisk rad + återläst kvittens; fel/retry isolerat, övrigt öppet |
| `autonomy_revoked` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `team_intro` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `expectation_drift_signal` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `promise_deadline_signal` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `mandate_paused_signal` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `external_delivery_failure_signal` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `payment_failed_signal` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |
| `kort_gar_ut` | INFORMATIONAL | Skapad och kvitterad | Klick + bort ur kö | Ej kört | Sparad kvittens och historik efter omladdning; övrigt ej provat |

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

### Pris live + samlat omprov — 8 september
Första prisfixturen avvisades av auto-review p.g.a. otillräckligt verifierat testscope. Färsk SELECT verifierade TEST Rollprov A och att pris-id var ledigt; seed ändrad till uttrycklig företag/namn/is_default=false-guard. Därefter godkänd och utförd. Ingen kringgående sändväg använd.
Live: separat icke-standard prislista. Granskning visade namn, 800 och 950; avbryt lämnade 800. På färdigbyggd 16173c9d visade dialogen nytt bindande underlag; Ändra timpriset gav lagrat 950, success/saved och before800/after950 i review_evidence. Hanterade efter omladdning visar Timpriset är ändrat. Äldre SMS-kort orörda, inga externa handlingar.
31/31 isolerade approval-harnesser omkörda på aktuell arbetskopia, alla exit0, inklusive riktig lokal Chromium-dialog/PDF. Detta är inte 31 eller 77 certifierade typer. Prisets live stale-/retry-/roll-/nativevarianter, prislistelänk och äldre saknad review_evidence kvarstår. Nästa kort i interna batchen: project_log_note/agent_memory_confirmation; gemensamma historik-/sidningsändringar behöver fortsatt liveomprov. TestFlight build12 oförändrad.

### Två livekort — minne och dagbok, 8 september
Agentminne 0f91614e-ae2a-4d2f-9ec1-8329c713bb8a i godkänt testföretag: granskningen visade exakt syntetisk text och agent. Avbryt lämnade confirmed_at=null; återöppna/Bekräfta minnet gav faktiskt confirmed_at och success/saved med samma id/content/agent i review_evidence. Samma Minnet är bekräftat i Hanterade efter omladdning. Fördröjd preview gav först locator-timeout; SELECT verifierade ingen mutation före det enda slutbeslutet.
Dagbok: syntetisk samtalsmarkör (inte verkligt inspelat samtal), verifierat testprojekt proj_rollprov_p1. Preview visade projekt, exakt text och 2026-09-08; avbryt gav noll rader. Spara i dagboken gav exakt log_call_aplive_diary_call_20260908 med rätt projekt/datum/text och samma artefakt-id/granskningsunderlag i kvittensen. Samma Anteckningen är sparad i projektets dagbok efter omladdning.
Båda har isolerade routeprov för fel/retry/tappade svar och konflikter, men live roller/fel/retry/producentdata/native återstår. Minnesagenten visas fortfarande som rå matte (presentationsfynd). Dagbokens verkliga samtalsreferens, full revisionsreparation och datum/tidszonsvarianter återstår. Dessa är positiva livebasprov, inte två fullständigt certifierade typer. Inga externa utskick. TestFlight build12 oförändrad.

### Checklista live — 8 september
checklist_forslag med två syntetiska punkter i verifierat testprojekt. Preview visade rätt projekt/mall och markerade endast första punkten obligatorisk. Avbryt gav noll checklistor. Skapa checklistan gav exakt bca1f7ab-6b53-520d-a67c-ee45bc502e0d, status in_progress, två korrekta texter/required-värden och båda checked=false trots checked=true i en inkommande fixturepunkt. Sparad success/saved-kvittens med samma checklist_id/project_id.
Utökad faktisk route och verklig artefakthjälpare med isolerad DB passerar punktgranskning, nollställning, en insert och nekad dubbelbeslutseffekt. Kompletta producentmallar, saknade/dubbla punkt-id:n, redigerad befintlig artefakt vid retry, roller/fel/native återstår. Dagboksprovets revisionspost efterkontrollerad: exakt en create-revision.

### Gemensam historikåterhämtning live — 8 september
Rekonstruerad syntetisk failed-fixture med resolved_at 14 dagar tillbaka, referens endast till redan bekräftat testminne. Synlig i Väntandes uppföljningslista trots ålder. Hanterade visade Behöver följas upp + Granska återförsök. Klick öppnade verklig signerad dialog med Redan bekräftat, datum ändras inte. Slutbeslut gav success/retried, lagrad kvittens, oförändrat confirmed_at 2026-09-08T13:01:04.388Z och historiken uppdaterades direkt till Minnet är bekräftat utan återförsöksknapp. Ursprungligt fel var syntetiskt rekonstruerat, inte inducerat i drift.
Sju-dagarsborttagning, historik-CTA och direkt historikrefresh är därmed liveomprovade för detta fall. Inte full native-/samtliga typers återförsökscertifiering. Nästa bredare grupp: tidsattest/tidradsförslag/tilldelningar samt kvarvarande specialfall och isolerade sändarflöden. 77/77 fortfarande inte slutverifierat.


### Three internal actions — live base proofs on dbf5542f (2026-09-08)
Verified Vercel success before final decisions; logged-in owner in TEST Rollprov A. Seed: sql/approval_live_time_dispatch_20260908.sql. Seed presentation fields were completed while pending (user_name/checked_out_at/member_name/job_title); initial blank avatar labels were caused by omitted synthetic payload fields.
- tidrapport_forslag: aplive_20260908_timeproposal. Preview showed P1, Rollprov Ägare, 2026-09-08, 75 minutes and explicit Registrera tidrapporten. Cancel left zero matching rows. Final decision created exactly one row 3d4966cb-ab2b-5812-ac4a-7b13dd981f3e, bu_rollprov_owner, P1, 75 minutes, approved, billable. Receipt: Tidrapporten är registrerad och godkänd.
- dispatch_suggestion: aplive_20260908_dispatch, work order aplive_work_order_20260908. Preview showed verified person, title, date and 12:00–13:00. Cancel left assigned_to null/status draft. Spara tilldelningen assigned Rollprov Ägare and kept draft. Receipt: Tilldelningen är sparad. This tests work_order only; booking variant still lacks live proof.
- time_attestation: aplive_20260908_attestation, check-in a5807a7e-836a-499f-954e-66f132887301. Preview showed P1, Rollprov Ägare, source timestamp and 90 minutes. Cancel left check-in completed and zero time rows. Attestera och registrera tiden created exactly one te_checkin_a5807a7e-836a-499f-954e-66f132887301, 90 minutes, 2026-09-08, bu_rollprov_owner, P1, billable/approved; check-in approved with 90 minutes. Receipt: Tiden är attesterad och registrerad.
- All three persisted receipts exactly matched history, including after full reload and reopening Hanterade. Pending list returned to two pre-existing SMS cards, untouched. Immediate time-proposal toast observed; transient dispatch/attestation toasts were not captured, so only their persisted/history receipt comparison is claimed.
- No messages, calendar operations or external provider actions. Synthetic approved time remains in the test project and must not be treated as real wage/invoice material.
- Still NOT full certification: native app/build, booking dispatch, stale assignment CAS and phone semantics, check-in status/date provenance and conflict repair, proposal lost-response recovery, denied-role and edited-payload UI variants. The isolated response-loss/internal-write tests are separate evidence, not simulated live outages.

### Booking dispatch live + mobile internal review components (2026-09-08)
- Live on 9ea46bbf, Vercel success verified, owner in TEST Rollprov A. Fixture aplive_20260908_dispatch_booking targets aplive_dispatch_booking_20260908. Deliberately old CANCELLED synthetic booking; reminders marked already handled. This is assignment-path evidence, not active-booking lifecycle certification.
- Preview showed correct project/person/booking/start/end and original assignment Ingen. Cancel left both assigned_to and assigned_user_id null. Final Spara tilldelningen persisted Rollprov Ägare / bu_rollprov_owner, preserved cancelled status and times, persisted original dispatchPlan before null/null and after correct name/member ID.
- Receipt Tilldelningen är sparad matched history before and after full reload. Two preexisting SMS cards untouched. No external sending.
- Found missing booking status in preview. Added Uppdragets status with Swedish labels, verified cancelled=Avbokad in actual backend route harness; this latest presentation addition is not separately live clicked.
- Mobile actual host+adapter now has three dedicated mocked flows for time_attestation/tidrapport_forslag/dispatch_suggestion: visible details and exact CTA, cancel sends no decision, retry uses signed token and returns exact server receipt. 17 review cases pass. Existing actual activity component receipt/remount, approval-list updates and queue API harnesses pass. No iPhone, Expo build or TestFlight evidence.
- Remaining: active-booking variants, work-order phone consistency, legacy missing-plan repair, time proposal response-loss/edited-artifact repair, role-specific/native variants. Earlier isolated CAS/retry tests remain separate from live evidence.
