import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const maxDuration = 30

/**
 * Hämta affärskontext parallellt — ger Matte verklig data att svara på.
 * Använder Handymates faktiska tabellnamn (quotes plural, invoice/project/booking singular).
 */
async function getBusinessContext(businessId: string) {
  const supabase = getServerSupabase()
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  const [
    openQuotes,
    overdueInvoices,
    activeProjects,
    recentLeads,
    pendingApprovals,
    todayBookings,
  ] = await Promise.all([
    // Offerter skickade men ej accepterade
    supabase.from('quotes')
      .select('quote_number, total, sent_at')
      .eq('business_id', businessId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(5),

    // Förfallna fakturor (sent + due_date i dåtid)
    supabase.from('invoice')
      .select('invoice_number, total, due_date')
      .eq('business_id', businessId)
      .eq('status', 'sent')
      .lt('due_date', today)
      .limit(5),

    // Aktiva projekt
    supabase.from('project')
      .select('name, status')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .limit(5),

    // Senaste leads
    supabase.from('leads')
      .select('name, phone, job_type, created_at, score')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5),

    // Väntande godkännanden
    supabase.from('pending_approvals')
      .select('approval_type, title, created_at')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .limit(5),

    // Dagens bokningar
    supabase.from('booking')
      .select('scheduled_start, notes, status')
      .eq('business_id', businessId)
      .gte('scheduled_start', today)
      .lt('scheduled_start', tomorrow)
      .limit(5),
  ])

  return {
    openQuotes: openQuotes.data || [],
    overdueInvoices: overdueInvoices.data || [],
    activeProjects: activeProjects.data || [],
    recentLeads: recentLeads.data || [],
    pendingApprovals: pendingApprovals.data || [],
    todayBookings: todayBookings.data || [],
  }
}

function fmt(n: number | null | undefined): string {
  return n != null ? n.toLocaleString('sv-SE') : '0'
}

function buildContextSection(ctx: Awaited<ReturnType<typeof getBusinessContext>>): string {
  const lines: string[] = []
  lines.push(`AKTUELL AFFÄRSSTATUS (${new Date().toLocaleDateString('sv-SE')}):`)
  lines.push(`- Öppna offerter: ${ctx.openQuotes.length} st`)
  lines.push(`- Förfallna fakturor: ${ctx.overdueInvoices.length} st`)
  lines.push(`- Aktiva projekt: ${ctx.activeProjects.length} st`)
  lines.push(`- Nya leads (senaste): ${ctx.recentLeads.length} st`)
  lines.push(`- Väntande godkännanden: ${ctx.pendingApprovals.length} st`)
  lines.push(`- Dagens bokningar: ${ctx.todayBookings.length} st`)

  if (ctx.overdueInvoices.length > 0) {
    lines.push('')
    lines.push('FÖRFALLNA FAKTUROR:')
    for (const i of ctx.overdueInvoices) {
      lines.push(`- ${i.invoice_number || '—'}: ${fmt(i.total)} kr (förföll ${i.due_date || '—'})`)
    }
  }

  if (ctx.openQuotes.length > 0) {
    lines.push('')
    lines.push('ÖPPNA OFFERTER:')
    for (const q of ctx.openQuotes) {
      const sentDate = q.sent_at ? new Date(q.sent_at).toLocaleDateString('sv-SE') : '—'
      lines.push(`- ${q.quote_number || '—'}: ${fmt(q.total)} kr (skickad ${sentDate})`)
    }
  }

  if (ctx.pendingApprovals.length > 0) {
    lines.push('')
    lines.push('VÄNTAR PÅ DIG:')
    for (const a of ctx.pendingApprovals) {
      lines.push(`- ${a.title} (${a.approval_type})`)
    }
  }

  if (ctx.todayBookings.length > 0) {
    lines.push('')
    lines.push('DAGENS BOKNINGAR:')
    for (const b of ctx.todayBookings) {
      const time = new Date(b.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
      lines.push(`- ${time}: ${b.notes || 'Bokning'}`)
    }
  }

  if (ctx.recentLeads.length > 0) {
    lines.push('')
    lines.push('SENASTE LEADS:')
    for (const l of ctx.recentLeads) {
      const score = l.score != null ? ` (score ${l.score})` : ''
      lines.push(`- ${l.name || 'Okänd'}: ${l.job_type || '—'}${score}`)
    }
  }

  if (ctx.activeProjects.length > 0) {
    lines.push('')
    lines.push('AKTIVA PROJEKT:')
    for (const p of ctx.activeProjects) {
      lines.push(`- ${p.name}`)
    }
  }

  return lines.join('\n')
}

export async function POST(request: NextRequest) {
  try {
    const { messages, context } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages krävs' }, { status: 400 })
    }

    const userName = context?.userName || 'hantverkaren'
    const businessName = context?.businessName || 'företaget'
    const businessId = context?.businessId

    if (!businessId) {
      return NextResponse.json(
        { error: 'businessId saknas i context — kan inte ladda affärsdata' },
        { status: 400 }
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        reply: 'Hej! Jag är Matte, din AI-assistent. Just nu kan jag inte svara — be din admin kontrollera API-inställningarna.',
      })
    }

    // Statiskt system-prompt — cachas för billigare upprepade calls
    const baseSystemPrompt = `Du är Matte, AI-assistent för hantverkaren ${userName} på ${businessName}. Du kan hjälpa med tidrapportering, offerter, fakturaöversikt och projektuppdateringar. Svara kort och konkret på svenska. Max 2-3 meningar per svar.

Om användaren vill navigera till en del av appen, returnera ett JSON-objekt på en egen rad:
{"action":"navigate","target":"quotes|projects|invoices|customers|pipeline|settings|home"}

Använd AKTUELL AFFÄRSSTATUS nedan för att svara på konkreta frågor om offerter, fakturor, leads, bokningar och godkännanden. Hänvisa till specifika nummer och belopp när det är relevant.

Var vänlig, professionell och effektiv. Använd du-tilltal.`

    // Hämta verklig affärsdata (ej blockerande — svara även om DB-fel)
    let contextSection = ''
    try {
      const bizContext = await getBusinessContext(businessId)
      contextSection = buildContextSection(bizContext)
    } catch (err) {
      console.error('[matte/chat] Failed to load business context:', err)
      contextSection = `AKTUELL AFFÄRSSTATUS (${new Date().toLocaleDateString('sv-SE')}): kunde inte laddas just nu.`
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: [
          // Statiskt prompt → cachat
          { type: 'text', text: baseSystemPrompt, cache_control: { type: 'ephemeral' } },
          // Dynamisk affärsdata → ingen cache (ändras varje dag)
          { type: 'text', text: contextSection },
        ],
        messages: messages.slice(-10).map((m: { role: string; content: string }) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[matte/chat] Anthropic error:', err)
      return NextResponse.json({
        reply: 'Något gick fel — försök igen om en stund.',
      })
    }

    const data = await res.json()
    const replyText = data.content?.[0]?.text || 'Jag kunde inte svara just nu.'

    // Parse action if present
    let action: { type: string; target: string } | undefined
    const actionMatch = replyText.match(/\{"action"\s*:\s*"navigate"\s*,\s*"target"\s*:\s*"([^"]+)"\}/)
    if (actionMatch) {
      action = { type: 'navigate', target: actionMatch[1] }
    }

    // Remove JSON action from visible reply
    const cleanReply = replyText.replace(/\{"action"\s*:\s*"navigate"[^}]+\}\s*/g, '').trim()

    return NextResponse.json({
      reply: cleanReply || 'Navigerar...',
      action,
    })
  } catch (error: any) {
    console.error('[matte/chat] Error:', error)
    return NextResponse.json({
      reply: 'Något gick fel — försök igen.',
    })
  }
}
