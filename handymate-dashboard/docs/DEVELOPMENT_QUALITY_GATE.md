# Handymate Development Quality Gate v1

**Status:** obligatorisk arbetsordning för alla icke-triviala produktändringar.  
**Gäller:** Claude, Codex och människor.  
**Princip:** *Feature complete* räcker inte. **Outcome proven** krävs.

Det här dokumentet kompletterar `AGENTS.md` och `handymate-dashboard/CLAUDE.md`. Vid konflikt gäller den striktare verifieringsregeln.

## 1. Varför gaten finns

Handymate är ett system of action. Ett flöde kan ha korrekt UI och gröna tester men ändå brytas mellan två verkliga steg. Därför bedöms varje ändring på kundutfallet den ska åstadkomma.

**Ingen byggare får vara enda granskare av sitt eget arbete.** Claude och Codex ska i normalfallet korsgranska varandra före merge.

## 2. Roller

### Builder
Implementerar minsta ändring som stänger hela specificerade loopen. Builder fyller PR:ens Proof contract och skapar facit som kan bli rött.

### Independent reviewer
Är en annan agent/person än builder. Reviewer får spec, aktuell diff, tester och repo. Uppdraget är att **falsifiera kundutfallet**.

Om Codex bygger: Claude granskar. Om Claude bygger: Codex granskar. Om bara en agent är tillgänglig förblir PR:n draft/ej ship-ready tills oberoende review kan göras, utom trivial dokumentation.

### CI
CI är deterministisk domare för maskinella grindar. AI-review kan aldrig göra röd CI grön eller ersätta obligatoriskt liveprov.

## 3. Före bygge

Följ `AGENTS.md -> Starta rätt`: hämta main, läs öppna PR:er, sök befintlig kapacitet, pröva premissen mot kod/databas och definiera ett kundutfall.

Skriv innan implementation:
- **Customer outcome:** När X händer ska Handymate göra Y utan Z.
- **Entry point:** verklig trigger.
- **Expected side effects:** state/DB/externt utfall/kvittens.
- **No-go outcomes:** sådant som aldrig får ske.
- **Proof:** automatiskt facit, mutation, liveprov om relevant.
- **Observability:** var utfallet observeras efter deploy.

Ingen stor plattform byggs om ett smalt tillägg kan stänga kundloopen.

## 4. Builder gate

Builder får inte lämna över förrän:
1. relevant test bevisar hela kedjan så långt det går lokalt;
2. varje nytt/ändrat test mutationstestats;
3. tenant/auth/dedupe/retry testats när relevant;
4. SQL verifierats enligt `databasen-ar-facit`;
5. UI setts i 375 px när relevant;
6. `npx tsc --noEmit`, `npm run test:contracts`, `npx next build` är gröna;
7. PR-mallen beskriver exakt vad som **inte** är bevisat.

Builder skriver sedan:
`QUALITY GATE: READY FOR INDEPENDENT REVIEW — <head SHA>`

## 5. Independent review gate

Reviewern börjar från aktuell head-SHA och kontrollerar själv koden.

### A. Spec correctness
Löser ändringen kundutfallet? Har scope glidit? Återanvänds rätt canonical path?

### B. Code correctness
Försök bryta auth/tenant isolation, idempotens, samtidighet, retry/partial failure, null/legacy-data och servergrindar. Leta efter sidodörrar runt canonical paths.

### C. Journey correctness
Följ kedjan **en nod före ändringen -> ändringen -> en nod efter**. Ett lokalt fungerande steg räcker inte.

### D. Reality proof
Kan testet faktiskt bli rött? Bevisar det beteende, inte bara strängar? Krävs provider, webbläsare, två tenants eller telefon? Om liveprov saknas ska PR:n vara ej ship-ready eller säkert feature-flaggad.

### E. Regression search
Sök parallella write paths, direkta SDK-anrop, legacy-rutter och relevanta tester utanför kontraktsgrinden.

## 6. Review-resultat

### Blockerad
`QUALITY GATE: BLOCKED — <head SHA>`

Varje blocker ska ha fil:rad, verkligt fel/risk, reproduktion eller saknat facit och minsta acceptanskriterium. Builder rättar på samma branch och begär ny review. **Tidigare PASS gäller inte efter ny commit.**

### Godkänd
`QUALITY GATE: PASS — <head SHA>`

PASS betyder inga kända blockers, att proof contract stämmer mot repo, relevanta CI-grindar är gröna och obligatoriskt live proof är gjort eller ändringen uttryckligen är avstängd/ej ship-ready tills det görs.

## 7. Live proof matrix

| Yta | Minsta verkliga bevis före aktivering |
|---|---|
| SMS | riktigt providerutskick/inbound + provider-/DB-kvittens |
| E-post | riktigt utskick/inbound; delivery/bounce när funktionen beror på det |
| Telefoni | riktigt samtal genom avsedd nummer-/webhookväg |
| Betalning | provider sandbox/test eller godkänd säker testväg + observerad state transition |
| Kalender/bokning | verklig/provider-testad create/update + återläsning |
| Fortnox/extern ekonomi | riktig test-/licensierad integration; annars feature flag av |
| SQL/concurrency | riktig PostgreSQL/Supabase när PGlite inte bevisar samtidighet/RLS |
| Auth/tenant | minst två identiteter/tenants för nya gränser |
| UI | renderad 375 px och faktisk interaktion för kritisk CTA |

## 8. Merge-regel

En produktändring är **OUTCOME PROVEN** först när builder proof contract är komplett, oberoende reviewer har PASS på **aktuell head-SHA**, obligatoriska checks är gröna och live proof är uppfyllt där det krävs.

Om live proof inte kan göras nu får merge bara ske om ändringen är inert/feature-flaggad och PR:n tydligt anger vad som krävs före aktivering. Annars: merge inte.

## 9. Vad gaten inte ska bli

Bygg inte en ny generell workflowmotor för processen. GitHub PR, befintlig CI, befintliga tester och reviewkommentarer är sanningskällor. Lägg automatisering först när ett verkligt manuellt misslyckande motiverar den.

Målet är färre återbesök till trasig funktion — inte fler processdokument.
