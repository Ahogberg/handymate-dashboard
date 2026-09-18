# Granskning: PR #41 "Säkra behörigheter och Stripe-betalningsflöden inför lansering"

Utfört 2026-09-18 i en separat `git worktree` (`/tmp/pr41`, borttagen efter
granskningen). Huvudträdet (`claude/gracious-brown-07lm99`) rördes aldrig —
`git status` visar rent träd både före och efter. Ingen kod ändrad, inget
pushat, inget mergat, inga kommentarer på GitHub.

Branch: `codex/launch-security-billing`, head `01dbf79a`, mot `origin/main`
(nu `fb350118`, merge-base `9f4ca065`). 157 filer, +2481/−1632, en commit.

---

## 1. Next.js-uppgraderingen — vad ändras faktiskt

`package.json`:

| Paket | Från | Till |
|---|---|---|
| `next` | 14.1.0 | **15.5.25** |
| `react` | 18.2.0 | **19.3.0** |
| `react-dom` | 18.2.0 | **19.3.0** |
| `@types/react` | 18.2.48 | 19.3.0 |
| `@types/react-dom` | 18.2.18 | 19.3.0 |
| `fabric` | ^6.9.1 | 7.4.0 |
| `lucide-react` | 0.312.0 | 0.468.0 |
| `postcss` | 8.4.33 | 8.5.28 |

Plus en ny `overrides`-sektion (postcss-pinning, `query-string` för
`@googlemaps/google-maps-services-js`).

`tsconfig.json`: lägger till `"target": "ES2017"` (saknades tidigare, alltså
inte bara Next15-krav) och omformaterar arrayer till flerrad (kosmetiskt brus
i diffen).

`next.config.js`: `experimental.serverComponentsExternalPackages` →
`serverExternalPackages` (Next 15 flyttade denna ur `experimental`), tar bort
`experimental.instrumentationHook: true` (onödig i Next 15 — instrumentation
körs som standard), lägger till `outputFileTracingRoot: __dirname`.

**API-anpassningar:** 121 av 157 ändrade filer (77 %) är rena mekaniska
codemod-ändringar av mönstret

```ts
// innan
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
// efter
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
```

— dynamiska route-handlers vars `params` blev `Promise` i Next 15. Stickprov
på sex av dessa filer (`app/api/grossist/[supplier]/product/[id]/route.ts`,
`app/api/admin/support-tickets/[id]/route.ts`,
`app/api/cron/agent-observations/[agent]/route.ts`,
`app/preparation/[token]/page.tsx` (klientkomponent: lägger till React 19:s
`use()`-hook för samma Promise-mönster på klientsidan),
`app/api/portal/[token]/agreements/route.ts`,
`app/api/pipeline/deals/[id]/route.ts`) visade **ingen annan logikändring**
utöver detta mönster (bara formatteringssemikolon från codemot-verktyget).

**Svar: ja, det här ÄR en ramverksuppgradering förklädd till säkerhetsfix.**
Endast ~36 av 157 filer (23 %) bär faktisk säkerhets-/behörighets-/Stripe-
logik. Resten är den mekaniska kostnaden av att gå från Next 14 till Next 15 —
ett arbete som normalt är en egen release, inte ett bihang till en
säkerhetsrättning. Att paketera dem ihop gör det omöjligt att cherry-picka
säkerhetsfixarna utan att också ta uppgraderingen, och tvärtom.

---

## 2. Kollisioner med nattens arbete

`git merge-tree` kördes både mot `origin/main` och mot
`origin/claude/gracious-brown-07lm99` (branchen bakom PR #91, som redan har
rivit stora delar av offertflödet). Resultatet är i praktiken identiskt mot
båda:

- **18 filer "changed in both"**, varav **7 med riktiga konfliktmarkörer**.
- PR41 rör **ingen fil** under `app/dashboard/quotes/**`, `lib/quotes/**`,
  `lib/invoices/**`, `components/quotes/**` eller `lib/seed-defaults.ts`.
  De namngivna rivna filerna (`QuoteTotalsSection.tsx`, `QuoteRotSection.tsx`,
  `QuoteNewAIHelper.tsx`, `QuoteCompletenessStrip.tsx`, `QuoteItemsSection.tsx`,
  `ItemRow.tsx`) finns fortfarande kvar på `origin/main` (ej rivna där ännu)
  och är borta på `claude/gracious-brown-07lm99` — men eftersom PR41 aldrig
  ändrar dem uppstår **inte** den specifika "en sida raderat, andra ändrat"-
  konflikten som brief:en förutspådde för just dessa filer. `.github/workflows/
  contracts.yml` rörs inte heller av PR41.

**De 7 verkliga konflikterna:**

1. `lib/approve-actions.ts` (rescheduleBooking, ~rad 543–590) — båda sidor har
   lagt till EGNA concurrency-guards (main: en variant, PR41: en annan
   `.eq()`-kedja + `updatedBooking`-kontroll). Kräver manuell sammanslagning
   av båda skydden, inte bara en textmerge.
2. `app/dashboard/settings/page.tsx` — Google-kalenderns sync-riktning har två
   olika implementationer (main: direkt Supabase-update från klienten; PR41:
   fetch mot `/api/google/preferences`).
3. `lib/account/radera.ts` — main har lagt till en hel lista nya
   `financial_*`/`value_*`-undantag i borttagningslistan (Financial Kernel,
   tillagd efter PR41:s bas) som PR41:s gamla kopia helt saknar.
4. `next.config.js` — main har byggkostnads-kommentarer + `eslint`/
   `typescript`-ignoreflaggor (tillagda 2026-09-14) som PR41:s bas saknar,
   plus samma `serverComponentsExternalPackages`→`serverExternalPackages`-byte.
5–6. `package.json`, `test:contracts`-raden (två hunk-konflikter, samma rad).
   **Detta är den farliga klassen** — exakt samma felmönster som redan är
   dokumenterat i `tasks/lessons.md` ("Merge 2026-09-06: kontraktslistan
   återbyggd ur CI-listan tappade svansen"). Main har lagt till dussintals nya
   spec-filer sedan PR41:s bas (`line-split-*`, hela `financial-kernel-*`-
   familjen, `value-ledger-*`, `partner-demo-*`, `revenue-*` m.fl. — se punkt 5
   nedan för exakt antal). En ren `git merge` här riskerar att tappa endera
   sidans tillägg om den görs mekaniskt.
7. `tasks/todo.md` — ofarlig dokumentationskonflikt.

**18 filer "changed in both" utan konfliktmarkör är mer oroande än
konflikterna.** Git:s radbaserade 3-way-merge markerar bara konflikt när BÅDA
sidor ändrat SAMMA rader. När båda sidor skrivit om samma funktion på olika
rader (t.ex. en av dem bygger om hela funktionskroppen) blir resultatet en
syntaktiskt giltig men **semantiskt fel** fil, helt utan varningstriangel.
Konkret bevisat exempel: `app/api/quotes/[id]/handoff/route.ts` — main har
sedan PR41:s bas byggt om till en `roundCardsPromise` som hämtar FLERA
uppföljningskort per omgång (importerar `latestQuoteFollowupReceipt`), medan
PR41 bara har den gamla enkel-`roundCard`-varianten fast igenom Next15-
codemoden. En textmerge markerar inte detta som konflikt (ändringarna ligger
på olika rader) men resultatet blir sannolikt en tyst regression tillbaka till
enkel-omgångs-logiken. Övriga filer i samma riskklass, INTE verifierade en och
en (tidsbrist, bör göras innan merge-beslut):
`app/api/customers/[id]/timeline/route.ts`,
`app/api/invoices/[id]/status/route.ts`,
`app/api/invoices/[id]/mark-paid/route.ts`,
`app/api/projects/[id]/create-final-invoice/route.ts`,
`app/api/projects/[id]/invoice-preview/route.ts`,
`app/api/products/[id]/components/route.ts`,
`app/api/sales-case/[token]/route.ts`,
`app/api/suggestions/approve/route.ts`,
`app/api/approvals/[id]/route.ts`,
`app/api/quotes/public/[token]/route.ts`,
`tests/job-type-start-ui.spec.ts`.

---

## 3. SQL och databasändringar

Två nya filer: `sql/v2_launch_security_billing.sql` och
`sql/v2_launch_function_search_paths.sql` (samt matchande filer under
`supabase/migrations/`).

**Verifierat läsande via Supabase-MCP (projekt `pktaqedooyzgvzwipslu`), inga
skrivningar körda:**

- `launch_security_billing` (migrationsversion `20260912145925`): **KÖRD.**
  Bekräftat i produktion: funktionen `private.can_manage_business` finns i
  schema `private`; policyerna `launch_storage_read/insert/update/
  delete_boundary` finns på `storage.objects`; kolumnprivilegierna på
  `business_config` matchar filens `revoke`/`grant`-satser (authenticated har
  bara SELECT på `stripe_customer_id`/`stripe_subscription_id`/`user_id`,
  ingen bred write); tabellen `billing_checkout_attempt` finns i `public`.
- `launch_function_search_paths` (migrationsversion `20260912150651`):
  **KÖRD.** Listad i `list_migrations`, körd samma dag.

**Slutsats: båda migrationerna är redan skarpa i produktion sedan
2026-09-12** — 6 dagar innan denna granskning. Det här är alltså inte
väntande SQL som "kommer med PR:en", utan ett redan verkställt
databastillstånd. Konsekvens: om PR41 stängs eller görs om (rekommendation
nedan), kvarstår databasen ändå i det säkrare tillståndet — SQL-delen behöver
bara DOKUMENTERAS i en ny PR, inte köras om.

---

## 4. Behörighets- och Stripe-ändringarna — bär de vad de lovar?

Ja, i den substans som faktiskt finns (de ~36 icke-mekaniska filerna) är det
här riktigt arbete, inte bara omskrivning. Granskat i detalj: `lib/admin-
auth.ts`, `lib/approve-actions.ts` (rescheduleBooking), `lib/billing/
checkout-session.ts` (ny), `lib/billing/leads-subscription.ts` (ny), `lib/
billing/write-billing-update.ts`, `app/api/billing/webhook/route.ts`. Övriga
~30 filer i denna klass är endast stickprovade, inte fullständigt genomlästa
(tidsbrist).

**Tre konkreta förbättringar (fil:rad):**

1. **`lib/admin-auth.ts:22–26`** — byter `supabase.auth.getSession()` mot
   `supabase.auth.getUser()`. `getSession()` litar på en klientskickad cookie
   utan att verifiera JWT:t mot Supabase Auth-servern; `getUser()` gör den
   verifieringen. Detta är en verklig admin-autentiseringsfix — en
   förfalskad/gammal sessioncookie kunde tidigare ge admin-åtkomst.
2. **`lib/approve-actions.ts`, `rescheduleBooking` (~rad 543–590)** — lägger
   till `.eq('business_id', businessId)` på både SELECT och UPDATE av
   `booking` (tenant-läcka: en annan firmas bokning kunde tidigare bokas om av
   fel företag om suggestion-payloaden pekade fel), PLUS en optimistisk
   låsning (`.eq('scheduled_start', ...).eq('scheduled_end', ...)` + kastar
   fel om ingen rad träffades) som stänger en race condition vid samtidig
   ombokning av samma bokning.
3. **`lib/billing/checkout-session.ts`** (ny fil) — `createSubscriptionCheckout`
   använder Stripe-idempotensnycklar (`idempotencyKey: 'handymate-checkout-
   ${attempt.id}'`), en ny tabell `billing_checkout_attempt` som serialiserar
   samtidiga köpförsök per företag (primärnyckel på `business_id`), upptäcker
   redan-öppna sessioner och blockerar dubbla klick från att skapa två
   Stripe-prenumerationer. Kompletteras av `lib/billing/write-billing-
   update.ts`, som nu läser `stripe_subscription_id` FÖRE en kritisk
   statusskrivning och kastar om den ändrats under tiden (skydd mot att en
   försenad webhook skriver över en nyare plan) — en verklig "lost update"-
   fix i betalningsflödet.

**Tre saker som är tveksamma eller oklara:**

1. **Webhook-signaturvalideringen är INTE trasig av Next 15** (verifierat:
   `app/api/billing/webhook/route.ts:56` gör fortfarande `await
   request.text()` för raw body innan `stripe.webhooks.constructEvent(...)` —
   CLAUDE.md-regeln om raw body hålls). Men filen ändras ändå kraftigt
   (multipla nya import och omskriven `handleCheckoutCompleted`/
   `handleSubscriptionUpdated`), och en fullständig rad-för-rad-genomgång av
   ALLA nya grenar (t.ex. `checkout.session.async_payment_succeeded`-caset)
   är inte gjord i denna granskning.
2. **De 18 "changed in both"-filerna (se punkt 2) kan bära förlegade
   versioner av samma säkerhetslogik.** En fix som är korrekt ISOLERAT (mot
   PR41:s egen bas) kan vara farlig att merga rakt in eftersom main redan
   byggt om samma funktion. Detta gäller potentiellt `app/api/quotes/[id]/
   handoff/route.ts` och systerfilerna listade i punkt 2 — inte bevisat för
   alla, men mönstret är bekräftat för minst en.
3. **Test:launch-security körs aldrig i CI.** PR41 lägger till ett nytt
   `npm`-skript `test:launch-security` (kör `launch-security-sql.cjs`,
   `launch-reschedule.cjs`, `launch-billing.cjs` — de tre nya facit-filerna
   för just denna PR:s Stripe-/behörighetslogik) och kedjar in det i
   `test:contracts`. Men `.github/workflows/contracts.yml` rörs INTE av PR41
   och har sin egen, separata lista av `run:`-steg (se `tasks/lessons.md`
   2026-09-18: CI kör fem sviter till som inte ligger i `test:contracts`).
   Om PR41 mergas as-is grindas de tre nya testerna aldrig av CI — bara av
   den lokala körningen av `npm run test:contracts`, som ingen agent
   garanterat kör vid varje framtida ändring av dessa filer.

---

## 5. Går den att köra i dag?

Utfört i worktree, `npm ci` (INTE `npm install` — lockfilen var redan
konsistent så ingen risk för en oavsiktlig lockfil-omskrivning):

- **`npm ci`: grönt**, 721 paket installerade, 0 sårbarheter, `package-lock.json`
  oförändrad efter körningen.
- **`./node_modules/.bin/tsc --noEmit`: 0 fel** (exit code 0). Hela PR41
  kompilerar rent under Next 15 / React 19 / de nya `@types`-paketen.
- **`HANDYMATE_CHROMIUM_PATH=/opt/pw-browsers/chromium
  HANDYMATE_TEST_CHROMIUM=/opt/pw-browsers/chromium npm run test:contracts`:
  grönt — men mot FEL, FÖRLEGAT FACIT.** Slutrad: `1942 passed (40.3s)` för
  Playwright-delen, plus `17/17 ok` för `node --test
  tests/customer-preparation/contract.test.mjs`, plus samtliga tester i det
  nya `npm run test:launch-security` (`launch-security-sql.cjs`,
  `launch-reschedule.cjs`, `launch-billing.cjs`) gav `PASS`. **Detta matchar
  EXAKT PR-beskrivningens påstående "1 942 godkända kontraktstester".**
  Men PR41:s egen `test:contracts`-rad i `package.json` listar bara **129**
  test-filer (räknat på `.spec.ts`/`.cjs`/`.test.mjs`-förekomster), mot
  **208** i dagens `origin/main` — main har vuxit med ~60 % fler testfiler
  sedan PR41:s förgreningspunkt (hela `financial-kernel-*`-familjen,
  `line-split-*`, `value-ledger-*`, `revenue-*`, `partner-demo-*` m.fl. finns
  bara på main). **De 1 942 godkända testerna är alltså bevisligen sanna —
  men mot en 208→129 filer smalare, sex dagar gammal, kodbas. De säger
  ingenting om huruvida PR41:s ändringar fungerar mot dagens 2 896-testers
  huvudgren.**
- Playwright-versionen är oförändrad av PR41 (ingen diff i `devDependencies`
  för `@playwright/test`), så den kända symlink-fixen för
  `chromium_headless_shell` (se `tasks/lessons.md` 2026-09-07/09-17) var
  antingen redan på plats i miljön eller inte behövdes denna gång — testerna
  körde utan att jag behövde göra den manuella symlänken.
- **`test:six-outcomes`, `sprint/activity-route.cjs`, `sprint/mail-
  boundaries.cjs`, `live-journey/policy.test.cjs`, `test:planning`** — de fem
  extra CI-sviterna som `tasks/lessons.md` (2026-09-18) varnar för — är
  **INTE körda** i denna granskning. Given att PR41 i praktiken testar mot en
  helt annan (mindre) testlista är sannolikheten hög att dessa skulle falla
  mot dagens huvudgren, men det är inte verifierat.

---

## 6. Rekommendation

**(c) Dela upp i mindre PR:er.** Motivering ur det som faktiskt hittats,
inte magkänsla:

1. **En ren Next.js 15 / React 19-uppgraderings-PR**, byggd och testad MOT
   DAGENS `main` (de 121 mekaniska codemod-filerna + `package.json` +
   `tsconfig.json` + `next.config.js`). Denna del är i sig självständigt
   verifierbar (`tsc --noEmit` gav 0 fel i denna granskning) och har inget
   naturligt samband med säkerhetsarbetet. Att köra den separat gör det
   möjligt att verifiera build/deploy-kompatibilitet (Vercel, Sentry-
   instrumentation, `next build`) isolerat, utan att blanda in Stripe-logik.
2. **En separat säkerhets-/Stripe-PR**, ombyggd ovanpå dagens `main` så att
   den fångar mains egen vidareutveckling av samma filer (särskilt
   `app/api/quotes/[id]/handoff/route.ts` och de övriga 10 filerna i samma
   riskklass under punkt 2) i stället för att skriva över dem. De verkliga
   fixarna (admin-auth `getUser()`, tenant-scopning + CAS i
   `rescheduleBooking`, Stripe-idempotens i `checkout-session.ts`/`write-
   billing-update.ts`) är värda att rädda och bör inte kastas bort — men de
   måste räknas om mot en kodbas med 208 (snart fler) testfiler, inte 129.
   `.github/workflows/contracts.yml` måste uppdateras samtidigt så att
   `test:launch-security` faktiskt grindas i CI.
3. **SQL-migrationerna är redan körda i produktion** sedan 2026-09-12 och
   behöver inte köras om — de tas med som fakta/dokumentation i den nya PR:en,
   inte som en väntande åtgärd.

**Var särskilt tydlig om Next 15 ska skiljas från säkerhetsdelen: ja.** De två
delarna har noll teknisk koppling (Next 15 kräver inte Stripe-ändringarna och
tvärtom), de testades tillsammans bara för att de skrevs i samma session, och
att låta dem ligga ihop gör (a) en ramverksuppgradering omöjlig att granska
isolerat för byggpåverkan/deploy-risk, och (b) säkerhetsfixarna gisslan av en
build-uppgraderings review-cykel som normalt tar längre tid och har högre
risk för produktionsstörningar (cachebeteende, RSC-ändringar, PDF-genereringen
via `puppeteer-core`/`@sparticuz/chromium` som redan har en egen
webpack-bundlingsvarning i `next.config.js`).

**Merge as-is (a) avråds bestämt:** konflikterna i punkt 2 (särskilt
`package.json`-testlistan och den tysta `quotes/handoff`-regressionen) skulle
med hög sannolikhet antingen blockera mergen helt eller — värre — mergas
"rent" och tyst återinföra en förlegad version av en redan vidareutvecklad
funktion, exakt det mönster som redan kostat produktionen tidigare (se
`tasks/lessons.md`, flera poster om tappade svansar och tysta regressioner
vid merge).

---

## Sammanfattning

De tre viktigaste fynden:

1. **77 % av PR41:s filer (121 av 157) är en ren Next.js 15/React 19-
   uppgradering utan säkerhetsinnehåll** — paketerad ihop med, men teknisk
   obunden till, säkerhets-/Stripe-arbetet.
2. **De faktiska säkerhets- och Stripe-fixarna är äkta och konkreta**
   (verifierad `getUser()`-fix i `lib/admin-auth.ts`, tenant-scopning +
   optimistisk låsning i `lib/approve-actions.ts`, Stripe-idempotens i
   `lib/billing/checkout-session.ts`), och de två SQL-migrationerna är redan
   körda i produktion sedan 2026-09-12 — men PR:ns "1 942 godkända
   kontraktstester" är bevisligen sanna mot en 129-filers testlista som är
   sex dagar och ~80 filer efter dagens `main` (208 filer, verifierat
   `2 896`-talet i uppdragets brief är rimligt i den storleksordningen).
3. **Minst en tyst merge-regression är redan bevisad** (`app/api/quotes/[id]/
   handoff/route.ts` skulle vid en rak merge sannolikt återgå från mains nya
   multi-omgångs-uppföljning till PR41:s gamla enkel-omgångs-logik, utan att
   git flaggar det som konflikt), och `package.json`:s `test:contracts`-rad
   är en känd högriskpunkt för samma sorts tyst dataförlust vid merge.

**Rekommendation i en mening:** dela upp PR41 i en fristående Next.js 15/
React 19-uppgradering och en separat säkerhets-/Stripe-PR ombyggd mot dagens
`main` (SQL:en är redan skarp och behöver inte köras om), snarare än att
merga, tvinga fram en merge, eller kasta arbetet — den underliggande
säkerhetslogiken är för substantiell för att stängas utan att räddas.
