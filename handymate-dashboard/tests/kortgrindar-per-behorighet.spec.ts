import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Facit för kö-routingen (lib/approvals/routing.ts).
//
// 2026-09-09. Bakgrund: routing_role har DB-default 'any' och lästes före
// ROUTING_TABLE, vilket gjorde tabellen till död kod. En anställd såg och
// kunde godkänna massutskick, offertuppföljningar med belopp och utgående
// kund-SMS. Det här facit finns för att den klassen av fel ska bli röd i
// grinden i stället för att upptäckas i en app på en telefon.

const ROT = join(__dirname, '..')
const routingKalla = readFileSync(join(ROT, 'lib/approvals/routing.ts'), 'utf8')

function tsFiler(dir: string, ut: string[] = []): string[] {
  for (const namn of readdirSync(dir)) {
    if (namn === 'node_modules' || namn === '.next') continue
    const sokvag = join(dir, namn)
    if (statSync(sokvag).isDirectory()) tsFiler(sokvag, ut)
    else if (/\.tsx?$/.test(namn)) ut.push(sokvag)
  }
  return ut
}

function typerSomSkapasIKoden(): string[] {
  const typer = new Set<string>()
  for (const fil of [...tsFiler(join(ROT, 'app')), ...tsFiler(join(ROT, 'lib'))]) {
    const innehall = readFileSync(fil, 'utf8')
    const traffar = innehall.match(/approval_type:\s*'[a-z0-9_]+'/g) || []
    for (const traff of traffar) typer.add(traff.split("'")[1])
  }
  return Array.from(typer).sort()
}

function tabellen(): Record<string, string> {
  const block = routingKalla.match(/const ROUTING_TABLE[^{]*\{([\s\S]*?)\n\}/)
  expect(block, 'ROUTING_TABLE måste gå att läsa ur källan').toBeTruthy()
  const karta: Record<string, string> = {}
  for (const rad of block![1].match(/^\s+([a-z0-9_]+):\s*'([a-z_]+)'/gm) || []) {
    const [, typ, bucket] = rad.match(/([a-z0-9_]+):\s*'([a-z_]+)'/)!
    karta[typ] = bucket
  }
  return karta
}

test('varje korttyp som skapas i koden har en uttrycklig grind', () => {
  const karta = tabellen()
  const saknas = typerSomSkapasIKoden().filter(typ => !(typ in karta))
  expect(saknas, `Dessa korttyper saknar rad i ROUTING_TABLE och skulle falla på fallbacken. ` +
    `Ta ställning till vem som får besluta om dem:\n  ${saknas.join('\n  ')}`).toEqual([])
})

test('pengar- och massutskickstyper är aldrig öppna för alla', () => {
  const karta = tabellen()
  const kanslig: Record<string, string[]> = {
    can_create_invoices: ['send_invoice', 'review_auto_invoice', 'fakturera_projekt',
      'create_invoice_from_report', 'invoice_reminder', 'confirm_payment', 'job_report'],
    can_see_financials: ['price_adjustment', 'profitability_warning', 'missad_intakt',
      'quote_nudge', 'create_quote_draft', 'send_quote', 'quote_signed'],
    owner_admin: ['seasonal_campaign', 'customer_reactivation', 'proactive_care',
      'publish_microsite', 'autonomy_offer', 'team_intro'],
  }
  for (const [bucket, typer] of Object.entries(kanslig)) {
    for (const typ of typer) {
      expect(karta[typ], `${typ} måste ligga i ${bucket} — ett ja kostar pengar eller når varje kund`).toBe(bucket)
    }
  }
})

test('okänd typ och okänd bucket faller stängt, aldrig till alla', () => {
  // Okänd typ: fallbacken i getRoutingBucket får inte vara 'any'.
  const fallback = routingKalla.match(/return ROUTING_TABLE\[approvalType\] \|\| '([a-z_]+)'/)
  expect(fallback, 'getRoutingBucket måste ha en läsbar fallback').toBeTruthy()
  expect(fallback![1], 'okänd korttyp får inte bli allas').not.toBe('any')

  // Okänd bucket: default-grenen i switchen får inte returnera true rakt av.
  const defaultGren = routingKalla.match(/default:\s*(?:\/\/[^\n]*\n\s*)*return ([^\n]+)/)
  expect(defaultGren, 'default-grenen måste gå att läsa').toBeTruthy()
  expect(defaultGren![1].trim(), 'okänd bucket får inte betyda "alla"').not.toBe('true')

  // project_team utan project_id får inte heller falla till alla.
  expect(routingKalla).not.toMatch(/if \(!projectId\) return true/)
})

test('lagrat routing_role=any behandlas som obeslutat och faller till tabellen', () => {
  // Kolumnens default är 'any'. Läses den före tabellen blir tabellen död kod.
  expect(routingKalla).toMatch(/lagrad !== 'any'/)
  expect(routingKalla, 'kolumnen får inte kortsluta tabellen med rå ||-läsning')
    .not.toMatch(/const bucket = \(approval\.routing_role as RoutingRole \| undefined\) \|\| getRoutingBucket/)
})

test('utgående meddelande utan projektförankring kräver ägare eller admin', () => {
  expect(routingKalla).toMatch(/approval_type === 'send_sms' \|\| approval\.approval_type === 'send_email'/)
  expect(routingKalla).toMatch(/if \(!projectId && !\(hasPermission\(currentUser, 'manage_users'\) \|\| isOwnerOrAdmin\(currentUser\)\)\) return false/)
})
