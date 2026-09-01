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
