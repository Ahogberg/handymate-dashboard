'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Bot,
  Phone,
  MessageSquare,
  FileText,
  Send,
  Clock,
  Zap,
  ChevronRight,
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
  Filter,
  TrendingUp,
  Eye,
  Timer,
  AlertTriangle,
  History,
  Play,
  Pause,
  Target,
  DollarSign,
  ArrowUpRight,
  Flame,
  GripVertical,
  Calendar,
  MailCheck,
  ExternalLink,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
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

interface AutomationRule {
  rule_id: string
  business_id: string
  rule_type: string
  label: string
  description: string
  delay_hours: number
  max_attempts: number
  channel: string
  enabled: boolean
  message_template: string
  risk_level: 'low' | 'medium' | 'high'
}

interface Lead {
  lead_id: string
  name: string | null
  phone: string | null
  email: string | null
  source: string
  status: string
  score: number
  score_reasons: Array<{ rule: string; points: number; matched: boolean }>
  estimated_value: number | null
  job_type: string | null
  urgency: string
  notes: string | null
  customer_id: string | null
  created_at: string
  updated_at: string
  converted_at: string | null
  lost_reason: string | null
}

interface PipelineStats {
  status_counts: Record<string, number>
  status_values: Record<string, number>
  total_pipeline_value: number
  conversion_rate: number
  avg_conversion_days: number
  total_leads: number
}

interface AutomationHistoryItem {
  queue_id: string
  rule_type: string
  target_label: string
  customer_name: string
  status: string
  scheduled_at: string
  executed_at: string | null
  error_message: string | null
  attempt_number: number
}

// ── Constants ──────────────────────────────────────────────────────────

const TRIGGER_CONFIG: Record<string, { label: string; icon: typeof Phone; color: string; bg: string }> = {
  phone_call: { label: 'Telefonsamtal', icon: Phone, color: 'text-teal-400', bg: 'bg-teal-600/10 border-teal-500/20' },
  incoming_sms: { label: 'Inkommande SMS', icon: MessageSquare, color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
  manual: { label: 'Manuell', icon: Settings2, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  cron: { label: 'Schemalagd', icon: Clock, color: 'text-teal-500', bg: 'bg-teal-500/10 border-teal-500/20' },
}

const TOOL_CONFIG: Record<string, { label: string; icon: typeof Search }> = {
  search_customers: { label: 'Sök kund', icon: Search },
  get_customer: { label: 'Hämta kund', icon: Eye },
  create_customer: { label: 'Skapa kund', icon: UserPlus },
  update_customer: { label: 'Uppdatera kund', icon: ClipboardList },
  create_quote: { label: 'Skapa offert', icon: FileText },
  get_quotes: { label: 'Hämta offerter', icon: FileText },
  create_invoice: { label: 'Skapa faktura', icon: FileText },
  check_calendar: { label: 'Kolla kalender', icon: CalendarCheck },
  create_booking: { label: 'Skapa bokning', icon: CalendarCheck },
  update_project: { label: 'Uppdatera projekt', icon: ClipboardList },
  log_time: { label: 'Logga tid', icon: Clock },
  send_sms: { label: 'Skicka SMS', icon: Smartphone },
  send_email: { label: 'Skicka e-post', icon: Mail },
  read_customer_emails: { label: 'Läs kundmail', icon: Mail },
  qualify_lead: { label: 'Kvalificera lead', icon: TrendingUp },
  update_lead_status: { label: 'Uppdatera lead', icon: ArrowRight },
  get_lead: { label: 'Hämta lead', icon: Eye },
  search_leads: { label: 'Sök leads', icon: Search },
}

const RULE_TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string; bg: string }> = {
  quote_followup: { label: 'Offertuppföljning', icon: FileText, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200' },
  booking_reminder: { label: 'Bokningspåminnelse', icon: CalendarCheck, color: 'text-sky-600', bg: 'bg-teal-50 border-teal-200' },
  invoice_reminder: { label: 'Fakturapåminnelse', icon: FileText, color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
  lead_response: { label: 'Lead-respons', icon: Phone, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-200' },
  project_complete: { label: 'Projekt-avslut', icon: CheckCircle2, color: 'text-teal-500', bg: 'bg-teal-50 border-teal-200' },
  lead_qualify: { label: 'Lead-kvalificering', icon: TrendingUp, color: 'text-teal-600', bg: 'bg-teal-50 border-teal-200' },
  lead_nurture: { label: 'Lead-uppföljning', icon: MessageSquare, color: 'text-indigo-500', bg: 'bg-indigo-50 border-indigo-200' },
  lead_hot_alert: { label: 'Het lead-alert', icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' },
}

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  email: 'E-post',
  both: 'SMS + E-post',
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

// ── Stat Card ──────────────────────────────────────────────────────────

function StatCard({ label, value, suffix, icon: Icon, color }: {
  label: string; value: number | string; suffix?: string; icon: typeof Bot; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all group">
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
  const TriggerIcon = trigger.icon

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-4 border-b border-gray-100 transition-all hover:bg-gray-50 ${
        isSelected ? 'bg-teal-50/50 border-l-[3px] border-l-teal-500' : 'border-l-[3px] border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${trigger.bg}`}>
          <TriggerIcon className={`w-5 h-5 ${trigger.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">{trigger.label}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
              run.status === 'completed'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {run.status === 'completed' ? 'Klar' : 'Misslyckad'}
            </span>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
            {run.final_response || '(Inget svar)'}
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(run.created_at)}
            </span>
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {run.tool_calls} verktyg
            </span>
            <span>{formatDuration(run.duration_ms)}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Tool Step ──────────────────────────────────────────────────────────

function ToolStep({ call, index, total }: {
  call: NonNullable<AgentStep['tool_calls']>[0]; index: number; total: number
}) {
  const config = TOOL_CONFIG[call.tool] || { label: call.tool, icon: Zap }
  const ToolIcon = config.icon

  return (
    <div className="flex gap-3">
      {/* Timeline */}
      <div className="flex flex-col items-center w-8 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center z-10 shadow-sm shadow-teal-500/20">
          <ToolIcon className="w-4 h-4 text-white" />
        </div>
        {index < total - 1 && (
          <div className="w-0.5 flex-1 bg-gradient-to-b from-teal-300 to-gray-200 min-h-[16px]" />
        )}
      </div>
      {/* Content */}
      <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-200 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-900 font-mono">{call.tool}</span>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            call.result.success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {call.result.success ? 'OK' : 'Fel'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Inmatning</p>
            <pre className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200 overflow-auto max-h-32 font-mono leading-relaxed">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1">Resultat</p>
            <pre className={`text-xs p-2 rounded border overflow-auto max-h-32 font-mono leading-relaxed ${
              call.result.success
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-red-700 bg-red-50 border-red-200'
            }`}>
              {JSON.stringify(call.result.data || call.result.error, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Run Detail ─────────────────────────────────────────────────────────

function RunDetail({ run, onClose }: { run: AgentRun; onClose: () => void }) {
  const trigger = TRIGGER_CONFIG[run.trigger_type] || TRIGGER_CONFIG.manual
  const TriggerIcon = trigger.icon

  // Flatten all tool calls from steps
  const allToolCalls = run.steps.flatMap(s => s.tool_calls || [])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in">
      {/* Header */}
      <div className="p-5 bg-gradient-to-br from-gray-50 to-slate-50 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TriggerIcon className={`w-5 h-5 ${trigger.color}`} />
              <span className="text-lg font-bold text-gray-900">{trigger.label}</span>
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
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 text-sm text-gray-700 leading-relaxed">
          {run.final_response || '(Inget svar)'}
        </div>

        {/* Meta */}
        <div className="flex gap-6 mt-3">
          {[
            { label: 'Starttid', value: formatTime(run.created_at) },
            { label: 'Varaktighet', value: formatDuration(run.duration_ms) },
            { label: 'Steg', value: String(run.steps.length) },
            { label: 'Tokens', value: run.tokens_used.toLocaleString() },
            { label: 'Kostnad', value: formatCost(run.estimated_cost) },
          ].map(item => (
            <div key={item.label}>
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">{item.label}</p>
              <p className="text-sm font-semibold text-gray-900 font-mono mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tool Calls Timeline */}
      <div className="p-5">
        <p className="text-sm font-bold text-gray-900 mb-4">
          Agentens steg ({allToolCalls.length})
        </p>
        {allToolCalls.length > 0 ? (
          allToolCalls.map((call, i) => (
            <ToolStep key={i} call={call} index={i} total={allToolCalls.length} />
          ))
        ) : (
          <p className="text-sm text-gray-400 italic">Inga verktygsanrop</p>
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-teal-500" />
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
                  <ToggleRight className="w-8 h-8 text-teal-600" />
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
              className="w-32 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
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

// ── Pipeline Constants ─────────────────────────────────────────────

const PIPELINE_COLUMNS: Array<{ status: string; label: string; color: string; bg: string }> = [
  { status: 'new', label: 'Nya', color: 'text-sky-700', bg: 'bg-teal-500' },
  { status: 'contacted', label: 'Kontaktade', color: 'text-teal-600', bg: 'bg-teal-600' },
  { status: 'qualified', label: 'Kvalificerade', color: 'text-teal-700', bg: 'bg-teal-500' },
  { status: 'quote_sent', label: 'Offert skickad', color: 'text-amber-600', bg: 'bg-amber-500' },
  { status: 'won', label: 'Vunna', color: 'text-emerald-600', bg: 'bg-emerald-500' },
  { status: 'lost', label: 'Förlorade', color: 'text-gray-500', bg: 'bg-gray-400' },
]

const URGENCY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Låg', color: 'text-gray-500', bg: 'bg-gray-100' },
  medium: { label: 'Medel', color: 'text-sky-700', bg: 'bg-teal-100' },
  high: { label: 'Hög', color: 'text-orange-600', bg: 'bg-orange-100' },
  emergency: { label: 'Akut', color: 'text-red-600', bg: 'bg-red-100' },
}

// ── Lead Card ─────────────────────────────────────────────────────

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const urgency = URGENCY_CONFIG[lead.urgency] || URGENCY_CONFIG.medium
  const scoreColor = lead.score < 30 ? 'text-red-500 bg-red-50' : lead.score < 60 ? 'text-amber-500 bg-amber-50' : 'text-emerald-500 bg-emerald-50'

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-gray-300 transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {lead.name || lead.phone || 'Okänd'}
          </p>
          {lead.job_type && (
            <p className="text-xs text-gray-500 truncate">{lead.job_type}</p>
          )}
        </div>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${scoreColor}`}>
          {lead.score}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${urgency.bg} ${urgency.color}`}>
          {urgency.label}
        </span>
        {lead.estimated_value && (
          <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
            <DollarSign className="w-3 h-3" />
            {(lead.estimated_value / 1000).toFixed(0)}k
          </span>
        )}
        {lead.source === 'vapi_call' && <Phone className="w-3 h-3 text-gray-400" />}
        {lead.source === 'inbound_sms' && <MessageSquare className="w-3 h-3 text-gray-400" />}
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        {formatDate(lead.created_at)} {formatTime(lead.created_at)}
      </p>
    </button>
  )
}

// ── Lead Detail Panel ─────────────────────────────────────────────

function LeadDetail({ lead, onClose, onStatusChange }: {
  lead: Lead; onClose: () => void; onStatusChange: (leadId: string, status: string, lostReason?: string) => void
}) {
  const urgency = URGENCY_CONFIG[lead.urgency] || URGENCY_CONFIG.medium
  const scoreColor = lead.score < 30 ? 'from-red-500 to-red-600' : lead.score < 60 ? 'from-amber-500 to-amber-600' : 'from-emerald-500 to-emerald-600'
  const [showLostInput, setShowLostInput] = useState(false)
  const [lostReason, setLostReason] = useState('')

  const nextStatuses: Record<string, string[]> = {
    new: ['contacted', 'lost'],
    contacted: ['qualified', 'lost'],
    qualified: ['quote_sent', 'lost'],
    quote_sent: ['won', 'lost'],
  }
  const available = nextStatuses[lead.status] || []

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 bg-gradient-to-br from-gray-50 to-slate-50 border-b border-gray-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-lg font-bold text-gray-900">{lead.name || lead.phone || 'Okänd lead'}</p>
            {lead.job_type && <p className="text-sm text-gray-500">{lead.job_type}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Score bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">Lead-poäng</span>
            <span className="text-sm font-bold text-gray-900">{lead.score}/100</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${scoreColor} transition-all`}
              style={{ width: `${lead.score}%` }}
            />
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg p-2 border border-gray-200">
            <p className="text-[10px] text-gray-400 uppercase font-medium"> Brådskande</p>
            <p className={`text-sm font-semibold ${urgency.color}`}>{urgency.label}</p>
          </div>
          <div className="bg-white rounded-lg p-2 border border-gray-200">
            <p className="text-[10px] text-gray-400 uppercase font-medium">Värde</p>
            <p className="text-sm font-semibold text-gray-900">
              {lead.estimated_value ? `${(lead.estimated_value / 1000).toFixed(0)}k kr` : '-'}
            </p>
          </div>
          <div className="bg-white rounded-lg p-2 border border-gray-200">
            <p className="text-[10px] text-gray-400 uppercase font-medium">Källa</p>
            <p className="text-sm font-semibold text-gray-900">
              {lead.source === 'vapi_call' ? 'Samtal' : lead.source === 'inbound_sms' ? 'SMS' : lead.source === 'website_form' ? 'Webb' : 'Manuell'}
            </p>
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div className="px-5 py-3 border-b border-gray-100 space-y-1">
        {lead.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-700">{lead.phone}</span>
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-700">{lead.email}</span>
          </div>
        )}
      </div>

      {/* Score reasons */}
      {lead.score_reasons && lead.score_reasons.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-900 mb-2">Score-detaljer</p>
          <div className="space-y-1">
            {lead.score_reasons.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{r.rule}</span>
                <span className={`font-mono font-semibold ${r.points > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {r.points > 0 ? '+' : ''}{r.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {lead.notes && (
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-900 mb-1">Anteckningar</p>
          <p className="text-sm text-gray-600">{lead.notes}</p>
        </div>
      )}

      {/* Actions */}
      {available.length > 0 && (
        <div className="px-5 py-4 space-y-2">
          <p className="text-xs font-bold text-gray-900 mb-2">Flytta lead</p>
          <div className="flex gap-2 flex-wrap">
            {available.filter(s => s !== 'lost').map(status => {
              const col = PIPELINE_COLUMNS.find(c => c.status === status)
              return (
                <button
                  key={status}
                  onClick={() => onStatusChange(lead.lead_id, status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white ${col?.bg || 'bg-gray-500'} hover:opacity-90 transition-all flex items-center gap-1`}
                >
                  <ArrowRight className="w-3 h-3" />
                  {col?.label || status}
                </button>
              )
            })}
            {!showLostInput ? (
              <button
                onClick={() => setShowLostInput(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Markera förlorad
              </button>
            ) : (
              <div className="flex gap-2 w-full mt-1">
                <input
                  type="text"
                  value={lostReason}
                  onChange={e => setLostReason(e.target.value)}
                  placeholder="Anledning..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-red-500/30"
                />
                <button
                  onClick={() => { onStatusChange(lead.lead_id, 'lost', lostReason); setShowLostInput(false) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-500 hover:bg-red-600"
                >
                  Förlora
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lost reason */}
      {lead.status === 'lost' && lead.lost_reason && (
        <div className="px-5 py-3 bg-red-50 border-t border-red-100">
          <p className="text-xs text-red-600">
            <span className="font-semibold">Förlorad:</span> {lead.lost_reason}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Pipeline Tab ──────────────────────────────────────────────────

function PipelineTab({ businessId }: { businessId: string }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [stats, setPipelineStats] = useState<PipelineStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [filterUrgency, setFilterUrgency] = useState<string>('all')
  const [filterScore, setFilterScore] = useState<string>('all')

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/leads')
      if (!res.ok) return
      const data = await res.json()
      setLeads(data.leads || [])
      setPipelineStats(data.stats || null)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchLeads().finally(() => setLoading(false))
  }, [fetchLeads])

  async function handleStatusChange(leadId: string, status: string, lostReason?: string) {
    // Optimistic update
    setLeads(prev => prev.map(l =>
      l.lead_id === leadId ? { ...l, status, lost_reason: lostReason || l.lost_reason, updated_at: new Date().toISOString() } : l
    ))
    if (selectedLead?.lead_id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, status, lost_reason: lostReason || prev.lost_reason } : null)
    }

    try {
      await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, status, lost_reason: lostReason }),
      })
      await fetchLeads() // Refresh stats
    } catch {
      // Revert would go here
    }
  }

  // Apply filters
  const filteredLeads = leads.filter(l => {
    if (filterUrgency !== 'all' && l.urgency !== filterUrgency) return false
    if (filterScore === 'high' && l.score < 60) return false
    if (filterScore === 'medium' && (l.score < 30 || l.score >= 60)) return false
    if (filterScore === 'low' && l.score >= 30) return false
    return true
  })

  // Group by status
  const leadsByStatus: Record<string, Lead[]> = {}
  for (const col of PIPELINE_COLUMNS) {
    leadsByStatus[col.status] = filteredLeads.filter(l => l.status === col.status)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-20 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-gray-50 rounded-xl border border-gray-200 h-64 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Totala leads"
          value={stats?.total_leads || 0}
          icon={Target}
          color="bg-teal-500"
        />
        <StatCard
          label="Pipeline-värde"
          value={stats?.total_pipeline_value ? `${(stats.total_pipeline_value / 1000).toFixed(0)}k` : '0'}
          suffix=" kr"
          icon={DollarSign}
          color="bg-teal-500"
        />
        <StatCard
          label="Konvertering"
          value={stats?.conversion_rate || 0}
          suffix="%"
          icon={ArrowUpRight}
          color="bg-emerald-500"
        />
        <StatCard
          label="Snitt tid"
          value={stats?.avg_conversion_days || 0}
          suffix=" dagar"
          icon={Clock}
          color="bg-teal-600"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-500 font-medium">Filter:</span>
        </div>
        <div className="flex gap-1">
          {[
            { key: 'all', label: 'Alla' },
            { key: 'emergency', label: 'Akut' },
            { key: 'high', label: 'Hög' },
            { key: 'medium', label: 'Medel' },
            { key: 'low', label: 'Låg' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterUrgency(f.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                filterUrgency === f.key
                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                  : 'text-gray-500 border border-transparent hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-gray-200" />
        <div className="flex gap-1">
          {[
            { key: 'all', label: 'Alla scores' },
            { key: 'high', label: '60+' },
            { key: 'medium', label: '30-59' },
            { key: 'low', label: '<30' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterScore(f.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                filterScore === f.key
                  ? 'bg-teal-50 text-teal-800 border border-teal-200'
                  : 'text-gray-500 border border-transparent hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board + Detail */}
      <div className={`flex gap-5 ${selectedLead ? '' : ''}`}>
        {/* Kanban Board */}
        <div className={`flex-1 overflow-x-auto ${selectedLead ? 'max-w-[calc(100%-380px)]' : ''}`}>
          <div className="flex gap-3 min-w-[900px]">
            {PIPELINE_COLUMNS.map(col => {
              const colLeads = leadsByStatus[col.status] || []
              const count = stats?.status_counts?.[col.status] || colLeads.length
              const value = stats?.status_values?.[col.status] || 0

              return (
                <div key={col.status} className="flex-1 min-w-[150px]">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${col.bg}`} />
                      <span className={`text-xs font-bold ${col.color}`}>{col.label}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                        {count}
                      </span>
                    </div>
                    {value > 0 && (
                      <span className="text-[10px] text-gray-400 font-mono">
                        {(value / 1000).toFixed(0)}k
                      </span>
                    )}
                  </div>

                  {/* Cards */}
                  <div className="space-y-2 min-h-[200px] bg-gray-50/50 rounded-xl p-2 border border-gray-100">
                    {colLeads.length > 0 ? (
                      colLeads.map(lead => (
                        <LeadCard
                          key={lead.lead_id}
                          lead={lead}
                          onClick={() => setSelectedLead(lead)}
                        />
                      ))
                    ) : (
                      <div className="p-4 text-center">
                        <p className="text-[10px] text-gray-400">Inga leads</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedLead && (
          <div className="w-[360px] flex-shrink-0">
            <LeadDetail
              lead={selectedLead}
              onClose={() => setSelectedLead(null)}
              onStatusChange={handleStatusChange}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Automation Rule Card ──────────────────────────────────────────────

function AutomationRuleCard({ rule, pendingCount, onToggle, onUpdate, saving }: {
  rule: AutomationRule
  pendingCount: number
  onToggle: () => void
  onUpdate: (field: string, value: number | string) => void
  saving: boolean
}) {
  const config = RULE_TYPE_CONFIG[rule.rule_type] || RULE_TYPE_CONFIG.quote_followup
  const RuleIcon = config.icon
  const riskColors = { low: 'text-emerald-500 bg-emerald-50', medium: 'text-amber-500 bg-amber-50', high: 'text-red-500 bg-red-50' }
  const riskLabels = { low: 'Låg risk', medium: 'Medel', high: 'Hög risk' }

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${rule.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      <div className="px-5 py-4 flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${config.bg}`}>
          <RuleIcon className={`w-5 h-5 ${config.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900">{rule.label}</span>
            <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${riskColors[rule.risk_level]}`}>
              {riskLabels[rule.risk_level]}
            </span>
            {pendingCount > 0 && (
              <span className="text-[10px] font-bold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">
                {pendingCount} väntande
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{rule.description}</p>

          {/* Configurable fields */}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-gray-400" />
              <label className="text-[10px] text-gray-400 uppercase font-medium"> Fördröjning</label>
              <input
                type="number"
                value={rule.delay_hours}
                onChange={e => onUpdate('delay_hours', Number(e.target.value))}
                className="w-16 px-2 py-1 rounded border border-gray-200 text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-teal-500/30"
                min={1}
              />
              <span className="text-[10px] text-gray-400">tim</span>
            </div>
            <div className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
              <label className="text-[10px] text-gray-400 uppercase font-medium">Max</label>
              <input
                type="number"
                value={rule.max_attempts}
                onChange={e => onUpdate('max_attempts', Number(e.target.value))}
                className="w-12 px-2 py-1 rounded border border-gray-200 text-xs font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-teal-500/30"
                min={1}
                max={10}
              />
              <span className="text-[10px] text-gray-400">ggr</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] text-gray-500 font-medium">{CHANNEL_LABELS[rule.channel] || rule.channel}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="flex-shrink-0 mt-1"
          disabled={saving}
        >
          {rule.enabled ? (
            <ToggleRight className="w-9 h-9 text-teal-600" />
          ) : (
            <ToggleLeft className="w-9 h-9 text-gray-300" />
          )}
        </button>
      </div>
    </div>
  )
}

// ── Automation History ────────────────────────────────────────────────

function AutomationHistoryList({ items }: { items: AutomationHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="p-8 text-center">
        <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Inga utförda automationer ännu</p>
      </div>
    )
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    executed: { label: 'Utförd', color: 'bg-emerald-100 text-emerald-700' },
    skipped: { label: 'Hoppades över', color: 'bg-gray-100 text-gray-600' },
    failed: { label: 'Misslyckad', color: 'bg-red-100 text-red-700' },
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.map(item => {
        const config = RULE_TYPE_CONFIG[item.rule_type] || RULE_TYPE_CONFIG.quote_followup
        const RuleIcon = config.icon
        const st = statusConfig[item.status] || statusConfig.failed

        return (
          <div key={item.queue_id} className="px-5 py-3 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${config.bg}`}>
              <RuleIcon className={`w-4 h-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {item.target_label || item.customer_name || config.label}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${st.color}`}>
                  {st.label}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                <span>{config.label}</span>
                {item.executed_at && (
                  <span>{formatDate(item.executed_at)} {formatTime(item.executed_at)}</span>
                )}
                {item.attempt_number > 1 && (
                  <span>Försök {item.attempt_number}</span>
                )}
              </div>
              {item.error_message && (
                <p className="text-[11px] text-red-500 mt-0.5 truncate">{item.error_message}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Automation Tab ────────────────────────────────────────────────────

function AutomationTab({ businessId }: { businessId: string }) {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({})
  const [history, setHistory] = useState<AutomationHistoryItem[]>([])
  const [totalPending, setTotalPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchAutomation = useCallback(async () => {
    try {
      const res = await fetch('/api/automation')
      if (!res.ok) return
      const data = await res.json()
      setRules(data.rules || [])
      setPendingCounts(data.pending_counts || {})
      setHistory(data.history || [])
      setTotalPending(data.total_pending || 0)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchAutomation().finally(() => setLoading(false))
  }, [fetchAutomation])

  async function handleToggle(ruleId: string, currentEnabled: boolean) {
    setSaving(true)
    // Optimistic update
    setRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, enabled: !currentEnabled } : r))

    try {
      await fetch('/api/automation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_id: ruleId, enabled: !currentEnabled }),
      })
    } catch {
      // Revert on failure
      setRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, enabled: currentEnabled } : r))
    }
    setSaving(false)
  }

  async function handleUpdate(ruleId: string, field: string, value: number | string) {
    setRules(prev => prev.map(r => r.rule_id === ruleId ? { ...r, [field]: value } : r))

    try {
      await fetch('/api/automation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_id: ruleId, [field]: value }),
      })
    } catch {
      // Silently fail; user sees local state
    }
  }

  async function handleSeedRules() {
    setSaving(true)
    try {
      const res = await fetch('/api/automation', { method: 'POST' })
      if (res.ok) {
        await fetchAutomation()
      }
    } catch {
      // ignore
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Preview summary */}
      {totalPending > 0 && (
        <div className="bg-teal-50 rounded-xl border border-teal-200 p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
            <Timer className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-1">
              {totalPending} {totalPending === 1 ? 'automation' : 'automationer'} schemalagda
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(pendingCounts).map(([type, count]) => {
                const cfg = RULE_TYPE_CONFIG[type]
                return cfg ? (
                  <span key={type} className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg}`}>
                    {count} {cfg.label.toLowerCase()}
                  </span>
                ) : null
              })}
            </div>
          </div>
        </div>
      )}

      {/* Rules */}
      {rules.length > 0 ? (
        <div className="space-y-3">
          {rules.map(rule => (
            <AutomationRuleCard
              key={rule.rule_id}
              rule={rule}
              pendingCount={pendingCounts[rule.rule_type] || 0}
              onToggle={() => handleToggle(rule.rule_id, rule.enabled)}
              onUpdate={(field, value) => handleUpdate(rule.rule_id, field, value)}
              saving={saving}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Zap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700 mb-1">Inga automationsregler</p>
          <p className="text-xs text-gray-500 mb-4">
            Skapa standardregler för offertuppföljning, bokningspåminnelser och mer.
          </p>
          <button
            onClick={handleSeedRules}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50 transition-all shadow-sm"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin inline mr-1" />
            ) : (
              <Zap className="w-4 h-4 inline mr-1" />
            )}
            Skapa standardregler
          </button>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-bold text-gray-900">Senaste automationer</span>
          {history.length > 0 && (
            <span className="text-xs text-gray-400 ml-auto">{history.length} senaste</span>
          )}
        </div>
        <AutomationHistoryList items={history} />
      </div>
    </div>
  )
}

// ── Manual Trigger ─────────────────────────────────────────────────────

function ManualTrigger({ businessId, onTriggered }: {
  businessId: string; onTriggered: () => void
}) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [elapsed, setElapsed] = useState(0)

  async function handleTrigger() {
    if (!instruction.trim()) return
    setLoading(true)
    setResult(null)
    setElapsed(0)
    const timer = setInterval(() => setElapsed(s => s + 1), 1000)
    try {
      const response = await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trigger_type: 'manual',
          trigger_data: { instruction: instruction.trim() },
        }),
      })
      const data = await response.json()
      if (response.ok) {
        setResult({ type: 'success', message: `Klart — ${data.tool_calls || 0} verktygsanrop, ${((data.duration_ms || 0) / 1000).toFixed(1)}s` })
        setInstruction('')
        onTriggered()
      } else {
        setResult({ type: 'error', message: data.error || `Fel (${response.status})` })
      }
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Nätverksfel — kunde inte nå servern' })
    } finally {
      clearInterval(timer)
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-5 h-5 text-teal-600" />
        <h3 className="text-sm font-bold text-gray-900">Ge agenten en uppgift</h3>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleTrigger()}
          placeholder="T.ex. &quot;Sök kund med nummer +46701234567 och skapa en offert&quot;"
          className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          disabled={loading}
        />
        <button
          onClick={handleTrigger}
          disabled={loading || !instruction.trim()}
          className="px-4 py-2.5 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm shadow-teal-500/20"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {loading ? `${elapsed}s…` : 'Kör'}
        </button>
      </div>
      {result && (
        <div className={`mt-3 px-3 py-2 rounded-lg text-sm ${
          result.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {result.type === 'success' ? <CheckCircle2 className="w-4 h-4 inline mr-1.5" /> : <XCircle className="w-4 h-4 inline mr-1.5" />}
          {result.message}
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
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(DEFAULT_SETTINGS)
  const [savingSettings, setSavingSettings] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'automations' | 'pipeline'>('overview')
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
          <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center shadow-sm shadow-teal-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">AI-assistent</h1>
            <p className="text-sm text-gray-500">Laddar...</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center shadow-sm shadow-teal-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">AI-assistent</h1>
            <p className="text-sm text-gray-500">Realtidsöversikt</p>
          </div>
          <div className="flex items-center gap-1.5 ml-4 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700"> Realtid</span>
          </div>
          {/* Google integration status badges */}
          {googleStatus && (
            <div className="flex items-center gap-2 ml-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
                googleStatus.connected
                  ? 'bg-teal-50 border-teal-200 text-teal-800'
                  : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}>
                <Calendar className="w-3 h-3" />
                {googleStatus.connected ? 'Kalender' : 'Kalender av'}
              </div>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
                googleStatus.gmailSyncEnabled
                  ? googleStatus.gmailSendEnabled
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-teal-50 border-teal-200 text-teal-800'
                  : 'bg-gray-50 border-gray-200 text-gray-400'
              }`}>
                <MailCheck className="w-3 h-3" />
                {googleStatus.gmailSendEnabled
                  ? 'Gmail R+S'
                  : googleStatus.gmailSyncEnabled
                    ? 'Gmail läs'
                    : 'Gmail av'}
              </div>
              {!googleStatus.connected && (
                <a href="/dashboard/settings?tab=integrations" className="text-xs text-teal-700 hover:underline flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  Koppla
                </a>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
            showSettings
              ? 'bg-teal-50 border-teal-200 text-teal-800'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Shield className="w-4 h-4" />
          AI-inställningar
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'overview'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity className="w-4 h-4" />
          Översikt
        </button>
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'pipeline'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Target className="w-4 h-4" />
          Leads & Pipeline
        </button>
        <button
          onClick={() => setActiveTab('automations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'automations'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Zap className="w-4 h-4" />
          Automationer
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

      {activeTab === 'overview' ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Utförda uppgifter" value={stats?.total_runs || 0} icon={Bot} color="bg-teal-600" />
            <StatCard label="Åtgärder" value={stats?.total_tool_calls || 0} icon={Zap} color="bg-teal-500" />
            <StatCard label="Lyckade" value={successRate} suffix="%" icon={CheckCircle2} color="bg-emerald-500" />
            <StatCard label="Snitt tid" value={formatDuration(stats?.avg_duration_ms || 0)} icon={Clock} color="bg-teal-500" />
          </div>

          {/* Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
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

          {/* Feed + Detail */}
          <div className={`grid gap-5 ${selectedRun ? 'grid-cols-1 lg:grid-cols-[400px_1fr]' : 'grid-cols-1'}`}>
            {/* Activity Feed */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">Agentaktivitet</span>
                <div className="flex gap-1">
                  {[
                    { key: 'all', label: 'Alla' },
                    { key: 'phone_call', label: 'Samtal', icon: Phone },
                    { key: 'incoming_sms', label: 'SMS', icon: MessageSquare },
                    { key: 'manual', label: 'Manuell', icon: Settings2 },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFilterType(f.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        filterType === f.key
                          ? 'bg-teal-50 text-teal-700 border border-teal-200'
                          : 'text-gray-500 border border-transparent hover:bg-gray-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
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
        </>
      ) : activeTab === 'pipeline' ? (
        <PipelineTab businessId={business.business_id} />
      ) : (
        <AutomationTab businessId={business.business_id} />
      )}
    </div>
  )
}
