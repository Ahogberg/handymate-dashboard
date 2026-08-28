# 03 · Matte som levande huvudperson

Beslut 2026-08-28 (Andreas): Matte ska kunna bära fler annonser som återkommande karaktär. Det är rätt — han är den enda naturliga ingången till produkten, och en karaktär bygger minne på ett sätt som B-roll inte gör. Men porträttet är fotorealistiskt, vilket gör att varje steg mot "levande" också är ett steg mot "kan misstas för en riktig person". Därför en nivåtrappa, med sanningsgrind per nivå.

## Vem Matte är (karaktärsplansch)

- **Roll:** Matte, din chefsagent. Förstår målet, samordnar teamet, återkommer med läget. Han gör inte specialisternas jobb — han vet vem som gör det.
- **Temperament:** vänlig, effektiv, överblick före detalj. Ärlig när han inte vet ("det kollar jag") och delegerar hellre än låtsas kunna. Aldrig säljig, aldrig högljudd. Kort, trygg, konkret.
- **Så ser man honom:** teal hoodie är hans uniform — den är brand-chrome på en människa. Han står aldrig i kostym, aldrig i arbetskläder (han är inte hantverkaren). Han står *bredvid* hantverkaren.
- **Hans plats i bilden:** Matte är alltid **i hantverkarens värld** (verkstad, bil, kök, byggplats), aldrig i en serverhall, aldrig i ett "AI-rum". Han är det lugna i bilden när allt annat är bråttom.
- **Hans blick:** till kameran = till ägaren. Det är hans signatur: den korta blicken som säger "jag har det".
- **Hans rörelsevokabulär:** nick, lätt handrörelse mot något som händer, tittar ner på en telefon och upp igen, lutar sig mot bilen, går in i bild från sidan. Aldrig: peka i kameran, tumme upp, dansa, gestikulera stort, hålla en skärm mot kameran.
- **Vad han aldrig gör:** lovar resultat, skrattar åt kunden, ersätter hantverkaren i arbetet, syns tillsammans med en annan agent i samma generering.

## Nivåtrappan

| Nivå | Vad | Tillåtet i dag? | Sanningsgrind |
|---|---|---|---|
| **1 · Porträtt i rörelse** | 2–3 s, andning/blick/mikrouttryck, studio | ✅ Ja (Prompt D-standarden) | Ingen märkning behövs; slutkortet säger vad han är |
| **2 · Matte i scen, utan tal** | Helkropp/halvbild i verklig miljö, gör en handling (går in, nickar, tittar på telefon). Rösten är **riktig svensk VO-röst** som "Mattes röst", aldrig läppsynk | ✅ Ja, med märkning "AI-genererad visualisering" när scenen är helt syntetisk | Miljön följer `04-ljus-och-miljo.md`; ingen UI, ingen text; hantverkaren i bilden är också syntetisk eller riktig statist med medgivande |
| **3 · Talande Matte** | Läppsynkat tal till kameran | ⛔ Inte förrän Andreas beslutar per film | Kräver: (a) konsekvent identitet över minst tio genereringar bevisad på nivå 2, (b) en fast riktig röstskådespelare med avtal, (c) märkning i bild, (d) aldrig som "anställd" eller "testimonial". Nuvarande produktionsregel (`video-production-pack.md`) förbjuder läppsynk på porträtten — den måste medvetet hävas, inte glidas förbi |

Rekommendation: **bygg Matte på nivå 2 i tre filmer först** (F04 AI-knappen: Matte står bredvid pärmen med knappen; F03: Matte nickar när ljuset släcks; F08: Matte i dörröppningen till köket där rörmokaren jobbar). Då får ni identitetskonsekvens bevisad i verkliga scener innan frågan om tal ens ställs. Den riktiga VO-rösten blir "Mattes röst" och kan sedan följa med till nivå 3 utan att publiken märker ett byte.

## Higgsfield-prompter för Matte

### Nivå 1 — porträtt
Se `02-agenter.md`, porträttprompt med `{AGENT} = Matte`.

### Nivå 2 — Matte i scen (mall)

> Use the supplied Handymate portrait of Matte as a strict identity reference: man in his early thirties, short light-brown hair swept back with volume on top, close-cropped sides, short well-kept stubble, blue-grey eyes, wearing a teal hoodie with drawstrings over a dark t-shirt. Photorealistic Nordic documentary commercial, vertical 9:16, natural light. **{SCEN}** Matte's performance is calm and minimal: {EN HANDLING — e.g. "he steps into frame from the left, glances at the work, then gives one short reassuring look to camera"}. He does not speak, point at the camera or gesture broadly. Realistic Swedish environment, restrained slate and natural wood, subtle teal accents only in his hoodie. No readable screens, text, logos, money, charts, robots, holograms or floating UI. Leave negative space for Swedish captions. 4 seconds, native ambience, consistent identity and wardrobe with the reference.

Scenexempel:
- **F04:** "A modest Swedish trades office with an oversized unbranded teal push button taped to a paper binder on the desk. Matte stands beside the desk, arms relaxed, watching the button with a dry, patient expression. Nothing happens. He gives one small knowing look to camera."
- **F03:** "Outside a small Swedish trades workshop at blue hour. The owner closes the door and the practical lights switch off one by one. Matte stands a few metres away by an unbranded van, gives the owner a short nod, then looks calmly toward the darkened workshop."
- **F08:** "An ordinary Scandinavian kitchen where a plumber is fully occupied beneath the sink. Matte stands in the doorway holding a phone loosely at his side, screen turned away, and glances from the phone toward the plumber with a relaxed 'I've got it' expression."

### Identitets-QA per klipp (kassera om något faller)
Hårfärg/frisyr identisk · skäggstubbens längd · ögonfärg · hoodiens färg och snören · ålder (ingen drift mot 20 eller 45) · inga extra fingrar · ingen förändring av ansiktsform mellan bild 1 och sista bilden · ingen text på hoodien.

## Andra karaktärer bredvid Matte

Hantverkaren i scenen är alltid en **annan** människa (riktig statist eller syntetisk) — Matte är aldrig hantverkaren. Andra agenter får synas i **egna** klipp som klipps ihop i post, aldrig i samma generering som Matte.
