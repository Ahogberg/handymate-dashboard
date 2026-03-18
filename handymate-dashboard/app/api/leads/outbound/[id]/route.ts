import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/** PATCH — Uppdatera lead (redigera brev, godkänn, markera konverterad) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const supabase = getServerSupabase()

  const updates: Record<string, unknown> = {}
  if (body.letter_content !== undefined) {
    updates.letter_content = body.letter_content
    updates.letter_edited = true
  }
  if (body.status !== undefined) updates.status = body.status
  if (body.converted !== undefined) updates.converted = body.converted

  const { data, error } = await supabase
    .from('leads_outbound')
    .update(updates)
    .eq('id', id)
    .eq('business_id', business.business_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}

/** DELETE — Ta bort utkast */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getServerSupabase()

  const { error } = await supabase
    .from('leads_outbound')
    .delete()
    .eq('id', id)
    .eq('business_id', business.business_id)
    .eq('status', 'draft')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
