# Actionplan: Genomgången före betalningen (2026-09-02, Andreas: "Kör!")

Beslut: betalningen ligger EFTER importen och en genomgång av kundens egen
firma, så kunden betalar för något den redan sett i sina egna siffror.
INGEN prova-på: ingen dashboard, inga agenter, inga kort före betalningen.
Genomgången är räknefrågor (GET /api/onboarding/company-scan), ingen AI.

Repo: handymate-dashboard/ (Next.js 14 App Router, svensk UI, teal #0F766E,
riktiga å/ä/ö i källkod — aldrig \u-escapes).

## Ny stegordning (UI-index = business_config.onboarding_step via saveProgress)

| Ny | Komponent | Förut |
|---|---|---|
| 0 | Step1MeetTheTeam | 0 |
| 1 | Step2Business (kontot skapas) | 1 |
| 2 | Step3HowYouWork | 2 |
| 3 | Step4PhoneNumber | 3 |
| 4 | StepImportData | 5 |
| 5 | **StepGenomgang (NY)** | – |
| 6 | Step5Activate (Stripe) | 4 |
| 7 | StepProductRegister | 6 |
| 8 | Step6LiveTour / FirstQuoteLaunch | 7 |

`TOTAL_STEPS = 9`. Finalize skriver fortfarande onboarding_step 10.

## Ändringar, fil för fil

### 1. app/onboarding/page.tsx
- `const TOTAL_STEPS = 9`; uppdatera header-kommentaren med tabellen ovan.
- Renderingsordningen enligt tabellen. `step === 8` för Step6LiveTour/
  FirstQuoteLaunch (båda förekomsterna av `step === 7 &&` blir `step === 8 &&`).
  Knappen "Till artikelsteget" `setStep(6)` → `setStep(7)`.
- Stripe-retur: `payment === 'success'` → `uiStep = 7` och PUT `{ step: 7 }`
  (kommentaren: "Gå vidare till artikelsteget (7)"); `payment === 'cancelled'`
  → `uiStep = 6`.
- MatteSetupGuide-villkoret `step > 0 && step < 7` (två ställen, rad ~394–395)
  → `step > 0 && step < 8`.
- Resume: när GET /api/onboarding svarar, sätt `restored.paid =
  Boolean(d.stripe_subscription_id) || d.subscription_status === 'active'`
  (fälten läggs till i rutten, punkt 7). Ingen annan mappning av gamla
  stegnummer — kommentera att konton sparade före 2026-09-02 med
  onboarding_step 5–7 landar ett steg "för tidigt" i nya ordningen och att
  `paid`-guarden i Step5Activate gör att redan betalande aldrig ser
  betalsteget igen.
- Importera `StepGenomgang` från './components/StepGenomgang'; rendera
  `{step === 5 && <StepGenomgang onNext={next} onBack={back} data={data} setData={setDataUpdater} />}`.
- Testerna kräver att VARJE stegkomponent förekommer exakt EN gång som
  `<Komponent` i filen (tests/onboarding-setup-studio.spec.ts).

### 2. lib/onboarding/company-scan-rows.ts (NY, ren modul)
- Flytta `buildScanRows` + `ScanRow`-typen hit från components/tour/CompanyScan.tsx
  (oförändrad logik). Exportera även `ScanRow`.
- CompanyScan.tsx importerar den härifrån OCH behåller
  `export { buildScanRows } from '@/lib/onboarding/company-scan-rows'` så
  tests/company-scan.spec.ts (importerar från komponenten) fortsätter fungera.
- Ny ren funktion `teamGorNarDuAktiverar(row: ScanRow): string | null` —
  en kort svensk mening per nyckel om vad teamet gör efter aktivering:
  kunder → 'Lisa svarar när de ringer och Hanna håller kontakten',
  fakturor → 'Karin bevakar dem och påminner när det behövs',
  projekt → 'Lars följer varje projekt och flaggar när något glider',
  offerter → 'Daniel följer upp dem så de inte tappas',
  karin → 'Karin förbereder påminnelser du godkänner med ett tryck',
  daniel → 'Daniel skriver uppföljningarna, du godkänner',
  lars → 'Lars bevakar tid och marginal per projekt',
  ko → 'Allt samlas i en kö där du godkänner eller avvisar',
  annars null. Aldrig ett löfte om belopp eller resultat.

### 3. app/onboarding/components/StepGenomgang.tsx (NY)
- Props: `{ onNext, onBack, data, setData }` (samma som StepImportData).
- Mount: `fetch('/api/onboarding/company-scan')` med 5 s timeout
  (AbortController). ok → `buildScanRows(json)`; annars tom lista.
  Spara resultatet i formdata: `setData(d => ({ ...d, genomgang: rows }))`.
- Header: `<OnboardingHeader step={OB_DOTS.genomgang} total={OB_DOT_TOTAL} onBack={onBack} />`.
- Rubrik: "Här är vad teamet hittade i din firma". Under varje rad (med
  AgentAvatar när `agent` finns, samma som CompanyScan) en dämpad rad med
  `teamGorNarDuAktiverar(row)`.
- Tom lista (ny firma, misslyckad läsning, 403): rubrik "Inget att gå igenom
  än" + text "Teamet börjar med din första offert så fort du aktiverat.
  Har du kunder eller fakturor i ett annat system kan du importera dem
  senare under Kunder." Aldrig påhittade rader.
- Laddning: "Matte går igenom firman …" (max 5 s, sedan tom-läget).
- Knapp `ob-cta`: "Vidare till aktivering" → onNext. Ingen skip-länk.
- Använd samma klasser som övriga steg (ob-screen, ob-headline, ob-cta,
  ob-footer) — titta på StepImportData.tsx för mönstret.

### 4. app/onboarding/components/Step5Activate.tsx
- Överst i innehållet (efter OnboardingHeader, före grundarbannern): om
  `data.genomgang?.length` → en ruta "Det här hittade teamet i din firma"
  med raderna (bara text, max 5 rader, "+N till" om fler). Om tom/saknas →
  en enda rad: "Teamet börjar med din första offert så fort du aktiverat."
- `paid`-guard: `useEffect(() => { if (data.paid) onNext() }, [data.paid, onNext])`
  och rendera i så fall bara "Betalningen är klar — vi går vidare …".
  Redan betalande konton får ALDRIG betalsteget igen.
- Rör INTE: `fetch('/api/billing/onboarding-checkout'`, `isDemoBusinessId`,
  grundarbannern (exakt en förekomst av dess titel), garantitexterna,
  `getPlanCommercialFacts`, `YEARLY_MONTHS_FREE`, `'Månadsvis'`, `'Årsvis'`,
  `useState<'monthly' | 'yearly'>('yearly')`, `'interval: billingInterval'`.
  Inga hårdkodade priser. `OB_DOTS.activate` som förut.

### 5. app/onboarding/types-redesign.ts
- `genomgang?: Array<{ key: string; text: string; agent?: 'karin' | 'daniel' | 'lars' }>`
- `paid?: boolean`
- (Importera ScanRow-typen om det blir renare.)

### 6. app/onboarding/constants.ts
- `OB_DOT_TOTAL = 7`; `OB_DOTS = { business: 0, howYouWork: 1, phone: 2,
  importData: 3, genomgang: 4, activate: 5, productRegister: 6 }`.
  Uppdatera kommentaren ("SJU prickar").

### 7. app/api/onboarding/route.ts (GET)
- Lägg `stripe_subscription_id, subscription_status` i select-listan
  (rad ~40) och returnera dem i svaret. Inget annat ändras. PUT accepterar
  redan step 1–10.

### 8. components/onboarding/MatteSetupGuide.tsx
- `SETUP_GUIDANCE` får nio poster i nya ordningen: 0 välkommen, 1 grunden,
  2 arbetssättet, 3 Lisa (oförändrade texter), 4 = dagens 5-text (import),
  5 NY: `{ eyebrow: 'Teamet går igenom firman', title: 'Vi visar vad vi ser innan du betalar.', body: 'Bara riktiga tal ur din egen data. Hittar vi inget säger vi det.' }`,
  6 = dagens 4-text (aktiveras), 7 = dagens 6-text (Daniel), 8 = dagens 7-text (redo).

### 9. lib/onboarding/funnel.ts
- `FUNNEL_FINAL_STEP = 9`.
- `STEG_ETIKETTER`: 1 'Företaget', 2 'Så jobbar du', 3 'Telefon',
  4 'Importera data', 5 'Genomgången', 6 'Aktivera (betalning)',
  7 'Artikelregister', 8 'Rundtur', 9 'Klar'.
- Kommentar vid harledMaxSteg: legacy onboarding_step sparade före
  2026-09-02 följde den gamla ordningen (4 = betalning); tratten tolkar dem
  i nya ordningen utan omräkning — medveten oskärpa för gamla konton.

### 10. lib/onboarding/first-quote-handoff.ts
- PUT `{ step: 7 …}` → `{ step: 8 …}` (rundturen är nu steg 8).

### 11. app/dashboard/layout.tsx
- Grinden `business.onboarding_step >= 8` → `>= 9`. Kommentar: saveProgress
  når som högst 8 (rundturen) sedan 2026-09-02; finalize skriver 10.
  (Verifierat i prod: alla konton med onboarding_step ≥ 8 har
  onboarding_completed_at, så ingen låses ute.)

### 12. CLAUDE.md, avsnittet "Onboarding"
- Skriv om till nio steg enligt tabellen; grinden `>= 9`; "saveProgress når
  som högst 8 (rundturen)".

### 13. Tester
Uppdatera:
- tests/onboarding-setup-studio.spec.ts: `'const TOTAL_STEPS = 9'`; lägg
  `'StepGenomgang'` i komponentlistan (varje exakt en gång).
- tests/onboarding-wow.spec.ts:112 → `'const TOTAL_STEPS = 9'`.
- tests/job-type-start.spec.ts:77 → `step: 8`; :108 → `'TOTAL_STEPS = 9'`.
- tests/onboarding-product-register.spec.ts (93–107): TOTAL_STEPS 9;
  StepProductRegister monteras mellan Step5Activate (step === 6) och
  Step6LiveTour (`step === 8 && !launchRequested && <Step6LiveTour`); lägg
  `'app/onboarding/components/StepGenomgang.tsx'` i fil-listan för
  OB_DOTS-testet (114–116).
- tests/onboarding-funnel.spec.ts: fixturerna använder steg 1–7 +
  finalized; med FUNNEL_FINAL_STEP 9 blir rad a:s reached 1–8 (lägg '8'),
  b fastnar på 6 (Aktivera) i stället för 4 → uppdatera `fastnade_pa` till
  `{ steg: 6, etikett: 'Aktivera (betalning)', antal: N }` efter vad
  fixturen ger; `s[8]`-assertionen blir `s[9]`; steg-utanför-intervallet-
  testet: 0 och 9 stämplas inte (8 stämplas). Läs testet och räkna om
  exakt — gissa inte.
- tests/company-scan.spec.ts: ska vara oförändrat grönt (re-exporten).
Nytt facit tests/genomgang-fore-betalning.spec.ts (browserlöst, källskanning +
rena funktioner):
- page.tsx: ordningen (indexOf-kedja) Import(4) < Genomgang(5) < Activate(6)
  < ProductRegister(7) < LiveTour(8); `payment === 'success'` → uiStep 7;
  `'cancelled'` → 6; TOTAL_STEPS 9.
- StepGenomgang: anropar `/api/onboarding/company-scan`, använder
  `buildScanRows`, innehåller 'Inget att gå igenom än', har ingen skip-länk
  (`onSkip` saknas), ingen `\.from('` (inga DB-anrop i klienten).
- teamGorNarDuAktiverar: alla nycklar ger en mening, okänd nyckel → null,
  ingen mening innehåller 'kr' eller 'garanti'.
- Step5Activate: innehåller `data.paid` + `onNext()` i en useEffect, och
  'Det här hittade teamet i din firma'; Stripe-anropet kvar.
- Dashboard-grinden: `onboarding_step >= 9`.
- funnel: STEG_ETIKETTER[6] === 'Aktivera (betalning)', FUNNEL_FINAL_STEP 9.
- CLAUDE.md nämner 'TOTAL_STEPS = 9'.
Lägg det nya facit-namnet sist i BÅDE `test:contracts` i package.json och
listan i ../.github/workflows/contracts.yml.

## Verifiering (allt måste vara grönt innan du rapporterar)
```
npx tsc --noEmit
npx playwright test tests/genomgang-fore-betalning.spec.ts tests/onboarding-setup-studio.spec.ts tests/onboarding-wow.spec.ts tests/job-type-start.spec.ts tests/onboarding-product-register.spec.ts tests/onboarding-funnel.spec.ts tests/company-scan.spec.ts tests/demo-onboarding-replay.spec.ts tests/yearly-plan.spec.ts tests/founders-offer.spec.ts tests/pricing-truth.spec.ts tests/anvandartaket.spec.ts tests/first-focus.spec.ts tests/aktivera-senare.spec.ts --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Inga commits — rapportera tillbaka: ändrade filer, testutfall (siffror),
och allt du var osäker på.
