'use client'

import { createContext, useContext, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type {
  Activity,
  CustomerDocument,
  CustomerOption,
  CustomerTag,
  Deal,
  DealNote,
  Stage,
  Task,
  TaskActivity,
  TeamMember,
  Toast,
} from './types'

// Thread-meddelandestrukturen är inline i page.tsx — speglar den här så att
// komponenter som DealModal kan typkolla utan importloop.
export interface DealEmailThread {
  threadId: string
  subject: string
  snippet: string
  from: string
  to: string
  date: string
  messageCount: number
  isUnread: boolean
}

export interface DealEmailMessage {
  messageId: string
  from: string
  date: string
  bodyText: string | null
  snippet: string
}

export interface SiteVisitForm {
  date: string
  time: string
  duration: string
  notes: string
  sendSms: boolean
  invitedTeam: string[]
  externalUe: string
}

export interface NewDealForm {
  title: string
  customer_id: string
  value: string
  priority: string
  description: string
  job_type: string
  source: string
  assigned_to: string
}

export interface NewCustomerForm {
  firstName: string
  lastName: string
  phone: string
  email: string
}

export interface QuickSmsTarget {
  dealId: string
  name: string
  phone: string
}

export interface NextStepPrompt {
  dealId: string
  dealTitle: string
  jobType: string
}

export interface JobTypeOption {
  id: string
  name: string
  slug: string
  color: string
}

export interface LeadSourceOption {
  id: string
  name: string
  source_type: string
  color: string | null
}

export interface SiteVisitTeamMember {
  id: string
  name: string
  phone: string | null
}

/**
 * PipelineContextValue — passthrough-context för pipeline-vyn.
 *
 * Alla useState/useCallback-anrop ligger fortfarande kvar i page.tsx.
 * Context:et exponerar dem så att utbrutna komponenter (DealModal,
 * DealCard, modaler) kan läsa/skriva utan prop-drilling.
 *
 * Reglerna:
 * - Inga affärsregler i context-valuen — bara passthrough
 * - Setters har Dispatch<SetStateAction<X>>-typer (matchar useState)
 * - Async-handlers returnerar Promise<void> där relevant
 */
export interface PipelineContextValue {
  // ─── Shared lookups ────────────────────────────────────────────────────
  business: { business_id: string; business_name?: string; contact_name?: string; [key: string]: any }
  stages: Stage[]
  deals: Deal[]
  filteredDeals: Deal[]
  customers: CustomerOption[]
  teamMembers: TeamMember[]
  jobTypeOptions: JobTypeOption[]
  leadSourceOptions: LeadSourceOption[]
  jobTypes: string[]

  // ─── Deal modal: header & rubrik-redigering ────────────────────────────
  selectedDeal: Deal | null
  setSelectedDeal: Dispatch<SetStateAction<Deal | null>>
  dealTab: 'general' | 'tasks' | 'documents' | 'messages' | 'canvas'
  setDealTab: Dispatch<SetStateAction<'general' | 'tasks' | 'documents' | 'messages' | 'canvas'>>
  editingTitle: boolean
  setEditingTitle: Dispatch<SetStateAction<boolean>>
  editTitleValue: string
  setEditTitleValue: Dispatch<SetStateAction<string>>
  editingValue: boolean
  setEditingValue: Dispatch<SetStateAction<boolean>>
  editValueInput: string
  setEditValueInput: Dispatch<SetStateAction<string>>
  editingPriority: boolean
  setEditingPriority: Dispatch<SetStateAction<boolean>>
  detailActivities: Activity[]
  detailLoading: boolean

  // ─── Deal modal: dokument ──────────────────────────────────────────────
  dealDocuments: CustomerDocument[]
  dealUploading: boolean
  dealUploadCategory: string
  setDealUploadCategory: Dispatch<SetStateAction<string>>

  // ─── Deal modal: anteckningar ──────────────────────────────────────────
  dealNotes: DealNote[]
  newNoteContent: string
  setNewNoteContent: Dispatch<SetStateAction<string>>
  editingNoteId: string | null
  setEditingNoteId: Dispatch<SetStateAction<string | null>>
  editNoteContent: string
  setEditNoteContent: Dispatch<SetStateAction<string>>
  noteSaving: boolean

  // ─── Deal modal: e-post (Gmail) ────────────────────────────────────────
  dealEmailThreads: DealEmailThread[]
  dealEmailLoading: boolean
  dealExpandedThread: string | null
  setDealExpandedThread: Dispatch<SetStateAction<string | null>>
  dealThreadMessages: Record<string, DealEmailMessage[]>
  dealThreadLoading: boolean

  // ─── Deal modal: uppgifter ─────────────────────────────────────────────
  dealTasks: Task[]
  showDealTaskPresetPicker: boolean
  setShowDealTaskPresetPicker: Dispatch<SetStateAction<boolean>>
  newTaskTitle: string
  setNewTaskTitle: Dispatch<SetStateAction<string>>
  newTaskDescription: string
  setNewTaskDescription: Dispatch<SetStateAction<string>>
  newTaskPriority: 'low' | 'medium' | 'high'
  setNewTaskPriority: Dispatch<SetStateAction<'low' | 'medium' | 'high'>>
  newTaskDueDate: string
  setNewTaskDueDate: Dispatch<SetStateAction<string>>
  newTaskDueTime: string
  setNewTaskDueTime: Dispatch<SetStateAction<string>>
  newTaskAssignee: string
  setNewTaskAssignee: Dispatch<SetStateAction<string>>
  taskSaving: boolean
  expandedTaskId: string | null
  setExpandedTaskId: Dispatch<SetStateAction<string | null>>
  taskActivities: TaskActivity[]

  // ─── Deal modal: koppla kund ───────────────────────────────────────────
  linkCustomerSearch: string
  setLinkCustomerSearch: Dispatch<SetStateAction<string>>
  showLinkCustomer: boolean
  setShowLinkCustomer: Dispatch<SetStateAction<boolean>>

  // ─── Deal modal: kund-anrikning ────────────────────────────────────────
  customerTags: CustomerTag[]
  lastContact: { date: string; type: string } | null

  // ─── Modal-triggers (för kort/cards att öppna modaler) ─────────────────
  setShowSiteVisit: Dispatch<SetStateAction<boolean>>
  setSiteVisitForm: Dispatch<SetStateAction<SiteVisitForm>>
  setQuickSmsTarget: Dispatch<SetStateAction<QuickSmsTarget | null>>
  setQuickSmsText: Dispatch<SetStateAction<string>>
  setLossDealId: Dispatch<SetStateAction<string | null>>
  setShowLossModal: Dispatch<SetStateAction<boolean>>
  setNextStepPrompt: Dispatch<SetStateAction<NextStepPrompt | null>>

  // ─── View toggle, filter, drag-drop ────────────────────────────────────
  pipelineView: 'kanban' | 'timeline'
  setPipelineView: Dispatch<SetStateAction<'kanban' | 'timeline'>>
  draggingDealId: string | null
  dragOverStageId: string | null
  setDragOverStageId: Dispatch<SetStateAction<string | null>>

  // ─── Toast ─────────────────────────────────────────────────────────────
  toast: Toast
  showToast: (message: string, type?: Toast['type']) => void

  // ─── Handlers ──────────────────────────────────────────────────────────
  openDealDetail: (deal: Deal) => void
  closeDealDetail: () => void
  moveDealAction: (dealId: string, toStageSlug: string, extraData?: Record<string, any>) => Promise<void>
  updateDealField: (dealId: string, field: string, value: any) => Promise<void>
  markDealLost: (dealId: string) => Promise<void>
  undoActivity: (activityId: string) => Promise<void>
  handleQuickSms: (deal: Deal) => void
  handleOpenTasks: (deal: Deal) => void

  // Deal-data-handlers
  handleDealFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  fetchDealEmails: (email: string) => Promise<void>
  fetchDealThreadMessages: (threadId: string) => Promise<void>

  handleAddNote: () => Promise<void>
  handleUpdateNote: (noteId: string) => Promise<void>
  handleDeleteNote: (noteId: string) => Promise<void>

  handleAddTask: () => Promise<void>
  handleToggleTask: (taskId: string, currentStatus: string) => Promise<void>
  handleDeleteTask: (taskId: string) => Promise<void>
  fetchTaskActivities: (taskId: string) => Promise<void>
  fetchDealTasks: (dealId: string) => Promise<void>
  createDealTaskBatch: (titles: string[]) => Promise<void>

  handleLinkCustomer: (customerId: string) => Promise<void>

  // Stage-helpers
  getStageForDeal: (deal: Deal) => Stage | undefined
  dealsForStage: (stageId: string) => Deal[]
  stageValue: (stageId: string) => number
}

const PipelineContext = createContext<PipelineContextValue | null>(null)

export function PipelineProvider({
  value,
  children,
}: {
  value: PipelineContextValue
  children: ReactNode
}) {
  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>
}

export function usePipelineContext(): PipelineContextValue {
  const ctx = useContext(PipelineContext)
  if (!ctx) {
    throw new Error('usePipelineContext måste användas inuti <PipelineProvider>')
  }
  return ctx
}
