# Design-brief 1 — Kundmailen: från offert till betalt

Skapad 2026-09-07. Att klistra in i Claude Design. Syskon till "Kundens offert" (offertsidan, implementerad bf425894).

---

## Prompt

Du designar e-postmallarna som en svensk hantverkarfirma skickar till sina privatkunder via Handymate. Handymate är ett AI-drivet back-office för hantverkare med 3–20 anställda. **Mailen går i hantverkarens namn och varumärke** — kunden ska uppleva att de fått mail från "Ekström Bygg AB", inte från Handymate. Handymate syns bara som en liten stämpel i sidfoten: "Skickat via Handymate".

Det här är ett syskon till offertsidan "Kundens offert" som du redan designat: samma lugna tonalitet, samma "Du betalar"-logik där beloppet efter preliminärt ROT-avdrag är huvudsiffran och totalsumman står ärligt bredvid.

### Varför det spelar roll

En del av Handymates löfte till hantverkaren är: *dina kunder ser dig som ett proffs.* I dag är offertmailet varumärkat men fakturamailet är det inte — samma kund får två visuella identiteter i samma affär. Din uppgift är **ett** mailsystem som håller ihop hela kundresan.

### Varumärkesmekanik (måste fungera för alla firmor)

Varje firma har:
- `logo_url` — kan saknas. Då visas firmanamnet som text i sidhuvudet. Logotyper är ofta fula: liggande jpg med vit bakgrund, olika proportioner. Designen ska tåla det (fast maxhöjd, aldrig beskärning, ingen mörk platta bakom).
- `accent_color` — en valfri hexfärg, fallback teal `#0F766E`. Använd accenten **sparsamt**: primär knapp, en tunn linje, kanske sidhuvudet. Text på accent är alltid vit, så designen får inte förutsätta att accenten är mörk — visa hur den hanterar en ljus/grann accent.
- Firmanamn, org.nr, kontaktmail, telefon, Swish-nummer, bankgiro.

Sidfoten: firmans uppgifter + stämpeln "Skickat via Handymate" i grått, liten, centrerad.

### Tekniska ramar för e-post

- Max 600 px bred, tabellbaserad layout, all CSS inline.
- Systemtypsnitt (inga webfonts kan garanteras). Välj typografi som blir bra i Apple Mail, Gmail och Outlook med `-apple-system, Segoe UI, Roboto`.
- Ska vara läsbar med bilder blockerade (logo som alt-text, inga bild-knappar) och i mörkt läge (undvik stora vita plattor med hårdkodad svart text på transparent grund).
- En primär knapp per mail. Inga emojis som ikoner.
- Mobil först: 70 % öppnas i mobilen.

### Sanningsregler (bryts inte)

- ROT/RUT är alltid **preliminärt**: "Skatteverket fastställer det slutgiltiga beloppet". Aldrig "dras automatiskt".
- Inga BankID-påståenden. Signering är namn + kryss.
- Inga hittade siffror eller citat i mockuparna — använd exempeldatan nedan.
- Påminnelser hotar inte med avgifter vi inte kan belägga. Nivå 4 får nämna inkasso, inget mer.

### Exempeldata

Firma: **Ekström Bygg AB**, org.nr 556123-4567, Swish 123 456 78 90, bankgiro 123-4567, kontakt info@ekstrombygg.se, 070-123 45 67. Kund: **Anna Lindqvist**. Jobb: "Badrumsrenovering Sjövägen 4". Offert OF-2026-0142: totalt 84 500 kr, preliminärt ROT −18 000 kr, att betala 66 500 kr, giltig till 21 september. Faktura F-1023: förfaller 30 september, OCR 10230000123. Bokning: fredag 12 september kl 07:30, hantverkare Erik Ekström.

### De åtta mailen

Samma masterlayout, olika innehåll. Ange för varje: ärenderad, förhandsvisningstext, innehåll, primär knapp.

1. **Offert skickad** — titel, "Du betalar"-siffran med preliminärt-badge, giltig till, knapp "Öppna offerten". PDF bifogas.
2. **Tack — offerten är godkänd** — bekräftelse på vad som godkänts, "Vad händer nu" i tre steg, och *om ROT-uppgifter saknas*: ett vänligt block "Vi behöver personnummer och fastighetsbeteckning innan fakturan" med knapp till portalen.
3. **Bokningsbekräftelse** — datum, tid, adress, vem som kommer (namn, gärna foto-plats), "Lägg till i kalender", ändra via portalen.
4. **Faktura** — beloppet ska vara det första ögat ser. Fakturanummer, förfallodatum, delsumma/moms/preliminärt ROT/att betala, **Swish-knapp** (deeplink, öppnar appen i mobilen) + Swish-nummer och meddelande att ange, bankgiro + OCR, knapp "Visa i kundportalen", länk till PDF.
5. **Påminnelse i fyra tonlägen** — *vänlig* ("Kanske missades?"), *bestämd*, *formell*, *sista* (inkasso nämns). Samma layout; ett statusband och tonen ändras. Nivå 1 får inte se ut som ett hot — det är oftast ett missat mail, och kunden är fortfarande en kund.
6. **Tack för betalningen** — kvittokänsla: belopp, datum, fakturanummer. Varm avslutning, "spara vår kontakt".
7. **Omdömesförfrågan** — kort och personlig, från hantverkaren själv, en knapp till Google-omdömen. Inga stjärnor att klicka i mailet (det går inte att mäta).
8. **Portalnotis** — kompakt variant för "Nytt meddelande från Erik", "Nya foton från jobbet", "Ditt jobbpass är klart". En rad + knapp.

### Leverabler

- Masterlayout: sidhuvud, typografiskala, summeringstabell, statusband, primär/sekundär knapp, infoblock (ROT, betalning), sidfot med stämpel.
- De åtta mailen, mobil (390) och desktop (600).
- **Två robusthetsprov:** faktura-mailet med accent `#F97316` (orange) och offert-mailet helt utan logotyp.
- Kort komponentlista så att vi kan mappa designen mot vår befintliga `emailLayout()`-funktion.
