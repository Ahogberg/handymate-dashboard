# Designbrief — överlämning till teamet och Jobbkompisens ansikte

Underlag för Claude Design. Beslutad vokabulär och arkitektur från samtalen
2026-09-08. Backend byggs parallellt av Codex; skissen ska driva bygget, inte
komma efter.

---

## 1. Vad vi designar och varför

Hantverkaren ska kunna lämna över något till teamet och sedan se vad som hände.
I dag finns chatten, korten och Mission Control, men de känns som tre olika
produkter. Det här passet ska få dem att kännas som ett team man pratar med.

**Vokabulären är beslutad. Använd exakt dessa ord.**

| Ord | Betyder | Exempel |
|---|---|---|
| Jobb | Hantverkarens arbete åt en kund | Badrum hos Andersson |
| Uppdrag | Ett mål teamet driver över tid | Fyll nästa månads lediga tider |
| Teamets uppgifter | Konkreta steg mot målet | Följ upp offerten till Andersson |
| Behöver dig | Beslut eller underlag som kräver hantverkaren | Godkänn priset på tilläggsarbetet |

Teamets uppgifter får **aldrig** egen navigation. Det är innehåll som visas
inne i de tre andra.

**Arkitekturen är beslutad: en dörr in, flera ställen att se resultatet.**
Jobbkompisen är dörren och är monterad på varje sida. Mission Control,
kundjobbet och Behöver dig är vyer, inte ingångar.

---

## 2. Fyra sorters överlämning

Skissen ska visa att samma dörr tar emot fyra olika saker och att svaret ser
olika ut beroende på vilken det är.

1. **Fråga.** "Hur mycket har vi fakturerat på Solvägen?" Ger ett svar med
   källa. Ingen handling, inget kort.
2. **Uppgift.** "Följ upp offerten till Andersson." Ger ett sparat nästa steg
   och senare ett kort när något är förberett.
3. **Uppdrag.** "Fyll nästa månads lediga tider." Ger en plan med steg och en
   tidsram. Visas i Mission Control.
4. **Underlag.** Dikterad text eller foto: "Kunden vill ha kakel till taket
   också." Ger ett utkast att granska, offert eller rapport.

Samma inmatningsfält, olika utfall. Det är det som ska synas.

---

## 3. Jobbkompisens ansikte

**Så ser den ut i dag:** en rundad kvadrat 56 × 56 px nere till höger, och
ovanför den upp till tre små pillerformade knappar i bärnsten och teal. Panelen
är 400 × 560 px med vit genomskinlig bakgrund och oskärpa.

**Det som ska bli bättre:**

- **Mattes porträtt i knappen.** Komponenten `AgentAvatar` finns och hämtar
  bilden ur Supabase storage med bokstäver som reserv. Knappen ska kännas som
  en person, inte en ikon. Reservläget måste också vara snyggt.
- **Textbubblorna ska lära ut beteendet.** Pillren finns redan men används som
  notiser. De ska i stället då och då säga vad man kan göra: "Fråga mig vad
  Solvägen har kostat", "Säg vad du gjorde i dag så skriver jag rapporten".
  Designa tre lägen: tyst, ett tips, en väntande notis. Tipsen ska kännas som
  att någon lutar sig fram, inte som en reklamruta. Frekvens och avklickning
  ska framgå av skissen.
- **Övergången till samtal.** I dag byter panelen läge. Det ska kännas som att
  bubblan växer till ett samtal. Rörelsen ska vara snabb och gå att hoppa över.
- **Svaret ska komma löpande.** Se avsnitt 5, detta kräver backend.

---

## 4. Samtalet som blir arbete

Det här är produktens berättelse och den viktigaste artboarden.

Hantverkaren skriver eller säger något. Matte svarar i löpande text. Svaret
delar sig i det som är information och det som är handling. Handlingarna blir
tydliga delsteg med ansvarig agent. Det som kräver ett beslut blir ett kort
som hamnar i Behöver dig, och det ska synas att det är samma kort som finns i
inkorgen, inte en kopia.

**Agentöverlämning.** Matte kan lämna över till en annan agent för dennes
område. Verktyget finns redan i koden. Regeln i designen: **en agent får bara
uttala sig om det den kan läsa, och kommentaren ska visa sin källa.** Daniel
som kommenterar en offert ska peka på offertraden. Utan källhänvisning är det
teater som låter som expertis, och det tappar förtroendet i vecka tre även om
det imponerar i demon.

---

## 5. Vad som har data i dag och vad som kräver backend

Varje element i skissen ska gå att koppla till ett fält. Markera i duken vad
som är vad.

**Finns i dag:** agentporträtten, korten i Behöver dig (`pending_approvals`),
uppdraget med plan och framdrift (`mission`, `plan_snapshot`), kundjobben
(`project`), agentöverlämning som verktyg (`handoff_to_agent`), sidkontexten
som ger chatten rätt projekt.

**Kräver backend, bygg inte in ett löfte utan täckning:**

- **Löpande text.** Chatten strömmar inte i dag, den returnerar ett färdigt
  svar. Kräver SSE eller ReadableStream, och modellen anropar verktyg mitt i
  turen så det är inte bara att strömma tokens.
- **Tidpunkter.** Det finns ingen schemalagd åtgärd som primitiv i agentvägen.
  Agenterna körs av croner som sveper. Visa **aldrig** ett klockslag i skissen
  om det inte finns en rad som bär tiden. Skriv hellre "Bevakar" utan tid.
  Codex bygger primitiven nu; först när den finns får klockslag ritas.
- **Källhänvisning i agentkommentar.** Kräver att kommentaren bär ett id.

---

## 6. Ramar

- **Mobilen först.** Det används i bilen med handskar på. Ingen spaltning
  fungerar på 375 px. Rita mobilen först och skalla upp, inte tvärtom.
- **Färger:** primärskalan är teal, 700 är `#0f766e`, 600 `#0d9488`,
  50 `#f0fdfa`. Bärnsten används redan för det som väntar.
- **Rörelse ska vara snabb.** En animation som charmar vid demo ett stör vid
  användning fyrtio. Allt ska gå att hoppa över och respektera
  `prefers-reduced-motion`.
- **Träffytor minst 44 px.** Kontrast enligt WCAG AA.
- **Ärlighetsreglerna gäller i varje text.** Lisa fångar, hon svarar aldrig.
  Beräknade tal märks Uppskattat. Ingen agent lovar bevakning som inte finns
  sparad. Inget skickas till kund utan ett uttryckligt ja.

---

## 7. Artboards

I prioritetsordning. De fyra första är de som betyder mest.

1. **Jobbkompisen i vila** — knappen med porträtt, tre lägen: tyst, tips,
   väntande notis. Mobil och desktop.
2. **Samtalet** — övergången från knapp till samtal, löpande svar, Mattes
   porträtt i tråden.
3. **Samtalet blir arbete** — svaret delar sig i delsteg och ett kort som
   hamnar i Behöver dig.
4. **Agentöverlämning** — Daniel kommenterar med synlig källa.
5. **Överlämning från ett kundjobb** — samma dörr, med jobbets kontext ifylld.
6. **Mission Control** — ett uppdrag: mål, tidsram, vad teamet tar ansvar för,
   nästa steg, vad som behöver dig, vad det gett hittills.
7. **Behöver dig** — den gemensamma inkorgen, med ursprunget synligt på varje
   kort.

Mobilbredd 375 px, desktop 1280 px.
