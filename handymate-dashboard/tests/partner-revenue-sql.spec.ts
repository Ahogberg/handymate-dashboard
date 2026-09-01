import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..')
const sql = fs.readFileSync(path.join(root, 'sql/v193_partner_revenue_and_self_billing.sql'), 'utf8')
const commission = fs.readFileSync(path.join(root, 'lib/partners/commission.ts'), 'utf8')

function bodyOf(functionName: string): string {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`))
  expect(match, `${functionName} ska finnas i v191`).not.toBeNull()
  return match![0]
}

test.describe('v191 — Partner Revenue Reality', () => {
  test('liggaren är append-only och idempotent per source_key', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS partner_commission_ledger_partner_id_business_id_period_key')
    expect(sql).toContain('partner_commission_ledger_source_key_unique')
    expect(sql).toMatch(/ON public\.partner_commission_ledger \(partner_id, source_key\)/)
    expect(commission).toContain('entry_kind: adjustment.entryKind')
    expect(commission).toContain('adjustmentSourceKey')
    expect(commission).not.toContain("onConflict: 'partner_id,business_id,period'")
  })

  test('flera frysta rättelseunderlag får skapas för samma period', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS partner_payout_batch_partner_id_period_key')
    expect(sql).toContain('partner_payout_batch_invoice_number_unique')
  })

  test('batchen skapar nummer, snapshot och liggarlänk i samma RPC', () => {
    const body = bodyOf('create_partner_self_billing_batch')
    expect(body).toContain('partner_self_billing_sequence')
    expect(body).toContain('document_snapshot')
    expect(body).toContain("'SJÄLVFAKTURERING'")
    expect(body).toContain('UPDATE public.partner_commission_ledger')
    expect(body).toContain('payout_batch_id = v_batch_id')
    expect(body.indexOf('INSERT INTO public.partner_payout_batch')).toBeLessThan(body.indexOf('UPDATE public.partner_commission_ledger'))
  })

  test('ofullständig juridisk identitet stoppar självfakturan', () => {
    const body = bodyOf('create_partner_self_billing_batch')
    expect(body).toContain('self_billing_legal_name')
    expect(body).toContain('self_billing_org_number')
    expect(body).toContain('self_billing_registered_address')
    expect(body).toContain('self_billing_vat_registered')
    expect(body).toContain('payout_reference')
    expect(body).toContain('Handymates faktureringsidentitet är ofullständig')
  })

  test('partnergranskning verifierar batchägarskap och kräver skäl vid tvist', () => {
    const body = bodyOf('review_partner_self_billing_batch')
    expect(body).toContain('WHERE id = p_batch_id AND partner_id = p_partner_id')
    expect(body).toContain("p_decision = 'disputed'")
    expect(body).toContain('Anledning krävs vid bestridande')
  })

  test('betalning uppdaterar batch, liggare och cache atomiskt efter granskning', () => {
    const body = bodyOf('mark_partner_self_billing_paid')
    expect(body).toContain("review_status = 'disputed'")
    expect(body).toContain("review_status = 'deemed_approved'")
    expect(body).toContain("SET status = 'paid', paid_at = v_now")
    expect(body).toContain('total_pending_sek')
    expect(body).toContain('total_earned_sek')
  })

  test('alla ekonomiska RPC:er är endast körbara av service_role', () => {
    for (const signature of [
      'record_partner_commission_rows(UUID, TEXT, JSONB)',
      'create_partner_self_billing_batch(UUID, TEXT, JSONB, TEXT)',
      'review_partner_self_billing_batch(UUID, UUID, TEXT, TEXT)',
      'mark_partner_self_billing_paid(UUID, TEXT)',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`)
    }
  })
})
