# Seedance 2.5 — produktionsguide och prompter

## Verifierad kapacitet

ByteDance lanserade Seedance 2.5 den 31 juli 2026. Den officiella beskrivningen
anger upp till 30 sekunder per generering, möjlighet till förlängning,
referensstyrning med upp till 30 bilder, 10 videoklipp och 10 ljudklipp samt
redigering med tidsstyrd kontroll. API-åtkomst via BytePlus ModelArk är
annonserad men beskrevs vid lanseringen som kommande.

Officiella källor:

- https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5
- https://seed.bytedance.com/en/seedance2_5

## Handymates användningsregel

Seedance används för:

- dokumentär B-roll,
- miljöer och kamerarörelser,
- konceptfilmen 2006 → 2026,
- subtil rörelse i agentporträtt,
- övergångar och visuella metaforer.

Seedance används inte för:

- fejkade produktgränssnitt,
- påhittade kundresultat eller testimonials,
- syntetisk Andreas eller annan verklig person utan uttryckligt medgivande,
- läppsynkade agentporträtt som utger sig för att vara verkliga anställda,
- konkurrenters logotyper, gränssnitt eller varumärkesuttryck,
- läsbar svensk text inne i den genererade scenen.

Syntetiska scener märks i produktionsloggen. När en hel publicerad film är
syntetisk eller en syntetisk person uppfattas som verklig används en synlig,
kort märkning: “AI-genererad visualisering”.

## Gemensam visuell referens

- fotorealistisk svensk/nordisk dokumentär reklamfilm,
- verklig hantverksmiljö, inte generisk amerikansk byggarbetsplats,
- slate, naturligt trä, kallt morgonljus och Handymate-teal som diskret accent,
- vardagliga arbetskläder utan logotyper,
- naturliga hudtoner och trovärdig fysik,
- kameran observerar; ingen överdriven reklamfilmsposing,
- negativ yta för typografi som läggs på i efterbearbetning,
- inga pengar, diagram, hologram, robotar eller flytande UI.

## Prompt A — morgonen innan systemet vaknar

```text
Create a photorealistic Nordic documentary commercial scene, vertical 9:16,
inside a small Swedish trades company's workshop at 06:45 in late summer. A
male trades business owner in his early forties opens an unbranded work van,
checks a smartphone briefly, then loads ordinary tools. Natural cool morning
light outside, one warm practical light inside the van, restrained slate,
wood and muted teal accents. Camera begins in a medium-wide locked shot and
makes a slow controlled push-in. Natural movement, realistic hands, fabric and
tool weight, subtle fatigue but calm confidence. Leave clean negative space in
the upper left for typography added later. No readable phone screen, no text,
logos, money, charts, robots, holograms or floating user interface. This is
conceptual campaign B-roll, not a customer testimonial. Native ambient audio:
van door, distant birds, tools shifting, quiet Swedish morning. 8 seconds.
```

## Prompt B — 2006, administration after work

```text
Create a photorealistic cinematic documentary scene, 16:9 and safe for a 9:16
crop, set in a modest Swedish trades office in the year 2006 after dark. A
tired trades business owner sits down after a physical workday, opens a thick
binder, sorts paper invoices and types into an old beige desktop computer.
Fluorescent practical light, grey-blue palette, believable Swedish office
details, no recognizable brands. Begin with a close-up of dusty work hands on
the binder, transition to a medium profile shot, then a slow overhead reveal
of the growing paperwork. Natural restrained performance, no comedy and no
caricature. No readable software, text, logos, money amounts or competitor
interfaces. Native sound: paper, keyboard, wall clock, distant ventilation.
10 seconds.
```

## Prompt C — övergång 2006 till 2026

```text
Use the supplied 2006 office clip as the opening reference and the supplied
modern Nordic worksite clip as the ending reference. Create one seamless
cinematic transition: the old paper binder closes, its movement becomes the
sliding door of a modern unbranded work van opening into a bright Swedish
morning in 2026. Preserve realistic physical motion and consistent direction
of travel. Shift gradually from cold fluorescent grey to natural daylight and
subtle Handymate teal accents. No on-screen text, logos, money, charts or
generated software UI. Preserve room tone during the office portion and blend
into outdoor morning ambience. 6 seconds.
```

## Prompt D — agentteamet får subtil rörelse

```text
Use the six supplied Handymate agent portrait images as strict identity and
wardrobe references. Create six separate 2-second portrait clips with the same
soft off-white studio background and matching camera language. Each subject
has only subtle natural movement: breathing, a small eye movement and a calm
micro-expression. Slow 3 percent camera push-in, no speaking, no lip sync, no
gestures, no wardrobe changes and no identity blending. Preserve face,
hairstyle, age, clothing and portrait lighting exactly. No text or logos. These
are visual product characters, not real employees giving testimonials.
```

Generate one agent per run if identity consistency drops. Assemble the six
clips in normal editing software with Handymates real typography and names.

## Prompt E — kunden följer projektet utan att jaga

```text
Create a photorealistic Nordic home renovation moment, vertical 9:16. A
homeowner in an ordinary Scandinavian kitchen checks a smartphone and visibly
relaxes after receiving an update. Keep the phone screen turned away or softly
out of focus because the real Handymate customer portal will be composited in
post-production. Natural window light, restrained premium documentary style,
subtle lived-in home details, no posing and no testimonial delivery. The camera
makes a gentle lateral move from renovation details to the homeowner. No
readable screen, text, logos, money, charts or speech. Native room ambience.
6 seconds.
```

## Prompt F — reaktivering utan spamkänsla

```text
Create a photorealistic Swedish trades business owner during a quiet gap in
the work week, standing beside an unbranded van and reviewing a small paper
schedule before checking a smartphone. The emotional direction is thoughtful
and proactive, never desperate sales behavior. A second shot shows a former
customer noticing a normal message on a phone while at home, with the screen
unreadable and no exaggerated reaction. Nordic documentary commercial style,
natural daylight, muted slate and wood, discreet teal accent. No bulk-message
visuals, contact lists, readable text, logos, money, charts or testimonials.
8 seconds.
```

## Referenspaket per generering

För varje film används endast nödvändiga referenser:

1. färg- och ljusreferens från `worksite-morning-source.png`,
2. relevant agentporträtt vid agentfilm,
3. verklig kamerarörelse som motion reference när det finns,
4. verklig rumston eller licensierad musikreferens,
5. slutbildens layout som kompositionsreferens — aldrig som en bild modellen
   ska försöka skriva om.

## Kvalitetsgrind

Kassera klippet om något av följande uppstår:

- onaturliga händer, verktyg eller kroppsrörelser,
- arbetsmiljö som ser osvensk eller iscensatt ut,
- oläsbar pseudotext som drar blicken,
- förändrat agentansikte eller klädsel,
- oavsiktlig logotyp,
- scener som kan tolkas som verkliga kundbevis,
- ett produktbeteende som Handymate inte har.

Ett realistiskt klipp är inte automatiskt ett sant klipp.
