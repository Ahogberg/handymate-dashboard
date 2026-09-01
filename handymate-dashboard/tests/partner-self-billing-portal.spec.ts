/**
 * Facit: partnerns självfaktureringsyta (fakturauppgifter + granskning av
 * frysta självfakturor). Bygger ovanpå v191:s RPC:er och den atomiska
 * provisionskedjan (se tests/partner-revenue-sql.spec.ts).
 *
 *   npx playwright test tests/partner-self-billing-portal.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const billingProfileRoute = read('app/api/partners/billing-profile/route.ts')
const selfBillingRoute = read('app/api/partners/self-billing/[id]/route.ts')
const dashboardRoute = read('app/api/partners/dashboard/route.ts')
const commission = read('lib/partners/commission.ts')
const selfBillingLib = read('lib/partners/self-billing.ts')
const page = read('app/partners/dashboard/page.tsx')
const billingProfileCard = read('app/partners/dashboard/components/BillingProfileCard.tsx')
const selfBillingSection = read('app/partners/dashboard/components/SelfBillingSection.tsx')
const dashboardTypes = read('app/partners/dashboard/components/types.ts')
const adminCommissionRoute = read('app/api/admin/partners/commission/route.ts')
const adminCommissionModal = read('app/admin/components/PartnerCommissionModal.tsx')
const v194 = read('sql/v194_partner_payout_reference.sql')

test.describe('varje läsning filtreras på partnerns egna JWT-id', () => {
  test('fakturauppgifts-rutten autentiserar och läser/skriver bara den egna partner-raden', () => {
    expect(billingProfileRoute).toContain('getPartnerTokenFromRequest')
    expect(billingProfileRoute).toContain('getPartnerFromToken')
    expect(billingProfileRoute).toContain("if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })")
    // GET och PUT ska båda filtrera på partner.id — aldrig ett fritt id från klienten.
    const getBlock = billingProfileRoute.slice(billingProfileRoute.indexOf('export async function GET'), billingProfileRoute.indexOf('export async function PUT'))
    const putBlock = billingProfileRoute.slice(billingProfileRoute.indexOf('export async function PUT'))
    expect(getBlock).toContain(".eq('id', partner.id)")
    expect(putBlock).toContain(".eq('id', partner.id)")
  })

  test('självfaktura-rutten hämtar batchen filtrerad på partner_id — en främmande batch kan aldrig läsas', () => {
    expect(selfBillingRoute).toContain('getPartnerTokenFromRequest')
    expect(selfBillingRoute).toContain('getPartnerFromToken')
    expect(selfBillingRoute).toContain(".eq('id', id)")
    expect(selfBillingRoute).toContain(".eq('partner_id', partner.id)")
    // Granskningen skickar partnerns id till RPC:n, som i sin tur verifierar
    // ägarskapet igen server-side (se review_partner_self_billing_batch i v191).
    expect(selfBillingRoute).toContain("rpc('review_partner_self_billing_batch'")
    expect(selfBillingRoute).toContain('p_partner_id: partner.id')
  })

  test('dashboard-rutten skickar bara den inloggade partnerns batchar och profil', () => {
    expect(dashboardRoute).toContain("supabase.from('partner_payout_batch')")
    expect(dashboardRoute).toContain(".eq('partner_id', partner.id)")
    expect(dashboardRoute).toContain('billing_profile')
    expect(dashboardRoute).toContain('billing_profile_complete')
    expect(dashboardRoute).toContain('self_billing_batches')
  })
})

test.describe('PDF:en är alltid det frysta ögonblicket, aldrig en liverendering', () => {
  test('PDF-vägen kräver ett fryst document_snapshot och renderar bara det', () => {
    const pdfBranch = selfBillingRoute.slice(selfBillingRoute.indexOf("format') === 'pdf'"))
    expect(pdfBranch).toContain('document_snapshot')
    expect(pdfBranch).toContain('generateSelfBillingPdf(data.document_snapshot')
    // Ingen ny DB-fråga eller liveuppslag i PDF-grenen — bara det redan hämtade batch-objektet.
    expect(pdfBranch.slice(0, pdfBranch.indexOf('return new NextResponse'))).not.toContain('.select(')
  })

  test('PDF-generatorn tar emot ett komplett fryst dokument, inte råa liggarrader', () => {
    expect(selfBillingLib).toContain('export function generateSelfBillingPdf(document: SelfBillingDocument)')
    expect(selfBillingLib).toContain('Denna faktura har utfärdats av Handymate för partnerns räkning')
  })
})

test.describe('validering innan ett ofullständigt underlag kan sparas', () => {
  test('juridiskt namn, org.nr, adress och giltig e-post krävs', () => {
    expect(billingProfileRoute).toContain("Juridiskt namn, organisationsnummer och adress krävs")
    expect(billingProfileRoute).toMatch(/\/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\//)
  })

  test('momsregistrerad partner måste ange momsnummer och giltig momssats', () => {
    expect(billingProfileRoute).toContain('Momsnummer och giltig momssats krävs för momsregistrerad partner')
  })

  test('minst en betalningsuppgift (bankgiro/plusgiro/konto) krävs', () => {
    expect(billingProfileRoute).toContain('Minst en betalningsuppgift krävs')
  })

  test('ett bestridande kräver alltid en anledning', () => {
    expect(selfBillingRoute).toContain("decision === 'disputed' && !reason")
    expect(selfBillingSection).toContain('disabled={!reason.trim()')
  })
})

test.describe('batchskapandet vägrar tills partnerns uppgifter är kompletta', () => {
  test('createPayoutBatch hämtar Handymates köparidentitet från env och skickar den till RPC:n', () => {
    expect(commission).toContain('getHandymateBillingIdentityFromEnv()')
    expect(commission).toContain("rpc('create_partner_self_billing_batch'")
    expect(commission).toContain('p_buyer: buyer')
  })

  test('ett saknat env-värde ger ett fel istället för en gissad köparidentitet', () => {
    expect(selfBillingLib).toContain("throw new Error(`${label} saknas för självfakturering`)")
  })
})

test.describe('ytan är monterad i partnerdashboarden', () => {
  test('BillingProfileCard och SelfBillingSection renderas på dashboarden', () => {
    expect(page).toContain('<BillingProfileCard')
    expect(page).toContain('<SelfBillingSection')
    expect(page).toContain('profile={partner.billing_profile}')
  })

  test('nedladdningslänken pekar på den partner-scopade PDF-rutten', () => {
    expect(selfBillingSection).toContain('/api/partners/self-billing/${batch.id}?format=pdf')
  })

  test('BillingProfileCard sparar via PUT mot samma rutt facitet testar ovan', () => {
    expect(billingProfileCard).toContain("fetch('/api/partners/billing-profile'")
    expect(billingProfileCard).toContain("method: 'PUT'")
  })
})

test.describe('betalningsreferens krävs vid "markera betald" (v194, 2026-09-02)', () => {
  test('RPC:n avvisar tom eller whitespace-referens innan något skrivs', () => {
    const fn = v194.slice(v194.indexOf('CREATE OR REPLACE FUNCTION public.mark_partner_self_billing_paid'))
    const guardIdx = fn.indexOf("COALESCE(BTRIM(p_payment_reference), '') = ''")
    const updateIdx = fn.indexOf('SET status = \'paid\'')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(updateIdx)
    expect(fn).toContain("RAISE EXCEPTION 'Betalningsreferens krävs'")
  })

  test('funktionens gamla tvåparameter-signatur droppas explicit — CREATE OR REPLACE byter inte signatur', () => {
    expect(v194).toContain('DROP FUNCTION IF EXISTS public.mark_partner_self_billing_paid(UUID, TEXT)')
    expect(v194).toContain('p_payment_reference TEXT,')
    expect(v194).toContain('p_paid_at TIMESTAMPTZ DEFAULT NULL')
  })

  test('grants pekar på den nya fyra-parameter-signaturen, service_role-only', () => {
    expect(v194).toContain('mark_partner_self_billing_paid(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated')
    expect(v194).toContain('mark_partner_self_billing_paid(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role')
  })

  test('markBatchPaid skickar referens och valfritt betaldatum vidare till RPC:n', () => {
    const fn = commission.slice(commission.indexOf('export async function markBatchPaid'))
    expect(fn).toContain('paymentReference: string,')
    expect(fn).toContain('p_payment_reference: paymentReference')
    expect(fn).toContain('p_paid_at: paidAt || null')
  })

  test('admin-rutten kräver payment_reference (400 utan den) innan markBatchPaid anropas', () => {
    const branch = adminCommissionRoute.slice(adminCommissionRoute.indexOf("action === 'mark_paid'"))
    expect(branch).toContain("if (!paymentReference) return NextResponse.json({ error: 'Betalningsreferens krävs' }, { status: 400 })")
    expect(branch).toContain('markBatchPaid(batchId, adminCheck.email')
  })

  test('adminvyn kräver ifylld referens innan bekräfta-knappen går att klicka', () => {
    expect(adminCommissionModal).toContain('disabled={!paymentReference.trim() || busy !== null}')
    expect(adminCommissionModal).toContain("action: 'mark_paid', batch_id: batchId, payment_reference: paymentReference, paid_at: paidAtDate")
  })

  test('partnern ser sin egen betalningsreferens i portalen', () => {
    expect(selfBillingSection).toContain("batch.status === 'paid' && batch.payment_reference")
    expect(dashboardTypes).toContain('payment_reference: string | null')
  })

  test('dashboard-rutten hämtar payment_reference i samma select som övriga batchfält', () => {
    const selectLine = dashboardRoute.slice(dashboardRoute.indexOf("supabase.from('partner_payout_batch')"), dashboardRoute.indexOf("supabase.from('partner_payout_batch')") + 400)
    expect(selectLine).toContain('payment_reference')
  })
})
