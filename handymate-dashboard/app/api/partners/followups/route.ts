import { NextRequest, NextResponse } from 'next/server'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * Partneruppföljningar 1/2/3 per kund (partnerprogram v2, 2026-08-11).
 *
 * POST   { business_id, followup_nr (1|2|3), note? }  → logga/uppdatera
 * DELETE { business_id, followup_nr }                 → ångra
 *
 * Ägarskap valideras alltid mot referrals (partner_id + referred_business_id)
 * — en partner kan bara röra sina egna kunders uppföljningar.
 */

async function requirePartner(request: NextRequest) {
  const token = getPartnerTokenFromRequest(request)
  if (!token) return null
  return getPartnerFromToken(token)
}

async function ownsBusiness(partnerId: string, businessId: string): Promise<boolean> {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('referrals')
    .select('id')
    .eq('partner_id', partnerId)
    .eq('referred_business_id', businessId)
    .limit(1)
  return Boolean(data && data.length > 0)
}

export async function POST(request: NextRequest) {
  const partner = await requirePartner(request)
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const businessId = typeof body?.business_id === 'string' ? body.business_id : null
  const followupNr = Number(body?.followup_nr)
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  if (!businessId || ![1, 2, 3].includes(followupNr)) {
    return NextResponse.json({ error: 'Ogiltig förfrågan' }, { status: 400 })
  }
  if (!(await ownsBusiness(partner.id, businessId))) {
    return NextResponse.json({ error: 'Kunden tillhör inte dig' }, { status: 403 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('partner_followups')
    .upsert(
      {
        partner_id: partner.id,
        business_id: businessId,
        followup_nr: followupNr,
        done_at: new Date().toISOString(),
        note,
      },
      { onConflict: 'partner_id,business_id,followup_nr' },
    )
    .select('followup_nr, done_at, note')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, followup: data })
}

export async function DELETE(request: NextRequest) {
  const partner = await requirePartner(request)
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const businessId = typeof body?.business_id === 'string' ? body.business_id : null
  const followupNr = Number(body?.followup_nr)

  if (!businessId || ![1, 2, 3].includes(followupNr)) {
    return NextResponse.json({ error: 'Ogiltig förfrågan' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('partner_followups')
    .delete()
    .eq('partner_id', partner.id)
    .eq('business_id', businessId)
    .eq('followup_nr', followupNr)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
