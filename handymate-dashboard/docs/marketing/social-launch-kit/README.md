# Handymate Social Launch Kit

Första kampanjpaketet inför lansering. Allt utgår från produktens faktiska
position: ett digitalt team som arbetar mot hantverksföretagets mål och aldrig
påstår mer än underlaget bevisar.

## Kampanj 01

**Huvudbudskap:** Ge Handymate ett mål. Se teamet arbeta.

**Stöd:** Matte koordinerar. Specialisterna gör jobbet. Du behåller kontrollen.

**CTA:** Boka en demo på handymate.se.

Färdiga format:

- LinkedIn-karusell, sex PNG-bilder i 1080 × 1350.
- Instagram-inlägg i 1080 × 1350.
- Reel/TikTok-cover i 1080 × 1920 samt ett 22-sekunders manus.

Assets ligger i `public/marketing/social/launch-01/`. Källbilder med suffix
`-source` är genererade med ImageGen. Text, logotyp och produktpåståenden är
lagda deterministiskt i `render.html` så de aldrig kan bli felstavade eller
hallucinerade.

## Visuell riktning

- Lugn, professionell och premium — samma princip som produkten.
- Teal `#0F766E` är chrome; slate och vitt bär ytorna.
- Space Grotesk för rubriker, DM Sans för brödtext.
- Agentfärg bor endast i agentens avatar/prick.
- Riktiga arbetsmiljöer, aldrig robotar, hologram eller neon-AI.
- Inga genererade kundcitat, omdömen, belopp eller produktskärmar.
- När ett riktigt kundcase används ska belopp och utfall kunna verifieras.

## Publiceringsprincip

Varje inlägg ska göra minst en av tre saker:

1. Visa ett verkligt problem hantverkaren känner igen.
2. Visa hur Handymate agerar — inte bara vad AI “kan”.
3. Visa ett verifierbart resultat eller nästa steg.

80 procent värde/bevis, 20 procent produkt/CTA. Svara på kommentarer som en
grundare, inte som ett anonymt varumärke.

## Filer

- `campaign-01.md` — captions, karusellcopy, Reel-manus och alt-texter.
- `30-day-plan.md` — första månadens publiceringsplan.
- `imagegen-prompts.md` — exakt promptunderlag och regler för nya bilder.
- `render.html` — reproducerbar källa för de färdiga PNG-filerna.
- `scripts/render-social-launch.mjs` — renderar om bilderna efter copyändring.

Rendera från repoappen:

```powershell
node scripts/render-social-launch.mjs
```

