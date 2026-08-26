/**
 * Konstanter för Flödet-vyn (unified pipeline).
 * System-stages speglar SQL-seed i sql/v39_project_stages.sql exakt.
 */

import { PROJECT_SYSTEM_STAGES, type ProjectSystemStage } from '@/lib/project-stages/stages'

export interface FlowSystemStage {
  id: string
  name: string
  short: string
  color: string
  icon: string
  position: number
}

// EN källa sedan 2026-08-26: lib/project-stages/stages.ts (delas med
// motorn). Tidigare en handsynkad kopia här.
export const FLOW_SYSTEM_STAGES: FlowSystemStage[] = PROJECT_SYSTEM_STAGES.map((s: ProjectSystemStage) => ({ ...s }))

export function getStageByPosition(pos: number): FlowSystemStage | undefined {
  return FLOW_SYSTEM_STAGES.find(s => s.position === pos)
}

export function getStageById(id: string | null | undefined): FlowSystemStage | undefined {
  if (!id) return undefined
  return FLOW_SYSTEM_STAGES.find(s => s.id === id)
}

/** Branschkategorier — färgmappning för deal.category-badge */
export interface FlowCategoryMeta {
  color: string
  bg: string
  icon: string
}

export const FLOW_CATEGORIES: Record<string, FlowCategoryMeta> = {
  El:     { color: '#F59E0B', bg: '#FEF3C7', icon: '⚡' },
  VVS:    { color: '#0284C7', bg: '#DBEAFE', icon: '🚿' },
  Bygg:   { color: '#7C3AED', bg: '#EDE9FE', icon: '🔨' },
  Måleri: { color: '#DC2626', bg: '#FEE2E2', icon: '🎨' },
  Mark:   { color: '#16A34A', bg: '#DCFCE7', icon: '🌱' },
}

export function categoryMeta(cat: string | null | undefined): FlowCategoryMeta {
  if (!cat) return { color: '#64748B', bg: '#F1F5F9', icon: '·' }
  return FLOW_CATEGORIES[cat] || { color: '#64748B', bg: '#F1F5F9', icon: '·' }
}

export function fmtKr(n: number | null | undefined): string {
  if (n == null) return '0 kr'
  if (n >= 1000) return new Intl.NumberFormat('sv-SE').format(n) + ' kr'
  return n + ' kr'
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + ' mkr'
  if (n >= 1000) return Math.round(n / 1000) + 'k'
  return String(n)
}

/** Räknar antal dagar mellan idag och target. Negativt = försenat. */
export function daysFromNow(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(isoDate)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 86400000)
}

/** Agentmeta — namn, roll, färg och avatar-emoji per backoffice-agent */
export interface FlowAgentMeta {
  name: string
  role: string
  icon: string
  color: string
}

export const FLOW_AGENTS: Record<string, FlowAgentMeta> = {
  matte:  { name: 'Matte',  role: 'Chefsagent',  icon: '🎩', color: '#0F766E' },
  karin:  { name: 'Karin',  role: 'Ekonom',          icon: '💰', color: '#0369A1' },
  hanna:  { name: 'Hanna',  role: 'Marknadschef',    icon: '⭐', color: '#059669' },
  daniel: { name: 'Daniel', role: 'Säljare',         icon: '🤝', color: '#B45309' },
  lars:   { name: 'Lars',   role: 'Projektledare',   icon: '🔨', color: '#7C3AED' },
}

export function agentMeta(agentId: string | null | undefined): FlowAgentMeta {
  if (!agentId) return FLOW_AGENTS.matte
  return FLOW_AGENTS[agentId.toLowerCase()] || FLOW_AGENTS.matte
}

/** "2t sedan", "20min sedan", "idag 09:14" — relative timestamp på svenska */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'just nu'
  if (min < 60) return `${min}min sedan`
  const hours = Math.floor(diffMs / 3600000)
  if (hours < 24) return `${hours}t sedan`
  const days = Math.floor(diffMs / 86400000)
  if (days < 7) return `${days}d sedan`
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}
