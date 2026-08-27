# Inventering av Handymates utgående kommunikation

**Datum:** 2026-08-26  
**Metod:** read-only källkodsspårning  
**Omfattning:** SMS, e-post, webb-/mobilpush, interna appnotiser och godkännandekort som aviserar eller kan utlösa extern kommunikation.

## 1. Sammanfattning

Handymate har redan en stor och värdefull kommunikationsyta, men inte ännu en enda sanningsenlig kommunikationsmotor.

Det viktigaste fyndet är asymmetrin mellan transporterna:

- **SMS har en verklig strypunkt** i [`lib/sms-send.ts`](../../lib/sms-send.ts). Där finns telefonnormalisering, STOPP/START, tenantkontroll, frekvensspärr för proaktiva meddelanden, Bränsletak, abonnemangskvot, kostnadsmätning, leveranslogg och spegling till kundens konversation.
- **E-post saknar motsvarande strypunkt.** Offert, faktura, portal, nurture, teaminbjudningar, partnerflöden och systemmejl använder flera olika Resend-/Gmail-vägar med olika loggning och felhantering.
- **Push har en transportväg men ingen säker intern gräns.** [`POST /api/push/send`](../../app/api/push/send/route.ts) använder service role och accepterar `business_id`, titel och text utan auth eller intern signatur.
- **Händelsestyrningen är fragmenterad.** Samma kundögonblick kan hanteras av V3-regler, Smart Communication, nurture, specialcron, projektsteg eller en direkt route.
- **Den befintliga sidan `/dashboard/communication` ser ut som början på den önskade hubben, men flera reglage är bara delvis kopplade.** Att visa dem som heltäckande av/på-knappar vore missvisande.
- **E-postmallredigeraren är frikopplad från skarpa utskick.** `email_template` läses bara av mall-CRUD/UI; ingen faktisk sändare hämtar mallarna.

### Bedömning

Bygg inte hubben genom att bara flytta dagens reglage till en ny sida. Först behövs ett kanoniskt eventregister och adapterkopplingar från varje faktisk sändväg. Annars får kunden knappar som säger “av” medan ett annat subsystem fortfarande skickar.

### Säkerhets- och sanningsfynd som bör stängas före hubben

1. Flera servermoduler anropar den sessionsautentiserade `/api/sms/send` utan cookie och får därför normalt 401.
2. V3-motorns `send_email` anropar en route som inte finns: `/api/email/send`.
3. Smart Communications e-postkanal skickar ingen e-post alls; `both` blir bara SMS.
4. Offert- och fakturautskick kan även trigga en andra gammal Smart Communication-väg.
5. Tre separata offertuppföljningsmotorer och flera recensions-/bokningspåminnelsevägar överlappar.
6. Flera UI- och servervägar kontrollerar inte HTTP-/SDK-resultatet och kan visa eller logga falsk framgång.

Detta är **källkodsbevis**, inte ett leveransprov mot 46elks, Resend, Gmail, Expo eller en specifik tenants aktiva regelrader.

## 2. Status- och kontrollbegrepp

| Markering | Betydelse |
|---|---|
| Aktiv | Anropskedja till en riktig transport finns. |
| Villkorad | Fungerar bara om regel, inställning, integration eller approval är aktiv. |
| Manuell | En människa initierar just utskicket. |
| Godkännandegatad | Utskicket sker först efter ett pending approval-beslut. |
| Trasig | Källan visar en bestämd blockerare, exempelvis 401 eller saknad route. |
| Död/frikopplad | Kod/data finns men ingen aktuell produktionskonsument hittades. |
| Systemlåst | Ska inte kunna stängas av eller skrivas om av tenantens kommunikationshub. |

“Budskap” nedan sammanfattar vad kunden faktiskt får veta. Dynamiska, agentformulerade texter anges som sådana i stället för att låtsas vara fasta mallar.

## 3. Transporter och sanningskällor

### 3.1 SMS

Kanonisk transport är [`sendSmsViaElks`](../../lib/sms-send.ts). Den är den starkaste delen att återanvända i hubben.

Den säkrar:

- svensk telefonnormalisering till E.164;
- kundens STOPP/START;
- tenant + kund + telefon;
- samordning av proaktiv kontakt;
- idempotens när ett approval-id finns;
- Bränsletak och SMS-kvot;
- antal SMS-delar och faktisk kostnad;
- lyckad/misslyckad rad i `sms_log`;
- kundhistorik i `sms_conversation`.

Den säkrar **inte** att alla callsites använder rätt `recipient`, `purpose`, eventnamn eller läser svaret. Den kan inte heller hjälpa de servervägar som först går genom en auth-route och stoppas före helpern.

### 3.2 E-post

Följande parallella leveransvägar finns:

- [`lib/email.ts`](../../lib/email.ts): generell Resend-fetch, valfri separat `communication_log`.
- [`app/api/quotes/send`](../../app/api/quotes/send/route.ts): Gmail om kopplad, annars Resend; offertspecifik HTML och spårningspixel.
- [`lib/invoices/send-invoice.ts`](../../lib/invoices/send-invoice.ts): egen Resend-SDK och fakturamall.
- [`lib/portal/notification-emails.ts`](../../lib/portal/notification-emails.ts): egen Resend-fetch, portalbranding och `portal_notification_log`.
- [`lib/nurture.ts`](../../lib/nurture.ts): använder `lib/email.ts` med nurture-mall.
- team-, partner-, order- och vissa fakturarutter: direkt Resend-SDK.
- lösenordsåterställning: separat systemmejl.

Konsekvensen är att ingen gemensam inställning i dag kan garanterat stoppa, förhandsvisa eller skriva om alla affärsmejl.

### 3.3 Push

[`/api/push/send`](../../app/api/push/send/route.ts) levererar webbpush och Expo-push. Den kan rikta till hela företaget eller ett `target_user_id`.

Två viktiga presentationslager finns:

- [`sendApprovalPush`](../../lib/notifications/approval-push.ts): typade mallar för ett begränsat antal approval-/signalslag.
- [`schedule-push`](../../lib/notifications/schedule-push.ts): boknings- och schematilldelning till medarbetare.

Okända approval-typer får ingen push. Ett skapat kort är därför inte samma sak som ett aviserat kort.

### 3.4 Appnotiser

[`lib/notifications.ts`](../../lib/notifications.ts) skriver till `notification` och används för bland annat ny lead, offert öppnad/signerad, missat samtal, faktura betald/förfallen, nurture-slut och eskalering.

Det finns även direkta inserts utanför helpern. Storefront-kontakten skriver exempelvis `body` där den kanoniska helpern använder `message`; detta är en schemarisk och bör inte bli förebild för hubben.

## 4. Fullt eventregister: kundkommunikation

### 4.1 Förfrågan, samtal och ny kund

| Föreslagen eventnyckel | Trigger | Kanal / mottagare | Budskap | Textkälla och kontroll | Status / ägare |
|---|---|---|---|---|---|
| `lead.received.owner_alert` | Golden Path skapar lead/deal | SMS till företagets nummer | Ny lead, källa, namn, telefon, meddelandeutdrag och länk till pipeline | Hårdkodad i [`lib/leads/golden-path.ts`](../../lib/leads/golden-path.ts); ingen separat toggle | Aktiv, intern; system-/produktkontroll |
| `lead.received.customer_ack` | `fireEvent('lead_received')` | SMS till kund | Tack för förfrågan; företaget återkommer | V3-regel i [`lib/seed-defaults.ts`](../../lib/seed-defaults.ts); kan togglas/redigeras som regel | Villkorad, automatisk; Lisa/Matte-domän |
| `lead.received.legacy_ack` | `lead_created` hos äldre/andra producenter | SMS till kund | Kort generiskt tack | Äldre seed i [`sql/v3_seed_rules.sql`](../../sql/v3_seed_rules.sql); skiljer sig från live-seeden | Villkorad; tenantvariation |
| `call.missed.customer_reply` | missat inkommande samtal | SMS till uppringaren | Samtalet missades; svara med vad som behövs eller invänta återuppringning | V3 `call_missed`-regel; text skiljer mellan två seedkällor | Villkorad, automatisk; Lisa |
| `call.missed.owner_notification` | missat samtal | Appnotis till företaget | Missat samtal, nummer/kund, ring tillbaka | [`notifyMissedCall`](../../lib/notifications.ts) | Aktiv appnotis; Lisa |
| `sms.incoming.owner_notification` | inkommande SMS | Push till företaget | Nytt SMS, telefon och meddelande | Äldre V3-regel `sms_received`; bara om regeln finns/är aktiv | Villkorad; Lisa |
| `lead.onboarding_test.customer` | onboardingens testanrop | SMS till testaren | Lisa presenterar hur snabbt hon svarar kunder | Hårdkodad i [`app/api/voice/incoming`](../../app/api/voice/incoming/route.ts) | Aktiv testkontakt; bör ligga utanför vanlig hubb |
| `lead.nurture.*` | uttrycklig nurture-registrering | SMS/e-post till lead | Dag 0 tack, dag 3 välkomstmejl, dag 7 kontrollfråga | Stegdata i [`lib/nurture.ts`](../../lib/nurture.ts); sekvens kan armeras/stoppas | Villkorad; marknads-/säljflöde |
| `web_booking.customer_confirmation` | kund bokar via publik hemsida | SMS till kund | Datum och tid är bokade | Hårdkodad i [`app/api/public/book/[slug]`](../../app/api/public/book/[slug]/route.ts) | Aktiv, transaktionell |
| `web_booking.owner_alert` | samma bokning | SMS till företagets nummer | Ny webbokning, kontakt, tid och tjänst | Samma route | Aktiv, intern |
| `widget.lead.owner_notification` | widget skapar lead | Appnotis | Ny lead från hemsidan + telefon/e-post | Direkt insert i [`app/api/widget/chat`](../../app/api/widget/chat/route.ts) | Aktiv appnotis |
| `storefront.lead.owner_notification` | storefront-formulär | Appnotis | Ny förfrågan och textutdrag | Direkt insert i [`app/api/storefront/contact`](../../app/api/storefront/contact/route.ts) | Osäker: skriver `body` i stället för `message` |

### 4.2 Offert

| Eventnyckel | Trigger | Kanal / mottagare | Budskap | Textkälla och kontroll | Status / ägare |
|---|---|---|---|---|---|
| `quote.sent.customer_email` | användare/approval skickar offert | Gmail eller e-post till kund + extra mottagare | Offerttitel, dokument, portal/signering och PDF | Offertspecifik HTML i [`app/api/quotes/send`](../../app/api/quotes/send/route.ts); innehåll/ämne ej kopplat till `email_template` | Aktiv, manuell/gatad; Daniel |
| `quote.sent.customer_sms` | samma sändning, metod SMS/båda | SMS till kund | Offerten finns, länk och avsändare | Hårdkodad i samma route | Aktiv, manuell/gatad; Daniel |
| `quote.sent.legacy_smart_message` | efter lyckad offertsend | normalt SMS till kund | “Du har fått en offert … se den här” | Global `communication_rule`; körs via `setTimeout` och kan dubblera direkt-SMS | Villkorad och opålitlig; bör avvecklas/migreras |
| `quote.opened.owner_notification` | första öppningen | Appnotis + ev. V3 push | Kunden läser offerten nu; bra läge att höra av sig | [`track-open`](../../lib/quotes/track-open.ts), `notifyQuoteOpened`, V3 `notify_owner` | Aktiv appnotis; push villkorad |
| `quote.followup.round_1` | obesvarad offert efter intervall | SMS/agentförslag | Personlig fråga om kunden hunnit titta | Specialcron + agent i [`app/api/cron/quote-follow-up`](../../app/api/cron/quote-follow-up/route.ts), eller V3 threshold | Villkorad; Daniel |
| `quote.followup.round_2` | nästa intervall | e-post/agentförslag | Påminnelse och möjlighet att ställa frågor | Specialcron; V3 `send_email` är trasig om den används direkt | Villkorad |
| `quote.followup.round_3` | tredje intervall | SMS/agentförslag | Sista uppföljningen | Specialcron | Villkorad |
| `quote.followup.nurture_*` | offert enrollas i nurture | dag 3 SMS, dag 7 e-post, dag 14 SMS | Flerstegs offertuppföljning | Defaultsekvens i `lib/nurture.ts` | Aktiv endast om enrollad; överlappar specialcron/V3 |
| `quote.expiry.customer_nudge` | offert nära sista giltighetsdag | SMS till kund | Offerten går snart ut; möjlighet att fråga/gå vidare | Specialcron; respekterar automationsinställning | Villkorad; Daniel |
| `quote.nudge.approval` | Daniel/agent föreslår uppföljning | approval → SMS | Payloadens föreslagna text | `quote_nudge` i approval-exekveraren | Godkännandegatad; Daniel |
| `quote.signed.customer_email` | publik signering | e-post till kund | Tack för godkännandet; vid ROT även kontroll av person-/fastighetsuppgifter | [`lib/quote-confirmation-email.ts`](../../lib/quote-confirmation-email.ts), toggle `quote_signed_email_enabled` | Aktiv, valbar; Daniel |
| `quote.signed.customer_sms_legacy` | auth-route `/quotes/accept` | SMS till kund | Tack för signaturen; företaget återkommer med starttid | Intern fetch utan session | **Trasig 401-väg** |
| `quote.signed.owner_notification` | signering | appnotis och typad push | Kund, belopp, offert/projekt | `notifyQuoteSigned` + `sendApprovalPush('quote_signed')` | Aktiv; vissa push-deeplinks saknar `/dashboard` |
| `quote.question.owner_card` | kund frågar i portal/offertyta | approval/push om typen stöds | Kundens fråga och svarsförslag | `customer_quote_question` | Kort aktivt; ingen typad pushmall för typen |
| `quote.question.customer_reply` | hantverkaren skriver svar och godkänner | portalsvar + kort SMS med portallänk | “Nytt svar finns i portalen” | [`lib/portal/customer-thread.ts`](../../lib/portal/customer-thread.ts) + approval-route | Godkännandegatad |

### 4.3 Bokning, schema och ankomst

| Eventnyckel | Trigger | Kanal / mottagare | Budskap | Textkälla och kontroll | Status / ägare |
|---|---|---|---|---|---|
| `booking.created.customer_confirmation` | bokning skapas via åtgärd/publik vy | SMS till kund | Bokningen bekräftas med datum/tid | Flera callsites, bland annat `/api/actions` och publik bokning | Aktiv men inte en enda mall |
| `booking.reminder.24h` | besök om cirka 24 timmar | SMS till kund | Påminnelse om besök och tid | Minst tre motorer: `/api/reminders`, `lib/booking-reminders`, V3 threshold | En aktiv kanonisk väg + **trasig duplicerad serverväg** + möjlig V3-dubblett |
| `booking.proposed_times` | agent föreslår tider | approval → SMS | Lista med lediga tider; kunden väljer | `propose_booking_times`, `new_booking_request` | Godkännandegatad; Matte/Lisa |
| `booking.reschedule_request` | ombokningsförslag | approval → SMS | Nytt tidsförslag | Samma approval-case samt förslagsmotor | Godkännandegatad |
| `booking.site_visit.customer` | platsbesök bokas/föreslås | SMS till kund | Datum/tid eller förslag på 1–3 tider | Pipeline-UI och `propose_site_visit` | Manuell/gatad; flera textkällor |
| `booking.site_visit.employee` | medarbetare tilldelas platsbesök | SMS till medarbetare | Kund, jobb, datum/tid och anteckning | Pipeline-UI fire-and-forget | Aktiv men UI läser inte svaret |
| `booking.site_visit.subcontractor` | extern UE bjuds in | SMS till extern part | Inbjudan, jobb, datum/tid och anteckning | Pipeline-UI fire-and-forget | Aktiv men klassas av `/api/sms/send` som kundutskick |
| `booking.on_my_way` | hantverkaren trycker “på väg” | SMS till kund | Beräknad ankomsttid | [`lib/on-my-way.ts`](../../lib/on-my-way.ts) | Aktiv, manuell; befintligt generellt toggle är inte säkert kopplat |
| `booking.assignment.employee_push` | bokning tilldelas annan användare | webb-/mobilpush | Ny bokning, kund, datum och tid | [`schedule-push`](../../lib/notifications/schedule-push.ts) | Aktiv, intern |
| `schedule.assignment.employee_push` | schemapost tilldelas | webb-/mobilpush | Nytt pass, titel, datum och tid | Samma helper | Aktiv, intern |
| `work_order.employee_sms` | arbetsorder skickas | SMS till medarbetare | Arbetsorderns tider, plats och arbetsinformation | [`app/api/work-orders/[id]/send`](../../app/api/work-orders/[id]/send/route.ts) | Aktiv, manuell, intern |
| `booking.completed.review_sms` | avslut från bokningsdetalj | SMS till kund | Recensions-/betygsfråga | UI-skapad text | Aktiv, men UI kontrollerar inte `response.ok` innan aktivitet markeras |

### 4.4 Projekt, ÄTA, rapport och portal

| Eventnyckel | Trigger | Kanal / mottagare | Budskap | Textkälla och kontroll | Status / ägare |
|---|---|---|---|---|---|
| `project.created.owner_alert` | projekt skapas från vunnen offert/lead | SMS till ägare | Vunnen deal, projekt, kund, budget och länk | `create-from-quote/lead` via auth-route | **Trasig 401-väg** |
| `project.created.customer_portal_sms` | samma projektstart | SMS till kund | Projektet har startats; följ i portalen | Samma moduler | **Trasig 401-väg** |
| `project.stage.work_started_sms` | legacy-projektsteget markeras | SMS till kund | Arbetet påbörjat; följ status i portalen | `STAGE_SMS` i [`app/api/projects/[id]/stages`](../../app/api/projects/[id]/stages/route.ts) | Aktiv direkt, ingen approval/toggle |
| `project.stage.done_sms` | legacy-steget “klart” | SMS till kund | Arbetet klart; tack för förtroendet | Samma route | Aktiv direkt, ingen approval/toggle |
| `project.workflow.contract_signed_sms` | kanoniskt workflow-steg | approval → SMS | Signerad offert mottagen; startdatum kommer | Default i [`project-stages/automation-engine`](../../lib/project-stages/automation-engine.ts) | Godkännandegatad; Lars |
| `project.workflow.job_started_sms` | kanoniskt workflow-steg | approval → SMS | Arbetet har startat; följ i portal | Samma | Godkännandegatad; Lars |
| `project.workflow.payment_thanks_sms` | workflow når betald | approval → SMS | Tack för betalningen | Samma | Godkännandegatad; Karin |
| `project.stage.custom_action` | företagsspecifik stageautomation | approval | `sms_template` eller annan action | `project_stage_automations` | Villkorad och redigerbar per steg; gatad |
| `project.stage.portal_update_email` | workflow-steg ändras | e-post till kund | Projektnamn, ny fas och portallänk | Portalns hårdkodade `project_update` | Aktiv om portal + e-post; ingen eventtoggle |
| `project.milestone.completed_sms` | milstolpe klar | SMS till kund | Milstolpe, projekt, antal klara och portal | Intern fetch mot auth-route | **Trasig 401-väg** |
| `project.photos_added.customer_email` | fältrapport med bilder | e-post till kund | Nya bilder finns i portalen | Portal `photos_added` | Aktiv om portal + e-post |
| `project.portal.new_message_email` | företaget skriver i portaltråd | e-post till kund | Nytt meddelande + utdrag + portallänk | Portal `new_message` | Aktiv; 1h eventdedup |
| `project.portal.reply_notice_sms` | svar på kundfråga godkänns | SMS till kund | Nytt svar finns i portalen | Kundtrådshelper | Aktiv efter approval |
| `project.portal.claim_welcome_sms` | kund aktiverar/claimar portal | SMS till kund | Välkomst-/portalinformation | [`app/api/portal/[token]`](../../app/api/portal/[token]/route.ts) | Aktiv, transaktionell |
| `project.job_report.customer_email` | jobbrapport godkänns | e-post till kund | Utfört arbete, material, garanti och PDF-länk | [`lib/job-report.ts`](../../lib/job-report.ts) | Aktiv, men caller kan fortsätta trots sändfel |
| `project.field_report.signed_owner_sms` | kund signerar fältrapport | SMS + push till företag | Vem signerade vilken rapport | [`app/api/field-reports/[id]/sign`](../../app/api/field-reports/[id]/sign/route.ts) | Aktiv, intern |
| `project.field_report.rejected_owner_sms` | kund invänder | SMS + push till företag | Rapport, kund och kommentar | Samma route | Aktiv, intern |
| `ata.sent.customer_sms` | ÄTA skickas | SMS till kund | Tilläggsarbetet och signeringslänk | [`app/api/ata/[id]/send`](../../app/api/ata/[id]/send/route.ts) | Aktiv, manuell/gatad; Daniel |
| `ata.signed.owner_push` | kund signerar ÄTA | approval + push | Kund, ÄTA-nummer, belopp, granska för fakturering | typad `ata_signed_notification` | Aktiv; Daniel/Karin |
| `ata.declined.owner_push` | kund avböjer ÄTA | approval + push | ÄTA-nummer och skäl | typad `ata_declined_notification` | Aktiv |

### 4.5 Faktura, betalning och recension

| Eventnyckel | Trigger | Kanal / mottagare | Budskap | Textkälla och kontroll | Status / ägare |
|---|---|---|---|---|---|
| `invoice.sent.customer_email` | faktura skickas | e-post till kund | Fakturanummer, belopp, förfallo-/betaluppgifter, PDF/portal | [`lib/invoices/send-invoice.ts`](../../lib/invoices/send-invoice.ts) | Aktiv, manuell/gatad/automatisk; Karin |
| `invoice.sent.customer_sms` | samma sändning om valt | SMS till kund | Fakturanummer, att betala, förfallodatum och länk | Samma kärna | Aktiv; Karin |
| `invoice.sent.legacy_smart_message` | efter fakturaskick | normalt extra SMS | Kort fakturanotis | Global `communication_rule` via Smart Communication | Villkorad/opålitlig och möjlig dubblett |
| `invoice.auto_generated.customer_email` | äldre auto-generate-route | e-post till kund | Auto-genererad faktura | Separat [`app/api/invoices/auto-generate`](../../app/api/invoices/auto-generate/route.ts) | Aktiv separat skriv-/sändväg; konsolideringskandidat |
| `invoice.reminder.customer_sms` | manuell eller cron/approval | SMS till kund | Förfallen faktura, belopp, avgift/ränta/betalinfo | Delad [`lib/invoice-reminder-send.ts`](../../lib/invoice-reminder-send.ts) eller manuell route; `business_config.reminder_sms_template` är verkligt kopplad | Aktiv; Karin |
| `invoice.reminder.customer_email` | normalt från andra påminnelsen | e-post till kund | Formell betalningspåminnelse | Delad reminder-helper | Aktiv, men Resend-SDK-resultatets `error` läses inte |
| `invoice.overdue.portal_email` | manuell påminnelse | e-post till kund | Vänlig portalpåminnelse om förfallen faktura | Portal `invoice_overdue` | Aktiv; kan bli extra e-post ovanpå remindermejl |
| `invoice.reminder.v3_day1` | V3 threshold hos äldre tenants | SMS till kund | Dag-1-påminnelse | Äldre seedregel | Villkorad och potentiellt överlappande med reminder-cron |
| `invoice.reminder.nurture_*` | invoice_overdue-sekvens enrollas | dag 1 SMS, dag 7 e-post, dag 14 SMS | Trestegspåminnelse | Default nurture | Villkorad; aktuell automatisk enroll-källa är inte generell |
| `invoice.paid.customer_portal_email` | betalning appliceras | e-post till kund | Tack för betalningen; ev. CTA till recension | Portal `invoice_paid` | Aktiv om portal + e-post |
| `invoice.paid.customer_sms_legacy` | manuell status-route | SMS till kund | Tack för betalningen | Intern fetch utan session | **Trasig 401-väg** |
| `invoice.paid.owner_notification` | betalning registreras | appnotis | Fakturanummer, kund och belopp | `notifyInvoicePaid` | Aktiv om callsite använder helpern |
| `invoice.overdue.owner_notification` | förfall signaleras | appnotis | Kund, belopp och dagar sen | `notifyInvoiceOverdue` | Villkorad |
| `review.request.customer_sms` | projekt/faktura är klar/betald | approval eller autonom SMS | Personlig recensionsfråga och Google-/portallänk | Delad `buildReviewRequestMessage`; produceras av flera crons och statusflöden | Aktiv men flera producenter överlappar; 180-dagarsflagga dämpar delvis |
| `review.request.customer_email` | maintenance eller portalhändelse | e-post till kund | Feedback-/recensionsförfrågan | Portal `review_request` | Aktiv; kan kombineras med SMS |
| `review.request.owner_push` | recensionskort skapas | push | Hanna har förberett SMS; godkänn | typad `review_request` | Aktiv när rätt callsite använder helpern |

### 4.6 Återköp, vård och kampanj

| Eventnyckel | Trigger | Kanal / mottagare | Budskap | Textkälla och kontroll | Status / ägare |
|---|---|---|---|---|---|
| `customer.proactive_care` | Hanna hittar relevant återkontakt | approval → SMS | Agentens föreslagna service-/omsorgstext | `proactive_care` payload | Godkännandegatad, proaktiv |
| `customer.warranty_followup` | garantiuppföljning | approval → SMS | Agentens föreslagna garanti-/servicefråga | `warranty_followup` payload | Godkännandegatad, proaktiv |
| `customer.yearly_followup` | årsuppföljning | approval → SMS | Kontroll efter tidigare jobb | delad årsuppföljningsbyggare | Godkännandegatad, proaktiv |
| `customer.reactivation` | inaktiv kund föreslås | approval → SMS | Föreslagen återaktivering | `customer_reactivation` payload | Godkännandegatad, proaktiv |
| `campaign.seasonal` | agentens säsongsförslag godkänns | skapar kampanjkö | Kampanjens föreslagna SMS till valda kunder | `seasonal_campaign`; approval skapar mottagarrader men skickar inte direkt | Villkorad |
| `campaign.manual` | användaren skickar kampanj | SMS till segment | Kampanjens fria text | [`app/api/campaigns/send`](../../app/api/campaigns/send/route.ts) | Aktiv, manuell; ska länkas från hubb, inte döljas som eventtoggle |
| `nurture.step.sms` | aktiv sekvens når steg | SMS | Stegets tenant-/systemtext | `nurture_sequence.steps` | Villkorad; explicit armerad, proaktiv |
| `nurture.step.email` | aktiv sekvens når steg | e-post | Stegets ämne/text | samma | Villkorad |
| `nurture.completed.owner_notification` | sekvens tar slut utan konvertering | appnotis + AI-förslag | Manuell uppföljning rekommenderas | `notifyNurtureComplete`/`notifyEscalation` | Aktiv om sekvensen körs |

### 4.7 Generiska, manuella och agentskrivna vägar

| Eventnyckel | Trigger | Kanal | Budskap | Kontroll | Status |
|---|---|---|---|---|---|
| `customer.manual_sms` | kundkort, pipeline, telefoninställning eller SMS-konversation | SMS | användarens fria text | auth-route + central SMS-grind | Aktiv; vissa UI:n läser inte `response.ok` |
| `agent.customer_sms` | specialistverktyg | direkt eller approval-SMS | modellens förslag/verktygsparametrar | agentallowlist + action contract + approval/autonomi | Aktiv via direkt helper; en intern executor är trasig, se fynd |
| `agent.customer_email` | specialistverktyg | Gmail/Resend eller approval-e-post | modellens text | agentallowlist + approval/autonomi | Aktiv i huvudverktyget; V3 `send_email` är en annan trasig väg |
| `matte.customer_reply` | Matte svarar extern kund | approval → SMS | kundanpassat svar | `send_matte_customer_reply` | Aktiv, godkännandegatad |
| `voice.customer_followup_sms` | Lisa/voice execute | SMS | röstflödets bekräftelse/uppföljning | direkt central SMS-helper | Aktiv och bör senare mappas till en explicit voice-eventnyckel |

## 5. Intern kommunikation till företag och team

| Eventnyckel | Kanal / mottagare | Budskap | Nuvarande källa | Hubbrekommendation |
|---|---|---|---|---|
| `owner.morning_report` | SMS + push till ägare | dagens bokningar, offerter, fakturor och agentinsikter | [`lib/agent/morning-report.ts`](../../lib/agent/morning-report.ts) | Eget internt reglage; textens faktadel ej fritt redigerbar |
| `owner.monthly_review` | SMS + approval till ägare | månadssammanfattning och rekommendationer | monthly-review-cron | Internt reglage; rapportinnehållet är data, inte malltext |
| `owner.first_value_event` | engångs-SMS till ägare | Lisa/Daniel/Karin gjorde första meningsfulla jobbet | [`lib/onboarding/first-event-sms.ts`](../../lib/onboarding/first-event-sms.ts) | Onboardingprodukt, normalt systemlåst |
| `owner.referral_reward` | SMS till ägare | värvad kollega aktiverad; rabatt | referral-helper | Affärssystemnotis; systemlåst text |
| `owner.invoice_closeout_result` | SMS till ägare | faktura skapad/skickad eller kräver åtgärd | auto-invoice-on-complete | Avsedd men **trasig 401-väg** |
| `owner.project_won` | SMS till ägare | vunnen affär och projekt | create-from-quote/lead | Avsedd men **trasig 401-väg** |
| `owner.field_report_result` | SMS + push | rapport signerad/avvisad | field-report sign-route | Internt valbart alarm |
| `employee.booking_assignment` | push | ny bokning tilldelad | schedule-push | Personligt reglage, inte tenantens kundmall |
| `employee.schedule_assignment` | push | nytt pass | schedule-push | Personligt reglage |
| `employee.work_order` | SMS | arbetsorderdetaljer | work-order-route | Manuell, verksamhetskritisk |
| `owner.approval_required` | push | typat kort behöver beslut | approval-push | Personligt/push-reglage; själva approvaln får aldrig stängas av |
| `owner.agent_observation` | push | specialist har observation/förslag | shared save-and-push | Valbar delivery, men observationen ska finnas i appen |
| `owner.agent_insight` | push | specialist märkte något | syntetisk approval-push | Valbar delivery |
| `owner.monday_brief` | push | måndagsmötet är redo | monday-brief | Valbar delivery |
| `owner.meeting_reminder` | push | kommande möte | meeting-reminders-cron | Valbar delivery |
| `owner.weekly_business_insights` | push | veckans rekommendationer | generate-insights-cron | Valbar delivery; separat från agent-insight-mallen |
| `owner.quote_nudge_ready` | push | kunden har tittat flera gånger; offertnudge finns att granska | quote-nudge-autopilot | Valbar delivery; direkt generisk push |
| `owner.autopilot_package_ready` | push | offert accepterad och flera förslag är redo | autopilot-trigger | Valbar delivery; direkt generisk push |
| `owner.invoice_reminder_approval` | push | fakturapåminnelse väntar på beslut | send-reminders-cron | Approvaln ska finnas även om push stängs av |
| `owner.profitability_warning` | push + approval | projektbudget överskriden; överväg ÄTA | profitability-helper | High-value intern signal; direkt generisk push |
| `owner.supplier_price_alert` | push | bevakad artikel har blivit billigare | manuell leverantörssynk | Döljs inför lansering tillsammans med leverantörsdelen |
| `owner.website_proposal` | typad push + approval | Hanna har byggt ett publiceringsförslag | hemsida-förslag-cron | Approvaln ska finnas; delivery valbar |
| `owner.payment_failure` | e-post + ev. frånvaropush | Handymatebetalningen misslyckades | billing-webhook/driftlarm | Systemlåst; måste alltid kunna nå kontot |
| `owner.external_delivery_failure` | frånvaropush | en extern åtgärd gick inte fram | driftlarm | Systemlåst säkerhetsnotis |
| `owner.porting_request` | appnotis | nummerportering begärd | klientinsert från telefoninställning | Bör vara Handymate-opsärende, inte egen tenantnotis |

### Pushmallarnas faktiska slutna lista

`sendApprovalPush` renderar bara följande typer: `four_eyes_quote`,
`ata_signed_notification`, `ata_declined_notification`, `review_request`,
`quote_signed`, `publish_microsite`, `agent_observation`, `agent_insight`,
`payment_failed_signal`, `external_delivery_failure_signal` och
`monday_brief`. Alla andra approval-typer returnerar `null` och får ingen
push via helpern. Generiska `/api/approvals` och flera crons skickar samtidigt
egna fria pushtexter direkt till `/api/push/send`, så en framtida pushinställning
måste omfatta både den typade listan och dessa direkta producenter.

## 6. System-, säkerhets- och tredjepartsmeddelanden

Dessa ska finnas i inventeringen men **inte** kunna stängas av eller fritt redigeras i företagets kundkommunikationshub.

| Händelse | Kanal / mottagare | Innehåll | Källa |
|---|---|---|---|
| Lösenordsåterställning | e-post till användare | säker återställningslänk | [`lib/auth/password-reset-email.ts`](../../lib/auth/password-reset-email.ts) |
| Team-inbjudan / påminnelse | e-post till medarbetare | inbjudare, företag, accepteralänk | team invite-rutter |
| Handymates betalning misslyckades | e-post till kontot + internt opsmejl | betalproblem och åtgärd | billing-webhook |
| Supporteskalering | SMS till Handymates fasta journummer | kategori, företag, sammanfattning, ticket-id | [`handymate-team-alert`](../../lib/notifications/handymate-team-alert.ts) |
| Driftlarm | e-post till Handymate ops | automations-/leveransfel | driftlarm-cron |
| Onboarding vecka 1 | e-post till företaget | produktuppföljning från Handymate | onboarding-followup-cron |
| Partneransökan / partnergodkännande | e-post till Handymate/partner | ansökan eller välkomstinfo | partner-rutter |
| Materialbeställning | e-post till leverantör | orderrader, märkning, kundnummer | [`app/api/orders/send`](../../app/api/orders/send/route.ts) |
| Partnerwebhook | webhook till partner | trial, konvertering, churn | [`lib/partners/webhook.ts`](../../lib/partners/webhook.ts) |
| Debug/test | SMS/e-post/push | tekniskt testmeddelande | `/api/debug/*`, `/api/test/*`, push-test och inställningssidor |

Materialbeställning är verksamhetskommunikation men manuellt initierad och riktad till leverantör. Hubben kan visa den som en kanalöversikt, men ska inte göra den till en automatisk kundstadietoggle.

## 7. Vad dagens inställningar faktiskt styr

### 7.1 Befintliga ytor

1. **`/dashboard/communication`** skriver `communication_settings`:
   - automatik på/av;
   - ton;
   - max meddelanden per kund/vecka;
   - bokningsbekräftelse;
   - dagen-innan-påminnelse;
   - “på väg”;
   - offertuppföljning;
   - avslutat jobb;
   - fakturapåminnelse;
   - recension;
   - tysta timmar.
2. **Automationsinställningar** skriver parallella `automation_settings.sms_*` och synkar vissa värden bakåt till `communication_settings`.
3. **V3-regelsidan/API:t** togglar/redigerar `v3_automation_rules`.
4. **Projektstegsautomationer** bär egna `sms_template` per steg.
5. **Fakturainställningar** har `reminder_sms_template`, som faktiskt används av både manuell och automatisk reminderleverans.
6. **Offertgodkännande** har `quote_signed_email_enabled`, som faktiskt läses av bekräftelsemejlet.
7. **Recensionsinställningar** har enable, delay och Google-länk, men flera producenter måste fortfarande samordnas.
8. **E-postmallar** lagras i `email_template`, men används inte av skarpa sändningar.
9. **Nurture** har egna aktiva sekvenser och stegtexter.
10. **Kampanjer** har egen fri SMS-text och mottagarlista.

### 7.2 Reglagens verkliga täckning

| Nuvarande reglage | Verklig täckning | Lucka |
|---|---|---|
| `sms_auto_enabled` / `auto_enabled` | Smart Communication och delar av offert-followup | Stoppar inte direkta projektsteg, portalmejl, public booking, kanonisk reminder, campaigns, nurture eller manuella utskick |
| Bokningsbekräftelse | Smart Communication-event om den vägen anropas | Publik bokning och andra direkta booking-SMS läser inte reglaget |
| Dagen-innan | används i communication AI och inställningsmodellen | `/api/reminders`, `lib/booking-reminders` och V3-regeln har egna vägar |
| På väg | finns i inställningsmodellen | `lib/on-my-way.ts` läser inte reglaget |
| Offertuppföljning | Smart Communication + quote-followup-cron | nurture och tenantens V3-regler kan fortsätta separat |
| Avslutat jobb | Smart Communication-modellen | legacy stage-`done`, projektworkflow och nurture ligger utanför |
| Fakturapåminnelse | Smart Communication-modellen | kanonisk reminder-cron/approval har egen config; äldre V3/nurture kan överlappa |
| Recensionsförfrågan | Smart Communication + vissa business_config-fält | maintenance, review-request-cron, project-stage, invoice-status och nurture behöver en gemensam eventpolicy |
| Tysta timmar/frekvens | Smart Communication | den centrala SMS-grinden har proaktiv samordning, men transaktionella/direct paths läser inte dessa UI-värden |
| E-postmallar | endast CRUD/UI | noll skarpa sändare läser `email_template` |
| Portalnotiser | portal krävs och samma event dedupliceras 1 h | `PortalNotificationResult` har `disabled`, men helpern läser ingen event- eller business-toggle |

## 8. Bekräftade trasiga, döda och dubbla vägar

### P0 — falsk framgång eller utebliven utlovad leverans

#### 8.1 Server-side fetch till `/api/sms/send` utan användarsession

[`/api/sms/send`](../../app/api/sms/send/route.ts) kräver `getAuthenticatedBusiness(request)`. Den läser inte `body.business_id` och accepterar inte `x-internal-secret`. Följande serveranrop skickar ingen cookie och kommer därför normalt inte förbi 401:

- projekt vunnet + kundens projektstart: `lib/projects/create-from-quote.ts`;
- motsvarande från lead: `lib/projects/create-from-lead.ts`;
- ägarens auto-fakturaresultat: `lib/projects/auto-invoice-on-complete.ts`;
- kundens tack-SMS efter manuell betalstatus: `app/api/invoices/[id]/status/route.ts`;
- milstolpe klar: `app/api/projects/[id]/milestones/route.ts`;
- kundens signaturtack i den äldre auth-acceptvägen: `app/api/quotes/accept/route.ts`;
- `lib/booking-reminders.ts`;
- `lib/matte/action-executor.ts`;
- den interna low/medium approval-exekveraren i agentens tool-router;
- den deprecated/oåtkomliga direktsändaren i project-stage-motorn.

Flera callers ignorerar statusen eller räknar upp “skickat” efter vilken HTTP-response som helst. Det ger falska framgångspåståenden och förbrukade reminder-steg utan leverans.

#### 8.2 Saknade e-post- och send-rutter

- `lib/automation-engine.ts:handleSendEmail` postar till `/api/email/send`, men routefilen finns inte.
- Agent-tool-routerns interna approval-exekverare postar offert till `/api/quotes/<id>/send` och faktura till `/api/invoices/<id>/send`; ingen av rutterna finns. Kanoniska endpoints är body-baserade `/api/quotes/send` respektive `/api/invoices/send`.

#### 8.3 Smart Communication “email” är en no-op

`sendSmartMessage` implementerar bara grenen `channel === 'sms'`. För `email` förblir `sendSuccess=false`; dessutom hämtar eventvägen bara kundens telefon och skickar den som `recipient`. `channel='both'` mappas till SMS, inte båda.

#### 8.4 Push kan se framgångsrik ut utan leverans

`/api/push/send` returnerar `success:true, sent:0` när VAPID saknas eller inga webbprenumerationer finns. V3 `handleNotifyOwner` läser inte `res.ok` eller `sent`, utan returnerar success så länge fetch inte kastar.

### P1 — dubbelkommunikation och splittrad policy

#### 8.5 Offertutskick triggar en andra gammal motor

Efter direkt Gmail/Resend/SMS anropar offert-routen `triggerEventCommunication('quote_sent')`. Om ingen V3 sendregel tar över kan den globala `communication_rule` skicka ytterligare ett offert-SMS. Fördröjningen sker via `setTimeout` i en serverless-request och är därför både möjlig dubblett och opålitlig leverans.

#### 8.6 Fakturautskick har samma problem

Efter kanoniskt fakturamejl/SMS triggas `invoice_sent` i Smart Communication, vars globala regel kan skicka ett extra faktura-SMS. Reglaget heter dessutom `sms_invoice_reminder` trots att det används för själva `invoice_sent`-eventet.

#### 8.7 Tre offertuppföljningssystem

- V3 threshold-regler;
- specialcron `quote-follow-up`;
- nurturesekvensen “Offertuppföljning”.

Cronen försöker undvika V3-dubletter, men nurture är en separat motor. Äldre och nya tenants kan dessutom ha olika seedade V3-regler.

#### 8.8 Tre bokningspåminnelsevägar

- `/api/reminders` är en riktig direct-helper-väg;
- `lib/booking-reminders` är auth-trasig men kan förbruka sin lokala `sent`-räknare;
- äldre V3 threshold-regel kan också skicka.

#### 8.9 Recensionsförfrågan har flera producenter

Project stages, invoice status, maintenance-cron, review-requests-cron, portalmejl och nurture kan alla initiera recension. Kundfältet `review_request_sent_at` och portalens logg dämpar delar av flödet, men det finns ingen gemensam event-idempotens över SMS + e-post + alla producenter.

#### 8.10 Portalens betal-/påminnelsemejl kan staplas på fakturamejl

Manuell reminder kan skicka SMS, reminder-e-post och portalens `invoice_overdue`-mejl i närliggande steg. Betalning kan ge portalmejl, legacy-SMS och review-flöde från skilda producenter.

### P1 — fel som döljer utfallet

- Invoice reminder sätter `emailSent=true` efter `resend.emails.send()` utan att läsa SDK:ns `{ error }`.
- Team-/partner-/ordercallers använder på flera ställen Resend-SDK utan att läsa returens `error`.
- Pipeline quick-SMS visar success utan `response.ok`.
- Team-/UE-platsbesöks-SMS är fire-and-forget.
- Bokningsdetaljens review-SMS loggar följdaktivitet utan att verifiera HTTP-status.
- Nurture avancerar till nästa steg även när själva steget misslyckas; kommentaren säger uttryckligen “skip this step”.
- Portalnotisloggen skrivs best-effort; ett lyckat mejl utan loggrad kan skickas igen trots tänkt dedup.

### P2 — döda eller missvisande konfigurationer

- `email_template` har ingen sändningskonsument.
- Legacy `automation_rules` är uttryckligen inert enligt `lib/seed-defaults.ts`, men API och schema finns kvar.
- `communication_rule`/Smart Communication överlappar V3 och är bara delvis fungerande.
- `communication_settings` och `automation_settings.sms_*` speglar varandra men täcker inte alla verkliga utskick.
- `PortalNotificationResult.skipped='disabled'` finns i typen, men någon disable-kontroll finns inte i helpern.
- `project-stage` har deprecated direkt `sendSMS`; nuvarande väg skapar approvals, men den döda koden pekar fortfarande på auth-routen.

## 9. Rekommenderat kontrakt för Kommunikationshubben

### 9.1 Minsta kanoniska objekt

Skapa inte en ny generell workflowmotor. Lägg ett tunt policyregister framför befintliga producenter och transporter.

```ts
type CommunicationEventPolicy = {
  eventKey: string
  audience: 'customer' | 'owner' | 'employee' | 'supplier' | 'handymate_ops'
  lifecycle: 'lead' | 'quote' | 'booking' | 'project' | 'invoice' | 'retention' | 'system'
  channel: 'sms' | 'email' | 'push' | 'in_app'
  mode: 'transactional' | 'conversational' | 'proactive' | 'internal' | 'mandatory'
  enabled: boolean
  editable: boolean
  template?: string
  subjectTemplate?: string
  requiresApproval: boolean
}
```

Nödvändiga regler:

- `eventKey` är den enda hubbnyckeln. Inte route, agentnamn eller tabellnamn.
- Ett kundögonblick får ha flera kanaler men en gemensam idempotensnyckel.
- `mandatory` kan visas men inte stängas av.
- Belopp, datum, länkar, projektnamn och juridisk text är låsta variabler, inte fri malltext.
- Förhandsvisning ska använda samma renderer och datafält som skarp send.
- “Av” måste provas mot alla adapters för eventet.
- Manuell kommunikation, kampanjer och nurture ska visas som egna verktyg, inte låtsas vara automatiska eventtoggles.

### 9.2 Rekommenderade grupper i UI

1. **Nya kunder** — leadtack, missat samtal, bokningsbekräftelse.
2. **Offert** — skickad, öppnad (intern), uppföljning, giltighet, accepterad.
3. **Bokning och besök** — bekräftelse, påminnelse, tider, på väg.
4. **Projekt** — start, steg, milstolpe, bilder, portalmeddelanden, klart.
5. **Faktura och betalning** — faktura, påminnelsetrappa, betald, recension.
6. **Återköp** — proaktiv vård, garanti, årsuppföljning, reaktivering.
7. **Till mig och teamet** — approvals, leads, rapporter, tilldelningar, driftfel.
8. **Systemmeddelanden** — synliga men låsta.

Varje rad bör visa:

- vem som får meddelandet;
- när det triggas;
- kanal;
- om det går direkt eller kräver godkännande;
- senaste lyckade och senaste misslyckade leverans;
- vilken textkälla som används;
- “Visa alla vägar” för felsökning/admin.

## 10. Rekommenderad byggordning

### Etapp 0 — stäng sanningsfelen

1. Byt alla server-side `/api/sms/send`-fetcher till den delade helpern eller en signerad intern adapter.
2. Koppla V3 `send_email` till en riktig e-postkärna.
3. Laga/ta bort tool-routerns interna 404-rutter.
4. Kräv att alla senders läser HTTP-/SDK-resultat innan success loggas eller nästa steg förbrukas.
5. Auth-/signera `/api/push/send` och låt callers skilja “0 mottagare” från “levererat”.

### Etapp 1 — eventfacit utan nytt UI

1. Lägg den föreslagna eventnyckeln på varje aktiv send.
2. Skriv ett kontrakttest som listar alla externa transportsinks och kräver klassning.
3. Förbjud nya direktanrop till Resend/46elks/push utanför uttryckliga adapters.
4. Mät dubbelträffar per kund + event + relaterat objekt.

### Etapp 2 — konsolidera överlapp

1. Välj en offertuppföljningsmotor.
2. Välj en bokningspåminnelsemotor.
3. Välj en recensionsorkestrator.
4. Avveckla Smart Communications direktsändning efter att dess verkliga konsumenter flyttats.
5. Behåll V3 som generell trigger-/approvalmotor och de domänspecifika kärnorna som utförare.

### Etapp 3 — e-poststrypunkt och mallrenderer

1. Skapa en gemensam e-postleveransadapter med eventkey, tenant, recipient, resultat och logg.
2. Behåll domänrenderers för offert/faktura/portal; de ska inte pressas till en generisk HTML-mall.
3. Koppla endast redigerbara textblock till hubben.
4. Migrera eller stäng den nu frikopplade `email_template`-ytan.

### Etapp 4 — bygg hubben ovanpå facitet

Först nu kan UI:t sanningsenligt lova att ett reglage eller en text gäller överallt.

## 11. Acceptanskriterier för den framtida hubben

- Varje extern send har exakt en registrerad `eventKey`.
- Ett källskanningsfacit blir rött vid ett oklassat transportanrop.
- “Av” för ett event provas genom alla dess producenter och kanaler.
- Transactional, conversational, proactive och mandatory kan inte sammanblandas.
- STOPP gäller alla kund-SMS men aldrig interna team-SMS.
- Kundens senaste effektiva mall kan förhandsvisas med verkliga variabler utan att skicka.
- Template-validering vägrar saknade obligatoriska länkar, belopp och juridiska fraser.
- Alla externa SDK-/HTTP-fel ger `failed`, aldrig `sent` eller förbrukat steg.
- Dubblettprov täcker offert skickad/followup, bokningspåminnelse, fakturapåminnelse, betalning och recension.
- Portal, SMS och e-post visas i samma kund-/projekttidslinje med verkligt leveransutfall.
- Systemlåsta meddelanden är synliga och begripliga men inte redigerbara.
- Hubben visar vilken agent som föreslog en kommunikation, men transportresultatet attribueras till systemets bevis, inte agentens text.

## 12. Filindex för implementation

### Transport och logg

- [`lib/sms-send.ts`](../../lib/sms-send.ts)
- [`lib/email.ts`](../../lib/email.ts)
- [`app/api/push/send/route.ts`](../../app/api/push/send/route.ts)
- [`lib/notifications.ts`](../../lib/notifications.ts)
- [`lib/notifications/approval-push.ts`](../../lib/notifications/approval-push.ts)
- [`lib/notifications/schedule-push.ts`](../../lib/notifications/schedule-push.ts)

### Regler och inställningar

- [`lib/automation-engine.ts`](../../lib/automation-engine.ts)
- [`lib/smart-communication.ts`](../../lib/smart-communication.ts)
- [`lib/automations.ts`](../../lib/automations.ts)
- [`lib/seed-defaults.ts`](../../lib/seed-defaults.ts)
- [`app/dashboard/communication/page.tsx`](../../app/dashboard/communication/page.tsx)
- [`app/dashboard/settings/email-templates/page.tsx`](../../app/dashboard/settings/email-templates/page.tsx)
- [`app/api/email-templates/route.ts`](../../app/api/email-templates/route.ts)

### Domänkärnor

- [`app/api/quotes/send/route.ts`](../../app/api/quotes/send/route.ts)
- [`lib/quote-confirmation-email.ts`](../../lib/quote-confirmation-email.ts)
- [`lib/invoices/send-invoice.ts`](../../lib/invoices/send-invoice.ts)
- [`lib/invoice-reminder-send.ts`](../../lib/invoice-reminder-send.ts)
- [`lib/portal/notification-emails.ts`](../../lib/portal/notification-emails.ts)
- [`lib/project-stages/automation-engine.ts`](../../lib/project-stages/automation-engine.ts)
- [`lib/nurture.ts`](../../lib/nurture.ts)
- [`app/api/approvals/[id]/route.ts`](../../app/api/approvals/%5Bid%5D/route.ts)

## 13. Slutbedömning

Den framtida hubben är rätt produktidé, men arbetet är i första hand en **sannings- och konsolideringsinsats**, inte en inställningssida.

Det som bör bevaras är:

- SMS-strypunkten;
- approval-kontraktet;
- V3-reglernas trigger-/approvalroll;
- domänrenderers för offert, faktura och portal;
- nurture som en uttryckligt armerad sekvens;
- pushens målgruppsstöd;
- en gemensam kund-/projekthistorik.

Det som bör bort eller absorberas är:

- serverfetch till auth-rutter;
- parallell Smart Communication-direktsändning;
- frikopplade mallar;
- flera producenter för samma kundögonblick utan gemensam idempotens;
- success utan verifierat transportresultat.

När det är gjort kan företagaren på ett trovärdigt sätt styra “vad Handymate säger, när, till vem och i vilken kanal” utan att behöva förstå vilken agent, cron eller route som råkar äga utskicket i koden.
