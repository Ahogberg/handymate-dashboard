import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { arLasroll, farSkriva, LASMETODER, LASROLLER, LASROLLENS_RATTIGHETER, startsidaForRoll } from '../lib/auth/lasbehorighet'
import { hasPermission, isOwnerOrAdmin, type BusinessUser, type Permission } from '../lib/permissions'

// Facit för revisorsplatsen (Andreas 2026-09-18: firmans redovisningskonsult
// ska kunna bjudas in och se siffrorna utan att kunna röra något).
//
// VARFÖR DET HÄR FACITET FINNS. getAuthenticatedBusiness() gör varje aktiv rad
// i business_users till en autentiserad tenant UTAN att läsa rollen, och de
// flesta mutande rutter nöjer sig med den helpern. Koden har 291
// rollkontroller, men utskicksvägarna till kundens kunder har ingen. En roll
// som bara läggs till i tabellen får därför skriva överallt där ingen råkat
// kontrollera. Grinden är EN: läsroll + icke-läsmetod ⇒ null.
//
// Fem påståenden hålls här:
//  1. läsmetoderna är en ALLOWLIST — en metod vi inte tänkt på är en skrivning,
//  2. can_*-flaggorna kan inte göra revisorn skrivande,
//  3. grinden sitter i lib/auth.ts, i medlemsgrenen, före företagsläsningen,
//  4. databasen känner rollen och har inte tappat någon av de fem gamla,
//  5. menyn är en allowlist och erbjuder inga ytor som ändå svarar 403.

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** En revisor med ALLA flaggor påslagna — värsta fallet, inte det snällaste. */
const revisorMedAllt: BusinessUser = {
  id: 'bu-rev', business_id: 'biz-a', user_id: 'u-rev', role: 'revisor',
  name: 'Revisorn', email: 'revisor@byra.se', phone: null, title: null,
  hourly_cost: null, hourly_rate: null, color: '#000', avatar_url: null,
  is_active: true,
  can_see_all_projects: true, can_see_financials: true, can_manage_users: true,
  can_approve_time: true, can_create_invoices: true,
}

test.describe('Läsmetoderna är en allowlist', () => {
  test('revisor får läsa', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      expect(farSkriva('revisor', m), `${m} ska vara tillåten`).toBe(true)
    }
  })

  test('revisor får inte skriva, och en metod vi inte tänkt på räknas som skrivning', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'PURGE', 'TRACE', 'LINK', '', 'get ']) {
      expect(farSkriva('revisor', m), `${m || '(tom)'} ska nekas`).toBe(false)
    }
    // Saknad metod är inte en läsning.
    expect(farSkriva('revisor', null)).toBe(false)
    expect(farSkriva('revisor', undefined)).toBe(false)
  })

  test('gemener räknas — ingen får smita genom att skriva post', () => {
    expect(farSkriva('revisor', 'post')).toBe(false)
    // Men en riktig läsning i gemener ska funka; metoden normaliseras.
    expect(farSkriva('revisor', 'get')).toBe(true)
  })

  test('listan innehåller exakt de tre läsmetoderna', () => {
    expect([...LASMETODER].sort()).toEqual(['GET', 'HEAD', 'OPTIONS'])
    expect([...LASROLLER]).toEqual(['revisor'])
  })

  test('andra roller påverkas inte — funktionen är ingen allmän behörighetskontroll', () => {
    for (const roll of ['owner', 'admin', 'employee', 'project_manager', 'kalkylator', null, undefined, '']) {
      expect(farSkriva(roll, 'POST'), `${roll} ska inte grindas här`).toBe(true)
    }
    expect(arLasroll('revisor')).toBe(true)
    expect(arLasroll('owner')).toBe(false)
    expect(arLasroll(null)).toBe(false)
  })
})

test.describe('Rollen avgör, inte bockarna', () => {
  test('revisor med ALLA flaggor påslagna får ändå bara läsa siffrorna', () => {
    expect(hasPermission(revisorMedAllt, 'see_financials')).toBe(true)
    expect(hasPermission(revisorMedAllt, 'see_all_projects')).toBe(true)
    // Det här är hela poängen: bockarna är data någon kan sätta i teamvyn.
    for (const p of ['create_invoices', 'approve_time', 'manage_users', 'manage_settings'] as Permission[]) {
      expect(hasPermission(revisorMedAllt, p), `${p} ska nekas trots påslagen flagga`).toBe(false)
    }
  })

  test('revisor är varken owner eller admin', () => {
    expect(isOwnerOrAdmin(revisorMedAllt)).toBe(false)
  })

  test('rättighetslistan är just de två läsande', () => {
    expect([...LASROLLENS_RATTIGHETER].sort()).toEqual(['see_all_projects', 'see_financials'])
  })

  test('en anställd med flaggan får fortfarande skapa fakturor — inget annat gick sönder', () => {
    const anstalld: BusinessUser = { ...revisorMedAllt, role: 'employee' }
    expect(hasPermission(anstalld, 'create_invoices')).toBe(true)
    const utanFlagga: BusinessUser = { ...anstalld, can_create_invoices: false }
    expect(hasPermission(utanFlagga, 'create_invoices')).toBe(false)
  })

  test('läsrollen prövas FÖRE owner-grenen', () => {
    // En rad som både är revisor och (felaktigt) skulle råka matcha något
    // öppnande villkor ska falla på läsrollen. Ordningen i källan håller det.
    const src = read('lib/permissions.ts')
    const iLas = src.indexOf('arLasroll(user.role)')
    const iOwner = src.indexOf("if (user.role === 'owner') return true")
    expect(iLas, 'läsrollsgrenen saknas i hasPermission').toBeGreaterThan(-1)
    expect(iLas).toBeLessThan(iOwner)
  })
})

test.describe('Grinden sitter i lib/auth.ts, i medlemsgrenen', () => {
  const src = read('lib/auth.ts')

  test('medlemsuppslaget hämtar rollen', () => {
    const gren = src.slice(src.indexOf("from('business_users')"), src.indexOf('normalizeAuthenticatedBusiness(employeeBusiness)'))
    expect(gren).toContain('business_id, role')
  })

  test('rollen prövas mot metoden, och svaret är null', () => {
    const gren = src.slice(src.indexOf("from('business_users')"), src.indexOf('normalizeAuthenticatedBusiness(employeeBusiness)'))
    expect(gren).toContain('farSkriva(businessUser.role, request.method)')
    expect(gren).toMatch(/if \(!farSkriva\([\s\S]*?return null/)
  })

  test('grinden ligger FÖRE företagsläsningen — inte efter', () => {
    const iGrind = src.indexOf('farSkriva(businessUser.role, request.method)')
    const iForetag = src.indexOf("from('business_config')", src.indexOf("from('business_users')"))
    expect(iGrind).toBeGreaterThan(-1)
    expect(iGrind).toBeLessThan(iForetag)
  })

  test('ägarvägen är orörd — grinden gäller bara medlemmar', () => {
    // business_config.user_id-grenen ligger före medlemsgrenen och får inte
    // ha fått någon metodkontroll: ägaren ska självklart kunna skriva.
    const agargren = src.slice(src.indexOf("from('business_config')"), src.indexOf('// Fallback: kolla om användaren är anställd'))
    expect(agargren).not.toContain('farSkriva')
  })

  test('lib/auth.ts är enda stället som gör ett user_id till en tenant', () => {
    // Skulle en andra väg byggas kringgår den grinden. Den här räkningen är
    // spärrhaken: den får inte växa utan att grinden följer med.
    const filer = ['lib/auth.ts', 'lib/permissions.ts']
    for (const f of filer) {
      const s = read(f)
      const antal = (s.match(/from\('business_users'\)/g) || []).length
      expect(antal, `${f} har fler medlemsuppslag än väntat`).toBe(1)
    }
    // getCurrentUser returnerar rollen till anroparen och autentiserar ingen
    // tenant — den behöver därför ingen egen grind.
    expect(read('lib/permissions.ts')).toContain('export async function getCurrentUser')
  })
})

test.describe('Databasen känner rollen', () => {
  const sql = read('sql/v259_revisorsplats.sql')

  test('CHECK-villkoret har revisor och har inte tappat någon av de fem gamla', () => {
    for (const roll of ['owner', 'admin', 'employee', 'project_manager', 'kalkylator', 'revisor']) {
      expect(sql, `${roll} saknas i villkoret`).toContain(`'${roll}'::text`)
    }
    expect(sql).toContain('business_users_role_check')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS business_users_role_check')
  })

  test('kolumnkommentaren säger att rollen är läsande', () => {
    expect(sql).toContain('COMMENT ON COLUMN public.business_users.role')
    expect(sql).toMatch(/LÄSROLL/)
  })
})

test.describe('Menyn är en allowlist', () => {
  const src = read('components/Sidebar.tsx')

  test('läsrollen filtreras med en allowlist, inte en döljlista', () => {
    expect(src).toContain('LASROLLENS_YTOR')
    // Sök slutankaret EFTER startet: samma rad citeras i en kommentar längre
    // upp i filen, och ett slut före starten ger en tom sträng som inte
    // påstår något.
    const iStart = src.indexOf('if (laserBara) {')
    expect(iStart, 'läsrollsgrenen saknas i filterNavForRole').toBeGreaterThan(-1)
    const gren = src.slice(iStart, src.indexOf('if (!isEmployee && owa) return items', iStart))
    expect(gren.length, 'grenen kunde inte läsas ut').toBeGreaterThan(50)
    // Inte bara att listan NÄMNS: filtret får inte vara negerat. Ett `!` här
    // vänder allowlistan till en döljlista och ger revisorn allt utom
    // bokföringen — precis fel, och osynligt för ett toContain-test.
    expect(gren).toMatch(/filter\(c => LASROLLENS_YTOR\.has\(c\.href\)\)/)
    expect(gren).not.toContain('!LASROLLENS_YTOR')
    // Bara barn i grupper — inga toppnivålänkar.
    expect(gren).toContain("if (item.type !== 'group') return null")
  })

  test('allowlistan erbjuder ingen yta som ändå svarar 403 för en läsroll', () => {
    const lista = src.slice(src.indexOf('const LASROLLENS_YTOR'), src.indexOf('])', src.indexOf('const LASROLLENS_YTOR')))
    // Dessa tre är grindade på isOwnerOrAdmin och skulle bli en stängd dörr.
    for (const stangd of ['/dashboard/karin', '/dashboard/pengar', '/dashboard/min-garanti']) {
      expect(lista, `${stangd} leder till en stängd dörr`).not.toContain(stangd)
    }
    expect(lista).toContain('/dashboard/invoices')
    expect(lista).toContain('/dashboard/supplier-invoices')
  })

  test('läsrollen känns igen via den delade helpern, inte en egen strängjämförelse', () => {
    expect(src).toContain("import { arLasroll } from '@/lib/auth/lasbehorighet'")
    expect(src).toContain('arLasroll(currentUser?.role)')
    expect(src).not.toMatch(/role === 'revisor'/)
  })
})

test.describe('Revisorn landar på fakturorna, inte på Översikt', () => {
  test('startsidan härleds ur rollen på ett ställe', () => {
    expect(startsidaForRoll('revisor')).toBe('/dashboard/invoices')
    for (const roll of ['owner', 'admin', 'employee', 'project_manager', 'kalkylator', null, undefined]) {
      expect(startsidaForRoll(roll), `${roll} ska landa på Översikt`).toBe('/dashboard')
    }
  })

  test('Översikt skickar vidare en läsroll med replace, inte push', () => {
    const src = read('app/dashboard/page.tsx')
    expect(src).toContain('arLasroll(user?.role)')
    expect(src).toContain('router.replace(LASROLLENS_START)')
    // push hade lagt Översikt i historiken, så bakåtknappen loopar tillbaka.
    expect(src).not.toContain('router.push(LASROLLENS_START)')
    // Och sidan får inte rendera hantverkarytan under omdirigeringen.
    const gren = src.slice(src.indexOf('if (arLasroll(user?.role)) {'), src.indexOf('if (!business?.business_id)'))
    expect(gren).toContain('Loader2')
    expect(gren).not.toContain('DashboardContent')
  })

  test('inbjudan landar enligt rollen, inte hårdkodat', () => {
    const src = read('app/invite/[token]/page.tsx')
    expect(src).toContain('startsidaForRoll(invite?.role)')
    expect(src).not.toContain("router.push('/dashboard')")
  })

  test('inbjudan visar ett läsbart rollnamn för varje verklig roll', () => {
    const src = read('app/invite/[token]/page.tsx')
    const labels = src.slice(src.indexOf('const roleLabels'), src.indexOf('}', src.indexOf('const roleLabels')))
    for (const roll of ['owner', 'admin', 'project_manager', 'kalkylator', 'employee', 'revisor']) {
      expect(labels, `${roll} saknar etikett`).toContain(`${roll}:`)
    }
    // Roller som aldrig funnits i CHECK-villkoret ska inte stå kvar.
    expect(labels).not.toContain('technician')
    expect(labels).not.toContain('office')
  })
})

test.describe('Klientens kopia av behörighetslogiken har samma spärr', () => {
  const src = read('lib/CurrentUserContext.tsx')

  test('läsrollen nekas i can(), ur den delade modulen', () => {
    expect(src).toContain("import { arLasroll, LASROLLENS_RATTIGHETER } from '@/lib/auth/lasbehorighet'")
    const fn = src.slice(src.indexOf('const can = useCallback'), src.indexOf('}, [user])'))
    expect(fn).toContain('arLasroll(user.role)')
    // Före owner-grenen, precis som på servern.
    expect(fn.indexOf('arLasroll(user.role)')).toBeLessThan(fn.indexOf("user.role === 'owner'"))
    // Ingen egen ordlista: regeln får inte skrivas av för hand här.
    expect(fn).not.toContain("'see_financials'")
  })

  test('RequireRole är en allowlist och nekar en roll den inte känner', () => {
    const gate = read('components/PermissionGate.tsx')
    expect(gate).toContain('roles: readonly string[]')
    expect(gate).toContain('!roles.includes(user.role)')
  })
})

test.describe('Ägaren kan bjuda in sin konsult', () => {
  const src = read('app/dashboard/team/page.tsx')

  test('rollen finns i båda väljarna', () => {
    expect((src.match(/<option value="revisor">/g) || []).length).toBe(2)
  })

  test('beskrivningen säger att rollen inte kan ändra något', () => {
    const beskrivning = src.slice(src.indexOf('const ROLE_DESCRIPTIONS'), src.indexOf('}', src.indexOf('const ROLE_DESCRIPTIONS')))
    expect(beskrivning).toContain('revisor:')
    expect(beskrivning).toMatch(/kan inte ändra/)
  })

  test('förvalet ger läsning och inget mer', () => {
    const forval = src.slice(src.indexOf('const REVISOR_PERMISSIONS'), src.indexOf('}', src.indexOf('const REVISOR_PERMISSIONS')))
    expect(forval).toContain('can_see_financials: true')
    expect(forval).toContain('can_create_invoices: false')
    expect(forval).toContain('can_manage_users: false')
    expect(forval).toContain('can_approve_time: false')
  })
})
