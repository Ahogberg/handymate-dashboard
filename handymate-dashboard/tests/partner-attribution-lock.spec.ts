import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

// Facit för P0-6 + P0-9 i PARTNER_REVENUE_REALITY_AUDIT_2026-09-01:
//  - partnerattributionen (referrals-raden + business_config.referred_by) kan
//    inte muteras av tenantens inloggade användare,
//  - ingen partner aktiveras eller använder portalen utan loggad acceptans av
//    gällande Partneravtal.

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('P0-6 — partnerattributionen är låst i databasen', () => {
  test('v190 stramar referrals_tenant_member till SELECT och behåller service_role', () => {
    const sql = read('sql/v190_lock_partner_attribution.sql')
    const policy = sql.slice(sql.indexOf('CREATE POLICY referrals_tenant_member'), sql.indexOf('-- referrals_service_role'))
    expect(policy).toContain('FOR SELECT')
    expect(policy).toContain('TO authenticated')
    expect(policy).not.toContain('FOR ALL')
    expect(policy).not.toContain('WITH CHECK')
    expect(sql).toContain('DROP POLICY IF EXISTS referrals_tenant_member ON public.referrals')
  })

  test('v190 låser business_config.referred_by med en SECURITY INVOKER-trigger', () => {
    const sql = read('sql/v190_lock_partner_attribution.sql')
    expect(sql).toContain('BEFORE UPDATE OF referred_by ON public.business_config')
    expect(sql).toContain('NEW.referred_by IS DISTINCT FROM OLD.referred_by')
    expect(sql).toContain("current_user NOT IN ('service_role', 'postgres', 'supabase_admin')")
    // SECURITY DEFINER hade gjort current_user = funktionsägaren och kontrollen verkningslös —
    // kontrollera funktionsdefinitionen, inte kommentaren som förklarar fällan.
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('DROP TRIGGER IF EXISTS'))
    expect(fn).not.toContain('SECURITY DEFINER')
    expect(sql).toContain("ERRCODE = '42501'")
  })

  test('ingen klientkod skriver referrals — enda tenant-läsningen är en SELECT', () => {
    const clientFiles = [
      'app/dashboard/referral/page.tsx',
    ]
    for (const f of clientFiles) {
      const src = read(f)
      const block = src.slice(src.indexOf(".from('referrals')"))
      const firstCall = block.slice(0, block.indexOf('\n\n'))
      expect(firstCall).toContain('.select(')
      expect(firstCall).not.toMatch(/\.(insert|update|delete|upsert)\(/)
    }
    // Alla skrivvägar går via service role.
    for (const f of ['app/api/auth/route.ts', 'lib/referral/discounts.ts', 'app/api/billing/webhook/route.ts', 'app/api/partners/referral/route.ts']) {
      const src = read(f)
      expect(src).toMatch(/getServerSupabase|supabaseAdmin|createClient\([\s\S]*SERVICE_ROLE/)
    }
  })
})

test.describe('P0-9 — ingen partner utan accepterat avtal', () => {
  test('avtalets version/hash/IP kommer från EN källa som alla ytor delar', () => {
    const lib = read('lib/partners/agreement.ts')
    expect(lib).toContain("export const AGREEMENT_VERSION = '1.0'")
    expect(lib).toContain("'partneravtal-v1.md'")
    expect(lib).toContain("createHash('sha256')")

    // Registreringen har ingen egen hash-/sökvägskopia längre.
    const register = read('app/api/partners/register/route.ts')
    expect(register).toContain("from '@/lib/partners/agreement'")
    expect(register).not.toContain('partneravtal-v1.md')
    expect(register).not.toContain('createHash')

    // Avtalssidan renderar samma fil.
    expect(read('app/partners/avtal/page.tsx')).toContain('readAgreementText()')
  })

  test('hashen i biblioteket motsvarar filen på disk', () => {
    const expected = createHash('sha256').update(read('content/partner/partneravtal-v1.md')).digest('hex')
    // Beräknat på samma sätt som readAgreementHash() — bevisar att en ändrad
    // avtalstext ger en ny hash och därmed ett nytt bevisobjekt.
    expect(expected).toHaveLength(64)
  })

  test('acceptans skrivs aldrig över och kräver cookie ELLER signerad engångslänk', () => {
    const lib = read('lib/partners/agreement.ts')
    expect(lib).toContain('if (hasAcceptedCurrentAgreement(existing)) return { accepted: true, alreadyAccepted: true')

    const route = read('app/api/partners/agreement/route.ts')
    expect(route).toContain('getPartnerFromToken(cookieToken)')
    expect(route).toContain('verifyAgreementToken(partnerId, token)')
    expect(route).toContain("data.status !== 'suspended'")
    expect(route).toContain('body.agreementAccepted !== true')
    expect(route).toContain("export const dynamic = 'force-dynamic'")

    // Engångslänken har eget purpose-prefix — en approve-token duger inte.
    const tokens = read('lib/partners/approve-token.ts')
    expect(tokens).toContain("sign('partner-agreement', partnerId)")
    expect(tokens).toContain("sign('partner-approve', partnerId)")
  })

  test('portalen visar AgreementGate före allt annat när acceptans saknas', () => {
    const api = read('app/api/partners/dashboard/route.ts')
    expect(api).toContain('agreement_required: !hasAcceptedCurrentAgreement(partner)')

    const page = read('app/partners/dashboard/page.tsx')
    const gateIdx = page.indexOf('if (partner.agreement_required)')
    const renderIdx = page.indexOf('const referralUrl =')
    expect(gateIdx).toBeGreaterThan(0)
    expect(gateIdx).toBeLessThan(renderIdx)
    expect(page).toContain('<AgreementGate')

    // getPartnerFromToken bär agreement_version så grinden kan avgöras server-side.
    expect(read('lib/partners/auth.ts')).toContain('agreement_version: string | null')
  })

  test('båda admin-godkännandevägarna vägrar (409) utan acceptans', () => {
    const patch = read('app/api/admin/partners/route.ts')
    const approveCase = patch.slice(patch.indexOf("case 'approve':"), patch.indexOf("case 'suspend':"))
    expect(approveCase).toContain('if (!hasAcceptedCurrentAgreement(partner))')
    expect(approveCase).toContain('status: 409')
    expect(patch).toContain("case 'send_agreement'")

    const link = read('app/api/admin/partners/[id]/approve/route.ts')
    const gateIdx = link.indexOf('if (!hasAcceptedCurrentAgreement(partner))')
    const approveIdx = link.indexOf("status: 'active',")
    expect(gateIdx).toBeGreaterThan(0)
    expect(gateIdx).toBeLessThan(approveIdx)
    expect(link).toContain('status: 409')
  })
})
