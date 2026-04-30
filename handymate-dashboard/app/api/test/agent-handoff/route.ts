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
import {
  saveThreadMessage,
  loadThreadMessages,
  toClaudeMessages,
  buildUserContentWithImages,
  scrubPII,
  estimateTokens,
} from '@/lib/agent/thread-messages'

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

  // ── Multi-turn-test (Sprint 2) ────────────────────────────────────────
  // Skapa en separat tråd för att inte krocka med max-loop-staten ovan
  const mtCustomerId = `${customerId}_multiturn`
  const mtThread = await getOrCreateThread({ businessId: business.business_id, customerId: mtCustomerId })

  // 10. Spara 3 meddelanden via saveThreadMessage
  await saveThreadMessage({
    threadId: mtThread.id,
    businessId: business.business_id,
    role: 'user',
    content: 'Vad kostade tilläggsarbetet?',
  })
  await saveThreadMessage({
    threadId: mtThread.id,
    businessId: business.business_id,
    role: 'assistant',
    agent: 'karin',
    content: 'Tilläggsarbetet kostade 4 200 kr inklusive moms.',
  })
  await saveThreadMessage({
    threadId: mtThread.id,
    businessId: business.business_id,
    role: 'user',
    content: 'Vad sa du om priset?',
  })
  steps.push({
    step: '10. saveThreadMessage skriver 3 rader (user/assistant/user)',
    ok: true,
    detail: 'PII-scrubbing och insert non-blocking',
  })

  // 11. Ladda historik och verifiera ordning + filter
  const loaded = await loadThreadMessages(mtThread.id, { limit: 20 })
  steps.push({
    step: '11. loadThreadMessages returnerar 3 rader kronologiskt',
    ok: loaded.length === 3
      && loaded[0].role === 'user'
      && loaded[1].role === 'assistant'
      && loaded[2].role === 'user',
    detail: `Hittade ${loaded.length} rader. Senaste: "${loaded[loaded.length - 1]?.content?.slice(0, 60) || ''}"`,
  })

  // 12. toClaudeMessages konverterar korrekt + skippar handoff-announcements
  await saveThreadMessage({
    threadId: mtThread.id,
    businessId: business.business_id,
    role: 'assistant',
    agent: 'lars',
    content: 'Jag lämnar över till Karin.',
    isHandoffAnnouncement: true,
  })
  const claudeMessages = toClaudeMessages(await loadThreadMessages(mtThread.id, { limit: 20 }))
  steps.push({
    step: '12. toClaudeMessages skippar handoff-announcements',
    ok: claudeMessages.length === 3 && claudeMessages.every(m => m.role === 'user' || m.role === 'assistant'),
    detail: `Claude messages: ${claudeMessages.length} (förväntat 3 utan announcement)`,
  })

  // 13. Multi-turn context bevaras: senaste user-meddelandet refererar
  // till priset från tidigare assistant-svar
  const lastUser = loaded.filter(m => m.role === 'user').pop()
  steps.push({
    step: '13. Senaste user-meddelandet refererar till tidigare kontext',
    ok: lastUser?.content?.toLowerCase().includes('priset') === true,
    detail: `Senaste user-msg: "${lastUser?.content || ''}"`,
  })

  // 14. PII-scrubbing maskar personnummer + bankgiro
  const scrubbed = scrubPII('Min kund 19850315-1234 har bankgiro 5050-1055 och konto 1234567890123.')
  steps.push({
    step: '14. scrubPII maskar personnummer + kontonummer',
    ok: scrubbed.includes('[personnummer]')
      && (scrubbed.includes('[bankgiro]') || scrubbed.includes('[kontonummer]')),
    detail: scrubbed,
  })

  // 15. estimateTokens ger rimliga värden
  const tokens = estimateTokens(loaded.map(r => ({ content: r.content })))
  steps.push({
    step: '15. estimateTokens > 0 för tre meddelanden',
    ok: tokens > 0 && tokens < 1000,
    detail: `~${tokens} tokens`,
  })

  // Cleanup multi-turn-tråden
  try {
    await supabase.from('thread_message').delete().eq('thread_id', mtThread.id)
    await supabase.from('agent_threads').delete().eq('id', mtThread.id)
  } catch { /* non-blocking */ }

  // ── Bild-stöd-test (Sprint 3) ─────────────────────────────────────────
  const imgCustomerId = `${customerId}_images`
  const imgThread = await getOrCreateThread({ businessId: business.business_id, customerId: imgCustomerId })

  // 16. saveThreadMessage med images-fält
  // 1×1 transparent PNG (mockad bild för test — Claude körs aldrig här)
  const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  await saveThreadMessage({
    threadId: imgThread.id,
    businessId: business.business_id,
    role: 'user',
    content: 'Vad kostar det här?',
    images: [
      { base64: tinyPngBase64, media_type: 'image/png', size_bytes: 67 },
      { url: 'https://example.test/photo.jpg', media_type: 'image/jpeg' },
    ],
  })
  steps.push({
    step: '16. saveThreadMessage skriver images-fält',
    ok: true,
    detail: 'PNG (base64) + URL — bägge format',
  })

  // 17. loadThreadMessages returnerar images
  const imgRows = await loadThreadMessages(imgThread.id, { limit: 5 })
  const firstWithImages = imgRows.find(r => Array.isArray(r.images) && r.images.length > 0)
  steps.push({
    step: '17. loadThreadMessages returnerar images-array',
    ok: !!firstWithImages && (firstWithImages.images?.length || 0) === 2,
    detail: `images-count på första raden: ${firstWithImages?.images?.length || 0}`,
  })

  // 18. toClaudeMessages bygger multimodal content med image-block
  const claudeMsgs = toClaudeMessages(imgRows)
  const firstClaude = claudeMsgs[0]
  const isMultimodal = firstClaude && Array.isArray(firstClaude.content)
    && firstClaude.content.some((b: any) => b.type === 'image')
    && firstClaude.content.some((b: any) => b.type === 'text')
  steps.push({
    step: '18. toClaudeMessages bygger image+text-content-blocks',
    ok: !!isMultimodal,
    detail: isMultimodal
      ? `${(firstClaude.content as any[]).length} blocks (image + text)`
      : `content är: ${typeof firstClaude?.content}`,
  })

  // 19. buildUserContentWithImages utan images returnerar bara strängen
  const stringOnly = buildUserContentWithImages('Vad kostar det?', [])
  steps.push({
    step: '19. buildUserContentWithImages utan images = string',
    ok: typeof stringOnly === 'string' && stringOnly === 'Vad kostar det?',
    detail: typeof stringOnly,
  })

  // 20. URL föredras över base64 när båda finns
  const both: ReturnType<typeof buildUserContentWithImages> = buildUserContentWithImages('Test', [
    { url: 'https://example.test/img.jpg', base64: tinyPngBase64, media_type: 'image/jpeg' },
  ])
  const urlBlock = Array.isArray(both)
    ? both.find((b: any) => b.type === 'image')
    : null
  steps.push({
    step: '20. buildUserContentWithImages föredrar URL framför base64',
    ok: !!urlBlock && (urlBlock as any).source?.type === 'url',
    detail: `source.type=${(urlBlock as any)?.source?.type}`,
  })

  // 21. Auto-route: om bild bifogas på en Matte-tråd ska current_agent bli Daniel
  // Vi simulerar genom att direkt anropa executeHandoff (samma logik som
  // chat-endpointet) — testar inte hela request-flödet.
  const autoResult = await executeHandoff({
    thread: imgThread,
    fromAgent: 'matte',
    toAgent: 'daniel',
    reason: 'användaren bifogade bild(er) för analys',
    contextSummary: 'Bilder bifogade — Daniel tar över för bildanalys.',
  })
  const { data: imgThreadAfter } = await supabase
    .from('agent_threads').select('current_agent_id').eq('id', imgThread.id).single()
  steps.push({
    step: '21. Auto-route Matte→Daniel vid bilder',
    ok: autoResult.ok && imgThreadAfter?.current_agent_id === 'daniel',
    detail: `current_agent_id=${imgThreadAfter?.current_agent_id}`,
  })

  // Cleanup bild-tråden
  try {
    await supabase.from('thread_message').delete().eq('thread_id', imgThread.id)
    await supabase.from('agent_threads').delete().eq('id', imgThread.id)
  } catch { /* non-blocking */ }

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
