'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Calendar, Check } from 'lucide-react'
import type { Deal, Stage } from '@/app/dashboard/pipeline/types'
import {
  FLOW_SYSTEM_STAGES,
  categoryMeta,
  fmtKr,
  fmtCompact,
  daysFromNow,
  getStageById,
  agentMeta,
  relativeTime,
  type FlowSystemStage,
} from './flow-constants'
import { timeAgo } from '@/app/dashboard/pipeline/helpers'
import styles from './flow.module.css'

// ────────────────────────────────────────────────────────────────────────────
// FlowPipeline — den unified vyn (Sales Kanban + Project Execution side-by-side)
// ────────────────────────────────────────────────────────────────────────────

interface FlowPipelineProps {
  /** Alla deals med berikat project-objekt från /api/pipeline/deals */
  deals: Deal[]
  /**
   * Aktiva projekt UTAN deal_id — manuellt skapade eller äldre projekt
   * som inte gått via "Vunnen offert"-flödet. Visas också i höger panel
   * tillsammans med deal-kopplade projekt.
   */
  orphanProjects?: NonNullable<Deal['project']>[]
  /** Pipeline stages (Ny förfrågan, Kontaktad osv) — säljtrattens kolumner */
  stages: Stage[]
  /** Klick på deal-kort öppnar detail-modalen */
  onDealClick: (deal: Deal) => void
  /** Klick på projekt-rad navigerar till projektsidan */
  onProjectClick: (projectId: string) => void
  /** Densitet — påverkar padding på kort */
  density?: 'comfortable' | 'compact'
  /**
   * Initial split-procent (säljtrattens andel av bredden, 25-75).
   * Användaren kan dra dividern för att justera. Värdet sparas i
   * localStorage och åter-läses vid nästa rendering.
   */
  initialSplitPercent?: number
  /**
   * Drag-and-drop på deal-korten — samma handlers som kanban-vyn
   * använder. Kommer från page.tsx via PipelineContext-state.
   */
  draggingDealId: string | null
  dragOverStageId: string | null
  handleDragStart: (e: React.DragEvent, dealId: string) => void
  handleDragEnd: () => void
  handleDragOver: (e: React.DragEvent, stageId: string) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, stage: Stage) => void
  /**
   * Filter från PipelineHeader/PipelineFilters — sprids till BÅDE deals
   * och projekt så sökning + kundtyp + ansvarig fungerar för hela vyn.
   * Pilot-feedback 2026-05-19: Christoffer kunde bara söka på säljtratt.
   */
  searchTerm?: string
  customerTypeFilter?: string
  assignedToFilter?: string
  categoryFilter?: string
}

const SPLIT_STORAGE_KEY = 'verksamhetsoversikt.split'
const SPLIT_MIN = 25
const SPLIT_MAX = 75
const SPLIT_DEFAULT = 50

function clampSplit(v: number): number {
  if (!Number.isFinite(v)) return SPLIT_DEFAULT
  if (v < SPLIT_MIN) return SPLIT_MIN
  if (v > SPLIT_MAX) return SPLIT_MAX
  return v
}

export default function FlowPipeline({
  deals,
  orphanProjects = [],
  stages,
  onDealClick,
  onProjectClick,
  density = 'comfortable',
  initialSplitPercent = SPLIT_DEFAULT,
  draggingDealId,
  dragOverStageId,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  searchTerm = '',
  customerTypeFilter: customerTypeFilterProp = 'all',
  assignedToFilter = 'all',
  categoryFilter = 'all',
}: FlowPipelineProps) {
  // Filtrera bort lost-stage från unified-vyn — de visas i sin egen sidebar
  const activeStages = useMemo(() => stages.filter(s => !s.is_lost), [stages])

  // Deals i pipeline (utan lost) — vunna har project som flyttar till höger
  const pipelineDeals = useMemo(() => {
    const lostStageIds = new Set(stages.filter(s => s.is_lost).map(s => s.id))
    return deals.filter(d => !lostStageIds.has(d.stage_id))
  }, [deals, stages])

  // Projekt = alla deals med ett kopplat project + alla orphan-projekt utan deal
  const allProjects = useMemo(() => {
    const fromDeals = deals
      .map(d => ({ deal: d as Deal | null, project: d.project }))
      .filter((x): x is { deal: Deal | null; project: NonNullable<Deal['project']> } => x.project != null)
    const fromOrphans = orphanProjects.map(project => ({ deal: null as Deal | null, project }))
    return [...fromDeals, ...fromOrphans]
  }, [deals, orphanProjects])

  // Filter på höger panel — stage är projekt-lokal (workflow-position).
  // Sök/kundtyp/ansvarig kommer från parent (PipelineHeader/Filters) så
  // hela Verksamhetsöversikten respekterar samma filter konsekvent.
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const searchLower = searchTerm.trim().toLowerCase()
  const filteredProjects = useMemo(() => {
    let result = allProjects
    if (stageFilter) {
      result = result.filter(p => p.project.current_workflow_stage_id === stageFilter)
    }
    if (customerTypeFilterProp && customerTypeFilterProp !== 'all') {
      // 'unknown' matchar projekt utan customer_type
      result = result.filter(p => {
        const ct = (p.project.customer_type || '').toString()
        if (customerTypeFilterProp === 'unknown') return !ct
        return ct === customerTypeFilterProp
      })
    }
    if (assignedToFilter && assignedToFilter !== 'all') {
      result = result.filter(p => {
        const assignee = (p.deal?.assigned_to || (p.project as any).assigned_to || null) as string | null
        if (assignedToFilter === 'unassigned') return !assignee
        return assignee === assignedToFilter
      })
    }
    if (categoryFilter && categoryFilter !== 'all') {
      result = result.filter(p => {
        const cat = (p.deal?.category || (p.project as any).category || '').toString()
        if (categoryFilter === 'unknown') return !cat
        return cat === categoryFilter
      })
    }
    if (searchLower) {
      result = result.filter(p => {
        const projectName = (p.project.name || '').toLowerCase()
        const customerName = (p.deal?.customer?.name || (p.project as any).customer_name || '').toLowerCase()
        const projectNumber = String((p.project as any).project_number || '').toLowerCase()
        const dealNumber = String(p.deal?.deal_number || '').toLowerCase()
        return projectName.includes(searchLower)
          || customerName.includes(searchLower)
          || projectNumber.includes(searchLower)
          || dealNumber.includes(searchLower)
      })
    }
    return result
  }, [allProjects, stageFilter, customerTypeFilterProp, assignedToFilter, categoryFilter, searchLower])

  // Drag-resizable divider — säljtrattens andel av bredden i procent.
  const [splitPercent, setSplitPercent] = useState<number>(() => clampSplit(initialSplitPercent))
  const [isDragging, setIsDragging] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // Läs senaste sparade split från localStorage en gång vid mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(SPLIT_STORAGE_KEY)
      if (stored) {
        const parsed = parseFloat(stored)
        if (Number.isFinite(parsed)) setSplitPercent(clampSplit(parsed))
      }
    } catch { /* localStorage kan vara avstängt — kör med default */ }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Bara primärknapp / touch / pen — undvik högerklick
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const rect = bodyRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const pct = ((e.clientX - rect.left) / rect.width) * 100
    setSplitPercent(clampSplit(pct))
  }, [isDragging])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setIsDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPercent))
    } catch { /* ignore */ }
  }, [isDragging, splitPercent])

  const handleDoubleClick = useCallback(() => {
    setSplitPercent(SPLIT_DEFAULT)
    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(SPLIT_DEFAULT))
    } catch { /* ignore */ }
  }, [])

  return (
    <div
      ref={bodyRef}
      className={styles.body}
      data-dragging={isDragging || undefined}
      style={{ ['--split-percent' as any]: splitPercent }}
    >
      {/* ── VÄNSTER: Säljtratt (Kanban) ─────────────────────── */}
      <SalesPane
        deals={pipelineDeals}
        stages={activeStages}
        onDealClick={onDealClick}
        density={density}
        draggingDealId={draggingDealId}
        dragOverStageId={dragOverStageId}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
      />

      {/* ── DIVIDER ────────────────────────────────────────── */}
      <PipelineDivider
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />

      {/* ── HÖGER: Aktiva projekt ──────────────────────────── */}
      <ProjectExecutionPane
        projects={filteredProjects}
        allProjectsCount={allProjects.length}
        stageFilter={stageFilter}
        onStageFilter={setStageFilter}
        customerTypeFilter={customerTypeFilterProp === 'all' ? null : customerTypeFilterProp}
        availableCustomerTypes={Array.from(new Set(allProjects.map(p => p.project.customer_type).filter(Boolean) as string[]))}
        onProjectClick={onProjectClick}
        density={density}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sales Pane (vänster) — Kanban-kolumner
// ────────────────────────────────────────────────────────────────────────────

function SalesPane({
  deals,
  stages,
  onDealClick,
  density,
  draggingDealId,
  dragOverStageId,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDragLeave,
  handleDrop,
}: {
  deals: Deal[]
  stages: Stage[]
  onDealClick: (deal: Deal) => void
  density: 'comfortable' | 'compact'
  draggingDealId: string | null
  dragOverStageId: string | null
  handleDragStart: (e: React.DragEvent, dealId: string) => void
  handleDragEnd: () => void
  handleDragOver: (e: React.DragEvent, stageId: string) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, stage: Stage) => void
}) {
  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0)
  return (
    <div className={styles.salesPane}>
      <div className={styles.paneHead}>
        <div>
          <div className={styles.label}>Sälj</div>
          <h2>Säljtratt</h2>
          <div className={styles.paneMeta}>
            {deals.length} aktiva · {fmtKr(totalValue)}
          </div>
        </div>
      </div>
      <div className={styles.kanbanScroll}>
        <div className={styles.kanbanCols}>
          {stages.map(stage => (
            <KanbanCol
              key={stage.id}
              stage={stage}
              deals={deals.filter(d => d.stage_id === stage.id)}
              onDealClick={onDealClick}
              density={density}
              draggingDealId={draggingDealId}
              isDropTarget={dragOverStageId === stage.id}
              handleDragStart={handleDragStart}
              handleDragEnd={handleDragEnd}
              handleDragOver={handleDragOver}
              handleDragLeave={handleDragLeave}
              handleDrop={handleDrop}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function KanbanCol({
  stage,
  deals,
  onDealClick,
  density,
  draggingDealId,
  isDropTarget,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDragLeave,
  handleDrop,
}: {
  stage: Stage
  deals: Deal[]
  onDealClick: (deal: Deal) => void
  density: 'comfortable' | 'compact'
  draggingDealId: string | null
  isDropTarget: boolean
  handleDragStart: (e: React.DragEvent, dealId: string) => void
  handleDragEnd: () => void
  handleDragOver: (e: React.DragEvent, stageId: string) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, stage: Stage) => void
}) {
  const totalValue = deals.reduce((s, d) => s + (d.value || 0), 0)
  const isWon = stage.is_won
  return (
    <div
      className={`${styles.kanbanCol} ${isWon ? styles.kanbanColWon : ''}`}
      onDragOver={e => handleDragOver(e, stage.id)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, stage)}
      style={isDropTarget ? {
        outline: '2px dashed #14b8a6',
        outlineOffset: '-2px',
        background: 'rgba(13, 148, 136, 0.05)',
      } : undefined}
    >
      <div className={styles.kanbanColHead}>
        <div className={styles.kanbanColRow1}>
          <span className="dot" style={{ background: stage.color, width: 7, height: 7, borderRadius: 999 }} />
          <span className={styles.kanbanColRow1 + ' name'}>
            <span className="name" style={{ fontSize: 11.5, fontWeight: 700, color: '#0f172a' }}>{stage.name}</span>
          </span>
          <span className="count" style={{
            marginLeft: 'auto',
            fontSize: 11, fontWeight: 700,
            background: '#f1f5f9', color: '#1e293b',
            padding: '1px 7px', borderRadius: 999,
            minWidth: 20, textAlign: 'center',
          }}>{deals.length}</span>
        </div>
        <div className={styles.kanbanColValue}>{fmtKr(totalValue)}</div>
      </div>
      <div className={styles.kanbanColBody}>
        {deals.length === 0 ? (
          <div className={styles.emptyState}>{isDropTarget ? 'Släpp här' : 'Inga deals'}</div>
        ) : deals.map(deal => (
          <DealCard
            key={deal.id}
            deal={deal}
            onClick={onDealClick}
            density={density}
            stageIsWon={isWon}
            isDragging={draggingDealId === deal.id}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// DealCard — ny design med kategori-badge, stale-indikator, priority-dot
// ────────────────────────────────────────────────────────────────────────────

function DealCard({
  deal,
  onClick,
  density,
  stageIsWon,
  isDragging,
  handleDragStart,
  handleDragEnd,
}: {
  deal: Deal
  onClick: (deal: Deal) => void
  density: 'comfortable' | 'compact'
  stageIsWon: boolean
  isDragging: boolean
  handleDragStart: (e: React.DragEvent, dealId: string) => void
  handleDragEnd: () => void
}) {
  const cat = categoryMeta(deal.category)

  // Stale: ingen aktivitet på 48h+ i nuvarande stage
  const updatedDate = new Date(deal.updated_at)
  const ageMs = Date.now() - updatedDate.getTime()
  const isStale = ageMs > 48 * 3600 * 1000
  const isHighPrio = deal.priority === 'high' || deal.priority === 'urgent'

  // "Nyligen vunnen" — moved to won-stage senaste 5 min
  const justWon = stageIsWon && ageMs < 5 * 60 * 1000

  const cardClass = [
    styles.dealCard,
    density === 'compact' ? styles.dealCardCompact : '',
    isStale ? styles.dealCardStale : '',
    isHighPrio ? styles.dealCardHighPrio : '',
    justWon ? styles.dealCardJustWon : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cardClass}
      draggable
      onDragStart={e => handleDragStart(e, deal.id)}
      onDragEnd={handleDragEnd}
      onClick={() => onClick(deal)}
      style={isDragging ? { opacity: 0.4, transform: 'scale(0.97)' } : undefined}
    >
      <div className={styles.dealCardTopRow}>
        {deal.category && (
          <span className={styles.catBadge} style={{ background: cat.bg, color: cat.color }}>
            <span>{cat.icon}</span> {deal.category}
          </span>
        )}
        {deal.deal_number && <span className={styles.dealRefNum}>#{deal.deal_number}</span>}
      </div>
      <div className={styles.dealTitle}>{deal.title || 'Utan titel'}</div>
      <div className={styles.dealCust}>{deal.customer?.name || 'Okänd kund'}</div>
      <div className={styles.dealRowBot}>
        <span className={styles.dealAmount}>{fmtKr(deal.value)}</span>
        <span className={styles.timePill}>
          <span style={{ fontSize: 9 }}>⏱</span>
          {timeAgo(deal.updated_at)}
        </span>
      </div>
      {justWon && (
        <span className={styles.wonArrow}>
          <ArrowRight size={11} />
        </span>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// PipelineDivider
// ────────────────────────────────────────────────────────────────────────────

interface PipelineDividerProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
}

function PipelineDivider({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
}: PipelineDividerProps) {
  return (
    <div
      className={`${styles.divider} ${styles.dividerFeatured}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Dra för att justera fördelning mellan säljtratt och projekt. Dubbelklicka för att återställa."
      title="Dra för att ändra storlek · dubbelklicka för 50/50"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <div className="seam" style={{
        width: 60, height: '100%',
        background:
          'radial-gradient(ellipse at center, rgba(13,148,136,0.10), transparent 70%), ' +
          'linear-gradient(180deg, transparent, rgba(13,148,136,0.18) 20%, rgba(13,148,136,0.18) 80%, transparent)',
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: 1,
          background: 'linear-gradient(180deg, transparent, #2dd4bf 25%, #14b8a6 50%, #2dd4bf 75%, transparent)',
          transform: 'translateX(-50%)',
        }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className={styles.arrowPulse}>
          <ArrowRight size={18} strokeWidth={2.2} />
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ProjectExecutionPane (höger) — projekt-lista med stage-filter
// ────────────────────────────────────────────────────────────────────────────

const CUSTOMER_TYPE_LABEL: Record<string, string> = {
  private: 'Privat',
  company: 'Företag',
  brf: 'BRF',
}

function ProjectExecutionPane({
  projects,
  allProjectsCount,
  stageFilter,
  onStageFilter,
  customerTypeFilter,
  availableCustomerTypes,
  onProjectClick,
  density,
}: {
  projects: Array<{ deal: Deal | null; project: NonNullable<Deal['project']> }>
  allProjectsCount: number
  stageFilter: string | null
  onStageFilter: (id: string | null) => void
  /** Read-only — kundtyp-filter styrs nu av PipelineFilters i parent. */
  customerTypeFilter: string | null
  availableCustomerTypes: string[]
  onProjectClick: (projectId: string) => void
  density: 'comfortable' | 'compact'
}) {
  const totalValue = projects.reduce((s, p) => s + (p.project.budget_sek || 0), 0)
  const isFiltered = !!stageFilter || !!customerTypeFilter

  // Räkna projekt per stage för pillen
  const projectCountByStage: Record<string, number> = {}
  for (const p of projects) {
    const sid = p.project.current_workflow_stage_id
    if (sid) projectCountByStage[sid] = (projectCountByStage[sid] || 0) + 1
  }

  return (
    <div className={styles.execPane}>
      <div className={styles.paneHead}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.label}>Projekt</div>
          <h2>Aktiva projekt</h2>
          <div className={styles.paneMeta}>
            {projects.length} {isFiltered ? `(${allProjectsCount} totalt)` : 'pågår'} · {fmtKr(totalValue)}
          </div>
        </div>
        {/* Kundtyp-filter flyttat till PipelineFilters (Filter-knappen i
            headern) per pilot-feedback 2026-05-19 — så filter är gemensamt
            för säljtratt + projekt. availableCustomerTypes används inte
            längre här men prop:en behålls för bakåt-kompatibilitet. */}
      </div>

      <ProjectStageFilter
        active={stageFilter}
        onChange={onStageFilter}
        countsByStage={projectCountByStage}
      />

      <div className={styles.projectsList}>
        {projects.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: '#94a3b8', fontSize: 12, fontStyle: 'italic',
          }}>
            {customerTypeFilter && stageFilter
              ? `Inga ${CUSTOMER_TYPE_LABEL[customerTypeFilter] || customerTypeFilter}-projekt i den här fasen`
              : customerTypeFilter
                ? `Inga ${CUSTOMER_TYPE_LABEL[customerTypeFilter] || customerTypeFilter}-projekt aktiva`
                : stageFilter
                  ? 'Inga projekt i den här fasen'
                  : 'Inga aktiva projekt än'}
          </div>
        ) : projects.map(p => (
          <ProjectRow
            key={p.project.id}
            deal={p.deal}
            project={p.project}
            onClick={() => onProjectClick(p.project.id)}
            density={density}
          />
        ))}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ProjectStageFilter — pill-rad överst i höger panel
// ────────────────────────────────────────────────────────────────────────────

function ProjectStageFilter({
  active,
  onChange,
  countsByStage,
}: {
  active: string | null
  onChange: (id: string | null) => void
  countsByStage: Record<string, number>
}) {
  return (
    <div className={styles.stageLegend}>
      <button
        type="button"
        className={`${styles.stagePill} ${active === null ? styles.stagePillActive : ''}`}
        style={{ borderLeftColor: '#0d9488' }}
        onClick={() => onChange(null)}
      >
        <span>Alla</span>
      </button>
      {FLOW_SYSTEM_STAGES.map(s => {
        const count = countsByStage[s.id] || 0
        const isActive = active === s.id
        return (
          <button
            key={s.id}
            type="button"
            className={`${styles.stagePill} ${isActive ? styles.stagePillActive : ''}`}
            style={{ borderLeftColor: s.color }}
            onClick={() => onChange(isActive ? null : s.id)}
            title={s.name}
          >
            <span className={styles.stagePillNum}>{s.position}</span>
            <span>{s.icon}</span>
            <span>{s.short}</span>
            {count > 0 && <span className={styles.stagePillCount}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ProjectRow — projekt-rad med stage-bars + AI-strip + expand-detail
// ────────────────────────────────────────────────────────────────────────────

function ProjectRow({
  deal,
  project,
  onClick,
  density,
}: {
  /** Null när projektet saknar koppling till en deal (manuellt skapat). */
  deal: Deal | null
  project: NonNullable<Deal['project']>
  onClick: () => void
  density: 'comfortable' | 'compact'
}) {
  const [expanded, setExpanded] = useState(false)
  const cat = categoryMeta(deal?.category)
  // Kund-namn: deal.customer.name → project.customer_name (orphan) → fallback
  const customerName = deal?.customer?.name || (project as any).customer_name || null
  const category = deal?.category || null
  const currentStage = getStageById(project.current_workflow_stage_id) ||
    (project.current_stage ? FLOW_SYSTEM_STAGES.find(s => s.id === project.current_stage?.id) : undefined) ||
    FLOW_SYSTEM_STAGES[0]

  const days = daysFromNow(project.end_date)
  const isOverdue = days != null && days < 0 && project.progress_percent < 100
  const isDone = project.progress_percent >= 100 || project.status === 'completed'

  function handleRowClick(e: React.MouseEvent) {
    // Klick på "öppna projekt"-länken navigerar — annars expanderar/kollapsar
    e.stopPropagation()
    setExpanded(prev => !prev)
  }

  return (
    <div
      className={`${styles.projectRow} ${density === 'compact' ? styles.projectRowCompact : ''}`}
      style={{
        borderLeftColor: currentStage.color,
        ['--stage-color' as any]: currentStage.color,
      }}
      onClick={handleRowClick}
    >
      <div className={styles.projectRowTop}>
        <div className={styles.projectInfo}>
          <div className={styles.projectInfoName}>
            {/* ID-kontinuitet: samma N som dealens deal_number (v39-migrationen).
                Christoffer ser P-1042 = samma jobb som #1042 i säljtratten. */}
            {(project as any).project_number && (
              <span
                className={styles.dealRefNum}
                style={{ marginLeft: 0, marginRight: 8 }}
                title={deal?.deal_number ? `Tidigare Deal #${deal.deal_number}` : undefined}
              >
                P-{(project as any).project_number}
              </span>
            )}
            {project.name}
          </div>
          <div className={styles.projectInfoSub}>
            {customerName && <span>{customerName}</span>}
            {category && (
              <>
                <span className={styles.projectInfoSub + ' sep'} style={{ color: '#94a3b8' }}>·</span>
                <span className={styles.projectInfoCat} style={{ background: cat.bg, color: cat.color }}>
                  {cat.icon} {category}
                </span>
              </>
            )}
            <span style={{ color: '#94a3b8' }}>·</span>
            <span style={{ color: currentStage.color, fontWeight: 600 }}>
              {currentStage.icon} {currentStage.name}
            </span>
          </div>
        </div>
        <div className={styles.projectMeta}>
          <div className={styles.projectAmount}>{fmtKr(project.budget_sek)}</div>
          <div className={`${styles.projectDays} ${isOverdue ? styles.projectDaysOverdue : ''}`}>
            {isDone
              ? <>✓ Slutfört</>
              : isOverdue
                ? <>⚠ {Math.abs(days!)}d försenat</>
                : days != null
                  ? <>{days}d kvar · {project.progress_percent}%</>
                  : <>{project.progress_percent}%</>
            }
          </div>
        </div>
      </div>

      <StageBars currentStageId={currentStage.id} density={density} />

      {/* AI-aktivitet (live från v3_automation_logs via customer_id) */}
      {project.latest_automation && (
        <AiActivityStrip latest={project.latest_automation} />
      )}

      {/* Snabbåtgärder — pilot-feedback 2026-05-20: Christoffer vill ha
          snabbåtgärds-knappar vid varje projekt (likt deal-cards i säljtratten).
          Ring/SMS/Karta + Öppna projekt. e.stopPropagation så de inte
          triggar row-expand. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid #f1f5f9',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {deal?.customer?.phone_number && (
          <>
            <a
              href={`tel:${deal.customer.phone_number}`}
              title="Ring kund"
              style={{
                padding: '4px 8px',
                fontSize: 10,
                color: '#64748b',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 500,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f766e' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
            >
              📞 Ring
            </a>
            <a
              href={`sms:${deal.customer.phone_number}`}
              title="SMS kund"
              style={{
                padding: '4px 8px',
                fontSize: 10,
                color: '#64748b',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 500,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f766e' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
            >
              💬 SMS
            </a>
          </>
        )}
        {deal?.customer?.address_line && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deal.customer.address_line)}`}
            target="_blank"
            rel="noopener noreferrer"
            title={deal.customer.address_line}
            style={{
              padding: '4px 8px',
              fontSize: 10,
              color: '#64748b',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 500,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f766e' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
          >
            📍 Karta
          </a>
        )}
        <button
          type="button"
          onClick={() => onClick()}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
            color: '#0f766e',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Öppna projekt →
        </button>
      </div>

      {expanded && <ProjectExpandDetail currentStageId={currentStage.id} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// AiActivityStrip — visar senaste AI-aktivitet (agent-avatar + action + tid)
// ────────────────────────────────────────────────────────────────────────────

function AiActivityStrip({
  latest,
}: {
  latest: NonNullable<NonNullable<Deal['project']>['latest_automation']>
}) {
  const agent = agentMeta(latest.agent)
  return (
    <div className={styles.aiStrip} style={{ ['--ai-color' as any]: agent.color, marginTop: 8 }}>
      <div className={styles.aiAv} style={{ background: agent.color }}>{agent.icon}</div>
      <div className={styles.aiText}>
        <div>
          <span className={styles.aiName}>{agent.name}</span>
          <span className={styles.aiRole}>· {agent.role}</span>
        </div>
        <div className={styles.aiAction}>{latest.action}</div>
      </div>
      <div className={styles.aiWhen}>{relativeTime(latest.created_at)}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// StageBars — 8 färgade segment (done / current / upcoming)
// ────────────────────────────────────────────────────────────────────────────

function StageBars({ currentStageId, density }: { currentStageId: string; density: 'comfortable' | 'compact' }) {
  const currentPos = FLOW_SYSTEM_STAGES.find(s => s.id === currentStageId)?.position || 1
  return (
    <>
      <div className={`${styles.stageBars} ${density === 'compact' ? styles.stageBarsCompact : ''}`}>
        {FLOW_SYSTEM_STAGES.map(s => {
          const status = s.position < currentPos ? 'done' : s.position === currentPos ? 'current' : 'upcoming'
          const cls = [
            styles.stageSeg,
            status === 'done' ? styles.stageSegDone : '',
            status === 'current' ? styles.stageSegCurrent : '',
            status === 'upcoming' ? styles.stageSegUpcoming : '',
          ].filter(Boolean).join(' ')
          return (
            <div
              key={s.id}
              className={cls}
              style={{
                background: status === 'upcoming' ? undefined : s.color,
                ['--seg-color' as any]: s.color,
              }}
              title={`${s.position}. ${s.name}`}
            />
          )
        })}
      </div>
      <div className={styles.stageBarsLabels}>
        {FLOW_SYSTEM_STAGES.map(s => {
          const status = s.position < currentPos ? 'done' : s.position === currentPos ? 'current' : 'upcoming'
          const cls = [
            styles.stageBarsLabel,
            status === 'done' ? styles.stageBarsLabelDone : '',
            status === 'current' ? styles.stageBarsLabelCurrent : '',
          ].filter(Boolean).join(' ')
          return (
            <div
              key={s.id}
              className={cls}
              style={{ ['--stage-current-color' as any]: s.color }}
            >
              {s.icon}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Expand-detail — full 8-stage timeline med markers
// ────────────────────────────────────────────────────────────────────────────

function ProjectExpandDetail({ currentStageId }: { currentStageId: string }) {
  const currentPos = FLOW_SYSTEM_STAGES.find(s => s.id === currentStageId)?.position || 1
  return (
    <div className={styles.projectDetail}>
      <div className={styles.projectDetailHead}>Alla 8 faser</div>
      <div className={styles.detailStageList}>
        {FLOW_SYSTEM_STAGES.map(s => {
          const status = s.position < currentPos ? 'done' : s.position === currentPos ? 'current' : 'upcoming'
          const stageClass = [
            styles.detailStage,
            status === 'done' ? styles.detailStageDone : '',
            status === 'current' ? styles.detailStageCurrent : '',
            status === 'upcoming' ? styles.detailStageUpcoming : '',
          ].filter(Boolean).join(' ')
          return (
            <div
              key={s.id}
              className={stageClass}
              style={{
                ['--stage-color' as any]: s.color,
                ['--stage-soft' as any]: s.color + '2A',
              }}
            >
              <div className={styles.detailStageMarker}>{s.icon}</div>
              <div className={styles.detailStageBody}>
                <div className="nm" style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div className="dt" style={{ fontSize: 11 }}>
                  {status === 'done' && 'Klart'}
                  {status === 'current' && 'Pågår'}
                  {status === 'upcoming' && 'Kommande'}
                </div>
              </div>
              {status === 'done' && (
                <div className={styles.detailCheck}>
                  <Check size={11} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
