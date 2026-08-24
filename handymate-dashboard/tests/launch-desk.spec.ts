import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { parseLaunchCsv, parseCsvRows } from '../lib/launch-desk/csv'
import { deriveFunnel } from '../lib/launch-desk/funnel'
import { normalizeAccountBatch, normalizeAccountInput } from '../lib/launch-desk/normalize'
import { canUseChannel, channelPolicy, recommendChannel } from '../lib/launch-desk/policy'
import { calculateFit, priorityScore } from '../lib/launch-desk/scoring'
import type { GtmStatus } from '../lib/launch-desk/types'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const BASE_INPUT = {
  company_name: 'Sundins Bygg AB',
  org_number: '556123-4567',
  legal_form: 'limited_company' as const,
  industry: 'Bygg och renovering',
  employee_band: '5-9',
  website: 'https://example.se',
  company_phone: '08-123 45 67',
  company_email: 'info@example.se',
  source_name: 'SCB Företagsregistret',
  source_url: 'https://www.scb.se/',
  source_checked_at: '2026-08-24',
  contact_basis: 'public_business_contact' as const,
  suggested_channel: 'email' as const,
}

test.describe('juridisk kanalgrind', () => {
  test('aktiebolag med professionell offentlig kontakt får riktad B2B-e-post', () => {
    const policy = channelPolicy({ legalForm: 'limited_company', contactBasis: 'public_business_contact' })
    expect(policy.allowed).toContain('email')
    expect(policy.needsManualReview).toBe(false)
  })

  test('enskild och okänd bolagsform failar stängt för kall e-post', () => {
    for (const legalForm of ['sole_trader', 'unknown'] as const) {
      const policy = channelPolicy({ legalForm, contactBasis: 'unknown' })
      expect(policy.allowed).not.toContain('email')
      expect(policy.allowed).toEqual([])
      expect(policy.needsManualReview).toBe(true)
      expect(recommendChannel({ legalForm, contactBasis: 'unknown', hasPhone: true, hasEmail: true, hasLinkedin: true })).toBe('none')
    }
  })

  test('varm eller inkommande kontakt hålls separat från kalla kontaktvägar', () => {
    const policy = channelPolicy({ legalForm: 'sole_trader', contactBasis: 'warm_intro' })
    expect(policy.allowed).toContain('warm_intro')
    expect(policy.allowed).toContain('email')
    expect(policy.needsManualReview).toBe(false)
  })

  test('spärren släcker alla kontaktkanaler', () => {
    expect(channelPolicy({ legalForm: 'limited_company', contactBasis: 'public_business_contact', suppressed: true }).allowed).toEqual([])
    expect(canUseChannel({ legal_form: 'limited_company', contact_basis: 'public_business_contact', status: 'suppressed' }, 'phone')).toBe(false)
  })
})

test.describe('källor, normalisering och prioritering', () => {
  test('import kräver källa och kontrolldatum', () => {
    expect(() => normalizeAccountInput({ ...BASE_INPUT, source_name: '' })).toThrow(/source_name/)
    expect(() => normalizeAccountInput({ ...BASE_INPUT, source_checked_at: '' })).toThrow(/source_checked_at/)
  })

  test('fel kanal stoppas innan databasinsert', () => {
    expect(() => normalizeAccountInput({
      ...BASE_INPUT,
      legal_form: 'sole_trader',
      contact_basis: 'unknown',
      suggested_channel: 'email',
    })).toThrow(/inte tillåten/)
  })

  test('importen har ett hårt tak på 500 rader', () => {
    expect(() => normalizeAccountBatch(Array.from({ length: 501 }, () => BASE_INPUT))).toThrow(/Högst 500/)
  })

  test('fit-poängen är deterministisk och bär begripliga skäl', () => {
    const result = calculateFit(BASE_INPUT)
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.reasons).toContain('Relevant hantverksbransch')
    expect(result.reasons).toContain('Officiell eller förstahandskälla')
  })

  test('förfallen uppföljning prioriteras, avslutat eller spärrat faller bort', () => {
    const due = priorityScore({ fitScore: 60, nextActionAt: '2026-08-23T10:00:00Z', status: 'ready', now: new Date('2026-08-24T10:00:00Z') })
    const later = priorityScore({ fitScore: 60, nextActionAt: '2026-08-25T10:00:00Z', status: 'ready', now: new Date('2026-08-24T10:00:00Z') })
    expect(due).toBeGreaterThan(later)
    expect(priorityScore({ fitScore: 100, status: 'suppressed' })).toBe(-1)
  })
})

test.describe('CSV och mättratt', () => {
  test('svensk semikolon-CSV och citerade avgränsare läses korrekt', () => {
    const rows = parseCsvRows('företag;faktanotering\r\nBygg AB;"Bygg, VVS och el"')
    expect(rows).toEqual([['företag', 'faktanotering'], ['Bygg AB', 'Bygg, VVS och el']])
  })

  test('svenska rubriker och värden översätts till kontraktet', () => {
    const csv = [
      'företag;organisationsnummer;bolagsform;bransch;anställda;källa;kontrolldatum;kontaktkälla;föreslagen_kanal',
      'Sundins Bygg AB;556123-4567;AB;Bygg;5-9;SCB Företagsregistret;2026-08-24;offentlig företagskontakt;e-post',
    ].join('\n')
    const [row] = parseLaunchCsv(csv)
    expect(row).toMatchObject({
      company_name: 'Sundins Bygg AB',
      legal_form: 'limited_company',
      contact_basis: 'public_business_contact',
      suggested_channel: 'email',
    })
  })

  test('mättratten håller stegen separata och räknar verklig status', () => {
    const statuses: GtmStatus[] = ['qualified', 'contacted', 'replied', 'meeting_booked', 'demo_booked', 'offer_sent', 'won', 'suppressed']
    const funnel = deriveFunnel(statuses.map((status, index) => ({
      status,
      next_action_at: index === 0 ? '2026-08-23T10:00:00Z' : null,
    })), new Date('2026-08-24T10:00:00Z'))
    expect(funnel).toMatchObject({ total: 8, ready: 1, due: 1, contacted: 6, replied: 5, meetings: 4, demos: 3, offers: 2, won: 1, suppressed: 1 })
  })
})

test.describe('arkitekturfacit', () => {
  const apiFiles = [
    'app/api/admin/launch/accounts/route.ts',
    'app/api/admin/launch/accounts/[id]/route.ts',
    'app/api/admin/launch/activity/route.ts',
    'app/api/admin/launch/suppress/route.ts',
    'app/api/admin/launch/brief/route.ts',
  ]

  test('alla rutter är superadmin-grindade och GET-rutter är dynamiska', () => {
    for (const file of apiFiles) expect(read(file), file).toContain('isAdmin(request)')
    for (const file of apiFiles.filter(file => read(file).includes('export async function GET'))) {
      expect(read(file), file).toContain("export const dynamic = 'force-dynamic'")
    }
  })

  test('Launch Desk kan inte skicka SMS, mejl, brev eller sociala meddelanden', () => {
    const roots = ['app/api/admin/launch', 'app/admin/launch', 'lib/launch-desk']
    const forbidden = ['sendSmsViaElks', 'sendLetter(', 'resend.emails.send', 'sendEmail(', 'api.46elks.com', 'linkedin.com/v2/']
    for (const root of roots) {
      const files: string[] = []
      const walk = (relative: string) => {
        for (const entry of fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true })) {
          const next = `${relative}/${entry.name}`
          if (entry.isDirectory()) walk(next)
          else if (/\.(ts|tsx)$/.test(entry.name)) files.push(next)
        }
      }
      walk(root)
      for (const file of files) {
        for (const needle of forbidden) expect(read(file), `${file} innehåller ${needle}`).not.toContain(needle)
      }
    }
  })

  test('kundernas leadlager återanvänds aldrig', () => {
    const combined = apiFiles.concat([
      'app/admin/launch/page.tsx',
      'lib/launch-desk/brief.ts',
      'lib/launch-desk/policy.ts',
      'sql/v166_launch_desk.sql',
    ]).map(read).join('\n')
    expect(combined).not.toContain("from('leads_outbound')")
    expect(combined).not.toContain("from('leads')")
  })

  test('tabellerna är service-role-only och spärren är atomisk', () => {
    const sql = read('sql/v166_launch_desk.sql')
    for (const table of ['gtm_account', 'gtm_activity', 'gtm_suppression']) {
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`)
      expect(sql).toContain(`GRANT ALL ON TABLE public.${table} TO service_role`)
    }
    const suppressFunction = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.suppress_gtm_account'))
    expect(suppressFunction).toContain("SET status = 'suppressed'")
    expect(suppressFunction).toContain('INSERT INTO public.gtm_suppression')
    expect(suppressFunction).toContain('INSERT INTO public.gtm_activity')
    expect(sql).toContain('cold contact requires classified limited company')
  })

  test('varje prospekt har ändamål, rättslig grund och datagranskningsdatum', () => {
    const sql = read('sql/v166_launch_desk.sql')
    const route = read('app/api/admin/launch/accounts/route.ts')
    expect(sql).toContain("processing_purpose TEXT NOT NULL DEFAULT 'handymate_b2b_launch'")
    expect(sql).toContain('lawful_basis TEXT NOT NULL')
    expect(sql).toContain('retention_review_at TIMESTAMPTZ NOT NULL')
    expect(route).toContain('180 * 24 * 60 * 60 * 1000')
  })

  test('AI-briefen använder källdatasnapshot och förbjuder osourcade fakta', () => {
    const brief = read('lib/launch-desk/brief.ts')
    expect(brief).toContain('buildBriefSourceSnapshot')
    expect(brief).toContain('Använd endast fakta som uttryckligen finns i JSON-datan')
    expect(brief).toContain('Relevans ska märkas som en hypotes eller fråga')
    expect(brief).toContain('brief_generated_by')
    expect(brief).toContain('ensureEmailOptOut')
    expect(brief).toContain('Om du inte vill ha fler meddelanden från oss')
  })

  test('kontaktutfall skrivs via den atomiska RPC:n, inte två lösa writes', () => {
    const activity = read('app/api/admin/launch/activity/route.ts')
    expect(activity).toContain(".rpc('record_gtm_activity'")
    expect(activity).not.toContain("from('gtm_activity').insert")
  })

  test('adminytan säger uttryckligen att ingen autosändning sker', () => {
    const ui = read('app/admin/launch/page.tsx')
    expect(ui).toContain('Inga automatiska utskick')
    expect(ui).toContain('Människan granskar och kontaktar')
    expect(ui).toContain('Spara kontaktunderlag')
    expect(ui).toContain('Kontaktgrund')
    expect(read('app/admin/page.tsx')).toContain('/admin/launch')
  })

  test('CSV-mallen innehåller obligatorisk proveniens', () => {
    const template = read('public/templates/handymate-launch-desk-import.csv')
    expect(template).toContain('source_name')
    expect(template).toContain('source_checked_at')
    expect(template).toContain('contact_basis')
  })
})
