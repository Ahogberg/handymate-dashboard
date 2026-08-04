# Masterplan: Offertupplevelsen i världsklass — "dokumentet ÄR gränssnittet"

## Context

Andreas 2026-08-03: offertskaparen "känns rörig, vissa delar svåra att
förstå för en hantverkare — ska vara visuellt magiskt snyggt men lätt att
klicka sig igenom snabbt". Live-förhandsvisningen med direktredigering
pekas ut som "grym, rätt riktning". **Slutdesignen (visuell polish) ägs av
Claude Design** — denna plan levererar UX-arkitekturen, flödet, den
tekniska konsolideringen och en designbrief per etapp.

Två djupkartläggningar (2026-08-03, verifierade mot kod) ger faktabasen:
- Skaparen: 13 sektioner staplade, 65 useState i en 1819-raders sidfil,
  6 olika ingångar, live-canvasen (produktens starkaste idé) fungerar
  bara för Modern-stilen och bara på desktop.
- Vy/mallar: 3 parallella preview-renderare av samma data, ~700 rader
  new/edit-duplicering i presentationslagret, detaljsidan har upp till
  10 likvärdiga knappar utan hierarki och visar aldrig dokumentet,
  kundens signeringssida (där affären stängs!) ignorerar mallvalet helt,
  mallarna saknar signatur-CTA och page-break-regler.

## Nordstjärna — fem principer

1. **Dokumentet ÄR gränssnittet.** Live-canvasen är inte en preview — den
   är den primära redigeringsytan. Formulärsektioner finns bara för det
   som inte syns i dokumentet.
2. **Ett beslut i taget.** Startväljaren → kund → rader → skicka. Allt
   annat är progressiv disclosure bakom dokumentet.
3. **Hantverkarspråk.** "Specifikation"→"Vad som ingår", inga termer som
   Delsumma/Visningsinställningar/pauschal utan förklaring i kontext.
4. **Mobilen är en förstaklassmedborgare.** Hantverkaren står på bygget.
   44px träffytor, ROT per rad, samma canvas — inte en amputerad kopia.
5. **En sanning per pixel.** Mall-HTML:en är redan enda sanningen för
   PDF + "Visa offert" — samma princip drivs hela vägen: en redigerbar
   dokumentmotor ersätter de tre parallella renderarna, och kundens
   signeringssida renderar samma dokument.

## ✅ SPRINTSTATUS 2026-08-04: E1-E5 KLARA — hela offert-sprinten byggd

Autonom genomkörning på Andreas uppdrag, alla etapper committade/pushade:
- E1 fundament (86f12d2c, −670 rader) · E2a dokumentmotorn (603c9d65) ·
  E2b+2c canvas-first + konsolidering (69717023, −560 rader) ·
  E3 mobilen (53aa779a) · E4 Offertrummet (d9a71751, −480 rader
  dialektkod) · E5 kundvyn på mallmotorn (87e2eeb4).
- HOTFIX på vägen (fbe08ec5): react-dom/server-importen fällde ALLA
  Vercel-deployer sedan E2a — tsc fångar inte webpack-felklassen; ny
  lärdom i tasks/lessons.md (next build som deploy-gate). E5 byggdes
  därefter med full next build-verifiering.

**Kända uppföljningar (medvetet EJ byggda, listas för E6/senare):**
1. E2b-för-edit: edit-sidan har delade komponenter + live-canvas men
   inte assistentkolumn/Mer-rad-layouten (planens fallback-klausul).
2. Premium/Friendly-motorvarianter: bara Modern har edit-läge +
   signatur-CTA; iframe-vägen täcker statisk visning.
3. Betalplan + ÄTA-villkor finns INTE i buildQuoteTemplateData → syns
   inte i PDF/kundvy (aldrig gjort det — gammal dialektlucka, E4-fynd).
4. Grön teknik-avdrag visas inte i statiska mallen (ärvt, speglat).
5. Tillval-livesynk är Modern-only (iframe-stilarna statiska).
6. vat_number visas inte i dokumentet (ärvt PDF-gap).
7. ProductModal-titeln säger fortfarande "prislistan" (terminologirest).

**Andreas manuella verifiering (BYGGT→LIVE kräver):** skapa offert →
livecanvas alla radtyper → mobil på riktig telefon (bottom-sheet) →
Visa offert/PDF per stil (Modern/Premium/Friendly — sida 2-brytningar!)
→ kundvyn: öppna signeringslänk, välj tillval, signera (demokontot) →
Offertrummets händelselogg visar öppningen.

## ETAPP 1 — Fundament & städning (låg risk, möjliggör allt annat) — ✅ KLAR

**1a. En preview-pipeline.** Slå ihop `liveTemplateData` /
`templatePreviewPayload` / `debouncedPreviewData` (new/page.tsx:402-616)
till EN memo → `QuoteTemplateData`. Alla tre renderare konsumerar samma
objekt tills de själva konsolideras i E2.

**1b. En stilväljare.** Extrahera `QuoteStylePicker`-komponent
(ersätter inline-kopian new/page.tsx:1559-1607 + QuoteEditTemplatePicker)
och ÅTERANVÄND `MiniDoc`-miniatyrerna från settings/quote-style (bästa
befintliga mönstret) — visuella A4-tumnaglar istället för textknappar.
Flytta stilvalet NER (efter innehållet, före skicka) — ett kosmetiskt val
ska inte vara beslut #2 före kunden.

**1c. ROT-buggarna.** (i) Global toggle ↔ per-rad-desync: togglen ska gå
via `setItemRotRut` (samma enda-källa som F1 införde) och nollställa
motsatt flagga. (ii) ROT/RUT + kategori saknas helt i mobilens ItemRow —
lägg in i mobilstacken. (iii) Terminologi: EN term — "produktbanken" —
överallt ("Spara i prislistan"-bokmärket, snabbvalsrubriken, nudgen).

**1d. Mallarnas print-kvalitet.** `@page margin:0` vs Chromium-marginalen
12/14mm dubbelräknas → nästan-tomma sida 2. Fixa: mallarna äger
marginalen (`@page { margin: 12mm 0 14mm }`, page.pdf margin 0). Lägg
`break-inside: avoid` på rader/kort/summering + `display:
table-header-group` i Modern. Ta bort `.print-bar` ur HTML:en när den
renderas för preview/PDF (query-flagga till renderFn eller CSS i frame).

**1e. Död kod bort.** VoiceRecorder/PhotoCapture/InputSelector/
AIQuotePreview (importeras ingenstans). jsPDF-fallbacken BEHÅLLS
(fail-safe) men loggar tydligt när den slår in.

**1f. Skicka-flödet ärligt.** Disabled Skicka-knapp får alltid synlig
orsak ("Välj kund först" som text under, inte tyst lås). Beskrivnings-
varningens dubbelklicksvägg (descriptionWarningShownRef) ersätts med
inline-bekräftelse i samma vy.

## ETAPP 2 — Canvas-first-skaparen (kärnan) — ✅ KLAR

**2a. EditableDocument-motorn.** Generalisera ModernCanvas till EN
komponent som renderar `QuoteTemplateData` redigerbart, med stil som
variant — och generera mallarnas statiska HTML från SAMMA komponent
(renderToStaticMarkup) så modern.ts/premium.ts/friendly.ts-strängarna
pensioneras stegvis. Ordning: Modern först (canvas finns, HTML-paritet
verifieras mot befintlig modern.ts snapshot-mässigt), sedan Premium +
Friendly (löser också "Live-redigering kommer snart"-låset — stilval
stänger aldrig mer av produktens bästa funktion). Premium får samtidigt
accentfärgsstöd (idag hårdkodad palett — dokumenterad begränsning).
- id-baserade liveHandlers (inte index-mutation) via useQuoteItems.
- Alla radtyper redigerbara i canvasen: heading/text/subtotal/discount/
  option (idag bara item), enhet + ROT-badge klickbar per rad,
  villkorstexterna redigerbara direkt i dokumentets villkorsdel.
- Signatur-CTA-sektion läggs i dokumentmotorn (behövs för E4/E5;
  renderas som "Signera här"-yta i kundläge, diskret i hantverkarläge).

**2b. Layoutskifte.** Vänsterspalten bantas från 13 kort till en smal
assistentkolumn: (1) Kund & giltighet, (2) AI-hjälpen, (3) Summering med
"Kund betalar" + Skicka. Resten (referenser/villkor/betalplan/visning/
bilagor/stil) flyttar in i en "Mer"-verktygsrad ovanför dokumentet +
redigeras där det syns (villkor i dokumentet, stil via 1b-väljaren).
Radeditorn (QuoteNewItemsSection) blir sekundärläge ("listvy") — behålls
som toggle för den som vill, canvasen är default.

**2c. new/edit-konsolidering.** Items-sektionen (91 % identisk),
preview-panelen och stilväljaren förenas till delade komponenter under
_shared/ — edit-sidan får samma canvas-first-upplevelse. Mål: ~700
duplicerade rader bort.

## ETAPP 3 — Mobilen — ✅ KLAR

Canvasen PÅ mobilen: fullskärmsdokument med bottom-sheet-verktyg (rad-
redigering öppnas som sheet med 44px+ fält — dagens 30px-inputs ryker),
FAB:en ersätts av persistent "Dokument/Detaljer"-växel. ROT per rad,
kategori, drag-handtag med riktig greppyta. Sticky-headern enradig
(badges → overflow-meny). Verifieras i mobile-viewport-tester.

## ETAPP 4 — Detaljsidan → "Offertrummet" — ✅ KLAR

Dokumentet i centrum: inbäddad mall-HTML-preview (samma frame som
skaparen) ersätter QuoteSpecificationTable-dialekten (fixar även att
tillvalsrader tyst försvinner där — `option`-fallet saknas). Åtgärderna
får hierarki: EN primär per status (draft→Skicka, sent→Påminn,
accepted→Skapa projekt), resten i overflow. "Visa offert"/"Visa kundvy"/
"Ladda ner PDF" förenas till en "Dokument"-grupp. Händelseloggen blir
verklig (tracking-datan från /api/quotes/track finns redan — visa
öppningar/påminnelser istället för statisk 5-stegs-timeline). prompt()/
confirm() ersätts med riktiga dialoger. Versioner: behåll väljaren, lägg
"vad ändrades"-rad (diff på totaler + radantal — inte full diff).

## ETAPP 5 — Kundvyn på mallmotorn — ✅ KLAR

Signeringssidan (app/quote/[token], 1300 rader egen rendering) byggs om
till: EditableDocument i kundläge (läsbart, ej redigerbart) + interaktivt
lager (tillvalsval — redan interaktiva, signaturcanvas, avböj). Kunden
ser ÄNTLIGEN det dokument hantverkaren valde — Premium-stil når ytan där
affären stängs. Portalens signeringsmodal följer med. Kräver 2a
(dokumentmotorn) + signatur-CTA-sektionen.

## Claude Design-handoff (per etapp)

Befintliga tokens är briefens grund: Space Grotesk/DM Sans (delas av app
OCH dokument — stor tillgång), teal primary-700 #0F766E, kortmönstret
(rounded-2xl border-slate-200), eyebrow-etiketter, tabular-nums,
accentfärg-mixning (mixWithWhite). Design levererar per etapp: (E1)
stilväljarens tumnagelkort, (E2) assistentkolumnens kompakta kort +
canvasens redigerings-states (hover/aktiv/amber-saknat-pris) +
"Mer"-verktygsraden, (E3) bottom-sheets + mobilnav, (E4) offertrummets
hierarki, (E5) kundlägets signaturyta + tillvalsinteraktion. Brief-filer
skrivs som content/design/offert-etapp-N-brief.md vid respektive start.

## Ordning, risk & verifiering

E1 → E2a → E2b → E2c → E3 → E4 → E5. E1 är ren möjliggörare (varje punkt
oberoende committbar). E2a är den tekniska vattendelaren — HTML-paritet
mot befintliga mallar verifieras med snapshot-jämförelse (rendera samma
QuoteTemplateData genom gammal mallsträng och ny motor, diffa) innan
gamla mallfiler pensioneras. PDF:ns Chromium-väg återanvänds oförändrad.

Per etapp: tsc + full facit-svit; nya facit-tester för id-baserade
liveHandlers och dokumentmotorns radtypsrendering; manuell mobil-check
(riktiga telefonen, inte bara devtools) för E3; kundvyn (E5) testas mot
demokontots offert med tillval + signering end-to-end innan gamla sidan
raderas. capability-inventory uppdateras per stängd etapp. En byggagent
åt gången; jag speccar/granskar/committar — samma disciplin som allt
annat idag.

## ETAPP 6 — FAKTURA-SPRINTEN (Andreas-beslut 2026-08-04: "samma typ av förbättring för faktura")

**Startas EFTER att E4+E5 är klara och rapporterade — inte parallellt.**

Motivet (etablerat i beslutsdiskussionen): dokumentmotorn är redan betald
— fakturan har exakt samma form (rader, summering, ROT, kund, PDF,
portalvy) och är ytan där pengarna byter ägare. Idag renderas fakturans
PDF av gamla jsPDF-generatorn (lib/pdf-generator.ts) — kunden får en
magisk Premium-offert och sedan en ful faktura i det känsligaste
ögonblicket. Snygga fakturor betalas snabbare = pengaloopens tema.

**DETALJSPEC (2026-08-04, efter kartläggning av fakturaflödets faktiska
kod — huvudfynd: fakturan har redan en mallmotor på offertens FÖRE-E2a-
nivå (lib/invoice-templates/, 3 stilar som strängar, används bara för
HTML-preview — binär PDF är fortfarande jsPDF). E6 är alltså i hög grad
en upprepning av E2a snarare än nybyggnation.**

**Buggar hittade i kartläggningen (fixas i respektive etapp):**
- Portalens "Ladda ner PDF" skickar `?id=` men routen läser `invoiceId`
  → kundens nedladdning har ALLTID gett 400 (PortalInvoiceDetail:220);
  header-knappen saknar dessutom onClick helt (:47-49). → 6b
- Detaljsidans timeline läser `invoice.reminder_sent_at` — kolumnen
  FINNS INTE (heter last_reminder_at) → påminnelser syns aldrig i
  tidslinjen trots att FULL historik finns i invoice_reminders. → 6d
- invoices/send POSTar ett MINDRE fältset till jsPDF än pdf-routen →
  mejlbilagans PDF skiljer sig från nedladdningens (OCR, personnummer,
  referenser, invoice_type utelämnas). → 6b
- fortnox_sync_status (v58) visas aldrig i UI — retry-läget osynligt. → 6d
- performed_by_name (värdekedje-E6-arvet) sätts på rader men renderas
  ingenstans. → 6a
- data-builder FILTRERAR BORT heading/text-rader och tappar subtotal/
  discount-semantik — medan 213 rader DÖD kod i pdf-routen (rad 168-380)
  är den enda som hanterar radtyperna rätt. Läs den som facit, radera
  den sedan. → 6a
- auto-generate sätter aldrig ocr_number. → 6a (createInvoice-kärnan)

**6a — MoneyDocument-motorn + createInvoice()-kärnan (störst, först):**
QuoteDocument → generaliseras med docType: 'quote'|'invoice'
(diskriminerad typunion — option är offert-only; subtotal/discount
finns redan i fakturans radtyper och beräknas i invoice-calculations,
renderas bara i den döda koden). buildInvoiceTemplateData UTÖKAS (finns,
194 rader): ta bort heading/text-filtret, lägg subtotal/discount,
performed_by_name, kreditfaktura-rader. Fakturaunika sektioner i
motorn: OCR-rad (lib/ocr finns), betalinstruktioner + Swish-QR
(lib/swish-qr finns, korrekt låst belopp), förfallodatum-prominens +
late-notice (logik finns i data-builder:32-42), kreditfaktura-läge,
påminnelseavgift/dröjsmålsränta som totalsrader. Modern först —
premium/friendly-strängarna behålls tills motorn täcker dem (samma
asymmetri som offerten). TVÄRGÅENDE i 6a: bryt ut createInvoice()-kärna
— ÅTTA skapandevägar duplicerar samma sexstegskedja (prefix→nummer→OCR→
dueDate→insert→bump) utan lås på nummerserien (dubblettnummer-risk!).
Atomiskt nummeruttag (RPC-migration, Andreas kör) + gemensam helper;
alla åtta vägar pekas om. ROT-beräkningen enhetligas samtidigt
(from-project hårdkodar egna satser istället för calculateCappedDeduction).

**6b — Chromium-PDF (minst, störst synlig vinst):**
Bryt ut renderHtmlToPdf från quotes/pdf-routen till lib/pdf/
render-html-to-pdf.ts. invoices/pdf format=pdf → Chromium med jsPDF-
fallback. invoices/send byter till samma väg (fixar fältset-buggen).
reminder-pdf med i svepet. Portal-PDF-länkbuggen + död onClick fixas.

**6c — Skaparen canvas-first:**
new (521 rader, 19 useState) + edit (327, 16) förenas ovanpå motorn i
mode='edit' — samma layoutprinciper som offertens E2b (assistentkolumn +
dokument huvudyta). invoice-calculations.ts (ren, 161 rader) behålls
rakt av. RISK: LineItemEditor har fakturaspecifika affordanser (ROT/RUT-
checkbox per rad, showAdvancedTypes) — fältparitet kartläggs FÖRE
sammanslagning så inget tappas.

**6d — Fakturarummet (bästa avkastningen — händelsedatat FINNS):**
Dokumentet i centrum (motorn), åtgärdshierarki (EN primär per status:
utkast→Skicka, skickad→Påminn/Markera betald, betald→—; kreditera/
Fortnox/PDF i menyer), VERKLIG tidslinje byggd på invoice_reminders-
arrayen (redan hämtad! med avgift+metod per påminnelse) + betalningar +
Fortnox-sync — fixar reminder_sent_at-buggen. fortnox_sync_status
synlig. De två inline-modalerna (betalning 458-543, kreditering 546-682
med delkreditering) bryts ut som komponenter — kreditmodalen OFÖRÄNDRAD
först (mest logikbärande), design sen.

**6e — Portal + betalögonblick:**
Motorn i portalens fakturavy. claim-paid + apply-payment + Swish-QR-
kärnorna bärs över ORÖRDA (sunda). Designbeslut: dokumentet som kort i
portalskalet (bp-*-CSS möter MODERN_DOCUMENT_CSS) — inbäddat kort valt
för att behålla portalens navigering.

**Ordning:** 6a → 6b → 6c → 6d → 6e. Verifiering per etapp: tsc + FULL
next build (lessons.md!) + facit-sviter; 6a får paritetstest mot
frysta invoice-mall-fixtures (samma metodik som E2a); 6e testas mot
demokontots faktura end-to-end innan gammal rendering raderas.

## Utanför scope (medvetet)

Nya mallstilar, offert-analytics-dashboard, A/B på kundvyn — efter
pilotsignal.
