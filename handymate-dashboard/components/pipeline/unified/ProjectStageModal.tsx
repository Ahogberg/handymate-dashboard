'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ExternalLink, X } from 'lucide-react'
import { agentMeta, fmtKr, relativeTime } from './flow-constants'
import styles from './ProjectStageModal.module.css'

// ─── Types ──────────────────────────────────────────────────────────

interface WorkflowStage {
  id: string
  name: string
  position: number
  color: string
  icon: string
  status: 'done' | 'current' | 'upcoming'
  completed_at: string | null
  planned_date: string | null
}

interface WorkflowResponse {
  project: {
    id: string
    name: string
    customer_name: string | null
    amount: number | null
    start_date: string | null
    end_date: string | null
    category: string | null
  }
  current_stage: {
    id: string
    name: string
    position: number
    color: string
    icon: string
  } | null
  stages: WorkflowStage[]
  latest_automation: {
    agent: string
    action: string
    rule_name: string | null
    action_type: string | null
    created_at: string
  } | null
}

interface ProjectStageModalProps {
  projectId: string | null
  onClose: () => void
}

// ─── Helpers ────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

function fmtDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return ''
  if (start && end) return `${fmtDate(start)}–${fmtDate(end)}`
  return fmtDate(start || end)
}

// ─── Component ──────────────────────────────────────────────────────

export function ProjectStageModal({ projectId, onClose }: ProjectStageModalProps) {
  const [data, setData] = useState<WorkflowResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Fetch workflow-data när modalen öppnas
  const fetchWorkflow = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${id}/workflow`)
      if (!res.ok) throw new Error('Kunde inte hämta projekt-stages')
      const payload = await res.json()
      setData(payload)
    } catch (err) {
      console.error('[ProjectStageModal] fetch failed:', err)
      setToast({ msg: 'Kunde inte ladda projekt-stages', type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (projectId) {
      fetchWorkflow(projectId)
    } else {
      setData(null)
    }
  }, [projectId, fetchWorkflow])

  // ESC stänger modalen
  useEffect(() => {
    if (!projectId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [projectId, onClose])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleAdvance = useCallback(
    async (toStageId?: string) => {
      if (!projectId || !data) return

      // Bekräftelse-dialog för manuella stage-byten (klick på stage i listan)
      if (toStageId && data.current_stage) {
        const target = data.stages.find(s => s.id === toStageId)
        if (!target) return
        // Hoppa till exakt nuvarande stage = ingen-op
        if (target.id === data.current_stage.id) return
        const ok = window.confirm(
          `Säker på att du vill flytta från "${data.current_stage.name}" till "${target.name}"? Detta triggar automatiseringar.`
        )
        if (!ok) return
      }

      setAdvancing(true)
      try {
        const res = await fetch(`/api/projects/${projectId}/advance-stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toStageId ? { to_stage_id: toStageId } : {}),
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || 'Kunde inte flytta stage')
        }
        const result = await res.json()
        setToast({
          msg: `Flyttad till ${result.new_stage.name}. Lars informerar kund automatiskt.`,
          type: 'success',
        })
        // Refetch för fresh data inkl. ny AI-automation
        await fetchWorkflow(projectId)
      } catch (err: any) {
        setToast({ msg: err.message || 'Kunde inte flytta stage', type: 'error' })
      } finally {
        setAdvancing(false)
      }
    },
    [projectId, data, fetchWorkflow]
  )

  if (!projectId) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.card} onClick={e => e.stopPropagation()}>
          {loading && !data ? (
            <div className={styles.loading}>Laddar projekt-stages…</div>
          ) : data ? (
            <>
              {/* Header */}
              <div className={styles.header}>
                <Link
                  href={`/dashboard/projects/${data.project.id}`}
                  className={styles.openProjectBtn}
                  title="Öppna full projektsida"
                >
                  <ExternalLink size={11} /> Öppna projekt
                </Link>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={onClose}
                  aria-label="Stäng"
                >
                  <X size={18} />
                </button>

                <div className={styles.badgeRow}>
                  {data.project.category && (
                    <span
                      className={styles.stageBadge}
                      style={{ background: '#F1F5F9', color: '#475569' }}
                    >
                      {data.project.category}
                    </span>
                  )}
                  {data.current_stage && (
                    <span
                      className={styles.stageBadge}
                      style={{
                        background: data.current_stage.color + '22',
                        color: data.current_stage.color,
                      }}
                    >
                      {data.current_stage.icon} Steg {data.current_stage.position}/8 · {data.current_stage.name}
                    </span>
                  )}
                </div>
                <h2 className={styles.title}>{data.project.name}</h2>
                <div className={styles.subtitle}>
                  {data.project.customer_name && <span>{data.project.customer_name}</span>}
                  {data.project.customer_name && data.project.amount != null && <span className={styles.sep}>·</span>}
                  {data.project.amount != null && <span>{fmtKr(data.project.amount)}</span>}
                  {(data.project.start_date || data.project.end_date) && <span className={styles.sep}>·</span>}
                  {(data.project.start_date || data.project.end_date) && (
                    <span>{fmtDateRange(data.project.start_date, data.project.end_date)}</span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className={styles.body}>
                <h3 className={styles.sectionLabel}>Projekt-tidslinje · {data.stages.length} stages</h3>
                <div className={styles.stageList}>
                  {data.stages.map(stage => {
                    const dateText =
                      stage.status === 'done'
                        ? `Klart · ${fmtDate(stage.completed_at)}`
                        : stage.status === 'current'
                          ? `Pågår · planerat ${fmtDate(stage.planned_date)}`
                          : `Planerat ${fmtDate(stage.planned_date)}`
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        className={`${styles.stage} ${styles[stage.status]}`}
                        style={
                          {
                            '--stage-color': stage.color,
                            '--stage-soft': stage.color + '1A',
                          } as React.CSSProperties
                        }
                        onClick={() => handleAdvance(stage.id)}
                        disabled={advancing}
                      >
                        <div className={styles.marker}>{stage.icon}</div>
                        <div className={styles.stageBody}>
                          <div className={styles.stageName}>{stage.name}</div>
                          <div className={styles.stageDate}>{dateText}</div>
                        </div>
                        {stage.status === 'done' && (
                          <Check size={18} className={styles.checkIcon} strokeWidth={2.5} />
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Latest AI automation */}
                {data.latest_automation ? (
                  (() => {
                    const meta = agentMeta(data.latest_automation.agent)
                    return (
                      <div
                        className={styles.aiStrip}
                        style={{ '--ai-color': meta.color } as React.CSSProperties}
                      >
                        <div className={styles.aiAvatar}>{meta.icon}</div>
                        <div className={styles.aiText}>
                          <div className={styles.aiHeader}>Senaste automation</div>
                          <div className={styles.aiAction}>
                            <strong>{meta.name}:</strong> {data.latest_automation.action}
                          </div>
                        </div>
                        <div className={styles.aiWhen}>
                          {relativeTime(data.latest_automation.created_at)}
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  <div className={styles.aiEmpty}>Ingen AI-aktivitet ännu</div>
                )}
              </div>

              {/* Footer */}
              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.advanceBtn}
                  onClick={() => handleAdvance()}
                  disabled={advancing || !data.current_stage || data.current_stage.position >= data.stages.length}
                >
                  {advancing ? (
                    <>
                      <span className={styles.spinner} />
                      Flyttar…
                    </>
                  ) : !data.current_stage ? (
                    <>
                      <ArrowRight size={16} />
                      Starta första stage
                    </>
                  ) : data.current_stage.position >= data.stages.length ? (
                    'Projektet är klart'
                  ) : (
                    <>
                      <ArrowRight size={16} />
                      Flytta till nästa stage
                    </>
                  )}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.error : ''}`}>
          {toast.msg}
        </div>
      )}
    </>
  )
}
