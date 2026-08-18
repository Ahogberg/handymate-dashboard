/**
 * Behörighetskontraktet — vilka API-rutter MÅSTE rollgrindas (2026-08-06).
 *
 * ═══ VARFÖR DET HÄR TESTET FINNS ═══
 *
 * `getAuthenticatedBusiness()` avgör VILKET FÖRETAG en användare tillhör — inte
 * vad hen får se inom det. CLAUDE.md kräver det anropet på varje ny rutt och
 * regeln följs, men det har aldrig funnits någon motsvarande regel för
 * rollgrindar och inget test som skulle upptäcka en saknad.
 *
 * Följden, mätt 2026-08-06: 31 av 460 rutter hade någon rollkontroll. Bland de
 * ogrindade fanns `app/api/export` som returnerar hela kundregistret med
 * PERSONNUMMER I KLARTEXT, `gdpr/delete` som raderar hela kontot, och
 * `billing/checkout` som ändrar företagets abonnemang — allt tillgängligt för
 * vilken inloggad anställd som helst.
 *
 * Ingen av dem var trasig. De saknade bara något, tyst, i månader. Det är den
 * felklassen det här testet finns för att göra omöjlig.
 *
 * ═══ KARTAN ÄR POLICYN ═══
 *
 * SENSITIVE_ROUTES är inte en beskrivning av koden — den är beslutet om vad som
 * kräver behörighet. Testet upprätthåller beslutet. Att lägga till en rutt i
 * kartan är att fatta ett beslut; att ta bort en är också det, och kräver då en
 * motivering i UNPROTECTED_BY_DESIGN.
 *
 * ═══ GRUPPERAT PER DOMÄN, INTE PER FIL ═══
 *
 * Det verkliga hålet var aldrig "en rutt glömdes bort" utan att grinden var
 * OJÄMNT applicerad inom samma domän: `POST /api/invoices` krävde
 * create_invoices medan `invoices/from-project`, `from-quote`,
 * `from-time-entries` och `[id]/mark-paid` inte gjorde det. Sidodörrar. En
 * flat lista hade dolt det; grupperingen gör det synligt.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/permission-contract.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { verifyOwnership } from '../lib/auth/verify-ownership'

const ROOT = path.join(__dirname, '..')
const API_DIR = path.join(ROOT, 'app', 'api')

/** Behörighetsflaggorna, härledda ur lib/permissions.ts så en ny flagga inte
    kan glömmas bort här. 'owner-admin' är inte en flagga utan den skarpare
    rollkontrollen som t.ex. löneexporten använder. */
type Requirement =
  | 'see_all_projects'
  | 'see_financials'
  | 'manage_users'
  | 'approve_time'
  | 'create_invoices'
  | 'manage_settings'
  | 'owner-admin'

interface RouteRule {
  /** Sökväg relativt app/api, utan /route.ts. */
  route: string
  requires: Requirement
  /** Varför. Skrivs för den som en dag vill ta bort grinden. */
  why: string
}

/**
 * Rutterna som måste grindas, per domän.
 *
 * VÅG 1 — det som faktiskt bränner. Ordnat efter skada, inte efter kategori.
 */
const SENSITIVE_ROUTES: Record<string, RouteRule[]> = {
  'Personuppgifter och kontot': [
    {
      route: 'export',
      requires: 'owner-admin',
      why: 'CSV med rubriken "…Org.nummer;Kontaktperson;Personnummer;Skapad" — hela kundregistret med personnummer i klartext. Enskilt allvarligaste exponeringen i kodbasen.',
    },
    {
      route: 'gdpr/export',
      requires: 'owner-admin',
      why: 'include_sensitive=true ger personnummer i klartext för hela affärsdatan.',
    },
    {
      route: 'gdpr/delete',
      requires: 'owner-admin',
      why: 'Raderar hela kontot (30 dagars grace). Får aldrig kunna utlösas av en anställd.',
    },
    {
      route: 'admin/demo-reset',
      requires: 'owner-admin',
      why: 'Raderar och seedar om hela demotenantens operativa data. Env-/tenantgrinden ersätter inte aktörens roll.',
    },
  ],

  'Abonnemang och pengar ut': [
    {
      route: 'billing/checkout',
      requires: 'owner-admin',
      why: 'Skapar Stripe-checkout — en anställd kunde uppgradera företagets abonnemang. Kostar riktiga pengar.',
    },
    {
      route: 'billing/usage',
      requires: 'owner-admin',
      why: 'Plan och förbrukning mot gränser. billing/route.ts kräver redan owner/admin — samma data ska inte läcka via sidodörren.',
    },
    {
      route: 'billing/leads-addon',
      requires: 'owner-admin',
      why: 'Köper till lead-addon. Samma skäl som checkout.',
    },
    {
      route: 'billing/setup-intent',
      requires: 'owner-admin',
      why: 'Registrerar betalmetod på företaget — en anställd ska inte kunna knyta ett kort till abonnemanget.',
    },
  ],

  'Lön och personal': [
    {
      route: 'team/[id]',
      requires: 'manage_users',
      why: 'GET returnerar business_users.select(*) för godtycklig kollega — inklusive hourly_cost och hourly_rate. POST /api/team kräver redan manage_users.',
    },
    {
      route: 'time-entry/report',
      requires: 'see_financials',
      why: 'Tidsrapport per person, kund och projekt för hela teamet, exporterbar som csv.',
    },
    {
      route: 'time-entry/summary',
      requires: 'see_financials',
      why: 'Aggregerad tid för hela företaget, grupperad på kund och bokning.',
    },
    {
      route: 'time-entry/bulk',
      requires: 'approve_time',
      why: 'Massregistrering av tid — kan skrivas på någon annans räkning.',
    },
    // OBS för de tre nedan: grinden sitter på GET, inte på skrivvägarna.
    // GET returnerar HELA teamets underlag och är exponeringen. POST/PUT/
    // PATCH/DELETE är den anställdes egen bokföring — att kräva
    // see_financials för att logga sin egen körning hade brutit ett
    // fungerande flöde för varje anställd utan att stänga något hål.
    // Skrivvägarna behöver i stället en ägarkontroll ("egen post ELLER
    // behörighet"), vilket är en egen, medveten omgång. Se not i planen.
    {
      route: 'travel-entry',
      requires: 'see_financials',
      why: 'GET returnerar reseunderlag per person för hela teamet. Skrivvägarna är självbetjäning och grindas inte här.',
    },
    {
      route: 'allowances',
      requires: 'see_financials',
      why: 'GET returnerar traktamenten och ersättningar för hela företaget. Skrivvägarna är självbetjäning och grindas inte här.',
    },
    {
      route: 'vehicle-reports',
      requires: 'see_financials',
      why: 'GET returnerar körrapporter per person och fordon. POST sätter business_user_id till anroparen själv — självbetjäning, grindas inte.',
    },
  ],

  'Ekonomi och lönsamhet': [
    {
      route: 'admin/project-outcomes/reconcile',
      requires: 'owner-admin',
      why: 'Räknar om företagets historiska projektutfall som kan bli lärdata för prissättning och agentinsikter.',
    },
    {
      route: 'admin/invoice-manifests/reconcile',
      requires: 'owner-admin',
      why: 'Etapp P: läker frusna fakturaunderlags-manifest mot extern leveransevidens — samma isOwnerOrAdmin-idiom och domän som project-outcomes/reconcile, inte det ogrindade isAdmin-mönstret (jfr admin/ask-coverage, Etapp L).',
    },
    {
      route: 'invoices/[id]/evidence-manifest',
      requires: 'owner-admin',
      why: 'Etapp P: det frusna fakturaunderlaget (readiness-verdikt vid leveranstillfället) — samma ledger-idiom och känslighet som value/ledger.',
    },
    {
      route: 'observations',
      requires: 'owner-admin',
      why: 'Karins observationer om marginaler, obetalda fakturor och förfallna kundfordringar — plus bolagskalenderns moms, preliminärskatt och bokslut. Låg öppen för alla anställda fram till 2026-08-07.',
    },
    {
      route: 'analytics/economics',
      requires: 'see_financials',
      why: 'Fakturerat, obetalt, overhead, margin_target_percent, arbetskostnad — hela företagets resultat.',
    },
    {
      route: 'value/kvitto',
      requires: 'owner-admin',
      why: 'Värdekvittot: månadens bekräftade kronor attribuerade per agent — företagets intäktsutfall, inget en montör ska se i förbifarten.',
    },
    {
      route: 'value/agarrapport',
      requires: 'owner-admin',
      why: 'Ägarrapporten: bekräftat värde, abonnemangskostnad och retention-argumentet — företagets ekonomi och avtal med oss, aldrig personaldata.',
    },
    {
      route: 'value/ledger',
      requires: 'owner-admin',
      why: 'Value Ledger-fyrstegsvyn: identifierade möjligheter till bekräftat betalda kronor — företagets intäktsutfall, samma känslighet som kvittot. Saknades i kartan tills history-rutten tillkom 2026-08-17.',
    },
    {
      route: 'value/ledger/history',
      requires: 'owner-admin',
      why: 'Samma ledger som tidsserie: bekräftat betalda kronor per månad bakåt. Sidodörr till value/ledger — måste bära exakt samma grind.',
    },
    {
      route: 'revenue-recovery-cases',
      requires: 'owner-admin',
      why: 'Följer identifierad intäkt genom ÄTA, faktura och bekräftad betalning — både företagets affärsläge och ekonomiska utfall i samma read model.',
    },
    {
      route: 'dashboard/economy-summary',
      requires: 'see_financials',
      why: 'Fakturerat i månaden och obetalda belopp.',
    },
    {
      route: 'pipeline',
      requires: 'see_financials',
      why: 'Full pipeline med affärsvärde, deals grupperade per steg — samma finansiella känslighet som economy-summary, men via /api/pipeline exponerat oskyddat till 2026-08-11.',
    },
    {
      route: 'pipeline/stats',
      requires: 'see_financials',
      why: 'Sammanfattad pipeline-summa (totalValue) — mindre payload, samma exponering. Det här var den rutt Verksamhetsöversikt-plattan i mobilappen faktiskt hämtade utan behörighetskontroll.',
    },
    {
      route: 'pipeline/deals',
      requires: 'see_financials',
      why: 'GET gör select(*) på deal-tabellen (inkl. affärsvärde). Systerrutten som Flödet-sidan anropar i samma Promise.all som /api/pipeline — kvarstod oskyddad efter den första pipeline-fixen och var den faktiska läckan.',
    },
    {
      // Dynamisk sub-route, egen regel skild från 'pipeline/deals' —
      // samma konvention som team/[id] har en egen rad utöver team.
      route: 'pipeline/deals/[id]',
      requires: 'see_financials',
      why: 'GET gör select(*) på en enskild deal (inkl. affärsvärde), nådd bl.a. från offertformulärets deal-prefill. Tredje systerrutten i samma läcka som pipeline och pipeline/deals.',
    },
    {
      route: 'analytics/win-loss',
      requires: 'see_financials',
      why: 'Vunnet/förlorat värde, snittstorlek per affär, källfördelning — hela företagets pipeline-utfall. Analytics-sidan är redan dold för anställda i Sidebar, men API:et kollade aldrig.',
    },
    {
      route: 'analytics/job-types',
      requires: 'see_financials',
      why: 'Intäkt per jobbtyp (deal_value, accepted_value, total_value) för hela företaget de senaste 12 månaderna. Samma Analytics-sida som win-loss, samma saknade API-grind.',
    },
    {
      route: 'onboarding/instant-value',
      requires: 'see_financials',
      why: 'Summerar deal-värde och obetalda fakturor för hela företaget till onboardingens "payoff"-skärm. Görs alltid av ägaren (har alltid see_financials) så grinden stör aldrig onboardingen.',
    },
    {
      route: 'dashboard/cash-radar',
      requires: 'see_financials',
      why: 'Fem veckors kassaflödesprognos — fakturerat plus viktad potential, alltså företagets likviditet.',
    },
    {
      route: 'projects/[id]/profitability',
      requires: 'see_financials',
      why: 'Full ProjectEconomics. Systerrutten per-person har redan isOwnerOrAdmin — inkonsekvensen var själva hålet.',
    },
    {
      route: 'projects/[id]/profitability/mobile',
      requires: 'see_financials',
      why: 'Samma lönsamhetsdata i mindre payload. Var den rutt mobilens fail-open faktiskt exponerade.',
    },
    {
      route: 'projects/[id]/costs',
      requires: 'see_financials',
      why: 'Projektets kostnader, både läsning och skrivning.',
    },
    {
      route: 'projects/[id]/efterkalkyl',
      requires: 'see_financials',
      why: 'Fryst utfall — kalkyl mot verkligt resultat.',
    },
    {
      route: 'supplier-invoices',
      requires: 'see_financials',
      why: 'Leverantörsfakturor, alltså inköpspriser och därmed marginalen.',
    },
  ],

  'Fakturasidodörrarna': [
    {
      route: 'invoices/from-project',
      requires: 'create_invoices',
      why: 'POST /api/invoices kräver create_invoices. Den här skapar en faktura utan att göra det.',
    },
    {
      route: 'invoices/from-quote',
      requires: 'create_invoices',
      why: 'Skapar faktura ur en signerad offert utan den grind POST /api/invoices har. Samma sidodörr som from-project.',
    },
    {
      route: 'invoices/from-time-entries',
      requires: 'create_invoices',
      why: 'Skapar faktura ur registrerad tid utan den grind POST /api/invoices har. Samma sidodörr som from-project.',
    },
    {
      route: 'invoices/[id]/mark-paid',
      requires: 'create_invoices',
      why: 'Markerar en faktura som betald — påverkar bokföring och kassaflödesprognos.',
    },
  ],

  'Uppdrag (Goal-to-Plan V1)': [
    {
      route: 'mission/active',
      requires: 'owner-admin',
      why: 'Företagets pengamål, deadline och härledd progress (verifierat betalt per klass) — samma finansiella känslighet som value/ledger. Etapp D-härdning, 2026-08-17.',
    },
    {
      route: 'mission/suggestions',
      requires: 'owner-admin',
      why: 'Chipsen komponeras ur förfallna belopp och marginalrisk — samma pengar-källa som dashboard/pengar, bara omformulerad till förslag. Etapp D-härdning, 2026-08-17.',
    },
    {
      route: 'mission/[id]/resolve',
      requires: 'owner-admin',
      why: 'Avslutar (cancel/complete) företagets aktiva pengamål — en styrande handling, inte en läsning. Etapp D-härdning, 2026-08-17.',
    },
    {
      route: 'mission/history',
      requires: 'owner-admin',
      why: 'Uppdragshistorik + verifierat betalt per uppdrag + Mission Learning-rader — samma finansiella känslighet som mission/active. Etapp H, 2026-08-17.',
    },
    {
      route: 'mission/[id]/mandate',
      requires: 'owner-admin',
      why: 'Ger teamet rätt att agera autonomt inom kronor/antal-gränser utan ett kort per handling — en styrande delegeringshandling (POST/PATCH), inte en läsning. Får aldrig kunna skapas eller återkallas av en anställd. Etapp X, 2026-08-18.',
    },
  ],

  'Frånvaroläge (Etapp Å)': [
    {
      route: 'absence',
      requires: 'owner-admin',
      why: 'Sätter/avslutar frånvarofönstret som styr vilka pushar hela teamet undertrycker — en styrande policy för företaget, aldrig något en anställd ska kunna sätta åt ägaren. Etapp Å, 2026-08-18.',
    },
    {
      route: 'absence/report',
      requires: 'owner-admin',
      why: 'Återkomstrapporten läser kön och aktivitetsloggen brett (vad teamet gjort/misslyckats med under hela frånvaron) — samma känslighet som mission/history. Etapp Å, 2026-08-18.',
    },
  ],

  'Jobbpass (Etapp Ä)': [
    {
      route: 'projects/[id]/jobbpass',
      requires: 'owner-admin',
      why: 'Ägarens urval av vilka projektfoton som får följa med kunden plus samtyckesflaggan för framtida service — en styrande redigeringsyta, inte en läsning en anställd ska kunna göra åt ägaren. Etapp Ä, 2026-08-18.',
    },
    {
      route: 'projects/[id]/jobbpass/publish',
      requires: 'owner-admin',
      why: 'Publicerar en publik kundlänk med projektdata — samma känslighet som quotes/sign-link. Får aldrig kunna triggas av en anställd. Etapp Ä, 2026-08-18.',
    },
  ],

  'Integrationer': [
    {
      route: 'integrations/fortnox/disconnect',
      requires: 'manage_settings',
      why: 'Kopplar bort företagets bokföring. Gamla /api/fortnox/disconnect hade grinden men nya trädet saknade den tills konsolideringen 2026-08-10 — exakt den tysta regression den här kartan finns för att stoppa.',
    },
    {
      route: 'integrations/email-lead',
      requires: 'manage_settings',
      why: 'POST skapar företagets inkommande leadadress — en inställning som styr vart kundernas mail routas. Får inte kunna aktiveras av vilken anställd som helst.',
    },
  ],
}

/**
 * Medvetet ogrindade, med motivering. Motsvarar MANUAL_TABLES i
 * schema-kontraktet: den dokumenterade skulden, inte en glömska.
 */
const UNPROTECTED_BY_DESIGN: Record<string, string> = {
  'projects':
    'Grindar inte utan DEGRADERAR svaret (canSeeAllProjects/canSeeFinancials filtrerar fälten). Fail-open på !currentUser är medvetet för superadmin-impersonation.',
}

/**
 * De tre skyddsformer som FAKTISKT används i kodbasen. Alla tre måste
 * accepteras, annars ger testet falska larm på korrekt skyddade rutter.
 *
 * Matchar på ANROPSSTÄLLET, aldrig på importraden: flera filer (app/api/google/*,
 * vehicle-reports) importerar getCurrentUser utan att grinda på den, och en
 * importbaserad skanning hade räknat dem som skyddade.
 */
const GUARD_PATTERNS: RegExp[] = [
  // hasPermission(currentUser, 'see_financials') — men INTE `!currentUser || hasPermission(...)`,
  // som degraderar i stället för att blockera.
  /(?<!\|\|\s{0,4})\bhasPermission\s*\(/,
  /\bisOwnerOrAdmin\s*\(/,
  /\brequirePermission\s*\(/,
  /\brequireRole\s*\(/,
  // Rollsträngsjämförelse: currentUser?.role !== 'owner' && currentUser?.role !== 'admin'
  /\brole\s*!==\s*['"](?:owner|admin)['"]/,
  /\brole\s*===\s*['"](?:owner|admin)['"]/,
]

function routeFile(route: string): string {
  return path.join(API_DIR, ...route.split('/'), 'route.ts')
}

function isGuarded(file: string): boolean {
  if (!fs.existsSync(file)) return false
  const content = fs.readFileSync(file, 'utf8')
  // Stryk importrader först — en import är inget skydd.
  const body = content
    .split('\n')
    .filter(line => !/^\s*import\b/.test(line))
    .join('\n')
  return GUARD_PATTERNS.some(re => re.test(body))
}

function allRuleEntries(): RouteRule[] {
  return Object.values(SENSITIVE_ROUTES).flat()
}

test.describe('behörighetskontraktet — känsliga rutter är rollgrindade', () => {
  for (const [domain, rules] of Object.entries(SENSITIVE_ROUTES)) {
    test(`${domain}`, () => {
      const unguarded: Record<string, string> = {}
      for (const rule of rules) {
        const file = routeFile(rule.route)
        if (!fs.existsSync(file)) {
          unguarded[rule.route] = `FILEN SAKNAS (${path.relative(ROOT, file)}) — flyttad eller borttagen? Uppdatera kartan.`
          continue
        }
        if (!isGuarded(file)) {
          unguarded[rule.route] = `saknar rollgrind. Kräver: ${rule.requires}. ${rule.why}`
        }
      }

      expect(
        unguarded,
        `Rutter utan rollgrind i domänen "${domain}".\n` +
          `getAuthenticatedBusiness() avgör VILKET FÖRETAG användaren tillhör —\n` +
          `inte vad hen får se inom det. Lägg till kontrollen, eller flytta rutten\n` +
          `till UNPROTECTED_BY_DESIGN med en motivering.\n${JSON.stringify(unguarded, null, 2)}`,
      ).toEqual({})
    })
  }
})

test.describe('kartan själv', () => {
  test('varje regel pekar på en fil som finns', () => {
    const missing = allRuleEntries()
      .map(r => r.route)
      .filter(route => !fs.existsSync(routeFile(route)))
    expect(missing, 'Regler för rutter som inte finns — kartan har glidit från koden').toEqual([])
  })

  test('varje regel har en motivering värd namnet', () => {
    const thin = allRuleEntries().filter(r => r.why.trim().length < 40)
    expect(
      thin.map(r => r.route),
      'En motivering under 40 tecken förklarar inget för den som en dag vill ta bort grinden',
    ).toEqual([])
  })

  test('ingen rutt står i BÅDE kartan och undantagslistan', () => {
    const both = allRuleEntries()
      .map(r => r.route)
      .filter(route => route in UNPROTECTED_BY_DESIGN)
    expect(both, 'Motstridigt: rutten är både obligatorisk och undantagen').toEqual([])
  })

  test('varje undantag har en motivering', () => {
    const thin = Object.entries(UNPROTECTED_BY_DESIGN).filter(([, why]) => why.trim().length < 40)
    expect(thin.map(([route]) => route), 'Undantag utan motivering är bara en glömska med bättre PR').toEqual([])
  })
})

test.describe('SANITY — skannern hittar faktiskt något', () => {
  // Det viktigaste testet i filen. Utan det kan skannern sluta fungera och
  // hela kontraktet bli grönt av fel skäl — exakt det failure mode som lät de
  // här rutterna ligga ogrindade i månader.

  test('kända SKYDDADE rutter känns igen som skyddade', () => {
    // Handplockade ur de 31 som var grindade före det här arbetet, en per
    // skyddsform: hasPermission, rollsträng, isOwnerOrAdmin.
    const known = [
      'invoices',                              // hasPermission(currentUser, 'see_financials')
      'time-reports/payroll-export',           // currentUser?.role !== 'owner' && ...
      'projects/[id]/profitability/per-person', // isOwnerOrAdmin(currentUser)
    ]
    for (const route of known) {
      const file = routeFile(route)
      expect(fs.existsSync(file), `${route}: filen saknas — testets referenspunkt har flyttat`).toBe(true)
      expect(isGuarded(file), `${route} ÄR grindad i koden men skannern missar den — regexen är trasig`).toBe(true)
    }
  })

  test('en rutt som bara importerar getCurrentUser räknas INTE som skyddad', () => {
    // Skyddet ska mätas på anropsstället. Ett par filer importerar helpern och
    // grindar aldrig på den; räknas de som skyddade blir kontraktet meningslöst.
    const onlyImports = `
      import { getCurrentUser, hasPermission } from '@/lib/permissions'
      export async function GET(request: NextRequest) {
        const business = await getAuthenticatedBusiness(request)
        return NextResponse.json({ ok: true })
      }
    `
    const body = onlyImports.split('\n').filter(l => !/^\s*import\b/.test(l)).join('\n')
    expect(GUARD_PATTERNS.some(re => re.test(body))).toBe(false)
  })

  test('det degraderande fail-open-mönstret räknas INTE som skydd', () => {
    // app/api/projects/route.ts: `!currentUser || hasPermission(...)` filtrerar
    // svaret men blockerar inte. En naiv hasPermission-regex hade godkänt den.
    const degrading = `const canSeeFinancials = !currentUser || hasPermission(currentUser, 'see_financials')`
    const blocking = `if (!currentUser || !hasPermission(currentUser, 'see_financials')) { return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 }) }`
    expect(GUARD_PATTERNS.some(re => re.test(degrading)), 'degraderande mönster ska inte räknas som grind').toBe(false)
    expect(GUARD_PATTERNS.some(re => re.test(blocking)), 'blockerande mönster ska räknas som grind').toBe(true)
  })
})

test.describe('regression — de här får aldrig bli ogrindade igen', () => {
  test('de fyra värsta exponeringarna', () => {
    for (const route of ['export', 'gdpr/export', 'gdpr/delete', 'billing/checkout']) {
      const file = routeFile(route)
      expect(
        isGuarded(file),
        `${route} grindades 2026-08-06 efter att ha legat öppen för varje anställd. ` +
          `Den får aldrig bli ogrindad igen.`,
      ).toBe(true)
    }
  })
})

test.describe('N2 — service-role-vägar verifierar tenant explicit', () => {
  const projectsRoute = fs.readFileSync(routeFile('projects'), 'utf8')
  const projectDetailRoute = fs.readFileSync(routeFile('projects/[id]'), 'utf8')
  const ataRoute = fs.readFileSync(routeFile('ata'), 'utf8')
  const monthlyReviewRoute = fs.readFileSync(routeFile('cron/monthly-review'), 'utf8')

  test('projekt-DELETE verifierar parent före första barnradering', () => {
    const deleteHandler = projectsRoute.slice(projectsRoute.indexOf('export async function DELETE'))
    const ownershipCheck = deleteHandler.indexOf(".from('project')")
    const firstChildDelete = deleteHandler.indexOf(".from('project_document')")

    expect(ownershipCheck).toBeGreaterThanOrEqual(0)
    expect(firstChildDelete).toBeGreaterThan(ownershipCheck)
    expect(deleteHandler.slice(ownershipCheck, firstChildDelete)).toContain(
      ".eq('business_id', business.business_id)",
    )
    expect(deleteHandler.slice(ownershipCheck, firstChildDelete)).toContain('if (!ownedProject)')
  })

  test('varje projektbarn raderas med business_id-filter och rätt legacy-nyckel', () => {
    const deleteHandler = projectsRoute.slice(projectsRoute.indexOf('export async function DELETE'))
    const children = [
      ['project_document', 'project_id'],
      ['project_log', 'order_id'],
      ['project_checklist', 'order_id'],
      ['project_assignment', 'project_id'],
      ['project_material', 'project_id'],
      ['project_milestone', 'project_id'],
      ['project_change', 'project_id'],
    ] as const

    for (const [table, linkColumn] of children) {
      const query = new RegExp(
        `\\.from\\('${table}'\\)[\\s\\S]{0,300}?\\.delete\\(\\)[\\s\\S]{0,300}?` +
          `\\.eq\\('${linkColumn}', projectId\\)[\\s\\S]{0,200}?` +
          `\\.eq\\('business_id', business\\.business_id\\)`,
      )
      expect(deleteHandler, `${table} saknar tenant-filter`).toMatch(query)
    }
  })

  test('projektdetaljens samtliga barnhämtningar är tenant-filtrerade', () => {
    for (const table of [
      'customer',
      'project_milestone',
      'project_change',
      'time_entry',
      'project_material',
      'quotes',
    ]) {
      expect(projectDetailRoute, `${table} saknar business_id`).toMatch(
        new RegExp(
          `\\.from\\('${table}'\\)[\\s\\S]{0,350}?` +
            `\\.eq\\('business_id', business\\.business_id\\)`,
        ),
      )
    }
  })

  test('manuellt projekt och ÄTA verifierar body-ID:n före insert', () => {
    const projectPost = projectsRoute.slice(
      projectsRoute.indexOf('export async function POST'),
      projectsRoute.indexOf('export async function PUT'),
    )
    const ataPost = ataRoute.slice(ataRoute.indexOf('export async function POST'))

    expect(projectPost.indexOf('verifyOwnership(')).toBeGreaterThanOrEqual(0)
    expect(projectPost.indexOf(".from('project')")).toBeGreaterThan(
      projectPost.indexOf('verifyOwnership('),
    )
    expect(projectPost).toContain('idValue: body.customer_id')

    expect(ataPost.indexOf('verifyOwnership(')).toBeGreaterThanOrEqual(0)
    expect(ataPost.indexOf(".from('project_change')")).toBeGreaterThan(
      ataPost.indexOf('verifyOwnership('),
    )
    expect(ataPost).toContain('idValue: projectId')
    expect(ataPost).toContain('idValue: customerId')
  })

  test('monthly-review kan inte välja business_id ur request-body', () => {
    const post = monthlyReviewRoute.slice(monthlyReviewRoute.indexOf('export async function POST'))
    expect(post).toContain('const businessId = business.business_id')
    expect(post).not.toMatch(/body\.business_id/)
  })

  test('ownership-helpern failar stängt för tenant B:s id', async () => {
    const rows = {
      customer: [
        { customer_id: 'customer-a', business_id: 'tenant-a' },
        { customer_id: 'customer-b', business_id: 'tenant-b' },
      ],
    }

    const fakeSupabase = {
      from(table: keyof typeof rows) {
        const filters: Record<string, string> = {}
        const builder = {
          select() { return builder },
          eq(column: string, value: string) {
            filters[column] = value
            return builder
          },
          async maybeSingle() {
            const data = rows[table].find(row =>
              Object.entries(filters).every(([column, value]) =>
                row[column as keyof typeof row] === value,
              ),
            )
            return { data: data ?? null, error: null }
          },
        }
        return builder
      },
    }

    const owned = await verifyOwnership(fakeSupabase as any, 'tenant-a', [{
      table: 'customer',
      idColumn: 'customer_id',
      idValue: 'customer-a',
      label: 'kund',
    }])
    const crossTenant = await verifyOwnership(fakeSupabase as any, 'tenant-a', [{
      table: 'customer',
      idColumn: 'customer_id',
      idValue: 'customer-b',
      label: 'kund',
    }])

    expect(owned).toEqual({ ok: true, missing: [] })
    expect(crossTenant).toEqual({ ok: false, missing: ['kund'] })
  })
})

test.describe('N2 — v96 är fail-closed och håller credentials server-only', () => {
  const migration = fs.readFileSync(path.join(ROOT, 'sql', 'v96_tenant_rls_and_credentials.sql'), 'utf8')
  const fortnox = fs.readFileSync(path.join(ROOT, 'lib', 'fortnox.ts'), 'utf8')

  test('alla ekonomitabeller får medlems- och service-role-policy', () => {
    for (const table of [
      'project',
      'project_change',
      'project_material',
      'time_entry',
      'supplier_invoices',
      'business_config',
    ]) {
      expect(migration).toContain(`'${table}'`)
    }
    expect(migration).toContain('TO authenticated USING (public.is_business_member(business_id))')
    expect(migration).toContain('TO service_role USING (true) WITH CHECK (true)')
    expect(migration).not.toMatch(/TO\s+public\s+USING\s*\(true\)/i)
  })

  test('anon och farliga tabellprivilegier tas bort', () => {
    expect(migration).toContain('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated')
    expect(migration).not.toMatch(/GRANT[^;]*TRUNCATE[^;]*authenticated/i)
  })

  test('Fortnox-hemligheter flyttas och kan bara läsas av service_role', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.business_integration_credentials')
    expect(migration).toContain(
      'REVOKE ALL ON TABLE public.business_integration_credentials FROM PUBLIC, anon, authenticated',
    )
    expect(migration).toContain('GRANT ALL ON TABLE public.business_integration_credentials TO service_role')
    expect(migration).toContain('DROP COLUMN IF EXISTS fortnox_access_token')
    expect(migration).toContain('DROP COLUMN IF EXISTS fortnox_refresh_token')

    expect(fortnox).toContain(".from('business_integration_credentials')")
    expect(fortnox).not.toMatch(
      /\.from\('business_config'\)[\s\S]{0,250}?\.select\([^)]*fortnox_(?:access|refresh)_token/,
    )
  })
})
