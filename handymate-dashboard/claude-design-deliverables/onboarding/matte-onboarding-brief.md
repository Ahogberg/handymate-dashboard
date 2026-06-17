# Claude Design-brief — Matte-guidad onboarding (konversationell v3)

**Typ:** Design-sprint-brief (INPUT till Claude Design). 2026-06-15.
**Spec:** `tasks/onboarding-matte-spec.md` · **Parent-vision:** `roadmap-learning-ai.md` Fas 2.5.

---

## Vad vi vill ha designat
En **konversationell onboarding** där hantverkaren möter **Matte** (AI-chefsassistenten) i en dialog
istället för ett formulär. Det är "första kapitlet i hantverkarens relation med systemet" — den ska
kännas som att Matte lär känna företaget, inte som ett registreringsformulär i chatt-skal.

Leverera **5 nyckelskärmar (en per fas A–E), desktop + mobil**, + Matte:s visuella identitet +
ackumulerings-panelens tillstånd + rörelse-/animationsnoteringar. Samma leveransformat som den befintliga
onboarding-leveransen (`index.html`-demo + css + per-skärm-jsx).

## KRITISK ramvillkor: bygg på befintligt system — rebranda INTE
Detta är en **utökning** av nuvarande onboarding-design, inte ett nytt varumärke. Återanvänd:
- `app/onboarding/onboarding.css` — designtokens, färg/typografi/spacing (ljust tema, teal `#0F766E`
  primär, Space Grotesk rubriker + DM Sans brödtext). **Inget mörkt tema.**
- `ob-shared.jsx` (Icon + Header) och agent-avatarerna (Matte/Karin/Daniel/Lars/Lisa/Hanna — verkliga
  bilder finns i `lib/agents/team.ts`).
- Kort/knapp-primitiver + team-presentations-känslan från `ob-screen1` (MeetTheTeam) och `ob-screen6` (LiveTour).
- All UI på **svenska**. Mobil + desktop (split-screen → staplat på mobil).

## Paradigmet (det net-nya att designa)
- **Split-screen ~60/40:** vänster = Matte-dialog (chatt, streaming-text, "skriver…"-indikator), höger =
  **ackumulerande panel "Ditt företag tar form"** som fylls i takt med samtalet.
- **Hybrid:** konversation för det icke-uppenbara (vision, ton, arbetssätt), **inline strukturerad input**
  för det uppenbara (org-nr, adress, arbetstider) — fält dyker upp i dialogen, inte separata formulär.
- **Epistemisk hierarki i panelen (viktigt):** visuellt skilja tre nivåer —
  **Bekräftat** (användaren angav) · **Tolkat** (skrapat/härlett — Matte frågar "stämmer det?") ·
  **Lär mig över tid** (framtida, gråtonat löfte). Tänk MarginalCard-känsla.
- **Faser med andning:** tydlig men lugn progress mellan A–E, inte en stressig stegmätare.
- **"Hoppa till formulär"-utgång:** alltid tillgänglig (diskret, övre hörn) för pragmatiska användare.

---

## De 5 nyckelskärmarna

### A — Vem ni är
- Matte: *"Hej! Jag är Matte. Innan teamet drar igång vill jag lära känna ert företag. Har ni en hemsida?"*
- Inline-input: hemside-URL, org-nr, adress.
- **Skrap-ögonblick:** efter URL → "Jag tittar på er sajt…" (kort laddning) → panelen börjar fyllas.
- Panel: företagsnamn/ort dyker upp, taggade **Bekräftat** (org-nr) vs **Tolkat från hemsidan**.

### B — Vad ni gör  *(skrapnings-validering — kärnögonblick)*
- Matte presenterar tolkningen: *"Jag ser att ni gör badrum och elinstallationer, och tonen på er sajt är
  personlig. Stämmer det?"*
- Inline: redigerbara **chips** för tjänster/specialiteter (förifyllda från skrapning) + ton-väljare.
- Panel: tjänster + ton ackumuleras; **Tolkat → blir Bekräftat** när användaren godkänner (visa övergången).

### C — Hur ni jobbar
- Matte: *"När jobbar ni, och hur tar ni betalt?"*
- Inline: arbetstider, timpris-intervall, ROT-default.
- Panel: arbetstider + pris (Bekräftat).

### D — Verktyg  *(import + kalender bor här)*
- Matte: *"Nu kopplar vi era verktyg så teamet kan börja jobba."* (mer action än dialog)
- Verktygs-kort:
  - **Importera kunder** — CSV-upload (drag-drop), tydlig **"Hoppa över"**.
  - **Koppla Google Calendar** — OAuth-knapp (låter Lisa boka riktiga tider).
  - **Email-vidarekoppling** — inaktiv "Kommer snart"-rad.
  - **Fortnox** — inaktiv "Kommer snart"-rad.
- Panel: "X kunder importerade", "Kalender kopplad ✓".

### E — Presentation av teamet  *(magiskt ögonblick)*
- Matte introducerar varje kollega, förankrat i det som FAKTISKT är känt:
  *"Det här är Lisa — hon svarar redan på ert nummer. Karin sköter fakturorna. Daniel följer upp offerter."*
- **Ärlighets-villkor (viktigt — inga fejk-insikter):** dag 1 finns ingen historik, så introt får INTE
  påstå datadrivna fynd ("Karin hittade 14 000 kr"). Det som ÄR sant: Lisa är live på numret, teamet är
  konfigurerat efter era tjänster/tider, kalendern kopplad. "Lär mig över tid"-löften visas gråtonat
  ("Ju mer ni använder mig, desto bättre lär jag känna era mönster").
- Panel: komplett "ditt företag"-sammanfattning + hela teamet.
- CTA: **"Kör igång"** → dashboard. Ev. mjuk first-win: "Ring ert nummer och hör Lisa svara."

---

## Matte:s visuella identitet (designas)
- Hur Matte "är närvarande" i dialogen (avatar, namn, streaming-text, "skriver…"-indikator).
- Ton: varm, kompetent, lugn — kollega, inte chatbot. Svensk röst.
- Skilj Matte:s repliker tydligt från användarens input + de inline strukturerade fälten.

## Rörelse / motion
- Ackumulerings-narrativ: hur poster glider in i panelen när de bekräftas/tolkas.
- "Andning" mellan faser (mjuk övergång, inte hård stegväxling).
- Magic-moment-reveal i fas E (teamet "vaknar").
- Tolknings→bekräftat-övergången i panelen (B).

## Tvärgående krav
- **Mobil:** split-screen → staplat (dialog överst, panel som hopfällbar sammanfattning/expanderbar).
- **Paus/återuppta:** flödet kan avbrytas och fortsätta (visa var man är).
- **Korrigering:** klick på en panel-post → rätta den (mid-konversation).
- **Hoppa till formulär:** alltid synlig utgång.

## Uttryckligen UTANFÖR scope (designa inte funktion för dessa nu)
- Multi-entitet-import/MCP-migrering (Fas 3) — bara kund-CSV i fas D.
- Faktiska email-routing-/Fortnox-flöden — bara "Kommer snart"-rader.
- Datadrivna agent-insikter i fas E — det kräver historik som inte finns dag 1 (Fas 3).

## Leverabler
1. 5 nyckelskärmar A–E, **desktop + mobil**.
2. Matte:s identitet + dialog-komponenter (replik, "skriver…", inline-fält).
3. Ackumulerings-panelen i dess tillstånd (tom → halvfylld → komplett) med epistemiska taggar.
4. Motion-/animationsnoteringar.
5. Format som befintlig leverans: `index.html`-demo + `onboarding-v3.css` (utökning av befintlig) +
   per-skärm-jsx, så det går att porta likadant.
