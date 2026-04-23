'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Bot,
  Phone,
  MessageSquare,
  FileText,
  Send,
  Clock,
  Zap,
  Search,
  UserPlus,
  CalendarCheck,
  ClipboardList,
  Mail,
  Smartphone,
  Activity,
  CheckCircle2,
  XCircle,
  Settings2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  ArrowRight,
  X,
  TrendingUp,
  Eye,
  ChevronDown,
  ChevronUp,
  Code2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useBusiness } from '@/lib/BusinessContext'
import { isAgentAllowed, type PlanType } from '@/lib/feature-gates'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────

interface AgentRun {
  run_id: string
  trigger_type: string
  trigger_data: Record<string, unknown>
  steps: AgentStep[]
  tool_calls: number
  final_response: string
  tokens_used: number
  estimated_cost: number
  duration_ms: number
  status: string
  agent_id?: string
  created_at: string
}

interface AgentStep {
  step: number
  content?: string
  tool_calls?: Array<{
    tool: string
    input: Record<string, unknown>
    result: { success: boolean; data?: unknown; error?: string }
  }>
}

interface AgentSettings {
  auto_create_customer: boolean
  auto_create_quote: boolean
  auto_send_sms: boolean
  auto_create_booking: boolean
  auto_send_email: boolean
  auto_create_invoice: boolean
  max_quote_amount: number
  require_approval_above: number
}

interface AgentStats {
  total_runs: number
  completed: number
  failed: number
  total_tool_calls: number
  total_tokens: number
  avg_duration_ms: number
}




// ── Team Members ──────────────────────────────────────────────────────

interface TeamAgent {
  id: string
  name: string
  role: string
  initials: string
  color: string
  avatar?: string
  greeting: string
  description?: string
  training?: boolean
}

const AVATAR_BASE_SIGNED = 'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/sign/team-avatars'
const AVATAR_BASE_PUBLIC = 'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/public/team-avatars'
// Use signed URLs for existing avatars, public for new ones
const AVATAR_BASE = AVATAR_BASE_SIGNED

const TEAM: TeamAgent[] = [
  { id: 'matte', name: 'Matte', role: 'Chefsassistent', initials: 'M', color: 'bg-primary-700', avatar: `${AVATAR_BASE}/Matte.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvTWF0dGUucG5nIiwiaWF0IjoxNzczODU1NTkyLCJleHAiOjI2Mzc4NTU1OTJ9.jNhKpwuz1VvDTszvZ7fbczsopGCNM5c0eQHR5qq-0Ak`, greeting: 'Hej! Här är läget för idag ☀️', description: 'Koordinerar teamet och pratar med dig' },
  { id: 'karin', name: 'Karin', role: 'Ekonom', initials: 'K', color: 'bg-blue-600', avatar: `${AVATAR_BASE}/Karin.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvS2FyaW4ucG5nIiwiaWF0IjoxNzczODU1NjE4LCJleHAiOjI2Mzc4NTU2MTh9.bmvCwfi8Rry-5dGsJ1Zyyco--CYT6ZG3gXBPqHRiVdA`, greeting: 'Jag har koll på ekonomin — kollar fakturorna', description: 'Håller koll på fakturor och betalningar' },
  { id: 'hanna', name: 'Hanna', role: 'Marknadschef', initials: 'H', color: 'bg-purple-600', avatar: `${AVATAR_BASE_PUBLIC}/Hanna.png`, greeting: 'Dags att nå fler kunder!', description: 'Sköter kampanjer och nya kunder' },
  { id: 'daniel', name: 'Daniel', role: 'Säljare', initials: 'D', color: 'bg-amber-600', avatar: `${AVATAR_BASE}/Daniel.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvRGFuaWVsLnBuZyIsImlhdCI6MTc3Mzg1NTY0MiwiZXhwIjoyNjM3ODU1NjQyfQ.3NE6iIAL4gje-j0warr4k6PUFqRuf7EocaDo86LZNWE`, greeting: 'Jag följer upp offerten idag', description: 'Följer upp offerter och leads' },
  { id: 'lars', name: 'Lars', role: 'Projektledare', initials: 'L', color: 'bg-emerald-600', avatar: `${AVATAR_BASE}/Lars.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvTGFycy5wbmciLCJpYXQiOjE3NzM4NTU2NTUsImV4cCI6MjYzNzg1NTY1NX0.mICMOQvJxG49RDXZXsc_BfKFM-AnNOscyNTL8IxPdqY`, greeting: 'Alla projekt löper på — inga förseningar', description: 'Koordinerar projekt och bokningar' },
  { id: 'lisa', name: 'Lisa', role: 'Kundservice & Telefonist', initials: 'Li', color: 'bg-sky-500', avatar: `${AVATAR_BASE}/Lisa.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvTGlzYS5wbmciLCJpYXQiOjE3NzQyNTk4MTYsImV4cCI6MTA0MTQyNTk4MTZ9.ZQag6FV2my_vy7rq1tFPBYK2MuwlmhFeDtU16SLA3Ak`, greeting: 'Hej! Hur kan jag hjälpa dig idag?', description: 'Svarar i telefon och hanterar kundförfrågningar', training: true },
]

function getAgentForAction(actionType: string): TeamAgent {
  if (['create_invoice', 'get_invoices', 'send_invoice_reminder'].includes(actionType)) return TEAM[1] // Karin
  if (['create_campaign', 'create_leads_outbound'].includes(actionType)) return TEAM[2] // Hanna
  if (['create_quote', 'get_quotes', 'qualify_lead', 'update_lead_status'].includes(actionType)) return TEAM[3] // Daniel
  if (['create_booking', 'update_project', 'check_calendar', 'log_time'].includes(actionType)) return TEAM[4] // Lars
  if (['send_sms', 'send_email', 'get_customer', 'search_customers'].includes(actionType)) return TEAM[5] // Lisa
  return TEAM[0] // Matte (default)
}

function getAgentForRun(run: { trigger_type: string; tool_calls: number; final_response?: string; agent_id?: string }): TeamAgent {
  // Use real agent_id if available (V21+)
  if (run.agent_id) {
    const match = TEAM.find(a => a.id === run.agent_id)
    if (match) return match
  }
  // Fallback: infer from trigger type and response content
  if (run.trigger_type === 'phone_call' || run.trigger_type === 'incoming_sms') return TEAM[0]
  if (run.trigger_type === 'cron') {
    const resp = (run.final_response || '').toLowerCase()
    if (resp.includes('faktur') || resp.includes('betalning')) return TEAM[1]
    if (resp.includes('kampanj') || resp.includes('lead') || resp.includes('kund')) return TEAM[2]
    if (resp.includes('offert') || resp.includes('pipeline')) return TEAM[3]
    if (resp.includes('projekt') || resp.includes('bokning')) return TEAM[4]
  }
  return TEAM[0]
}

// ── Constants ──────────────────────────────────────────────────────────

const TRIGGER_CONFIG: Record<string, { label: string; icon: typeof Phone; color: string; bg: string }> = {
  phone_call: { label: 'Telefonsamtal', icon: Phone, color: 'text-primary-500', bg: 'bg-primary-700/10 border-primary-600/20' },
  incoming_sms: { label: 'Inkommande SMS', icon: MessageSquare, color: 'text-primary-500', bg: 'bg-primary-600/10 border-primary-600/20' },
  manual: { label: 'Du frågade', icon: Settings2, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  cron: { label: 'Automatisk kontroll', icon: Clock, color: 'text-primary-600', bg: 'bg-primary-600/10 border-primary-600/20' },
}

// Mappar cron_type till begriplig svensk beskrivning av VAD som kontrollerades
const CRON_TYPE_LABELS: Record<string, string> = {
  agent_context: 'Morgonens översikt',
  morning_report: 'Morgonrapport',
  communication_check: 'Kollade samtal och meddelanden',
  daily_check: 'Kollade samtal och meddelanden',
  check_overdue: 'Kollade förfallna fakturor',
  quote_followup: 'Följde upp offerter',
  nurture: 'Uppföljning av leads',
  evaluate_thresholds: 'Kollade automationsregler',
  gmail_poll: 'Kollade Gmail för nya mail',
  gmail_lead_import: 'Letade nya leads i Gmail',
  sync_calendars: 'Synkade kalendern',
  sync_phone_webhooks: 'Synkade telefoni-inställningar',
  project_health: 'Kontrollerade projektstatus',
  generate_insights: 'Analyserade veckan',
  seasonality: 'Säsongsanalys',
  send_reminders: 'Skickade påminnelser',
  send_campaigns: 'Skickade kampanjer',
  monthly_review: 'Månadsrapport',
  maintenance: 'Databasunderhåll',
  expire_approvals: 'Städade utgångna godkännanden',
}

function getCronLabel(cronType: unknown): string | null {
  if (!cronType || typeof cronType !== 'string') return null
  return CRON_TYPE_LABELS[cronType] || null
}

const TOOL_CONFIG: Record<string, { label: string; icon: typeof Search; friendlyLabel: string }> = {
  search_customers: { label: 'Sök kund', icon: Search, friendlyLabel: 'Sökte efter kunder' },
  get_customer: { label: 'Hämta kund', icon: Eye, friendlyLabel: 'Hämtade kundinfo' },
  create_customer: { label: 'Skapa kund', icon: UserPlus, friendlyLabel: 'Skapade ny kund' },
  update_customer: { label: 'Uppdatera kund', icon: ClipboardList, friendlyLabel: 'Uppdaterade kund' },
  create_quote: { label: 'Skapa offert', icon: FileText, friendlyLabel: 'Skapade offert' },
  get_quotes: { label: 'Hämta offerter', icon: FileText, friendlyLabel: 'Hämtade offerter' },
  create_invoice: { label: 'Skapa faktura', icon: FileText, friendlyLabel: 'Skapade faktura' },
  check_calendar: { label: 'Kolla kalender', icon: CalendarCheck, friendlyLabel: 'Kollade lediga tider' },
  create_booking: { label: 'Skapa bokning', icon: CalendarCheck, friendlyLabel: 'Skapade bokning' },
  update_project: { label: 'Uppdatera projekt', icon: ClipboardList, friendlyLabel: 'Uppdaterade projekt' },
  log_time: { label: 'Logga tid', icon: Clock, friendlyLabel: 'Registrerade tid' },
  send_sms: { label: 'Skicka SMS', icon: Smartphone, friendlyLabel: 'Skickade SMS' },
  send_email: { label: 'Skicka e-post', icon: Mail, friendlyLabel: 'Skickade e-post' },
  read_customer_emails: { label: 'Läs kundmail', icon: Mail, friendlyLabel: 'Läste kundmail' },
  qualify_lead: { label: 'Kvalificera lead', icon: TrendingUp, friendlyLabel: 'Kvalificerade intressent' },
  update_lead_status: { label: 'Uppdatera lead', icon: ArrowRight, friendlyLabel: 'Uppdaterade intressent' },
  get_lead: { label: 'Hämta lead', icon: Eye, friendlyLabel: 'Hämtade intressent' },
  search_leads: { label: 'Sök leads', icon: Search, friendlyLabel: 'Sökte intressenter' },
  get_daily_stats: { label: 'Dagsrapport', icon: Activity, friendlyLabel: 'Hämtade dagsrapport' },
  order_material: { label: 'Beställ material', icon: ClipboardList, friendlyLabel: 'Beställde material' },
  check_pending_approvals: { label: 'Godkännanden', icon: ClipboardList, friendlyLabel: 'Kontrollerade väntande godkännanden' },
  get_pipeline_overview: { label: 'Pipeline', icon: TrendingUp, friendlyLabel: 'Kollade dina leads och affärer' },
  get_overdue_invoices: { label: 'Förfallna fakturor', icon: FileText, friendlyLabel: 'Kollade förfallna fakturor' },
  get_upcoming_bookings: { label: 'Bokningar', icon: CalendarCheck, friendlyLabel: 'Kollade kommande bokningar' },
  get_communication_stats: { label: 'Kommunikation', icon: Phone, friendlyLabel: 'Kollade samtal och meddelanden' },
}

// Format tool result as human-readable summary
function formatToolResultSummary(tool: string, result: { success: boolean; data?: unknown; error?: string }): string {
  if (!result.success) return result.error || 'Något gick fel'
  const d = result.data as Record<string, unknown> | undefined
  if (!d) return 'Klart'

  switch (tool) {
    case 'search_customers':
    case 'search_leads': {
      const count = Array.isArray(d) ? d.length : (d.count ?? d.total ?? (Array.isArray(d.customers) ? d.customers.length : (Array.isArray(d.leads) ? d.leads.length : '?')))
      const noun = tool === 'search_leads' ? 'intressenter' : 'kunder'
      return `Hittade ${count} ${noun}`
    }
    case 'create_quote':
      return d.quote_id ? `Offert ${d.quote_id} skapad` : 'Offert skapad'
    case 'create_invoice':
      return d.invoice_id ? `Faktura ${d.invoice_id} skapad` : 'Faktura skapad'
    case 'create_customer':
      return d.name ? `Kund "${d.name}" skapad` : 'Kund skapad'
    case 'create_booking':
      return d.booking_date ? `Bokning ${d.booking_date} skapad` : 'Bokning skapad'
    case 'send_sms':
      return d.status === 'sent' || d.success ? 'SMS skickat' : 'SMS köat'
    case 'send_email':
      return d.status === 'sent' || d.success ? 'E-post skickat' : 'E-post köat'
    case 'check_calendar': {
      const slots = Array.isArray(d.available_slots) ? d.available_slots.length : (Array.isArray(d.slots) ? d.slots.length : null)
      return slots !== null ? `${slots} lediga tider hittades` : 'Kalender kollad'
    }
    case 'get_customer':
      return d.name ? `${d.name}` : 'Kundinfo hämtad'
    case 'get_lead':
      return d.name ? `${d.name}` : 'Intressent hämtad'
    case 'qualify_lead':
      return d.score !== undefined ? `Poäng: ${d.score}/100` : 'Intressent kvalificerad'
    case 'update_lead_status':
      return d.status ? `Status: ${d.status}` : 'Status uppdaterad'
    case 'log_time':
      return d.duration_minutes ? `${d.duration_minutes} min registrerade` : 'Tid registrerad'
    case 'read_customer_emails': {
      const emailCount = Array.isArray(d) ? d.length : (Array.isArray(d.emails) ? d.emails.length : null)
      return emailCount !== null ? `${emailCount} mail hittade` : 'Mail hämtade'
    }
    case 'get_daily_stats':
      return 'Dagsrapport hämtad'
    default:
      return 'Klart'
  }
}

// Humanize technical agent responses for display
// cronLabel: om detta är en cron-körning, vad kontrollerades?
// (ex. "Kollade samtal och meddelanden", "Kollade förfallna fakturor")
function humanizeResponse(text: string, cronLabel?: string | null): string {
  if (!text) return cronLabel ? `${cronLabel} — inga åtgärder behövs` : text

  // Ignorera enordssvar som "Perfekt!", "Ok", "Klar" etc — de säger ingenting
  const trimmed = text.trim().replace(/[!.?]+$/, '')
  if (trimmed.length < 15 && /^(perfekt|ok|okej|klar|klart|bra|utmärkt|all(a|t))/i.test(trimmed)) {
    return cronLabel ? `${cronLabel} — allt ser bra ut` : 'Klar'
  }

  // ── Step 1: Try to extract a clean one-line summary ────────────────
  // Many cron responses follow the pattern: "Status: Lugnt läge ✅" or similar
  const statusMatch = text.match(/Status:\s*(.+?)(?:\n|$)/i)
  const isCronCheck = /communication.?check|daglig.?statistik|schemalagd.?kontroll|status\s+f.r\s+\d{4}/i.test(text)

  if (isCronCheck || cronLabel) {
    // Parse the key numbers from the response
    const leads = text.match(/(\d+)\s*nya?\s*leads?/i)?.[1]
    const quotes = text.match(/(\d+)\s*(?:nya?\s*)?offert(?:er)?\s*skapad/i)?.[1]
    const sms = text.match(/(\d+)\s*(?:utgående\s*)?SMS/i)?.[1]
    const calls = text.match(/(\d+)\s*samtal/i)?.[1]
    const bookings = text.match(/(\d+)\s*bokning(?:ar)?/i)?.[1]
    const customers = text.match(/(\d+)\s*nya?\s*kund(?:er)?/i)?.[1]
    const approvals = text.match(/(\d+)\s*(?:väntande\s*)?godkännanden?/i)?.[1]

    // Build a friendly summary from the numbers
    const highlights: string[] = []
    if (leads && leads !== '0') highlights.push(`${leads} nya leads`)
    if (quotes && quotes !== '0') highlights.push(`${quotes} nya offerter`)
    if (sms && sms !== '0') highlights.push(`${sms} SMS skickade`)
    if (calls && calls !== '0') highlights.push(`${calls} samtal`)
    if (bookings && bookings !== '0') highlights.push(`${bookings} bokningar`)
    if (customers && customers !== '0') highlights.push(`${customers} nya kunder`)
    if (approvals && approvals !== '0') highlights.push(`${approvals} godkännanden väntar`)

    const prefix = cronLabel || 'Kontroll klar'
    if (highlights.length > 0) {
      return `${prefix} — ${highlights.join(', ')}`
    }

    // All zeros → calm status
    if (statusMatch && /lugnt/i.test(statusMatch[1])) {
      return `${prefix} — lugnt läge, inga åtgärder behövs`
    }
    if (isCronCheck) {
      return `${prefix} — allt ser bra ut, inga åtgärder behövs`
    }
    // cronLabel satt men ingen cron-check-pattern → använd labeln som prefix
  }

  // ── Step 2: For non-cron responses, do lighter cleanup ─────────────
  let result = text
    // Remove markdown headers and bullets
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^[-•·]\s*/gm, '')
    // Remove date stamps at line starts
    .replace(/\d{4}-\d{2}-\d{2}\s*/g, '')
    // Technical terms → Swedish
    .replace(/Cron-trigger hanterad/gi, 'Kontroll genomförd')
    .replace(/Communication Check/gi, 'Kontroll av samtal och meddelanden')
    .replace(/Kommunikationskontroll/gi, 'Kollade samtal och meddelanden')
    .replace(/cron[_-]?type[:\s]*\w+/gi, '')
    .replace(/schema cache/gi, 'databas')
    .replace(/pipeline granskad \(alla statusar tomma\)/gi, 'Inga aktiva förfrågningar just nu')
    .replace(/pipeline granskad/gi, 'Kollade dina förfrågningar')
    .replace(/check_pending_approvals/gi, 'Kontrollerade godkännanden')
    .replace(/pending_approvals/gi, 'godkännanden')
    .replace(/log_automation_action/gi, 'Loggade åtgärd')
    .replace(/get_daily_stats/gi, 'Hämtade daglig statistik')
    .replace(/search_customers/gi, 'Sökte bland kunder')
    .replace(/search_leads/gi, 'Sökte bland förfrågningar')
    .replace(/get_customer/gi, 'Hämtade kundinfo')
    .replace(/get_lead/gi, 'Hämtade förfrågningsinfo')
    .replace(/get_quotes/gi, 'Hämtade offerter')
    .replace(/create_approval_request/gi, 'Skapade godkännandeförfrågan')
    .replace(/send_sms/gi, 'Skickade SMS')
    .replace(/send_email/gi, 'Skickade e-post')
    .replace(/create_booking/gi, 'Skapade bokning')
    .replace(/check_calendar/gi, 'Kollade kalendern')
    .replace(/qualify_lead/gi, 'Kvalificerade förfrågan')
    .replace(/update_lead_status/gi, 'Uppdaterade status')
    .replace(/\bleads?\b/gi, 'förfrågningar')
    .replace(/\btrigger\b/gi, 'händelse')
    .replace(/\bcron\b/gi, 'automatisk')
    .replace(/Could not find the table/gi, 'Kunde inte kontrollera')
    .replace(/in the schema cache/gi, '— kontakta support om det fortsätter')
    .replace(/idempotency/gi, 'dubblettskydd')
    .replace(/Error:/gi, 'Fel:')
    // Clean up "Status sammanfattning:" headers
    .replace(/Status\s*sammanfattning:?\s*/gi, '')
    .replace(/Dagens?\s*översikt:?\s*/gi, '')
    .replace(/Daglig\s*statistik:?\s*/gi, '')
    .replace(/Genomförda\s*kontroller:?\s*/gi, '')
    // Remove "0 st" items that add no value
    .replace(/[·•]\s*\w[^·•\n]*:\s*0\s*(?:st|timmar?)(?:\s*[·•])?/gi, '')
    .replace(/[·•]\s*\w[^·•\n]*:\s*Inga?\s*(?:skapade?|schemalagda?|nya?)?(?:\s*[·•])?/gi, '')
    // Clean up multiple spaces/newlines
    .replace(/\s{2,}/g, ' ')
    .trim()

  // If after cleanup it's very long, take first sentence
  if (result.length > 200) {
    const firstSentence = result.match(/^[^.!]+[.!]/)
    if (firstSentence) result = firstSentence[0]
  }

  return result
}

// Simple markdown-to-HTML renderer for agent responses
function renderSimpleMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold text-gray-800 mt-3 mb-1 text-sm">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-gray-900 mt-3 mb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h3 class="font-bold text-gray-900 mt-3 mb-1">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^[-•] (.+)$/gm, '<li class="text-gray-600">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="list-disc list-inside space-y-0.5 my-1 ml-1">$&</ul>')
    .replace(/\n{2,}/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>')
}

// Strip markdown for plain-text previews
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^[-•] /gm, '· ')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
}


const DEFAULT_SETTINGS: AgentSettings = {
  auto_create_customer: true,
  auto_create_quote: false,
  auto_send_sms: false,
  auto_create_booking: false,
  auto_send_email: false,
  auto_create_invoice: false,
  max_quote_amount: 50000,
  require_approval_above: 10000,
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<0.01 kr'
  return `${cost.toFixed(2)} kr`
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just nu'
  if (mins < 60) return `${mins} min sedan`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h sedan`
  const days = Math.floor(hours / 24)
  return `${days}d sedan`
}

// ── Stat Card ──────────────────────────────────────────────────────────

function StatCard({ label, value, suffix, icon: Icon, color }: {
  label: string; value: number | string; suffix?: string; icon: typeof Bot; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">
            {value}<span className="text-base font-normal text-gray-400 ml-0.5">{suffix}</span>
          </p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  )
}

// ── Activity Item ──────────────────────────────────────────────────────

function ActivityItem({ run, isSelected, onClick }: {
  run: AgentRun; isSelected: boolean; onClick: () => void
}) {
  const trigger = TRIGGER_CONFIG[run.trigger_type] || TRIGGER_CONFIG.manual
  const agent = getAgentForRun(run)
  const cronLabel = run.trigger_type === 'cron' ? getCronLabel((run.trigger_data as any)?.cron_type) : null
  const triggerLabel = cronLabel || trigger.label

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-4 border-b border-gray-100 transition-all hover:bg-gray-50 ${
        isSelected ? 'bg-primary-50/50 border-l-[3px] border-l-primary-600' : 'border-l-[3px] border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-3">
        {agent.avatar ? (
          <img src={agent.avatar} alt={agent.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }} />
        ) : null}
        <div className={`w-10 h-10 rounded-full ${agent.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${agent.avatar ? 'hidden' : ''}`}>
          {agent.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">{agent.name}</span>
            <span className="text-xs text-gray-400">{triggerLabel}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
              run.status === 'completed'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {run.status === 'completed' ? 'Klar' : 'Misslyckad'}
            </span>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
            {stripMarkdown(humanizeResponse(run.final_response || '(Inget svar)', cronLabel))}
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(run.created_at)}
            </span>
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {run.tool_calls} steg
            </span>
            <span>{formatDuration(run.duration_ms)}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Tool Step ──────────────────────────────────────────────────────────

function ToolStep({ call, index, total, count = 1 }: {
  call: NonNullable<AgentStep['tool_calls']>[0]; index: number; total: number; count?: number
}) {
  const config = TOOL_CONFIG[call.tool] || { label: call.tool, icon: Zap, friendlyLabel: call.tool }
  const ToolIcon = config.icon
  const summary = formatToolResultSummary(call.tool, call.result)

  return (
    <div className="flex gap-3">
      {/* Timeline */}
      <div className="flex flex-col items-center w-8 flex-shrink-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center z-10 ${
          call.result.success
            ? 'bg-primary-100 text-primary-700 shadow-primary-600/20'
            : 'bg-red-100 text-red-500 shadow-red-500/20'
        }`}>
          {call.result.success
            ? <ToolIcon className="w-4 h-4" />
            : <XCircle className="w-4 h-4" />
          }
        </div>
        {index < total - 1 && (
          <div className="w-0.5 flex-1 bg-gradient-to-b from-primary-300 to-gray-200 min-h-[16px]" />
        )}
      </div>
      {/* Content */}
      <div className="flex-1 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{config.friendlyLabel}</span>
          {count > 1 && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">({count} gånger)</span>
          )}
          {!call.result.success && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">Fel</span>
          )}
        </div>
        <p className={`text-xs mt-0.5 ${call.result.success ? 'text-gray-500' : 'text-red-500'}`}>
          {summary}
        </p>
      </div>
    </div>
  )
}

// ── Run Detail ─────────────────────────────────────────────────────────

function RunDetail({ run, onClose }: { run: AgentRun; onClose: () => void }) {
  const trigger = TRIGGER_CONFIG[run.trigger_type] || TRIGGER_CONFIG.manual
  const TriggerIcon = trigger.icon
  const [showTech, setShowTech] = useState(false)
  const cronLabel = run.trigger_type === 'cron' ? getCronLabel((run.trigger_data as any)?.cron_type) : null
  const titleLabel = cronLabel || trigger.label

  // Flatten all tool calls from steps
  const allToolCalls = run.steps.flatMap(s => s.tool_calls || [])
  const successCount = allToolCalls.filter(c => c.result.success).length

  // Deduplicate consecutive identical tool calls
  const deduplicatedCalls = allToolCalls.reduce<Array<{ call: typeof allToolCalls[0]; count: number }>>((acc, call) => {
    const last = acc[acc.length - 1]
    if (last && last.call.tool === call.tool) {
      last.count++
      return acc
    }
    acc.push({ call, count: 1 })
    return acc
  }, [])

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden animate-in fade-in">
      {/* Header */}
      <div className="p-5 bg-gradient-to-br from-gray-50 to-slate-50 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TriggerIcon className={`w-5 h-5 ${trigger.color}`} />
              <span className="text-lg font-bold text-gray-900">{titleLabel}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                run.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {run.status === 'completed' ? 'Slutförd' : 'Misslyckad'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary — rendered as proper markdown */}
        <div className="mt-3 p-3 bg-white rounded-lg border border-[#E2E8F0] text-sm text-gray-700 leading-relaxed prose prose-sm prose-gray max-w-none [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_h4]:text-sm [&_h4]:font-medium [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:text-gray-600 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic [&_a]:text-primary-700">
          {run.final_response ? (
            <ReactMarkdown>{humanizeResponse(run.final_response, cronLabel)}</ReactMarkdown>
          ) : (
            <p className="text-gray-400 italic">{cronLabel ? `${cronLabel} — inga åtgärder behövs` : '(Inget svar)'}</p>
          )}
        </div>

        {/* Meta — only user-friendly info */}
        <div className="flex gap-6 mt-3">
          {[
            { label: 'Tid', value: formatTime(run.created_at) },
            { label: 'Varaktighet', value: formatDuration(run.duration_ms) },
            { label: 'Steg', value: `${successCount}/${allToolCalls.length} OK` },
          ].map(item => (
            <div key={item.label}>
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">{item.label}</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tool Calls Timeline */}
      <div className="p-5">
        <p className="text-sm font-bold text-gray-900 mb-4">
          Vad AI-assistenten gjorde ({allToolCalls.length} steg)
        </p>
        {deduplicatedCalls.length > 0 ? (
          deduplicatedCalls.map((item, i) => (
            <ToolStep key={i} call={item.call} index={i} total={deduplicatedCalls.length} count={item.count} />
          ))
        ) : (
          <p className="text-sm text-gray-400 italic">Inga steg utförda</p>
        )}
      </div>

      {/* Technical Details Toggle */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setShowTech(!showTech)}
          className="w-full px-5 py-3 flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Visa tekniska detaljer</span>
          {showTech ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
        </button>
        {showTech && (
          <div className="px-5 pb-5 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-[#E2E8F0]">
                <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Tokens</p>
                <p className="text-sm font-mono font-semibold text-gray-900 mt-0.5">{run.tokens_used.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-[#E2E8F0]">
                <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Kostnad</p>
                <p className="text-sm font-mono font-semibold text-gray-900 mt-0.5">{formatCost(run.estimated_cost)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-[#E2E8F0]">
                <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Run ID</p>
                <p className="text-xs font-mono text-gray-500 mt-0.5 truncate">{run.run_id}</p>
              </div>
            </div>
            {allToolCalls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Rå verktygsdata</p>
                {allToolCalls.map((call, i) => (
                  <div key={i} className="mb-2 bg-gray-50 rounded-lg p-3 border border-[#E2E8F0]">
                    <p className="text-xs font-mono font-semibold text-gray-700 mb-1">{call.tool}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase mb-0.5">Input</p>
                        <pre className="text-[11px] text-gray-600 bg-white p-2 rounded border border-[#E2E8F0] overflow-auto max-h-32 font-mono leading-relaxed">
                          {JSON.stringify(call.input, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase mb-0.5">Result</p>
                        <pre className={`text-[11px] p-2 rounded border overflow-auto max-h-32 font-mono leading-relaxed ${
                          call.result.success
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-red-700 bg-red-50 border-red-200'
                        }`}>
                          {JSON.stringify(call.result.data || call.result.error, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Autonomy Settings ──────────────────────────────────────────────────

function AutonomySettings({ settings, onUpdate, saving }: {
  settings: AgentSettings
  onUpdate: (key: keyof AgentSettings, value: boolean | number) => void
  saving: boolean
}) {
  const toggles: Array<{
    key: keyof AgentSettings
    label: string
    description: string
    icon: typeof Shield
    risk: 'low' | 'medium' | 'high'
  }> = [
    {
      key: 'auto_create_customer',
      label: 'Skapa kunder automatiskt',
      description: 'Agenten skapar nya kundposter vid okända nummer',
      icon: UserPlus,
      risk: 'low',
    },
    {
      key: 'auto_create_booking',
      label: 'Boka automatiskt',
      description: 'Agenten bokar in jobb utan att fråga först',
      icon: CalendarCheck,
      risk: 'medium',
    },
    {
      key: 'auto_create_quote',
      label: 'Skapa offerter automatiskt',
      description: 'Agenten skapar och sparar offerter',
      icon: FileText,
      risk: 'medium',
    },
    {
      key: 'auto_send_sms',
      label: 'Skicka SMS automatiskt',
      description: 'Agenten skickar SMS till kunder utan godkännande',
      icon: Smartphone,
      risk: 'high',
    },
    {
      key: 'auto_send_email',
      label: 'Skicka e-post automatiskt',
      description: 'Agenten skickar e-post utan godkännande',
      icon: Mail,
      risk: 'high',
    },
    {
      key: 'auto_create_invoice',
      label: 'Skapa fakturor automatiskt',
      description: 'Agenten skapar fakturor direkt',
      icon: FileText,
      risk: 'high',
    },
  ]

  const riskColors = {
    low: 'text-emerald-500',
    medium: 'text-amber-500',
    high: 'text-red-500',
  }

  const riskLabels = {
    low: 'Låg risk',
    medium: 'Medel',
    high: 'Hög risk',
  }

  const RiskIcon = ({ risk }: { risk: 'low' | 'medium' | 'high' }) => {
    if (risk === 'low') return <ShieldCheck className={`w-4 h-4 ${riskColors.low}`} />
    if (risk === 'medium') return <Shield className={`w-4 h-4 ${riskColors.medium}`} />
    return <ShieldAlert className={`w-4 h-4 ${riskColors.high}`} />
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary-600" />
          <h3 className="text-sm font-bold text-gray-900">Agentens autonomi</h3>
        </div>
        {saving && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Sparar...
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {toggles.map(toggle => {
          const isEnabled = settings[toggle.key] as boolean
          const ToggleIcon = toggle.icon
          return (
            <div key={toggle.key} className="px-5 py-3 flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <ToggleIcon className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{toggle.label}</span>
                  <span className={`flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide ${riskColors[toggle.risk]}`}>
                    <RiskIcon risk={toggle.risk} />
                    {riskLabels[toggle.risk]}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{toggle.description}</p>
              </div>
              <button
                onClick={() => onUpdate(toggle.key, !isEnabled)}
                className="flex-shrink-0"
              >
                {isEnabled ? (
                  <ToggleRight className="w-8 h-8 text-primary-700" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-gray-300" />
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Amount thresholds */}
      <div className="px-5 py-4 border-t border-gray-100 space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Max offertbelopp utan godkännande
          </label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              value={settings.require_approval_above}
              onChange={e => onUpdate('require_approval_above', Number(e.target.value))}
              className="w-32 px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-sm font-mono text-gray-900 focus:outline-none focus:border-[#0F766E] focus:border-primary-600"
            />
            <span className="text-sm text-gray-500">kr</span>
            <span className="text-xs text-gray-400 ml-2">
              Offerter över detta belopp kräver godkännande
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Manual Trigger ─────────────────────────────────────────────────────

const PLACEHOLDER_EXAMPLES = [
  'Vilka kunder har inte hört av sig på 6 månader?',
  'Visa mina obetalda fakturor',
  'Hur mycket fakturerade vi förra månaden?',
  'Följ upp offerter som skickades för mer än 5 dagar sedan',
  'Lista alla aktiva projekt just nu',
]

const QUICK_BUTTONS = [
  { emoji: '📋', label: 'Ny offert', text: 'Skapa en offert till ' },
  { emoji: '💰', label: 'Fakturor', text: 'Visa alla obetalda fakturor' },
  { emoji: '👥', label: 'Kunder', text: 'Vilka kunder behöver uppföljning?' },
  { emoji: '📅', label: 'Bokningar', text: 'Vilka bokningar har jag den här veckan?' },
]

function ManualTrigger({ businessId, onTriggered }: {
  businessId: string; onTriggered: () => void
}) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [agentResponse, setAgentResponse] = useState<{ type: 'success' | 'error'; text: string; meta?: string } | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const interval = setInterval(() => setPlaceholderIdx(prev => (prev + 1) % PLACEHOLDER_EXAMPLES.length), 3000)
    return () => clearInterval(interval)
  }, [])

  async function handleTrigger() {
    if (!instruction.trim()) return
    const query = instruction.trim()
    setLoading(true)
    setAgentResponse(null)
    setElapsed(0)
    const timer = setInterval(() => setElapsed(s => s + 1), 1000)

    // Add to history (max 5, no duplicates)
    setHistory(prev => {
      const filtered = prev.filter(h => h !== query)
      return [query, ...filtered].slice(0, 5)
    })

    try {
      const response = await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trigger_type: 'manual', trigger_data: { instruction: query } }),
      })
      const data = await response.json()
      if (response.ok) {
        const text = data.final_response || `Klart — ${data.tool_calls || 0} steg`
        const meta = `${data.tool_calls || 0} steg · ${((data.duration_ms || 0) / 1000).toFixed(1)}s`
        setAgentResponse({ type: 'success', text, meta })
        setInstruction('')
        onTriggered()
      } else {
        setAgentResponse({ type: 'error', text: data.error || `Fel (${response.status})` })
      }
    } catch (err: any) {
      setAgentResponse({ type: 'error', text: err.message || 'Nätverksfel' })
    } finally {
      clearInterval(timer)
      setLoading(false)
    }
  }

  function removeFromHistory(query: string) {
    setHistory(prev => prev.filter(h => h !== query))
  }

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
      <div className="flex items-center gap-2 mb-3">
        {TEAM[0].avatar ? (
          <img src={TEAM[0].avatar} alt="Matte" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary-700 flex items-center justify-center text-white font-bold text-xs">M</div>
        )}
        <h3 className="text-sm font-bold text-gray-900">Prata med Matte</h3>
      </div>

      {/* History chips */}
      {history.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {history.map(q => (
            <button key={q} onClick={() => { setInstruction(q); inputRef.current?.focus() }}
              className="group flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 border border-[#E2E8F0] text-[11px] text-gray-500 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors">
              <span className="truncate max-w-[180px]">{q}</span>
              <span onClick={(e) => { e.stopPropagation(); removeFromHistory(q) }}
                className="text-gray-300 hover:text-red-400 ml-0.5">×</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input ref={inputRef} type="text" value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleTrigger()}
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
          className="flex-1 px-4 py-2.5 rounded-lg border border-[#E2E8F0] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#0F766E] focus:border-primary-600"
          disabled={loading} />
        <button onClick={handleTrigger} disabled={loading || !instruction.trim()}
          className="px-4 py-2.5 rounded-lg bg-primary-800 text-white text-sm font-medium hover:bg-primary-900 disabled:opacity-50 transition-all flex items-center gap-2 shadow-primary-600/20">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {loading ? `${elapsed}s…` : 'Kör'}
        </button>
      </div>

      {/* Quick buttons */}
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {QUICK_BUTTONS.map(btn => (
          <button key={btn.label} type="button"
            onClick={() => { setInstruction(btn.text); inputRef.current?.focus() }}
            disabled={loading}
            className="px-2.5 py-1 rounded-lg bg-gray-50 border border-[#E2E8F0] text-xs text-gray-600 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 transition-colors disabled:opacity-50">
            {btn.emoji} {btn.label}
          </button>
        ))}
      </div>

      {/* Agent response */}
      {agentResponse && (
        <div className={`mt-4 rounded-xl border p-4 ${
          agentResponse.type === 'success'
            ? 'bg-white border-gray-200'
            : 'bg-red-50 border-red-200'
        }`}>
          {agentResponse.type === 'success' ? (
            <>
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{agentResponse.text}</div>
                  {agentResponse.meta && (
                    <p className="text-[10px] text-gray-400 mt-2">{agentResponse.meta}</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-red-700">
              <XCircle className="w-4 h-4 shrink-0" />
              {agentResponse.text}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────

export default function AgentDashboardPage() {
  const business = useBusiness()
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [stats, setStats] = useState<AgentStats | null>(null)
  const [chartData, setChartData] = useState<Array<{ day: string; runs: number; tools: number }>>([])
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [showTeamUpgrade, setShowTeamUpgrade] = useState(false)
  const plan = (business?.subscription_plan || 'starter') as PlanType
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(DEFAULT_SETTINGS)
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({})
  const [teamMessages, setTeamMessages] = useState<Array<{ from_agent: string; to_agent: string; content: string; created_at: string; message_type?: string; metadata?: any }>>([])
  const [showAllMessages, setShowAllMessages] = useState(false)

  const [savingSettings, setSavingSettings] = useState(false)
  const [googleStatus, setGoogleStatus] = useState<{
    connected: boolean
    email?: string
    gmailSyncEnabled?: boolean
    gmailSendEnabled?: boolean
  } | null>(null)

  // ── Data fetching ────────────────────────────────────────────────

  const fetchRuns = useCallback(async () => {
    if (!business?.business_id) return

    try {
      const res = await fetch('/api/agent/data?type=runs', { credentials: 'include' })
      if (res.ok) {
        const { runs: data } = await res.json()
        setRuns((data || []) as AgentRun[])
      }
    } catch {}
  }, [business?.business_id])

  const fetchStats = useCallback(async () => {
    if (!business?.business_id) return

    try {
      const res = await fetch('/api/agent/data?type=stats', { credentials: 'include' })
      if (res.ok) {
        const { stats: data } = await res.json()
        if (data) setStats(data)
      }
    } catch {}
  }, [business?.business_id])

  const fetchChartData = useCallback(async () => {
    if (!business?.business_id) return

    try {
      const res = await fetch('/api/agent/data?type=chart', { credentials: 'include' })
      if (res.ok) {
        const { chart } = await res.json()
        if (chart) setChartData(chart)
      }
    } catch {}
  }, [business?.business_id])

  const fetchSettings = useCallback(async () => {
    if (!business?.business_id) return

    try {
      const res = await fetch('/api/agent/data?type=settings', { credentials: 'include' })
      if (res.ok) {
        const { settings } = await res.json()
        if (settings) setAgentSettings({ ...DEFAULT_SETTINGS, ...settings })
      }
    } catch {}
  }, [business?.business_id])

  useEffect(() => {
    if (!business?.business_id) return

    async function loadAll() {
      setLoading(true)
      await Promise.all([fetchRuns(), fetchStats(), fetchChartData(), fetchSettings()])
      // Fetch team data (non-blocking)
      fetch('/api/agent/data?type=team', { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data.memory_counts) setMemoryCounts(data.memory_counts)
          if (data.messages) setTeamMessages(data.messages)
        })
        .catch(() => {})
      // Fetch Google status (non-blocking)
      fetch('/api/google/status')
        .then(r => r.json())
        .then(data => setGoogleStatus({
          connected: data.connected ?? false,
          email: data.email,
          gmailSyncEnabled: data.gmailSyncEnabled ?? false,
          gmailSendEnabled: (data.gmailSendScopeGranted && data.gmailSyncEnabled) ?? false,
        }))
        .catch(() => setGoogleStatus({ connected: false }))
      setLoading(false)
    }
    loadAll()
  }, [business?.business_id, fetchRuns, fetchStats, fetchChartData, fetchSettings])

  // ── Settings update ──────────────────────────────────────────────

  async function handleSettingsUpdate(key: keyof AgentSettings, value: boolean | number) {
    const updated = { ...agentSettings, [key]: value }
    setAgentSettings(updated)
    setSavingSettings(true)

    try {
      await fetch('/api/agent/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'update_settings', settings: updated }),
      })
    } catch {}

    setSavingSettings(false)
  }

  // ── Filtering ────────────────────────────────────────────────────

  const filteredRuns = filterType === 'all'
    ? runs
    : TEAM.some(a => a.id === filterType)
      ? runs.filter(r => (r.agent_id || getAgentForRun(r).id) === filterType)
      : runs.filter(r => r.trigger_type === filterType)

  // ── Success rate ─────────────────────────────────────────────────
  const successRate = stats && stats.total_runs > 0
    ? ((stats.completed / stats.total_runs) * 100).toFixed(1)
    : '0'

  // ── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shadow-primary-600/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">AI-assistent</h1>
            <p className="text-sm text-gray-500">Laddar...</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Ditt backoffice-team</h1>
            <p className="text-sm text-gray-500">5 AI-medarbetare jobbar för dig dygnet runt</p>
          </div>
        </div>
      </div>

      {/* Team Avatars */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-1">
        {TEAM.map((agent) => {
          const allowed = isAgentAllowed(plan, agent.id)
          const isTraining = agent.training === true
          const isDisabled = !allowed || isTraining
          return (
          <button
            key={agent.id}
            onClick={() => {
              if (isTraining) return
              if (!allowed) {
                setShowTeamUpgrade(true)
                return
              }
              setFilterType(agent.id)
            }}
            className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border transition-all min-w-[110px] ${
              isDisabled
                ? 'bg-gray-50 border-gray-100 opacity-60 cursor-default'
                : filterType === agent.id
                  ? 'bg-white border-primary-300 shadow-md'
                  : filterType === 'all'
                    ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    : 'bg-gray-50 border-gray-100 opacity-50 hover:opacity-100'
            }`}
          >
            <div className="relative">
              {agent.avatar ? (
                <img src={agent.avatar} alt={agent.name} className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover ${isDisabled ? 'grayscale opacity-60' : ''}`} />
              ) : (
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${agent.color} flex items-center justify-center text-white font-bold text-xl ${isDisabled ? 'grayscale opacity-60' : ''}`}>
                  {agent.initials}
                </div>
              )}
              {isTraining ? (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-400 rounded-full border-2 border-white flex items-center justify-center text-[8px]">📚</div>
              ) : allowed ? (
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />
              ) : (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-gray-400 rounded-full border-2 border-white flex items-center justify-center text-[8px] text-white">🔒</div>
              )}
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold text-gray-900 block">{agent.name}</span>
              <span className="text-[11px] text-gray-500 block">{agent.role}</span>
              {allowed && agent.description && <span className="text-[10px] text-gray-400 hidden sm:block mt-0.5">{agent.description}</span>}
              {allowed && (memoryCounts[agent.id] || 0) > 0 && (
                <span className="text-[10px] text-primary-700 block mt-0.5">🧠 {memoryCounts[agent.id]} lärdomar</span>
              )}
              {isTraining && <span className="text-[10px] text-amber-600 block mt-0.5">Under utbildning</span>}
              {!allowed && !isTraining && <span className="text-[10px] text-amber-600 block mt-0.5">Pro-plan</span>}
            </div>
          </button>
          )
        })}
        <button
          onClick={() => setFilterType('all')}
          className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all min-w-[80px] ${
            filterType === 'all' ? 'bg-primary-50 border-primary-300' : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600">
            <Bot className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium text-gray-900">Alla</span>
          <span className="text-[10px] text-gray-400">Hela teamet</span>
        </button>
      </div>

      {/* Settings Panel (collapsible) */}
      {showSettings && (
        <div className="mb-6">
          <AutonomySettings
            settings={agentSettings}
            onUpdate={handleSettingsUpdate}
            saving={savingSettings}
          />
        </div>
      )}

      {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Utförda uppgifter" value={stats?.total_runs || 0} icon={Bot} color="bg-primary-700" />
            <StatCard label="Åtgärder" value={stats?.total_tool_calls || 0} icon={Zap} color="bg-primary-600" />
            <StatCard label="Lyckade" value={successRate} suffix="%" icon={CheckCircle2} color="bg-emerald-500" />
            <StatCard label="Snitt tid" value={formatDuration(stats?.avg_duration_ms || 0)} icon={Clock} color="bg-primary-600" />
          </div>

          {/* Genererat värde */}
          <AutomationValueWidget />

          {/* Chart */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 mb-6">
            <p className="text-sm font-bold text-gray-900 mb-4">Aktivitet senaste 7 dagarna</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradRuns" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} width={30} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 10, color: 'white', fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="runs" stroke="#06b6d4" strokeWidth={2.5} fill="url(#gradRuns)" name="Runs" />
                <Line type="monotone" dataKey="tools" stroke="#0f766e" strokeWidth={2} dot={false} name="Åtgärder" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Manual Trigger */}
          <div className="mb-6">
            <ManualTrigger
              businessId={business.business_id}
              onTriggered={() => { fetchRuns(); fetchStats(); fetchChartData() }}
            />
          </div>

          {/* Team Communication */}
          {teamMessages.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">Teamkommunikation</h3>
                {teamMessages.length > 5 && (
                  <button
                    onClick={() => setShowAllMessages(v => !v)}
                    className="text-xs text-primary-700 hover:text-primary-800 font-medium"
                  >
                    {showAllMessages ? 'Visa färre' : `Visa alla (${teamMessages.length})`}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {(showAllMessages ? teamMessages : teamMessages.slice(0, 5)).map((msg, i) => {
                  const fromAgent = TEAM.find(a => a.id === msg.from_agent)
                  const toAgent = TEAM.find(a => a.id === msg.to_agent)
                  const timeAgo = formatTimeAgo(msg.created_at)
                  const isHandoff = msg.message_type === 'handoff'
                  const typeBadge = (() => {
                    switch (msg.message_type) {
                      case 'handoff': return { label: 'HANDOFF', bg: 'bg-primary-700', text: 'text-white' }
                      case 'alert': return { label: 'Varning', bg: 'bg-amber-100', text: 'text-amber-800' }
                      case 'insight': return { label: 'Insikt', bg: 'bg-blue-100', text: 'text-blue-800' }
                      case 'request': return { label: 'Förfrågan', bg: 'bg-gray-100', text: 'text-gray-700' }
                      default: return null
                    }
                  })()

                  const reason = msg.metadata?.reason
                  const ctx = msg.metadata?.context

                  const renderAvatar = (a: typeof fromAgent, size = 'w-8 h-8') => (
                    a?.avatar ? (
                      <img src={a.avatar} alt={a.name} className={`${size} rounded-full object-cover shrink-0 ring-2 ring-white`} />
                    ) : (
                      <div className={`${size} rounded-full ${a?.color || 'bg-gray-400'} flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-white`}>
                        {a?.initials || '?'}
                      </div>
                    )
                  )

                  if (isHandoff) {
                    return (
                      <div key={i} className="border-2 border-primary-200 bg-primary-50/40 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex items-center">
                            {renderAvatar(fromAgent, 'w-8 h-8')}
                            <span className="mx-1 text-primary-700 font-bold">→</span>
                            {renderAvatar(toAgent, 'w-8 h-8')}
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <p className="text-sm text-gray-800">
                              <span className="font-semibold">{fromAgent?.name || msg.from_agent}</span>
                              <span className="text-gray-400"> lämnar över till </span>
                              <span className="font-semibold">{toAgent?.name || msg.to_agent}</span>
                            </p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary-700 text-white tracking-wide">
                              HANDOFF
                            </span>
                            <span className="text-gray-400 text-xs ml-auto">{timeAgo}</span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 mb-1">{stripMarkdown(humanizeResponse(msg.content))}</p>
                        {reason && (
                          <p className="text-xs text-gray-600 italic">
                            <span className="font-medium text-gray-700">Anledning:</span> {reason}
                          </p>
                        )}
                        {ctx && typeof ctx === 'object' && Object.keys(ctx).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(ctx).slice(0, 4).map(([k, v]) => (
                              <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-primary-200 text-primary-800 font-mono">
                                {k}: {String(v).slice(0, 20)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-gray-50">
                      {renderAvatar(fromAgent, 'w-7 h-7')}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">{fromAgent?.name || msg.from_agent}</span>
                            <span className="text-gray-400"> → </span>
                            <span className="font-medium">{toAgent?.name || msg.to_agent}</span>
                          </p>
                          {typeBadge && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeBadge.bg} ${typeBadge.text}`}>
                              {typeBadge.label}
                            </span>
                          )}
                          <span className="text-gray-400 text-xs">{timeAgo}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{stripMarkdown(humanizeResponse(msg.content))}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Feed + Detail */}
          <div className={`grid gap-5 ${selectedRun ? 'grid-cols-1 lg:grid-cols-[400px_1fr]' : 'grid-cols-1'}`}>
            {/* Activity Feed */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">Teamaktivitet</span>
                <span className="text-xs text-gray-400">
                  {filterType !== 'all' ? TEAM.find(a => a.id === filterType)?.name || 'Alla' : 'Alla'}
                </span>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {filteredRuns.length > 0 ? (
                  filteredRuns.map(run => (
                    <ActivityItem
                      key={run.run_id}
                      run={run}
                      isSelected={selectedRun?.run_id === run.run_id}
                      onClick={() => setSelectedRun(run)}
                    />
                  ))
                ) : (
                  <div className="p-12 text-center">
                    <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Inga agent-körningar ännu</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Ge agenten en uppgift ovan eller vänta på inkommande samtal/SMS
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Detail Panel */}
            {selectedRun && (
              <RunDetail run={selectedRun} onClose={() => setSelectedRun(null)} />
            )}
          </div>
      {showTeamUpgrade && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTeamUpgrade(false)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-4">⚡</div>
            <h2 className="text-xl font-semibold mb-2">Uppgradera till Professional</h2>
            <p className="text-gray-500 mb-6">
              Karin, Hanna, Daniel och Lars ingår i Professional-planen. Uppgradera för att låsa upp hela backoffice-teamet.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="font-medium">Professional — 5 995 kr/mån</div>
              <ul className="text-sm text-gray-500 mt-2 space-y-1">
                <li>✓ Hela teamet (5 AI-medarbetare)</li>
                <li>✓ 300 SMS/mån</li>
                <li>✓ Alla automationer</li>
                <li>✓ AI-minne</li>
                <li>✓ AI-offertgenerering</li>
              </ul>
            </div>
            <a href="/dashboard/settings/billing" className="block w-full bg-primary-700 text-white py-3 rounded-lg font-semibold">Uppgradera nu →</a>
            <button onClick={() => setShowTeamUpgrade(false)} className="mt-3 text-sm text-gray-400">Inte nu</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Automation Value Widget ─────────────────────────────────

function AutomationValueWidget() {
  const [data, setData] = useState<{
    total_value: number
    items: Array<{ type: string; label: string; amount: number; status: string; date?: string }>
    pending_count: number
  } | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/automation/value')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  if (!data) return null

  const hasValue = data.total_value > 0 || data.items.length > 0
  const confirmedItems = data.items.filter(i => i.status === 'confirmed')

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 mb-6">
      {hasValue ? (
        <>
          <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
            <p className="text-xs text-gray-400 mb-1">Senaste 7 dagarna</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary-700">
                {data.total_value.toLocaleString('sv-SE')} kr
              </span>
              <span className="text-sm text-gray-500">genererat automatiskt</span>
            </div>
            {data.pending_count > 0 && (
              <p className="text-xs text-gray-400 mt-1">{data.pending_count} leads under bevakning...</p>
            )}
          </button>
          {expanded && confirmedItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              {confirmedItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-emerald-500">✅</span>
                    <span className="text-gray-700 truncate">{item.label}</span>
                  </div>
                  <span className="font-medium text-gray-900 shrink-0 ml-2">{item.amount.toLocaleString('sv-SE')} kr</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div>
          <p className="text-sm text-gray-500">
            Handymate bevakar dina offerter, fakturor och leads automatiskt — värdet visas här när automationerna genererar resultat.
          </p>
        </div>
      )}
    </div>
  )
}
