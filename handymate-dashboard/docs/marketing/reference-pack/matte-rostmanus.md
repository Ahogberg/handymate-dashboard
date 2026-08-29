# Mattes röstmanus — inspelningslista för riktig röst

Alla Matte-repliker i de tre filmerna (Knappen v2, F13, F14). En röst, ett pass.
Uppdaterad 2026-08-29. Partnerrösten i F13 ("Kommer du och lägger dig?") är en KVINNLIG separat röst och ingår inte här.

## Så spelas det in
- Tyst rum utan efterklang (garderob med kläder funkar). Mobil 20–30 cm från munnen räcker; 48 kHz om appen kan.
- Torrt och lågmält. Matte är deadpan: aldrig "reklamglad", aldrig ironisk betoning — skämtet ligger i texten.
- En fil per replik (namnen nedan), eller en lång tagning med 3 s paus mellan raderna.
- Läs varje rad 3 gånger: rakt · ännu torrare · med en halv sekunds paus före sista meningen.
- Raderna märkta **[viskning]** läses tätt intill mikrofonen, luftigt, som en naturfilmsberättare vid ett skyggt djur.
- Dessutom: läs 60–90 s valfri lugn text (t.ex. en nyhetsartikel) — används för att klona rösten så framtida filmer inte kräver nytt pass. Kräver att röstens ägare godkänner kloning skriftligt (sms räcker).

## Knappen v2
1. `matte-knappen-01.wav` — "Det gamla sättet är förbi. Välkommen till framtiden — där ditt digitala team arbetar för dig."

## F13 · Efter jobbet
2. `matte-f13-01.wav` — "Gå och lägg dig, du. Vi tar det härifrån."
3. `matte-f13-02.wav` — "Fakturorna. Kalendern. Offerterna. Telefonen. Kunderna."  *(fem ord, ~0,5 s luft mellan varje — orden pekar ut en agent i taget)*
4. `matte-f13-03.wav` — "Du godkänner i morgon. Vi gör resten."

## F14 · De dog aldrig ut
5. `matte-f14-01.wav` — **[viskning]** "Vi har hittat ett exemplar som tros härstamma från tvåtusensex."
6. `matte-f14-02.wav` — **[viskning]** "Var försiktig… Om du matar den med samma uppgifter två gånger — då börjar den tro att den arbetar."
7. `matte-f14-03.wav` — "Vad vill du egentligen uppnå?"  *(vänligt, till hantverkaren — inte till kameran)*
8. `matte-f14-04.wav` — "Vissa system hör hemma på museum."  *(slutgagg — torrast av alla)*

## Vad som händer sen (Claude)
- Filerna läggs i `docs/marketing/reference-pack/assets/audio/matte-rost/`.
- Kloning: Higgsfield `create_voice` på uppläsningstexten → framtida repliker genereras med klonen.
- Läppsynk om: Sync körs om på fyra tagningar — Knappen närbilden, F13 Matte-tagningen, F14 B7 + B8b (~120 kr totalt).
- VO-raderna byts rakt i mixarna (0 kr) och alla tre mastrar renderas om.

## Voice Design-prompt (ElevenLabs "Create a voice from a prompt")

Testad väg när biblioteksröster (som Adam Composer) krävde betald plan för API-åtkomst — en egen Voice Design-röst räknas normalt inte som "library voice" och kan därför fungera även på lägre nivåer. Generera på elevenlabs.io → Voice Design (eller "Text to Voice"), välj bästa av de tre förslagen, spara i biblioteket.

**Prompt (engelska — ElevenLabs Voice Design tolkar beskrivande engelska mest exakt, även för en svensktalande röst):**

> A calm, dry-witted Swedish man in his early thirties, native Swedish accent. Warm but understated voice, medium-low pitch, relaxed chest resonance, unhurried pacing with natural short pauses for effect. Speaks with quiet confidence and deadpan humor — never salesy, never overly enthusiastic, always sounds like he is quietly in control of the situation. Clear articulation, minimal vocal fry, the tone of a trusted colleague calmly explaining something simple. Capable of a light whisper for hushed documentary narration without losing warmth.

**Textprov att läsa upp (klistra in i "Sample text", svenska — visar registret Matte behöver):**

> Vi tar över nu. Inget dramatiskt, ingen show — bara fakturorna, kalendern, offerterna, telefonen, kunderna. Du sover, vi jobbar. I morgon godkänner du det som är viktigt, och vi sköter resten. Vissa system hör hemma på museum. Det här gör det inte.

**Efter generering:**
1. Lyssna på alla tre förslag, spara den bästa i biblioteket (ger den ett voice_id).
2. Testa om `text_to_speech`-anropet fungerar mot den nya rösten via API (kringgår ev. "library voice"-spärren från betalkravet).
3. Om den håller: läs in de åtta replikerna ovan med den nya rösten, annars fortsätt med manuell export.
