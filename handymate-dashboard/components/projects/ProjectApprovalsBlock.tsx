'use client'

import { reviewedApprovalFetch } from '@/lib/approvals/review-client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { createProjectApprovalReadGuard, loadProjectApprovalPage } from '@/lib/projects/load-project-approvals'
import type { ApprovalDisplay } from '@/lib/jarvis/approval-view'
import { projectApprovalPresentation } from '@/lib/projects/project-approval-presentation'
import { APPROVAL_EDIT_REVIEW_LABEL } from '@/lib/approvals/presentation'

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
  display?: ApprovalDisplay
}

interface ProjectApprovalsBlockProps {
  projectId: string
  onReadStateChange?: (state: ProjectApprovalsReadState) => void
}

export type ProjectApprovalsReadState = {
  status: 'loading' | 'error' | 'partial' | 'complete'
  count: number
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

export default function ProjectApprovalsBlock({ projectId, onReadStateChange }: ProjectApprovalsBlockProps) {
  const business = useBusiness()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [readState, setReadState] = useState<ProjectApprovalsReadState>({ status: 'loading', count: 0 })
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [readingMore, setReadingMore] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const readGuard = useRef(createProjectApprovalReadGuard())
  const approvalsRef = useRef<Approval[]>([])
  const scope = `${business?.business_id || ''}:${projectId}`
  const scopeRef = useRef(scope)
  scopeRef.current = scope

  const fetchApprovals = useCallback(async (offset = 0) => {
    if (!business?.business_id) return
    const sequence = readGuard.current.begin()
    const controller = new AbortController()
    setError(null)
    if (offset === 0) {
      approvalsRef.current = []
      setApprovals([])
      setNextOffset(null)
      setLoadedScope(null)
      setReadState({ status: 'loading', count: 0 })
      setError(null)
      setBusyId(null)
      setEditingId(null)
    } else {
      setReadingMore(true)
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const page = await loadProjectApprovalPage<Approval>(projectId, session?.access_token, offset, controller.signal)
      if (!readGuard.current.isCurrent(sequence)) return
      const combined = offset === 0 ? page.approvals : [...approvalsRef.current, ...page.approvals]
      const unique = Array.from(new Map(combined.map(approval => [approval.id, approval] as const)).values())
      approvalsRef.current = unique
      setApprovals(unique)
      setReadState({ status: page.nextOffset === null ? 'complete' : 'partial', count: unique.length })
      setNextOffset(page.nextOffset)
      setLoadedScope(scope)
    } catch (readError) {
      if (!readGuard.current.isCurrent(sequence) || (readError instanceof DOMException && readError.name === 'AbortError')) return
      setError('Kunde inte läsa besluten — försök igen')
      setReadState(previous => ({ status: 'error', count: previous.count }))
      setLoadedScope(scope)
    } finally {
      if (readGuard.current.isCurrent(sequence)) setReadingMore(false)
    }
  }, [business?.business_id, projectId, scope])

  useEffect(() => {
    approvalsRef.current = []
    setApprovals([])
    setLoadedScope(null)
    setReadState({ status: 'loading', count: 0 })
    if (business?.business_id) fetchApprovals(0)
    return () => { readGuard.current.invalidate() }
  }, [business?.business_id, fetchApprovals])

  useEffect(() => {
    if (!business?.business_id) return
    const channel = supabase
      .channel(`project-approvals-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pending_approvals', filter: `business_id=eq.${business.business_id}` },
        () => fetchApprovals(0),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [business?.business_id, projectId, fetchApprovals])

  useEffect(() => { onReadStateChange?.(readState) }, [onReadStateChange, readState])

  async function act(approval: Approval, action: 'approve' | 'reject' | 'edit', editedText?: string) {
    const actionScope = scope
    setBusyId(approval.id)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body: Record<string, unknown> = { action }
      if (action === 'edit') {
        const key = getEditableKey(approval)
        if (key && editedText != null) body.edited_payload = { [key]: editedText }
      }
      const res = await reviewedApprovalFetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (res.status === 499) return
      if (!res.ok) {
        if (scopeRef.current !== actionScope) return
        setError('Kunde inte spara — försök igen')
        return
      }
      const result = await res.json().catch(() => null)
      if (scopeRef.current !== actionScope) return
      if (result?.execution_outcome?.outcome === 'failed' || ['partial', 'failed', 'needs_action'].includes(result?.receipt?.state)) { setError(result?.receipt?.text || result.execution_outcome?.error_text || 'Handlingen misslyckades'); return }
      setEditingId(null)
      // A pending row disappeared from the server-side result set. Reload
      // offset zero so a previously returned next_offset cannot skip the row
      // that shifted into the earlier page.
      await fetchApprovals(0)
    } catch {
      if (scopeRef.current !== actionScope) return
      setError('Kunde inte spara — försök igen')
    } finally {
      if (scopeRef.current === actionScope) setBusyId(null)
    }
  }

  if (readState.status === 'loading' || loadedScope !== scope) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-card p-4 flex items-center justify-center min-h-[72px]">
        <Loader2 className="w-4 h-4 text-gray-300 animate-spin" />
      </div>
    )
  }

  if (approvals.length === 0) {
    if (readState.status === 'complete') return null
    return (
      <div className="bg-white border border-amber-300 rounded-card p-4 text-sm text-amber-800">
        <p>{error || 'Det kan finnas fler beslut för projektet.'}</p>
        <button type="button" onClick={() => fetchApprovals(readState.status === 'error' ? 0 : (nextOffset || 0))} className="mt-2 font-semibold text-primary-700 hover:text-primary-800">
          {readState.status === 'error' ? 'Försök igen' : 'Visa fler beslut'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
          <span>{error}</span>
          {readState.status === 'error' && (
            <button type="button" onClick={() => fetchApprovals(0)} className="ml-2 font-semibold text-primary-700 hover:text-primary-800">Försök igen</button>
          )}
        </div>
      )}
      {approvals.map(approval => {
        const presentation = projectApprovalPresentation(approval)
        const agentKey = presentation.agent
        const agent = AGENT_INFO[agentKey]
        const preview = getPreview(approval)
        const editable = getEditableKey(approval) != null
        const label = presentation.type_label
        const editing = editingId === approval.id
        const busy = busyId === approval.id

        return (
          // Etapp D3 (reskin, 2026-08-17): mockupens Godkänn-kort-chrome —
          // grad-tint-bakgrund + teal-tonad ram + rounded-card, samma
          // formspråk som Etapp C:s GorDettaForst. Beteendet (approve/
          // reject/edit, realtime) är orört.
          <div key={approval.id} className="rounded-card border border-primary-600/30 bg-grad-tint p-4">
            <div className="flex items-center gap-2.5 mb-2">
              {/* SPÅR D2 (2026-08-06): kortet var identiskt med IdagCore:s
                  godkännandekort så när som på två oavsiktliga skillnader —
                  30 px avatar mot 36, och "har förberett" mot "föreslår".
                  Samma agent som gör samma sak ska heta samma sak.
                  Verbet bär rösten: berättar / föreslår / frågar. */}
              <AgentAvatar agentKey={agentKey} />
              <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">
                <b className="font-semibold text-gray-900">{agent.name}</b> · {agent.role}
              </span>
              <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 whitespace-nowrap">
                Väntar på dig
              </span>
            </div>

            <h3 className="font-heading text-[15px] font-semibold text-gray-900 leading-snug mb-1">
              {approval.title}
              <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {label}
              </span>
            </h3>
            {approval.description && (
              <p className="text-[13px] text-gray-500 leading-relaxed mb-2">{approval.description}</p>
            )}

            {preview && !editing && (
              <div className="text-[13px] text-gray-600 italic bg-white border border-slate-200 rounded-lg px-3 py-2.5 mb-3">
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
                    {APPROVAL_EDIT_REVIEW_LABEL}
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
                    {presentation.approve_label}
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
      {nextOffset !== null && (
        <button type="button" disabled={readingMore} onClick={() => fetchApprovals(nextOffset)} className="w-full h-11 rounded-lg border border-primary-300 bg-white text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50">
          {readingMore ? 'Läser fler…' : 'Visa fler beslut'}
        </button>
      )}
    </div>
  )
}
