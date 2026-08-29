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
