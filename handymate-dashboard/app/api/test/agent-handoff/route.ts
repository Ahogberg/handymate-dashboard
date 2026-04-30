import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { AGENT_CAPABILITIES, isValidAgentId } from '@/lib/agent/capabilities'
import {
  getOrCreateThread,
  executeHandoff,
  buildHandoffAnnouncement,
  MAX_HANDOFFS_PER_THREAD,
  type AgentThread,
} from '@/lib/agent/handoff'

/**
 * GET /api/test/agent-handoff
 *
 * Dev-endpoint som verifierar handoff-mekaniken end-to-end utan att
 * faktiskt anropa Claude. Vi testar:
 *   1. agent_thread skapas / återanvänds
 *   2. executeHandoff() validerar capabilities-regler
 *   3. agent_handoffs får en audit-rad per godkänd handoff
 *   4. agent_threads.current_agent_id + handoff_count uppdateras
 *   5. Max-loop refuserar handoff #4
 *   6. canHandoff()-regler vägrar olovliga targets (t.ex. self-handoff)
 *
 * Anropar INTE Claude — det är ett rent integrations-test mot tabellerna.
 *
 * Använd ?customerId=cust_xxx för att binda mot en specifik kund (annars
 * skapas en wegwerp-tråd utan customer-koppling).
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const customerId = request.nextUrl.searchParams.get('customerId') || `test_handoff_${Date.now()}`
  const supabase = getServerSupabase()

  const steps: Array<{
    step: string
    ok: boolean
    detail?: string
    data?: unknown
  }> = []

  // 1. Skapa/hämta tråd
  let thread: AgentThread
  try {
    thread = await getOrCreateThread({ businessId: business.business_id, customerId })
    steps.push({
      step: '1. getOrCreateThread',
      ok: true,
      detail: `thread.id=${thread.id}, current=${thread.current_agent_id}, handoff_count=${thread.handoff_count}`,
    })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      failed_at: 'getOrCreateThread',
      error: err?.message,
    }, { status: 500 })
  }

  // 2. Lars → Karin (giltig per capabilities)
  // Hjärtat i scenariot: "Vad kostar tilläggsarbetet?" — Lars äger projekt
  // men pris-frågor lämnas till Karin.
  const beforeAgent = thread.current_agent_id
  thread.current_agent_id = 'lars' // simulera att vi just var hos Lars
  await supabase.from('agent_threads').update({ current_agent_id: 'lars' }).eq('id', thread.id)

  const r1 = await executeHandoff({
    thread,
    fromAgent: 'lars',
    toAgent: 'karin',
    reason: 'pris-detaljer ligger i Karins område',
    contextSummary: 'Kunden frågar om tilläggsarbetet ovan badrumsrenoveringen — Lars vet inte exakta priser.',
  })
  steps.push({
    step: '2. handoff Lars → Karin (giltig)',
    ok: r1.ok && r1.current_agent === 'karin',
    detail: r1.ok ? `current_agent=${r1.current_agent}` : `refused: ${r1.refused_reason}`,
  })

  // 3. Verifiera att tråden uppdaterats
  const { data: t2 } = await supabase
    .from('agent_threads').select('*').eq('id', thread.id).single()
  steps.push({
    step: '3. thread current_agent_id uppdaterad',
    ok: t2?.current_agent_id === 'karin' && (t2?.handoff_count || 0) >= 1,
    detail: `current_agent_id=${t2?.current_agent_id}, handoff_count=${t2?.handoff_count}`,
  })

  // 4. Verifiera att audit-raden i agent_handoffs finns
  const { data: handoffRows } = await supabase
    .from('agent_handoffs')
    .select('from_agent, to_agent, reason, context_summary')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: false })
  steps.push({
    step: '4. agent_handoffs audit-rad',
    ok: !!handoffRows && handoffRows.length >= 1 && handoffRows[0].to_agent === 'karin',
    data: handoffRows,
  })

  // 5. Self-handoff vägras
  if (t2) {
    const r2 = await executeHandoff({
      thread: t2 as AgentThread,
      fromAgent: 'karin',
      toAgent: 'karin',
      reason: 'test',
    })
    steps.push({
      step: '5. self-handoff (Karin → Karin) vägras',
      ok: !r2.ok && r2.refused_reason === 'self_handoff',
      detail: `refused: ${r2.refused_reason}`,
    })
  }

  // 6. Ogiltig target vägras
  if (t2) {
    const r3 = await executeHandoff({
      thread: t2 as AgentThread,
      fromAgent: 'karin',
      toAgent: 'inte-en-agent' as any,
      reason: 'test',
    })
    steps.push({
      step: '6. ogiltig target vägras',
      ok: !r3.ok && r3.refused_reason === 'invalid_target',
      detail: `refused: ${r3.refused_reason}`,
    })
  }

  // 7. Max-loop test — bumpa handoff_count till MAX och försök en till
  await supabase
    .from('agent_threads')
    .update({ handoff_count: MAX_HANDOFFS_PER_THREAD })
    .eq('id', thread.id)
  const { data: tMax } = await supabase
    .from('agent_threads').select('*').eq('id', thread.id).single()
  if (tMax) {
    const r4 = await executeHandoff({
      thread: tMax as AgentThread,
      fromAgent: 'karin',
      toAgent: 'lars',
      reason: 'test max-loop',
    })
    steps.push({
      step: `7. max-loop refuserar handoff #${MAX_HANDOFFS_PER_THREAD + 1}`,
      ok: !r4.ok && r4.refused_reason === 'max_handoffs_reached',
      detail: `refused: ${r4.refused_reason}`,
    })
  }

  // 8. Announcement-text byggs korrekt
  const announcement = buildHandoffAnnouncement('lars', 'karin', 'pris-detaljer')
  steps.push({
    step: '8. buildHandoffAnnouncement returnerar text med Karin-namn',
    ok: announcement.includes('Karin'),
    detail: announcement,
  })

  // 9. capabilities lookup
  steps.push({
    step: '9. AGENT_CAPABILITIES innehåller alla 6 agenter',
    ok: ['matte', 'lars', 'karin', 'daniel', 'hanna', 'lisa'].every(a =>
      isValidAgentId(a) && AGENT_CAPABILITIES[a as keyof typeof AGENT_CAPABILITIES]
    ),
  })

  const allOk = steps.every(s => s.ok)

  return NextResponse.json({
    ok: allOk,
    thread_id: thread.id,
    customer_id: customerId,
    summary: `${steps.filter(s => s.ok).length}/${steps.length} steg passerade`,
    steps,
    note: 'Detta test rör inte Claude — det verifierar bara handoff-tabellerna och capabilities-reglerna. För full chat-test, anropa /api/matte/chat med customerId i context.',
  })
}
