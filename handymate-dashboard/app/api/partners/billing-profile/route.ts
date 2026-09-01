import { NextRequest, NextResponse } from 'next/server'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const PROFILE_COLUMNS = [
  'self_billing_legal_name',
  'self_billing_org_number',
  'self_billing_registered_address',
  'self_billing_vat_number',
  'self_billing_vat_registered',
  'self_billing_vat_rate',
  'self_billing_f_tax_approved',
  'self_billing_email',
  'payout_bankgiro',
  'payout_plusgiro',
  'payout_account',
].join(', ')

async function authenticate(request: NextRequest) {
  const token = getPartnerTokenFromRequest(request)
  return token ? getPartnerFromToken(token) : null
}

function text(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function profileComplete(profile: Record<string, unknown> | null | undefined): boolean {
  if (!profile) return false
  const payout = profile.payout_bankgiro || profile.payout_plusgiro || profile.payout_account
  const vatOk = profile.self_billing_vat_registered === false
    || Boolean(profile.self_billing_vat_number)
  return Boolean(
    profile.self_billing_legal_name
    && profile.self_billing_org_number
    && profile.self_billing_registered_address
    && profile.self_billing_email
    && typeof profile.self_billing_vat_registered === 'boolean'
    && typeof profile.self_billing_f_tax_approved === 'boolean'
    && profile.self_billing_vat_rate !== null
    && payout
    && vatOk
  )
}

export async function GET(request: NextRequest) {
  const partner = await authenticate(request)
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await getServerSupabase()
    .from('partners')
    .select(PROFILE_COLUMNS)
    .eq('id', partner.id)
    .single()
  if (error) return NextResponse.json({ error: 'Kunde inte läsa fakturauppgifterna' }, { status: 500 })
  return NextResponse.json({ profile: data, complete: profileComplete(data as unknown as Record<string, unknown>) })
}

export async function PUT(request: NextRequest) {
  const partner = await authenticate(request)
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ogiltigt underlag' }, { status: 400 })

  const vatRegistered = body.vat_registered
  const fTaxApproved = body.f_tax_approved
  const vatRate = Number(body.vat_rate)
  const email = text(body.email, 254)
  const update = {
    self_billing_legal_name: text(body.legal_name),
    self_billing_org_number: text(body.organization_number, 40),
    self_billing_registered_address: text(body.registered_address, 500),
    self_billing_vat_number: vatRegistered === true ? text(body.vat_number, 40) : null,
    self_billing_vat_registered: vatRegistered,
    self_billing_vat_rate: vatRegistered === true ? vatRate : 0,
    self_billing_f_tax_approved: fTaxApproved,
    self_billing_email: email,
    payout_bankgiro: text(body.bankgiro, 40),
    payout_plusgiro: text(body.plusgiro, 40),
    payout_account: text(body.account, 100),
  }

  if (!update.self_billing_legal_name || !update.self_billing_org_number || !update.self_billing_registered_address) {
    return NextResponse.json({ error: 'Juridiskt namn, organisationsnummer och adress krävs' }, { status: 400 })
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'En giltig faktura-e-post krävs' }, { status: 400 })
  }
  if (typeof vatRegistered !== 'boolean' || typeof fTaxApproved !== 'boolean') {
    return NextResponse.json({ error: 'Momsregistrering och F-skatt måste anges' }, { status: 400 })
  }
  if (vatRegistered && (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1 || !update.self_billing_vat_number)) {
    return NextResponse.json({ error: 'Momsnummer och giltig momssats krävs för momsregistrerad partner' }, { status: 400 })
  }
  if (!update.payout_bankgiro && !update.payout_plusgiro && !update.payout_account) {
    return NextResponse.json({ error: 'Minst en betalningsuppgift krävs' }, { status: 400 })
  }

  const { data, error } = await getServerSupabase()
    .from('partners')
    .update(update)
    .eq('id', partner.id)
    .select(PROFILE_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: 'Kunde inte spara fakturauppgifterna' }, { status: 500 })
  return NextResponse.json({ success: true, profile: data, complete: profileComplete(data as unknown as Record<string, unknown>) })
}
