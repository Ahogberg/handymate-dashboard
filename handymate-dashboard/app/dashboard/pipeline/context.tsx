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
  showSiteVisit: boolean
  setShowSiteVisit: Dispatch<SetStateAction<boolean>>
  siteVisitForm: SiteVisitForm
  setSiteVisitForm: Dispatch<SetStateAction<SiteVisitForm>>
  siteVisitSaving: boolean
  siteVisitTeam: SiteVisitTeamMember[]
  bookSiteVisit: () => Promise<void>
  quickSmsTarget: QuickSmsTarget | null
  setQuickSmsTarget: Dispatch<SetStateAction<QuickSmsTarget | null>>
  quickSmsText: string
  setQuickSmsText: Dispatch<SetStateAction<string>>
  quickSmsSending: boolean
  sendQuickSms: () => Promise<void>

  showLossModal: boolean
  setShowLossModal: Dispatch<SetStateAction<boolean>>
  lossDealId: string | null
  setLossDealId: Dispatch<SetStateAction<string | null>>
  lossReason: string
  setLossReason: Dispatch<SetStateAction<string>>
  lossReasonDetail: string
  setLossReasonDetail: Dispatch<SetStateAction<string>>
  confirmLossReason: () => Promise<void>

  showStageSettings: boolean
  setShowStageSettings: Dispatch<SetStateAction<boolean>>
  stageEdits: Record<string, { name: string; color: string }>
  setStageEdits: Dispatch<SetStateAction<Record<string, { name: string; color: string }>>>
  newStageName: string
  setNewStageName: Dispatch<SetStateAction<string>>
  stageSaving: boolean
  saveStageEdits: () => Promise<void>
  addNewStage: () => Promise<void>
  deleteStage: (stageId: string) => Promise<void>
  moveStageOrder: (stageId: string, direction: 'up' | 'down') => Promise<void>

  // ─── View toggle, filter, drag-drop ────────────────────────────────────
  pipelineView: 'kanban' | 'timeline' | 'flow'
  setPipelineView: Dispatch<SetStateAction<'kanban' | 'timeline' | 'flow'>>
  draggingDealId: string | null
  dragOverStageId: string | null
  setDragOverStageId: Dispatch<SetStateAction<string | null>>
  handleDragStart: (e: React.DragEvent, dealId: string) => void
  handleDragEnd: () => void
  handleDragOver: (e: React.DragEvent, stageId: string) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, stage: Stage) => void

  // ─── Filter ────────────────────────────────────────────────────────────
  filterSearch: string
  setFilterSearch: Dispatch<SetStateAction<string>>
  filterPriority: string
  setFilterPriority: Dispatch<SetStateAction<string>>
  filterCustomerType: string
  setFilterCustomerType: Dispatch<SetStateAction<string>>
  filterAssignedTo: string
  setFilterAssignedTo: Dispatch<SetStateAction<string>>
  filterSource: string
  setFilterSource: Dispatch<SetStateAction<string>>
  customerTypeOptions: string[]
  sourceOptions: string[]
  customerTypeLabel: (t: string) => string
  sourceLabel: (s: string) => string
  hasActiveFilters: boolean
  activeFilterCount: number

  // ─── View hjälpare ─────────────────────────────────────────────────────
  hideEmpty: boolean
  toggleHideEmpty: () => void
  scrollPipeline: (dir: 'left' | 'right') => void
  scrollContainerRef: React.RefObject<HTMLDivElement>
  mobileStageIndex: number
  setMobileStageIndex: Dispatch<SetStateAction<number>>
  lostExpanded: boolean
  setLostExpanded: Dispatch<SetStateAction<boolean>>

  // ─── New deal-modal triggers ───────────────────────────────────────────
  showNewDeal: boolean
  setShowNewDeal: Dispatch<SetStateAction<boolean>>
  fetchCustomers: () => Promise<void>
  fetchJobTypes: () => Promise<void>
  fetchLeadSources: () => Promise<void>
  fetchJobTypeOptions: () => Promise<void>

  // ─── NewDealModal-specifik state ───────────────────────────────────────
  newDealForm: NewDealForm
  setNewDealForm: Dispatch<SetStateAction<NewDealForm>>
  newDealSubmitting: boolean
  newDealFiles: File[]
  setNewDealFiles: Dispatch<SetStateAction<File[]>>
  customerSearch: string
  setCustomerSearch: Dispatch<SetStateAction<string>>
  showCustomerDropdown: boolean
  setShowCustomerDropdown: Dispatch<SetStateAction<boolean>>
  showNewCustomerForm: boolean
  setShowNewCustomerForm: Dispatch<SetStateAction<boolean>>
  newCustomerForm: NewCustomerForm
  setNewCustomerForm: Dispatch<SetStateAction<NewCustomerForm>>
  newCustomerSubmitting: boolean
  setNewCustomerSubmitting: Dispatch<SetStateAction<boolean>>
  setCustomers: Dispatch<SetStateAction<CustomerOption[]>>
  filteredCustomers: CustomerOption[]
  createDeal: () => Promise<void>

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
  createDealTaskBatch: (tasks: import('@/components/TaskPresetPicker').PickedTask[]) => Promise<void>

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
