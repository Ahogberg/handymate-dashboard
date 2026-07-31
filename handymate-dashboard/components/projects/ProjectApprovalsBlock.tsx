'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'

/**
 * ProjectApprovalsBlock (Projektvy Fas 1, 2026-07-31).
 *
 * Godkänn-korten i projektets nya "Att göra"-block. Hämtar samma
 * pending_approvals-tabell och anropar samma /api/approvals/[id]-endpoint
 * som IdagCore.tsx (Idag-vyn) — ingen egen godkännande-logik. Skillnaden
 * mot IdagCore är filtreringen: bara ärenden vars payload.project_id
 * matchar detta projekt (payload.project_id är den etablerade konventionen
 * — se app/api/approvals/[id]/route.ts och lib/proactive-care.ts m.fl.).
 *
 * Persona-kartan kommer från components/dashboard/agentPersonas.ts
 * (extraherad ur IdagCore i samma commit) så avatar-färg/initialer är
 * identiska mellan Idag-vyn och projektvyn.
 *
 * Förenkling mot IdagCore (medveten, dokumenterad i handoff-rapporten):
 * inget 5-sekunders ångra-fönster här — Godkänn/Avvisa skickar direkt.
 * Samma /api/approvals/[id]-anrop och payload-form, bara utan den extra
 * UI-mekaniken. "Ändra" redigerar inline precis som i IdagCore för
 * ärenden med redigerbar message/sms_text.
 */

interface Approval {
  id: string
  business_id: string
  approval_type: string
  title: string
  description: string | null
  payload: Record<string, unknown>
  status: string
  risk_level: string | null
  created_at: string
  expires_at: string
}

interface ProjectApprovalsBlockProps {
  projectId: string
  /** Rapporterar aktuellt antal väntande ärenden till parent (badge + tomt-läge). */
  onCountChange?: (count: number) => void
}

function getAgentKey(approval: Approval): string {
  const routed = (approval.payload?.routed_agent as string) || (approval.payload?.agent_id as string) || null
  if (routed && AGENT_INFO[routed]) return routed
  const t = approval.approval_type
  if (t.includes('invoice') || t.includes('payment') || t === 'profitability_warning') return 'karin'
  if (t.includes('campaign') || t.includes('neighbour') || t.includes('reactivat') || t.includes('review')) return 'hanna'
  if (t.includes('quote') || t.includes('lead') || t.includes('pipeline')) return 'daniel'
  if (t.includes('booking') || t.includes('project') || t.includes('dispatch') || t.includes('job_report') || t.includes('warranty')) return 'lars'
  if (t.includes('call') || t.includes('sms')) return 'lisa'
  return 'matte'
}

function getPreview(approval: Approval): string {
  const pl = approval.payload as any
  if (pl.message) return String(pl.message).slice(0, 200)
  if (pl.sms_text) return String(pl.sms_text).slice(0, 200)
  return ''
}

function getEditableKey(approval: Approval): 'message' | 'sms_text' | null {
  if (typeof approval.payload?.message === 'string') return 'message'
  if (typeof approval.payload?.sms_text === 'string') return 'sms_text'
  return null
}

const TYPE_LABEL: Record<string, string> = {
  send_sms: 'SMS',
  send_quote: 'Offert',
  send_invoice: 'Faktura',
  create_booking: 'Bokning',
  quote_nudge: 'Manuell åtgärd',
  review_request: 'Recension',
  confirm_payment: 'Betalning',
  review_auto_invoice: 'Faktura',
}

export default function ProjectApprovalsBlock({ projectId, onCountChange }: ProjectApprovalsBlockProps) {
  const business = useBusiness()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchApprovals = useCallback(async () => {
    if (!business?.business_id) return
    const { data, error: err } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('business_id', business.business_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)
    if (!err) {
      const filtered = (data || []).filter(
        (a: Approval) => (a.payload as any)?.project_id === projectId,
      )
      setApprovals(filtered)
    }
    setLoaded(true)
  }, [business?.business_id, projectId])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

  useEffect(() => {
    if (!business?.business_id) return
    const channel = supabase
      .channel(`project-approvals-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pending_approvals', filter: `business_id=eq.${business.business_id}` },
        () => fetchApprovals(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [business?.business_id, projectId, fetchApprovals])

  useEffect(() => {
    if (loaded) onCountChange?.(approvals.length)
  }, [approvals.length, loaded, onCountChange])

  async function act(approval: Approval, action: 'approve' | 'reject' | 'edit', editedText?: string) {
    setBusyId(approval.id)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body: Record<string, unknown> = { action }
      if (action === 'edit') {
        const key = getEditableKey(approval)
        if (key && editedText != null) body.edited_payload = { [key]: editedText }
      }
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError('Kunde inte spara — försök igen')
        return
      }
      setApprovals(prev => prev.filter(a => a.id !== approval.id))
      setEditingId(null)
    } catch {
      setError('Kunde inte spara — försök igen')
    } finally {
      setBusyId(null)
    }
  }

  if (!loaded) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-center min-h-[72px]">
        <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
      </div>
    )
  }

  if (approvals.length === 0) return null

  return (
    <div className="space-y-2">
      {error && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
          {error}
        </div>
      )}
      {approvals.map(approval => {
        const agentKey = getAgentKey(approval)
        const agent = AGENT_INFO[agentKey]
        const preview = getPreview(approval)
        const editable = getEditableKey(approval) != null
        const label = TYPE_LABEL[approval.approval_type] || approval.approval_type
        const editing = editingId === approval.id
        const busy = busyId === approval.id

        return (
          <div key={approval.id} className="rounded-xl border border-[#E2E8F0] bg-gradient-to-br from-primary-50/60 to-white p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className={`w-[30px] h-[30px] rounded-full ${agent.color} flex items-center justify-center flex-shrink-0 text-white text-xs font-bold`}
              >
                {agent.initials}
              </div>
              <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">
                <b className="font-semibold text-gray-900">{agent.name}</b> har förberett
              </span>
              <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 whitespace-nowrap">
                Skickas efter ditt OK
              </span>
            </div>

            <h3 className="text-[15px] font-semibold text-gray-900 leading-snug mb-1">
              {approval.title}
              <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {label}
              </span>
            </h3>
            {approval.description && (
              <p className="text-[13px] text-gray-500 leading-relaxed mb-2">{approval.description}</p>
            )}

            {preview && !editing && (
              <div className="text-[13px] text-gray-600 italic bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 mb-3">
                &quot;{preview}&quot;
              </div>
            )}
            {editing && (
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="w-full text-sm text-gray-800 border border-primary-300 rounded-lg px-3 py-2.5 mb-3 min-h-[76px] resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {editing ? (
                <>
                  <button
                    onClick={() => act(approval, 'edit', editText)}
                    disabled={busy}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Spara &amp; godkänn
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="h-11 px-3 text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors"
                  >
                    Avbryt
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => act(approval, 'approve')}
                    disabled={busy}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 px-4 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Godkänn
                  </button>
                  {editable && (
                    <button
                      onClick={() => { setEditingId(approval.id); setEditText(preview) }}
                      disabled={busy}
                      className="h-11 px-4 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg border border-gray-300 transition-colors disabled:opacity-50"
                    >
                      Ändra
                    </button>
                  )}
                  <button
                    onClick={() => act(approval, 'reject')}
                    disabled={busy}
                    className="h-11 px-3 inline-flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    Avvisa
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
