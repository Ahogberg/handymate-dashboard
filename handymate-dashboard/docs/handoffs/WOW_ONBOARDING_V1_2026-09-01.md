# Wow-onboarding V1 — Matte-guidning, sann prisstart och första uppdraget

Datum: 2026-09-01
Status: implementerad och browserlöst verifierad; färsk-konto-provet återstår.

## Resultat

Den befintliga åttastegs-onboardingen är fortfarande den enda skriv- och
valideringsvägen. Ett deterministiskt Matte-lager berättar vad som händer och
visar ett löpande inställningskvitto utan LLM-anrop eller egna mutationer.

Prissteget frågar nu hur företaget faktiskt arbetar:

1. jobbtypens uttryckligt kopplade arbetsartikel,
2. företagets uttryckliga standardpris,
3. annars prislös rad som måste granskas.

Det tidigare förifyllda prisintervallet och offertkedjans dolda 650-kronors-
fallback är borttagna i de berörda vägarna. Intern timkostnad är fortsatt en
separat uppgift och blandas inte med kundens arbetspris.

Finalen erbjuder högst två startalternativ utifrån riktiga signaler. Ett tomt
konto får första offert eller verifiering av kundinflöde; en portföljplan visas
först när verkliga obetalda fakturor eller öppna affärer finns. Starten använder
befintliga `FirstQuoteLaunch` respektive `first-mission-handoff`. Den senare
öppnar Matte med en förifylld fråga och auto-skickar ingenting.

## Viktiga filer

- `components/onboarding/MatteSetupGuide.tsx`
- `app/onboarding/components/FirstAssignmentFinal.tsx`
- `lib/onboarding/pricing-start.ts`
- `lib/onboarding/first-assignment-options.ts`
- `app/onboarding/components/Step3HowYouWork.tsx`
- `app/onboarding/components/Step6LiveTour.tsx`
- `app/onboarding/page.tsx`
- `lib/product-defaults.ts`
- `lib/quotes/resolve-template-item-prices.ts`
- `lib/quotes/generated-price-truth.ts`
- `lib/ai-quote-generator.ts`

## Verifiering

- onboarding-/handoff-/produktregisterfacit: 112/112 gröna
- offertens pris- och jobbtypsfacit: 130/130 gröna
- kolumnvakt + portalens `project_log`-kryssprov: 34/34 gröna
- `npx tsc --noEmit`: exit 0
- `npm run build`: exit 0

Kolumnvakten behövde synkas med en redan produktionsverifierad legacy-kolumn
(`project_log.work_performed`) och den konsoliderade offertvyns lägre antal
separata query-kedjor. Produktkoden i portalrouten ändrades inte.

## Kvar före release

Kör ett enda helt färskt betalkonto i riktig mobilbredd:

1. genomför alla åtta steg och kontrollera Matte-panelens radbrytning,
2. välj prissättningsmodell och verifiera sparat standardpris eller `null`,
3. skapa startartiklar och kontrollera att inget pris gissas,
4. välj första offert och kontrollera att riktiga offertbyggaren öppnas med
   jobbtyp/mall/artiklar,
5. kör alternativet kundinflöde/portföljplan och kontrollera att Matte öppnas
   med prompten exakt en gång utan auto-skick.

Ingen migration krävs.
