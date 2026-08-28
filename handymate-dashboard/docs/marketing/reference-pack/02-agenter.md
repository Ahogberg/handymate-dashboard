# 02 · Agenterna — identitetslås

Porträtten i `assets/agents/` (1024×1024, fotorealistiska, källa `public/marketing/content-library-v1/avatars/`) är **de enda** identitetsreferenserna. Beskrivningarna nedan är skrivna från vad som faktiskt syns i filerna — de används i prompten *tillsammans med* bilden, aldrig i stället för den. Ändra aldrig ålder, frisyr, garderob eller uttryck i prompten; beskriv bara vad som redan finns så modellen inte driver.

Regler som gäller alla sex:
- En agent per generering. Aldrig två porträtt i samma körning — det är så ansikten blandas.
- Porträtten är produktkaraktärer, inte anställda. Aldrig testimonial, aldrig "kund".
- Standardnivå är **kontrollerad rörelse utan tal** (andning, blick, mikrouttryck, 3 % push-in). Tal/läppsynk är bara tillåtet för Matte enligt nivå 3 i `03-matte-huvudperson.md`.
- Bakgrund i porträttklipp: mjuk varm off-white studio (`#F7F8F6`). Fem porträtt har den redan; **Lisas porträtt har en oskarp kontorsbakgrund** — be modellen behålla bakgrunden *ur bilden*, inte "studio", annars driver identiteten. Alternativt: generera Lisa på hennes egen bakgrund och lägg ett lätt off-white-tonat lager i post för att matcha serien.

| Agent | Publik roll | Identitetslås (det som syns) | Garderob | Ring |
|---|---|---|---|---|
| **Matte** | din chefsagent | Man, tidiga 30, ljusbrunt kort hår bakåtkammat med volym upptill, kortklippta sidor, kort välansad skäggstubb, blågrå ögon, bred vänlig leende med tänder, rak blick i kameran | Teal hoodie (`≈ #0F9B8E`) med snören, mörk t-shirt under | `#0F766E` |
| **Karin** | din ekonom | Kvinna, ~45, blond page till hakan med sidbena, ljusa blågrå ögon, små pärlörhängen, varmt professionellt leende, lätt vinklad kropp, blick i kameran | Marinblå kavaj, svart topp | `#2563EB` |
| **Daniel** | din säljare | Man, ~40, mörkbrunt bakåtstruket hår med lätt grå tinning, kort mörk skäggstubb, blå ögon, brett självsäkert leende, huvudet lätt lutat | Ljusblå skjorta, öppen krage | `#D97706` |
| **Lars** | din projektledare | Man, ~50, gråmelerat kort hår, kort grått skägg, blågrå ögon, varmt avslappnat leende, axlarna rakt mot kameran | Marinblå pikétröja | `#059669` |
| **Hanna** | din marknadschef | Kvinna, ~30, långt mörkbrunt rakt hår, grågröna ögon, tydliga ögonbryn, litet diamantörhänge, energiskt leende, lätt vinklad | Mörk melerad kavaj, färgglad mönstrad topp (rosa/gult/blått — **den enda färgstarka detaljen i hela teamet, behåll den**) | `#9333EA` |
| **Lisa** | din kundservice | Kvinna, ~28, blont axellångt hår med mjuk sidbena, blå ögon, lätta fräknar, öppet vänligt leende | Ljusblå finrandig skjorta | `#0EA5E9` |

## Porträttprompt (kopiera, byt namn)

> Use the supplied Handymate portrait of **{AGENT}** as a strict identity, wardrobe, hairstyle, age and lighting reference. Create one separate 2.5-second portrait clip on the same soft warm off-white studio background as the reference. Only subtle natural motion: breathing, one small eye movement, a calm micro-expression that starts from the reference smile. Slow 3 percent camera push-in, locked framing identical to the reference crop. Preserve face, hairstyle, age, clothing and portrait lighting exactly. No speaking, no lip sync, no gestures, no wardrobe change, no identity blending, no text, no logos. This is a visual product character, not a real employee.

För Lisa: byt "same soft warm off-white studio background as the reference" mot "the same softly blurred light-grey interior background as the reference".

## Vad rollerna får säga (från messaging-playbooken)

Första omnämnandet alltid "Matte, din chefsagent" — därefter bara namnet. Verb för specialisterna: *föreslår, förbereder, upptäcker, följer upp*. Aldrig: magisk AI, självkörande, robotmedarbetare, garanterad intäkt/tidsbesparing. **Lisa "svarar" aldrig i telefonen** — hon *fångar* missade samtal och förfrågningar.
