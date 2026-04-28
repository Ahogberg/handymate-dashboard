'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Edit3,
  File as FileIcon,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Sparkles,
  Tag,
  Target,
  Trash2,
  Undo2,
  Upload,
  User,
  X,
  Zap,
} from 'lucide-react'
import { CopyId } from '@/components/CopyId'
import { DealTimeline } from '@/components/pipeline/DealTimeline'
import SmartTaskTitleInput from '@/components/SmartTaskTitleInput'
import { SCORE_FACTOR_LABELS, getTemperatureColor, getTemperatureLabel } from '@/lib/lead-scoring'
import { getLeadCategory } from '@/lib/lead-categories'
import { usePipelineContext } from '../context'
import {
  extractEmailName,
  formatFileSize,
  formatValue,
  getPriorityBadgeStyle,
  getPriorityLabel,
  timeAgo,
} from '../helpers'

// Project canvas är tung — laddas dynamiskt så modalen öppnar snabbt
const ProjectCanvas = dynamic(() => import('@/components/project/ProjectCanvas'), {
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
    </div>
  ),
  ssr: false,
})

/**
 * Deal-detaljmodalen — höger-sidemenu med 5 flikar:
 *   Allmänt, Uppgifter, Dokument, Anteckningar, Rityta
 *
 * All state + handlers kommer från PipelineContext (sammanlagt ~36 vars).
 * Komponenten har inga props — `selectedDeal` styr om den renderas.
 */
export function DealModal() {
  const {
    selectedDeal,
    stages,
    customers,
    teamMembers,
    business,

    dealTab,
    setDealTab,
    editingTitle,
    setEditingTitle,
    editTitleValue,
    setEditTitleValue,
    editingValue,
    setEditingValue,
    editValueInput,
    setEditValueInput,
    editingPriority,
    setEditingPriority,
    detailActivities,

    dealDocuments,
    dealUploading,
    dealUploadCategory,
    setDealUploadCategory,

    dealNotes,
    newNoteContent,
    setNewNoteContent,
    editingNoteId,
    setEditingNoteId,
    editNoteContent,
    setEditNoteContent,
    noteSaving,

    dealEmailThreads,
    dealEmailLoading,
    dealExpandedThread,
    dealThreadMessages,
    dealThreadLoading,

    dealTasks,
    setShowDealTaskPresetPicker,
    newTaskTitle,
    setNewTaskTitle,
    newTaskDescription,
    setNewTaskDescription,
    newTaskPriority,
    setNewTaskPriority,
    newTaskDueDate,
    setNewTaskDueDate,
    newTaskDueTime,
    setNewTaskDueTime,
    newTaskAssignee,
    setNewTaskAssignee,
    taskSaving,
    expandedTaskId,
    setExpandedTaskId,
    taskActivities,

    linkCustomerSearch,
    setLinkCustomerSearch,
    showLinkCustomer,
    setShowLinkCustomer,

    customerTags,
    lastContact,

    setShowSiteVisit,
    setSiteVisitForm,

    closeDealDetail,
    showToast,
    moveDealAction,
    updateDealField,
    markDealLost,
    undoActivity,
    handleDealFileUpload,
    fetchDealThreadMessages,
    handleAddNote,
    handleUpdateNote,
    handleDeleteNote,
    handleAddTask,
    handleToggleTask,
    handleDeleteTask,
    fetchTaskActivities,
    fetchDealTasks,
    handleLinkCustomer,
    fetchCustomers,
    getStageForDeal,
  } = usePipelineContext()

  if (!selectedDeal) return null

  return (
    <>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40" onClick={closeDealDetail} />
          <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-6">
            <div
              className="bg-white w-full max-w-3xl max-h-[100vh] sm:max-h-[90vh] flex flex-col rounded-none sm:rounded-2xl shadow-none sm:shadow-xl border-0 sm:border sm:border-slate-200"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex-shrink-0 px-5 sm:px-6 pt-4 sm:pt-5 pb-0 border-b border-slate-200">
                {/* Top row: title (left) + stage pill (middle) + amount + close (right) */}
                <div className="flex items-start gap-3 mb-3">
                  {/* Vänster: ärendenummer + titel */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-mono font-semibold text-primary-700 mb-1 tracking-tight">
                      #{selectedDeal.deal_number || selectedDeal.id.slice(0, 6)}
                    </div>
                    {editingTitle ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editTitleValue}
                          onChange={e => setEditTitleValue(e.target.value)}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-900 text-lg font-bold focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              updateDealField(selectedDeal.id, 'title', editTitleValue)
                              setEditingTitle(false)
                            }
                            if (e.key === 'Escape') {
                              setEditTitleValue(selectedDeal.title)
                              setEditingTitle(false)
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            updateDealField(selectedDeal.id, 'title', editTitleValue)
                            setEditingTitle(false)
                          }}
                          className="p-1.5 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                          title="Spara"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditTitleValue(selectedDeal.title); setEditingTitle(true) }}
                        className="group flex items-center gap-2 text-left w-full min-w-0"
                      >
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate leading-tight tracking-tight">
                          {selectedDeal.title}
                        </h2>
                        <Edit3 className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </button>
                    )}
                    {selectedDeal.description && (
                      <p className="text-[13px] text-slate-500 mt-1 line-clamp-2">{selectedDeal.description}</p>
                    )}
                  </div>

                  {/* Höger: stage-pill + belopp + close */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Stage pill — klickbar dropdown för stage-byte */}
                    <div className="relative hidden sm:block">
                      <select
                        value={selectedDeal.stage_id}
                        onChange={e => {
                          const target = stages.find(s => s.id === e.target.value)
                          if (target) moveDealAction(selectedDeal.id, target.slug)
                        }}
                        className="appearance-none pl-3 pr-7 py-1 rounded-full text-xs font-semibold border border-primary-200 bg-primary-50 text-primary-700 hover:border-primary-400 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-100"
                      >
                        {stages.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-primary-700 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {/* Belopp */}
                    {selectedDeal.value != null && selectedDeal.value > 0 && (
                      <span className="hidden sm:inline-flex text-sm font-semibold text-slate-900 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg">
                        {formatValue(selectedDeal.value)}
                      </span>
                    )}

                    <button
                      onClick={closeDealDetail}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors"
                      title="Stäng"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Mobile: stage dropdown + amount visas nedanför titeln eftersom de inte ryms i top-row */}
                <div className="flex sm:hidden items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <select
                      value={selectedDeal.stage_id}
                      onChange={e => {
                        const target = stages.find(s => s.id === e.target.value)
                        if (target) moveDealAction(selectedDeal.id, target.slug)
                      }}
                      className="w-full appearance-none pl-3 pr-7 py-1.5 rounded-full text-xs font-semibold border border-primary-200 bg-primary-50 text-primary-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-100"
                    >
                      {stages.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-primary-700 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {selectedDeal.value != null && selectedDeal.value > 0 && (
                    <span className="inline-flex text-xs font-semibold text-slate-900 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex-shrink-0">
                      {formatValue(selectedDeal.value)}
                    </span>
                  )}
                </div>

                {/* Tabs — underline-style */}
                <div className="flex gap-0 -mx-5 sm:-mx-6 px-5 sm:px-6 overflow-x-auto scrollbar-hide">
                  {([
                    { key: 'general' as const, label: 'Allmänt', icon: FolderKanban },
                    { key: 'tasks' as const, label: 'Uppgifter', icon: CheckSquare, count: dealTasks.filter(t => t.status !== 'done').length },
                    { key: 'documents' as const, label: 'Dokument', icon: FileIcon, count: dealDocuments.length },
                    { key: 'messages' as const, label: 'Anteckningar', icon: MessageSquare, count: dealNotes.length + dealEmailThreads.length },
                    { key: 'canvas' as const, label: 'Rityta', icon: Pencil },
                  ]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setDealTab(tab.key)}
                      className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-[13px] sm:text-sm font-medium border-b-2 transition-colors flex-shrink-0 -mb-px ${
                        dealTab === tab.key
                          ? 'border-primary-700 text-primary-700'
                          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <tab.icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {tab.count !== undefined && tab.count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          dealTab === tab.key ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-6">

                {/* TAB: Allmänt */}
                {dealTab === 'general' && (
                  <div className="space-y-5">
                    {/* Value + Priority row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-gray-50/50 px-4 py-3">
                        <span className="text-sm text-gray-400">Värde</span>
                        {editingValue ? (
                          <div className="flex items-center gap-2">
                            <input type="number" value={editValueInput} onChange={e => setEditValueInput(e.target.value)}
                              className="w-28 bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-gray-900 text-sm text-right focus:outline-none focus:border-primary-400" autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') { updateDealField(selectedDeal.id, 'value', editValueInput ? parseFloat(editValueInput) : null); setEditingValue(false) }; if (e.key === 'Escape') { setEditValueInput(selectedDeal.value?.toString() || ''); setEditingValue(false) } }} />
                            <button onClick={() => { updateDealField(selectedDeal.id, 'value', editValueInput ? parseFloat(editValueInput) : null); setEditingValue(false) }} className="p-1.5 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"><Save className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditValueInput(selectedDeal.value?.toString() || ''); setEditingValue(true) }} className="group flex items-center gap-1.5 text-gray-900 font-semibold text-sm">
                            {formatValue(selectedDeal.value)}<Edit3 className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-gray-50/50 px-4 py-3">
                        <span className="text-sm text-gray-400">Prioritet</span>
                        {editingPriority ? (
                          <select value={selectedDeal.priority} onChange={e => { updateDealField(selectedDeal.id, 'priority', e.target.value); setEditingPriority(false) }} onBlur={() => setEditingPriority(false)} autoFocus
                            className="bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-primary-400">
                            <option value="low">Låg</option><option value="medium">Medium</option><option value="high">Hög</option><option value="urgent">Brådskande</option>
                          </select>
                        ) : (
                          <button onClick={() => setEditingPriority(true)} className={`group flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityBadgeStyle(selectedDeal.priority)}`}>
                            {getPriorityLabel(selectedDeal.priority)}<Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Lead Score Card */}
                    {selectedDeal.lead_score != null && selectedDeal.lead_score > 0 && (
                      <div className="rounded-lg border border-[#E2E8F0] bg-gray-50/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-primary-700" />
                            <span className="text-sm font-medium text-gray-900">Lead-kvalificering</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-gray-900">{selectedDeal.lead_score}/100</span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                              backgroundColor: getTemperatureColor(selectedDeal.lead_temperature || 'cold') + '20',
                              color: getTemperatureColor(selectedDeal.lead_temperature || 'cold'),
                            }}>
                              {getTemperatureLabel(selectedDeal.lead_temperature || 'cold')}
                            </span>
                          </div>
                        </div>
                        {/* Score bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all" style={{
                            width: `${selectedDeal.lead_score}%`,
                            backgroundColor: getTemperatureColor(selectedDeal.lead_temperature || 'cold'),
                          }} />
                        </div>
                        {/* Factor bars */}
                        {selectedDeal.lead_score_factors && (
                          <div className="space-y-1.5">
                            {(Object.entries(selectedDeal.lead_score_factors) as [string, number][]).map(([key, val]) => {
                              const meta = SCORE_FACTOR_LABELS[key as keyof typeof SCORE_FACTOR_LABELS]
                              if (!meta) return null
                              return (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                  <span className="w-16 text-gray-400 truncate">{meta.label}</span>
                                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                    <div className="h-1.5 rounded-full bg-primary-700 transition-all" style={{ width: `${(val / meta.max) * 100}%` }} />
                                  </div>
                                  <span className="text-gray-500 w-10 text-right">{val}/{meta.max}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {selectedDeal.suggested_action && (
                          <div className="flex items-start gap-2 pt-1">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-gray-600">{selectedDeal.suggested_action}</p>
                          </div>
                        )}
                        {selectedDeal.estimated_value != null && selectedDeal.estimated_value > 0 && (
                          <div className="text-xs text-gray-400">
                            Uppskattat värde: <span className="font-medium text-gray-600">{formatValue(selectedDeal.estimated_value)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Response time badge */}
                    {selectedDeal.response_time_seconds != null && selectedDeal.response_time_seconds > 0 && (
                      <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-gray-50/50 px-4 py-2.5">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span className="text-sm text-gray-400">Svarstid:</span>
                        <span className="text-sm font-medium text-primary-700">
                          {selectedDeal.response_time_seconds < 60
                            ? `${selectedDeal.response_time_seconds}s`
                            : selectedDeal.response_time_seconds < 3600
                            ? `${Math.round(selectedDeal.response_time_seconds / 60)} min`
                            : `${Math.round(selectedDeal.response_time_seconds / 3600)}h ${Math.round((selectedDeal.response_time_seconds % 3600) / 60)}m`
                          }
                        </span>
                      </div>
                    )}

                    {/* Stage-byte hanteras nu via dropdown i header */}

                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Skapad {timeAgo(selectedDeal.created_at)}</span>
                      <span>Uppdaterad {timeAgo(selectedDeal.updated_at)}</span>
                    </div>

                    {/* Link Customer (when no customer is assigned) */}
                    {!selectedDeal.customer && (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-4">
                        {!showLinkCustomer ? (
                          <button
                            onClick={() => { setShowLinkCustomer(true); fetchCustomers() }}
                            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-primary-700 transition-colors"
                          >
                            <User className="w-4 h-4" />
                            Koppla kund till denna deal
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-400 uppercase tracking-wider">Koppla kund</span>
                              <button onClick={() => { setShowLinkCustomer(false); setLinkCustomerSearch('') }} className="text-gray-400 hover:text-gray-600">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <input
                              type="text"
                              value={linkCustomerSearch}
                              onChange={e => setLinkCustomerSearch(e.target.value)}
                              placeholder="Sök kund..."
                              className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary-400"
                              autoFocus
                            />
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {customers
                                .filter(c => !linkCustomerSearch || c.name.toLowerCase().includes(linkCustomerSearch.toLowerCase()) || c.phone_number?.includes(linkCustomerSearch))
                                .slice(0, 8)
                                .map(c => (
                                  <button
                                    key={c.customer_id}
                                    onClick={() => handleLinkCustomer(c.customer_id)}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-primary-50 transition-colors"
                                  >
                                    <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm text-gray-900 truncate">{c.name}</p>
                                      <p className="text-xs text-gray-400 truncate">{c.phone_number}{c.email ? ` · ${c.email}` : ''}</p>
                                    </div>
                                  </button>
                                ))}
                              {customers.filter(c => !linkCustomerSearch || c.name.toLowerCase().includes(linkCustomerSearch.toLowerCase()) || c.phone_number?.includes(linkCustomerSearch)).length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-2">Inga kunder hittades</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Customer */}
                    {selectedDeal.customer && (
                      <div className="rounded-lg border border-[#E2E8F0] bg-gray-50/50 overflow-hidden">
                        <div className="p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400 uppercase tracking-wider">Kund</span>
                            {selectedDeal.customer.customer_type && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                selectedDeal.customer.customer_type === 'company' ? 'bg-primary-50 text-primary-700 border-primary-200' :
                                selectedDeal.customer.customer_type === 'brf' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                                'bg-gray-100 text-gray-500 border-gray-200'
                              }`}>
                                {selectedDeal.customer.customer_type === 'company' ? 'Företag' : selectedDeal.customer.customer_type === 'brf' ? 'BRF' : 'Privat'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /><span className="text-sm font-medium text-gray-900">{selectedDeal.customer.name}</span></div>
                          {selectedDeal.customer.phone_number && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-500">{selectedDeal.customer.phone_number}</span></div>}
                          {selectedDeal.customer.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-500 truncate">{selectedDeal.customer.email}</span></div>}
                          {selectedDeal.customer.address_line && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-500">{selectedDeal.customer.address_line}</span></div>}
                          {selectedDeal.customer.customer_type !== 'private' && selectedDeal.customer.org_number && (
                            <div className="text-xs text-gray-400">Org.nr: {selectedDeal.customer.org_number}</div>
                          )}
                          {selectedDeal.customer.customer_type !== 'private' && selectedDeal.customer.contact_person && (
                            <div className="text-xs text-gray-400">Kontakt: {selectedDeal.customer.contact_person}</div>
                          )}
                          {customerTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {customerTags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border" style={{ backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color + '40' }}>
                                  <Tag className="w-2.5 h-2.5" />{tag.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {lastContact && (
                            <div className="text-xs text-gray-400">Senast kontaktad: {new Date(lastContact.date).toLocaleDateString('sv-SE')} ({lastContact.type})</div>
                          )}
                        </div>
                        <Link
                          href={`/dashboard/customers/${selectedDeal.customer.customer_id}`}
                          className="flex items-center justify-between px-4 py-2.5 bg-gray-100/80 border-t border-gray-200 text-sm text-primary-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                        >
                          <span className="font-medium">Visa kundkort</span>
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-wrap gap-2">
                        <Link href={selectedDeal.quote_id
                          ? `/dashboard/quotes/${selectedDeal.quote_id}`
                          : selectedDeal.customer_id
                            ? `/dashboard/quotes/new?customerId=${selectedDeal.customer_id}&deal_id=${selectedDeal.id}`
                            : `/dashboard/quotes/new?deal_id=${selectedDeal.id}`}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-primary-700 hover:bg-primary-50 transition-colors">
                          <FileText className="w-4 h-4" /> {selectedDeal.quote_id ? 'Visa offert' : 'Skapa offert'}
                        </Link>
                        <button onClick={() => { setShowSiteVisit(true); setSiteVisitForm({ date: '', time: '09:00', duration: '60', notes: '', sendSms: true, invitedTeam: [], externalUe: '' }) }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-sm text-primary-700 hover:bg-primary-50 transition-colors">
                          <Calendar className="w-4 h-4" /> Platsbesök
                        </button>
                      </div>
                      {!getStageForDeal(selectedDeal)?.is_lost && (
                        <button onClick={() => markDealLost(selectedDeal.id)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                          Markera förlorad
                        </button>
                      )}
                    </div>

                    {/* Pågående uppgifter — kompakt vy. Avslutade ligger kvar under Uppgifter-fliken. */}
                    {(() => {
                      const openTasks = dealTasks.filter(t => t.status !== 'done')
                      if (openTasks.length === 0) return null
                      // Sortera: förfallna först, sedan hög-prio, sedan på datum
                      const sorted = [...openTasks].sort((a, b) => {
                        const aOverdue = !!a.due_date && new Date(a.due_date + (a.due_time ? `T${a.due_time}` : 'T23:59:59')) < new Date()
                        const bOverdue = !!b.due_date && new Date(b.due_date + (b.due_time ? `T${b.due_time}` : 'T23:59:59')) < new Date()
                        if (aOverdue && !bOverdue) return -1
                        if (!aOverdue && bOverdue) return 1
                        const aHigh = a.priority === 'high'
                        const bHigh = b.priority === 'high'
                        if (aHigh && !bHigh) return -1
                        if (!aHigh && bHigh) return 1
                        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
                        if (a.due_date) return -1
                        if (b.due_date) return 1
                        return 0
                      })
                      const overdueCount = sorted.filter(t => !!t.due_date && new Date(t.due_date + (t.due_time ? `T${t.due_time}` : 'T23:59:59')) < new Date()).length
                      const highPrioCount = sorted.filter(t => t.priority === 'high').length
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs text-gray-400 uppercase tracking-wider">Pågående uppgifter</h4>
                              {overdueCount > 0 && (
                                <span className="text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                  {overdueCount} försenad{overdueCount === 1 ? '' : 'e'}
                                </span>
                              )}
                              {highPrioCount > 0 && (
                                <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                  {highPrioCount} viktig{highPrioCount === 1 ? '' : 'a'}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setDealTab('tasks')}
                              className="text-[11px] text-primary-700 hover:underline"
                            >
                              Visa alla →
                            </button>
                          </div>
                          <div className="space-y-1">
                            {sorted.slice(0, 5).map(task => {
                              const isOverdue = !!task.due_date && new Date(task.due_date + (task.due_time ? `T${task.due_time}` : 'T23:59:59')) < new Date()
                              const isHighPrio = task.priority === 'high'
                              const initials = task.assigned_user?.name
                                ? task.assigned_user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                                : null
                              return (
                                <div key={task.id} className={`relative flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                                  isOverdue
                                    ? 'border-red-200 bg-red-50/60'
                                    : isHighPrio
                                      ? 'border-amber-200 bg-amber-50/40'
                                      : 'border-gray-100 hover:border-gray-200'
                                }`}>
                                  {(isOverdue || isHighPrio) && (
                                    <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${isOverdue ? 'bg-red-500' : 'bg-amber-400'}`} />
                                  )}
                                  <button onClick={() => handleToggleTask(task.id, task.status)} className="flex-shrink-0 ml-1" title="Markera som klar">
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isOverdue ? 'border-red-400 hover:border-red-500' : isHighPrio ? 'border-amber-400 hover:border-amber-500' : 'border-gray-300 hover:border-primary-400'}`} />
                                  </button>
                                  <button
                                    onClick={() => { setDealTab('tasks'); setExpandedTaskId(task.id); fetchTaskActivities(task.id) }}
                                    className="flex-1 text-left min-w-0"
                                  >
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm text-gray-700 truncate">{task.title}</span>
                                      {isHighPrio && !isOverdue && (
                                        <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700">Viktig</span>
                                      )}
                                    </div>
                                    {task.due_date && (
                                      <span className={`text-[11px] flex items-center gap-0.5 mt-0.5 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                        <Calendar className="w-3 h-3" />
                                        {new Date(task.due_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                                        {task.due_time && ` ${task.due_time.slice(0, 5)}`}
                                        {isOverdue && ' · försenad'}
                                      </span>
                                    )}
                                  </button>
                                  {initials && (
                                    <div
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                      style={{ backgroundColor: task.assigned_user?.color || '#3B82F6' }}
                                      title={task.assigned_user?.name || ''}
                                    >
                                      {initials}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                            {sorted.length > 5 && (
                              <button
                                type="button"
                                onClick={() => setDealTab('tasks')}
                                className="w-full text-left px-3 py-1.5 text-[11px] text-gray-500 hover:text-primary-700 transition-colors"
                              >
                                + {sorted.length - 5} till — öppna Uppgifter-fliken
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Activity log */}
                    <div>
                      <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-3">Tidslinje</h4>
                      {selectedDeal && (
                        <DealTimeline dealId={selectedDeal.id} customerId={selectedDeal.customer_id} businessId={business.business_id} />
                      )}
                      {/* Legacy activity log preserved below for undo support */}
                      {detailActivities.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Stegändringar</h4>
                          <div className="space-y-1">
                            {detailActivities.filter(act => !act.undone_at).slice(0, 5).map(act => (
                              <div key={act.id} className="flex items-start gap-2.5 py-1.5">
                                <div className="mt-0.5">
                                  {act.triggered_by === 'ai' ? <Bot className="w-3.5 h-3.5 text-primary-700" /> : <Clock className="w-3.5 h-3.5 text-gray-300" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs text-gray-600">{act.description || act.activity_type}</span>
                                  {act.from_stage_name && act.to_stage_name && (
                                    <span className="text-xs text-gray-400 ml-1">{act.from_stage_name} → {act.to_stage_name}</span>
                                  )}
                                  {act.ai_reason && <p className="text-xs text-gray-400 mt-0.5">{act.ai_reason}</p>}
                                  <span className="text-xs text-gray-300 ml-2">{timeAgo(act.created_at)}</span>
                                </div>
                                {act.triggered_by === 'ai' && !act.undone_at && (
                                  <button onClick={() => undoActivity(act.id)} className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-gray-600 transition-colors" title="Ångra"><Undo2 className="w-3 h-3" /></button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: Uppgifter */}
                {dealTab === 'tasks' && (
                  <div className="space-y-4">
                    {/* Add task form */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <SmartTaskTitleInput
                            value={newTaskTitle}
                            onChange={setNewTaskTitle}
                            onSubmit={() => handleAddTask()}
                            placeholder="Vad behöver göras?"
                          />
                        </div>
                        <button
                          onClick={handleAddTask}
                          disabled={!newTaskTitle.trim() || taskSaving}
                          className="flex items-center gap-1.5 px-3 py-2 bg-primary-800 text-white text-sm rounded-lg hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                        >
                          {taskSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          <span className="hidden sm:inline">Lägg till</span>
                        </button>
                      </div>
                      {newTaskTitle.trim() && (
                        <textarea
                          value={newTaskDescription}
                          onChange={e => setNewTaskDescription(e.target.value)}
                          placeholder="Beskrivning (valfri)..."
                          rows={2}
                          className="w-full px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none resize-none"
                        />
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="date"
                          value={newTaskDueDate}
                          onChange={e => setNewTaskDueDate(e.target.value)}
                          className="px-2 py-1.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-xs text-gray-500 focus:outline-none focus:border-primary-400 w-32"
                        />
                        <select
                          value={newTaskDueTime}
                          onChange={e => setNewTaskDueTime(e.target.value)}
                          className="px-2 py-1.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-xs text-gray-500 focus:outline-none focus:border-primary-400 w-24"
                        >
                          <option value="">Tid</option>
                          {Array.from({ length: 24 * 4 }, (_, i) => {
                            const h = String(Math.floor(i / 4)).padStart(2, '0')
                            const m = String((i % 4) * 15).padStart(2, '0')
                            return <option key={i} value={`${h}:${m}`}>{h}:{m}</option>
                          })}
                        </select>
                        <select
                          value={newTaskPriority}
                          onChange={e => setNewTaskPriority(e.target.value as any)}
                          className="px-2 py-1.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-xs text-gray-500 focus:outline-none focus:border-primary-400 w-24"
                          title="Prioritet"
                        >
                          <option value="low">Låg</option>
                          <option value="medium">Medium</option>
                          <option value="high">Hög</option>
                        </select>
                        {teamMembers.length > 0 && (
                          <select
                            value={newTaskAssignee}
                            onChange={e => setNewTaskAssignee(e.target.value)}
                            className="px-2 py-1.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-xs text-gray-500 focus:outline-none focus:border-primary-400 flex-1 min-w-[120px]"
                          >
                            <option value="">Tilldela...</option>
                            {teamMembers.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Task list */}
                    {dealTasks.length > 0 ? (
                      <div className="space-y-1">
                        {dealTasks.map(task => {
                          const isOverdue = task.due_date && new Date(task.due_date + (task.due_time ? `T${task.due_time}` : 'T23:59:59')) < new Date() && task.status !== 'done'
                          const isExpanded = expandedTaskId === task.id
                          const initials = task.assigned_user?.name
                            ? task.assigned_user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                            : null
                          return (
                            <div key={task.id} className="rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                              <div className={`flex items-center gap-3 px-3 py-2.5 group ${isOverdue ? 'bg-red-50/50' : ''}`}>
                                <button onClick={() => handleToggleTask(task.id, task.status)} className="flex-shrink-0">
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${task.status === 'done' ? 'bg-green-500 border-green-500' : isOverdue ? 'border-red-400 hover:border-red-500' : 'border-gray-300 hover:border-primary-400'}`}>
                                    {task.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                  </div>
                                </button>
                                <button onClick={() => { if (isExpanded) { setExpandedTaskId(null) } else { setExpandedTaskId(task.id); fetchTaskActivities(task.id) } }} className="flex-1 text-left min-w-0">
                                  <span className={`text-sm block truncate ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{task.title}</span>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {task.due_date && (
                                      <span className={`text-[11px] flex items-center gap-0.5 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                        <Calendar className="w-3 h-3" />
                                        {new Date(task.due_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                                        {task.due_time && ` ${task.due_time.slice(0, 5)}`}
                                        {isOverdue && ' (försenad)'}
                                      </span>
                                    )}
                                    <span className="text-[11px] text-gray-300">
                                      {new Date(task.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} {new Date(task.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </button>
                                {initials && (
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                    style={{ backgroundColor: task.assigned_user?.color || '#3B82F6' }}
                                    title={task.assigned_user?.name || ''}
                                  >
                                    {initials}
                                  </div>
                                )}
                                <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0" title="Ta bort">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {/* Expanded detail with inline edit + activity timeline */}
                              {isExpanded && (
                                <div className="px-3 pb-3 border-t border-gray-100">
                                  {/* Inline edit — titel + beskrivning */}
                                  <div className="mt-3 space-y-2">
                                    <input
                                      type="text"
                                      defaultValue={task.title}
                                      onBlur={async e => {
                                        const val = e.target.value.trim()
                                        if (!val || val === task.title) return
                                        try {
                                          const res = await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, title: val }) })
                                          if (!res.ok) throw new Error()
                                          if (selectedDeal) fetchDealTasks(selectedDeal.id)
                                          fetchTaskActivities(task.id)
                                          showToast('Uppgift uppdaterad', 'success')
                                        } catch { showToast('Kunde inte spara', 'error') }
                                      }}
                                      className="w-full px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded text-sm text-gray-900 focus:outline-none focus:border-primary-400"
                                      placeholder="Titel"
                                    />
                                    <textarea
                                      defaultValue={task.description || ''}
                                      rows={2}
                                      onBlur={async e => {
                                        const val = e.target.value
                                        if (val === (task.description || '')) return
                                        try {
                                          const res = await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, description: val || null }) })
                                          if (!res.ok) throw new Error()
                                          if (selectedDeal) fetchDealTasks(selectedDeal.id)
                                          showToast('Beskrivning sparad', 'success')
                                        } catch { showToast('Kunde inte spara', 'error') }
                                      }}
                                      className="w-full px-2.5 py-1.5 bg-white border border-[#E2E8F0] rounded text-sm text-gray-700 focus:outline-none focus:border-primary-400 resize-none"
                                      placeholder="Beskrivning (valfritt)"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 mt-2 mb-2 flex-wrap">
                                    <input
                                      type="date"
                                      defaultValue={task.due_date || ''}
                                      onChange={async e => {
                                        const val = e.target.value || null
                                        try {
                                          const res = await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, due_date: val }) })
                                          if (!res.ok) throw new Error()
                                          if (selectedDeal) fetchDealTasks(selectedDeal.id)
                                          fetchTaskActivities(task.id)
                                          showToast('Datum uppdaterat', 'success')
                                        } catch { showToast('Kunde inte spara', 'error') }
                                      }}
                                      className="px-2 py-1 bg-gray-50 border border-[#E2E8F0] rounded text-xs text-gray-700 focus:outline-none focus:border-primary-400"
                                    />
                                    <input
                                      type="time"
                                      defaultValue={task.due_time ? task.due_time.slice(0, 5) : ''}
                                      onChange={async e => {
                                        const val = e.target.value || null
                                        try {
                                          const res = await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, due_time: val }) })
                                          if (!res.ok) throw new Error()
                                          if (selectedDeal) fetchDealTasks(selectedDeal.id)
                                          fetchTaskActivities(task.id)
                                          showToast('Tid uppdaterad', 'success')
                                        } catch { showToast('Kunde inte spara', 'error') }
                                      }}
                                      className="px-2 py-1 bg-gray-50 border border-[#E2E8F0] rounded text-xs text-gray-700 focus:outline-none focus:border-primary-400"
                                    />
                                    {teamMembers.length > 0 && (
                                      <select
                                        value={task.assigned_to || ''}
                                        onChange={async e => {
                                          const val = e.target.value || null
                                          try {
                                            const res = await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, assigned_to: val }) })
                                            if (!res.ok) throw new Error()
                                            if (selectedDeal) fetchDealTasks(selectedDeal.id)
                                            fetchTaskActivities(task.id)
                                            showToast('Tilldelning ändrad', 'success')
                                          } catch { showToast('Kunde inte spara', 'error') }
                                        }}
                                        className="px-2 py-1 bg-gray-50 border border-[#E2E8F0] rounded text-xs text-gray-600 focus:outline-none focus:border-primary-400"
                                      >
                                        <option value="">Ej tilldelad</option>
                                        {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                      </select>
                                    )}
                                    <select
                                      value={task.priority}
                                      onChange={async e => {
                                        try {
                                          const res = await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, priority: e.target.value }) })
                                          if (!res.ok) throw new Error()
                                          if (selectedDeal) fetchDealTasks(selectedDeal.id)
                                          fetchTaskActivities(task.id)
                                          showToast('Prioritet ändrad', 'success')
                                        } catch { showToast('Kunde inte spara', 'error') }
                                      }}
                                      className="px-2 py-1 bg-gray-50 border border-[#E2E8F0] rounded text-xs text-gray-600 focus:outline-none focus:border-primary-400"
                                    >
                                      <option value="low">Låg</option>
                                      <option value="medium">Medium</option>
                                      <option value="high">Hög</option>
                                    </select>
                                  </div>
                                  {/* Activity timeline */}
                                  <div className="mt-2">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Händelselogg</span>
                                    {taskActivities.length > 0 ? (
                                      <div className="mt-1 space-y-1">
                                        {taskActivities.map(act => (
                                          <div key={act.id} className="flex items-start gap-2 text-[11px]">
                                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                                              act.action === 'created' ? 'bg-primary-700' :
                                              act.action === 'completed' ? 'bg-green-500' :
                                              act.action === 'assigned' ? 'bg-purple-500' :
                                              act.action === 'deleted' ? 'bg-red-500' :
                                              'bg-gray-400'
                                            }`} />
                                            <div className="flex-1 min-w-0">
                                              <span className="text-gray-600">{act.description}</span>
                                              <span className="text-gray-300 ml-1.5">
                                                {new Date(act.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} {new Date(act.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-[11px] text-gray-300 mt-1">Ingen aktivitet ännu</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <CheckSquare className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-sm">Inga uppgifter ännu</p>
                        <p className="text-xs mt-1">Lägg till en uppgift ovan</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Dokument */}
                {dealTab === 'documents' && (
                  <div className="space-y-4">
                    {/* Upload area */}
                    <div className="flex items-center gap-2">
                      <select
                        value={dealUploadCategory}
                        onChange={(e) => setDealUploadCategory(e.target.value)}
                        className="px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-700 text-sm focus:outline-none focus:border-primary-400"
                      >
                        <option value="drawing">Ritning</option>
                        <option value="sketch">Skiss</option>
                        <option value="description">Beskrivning</option>
                        <option value="contract">Kontrakt</option>
                        <option value="photo">Foto</option>
                        <option value="other">Övrigt</option>
                      </select>
                      <label className="flex items-center gap-1.5 px-4 py-2 bg-primary-50 border border-[#E2E8F0] rounded-lg text-sm text-primary-700 font-medium hover:bg-primary-100 cursor-pointer transition-colors">
                        {dealUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {dealUploading ? 'Laddar upp...' : 'Ladda upp fil'}
                        <input type="file" className="hidden" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleDealFileUpload} disabled={dealUploading} />
                      </label>
                      {selectedDeal.customer_id && (
                        <Link href={`/dashboard/customers/${selectedDeal.customer_id}?tab=documents`} className="ml-auto text-xs text-primary-700 hover:text-primary-700">
                          Visa alla i kundkort
                        </Link>
                      )}
                    </div>

                    {/* Document list */}
                    {dealDocuments.length > 0 ? (
                      <div className="rounded-lg border border-[#E2E8F0] divide-y divide-gray-100">
                        {dealDocuments.map((doc) => (
                          <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              {doc.file_type?.startsWith('image/') ? (
                                <ImageIcon className="w-4 h-4 text-primary-700" />
                              ) : doc.file_type?.includes('pdf') ? (
                                <FileText className="w-4 h-4 text-red-500" />
                              ) : (
                                <FileIcon className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 truncate">{doc.file_name}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                                  {{ drawing: 'Ritning', sketch: 'Skiss', description: 'Beskrivning', contract: 'Kontrakt', photo: 'Foto', other: 'Övrigt' }[doc.category] || doc.category}
                                </span>
                                {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                                <span>{new Date(doc.uploaded_at).toLocaleDateString('sv-SE')}</span>
                              </div>
                            </div>
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-primary-700 rounded-lg hover:bg-primary-50 transition-colors" title="Öppna">
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Upload className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-sm">Inga dokument ännu</p>
                        <p className="text-xs mt-1">Ladda upp dokument med knappen ovan</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Anteckningar */}
                {dealTab === 'messages' && (
                  <div className="space-y-4">
                    {/* Add note form */}
                    <div className="flex gap-2">
                      <textarea
                        value={newNoteContent}
                        onChange={e => setNewNoteContent(e.target.value)}
                        placeholder="Skriv en anteckning..."
                        className="flex-1 px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary-400 resize-none"
                        rows={3}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote() }}
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={!newNoteContent.trim() || noteSaving}
                        className="self-end px-4 py-2 bg-primary-800 text-white text-sm rounded-lg hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {noteSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Spara'}
                      </button>
                    </div>

                    {/* Notes list */}
                    {dealNotes.length > 0 && (
                      <div className="space-y-3">
                        {dealNotes.map(note => (
                          <div key={note.id} className="rounded-lg border border-[#E2E8F0] bg-gray-50/50 p-4 group">
                            {editingNoteId === note.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editNoteContent}
                                  onChange={e => setEditNoteContent(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 focus:outline-none focus:border-primary-400 resize-none"
                                  rows={4}
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => handleUpdateNote(note.id)} className="px-3 py-1.5 text-xs bg-primary-800 text-white rounded-lg hover:bg-primary-800">Spara</button>
                                  <button onClick={() => { setEditingNoteId(null); setEditNoteContent('') }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Avbryt</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                                <div className="flex items-center justify-between mt-3">
                                  <span className="text-xs text-gray-400">
                                    {note.created_by && <span className="mr-1">{note.created_by} &middot;</span>}
                                    {timeAgo(note.created_at)}
                                  </span>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingNoteId(note.id); setEditNoteContent(note.content) }} className="p-1.5 text-gray-400 hover:text-primary-700 rounded-lg hover:bg-primary-50 transition-colors" title="Redigera"><Edit3 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Ta bort"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Gmail threads */}
                    {(dealEmailThreads.length > 0 || dealEmailLoading) && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-purple-500" />
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">E-post</span>
                          {dealEmailLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                        </div>
                        {dealEmailThreads.map(thread => (
                          <div key={thread.threadId} className="rounded-lg border border-purple-100 bg-purple-50/30 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{thread.subject}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {extractEmailName(thread.from)}
                                  {thread.messageCount > 1 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">
                                      {thread.messageCount} meddelanden
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                {timeAgo(thread.date)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{thread.snippet}</p>
                            <button
                              onClick={() => fetchDealThreadMessages(thread.threadId)}
                              className="mt-2 text-xs text-purple-600 hover:text-purple-500 flex items-center gap-1"
                            >
                              {dealThreadLoading && dealExpandedThread === thread.threadId ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Mail className="w-3 h-3" />
                              )}
                              {dealExpandedThread === thread.threadId && dealThreadMessages[thread.threadId] ? 'Dölj' : 'Visa konversation'}
                            </button>
                            {dealExpandedThread === thread.threadId && dealThreadMessages[thread.threadId] && (
                              <div className="mt-3 space-y-2">
                                {dealThreadMessages[thread.threadId].map((msg, idx) => (
                                  <div key={msg.messageId || idx} className="p-3 bg-white rounded-lg border border-gray-100">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-medium text-gray-700">{extractEmailName(msg.from)}</span>
                                      <span className="text-[10px] text-gray-400">{timeAgo(msg.date)}</span>
                                    </div>
                                    <div className="text-xs text-gray-600 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                                      {msg.bodyText || msg.snippet}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Empty state - only when no notes AND no emails */}
                    {dealNotes.length === 0 && dealEmailThreads.length === 0 && !dealEmailLoading && (
                      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
                        <p className="text-sm">Inga anteckningar ännu</p>
                        <p className="text-xs mt-1">Skriv en anteckning ovan</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Rityta */}
                {dealTab === 'canvas' && selectedDeal && (
                  <div className="h-[500px]">
                    <ProjectCanvas
                      entityType="lead"
                      entityId={selectedDeal.id}
                      title={`Skiss — ${selectedDeal.title}`}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
    </>
  )
}
