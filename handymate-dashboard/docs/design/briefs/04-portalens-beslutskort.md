# Design-brief 4 — Portalens tre beslutskort

Skapad 2026-09-07. Att klistra in i Claude Design. Kundportalens tre beslutsmoment — godkänna en ÄTA, betala en faktura, lämna ett omdöme — som fokuserade beslutskort med samma tyngd och samma "Du betalar"-logik som offertsidan.

---

## Prompt

Du designar tre skärmar i Handymates **kundportal**. Handymate är ett AI-drivet back-office för svenska hantverkarfirmor med 3–20 anställda. Portalen är hantverkarens kunds vy: en privatperson som får en länk i SMS eller mejl, oftast i mobilen, som vill förstå vad som händer med sitt jobb och fatta ett beslut på 30 sekunder. Kunden har inget konto, ingen inloggning — länken är nyckeln.

Portalen bär **hantverkarens** varumärke (logotyp, accentfärg), inte Handymates. Handymate syns bara som en diskret stämpel "Skickat via Handymate" i foten.

### Problemet skärmarna löser

I dag är portalens tre beslut begravda: ÄTA-signeringen ligger inuti projektdetaljen, betalningen inuti fakturadetaljen och omdömet nås bara via en extern länk (`?tab=review`) — det finns ingen ingång i appen. Hemskärmen känner inte till något av dem: fyra statiska knappar (Projekt, Offerter, Fakturor, Kontakt) utan att visa att något väntar. Kunden får ett SMS, öppnar portalen, och måste leta.

Vi har redan omdesignat **offertsidan** (kundens första beslut). Den är förlagan: ett dokument som är lätt att överblicka, en "Du betalar"-ruta som säger sanningen om ROT, ett signeringskort med namn + kryss, och ett tydligt läge efteråt ("Tack Anna. Offerten är godkänd." + "Vad händer nu"). De tre skärmarna här är dess syskon. Kunden ska känna igen sig: *samma firma, samma tonläge, samma sätt att fatta beslut.*

### Designsystem att hålla sig till

Portalen har redan ett visuellt språk som ska behållas:

- Centrerat mobilskal (460 px, bredare på desktop) på ljusgrå grund `#F1F5F9`. Kort `bp-card` (vit, radie 16, tunn kant `#E2E8F0`), badges `bp-badge` (green / amber / red / blue / gray), CTA `bp-cta` (52 px hög, mörk `#0F172A`) och `bp-cta.bee` (accentgradient).
- Text: `--ink #0F172A`, `--ink-2 #1E293B`, `--muted #64748B`, `--subtle #94A3B8`. Semantik: grön `#16A34A`, röd `#DC2626`, blå `#2563EB` — dessa tintas aldrig.
- **Accentfärgen kommer ur hantverkarens varumärke** (en hex som genererar hela rampen 50–700). Standard är amber `#F59E0B` om firman inte valt något; Handymates egen teal `#0F766E` används bara för stämpeln. Designa i en neutral accent och visa ett exempel med en annan firmas färg, så vi ser att layouten tål vilken accent som helst.
- Systemtypsnitt, svenska, du-tilltal. Lugnt och kompetent, inte lekfullt. Inga emojis som ikoner.

### De tre besluten

**1. ÄTA — "Tilläggsarbete att godkänna"**

En ÄTA är ett tilläggsarbete utöver offerten (t.ex. "Byte av dolt rör bakom badkaret, 4 200 kr"). Kunden ska förstå *vad* som tillkommer, *varför*, *vad det kostar* och *vad hen faktiskt betalar* — och sedan godkänna eller säga nej.

Kortet ska innehålla:
- ÄTA-nummer, rubrik, hantverkarens beskrivning (fri text, kan vara 1–5 rader), ev. foton (hantverkaren fotar ofta det som upptäcktes).
- Radtabell: benämning · antal · summa.
- Summering i samma ordning som offerten: Delsumma → Moms 25 % → Totalt inkl. moms → **ROT-avdrag (preliminärt)** som negativt grönt belopp → **Du betalar** (fet, störst). Mikrotext: "Avdraget är preliminärt och förutsätter att Skatteverket godkänner det." ROT-raden visas bara när ÄTA:n innehåller ROT-berättigat arbete.
- Kontext: vilket projekt den hör till, och att den läggs på slutfakturan (inte faktureras separat — det är så det fungerar i dag).
- Beslutet: namn + kryss "Jag godkänner tilläggsarbetet enligt ovan" → knapp "Godkänn tilläggsarbetet". I dag finns en rit-signatur på canvas; designa gärna utan den (namn + kryss räcker juridiskt, samma som offerten) men visa hur en valfri rit-signatur skulle sitta om vi behåller den.
- **En nej-väg**: "Vill du inte gå vidare? Tacka nej" → kort textfält "Vad vill du göra i stället?" + "Skicka". I dag finns ingen nej-knapp alls i portalen — kunden kan bara signera eller ignorera. Nej-vägen ska vara tydlig men inte lika tung som ja-vägen.
- Lägen: att godkänna · godkänd ("Tack Anna. Tilläggsarbetet är godkänt." + "Vad händer nu": hantverkaren får besked direkt, arbetet läggs på slutfakturan) · avböjd ("Du har tackat nej. {Förnamn} hör av sig.") · förslag (hantverkaren har inte skickat ännu — kunden kan se men inte besluta) · fakturerad.

**2. Faktura — "Att betala"**

Kunden ska se beloppet, se hur det hänger ihop med offerten och ROT, och betala på det sätt som är snabbast — Swish — utan att leta.

I dag finns: hero-belopp, "Förfaller {datum}"-chip (röd vid försenad), ett summeringskort (Total → ROT-avdrag → Att betala, utan momsrad), ett mörkt Swish-kort med QR (150 px), kopierbara rader (nummer, belopp, meddelande), knapp "Öppna Swish" (deeplink) och "Jag har betalat" (kunden markerar själv, hantverkaren bekräftar), samt ett bankgiro/OCR-kort utan kopieringsknappar och en PDF-länk. Fakturadokumentet självt visas ovanför allt i en skalad ram.

Det som ska bli bättre:
- **Beslutet först.** Belopp, förfallodag och den primära betalvägen ska synas utan att scrolla förbi dokumentet. Dokumentet är underlag, inte huvudsak — lägg det under eller bakom "Visa fakturan".
- **"Du betalar"-logiken från offerten.** Totalt inkl. moms → ROT-avdrag (preliminärt) → Du betalar, samma visuella form som på offert och ÄTA. Om fakturan innehåller godkända ÄTA:er, visa dem som rader så kunden känner igen beslutet hen redan fattat.
- **Swish som primärt val**: QR på desktop (kunden sitter vid datorn och skannar med mobilen), "Öppna Swish" som primär knapp på mobilen (QR är meningslös på samma enhet). Belopp och meddelande förifyllda. Bankgiro + OCR som sekundärt, med kopiering.
- **"Jag har betalat"** som ett lugnt sekundärt steg, med den ärliga texten "Vi bekräftar när betalningen kommit in." — vi kan inte se Swish-betalningar automatiskt.
- Lägen: att betala · förfallen (rödmarkerad, ev. påminnelseavgift/dröjsmålsränta som "tillkommer"-rader när hantverkaren konfigurerat det) · "Jag har betalat"-markerad (väntar på bekräftelse) · betald ("Betald {datum}" — kvittokänsla, PDF-länk kvar, och det är HÄR omdömesfrågan får ta plats, se 3).

Inga kortbetalningar, ingen delbetalning — de finns inte. Designa inte in dem.

**3. Omdöme — "Hur blev det?"**

Efter att fakturan är betald (eller jobbet markerats klart) vill hantverkaren ha ett omdöme. Ett bra omdöme ska vidare till Google; ett dåligt ska gå till hantverkaren, inte till Google.

I dag finns en fristående skärm (nås bara via länk): rubrik "Hur var {hantverkaren}?", fem stjärnor med etiketter (Inte bra / OK / Bra / Mycket bra / Fantastiskt!), taggar (Punktlig, Snyggt utfört, Ren & städad, Bra kommunikation, Värd pengarna, Skulle anlita igen), kommentar max 400 tecken, "Skicka recension". Vid ≥ 4 stjärnor och en Google-länk: kort "Vill du dela på Google?" → "Recensera på Google". Vid 1–3 stjärnor: bara ett tack, ingenting mer.

Det som ska bli bättre:
- Omdömet ska ha en **ingång i portalen**: som ett kort på betald faktura och på hemskärmen efter avslutat jobb. Kortet är litet och vänligt, inte ett formulär: "Hur blev det?" + fem stjärnor direkt i kortet. Stjärnvalet öppnar resten.
- **Lågt betyg (1–3)** ska leda till en intern väg: "Berätta vad som inte blev bra — {Förnamn} får meddelandet direkt." Ingen Google-knapp. Det är kundens chans att bli hörd och hantverkarens chans att rätta till.
- **Högt betyg (4–5)** → tack + Google-kortet som i dag, men tydligare: "Det betyder mycket för en liten firma."
- Lägen: inte lämnat · stjärnor valda (formuläret öppet) · skickat lågt · skickat högt (med Google-CTA) · redan lämnat (kortet försvinner eller visar "Tack för ditt omdöme").
- Google-länken kan saknas hos firman. Då visas bara tacket.

### Hemskärmen — "Väntar på dig"

Ett fjärde, litet uppdrag: hemskärmen behöver en **"Väntar på dig"-sektion** överst, ovanför projektkortet, som listar öppna beslut: "Offert att godkänna · 84 500 kr", "Tilläggsarbete att godkänna · 4 200 kr", "Faktura att betala · förfaller 15 sep", "Hur blev det? Lämna ett omdöme". Varje rad går direkt till beslutskortet. Tom sektion = ingen sektion (inte en tom ruta med "Inget att göra"). Quick actions-knapparna får en liten räknare när något väntar.

### Sanningsregler

- ROT är **alltid** "preliminärt" — aldrig "dras automatiskt", aldrig "du får tillbaka".
- Inga BankID-påståenden. Signering är namn + kryss (och ev. rit-signatur).
- Inga påhittade siffror i copy ("kunder som betalar 3× snabbare"). Exempeldata: Ekström Bygg AB (accent valfri), kund Anna Lindqvist, projekt "Badrumsrenovering Sjövägen 4", offert 84 500 kr, ÄTA-2 "Byte av dolt rör bakom badkaret" 4 200 kr inkl. moms (ROT-berättigat arbete 2 400 kr → preliminärt avdrag −1 200 kr → Du betalar 3 000 kr), faktura 88 700 kr (offert + ÄTA-2) med ROT −19 200 kr (18 000 + 1 200) → Du betalar 69 500 kr, förfaller 2026-09-21, Swish 123 456 78 90, bankgiro 5555-5555, OCR 1234567890.
- Vi kan inte se Swish-betalningar automatiskt. "Jag har betalat" är kundens markering, hantverkaren bekräftar.
- Inga emojis som ikoner. Stämpeln "Skickat via Handymate" i foten på varje skärm.

### Leverabler

- Mobil (390) för alla lägen i de tre besluten + hemskärmens "Väntar på dig".
- Desktop (1280) för fakturan (QR-fallet) och ÄTA:n.
- Ett exempel med en annan firmas accent (t.ex. mörkblå) på ÄTA-kortet, för att visa att rampen håller.
- Komponentlista: beslutskort (huvud, innehåll, summering, beslut, efterläge), "Du betalar"-blocket (delat av offert/ÄTA/faktura), Swish-blocket (QR-variant + mobilvariant), bankgiro-rad med kopiering, omdömeskortet (kompakt + expanderat), "Väntar på dig"-listan.
