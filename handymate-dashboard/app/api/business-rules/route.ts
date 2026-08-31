import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'


/**
 * "Lär Handymate" — capture-halvan (Business Twin-backlog #12, 2026-08-13).
 * Byggd EFTER konsument-halvan (lib/ai-quote-generator.ts fetchBusinessRules)
 * med flit — se docs/strategy/BUSINESS_TWIN_IDEA_BACKLOG.md #12: en regel
 * utan en verklig läsare vore en input utan effekt.
 *
 * Owner/admin-gated: en sparad regel påverkar ALLA framtida offerter för
 * hela företaget, inte bara den som skriver den — samma känslighetsnivå
 * som andra business_config-liknande inställningar.
 */

const MAX_RULE_LENGTH = 300

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('business_knowledge')
    .select('id, observation, created_at')
    .eq('business_id', business.business_id)
    .eq('knowledge_type', 'business_rule')
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: data || [] })
}

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !isOwnerOrAdmin(currentUser)) {
    return NextResponse.json({ error: 'Endast ägare/admin kan lägga till affärsregler' }, { status: 403 })
  }

  const body = await request.json()
  const ruleText = typeof body.ruleText === 'string' ? body.ruleText.trim() : ''
  if (!ruleText) {
    return NextResponse.json({ error: 'Regeltext saknas' }, { status: 400 })
  }
  if (ruleText.length > MAX_RULE_LENGTH) {
    return NextResponse.json({ error: `Regeln är för lång (max ${MAX_RULE_LENGTH} tecken)` }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('business_knowledge')
    .insert({
      business_id: business.business_id,
      agent_id: 'matte',
      knowledge_type: 'business_rule',
      // Ingen AI-titelgenerering i denna omgång (medvetet minimalt) —
      // ägarens egen text ÄR titeln, avkortad för listvyer.
      title: ruleText.length > 60 ? `${ruleText.slice(0, 57)}...` : ruleText,
      observation: ruleText,
      confidence: 1,
      status: 'active',
    })
    .select('id, observation, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}

export async function DELETE(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !isOwnerOrAdmin(currentUser)) {
    return NextResponse.json({ error: 'Endast ägare/admin kan ta bort affärsregler' }, { status: 403 })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id saknas' }, { status: 400 })

  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('business_knowledge')
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: currentUser.id })
    .eq('id', id)
    .eq('business_id', business.business_id)
    .eq('knowledge_type', 'business_rule')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
