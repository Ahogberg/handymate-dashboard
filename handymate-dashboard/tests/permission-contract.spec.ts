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
      route: 'analytics/economics',
      requires: 'see_financials',
      why: 'Fakturerat, obetalt, overhead, margin_target_percent, arbetskostnad — hela företagets resultat.',
    },
    {
      route: 'dashboard/economy-summary',
      requires: 'see_financials',
      why: 'Fakturerat i månaden och obetalda belopp.',
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
}

/**
 * Medvetet ogrindade, med motivering. Motsvarar MANUAL_TABLES i
 * schema-kontraktet: den dokumenterade skulden, inte en glömska.
 */
const UNPROTECTED_BY_DESIGN: Record<string, string> = {
  'admin/demo-reset':
    'Destruktiv men skyddad av business_id === DEMO_BUSINESS_ID i stället för roll. Medvetet dokumenterat i filhuvudet.',
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
