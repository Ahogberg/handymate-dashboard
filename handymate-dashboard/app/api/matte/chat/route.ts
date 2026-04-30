import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { AGENT_CAPABILITIES, isValidAgentId, type AgentId } from '@/lib/agent/capabilities'
import {
  getOrCreateThread,
  executeHandoff,
  buildHandoffAnnouncement,
  touchThread,
  MAX_HANDOFFS_PER_THREAD,
} from '@/lib/agent/handoff'
import {
  saveThreadMessage,
  loadThreadMessages,
  toClaudeMessages,
  summarizeIfNeeded,
  buildUserContentWithImages,
  type ThreadImage,
} from '@/lib/agent/thread-messages'

const MAX_IMAGES_PER_MESSAGE = 4
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

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
  {
    name: 'handoff_to_agent',
    description: 'Lämna över konversationen till en annan agent när frågan ligger utanför ditt expertområde. Den nya agenten svarar i samma response — användaren ser hela kedjan. Använd ENDAST när en specialist är klart bättre lämpad. Avbryt allt annat när du gör handoff.',
    input_schema: {
      type: 'object',
      properties: {
        target_agent: {
          type: 'string',
          description: 'Vilken agent som ska ta över: matte | lars | karin | daniel | hanna | lisa',
          enum: ['matte', 'lars', 'karin', 'daniel', 'hanna', 'lisa'],
        },
        reason: {
          type: 'string',
          description: 'Kort förklaring varför du lämnar över (t.ex. "pris-detaljer ligger i Karins område")',
        },
        context_for_next_agent: {
          type: 'string',
          description: 'Sammanfattning av vad som diskuterats hittills så nästa agent kan svara direkt utan att fråga om.',
        },
      },
      required: ['target_agent', 'reason', 'context_for_next_agent'],
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
// Agent system-prompt — byggs per agent baserat på capabilities
// ────────────────────────────────────────────────────────────────────────────

function buildAgentSystemPrompt(
  agent: AgentId,
  userName: string,
  businessName: string,
  hasImages: boolean
): string {
  const cap = AGENT_CAPABILITIES[agent]
  if (!cap) return ''

  const expertise = cap.expertise.map(e => `- ${e}`).join('\n')
  const outOfScope = cap.out_of_scope.map(e => `- ${e}`).join('\n')

  // Bild-instruktioner — bara Daniel får detaljerade riktlinjer (han äger
  // bildanalys för offert-underlag). Andra agenter får en kort note om bilder
  // finns så de inte ignorerar dem.
  let imageBlock = ''
  if (hasImages) {
    if (agent === 'daniel') {
      imageBlock = `

DU SER BILDER I MEDDELANDET — analysera dem för:
- Storlek/yta (om mätbart eller uppskattningsbart)
- Material och kondition
- Synliga problem eller utmaningar
- Vad som behöver göras

När du gör en offert eller uppskattning baserat på bilder — var transparent om vad du ser och vad du gissar. Ange osäkerhet ("ser ut att vara ca 6-8 m²"). Om bilden är för otydlig: be om en kompletterande bild eller mått från hantverkaren.`
    } else {
      imageBlock = `

OBS: Användaren har bifogat bild(er). Du kan se dem men din specialitet är inte bildanalys för offert. Om frågan kräver detaljerad analys av storlek/material/skick — gör handoff till Daniel.`
    }
  }

  return `Du är ${cap.name}, AI-assistent i Handymate-teamet hos ${businessName}. Du pratar med hantverkaren ${userName}. Svara kort och konkret på svenska, max 2-3 meningar per svar.

DITT EXPERTOMRÅDE: ${cap.domain}

VAD DU ÄR EXPERT PÅ:
${expertise}

SKICKA VIDARE TILL ANDRA AGENTER NÄR:
${outOfScope}

VID HANDOFF: Var transparent men kort. Använd handoff_to_agent-verktyget — säg inte "Hej, jag är X" till användaren, det säger nästa agent. Skriv en kort context_for_next_agent så nästa agent kan svara direkt utan att fråga om.

Du har också tillgång till verktyg för SMS, godkännanden, fakturor, navigering och offert-utkast. Använd dem bara om frågan ligger inom ditt expertområde.${imageBlock}

Var vänlig, professionell och effektiv. Använd du-tilltal.`
}

// ────────────────────────────────────────────────────────────────────────────
// POST handler
// ────────────────────────────────────────────────────────────────────────────

interface AgentTurnResult {
  text: string
  action: any
  /** Satt om Claude använde handoff_to_agent — hanteras i outer loop */
  handoff: { target_agent: string; reason: string; context_for_next_agent: string } | null
}

/**
 * Kör en Claude-runda för en specifik agent. Inkluderar tool-loop och
 * upptäcker handoff_to_agent-anrop (som signalerar att outer loop ska byta
 * agent). Om handoff används avbryter vi tool-loopen och returnerar handoff:en
 * — vi skickar inget tool_result tillbaka till modellen för det anropet.
 */
async function runAgentTurn(opts: {
  apiKey: string
  agent: AgentId
  systemArray: any[]
  initialMessages: any[]
  businessId: string
  userCookie: string | null
}): Promise<AgentTurnResult> {
  const MAX_TOOL_ITERATIONS = 3
  let response = await callClaude({
    apiKey: opts.apiKey,
    system: opts.systemArray,
    messages: opts.initialMessages,
  })

  const toolMessages: any[] = []
  let finalAction: any = null
  let iterations = 0

  while (response.stop_reason === 'tool_use' && iterations < MAX_TOOL_ITERATIONS) {
    iterations++
    const toolUseBlocks = (response.content || []).filter((b: any) => b.type === 'tool_use')

    // Hitta handoff-anrop FÖRST — det avbryter allt annat
    const handoffBlock = toolUseBlocks.find((b: any) => b.name === 'handoff_to_agent')
    if (handoffBlock) {
      const text = (response.content || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
        .trim()
      return {
        text,
        action: finalAction,
        handoff: {
          target_agent: String(handoffBlock.input?.target_agent || ''),
          reason: String(handoffBlock.input?.reason || ''),
          context_for_next_agent: String(handoffBlock.input?.context_for_next_agent || ''),
        },
      }
    }

    // Standard tool-execution för andra tools
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block: any) => {
        const result = await executeTool(block.name, block.input || {}, opts.businessId, opts.userCookie)
        if (result.action) finalAction = result.action
        return { type: 'tool_result', tool_use_id: block.id, content: result.result }
      })
    )

    toolMessages.push(
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults }
    )
    const trimmed = toolMessages.slice(-4)

    response = await callClaude({
      apiKey: opts.apiKey,
      system: opts.systemArray,
      messages: [...opts.initialMessages, ...trimmed],
    })
  }

  const finalText = (response.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim()

  return { text: finalText, action: finalAction, handoff: null }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, context, images: rawImages } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages krävs' }, { status: 400 })
    }

    const userName = context?.userName || 'hantverkaren'
    const businessName = context?.businessName || 'företaget'
    const businessId = context?.businessId
    // Optionella thread-params — bakåtkompat: utan dessa beter sig endpoint
    // som tidigare (Matte tar varje meddelande, ingen thread skapas).
    const customerId: string | null = context?.customerId || null
    const projectId: string | null = context?.projectId || null
    const explicitThreadId: string | null = context?.threadId || null

    // ── Bilder: normalisera + validera ─────────────────────────────────
    // Klienten kan skicka antingen array av strängar (base64) eller array
    // av objekt { url?, base64?, media_type? }. Vi normaliserar till
    // ThreadImage[]. Cap vid 4 bilder per meddelande, 5 MB var.
    const images: ThreadImage[] = []
    if (Array.isArray(rawImages)) {
      const candidates = rawImages.slice(0, MAX_IMAGES_PER_MESSAGE)
      for (const raw of candidates) {
        if (!raw) continue
        if (typeof raw === 'string') {
          // Räkna ut base64-storlek: bytes ≈ length * 0.75
          if (raw.length * 0.75 > MAX_IMAGE_BYTES) continue
          images.push({ base64: raw, media_type: 'image/jpeg' })
        } else if (typeof raw === 'object') {
          const item: ThreadImage = {
            url: typeof raw.url === 'string' ? raw.url : undefined,
            base64: typeof raw.base64 === 'string' ? raw.base64 : undefined,
            media_type: typeof raw.media_type === 'string' ? raw.media_type : 'image/jpeg',
            size_bytes: typeof raw.size_bytes === 'number' ? raw.size_bytes : undefined,
          }
          // Validera storlek om vi har base64 eller size_bytes
          if (item.base64 && item.base64.length * 0.75 > MAX_IMAGE_BYTES) continue
          if (item.size_bytes && item.size_bytes > MAX_IMAGE_BYTES) continue
          if (!item.url && !item.base64) continue
          images.push(item)
        }
      }
    }
    const hasImages = images.length > 0

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

    // ── Thread-state ────────────────────────────────────────────────────
    // Skapa eller hämta tråd om vi har customer/project context, eller om
    // bilder bifogats (auto-routing + audit kräver thread). Utan något av
    // detta kör vi i "engångsmode" med Matte som default-agent.
    let thread: Awaited<ReturnType<typeof getOrCreateThread>> | null = null
    if (customerId || projectId || explicitThreadId || hasImages) {
      try {
        thread = await getOrCreateThread({ businessId, customerId, projectId })
      } catch (err) {
        console.error('[matte/chat] thread fetch/create failed (non-blocking):', err)
      }
    }
    let currentAgent: AgentId = (thread?.current_agent_id as AgentId) || 'matte'

    // ── Auto-routing: bilder + Matte → Daniel ───────────────────────────
    // Om användaren bifogar bild(er) och vi är hos Matte (default agent)
    // hoppar vi direkt till Daniel som äger bildanalys för offert-underlag.
    // Detta hoppar inte över specialist-konversationer — om current redan
    // är t.ex. Lars eller Karin, lämnas det ifred (de kan själva delegera).
    if (thread && hasImages && currentAgent === 'matte') {
      try {
        const auto = await executeHandoff({
          thread,
          fromAgent: 'matte',
          toAgent: 'daniel',
          reason: 'användaren bifogade bild(er) för analys',
          contextSummary: 'Bilder bifogade — Daniel tar över för bildanalys.',
        })
        if (auto.ok) {
          currentAgent = 'daniel'
          thread.current_agent_id = 'daniel'
        }
      } catch (err) {
        console.error('[matte/chat] auto-route to Daniel failed (non-blocking):', err)
      }
    }

    // Hämta verklig affärsdata (non-blocking)
    let contextSection = ''
    try {
      const bizContext = await getBusinessContext(businessId)
      contextSection = buildContextSection(bizContext)
    } catch (err) {
      console.error('[matte/chat] Failed to load business context:', err)
      contextSection = `AKTUELL AFFÄRSSTATUS (${new Date().toLocaleDateString('sv-SE')}): kunde inte laddas just nu.`
    }

    // ── Multi-turn historik ─────────────────────────────────────────────
    // Med thread: ladda persisterade meddelanden från DB (senaste 20) och
    // använd som conversation-historik till Claude. Sammanfatta äldre
    // meddelanden om token-budgeten överskrids.
    // Utan thread: fall tillbaka till payload-historiken (legacy mode).
    // content kan vara string ELLER content-blocks-array (för multimodal).
    type ChatMessage = { role: 'user' | 'assistant'; content: any }
    let initialMessages: ChatMessage[]
    let historySummary: string | null = thread?.context_summary || null

    // Senaste user-meddelandet — det vi ska svara på och spara
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find((m: { role: string; content: string }) => m.role === 'user')
    const newUserText: string = lastUserMessage?.content || ''

    if (thread) {
      const persisted = await loadThreadMessages(thread.id, { limit: 20 })

      // Token-management: om historik är för lång, sammanfatta äldre delar
      if (persisted.length > 0) {
        const { summary, kept } = await summarizeIfNeeded({
          threadId: thread.id,
          rows: persisted,
          apiKey,
        })
        if (summary) historySummary = summary
        initialMessages = toClaudeMessages(kept)
      } else {
        initialMessages = []
      }

      // Lägg till det nya user-meddelandet sist. Med bilder bygger vi
      // ett multimodal content-block (bilder + text). Utan bilder är det
      // bara strängen. Dedup-skydd: om sista raden redan är samma user-
      // text utan bilder, undvik duplicate vid re-submit.
      if (newUserText || hasImages) {
        const lastInitial = initialMessages[initialMessages.length - 1]
        const isDup = !hasImages
          && lastInitial
          && lastInitial.role === 'user'
          && lastInitial.content === newUserText
        if (!isDup) {
          const userContent = hasImages
            ? buildUserContentWithImages(newUserText || '', images)
            : newUserText
          initialMessages = [...initialMessages, { role: 'user', content: userContent }]
        }
      }

      // Spara user-meddelandet i thread_message (non-blocking) — inkl images
      if (newUserText || hasImages) {
        saveThreadMessage({
          threadId: thread.id,
          businessId,
          role: 'user',
          agent: null,
          content: newUserText || '(bild bifogad utan text)',
          images,
        }).catch(() => {})
      }
    } else {
      // Legacy: använd payload-historiken (senaste 10). Utan thread sparas
      // ingenting — bilder skickas direkt till Claude i sista user-msg.
      initialMessages = messages.slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }))
      if (hasImages) {
        // Lägg in bild-blocken på det sista user-meddelandet
        const last = initialMessages[initialMessages.length - 1]
        const baseText = last?.role === 'user' ? last.content : ''
        const userContent = buildUserContentWithImages(typeof baseText === 'string' ? baseText : '', images)
        if (last?.role === 'user') {
          // Ersätt sista
          initialMessages = [
            ...initialMessages.slice(0, -1),
            { role: 'user', content: userContent as any },
          ]
        } else {
          initialMessages.push({ role: 'user', content: userContent as any })
        }
      }
    }

    // ── Outer handoff-loop ──────────────────────────────────────────────
    // Maximalt 1 handoff per chat-turn (det räcker i 95% av fallen). Tråden
    // kan ackumulera fler handoffs över flera turns — capped vid
    // MAX_HANDOFFS_PER_THREAD (audit + skydd mot loops).
    const responseMessages: Array<{ agent: AgentId; content: string; is_handoff_announcement?: boolean }> = []
    let finalAction: any = null
    const MAX_PER_TURN_HANDOFFS = 1
    let handoffsThisTurn = 0
    let outerMessages = initialMessages

    while (true) {
      const systemArray: any[] = [
        {
          type: 'text',
          text: buildAgentSystemPrompt(currentAgent, userName, businessName, hasImages),
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: contextSection },
      ]
      // Inkludera summary av äldre meddelanden om token-budgeten översteg
      if (historySummary) {
        systemArray.push({
          type: 'text',
          text: `TIDIGARE I KONVERSATIONEN (sammanfattning):\n${historySummary}`,
        })
      }

      const turn = await runAgentTurn({
        apiKey,
        agent: currentAgent,
        systemArray,
        initialMessages: outerMessages,
        businessId,
        userCookie,
      })

      if (turn.action && !finalAction) finalAction = turn.action

      if (!turn.handoff || handoffsThisTurn >= MAX_PER_TURN_HANDOFFS) {
        // Klart: lägg sista textsvaret om det finns
        if (turn.text) {
          responseMessages.push({ agent: currentAgent, content: turn.text })
          // Persistera assistant-svar (non-blocking)
          if (thread) {
            saveThreadMessage({
              threadId: thread.id,
              businessId,
              role: 'assistant',
              agent: currentAgent,
              content: turn.text,
            }).catch(() => {})
          }
        }
        break
      }

      // Handoff begärd — verifiera och utför
      if (!isValidAgentId(turn.handoff.target_agent)) {
        // Ogiltig target — fall tillbaka till nuvarande agents textsvar
        if (turn.text) responseMessages.push({ agent: currentAgent, content: turn.text })
        break
      }

      // Om vi inte har en tråd än men en handoff begärs, skapa en på
      // (business_id, customer_id) eller fallback (utan customer-koppling).
      if (!thread) {
        try {
          thread = await getOrCreateThread({ businessId, customerId, projectId })
        } catch { /* om vi inte kan skapa, vägra handoff men returnera textsvar */ }
        if (!thread) {
          if (turn.text) responseMessages.push({ agent: currentAgent, content: turn.text })
          break
        }
      }

      const result = await executeHandoff({
        thread,
        fromAgent: currentAgent,
        toAgent: turn.handoff.target_agent,
        reason: turn.handoff.reason,
        contextSummary: turn.handoff.context_for_next_agent,
      })

      if (!result.ok) {
        // Refused (max-loop, not_allowed, etc.) — stanna kvar hos current agent
        if (turn.text) responseMessages.push({ agent: currentAgent, content: turn.text })
        if (result.refused_reason === 'max_handoffs_reached') {
          responseMessages.push({
            agent: currentAgent,
            content: `(Max antal handoffs i den här tråden nått — frågan stannar hos ${AGENT_CAPABILITIES[currentAgent]?.name || currentAgent}.)`,
          })
        }
        break
      }

      // Lägg announcement från avgående agent
      const announcement = buildHandoffAnnouncement(currentAgent, result.current_agent, turn.handoff.reason)
      // Använd ev. text från avgående agent som prefix om hen sa något, annars bara announcement
      const announcementContent = turn.text ? `${turn.text}\n\n${announcement}` : announcement
      const previousAgent = currentAgent
      responseMessages.push({
        agent: previousAgent,
        content: announcementContent,
        is_handoff_announcement: true,
      })
      // Persistera handoff-announcement med flag (skippas i Claude messages-
      // historik nästa gång, men UI kan hämta dem för audit)
      if (thread) {
        saveThreadMessage({
          threadId: thread.id,
          businessId,
          role: 'assistant',
          agent: previousAgent,
          content: announcementContent,
          isHandoffAnnouncement: true,
          metadata: { to_agent: result.current_agent, reason: turn.handoff.reason },
        }).catch(() => {})
      }

      // Byt till ny agent + injicera context som user-meddelande för nästa runda
      currentAgent = result.current_agent
      outerMessages = [
        ...initialMessages,
        {
          role: 'user',
          content: `[Handoff-kontext: ${turn.handoff.context_for_next_agent}]\n\nSvara kort på frågan ovan.`,
        },
      ]
      handoffsThisTurn++
    }

    // Touch-thread så last_message_at uppdateras
    if (thread) {
      touchThread(thread.id).catch(() => {})
    }

    // Bakåtkompat: returnera även `reply` (sista textsvaret) + `action`
    const lastMessage = responseMessages[responseMessages.length - 1]
    const reply = lastMessage?.content || 'Klart!'
    // Strippa eventuell legacy {"action":"navigate"...}-blob
    const actionMatch = reply.match(/\{"action"\s*:\s*"navigate"\s*,\s*"target"\s*:\s*"([^"]+)"\}/)
    if (!finalAction && actionMatch) {
      finalAction = { type: 'navigate', target: actionMatch[1] }
    }
    const cleanReply = reply.replace(/\{"action"\s*:\s*"navigate"[^}]+\}\s*/g, '').trim()

    return NextResponse.json({
      messages: responseMessages,
      current_agent: currentAgent,
      thread_id: thread?.id || null,
      // Bakåtkompat med befintliga UI-konsumenter:
      reply: cleanReply,
      action: finalAction,
    })
  } catch (error: any) {
    console.error('[matte/chat] Error:', error)
    return NextResponse.json({
      reply: 'Något gick fel — försök igen.',
      messages: [],
    })
  }
}
