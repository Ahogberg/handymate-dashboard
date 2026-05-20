'use client'

import { useEffect, useState, useCallback } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { agentMeta, relativeTime } from '@/components/pipeline/unified/flow-constants'
import modalStyles from '@/components/pipeline/unified/ProjectStageModal.module.css'

/**
 * Inline-version av 8-fas-tidslinjen som tidigare bara fanns i
 * ProjectStageModal. Pilot-feedback 2026-05-20: projektklick i
 * Verksamhetsöversikt ska navigera till /dashboard/projects/[id] med
 * 8-fas-vyn synlig — den fanns inte på project-detail-sidan.
 *
 * Hämtar samma /api/projects/[id]/workflow som modalen. Stöder advance-
 * stage med samma 'requires_approval'-logik. Skillnaden mot modalen:
 * inget overlay/card-wrapper — bara stage-list + AI-strip + advance-knapp
 * inom hosts page-layout.
 */

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
    project_number: string | number | null
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

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

interface ProjectStageInlineProps {
  projectId: string
}

export function ProjectStageInline({ projectId }: ProjectStageInlineProps) {
  const [data, setData] = useState<WorkflowResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const fetchWorkflow = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${id}/workflow`)
      if (!res.ok) throw new Error('Kunde inte hämta projekt-stages')
      const payload = await res.json()
      setData(payload)
    } catch (err) {
      console.error('[ProjectStageInline] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (projectId) fetchWorkflow(projectId)
  }, [projectId, fetchWorkflow])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const handleAdvance = useCallback(
    async (toStageId?: string) => {
      if (!projectId || !data) return
      if (toStageId && data.current_stage) {
        const target = data.stages.find(s => s.id === toStageId)
        if (!target) return
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
        await fetchWorkflow(projectId)
      } catch (err: any) {
        setToast({ msg: err.message || 'Kunde inte flytta stage', type: 'error' })
      } finally {
        setAdvancing(false)
      }
    },
    [projectId, data, fetchWorkflow]
  )

  if (loading && !data) {
    return <div className={modalStyles.loading}>Laddar projekt-stages…</div>
  }
  if (!data) return null

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20 }}>
      <h3 className={modalStyles.sectionLabel}>
        Projekt-tidslinje · {data.stages.length} stages
        {data.current_stage && (
          <span style={{ color: '#94a3b8', fontWeight: 400 }}>
            {' '}· steg {data.current_stage.position}/{data.stages.length}
          </span>
        )}
      </h3>
      <div className={modalStyles.stageList}>
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
              className={`${modalStyles.stage} ${modalStyles[stage.status]}`}
              style={
                {
                  '--stage-color': stage.color,
                  '--stage-soft': stage.color + '1A',
                } as React.CSSProperties
              }
              onClick={() => handleAdvance(stage.id)}
              disabled={advancing}
            >
              <div className={modalStyles.marker}>{stage.icon}</div>
              <div className={modalStyles.stageBody}>
                <div className={modalStyles.stageName}>{stage.name}</div>
                <div className={modalStyles.stageDate}>{dateText}</div>
              </div>
              {stage.status === 'done' && (
                <Check size={18} className={modalStyles.checkIcon} strokeWidth={2.5} />
              )}
            </button>
          )
        })}
      </div>

      {data.latest_automation && (() => {
        const meta = agentMeta(data.latest_automation.agent)
        return (
          <div
            className={modalStyles.aiStrip}
            style={{ '--ai-color': meta.color, marginTop: 12 } as React.CSSProperties}
          >
            <div className={modalStyles.aiAvatar}>{meta.icon}</div>
            <div className={modalStyles.aiText}>
              <div className={modalStyles.aiHeader}>Senaste automation</div>
              <div className={modalStyles.aiAction}>
                <strong>{meta.name}:</strong> {data.latest_automation.action}
              </div>
            </div>
            <div className={modalStyles.aiWhen}>
              {relativeTime(data.latest_automation.created_at)}
            </div>
          </div>
        )
      })()}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className={modalStyles.advanceBtn}
          onClick={() => handleAdvance()}
          disabled={advancing || !data.current_stage || data.current_stage.position >= data.stages.length}
        >
          {advancing ? (
            <>
              <span className={modalStyles.spinner} />
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

      {toast && (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            borderRadius: 8,
            background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4',
            color: toast.type === 'error' ? '#991b1b' : '#166534',
            fontSize: 12,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
