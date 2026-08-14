# Veckomötet — Digital CFO+COO-mötet (ersätter Måndagsmötets takeover)

Källa: Claude Design-projekt "Digital CFO + COO-mötet" (b33a9e8b-...), fil
`Veckomötet - Digital CFO+COO.dc.html`, hämtad via DesignSync-MCP och läst i sin
helhet. Andreas beslut (AskUserQuestion): (1) ersätt Måndagsmötet direkt, samma
triggerpunkt; (2) besluts-korten byggs på RIKTIG NBA-rankning från start, inte
mockupens exempeldata.

## Vad som INTE ändras (blast radius minimeras)
- `lib/jarvis/monday-brief.ts` — orört, äger fortfarande n>0-regeln för de fyra sektionerna.
- `components/jarvis/MandagskortCard.tsx` — orört, används fortfarande oförändrat av `app/dashboard/approvals/page.tsx`s vanliga listvy.
- Godkänn-vägen — fortfarande `queueAction`/`executeSend` → `POST /api/approvals/:id`, ingen ny endpoint.
- "RAM 2: Sida"-varianten i mockupen byggs INTE — bara popup-modalen (det befintliga takeover-mönstret). Sidvarianten var Claude Designs egen dubbel-preview, ingen egen beställd yta.
- "Beslut från veckomötet"-kön-kategorin (Andreas idé, tidigare i konversationen) är INTE del av detta pass — mockupens dismiss-beteende (pill + återöppna) matchar redan befintlig banner-mekanik.

## Filer

- [ ] `lib/jarvis/mandagsmote.ts` — nya rena funktioner:
  - `byggVeckomoteRepliker(payload)` → `{agentId, text}[]`, ordning resultat→lärdomar→risker→förtroende (samma ordning som `mandagsmoteSectionOrder`), en replik per sektion UTOM förtroende (en per rad, egen agent per rad).
  - `beslutText(n)` — "ett beslut" / "N beslut" (svensk pluralisering, samma stil som `mandagskortBeskrivning`).
- [ ] `tests/mandagsmote-takeover.spec.ts` — facit för de nya funktionerna ovan + uppdatera de assertions som pekade på GAMMAL rendering (`<MandagskortCard>` i takeovern, hårdkodad `{approveLabel}`-check) så de matchar den nya komponenten. Allt annat (seenKey, onboardingGates, shouldAutoOpen, banner, kedjning, MandagskortCard-oförändrad-testet) ska fortsätta gå grönt OFÖRÄNDRAT.
- [ ] `app/api/next-best-action/route.ts` — additiv utökning: bygg listan av alla pending+behöriga kandidater (inte bara stoppa vid första träffen), returnera BÅDE `recommendation` (oförändrat, bakåtkompatibelt) OCH ny `recommendations: NextBestActionRecommendation[]` (topp 3, samma filtrering).
- [ ] `components/jarvis/MandagsmoteTakeover.tsx` — om till dialogformen:
  - Behåll skalet (overlay, header-struktur, prefers-reduced-motion, B7-säkerhetsnät, stegvis avslöjning) — generalisera avslöjningen till att gälla den NYA replik-listan (variabel längd) i stället för `order.length`/`MandagskortCard`.
  - Eyebrow-text "Måndagsmötet" → "Veckomötet". Stäng-knappens tryckyta 36px → 44px (mockupens tillgänglighetsförbättring).
  - Ny statisk Mattes öppningsrad ("God morgon {greetingName}. …") som replik #1 i avslöjningen.
  - Repliker (`byggVeckomoteRepliker`) som chattbubblor — samma bubbelgrammatik som `components/agents/AgentMessage.tsx` (avatar + agentnamn ovanför, rundad bubbla, asymmetriskt hörn).
  - Om `decisionCandidates.length > 0`: Mattes övergångsrad (dynamisk, `beslutText`) → beslutskort (titel=`approval.title`, kontext=`rationale`, Ja/Nej-knappar eller resultat+Ångra beroende på LOKALT `decided`-state) → vid alla beslutade: Mattes avslutande kvitto-bubbla (✓/– per beslut).
  - Footer-knappen: `approveLabel`-basen + " — {beslutText(kvar)} kvar" när något beslutskort återstår obeslutat, annars oförändrad.
  - "Ångra" på ett beslutat kort försvinner efter `UNDO_WINDOW_MS` (5s, samma konstant som JarvisHome, EXPORTERAS därifrån) — ärligt mot att godkännande är oåterkalleligt efter fönstret, INTE mockupens "Ångra alltid synlig".
- [ ] `components/jarvis/JarvisHome.tsx`:
  - `export const UNDO_WINDOW_MS = 5000` (bara lägga till `export`).
  - Ny state `nbaList: NextBestActionRecommendation[]`, satt tillsammans med `nba` i befintlig fetch-effect (`data.recommendations || []`).
  - Bannertexten "Måndagsmötet väntar" → "Veckomötet väntar".
  - Nya props till `MandagsmoteTakeover`: `greetingName`, `decisionCandidates` (härlett: `nbaList` minus `hiddenIds`, topp 3), `onApproveDecision`/`onRejectDecision` (→ `queueAction(candidate.approval as unknown as Approval, 'approve'|'reject')`, samma cast-mönster som rad 938), `onUndoDecision` (→ befintlig `undo(id)`).

## Verifiering

- [ ] `npx tsc --noEmit` — noll fel.
- [ ] `npx playwright test tests/mandagsmote-takeover.spec.ts tests/mandagskort.spec.ts tests/next-best-action.spec.ts --no-deps --project=chromium` — alla gröna.
- [ ] `npx next build` — ren build.
- [ ] Riktig inloggning: öppna Veckomötet live, kontrollera att repliker matchar riktig monday-brief-data, att beslutskort (om NBA-rad finns) verkligen kan godkännas/avvisas via samma väg som andra kort (MCP SELECT-bevis på `pending_approvals.status`/`execution_result`), och att dismiss lämnar allt pending precis som idag.
- [ ] Städa eventuell testdata, sista SELECT bekräftar prod rent.

## Review

**Byggt och skeppat** (commit 838561be + d96ded4c, pushat, deployat):
alla filer i planen ovan, exakt som beskrivet. `npx tsc --noEmit` rent,
`npx next build` rent, full testsvit 5467 gröna/0 failed (upp från 5451 —
+16 nya/uppdaterade tester i tests/mandagsmote-takeover.spec.ts).

**Verifierat via Supabase MCP** (seedad testdata för biz_al7pjuu5smi,
sedan städad — sista SELECT bekräftar 0 kvar): `next_best_action`-radens
form matchar exakt vad `/api/next-best-action`s nya `recommendations`-fält
förväntar sig, och `pending_approvals`-payloaden för `monday_brief` matchar
exakt vad `byggVeckomoteRepliker` konsumerar. Detta bevisar datakontraktet,
INTE den faktiska renderingen/interaktionen i webbläsaren.

**INTE verifierat — en riktig, oberoende upptäckt under detta pass:**
`tests/auth.setup.ts`s magic link-inloggning (via
`supabase.auth.admin.generateLink`) studsar tillbaka till `/login` inom
någon sekund för testkontot (`andreashogberg93@gmail.com` /
`biz_al7pjuu5smi`) — reproducerat tre gånger, även mot en helt orörd,
existerande test (`tests/navigation.spec.ts`). Trolig orsak: admingenererade
länkar är inte kompatibla med appens PKCE-baserade `/auth/callback`
(`exchangeCodeForSession` väntar en `?code=`-parameter; adminlänkar levererar
troligen sessionen som url-fragment istället, vilket aldrig når servern).
`navigation.spec.ts` och liknande tester märker inte av detta eftersom de
bara kollar HTTP-status (200/302, inte 500) — en redirect till /login
räknas som "godkänt" där. Det här är alltså inte en flake i just den här
sessionen utan en trolig systemisk lucka: riktig inloggd browser-verifiering
har sannolikt inte fungerat på ett tag, dolt av att de flesta chromium-
testerna inte faktiskt kollar att man ÄR inloggad. Flaggat till Andreas,
inte fixat här (kräver ett beslut om test-inloggningsstrategin, utanför
detta uppdrag).

**Fixat i samma veva** (commit d96ded4c, litet och oberoende): `setup`-
projektets `storageState: undefined` gav ENOENT på en färsk checkout utan
`playwright/.auth/user.json` — samma fälla som `golden-path-setup` redan
dokumenterar i samma fil. Ett explicit tomt state löser det.
