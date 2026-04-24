import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/agent/memories?agent_id=matte
 * Lista alla minnen för en specifik agent, sorterade på viktighet.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const agentId = request.nextUrl.searchParams.get('agent_id')
  if (!agentId) {
    return NextResponse.json({ error: 'agent_id krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('agent_memories')
    .select('id, memory_type, content, importance_score, created_at, last_accessed_at, access_count')
    .eq('business_id', business.business_id)
    .eq('agent_id', agentId.toLowerCase())
    .order('importance_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ memories: data || [] })
}
