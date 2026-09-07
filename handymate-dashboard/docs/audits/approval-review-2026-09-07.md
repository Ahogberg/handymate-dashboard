# Handymate – granskning av godkännanden, 7 september 2026

**Bedömning: alla godkännandeflöden är inte godkända för utrullning.** Hannas kampanj visar ett verkligt produktproblem: beslut begärs utan innehåll och mottagare. Källkoden bekräftar att kortet kan köa kundutskick direkt. Ändra kan också godkänna och utföra.

Denna genomgång täcker samtliga **77 registrerade korttyper i pending_approvals**, deras centrala utförandehanterare samt de generiska ingångarna i mobil och webb. Den är en källkodsgranskning och avgränsade mockprov, inte ett intyg om att alla appens övriga specialflöden, betalnings-/signeringssidor eller autonoma körningar har slutprovats.

## Källor och miljö

- Backend: Ahogberg/handymate-dashboard, main `fcc0305438ed7b7d34555f684778e7fdf99f5653`.
- Mobil: Ahogberg/handymate-mobile, main `4ec114c18d22c1458232b4c98534884feeb7ce1d`.
- Användarens observation: TestFlight 1.0.0 build 12, Hanna-kortet på Hem. Bilden visar en beskrivning och Godkänn men ingen fullständig text/mottagarlista.
- Huvudkällor: `app/api/approvals/[id]/route.ts`, `lib/approvals/action-contract.ts`, `lib/jarvis/approval-preview.ts`, mobilens `lib/api.ts`, `components/ApprovalCard.tsx`, Hem och Godkänn. Kampanjkedjan går vidare genom `app/api/cron/send-campaigns/route.ts` och `app/api/campaigns/send/route.ts`.

## Förslag som har implementerats i utkastet

- Första klicket begär en uttryckligt läsande förhandsvisning. Äldre serverversioner avvisar den nya begäran och kan inte råka utföra ett godkännande.
- Full text, samtliga mottagarnas telefonnummer/e-postadresser och kanal visas utan 200-teckensavkortning. E-post visar även ämne. Det sista beslutet heter exempelvis **Bekräfta och köa utskicket**.
- Servern kräver ett kortlivat granskningsbevis bundet till konto, företag, kort, handling, ändringar och förhandsvisat innehåll. Ändring, annat konto, utgången giltighet och återanvänt godkännande går inte att använda för ett nytt utskick. Kontroll sker före både statusändring och retry.
- **11 meddelandetyper** har stöd för granskning av den exakta utgående texten. **7 interna typer** har ett första stöd för visning av sitt underlag och vad som skrivs. Underlag som saknas stoppas.
- **19 informations-/kvittensetyper** utför inte någon kundhandling genom ett generiskt godkännandebeslut.
- **40 andra typer stoppas före utförande i utkastet**. Inga kort försvinner som godkända när fullständig granskning saknas. Detta är ett säkert stopp, inte ett färdigt ersättningsflöde. Ingen klickbar hänvisning till en garanterat komplett specialgranskning är ännu införd.
- Kampanjen byggs först som utkast. Mottagarraderna måste vara sparade innan den blir synlig för utskickskörningen. Databasfel ger felkvittens. Samma godkännandekort får inte skapa en andra kampanj efter ett osäkert utfall.
- Hem skiljer köat utskick från skickat. E-posttexten behandlas som text i HTML-utskicket, så textens HTML-tecken inte ändrar det förhandsvisade innehållet.
- Avbryt, tillbaka, utloggning/kontobyte och bakgrundsläge i den nya mobilgranskningen ska lämna ärendet obehandlat.

## Viktiga återstående brister – hindrar generell utrullning

1. **Fakturor/offert/skicka dokument:** visa det färdiga dokumentet, belopp inklusive relevanta skatter/avdrag/avgifter, alla mottagare inklusive BCC, kanal och exakt meddelande. Bind även dokumentversion och aktuell kundkontakt till beslutet. Fakturera_projekt har redan en underlagssnapshot, men den generiska mobilknappen visar inte hela utskicket.
2. **Bokning/platsbesök/projektavslut:** redovisa både huvudhandlingen och följdutskick. Dynamiska tider och bekräftelser måste förberedas före beslut och får inte ändras under utförandet. Projektavslutets eventuella faktura måste vara ett synligt, separat granskat val.
3. **Paket och automation:** granska varje vald delåtgärd och mottagare, visa delvis framgång och säkra återförsök per delåtgärd. Autonomi behöver tydliga framtida befogenheter, omfattning och återkallelse.
4. **Interna underlag:** tidsattest, checklistor, kundfakta, minnen, publicering och försöksbeslut behöver sina kompletta granskningsvyer. De sju enkla interna typernas nya underlag behöver slutprovas på riktiga testkort. Flera befintliga skrivningar i dispatch/time_attestation saknar företagsscope eller ignorerar fel; de är stoppade i utkastet men deras underliggande implementation är inte reparerad här.
5. **Avvisa har ibland följder:** lead blir lost, fyraögonsoffert återgår till utkast, experimentbeslut blir rejected och autonomi kan återkallas. Generisk avvisa-text förklarar inte detta tillräckligt. Snooze flyttar bara synlighet framåt och skickar inget.
6. **Kvittens genom hela kedjan:** köad kampanj är inte levererad. Kampanj-cron/sändare har egna återförsöks- och delutfallsrisker som inte är end-to-end-slutprovade här. Idempotensskyddet i detta utkast skyddar skapandet från godkännandekortet, inte alla möjliga vägar till själva SMS-leveransen.
7. **Utrullning:** utkastets 40 stoppade typer gör detta olämpligt för generell driftsättning ännu. Ny mobilgranskning kräver en ny appbuild. Servern behöver införas samordnat, annars ska den nya mobilen stoppa när granskning inte stöds. Build 12 får inte betraktas som rättad av lokala ändringar.

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
| `confirm_payment` | Bokför fakturans betalningsbeslut via den delade betalningsfunktionen. | Stopp – komplett granskning återstår |
| `create_booking` | Skapar bokning via boknings-API:t. Nedströms bokningsregler och notiser behöver granskas. | Stopp – komplett granskning återstår |
| `create_quote_draft` | AI genererar och sparar offertutkast; inget kundutskick i denna hanterare. | Internt granskningsunderlag |
| `create_ata_draft` | AI genererar och sparar ÄTA-utkast, med offertutkast som reservväg när projekt saknas. | Internt granskningsunderlag |
| `create_invoice_from_report` | Kvitterar och returnerar navigation till fakturor; skapar ingen faktura. | Stopp – komplett granskning återstår |
| `autopilot_package` | Utför valda delåtgärder: bokning, kund-SMS och materialrader. Projektinformation är en nollhandling. Delvis fel är möjligt. | Stopp – komplett granskning återstår |
| `autonomy_offer` | Beviljar framtida autonomi för en åtgärdstyp. Kan därmed möjliggöra senare utskick utan nytt kortbeslut. | Stopp – komplett granskning återstår |
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
| `propose_booking_times` | Skickar SMS med svar eller föreslagna tider; skapar normalt ingen bokning. | Stopp – komplett granskning återstår |
| `propose_site_visit` | Hämtar tillgängliga tider vid utförandet och bygger/skickar ett SMS då. | Stopp – komplett granskning återstår |
| `reschedule_request` | Skickar SMS med svar eller föreslagna tider; själva ombokningen måste särskiljas från förslaget. | Stopp – komplett granskning återstår |
| `new_booking_request` | Vid quote_signing: skapar bokning och försöker skicka bekräftelse-SMS. Övriga källor: skickar tidsförslag via SMS. | Stopp – komplett granskning återstår |
| `dispatch_suggestion` | Tilldelar person på bokning/arbetsorder. Befintlig hanterare ignorerar databasfel och saknar företagsscope på uppdateringen. | Stopp – komplett granskning återstår |
| `publish_microsite` | Publicerar webbsidan, vilket gör innehållet externt tillgängligt. | Stopp – komplett granskning återstår |
| `invoice_reminder` | Skickar SMS och eventuellt e-post samt uppdaterar påminnelseavgift/ränta och historik. | Stopp – komplett granskning återstår |
| `automation` | Kör en underliggande automationsåtgärd med konfiguration; kan ge andra externa effekter. | Stopp – komplett granskning återstår |
| `price_adjustment` | Ändrar prislistans ordinarie timpris. Ny granskning kräver även identifierande prislistenamn. | Internt granskningsunderlag |
| `fakturera_projekt` | Återskapar fakturaunderlag, jämför med snapshot, skapar och skickar faktura. | Stopp – komplett granskning återstår |
| `project_debrief` | Sparar bekräftade projektlärdomar från svaren; tomma svar är giltiga. | Stopp – komplett granskning återstår |
| `playbook_pattern_confirmation` | Sparar mönster i företagskunskapen och kan skapa separat förslag om ett arbetssättsförsök. | Internt granskningsunderlag |
| `playbook_kickoff_suggestion` | Skapar kontrollpunkt på projektet och kan koppla projektet till ett aktivt försök. | Internt granskningsunderlag |
| `operating_experiment_proposal` | Startar ett internt försök med hypotes, åtgärd, skyddsregler och mätetal. | Stopp – komplett granskning återstår |
| `operating_experiment_readout` | Beslutet fortsätter försöket eller gör arbetssättet till standard; kräver uttryckligt beslut från egen sida. | Stopp – komplett granskning återstår |
| `missad_intakt` | Ger granskningsinformation, ingen faktura eller automatisk intäktsåtervinning. | Stopp – komplett granskning återstår |
| `manual_project_create` | Reparations-/granskningskort, skapar inte projekt via den generiska hanteraren. | Stopp – komplett granskning återstår |
| `jobbpass_proposal` | Kräver separat urval/granskning/publicering. Köbeslut ska inte publicera ett jobbpass. | Stopp – komplett granskning återstår |
| `installation_register` | Kräver separat bekräftelse av installationer rad för rad; köp innebär inte installation. | Stopp – komplett granskning återstår |
| `review_auto_invoice` | Skickar faktura trots klassningen REVIEW_REQUIRED. | Stopp – komplett granskning återstår |
| `four_eyes_quote` | Återställer offerten till utkast efter granskning och skickar intern push till skaparen. Skickar inte offerten till kunden. | Stopp – komplett granskning återstår |
| `four_eyes_project_close` | Avslutar projektet; kan automatiskt skapa och skicka faktura som följd. | Stopp – komplett granskning återstår |
| `deal_flow_site_visit` | Granskningskort utan specifik utförandehanterare i denna route. | Stopp – komplett granskning återstår |
| `lead_review` | Markerar lead som granskad/kvalificerad. Avvisa markerar lead som lost. | Stopp – komplett granskning återstår |
| `time_attestation` | Attesterar incheckning och skapar godkänd, fakturerbar tid. Befintliga databasfel ignoreras; flera skrivningar saknar företagsscope. | Stopp – komplett granskning återstår |
| `tidrapport_forslag` | Skapar godkänd, fakturerbar tid med vald person/projekt/datum/minuter. | Stopp – komplett granskning återstår |
| `checklist_forslag` | Skapar projektchecklista från mallpunkterna. | Stopp – komplett granskning återstår |
| `egenkontroll_foto` | Markerar föreslagna checklistpunkter och kopplar fotoreferens. | Stopp – komplett granskning återstår |
| `egenkontroll_avvikelse` | Kvitterar avvikelsen; avvikelsen behöver fortsatt saklig hantering. | Stopp – komplett granskning återstår |
| `job_report` | Kvitterar arbetsrapport; innebär inte automatiskt fakturering. | Stopp – komplett granskning återstår |
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
| `customer_fact` | Sparar kundfakta/löfte och kan ersätta tidigare fakta samt sätta bevakad deadline. | Stopp – komplett granskning återstår |
| `agent_memory_confirmation` | Bekräftar en redan lagrad minnesrad; det faktiska minnet måste läsas och visas först. | Stopp – komplett granskning återstår |
| `autonomy_revoked` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `team_intro` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `expectation_drift_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `promise_deadline_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `mandate_paused_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `external_delivery_failure_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `payment_failed_signal` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |
| `kort_gar_ut` | Kvitterar att informationen har lästs; utför ingen kundhandling. | Kvittens |

## Verifiering

- 61 riktade Playwright-kontraktstest passerade för granskningsbevis, samtliga registrerade typers säkra behandling, exakta meddelandefält, databasfel, kampanjköning, befintligt handlingskontrakt och visning/redigering. Dessa använder inte en riktig kund eller en produktionssession.
- Separat test kör den faktiska POST-routen med minnesdatabas: äldre klient, edit och retry utan granskningsbevis skriver inget; behörighetskontrollen sker före preview; den bekräftade ändrade texten och mottagaren är exakt de som köas; upprepat klick skapar ingen andra kampanj; projektavslut utan komplett granskning stoppas.
- 10 mobilprov med faktisk granskningskomponent och nätverksadapter: full text/mottagare, avbryt utan exekvering, ändring, dubbelklick, gammal server, nätverksfel utan automatisk omkörning, fel trots HTTP 200, bakgrundsläge, kontobyte och avmontering. React Native-primitiver och nätverk är mockade.
- Mobilens sju ändrade TS/TSX-filer passerade syntaxkontroll. Detta ersätter inte full typkontroll/build av Expo-projektet.
- Webbens visuella dialogprov kunde inte köras: nedladdningen av lokal Chromium misslyckades.
- Full backend-typkontroll stöter på tre befintliga fel kring den saknade `lib/portal/review` och dess användning. Inga fel i de nya granskningsfilerna rapporterades i den körningen.
- Ingen verklig kampanj, e-post, SMS, faktura, bokning eller publicering utfördes. Ingen merge eller driftsättning har gjorts. TestFlight och webbens fulla användarresor återstår.

## Manuella slutprov efter färdigställande och ny build

1. Öppna Hanna-kampanj från Hem och Godkänn. Kontrollera hela texten, alla mottagare och köknapp.
2. Avbryt och kontrollera att kortet är kvar och ingen kampanj är köad.
3. Ändra text, gå vidare till granskning, avbryt och återuppta. Ingen ändring får skickas förrän sista beslutet.
4. Bekräfta med isolerad testsändare. Jämför mottagare och text i granskning, kö och utgående meddelande.
5. Upprepa med lång text, många mottagare, dålig uppkoppling, bakgrundsläge och kontobyte.
6. Kör varje återstående typ från matrisen när dess fulla granskning är byggd, inklusive Avvisa och misslyckad/delvis lyckad handling.
