import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dealId = request.nextUrl.searchParams.get('dealId')
  if (!dealId) {
    return NextResponse.json({ error: 'dealId required' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('deal_note')
    .select('*')
    .eq('deal_id', dealId)
    .eq('business_id', auth.business_id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ notes: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  if (!body.dealId || !body.content?.trim()) {
    return NextResponse.json({ error: 'dealId and content required' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('deal_note')
    .insert({
      business_id: auth.business_id,
      deal_id: body.dealId,
      content: body.content.trim(),
      created_by: (await getCurrentUser(request))?.name || auth.user_id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ note: data })
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  if (!body.noteId || !body.content?.trim()) {
    return NextResponse.json({ error: 'noteId and content required' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('deal_note')
    .update({
      content: body.content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.noteId)
    .eq('business_id', auth.business_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ note: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const noteId = request.nextUrl.searchParams.get('noteId')
  if (!noteId) {
    return NextResponse.json({ error: 'noteId required' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('deal_note')
    .delete()
    .eq('id', noteId)
    .eq('business_id', auth.business_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
