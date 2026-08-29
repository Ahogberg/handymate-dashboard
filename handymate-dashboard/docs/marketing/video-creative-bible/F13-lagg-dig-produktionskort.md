# FILM 13 · F13 · DEADPAN MED HELA TEAMET

## Gå och lägg dig

Tillägg till Video Creative Bible (2026-08-29). Idé: Andreas ("Gå och lägg dig, ditt digitala team tar över" — och hela teamet kliver in och börjar jobba). Byggs med Knappen v2-reglerna i `film-factory.md`.

**Längd** 20–26 sekunder
**Format** 9:16 Reel/TikTok/Short · 4:5 LinkedIn (beskär från samma master)
**Mål** Visa kategoriskillnaden känslomässigt: du får inte ett system, du får ett team. Kvällsjobbet vid köksbordet är den bild varje ägare känner igen.

### Hook
Klockan 22.14 på en mikrovågsugn. Ett köksbord täckt av fakturor, offerter och en papperskalender. Hantverkaren i arbetskläder med kaffe. Partnern i dörren, redan i morgonrock. Ingen säger något.

### Manus / voiceover
Ingen VO. Matte pratar (nivå 3, Benji-rösten) — det är hans andra talade film efter Knappen.

- Beat 1 (0–4 s): Köksbordet. Hantverkaren bläddrar, suckar, tittar på klockan. Partnern i dörren: "Kommer du?" (text i bild, inte tal — sparar en läppsynk).
- Beat 2 (4–9 s): Matte står plötsligt bakom stolen, hoodie, händerna i fickan. Torr, lugn: **"Gå och lägg dig. Ditt digitala team tar över."**
- Beat 3 (9–16 s): Hantverkaren reser sig, går. I samma tagning kliver teamet in bakom Matte och tar bordet: Karin drar fakturahögen till sig, Lars vecklar upp kalendern, Daniel tar offertbunten, Hanna ställer sig med telefonen, Lisa vänder hantverkarens telefon uppåt och läser. Matte tittar in i kameran. Ingen dramatik — de sätter sig och jobbar.
- Beat 4 (16–20 s): Riktigt produktbevis: morgon, hemmet i Handymate: "Det här behöver dig idag" — tre riktiga kort med agentnamn, redo att godkännas.
- Slutrad (20–24 s): "Inte ett system. Ett team." · handymate.se

### Shotlist
1. **Tagning 1 · helbild, låst kamera (9 s, Seedance 2.5 omni-referens):** kök kväll, hantverkare vid bordet, Matte kliver in bakom stolen vid ~4 s och står stilla. Refs: kök-still (genereras först, 1 bild), hantverkare (ny karaktärsbild, INTE gubben från Knappen), Matte-porträtt.
2. **Tagning 2 · halvnära på Matte (8 s, Seedance 2.0 + Element):** repliken. Startbild = Mattes ansikte klippt ur tagning 1:s 4K (V09-metoden) så identiteten är bevisligen samma. Audio_ref = Benji-repliken. Sync Lipsync efteråt.
3. **Tagning 3 · helbild, samma kamera som tagning 1 (9–12 s, Seedance 2.5):** startbild = tagning 1:s sista bildruta. Hantverkaren reser sig och går ut vänster; teamet kommer in höger/bakifrån och tar platserna. Refs: tagning 1-sista-bild + fem agentporträtt (se sanningsgrind om identitet).
4. **Inserts (valfria, 2 × 5 s, Seedance 2.0 + Element per agent):** Karin lyfter fakturahögen; Lars stryker med fingret längs kalenderraden. En agent per generering (reference-pack `02`). Ger klippet rytm och gör teamet igenkännbart även om helbilden tappar ansikten.
5. **Produktbevis (0 kr, inspelningsläge):** ny spec `tests/filming/f13-lagg-dig.spec.ts` — seedar tre riktiga kort på demokontot (fakturapåminnelse Karin, offertuppföljning Daniel, ett tredje sant kort) och filmar "Det här behöver dig idag" i morgonläge.
6. Slutkort som Knappen (off-white, teal-logga, Space Grotesk).

### Higgsfield-prompter

**Kök-still (referensbild, generate_image):**
> Photorealistic ordinary Swedish kitchen at night, vertical 9:16. A worn wooden kitchen table covered with paper invoices, printed quotes, a paper wall calendar laid flat, a calculator and a coffee mug. One warm pendant lamp over the table, the rest of the kitchen dim; a microwave clock glows green in the background. Doorway to a dark hallway on the left. Lived-in Scandinavian home, restrained colours, natural wood and slate. No people, no readable text, no logos, no screens with UI.

**Tagning 1 (helbild):**
> One continuous take, static locked camera, vertical 9:16, wide shot of the kitchen from the first reference image, night. A tired Swedish tradesman in his forties (second reference image: work trousers, faded t-shirt, short hair) sits at the table sorting paper invoices, rubs his eyes, glances toward the microwave clock. At four seconds the young man from the third reference image (early thirties, light-brown hair swept back, short stubble, PLAIN teal hoodie with no print, no logo, no text, hands in the hoodie pocket) steps calmly into frame behind the chair and stands still, looking at the papers, then at the camera. Nothing else happens. Deadpan, quiet, warm pendant light, realistic skin and fabric, natural micro-movement. No text, no logos, no readable documents, no phone screens.

**Tagning 2 (halvnära, repliken):** Knappen v2-prompten för tagning 3 (promptlogg #25) med kök i stället för kontor, utan gubbe-gag. Startbild ur tagning 1.

**Tagning 3 (teamet kliver in):**
> Same locked camera and kitchen as the start image, continuous take, vertical 9:16, night. The tradesman stands up, leaves his mug, and walks out of frame to the left without looking back. As he leaves, five colleagues enter calmly from the right and from the hallway and take over the table, each from their own reference portrait and in exactly their reference clothing: a woman around forty-five with a blond bob in a navy blazer pulls the invoice pile toward her and sits; a man around fifty with short grey hair and grey beard in a navy polo shirt unfolds the paper calendar; a man around forty with dark swept-back hair and light-blue open-collar shirt picks up the printed quotes; a woman around thirty with long dark hair in a dark blazer and a colourful patterned top stands at the end of the table with a phone; a woman in her late twenties with blond shoulder-length hair in a light-blue striped shirt turns the tradesman's phone face up and reads it. The young man in the plain teal hoodie stays behind the chair and gives one short look to camera. No one rushes, no one talks, no gestures to camera. Warm pendant light, realistic, ordinary office-casual clothing exactly as the references, no uniforms, no text, no logos, no screens with UI.

### Riktigt produktbevis
Morgonvyn i hemmet med tre riktiga kort under "Det här behöver dig idag", varje kort med agentnamn och Godkänn-knapp. Inget resultat visas (ingen "12 fakturor betalda") — bara att teamet **förberett** och att ägaren **säger ja**. Det är den bild som gör "tar över" sann.

### Klippning och ljud
Kylskåpsbrus och en klocka som tickar i beat 1. Tystnad när Matte kliver in. Repliken torr, ingen musik under. När teamet kommer in: en lågmäld, varm puls som växer till produktbeviset. Klipp bara mellan olika bildstorlekar (hel → halvnära → hel), aldrig samma bild två gånger. Tagning 1 → 3 hänger ihop via sista-bild-som-startbild, inte via klipp.

### Tre hook-varianter
- A: Klockan på mikron: 22.14.
- B: Text först: "Var är du klockan tio på kvällen?"
- C: Partnern i dörren: "Kommer du?"

**CTA** Ge teamet natten. handymate.se

**SANNINGSGRIND**
- "Tar över" får bara betyda **bordet och kvällen**, aldrig besluten: produktbeviset måste sluta i tre kort som *väntar på godkännande*, inte i utförda handlingar. Alternativ replik om vi vill vara helt säkra: **"Gå och lägg dig. Teamet tar natten."**
- Lisa läser telefonen — hon **svarar inte** i den. Ingen ringsignal, inget samtal.
- Inga läsbara belopp, kunder eller dokument i AI-bilderna; alla siffror kommer från demokontot i produktbeviset.
- Identitet: reference-pack `02` säger en agent per generering. Tagning 3 bryter det medvetet — helbilden bär identiteten på **kläder och siluett**, inte ansikten (ansikten ~120 px). Därför är inserts (shotlist 4) det som gör Karin och Lars igenkännbara. Kassera tagning 3 om någon agent får fel garderob eller om två ansikten blandas.
- Ingen VO-röst är riktig svensk röstskådespelare ännu — Benji är syntetisk (ElevenLabs). Samma regel som Knappen.

### Budget (uppmätta priser 2026-08-28)
| Steg | Modell | 720p (iteration) | 1080p (final) |
|---|---|---|---|
| Kök-still | generate_image | ~2 | ~2 |
| Hantverkarbild | generate_image | ~2 | ~2 |
| Tagning 1 (9 s) | seedance_2_5 | 39 | 81 |
| Tagning 2 (8 s) | seedance_2_0 + Element | 32 | 72 |
| Sync Lipsync | sync_so | 30 | 30 |
| Tagning 3 (12 s) | seedance_2_5 | ~60 | ~110 |
| Inserts 2 × 5 s | seedance_2_0 + Element | 2 × 20 | 2 × 45 |
| Topaz 4K (3 tagningar) | upscale_video | – | ~30 |
| **Summa** | | **~205** | **~420** |

Saldo 2026-08-29: 297. Rekommendation: iterera hela filmen i 720p (~205) tills gag och timing sitter, fyll på, slutrendera i 1080p bara de tagningar som är låsta.
