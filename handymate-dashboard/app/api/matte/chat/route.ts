import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const maxDuration = 30

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

// ────────────────────────────────────────────────────────────────────────────
// Business context — verklig data till system-promptet
// ────────────────────────────────────────────────────────────────────────────

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
    supabase.from('quotes')
      .select('quote_id, quote_number, total, sent_at')
      .eq('business_id', businessId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(5),
    supabase.from('invoice')
      .select('invoice_id, invoice_number, total, due_date')
      .eq('business_id', businessId)
      .eq('status', 'sent')
      .lt('due_date', today)
      .limit(5),
    supabase.from('project')
      .select('name, status')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .limit(5),
    supabase.from('leads')
      .select('name, phone, job_type, created_at, score')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('pending_approvals')
      .select('approval_type, title, created_at')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .limit(5),
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
      lines.push(`- ${i.invoice_number || '—'} (id: ${i.invoice_id}): ${fmt(i.total)} kr (förföll ${i.due_date || '—'})`)
    }
  }

  if (ctx.openQuotes.length > 0) {
    lines.push('')
    lines.push('ÖPPNA OFFERTER:')
    for (const q of ctx.openQuotes) {
      const sentDate = q.sent_at ? new Date(q.sent_at).toLocaleDateString('sv-SE') : '—'
      lines.push(`- ${q.quote_number || '—'} (id: ${q.quote_id}): ${fmt(q.total)} kr (skickad ${sentDate})`)
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

// ────────────────────────────────────────────────────────────────────────────
// Tool definitions — Tier 1 + send_invoice_reminder
// ────────────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'send_sms',
    description: 'Skickar ett SMS till en kund via 46elks. Använd när hantverkaren explicit ber dig kontakta en kund.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Telefonnummer i format +46701234567 eller 0701234567' },
        message: { type: 'string', description: 'SMS-meddelandet på svenska, max 160 tecken' },
        customer_name: { type: 'string', description: 'Kundens namn för bekräftelse till hantverkaren' },
      },
      required: ['phone', 'message', 'customer_name'],
    },
  },
  {
    name: 'create_approval',
    description: 'Skapar ett godkännande som hantverkaren måste bekräfta innan action utförs. Använd för känsliga actions som att skicka offerter eller fakturor.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Typ: send_quote, send_invoice, send_campaign, other' },
        title: { type: 'string', description: 'Kort beskrivning som visas för hantverkaren' },
        description: { type: 'string', description: 'Längre beskrivning av vad som kommer att hända' },
        payload: { type: 'object', description: 'Data som behövs för att utföra actionen vid godkännande' },
      },
      required: ['type', 'title', 'payload'],
    },
  },
  {
    name: 'send_invoice_reminder',
    description: 'Skickar en betalningspåminnelse för en förfallen faktura. Använd invoice_id från AKTUELL AFFÄRSSTATUS.',
    input_schema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'Internt ID på fakturan (från affärsstatus)' },
        invoice_number: { type: 'string', description: 'Fakturanummer för bekräftelse, t.ex. FV-2026-031' },
      },
      required: ['invoice_id', 'invoice_number'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigerar användaren till en specifik sida. Använd när hantverkaren vill öppna en sida eller när det är naturligt efter en action.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'URL-path t.ex. /dashboard/quotes, /dashboard/invoices, /dashboard/customers' },
        reason: { type: 'string', description: 'Kort förklaring varför vi navigerar dit' },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_quote_draft',
    description: 'Skapar ett tomt offert-utkast och navigerar hantverkaren till redigeringsvyn. Använd när hantverkaren vill skapa en ny offert.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'ID på kunden offerten gäller (lämna tom om okänd)' },
        title: { type: 'string', description: 'Offertens titel/beskrivning' },
      },
      required: ['title'],
    },
  },
]

// ────────────────────────────────────────────────────────────────────────────
// Tool execution
// ────────────────────────────────────────────────────────────────────────────

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('0')) return '+46' + cleaned.slice(1)
  return '+46' + cleaned
}

interface ToolResult {
  result: string
  action?: { type: string; target?: string; approval_id?: string }
}

async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  businessId: string,
  userCookie: string | null
): Promise<ToolResult> {
  const supabase = getServerSupabase()

  switch (toolName) {
    case 'send_sms': {
      const { phone, message, customer_name } = toolInput
      const ELKS_USER = process.env.ELKS_API_USER
      const ELKS_PASS = process.env.ELKS_API_PASSWORD
      if (!ELKS_USER || !ELKS_PASS) {
        return { result: 'SMS-tjänsten är inte konfigurerad — be admin kolla 46elks-nycklarna.' }
      }

      // Hämta business-namn för from-fältet
      const { data: biz } = await supabase
        .from('business_config')
        .select('business_name')
        .eq('business_id', businessId)
        .single()

      const formattedPhone = formatPhone(phone)

      const response = await fetch('https://api.46elks.com/a1/sms', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${ELKS_USER}:${ELKS_PASS}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: (biz?.business_name || 'Handymate').substring(0, 11),
          to: formattedPhone,
          message: String(message),
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error('[matte/chat] SMS error:', errText)
        return { result: `SMS-sändning misslyckades: ${errText.slice(0, 100)}` }
      }

      const elksData = await response.json().catch(() => ({} as any))

      // Logga (non-blocking)
      try {
        await supabase.from('sms_log').insert({
          sms_id: 'sms_' + Math.random().toString(36).substring(2, 14),
          business_id: businessId,
          direction: 'outbound',
          phone_from: (biz?.business_name || 'Handymate').substring(0, 11),
          phone_to: formattedPhone,
          message: String(message),
          status: 'sent',
          elks_id: elksData?.id,
          created_at: new Date().toISOString(),
        })
      } catch { /* non-blocking */ }

      return { result: `SMS skickat till ${customer_name} (${formattedPhone}).` }
    }

    case 'create_approval': {
      const { type, title, description, payload } = toolInput
      const id = 'appr_' + Math.random().toString(36).substring(2, 14)
      const { error } = await supabase.from('pending_approvals').insert({
        id,
        business_id: businessId,
        approval_type: String(type),
        title: String(title),
        description: description ? String(description) : null,
        payload: payload || {},
        status: 'pending',
        risk_level: 'medium',
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })

      if (error) {
        console.error('[matte/chat] approval insert error:', error)
        return { result: `Kunde inte skapa godkännandet: ${error.message}` }
      }

      return {
        result: `Godkännande skapat: "${title}". Det väntar på dig under Godkännanden.`,
        action: { type: 'approval_created', approval_id: id },
      }
    }

    case 'send_invoice_reminder': {
      const { invoice_id, invoice_number } = toolInput
      // Forwarda användarens cookie så getAuthenticatedBusiness fungerar
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (userCookie) headers['Cookie'] = userCookie

      const response = await fetch(`${APP_URL}/api/invoices/${invoice_id}/reminder`, {
        method: 'POST',
        headers,
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error('[matte/chat] reminder error:', errText)
        return { result: `Kunde inte skicka påminnelse för ${invoice_number}.` }
      }

      return { result: `Påminnelse skickad för faktura ${invoice_number}.` }
    }

    case 'navigate': {
      const { path, reason } = toolInput
      return {
        result: reason ? String(reason) : `Navigerar till ${path}`,
        action: { type: 'navigate', target: String(path) },
      }
    }

    case 'create_quote_draft': {
      const { customer_id, title } = toolInput
      const quoteId = 'q_' + Math.random().toString(36).substring(2, 14)
      const { error } = await supabase.from('quotes').insert({
        quote_id: quoteId,
        business_id: businessId,
        customer_id: customer_id || null,
        title: String(title),
        status: 'draft',
        created_at: new Date().toISOString(),
      })

      if (error) {
        console.error('[matte/chat] quote draft error:', error)
        return { result: `Kunde inte skapa offert-utkastet: ${error.message}` }
      }

      return {
        result: `Offert-utkast skapat. Öppnar redigeringsvyn.`,
        action: { type: 'navigate', target: `/dashboard/quotes/${quoteId}/edit` },
      }
    }

    default:
      return { result: `Okänt verktyg: ${toolName}` }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Anthropic API helpers — raw fetch
// ────────────────────────────────────────────────────────────────────────────

async function callClaude(opts: {
  apiKey: string
  system: any[]
  messages: any[]
}): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: opts.system,
      tools: TOOLS,
      messages: opts.messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic ${res.status}: ${err}`)
  }
  return res.json()
}

// ────────────────────────────────────────────────────────────────────────────
// POST handler
// ────────────────────────────────────────────────────────────────────────────

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

    const userCookie = request.headers.get('cookie')

    // Statiskt system-prompt — cachas
    const baseSystemPrompt = `Du är Matte, AI-assistent för hantverkaren ${userName} på ${businessName}. Du kan hjälpa med tidrapportering, offerter, fakturaöversikt och projektuppdateringar. Svara kort och konkret på svenska. Max 2-3 meningar per svar (även efter tool-användning).

Du har tillgång till dessa verktyg:
- send_sms: Skicka SMS direkt till en kund (bara när hantverkaren explicit ber dig)
- create_approval: Skapa ett godkännande för känsliga actions (skicka offerter/fakturor — aldrig direkt)
- send_invoice_reminder: Skicka påminnelse för förfallen faktura (använd invoice_id från affärsstatus)
- navigate: Navigera hantverkaren till rätt sida i appen
- create_quote_draft: Skapa ett tomt offert-utkast och öppna redigeringsvyn

VIKTIGT:
- Använd send_sms BARA om hantverkaren explicit ber dig kontakta en kund
- För att skicka offerter eller fakturor: använd create_approval — aldrig direkt
- Bekräfta alltid kort vad du gjort efter ett tool-anrop
- Använd AKTUELL AFFÄRSSTATUS för att hitta rätt invoice_id, quote_id, kundnamn osv.

Var vänlig, professionell och effektiv. Använd du-tilltal.`

    // Hämta verklig affärsdata (non-blocking)
    let contextSection = ''
    try {
      const bizContext = await getBusinessContext(businessId)
      contextSection = buildContextSection(bizContext)
    } catch (err) {
      console.error('[matte/chat] Failed to load business context:', err)
      contextSection = `AKTUELL AFFÄRSSTATUS (${new Date().toLocaleDateString('sv-SE')}): kunde inte laddas just nu.`
    }

    const systemArray = [
      { type: 'text', text: baseSystemPrompt, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: contextSection },
    ]

    // Initial messages — användarens senaste 10
    const initialMessages = messages.slice(-10).map((m: { role: string; content: string }) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }))

    // ── Tool-loop ────────────────────────────────────────────────────────
    const toolMessages: any[] = []
    let response: any
    let finalAction: any = null
    let iterations = 0
    const MAX_ITERATIONS = 3

    response = await callClaude({
      apiKey,
      system: systemArray,
      messages: initialMessages,
    })

    while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
      iterations++

      const toolUseBlocks = (response.content || []).filter((b: any) => b.type === 'tool_use')

      // Kör alla tool-anrop parallellt
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block: any) => {
          const result = await executeTool(block.name, block.input || {}, businessId, userCookie)
          if (result.action) finalAction = result.action
          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: result.result,
          }
        })
      )

      toolMessages.push(
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      )

      // Behåll initial + senaste 4 (2 par tool_use + tool_result)
      const trimmedToolMessages = toolMessages.slice(-4)

      response = await callClaude({
        apiKey,
        system: systemArray,
        messages: [...initialMessages, ...trimmedToolMessages],
      })
    }

    // Extrahera text från sista svaret
    const finalText = (response.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim()

    // Backwards compat: parsa även gammalt JSON-action-format om Matte fortfarande använder det
    let action = finalAction
    if (!action) {
      const actionMatch = finalText.match(/\{"action"\s*:\s*"navigate"\s*,\s*"target"\s*:\s*"([^"]+)"\}/)
      if (actionMatch) {
        action = { type: 'navigate', target: actionMatch[1] }
      }
    }
    const cleanReply = finalText.replace(/\{"action"\s*:\s*"navigate"[^}]+\}\s*/g, '').trim()

    return NextResponse.json({
      reply: cleanReply || 'Klart!',
      action,
    })
  } catch (error: any) {
    console.error('[matte/chat] Error:', error)
    return NextResponse.json({
      reply: 'Något gick fel — försök igen.',
    })
  }
}
