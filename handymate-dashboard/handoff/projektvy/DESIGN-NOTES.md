# Design-notes — destillerad canvas-anatomi (Projektvy.html)

_Kompletterar HANDOFF.md. Canvasen är skriven i ren CSS — detta är
översättningen till appens Tailwind-språk, sektion för sektion, med de
fyra mobiltillstånden (A pågående, B klart+ofakturerat, C nystartat,
D röd ekonomi) och desktopens tvåkolumn._

## Grundton

- Sidbakgrund `bg-[#F8FAFC]`; kort `bg-white border border-[#E2E8F0]
  rounded-xl` (canvas radius 14px ≈ rounded-xl), skugga endast hover/fokus.
- Kortmellanrum mobil: `gap-3` (12px) i en flex-kolumn, sidopadding 14–16px.
- Siffror: `font-variant-numeric: tabular-nums` (`tabular-nums`-klassen)
  på alla belopp.

## Sidhuvud (mobil)

Appbar: tillbaka-pil + brödsmula "Projekt" + kebab-meny.
Titel: projektnamn (fet, ~22px) + meta-rad: statuschip + "Anna Svensson ·
Tantogatan 41". Chips: teal (`bg-primary-50 text-primary-700`) för Pågående,
grön (`bg-green-100 text-green-700`) "Klart {datum}", neutral
(`bg-gray-100 text-gray-500`) Planering, röd (`bg-red-100 text-red-700`)
"Över offererat" (läggs BREDVID Pågående-chippen i läge D).

## Statuskortet "Hur ligger vi till?"

1. Rubrikrad: rubrik vänster + neutral chip höger ("Vecka 3 av 5" /
   "Skapad från offert #1042" — i läge B ingen chip).
2. Fas-stepper (Planering — Pågående — Klart): klara steg = fylld teal
   cirkel med ✓ + teal linje; aktivt steg = vit cirkel med teal ring +
   punkt; kommande = grå. I läge B är "Klart" aktivt med GRÖN ring/text.
3. Tre ekonomistaplar (ebar): etikettrad (grå etikett vänster, fett belopp
   höger) + 8px track (`bg-gray-100 rounded`) med fyllnad:
   Offererat = teal (alltid 100 % som referens), Nedlagt = amber
   (andel av offererat; RÖD + beloppet rött när > 100 %, läge D),
   Fakturerat = grön. Under Nedlagt/Fakturerat en liten grå subrad
   ("61 tim à 850 kr + material 42 000 kr" / "Delfaktura 1 · betald").
   I läge C (nystartat) är Nedlagt/Fakturerat 0 kr med tomma tracks.
4. ROT-fotrad (efoot): avdelad med topplinje, grå text med fetstilta
   belopp — copy `statuskort.rot_rad`. Visas i A och C (och i desktop-B:s
   ekonomiflik); utelämnas där irrelevant.
5. Prognosrad: färgad punkt + text. Grön "Inom budget · kvar att fakturera
   92 500 kr" / amber "92 500 kr kvar att fakturera" / röd "19 000 kr över
   offererat · 32 tim mer än kalkylen" (via deriveMarginalState).
6. Läge D: statuskortet får `border-red-200`.

## "Att göra"-blocket

Rubrik "Att göra" + teal räknar-badge (antal). Ordning:
1. **Primärknappen** (fullbredd, 52px, teal, skugga) — EN per läge enligt
   HANDOFF-tabellen. I läge B ersätts den separata knappen av godkänn-kortets
   "Godkänn & skicka" (kortet är då framhävt: teal-tonad gradientbakgrund +
   teal-ish border).
2. **Röd alert** (endast läge D): `bg-red-50 border-red-200`-kort med ⚠,
   fet rubrik + brödtext (copy `over_budget_larm_*`).
3. **Godkänn-kort** (qcard): topprad = persona-avatar (30px, persona-färg,
   initial) + "{Namn} har förberett" + högerställd tagg "Skickas efter ditt
   OK" (`text-primary-700 bg-primary-50`, 10.5px). Titel (15px fet).
   Kursiv förhandsvisning i grå ruta (`bg-gray-50 border rounded-lg`,
   sms/faktura-sammanfattning). Knapprad: Godkänn (teal, flex-1) /
   Ändra (vit) / Avvisa (ghost) — 44px.
4. **Åtgärdsrader** (trow): kort med färgad statuspunkt (8px; amber =
   saknas/väntar, grå = neutral) + text ("Ingen tidrapport i går —
   **Micke & Jonas**") + teal textlänk höger ("Lägg till tid").
5. **Tomt läge** (läge C, inga förslag): streckad-border-kort, centrerat:
   teal cirkel med ✓, rubrik `tom_ko_rubrik`, text `tom_ko_text`.

## Accordion (mobil, sex grupper)

Kort med rader (44px+): ikonruta (30px, `bg-gray-100 rounded-lg`) +
fet titel + grå subrad (copy `accordion_subs`, t.ex. "185 000 kr ·
delfakturerad", "Delmoment 3 av 5 klara", "61 tim · 3 personer",
"12 filer · byggdagbok 8 inlägg · egenkontroll 6/9") + chevron höger.
Öppnad rad: `bg-gray-50`, chevron roterad, innehåll indraget under.
Delmoment-rader i öppnad Planering: ✓-cirkel (teal fylld = klar, teal-ring
= pågår + fet text, grå ring = kommande).

## Desktop (tvåkolumn)

- Brödsmula "Projekt › **Namn**". Head: H1 + meta-rad vänster; höger
  knappgrupp: "Fler åtgärder" (vit) + primärknappen (dubblerad, samma
  åtgärd som vänsterkolumnens).
- Grid `400px | 1fr`, gap 20px. Vänsterkolumn = mobilens statuskort +
  Att göra, oförändrad ordning/komponenter.
- Höger: flikrad (6 flikar; aktiv = teal text + teal underline, 2px) +
  paneler (kort med 18–20px padding, H3 15px fet).
- Paneltabeller: uppercase-kolumnrubriker (11.5px, grå, letter-spacing),
  rader med tunn delare, belopp högerställda `tabular-nums`. Statuschips i
  celler (grön "Betald 8 juli", amber "Väntar på ditt OK").
- Personal-chips: avatar + namn (fet) + roll/timmar (grå subrad) i
  `bg-gray-50 border rounded-lg`-pill.
- Ekonomiflikens utfallstabell: Post / Offererat / Utfall + ROT-fotrad
  med förklaring "(30 % av arbete inkl moms, max 50 000 kr/person)".

## Får inte glömmas

- Ägar-gating: hela ekonomiinnehållet (staplar, ROT-rad, prognos,
  Ekonomi & offert-flik) renderas ej för anställda — layouten ska se
  komplett ut även utan.
- Persona-färgerna är enda icke-teal-accenterna (+ semantiska
  grön/amber/röd-statusar).
- Alla tryckytor ≥ 44px, primärknapp 52px mobil.
