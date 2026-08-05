'use client'

import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Check,
  X,
  MapPin,
} from 'lucide-react'
import { format, subWeeks, addWeeks, parseISO, isSameDay } from 'date-fns'
import { sv } from 'date-fns/locale'
import { fmtDuration, type TimeEntry, type Customer, type WorkType } from './types'

/**
 * TodayEntries — R4-A (tasks/resurs-masterplan.md). "Dagens poster-listan":
 * veckonavigering + veckotavla + listvy (filter + bulk-godkännande/
 * fakturering + rad-actions). Ren utflyttning ur TodayView.tsx, oförändrad
 * markup/beteende — allt state (filter, urval, vy-läge) lyft till
 * containern (TodayView) och skickas ner som props.
 */

export interface WeekGridRow {
  customerId: string
  label: string
  days: { date: Date; dayKey: string; entries: TimeEntry[]; totalMinutes: number }[]
  totalMinutes: number
}

interface TodayEntriesProps {
  viewMode: 'week' | 'list'
  setViewMode: (mode: 'week' | 'list') => void
  currentWeek: Date
  setCurrentWeek: (date: Date) => void
  weekStart: Date
  weekEnd: Date
  weekNumber: number
  weekDates: Date[]
  weekGrid: WeekGridRow[]
  columnTotals: number[]
  grandTotal: number
  openAddModal: (prefillDate?: string, prefillCustomer?: string) => void
  openEditModal: (entry: TimeEntry) => void
  handleDelete: (id: string) => void

  filteredEntries: TimeEntry[]
  customers: Customer[]
  workTypes: WorkType[]
  filterCustomer: string
  setFilterCustomer: (v: string) => void
  filterWorkType: string
  setFilterWorkType: (v: string) => void
  filterInvoiced: 'all' | 'yes' | 'no'
  setFilterInvoiced: (v: 'all' | 'yes' | 'no') => void
  filterApproval: 'all' | 'pending' | 'approved' | 'rejected'
  setFilterApproval: (v: 'all' | 'pending' | 'approved' | 'rejected') => void
  showFilters: boolean
  setShowFilters: (v: boolean) => void

  isOwnerOrAdmin: boolean
  selectedIds: Set<string>
  toggleSelect: (id: string) => void
  selectAll: () => void
  bulkLoading: boolean
  approvingIds: boolean
  handleBulkMarkInvoiced: () => void
  handleBulkApproval: (action: 'approve' | 'reject') => void
}

export default function TodayEntries({
  viewMode,
  setViewMode,
  currentWeek,
  setCurrentWeek,
  weekStart,
  weekEnd,
  weekNumber,
  weekDates,
  weekGrid,
  columnTotals,
  grandTotal,
  openAddModal,
  openEditModal,
  handleDelete,
  filteredEntries,
  customers,
  workTypes,
  filterCustomer,
  setFilterCustomer,
  filterWorkType,
  setFilterWorkType,
  filterInvoiced,
  setFilterInvoiced,
  filterApproval,
  setFilterApproval,
  showFilters,
  setShowFilters,
  isOwnerOrAdmin,
  selectedIds,
  toggleSelect,
  selectAll,
  bulkLoading,
  approvingIds,
  handleBulkMarkInvoiced,
  handleBulkApproval,
}: TodayEntriesProps) {
  return (
    <>
      {/* Week nav */}
      <div className="flex items-center justify-between mb-[14px]">
        <div className="flex items-center">
          <div className="flex gap-1 mr-[10px]">
            <button onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
              className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#64748B] flex items-center justify-center cursor-pointer hover:text-[#1E293B]">
              <ChevronLeft className="w-[14px] h-[14px]" />
            </button>
            <button onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#64748B] flex items-center justify-center cursor-pointer hover:text-[#1E293B]">
              <ChevronRight className="w-[14px] h-[14px]" />
            </button>
          </div>
          <button onClick={() => setCurrentWeek(new Date())}
            className="text-[14px] font-medium text-[#1E293B] bg-transparent border-none cursor-pointer hover:text-[#0F766E]">
            V{weekNumber} · {format(weekStart, 'd MMMM', { locale: sv })} – {format(weekEnd, 'd MMMM', { locale: sv })}
          </button>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('week')}
            className={`px-3 py-[5px] text-[12px] rounded-full border-thin cursor-pointer ${
              viewMode === 'week' ? 'bg-[#F1F5F9] text-[#1E293B] border-[#E2E8F0]' : 'bg-transparent text-[#64748B] border-[#E2E8F0]'
            }`}>
            Vecka
          </button>
          <button onClick={() => setViewMode('list')}
            className={`px-3 py-[5px] text-[12px] rounded-full border-thin cursor-pointer ${
              viewMode === 'list' ? 'bg-[#F1F5F9] text-[#1E293B] border-[#E2E8F0]' : 'bg-transparent text-[#64748B] border-[#E2E8F0]'
            }`}>
            Lista
          </button>
        </div>
      </div>

      {/* WEEK GRID VIEW */}
      {viewMode === 'week' && (
        <div className="bg-white border-thin border-[#E2E8F0] rounded-xl overflow-hidden mb-6">
          {/* Grid header */}
          <div className="grid grid-cols-[180px_repeat(7,1fr)_72px] border-b border-thin border-[#E2E8F0]">
            <div className="px-4 py-[10px] text-[10px] tracking-[0.07em] uppercase text-[#CBD5E1] text-left">Projekt</div>
            {weekDates.map((date, i) => {
              const isToday = isSameDay(date, new Date())
              return (
                <div key={i} className={`px-2 py-[10px] text-[10px] tracking-[0.07em] uppercase text-center ${isToday ? 'text-[#0F766E]' : 'text-[#CBD5E1]'}`}>
                  {format(date, 'EEE', { locale: sv }).toUpperCase()} {format(date, 'd')}
                </div>
              )
            })}
            <div className="px-2 py-[10px] text-[10px] tracking-[0.07em] uppercase text-[#CBD5E1] text-center">Summa</div>
          </div>

          {/* Grid rows */}
          {weekGrid.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[#94A3B8]">
              <p>Inga tidposter denna vecka</p>
              <p className="text-[12px] text-[#CBD5E1] mt-1">Klicka på en cell eller &quot;Lägg till&quot; för att registrera tid</p>
            </div>
          ) : (
            <>
              {weekGrid.map(row => (
                <div key={row.customerId} className="grid grid-cols-[180px_repeat(7,1fr)_72px] border-b border-thin border-[#E2E8F0] last:border-b-0 min-h-[50px] items-center">
                  <div className="px-4 text-[13px] font-medium text-[#1E293B] min-h-[50px] flex items-center">{row.label}</div>
                  {row.days.map((day, i) => {
                    const isToday = isSameDay(day.date, new Date())
                    return (
                      <div
                        key={i}
                        onClick={() => day.entries.length > 0 ? openEditModal(day.entries[0]) : openAddModal(day.dayKey, row.customerId !== 'none' ? row.customerId : undefined)}
                        className={`px-2 min-h-[50px] flex items-center justify-center cursor-pointer text-[13px] hover:bg-[#F8FAFC] ${isToday ? 'bg-[#F0FDFA]' : ''}`}
                      >
                        {day.totalMinutes > 0 ? (
                          <span className="bg-[#CCFBF1] text-[#0F766E] text-[12px] font-medium px-[10px] py-[3px] rounded-full">
                            {fmtDuration(day.totalMinutes)}
                          </span>
                        ) : (
                          <span className="text-[#CBD5E1] text-[18px] hover:text-[#0F766E]">+</span>
                        )}
                      </div>
                    )
                  })}
                  <div className="px-2 min-h-[50px] flex items-center justify-center text-[13px] font-medium text-[#1E293B]">
                    {fmtDuration(row.totalMinutes)}
                  </div>
                </div>
              ))}

              {/* Add new customer/project row */}
              <div className="grid grid-cols-[180px_repeat(7,1fr)_72px] min-h-[50px] items-center">
                <div
                  onClick={() => openAddModal()}
                  className="px-4 text-[12px] text-[#CBD5E1] min-h-[50px] flex items-center cursor-pointer hover:text-[#0F766E]"
                >
                  + Ny kund / projekt
                </div>
                {weekDates.map((_, i) => (
                  <div key={i} onClick={() => openAddModal(format(weekDates[i], 'yyyy-MM-dd'))}
                    className="min-h-[50px] flex items-center justify-center cursor-pointer text-[#CBD5E1] text-[18px] hover:text-[#0F766E] hover:bg-[#F0FDFA]">
                    +
                  </div>
                ))}
                <div className="min-h-[50px] flex items-center justify-center text-[13px] text-[#CBD5E1]">—</div>
              </div>
            </>
          )}

          {/* Column totals footer */}
          {weekGrid.length > 0 && (
            <div className="grid grid-cols-[180px_repeat(7,1fr)_72px] border-t border-thin border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="px-4 py-[10px] text-[13px] font-medium text-[#64748B]">Summa</div>
              {columnTotals.map((total, i) => (
                <div key={i} className="px-2 py-[10px] text-center text-[13px] font-medium text-[#1E293B]">
                  {total > 0 ? fmtDuration(total) : '–'}
                </div>
              ))}
              <div className="px-2 py-[10px] text-center text-[13px] font-medium text-[#0F766E]">
                {fmtDuration(grandTotal)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LIST VIEW */}
      {(viewMode === 'list' || viewMode === 'week') && (
        <div className={`${viewMode === 'week' ? 'sm:hidden' : ''} bg-white border-thin border-[#E2E8F0] rounded-xl`}>
          {/* Filters header */}
          <div className="px-4 py-3 border-b border-thin border-[#E2E8F0]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#1E293B]">
                Tidposter <span className="text-[#94A3B8] font-normal ml-1">({filteredEntries.length})</span>
              </span>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <>
                    <button onClick={() => handleBulkApproval('approve')} disabled={approvingIds}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#CCFBF1] border-thin border-[#0F766E] rounded-lg text-[12px] text-[#0F766E] disabled:opacity-50">
                      {approvingIds ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Godkänn ({selectedIds.size})
                    </button>
                    <button onClick={() => handleBulkApproval('reject')} disabled={approvingIds}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border-thin border-red-200 rounded-lg text-[12px] text-red-600 disabled:opacity-50">
                      <X className="w-3 h-3" />
                      Avslå
                    </button>
                    <button onClick={handleBulkMarkInvoiced} disabled={bulkLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#CCFBF1] border-thin border-[#0F766E] rounded-lg text-[12px] text-[#0F766E] disabled:opacity-50">
                      {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Fakturera ({selectedIds.size})
                    </button>
                  </>
                )}
                <button onClick={() => setShowFilters(!showFilters)}
                  className={`px-3 py-[5px] text-[12px] border-thin rounded-lg cursor-pointer ${showFilters ? 'bg-[#CCFBF1] text-[#0F766E] border-[#0F766E]' : 'bg-transparent text-[#64748B] border-[#E2E8F0]'}`}>
                  Filter
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
                  className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]">
                  <option value="">Alla kunder</option>
                  {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.name}</option>)}
                </select>
                <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
                  className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]">
                  <option value="">Alla arbetstyper</option>
                  {workTypes.map(wt => <option key={wt.work_type_id} value={wt.work_type_id}>{wt.name}</option>)}
                </select>
                <select value={filterInvoiced} onChange={e => setFilterInvoiced(e.target.value as any)}
                  className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]">
                  <option value="all">Alla</option>
                  <option value="no">Ej fakturerade</option>
                  <option value="yes">Fakturerade</option>
                </select>
                <select value={filterApproval} onChange={e => setFilterApproval(e.target.value as any)}
                  className="px-3 py-[7px] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] bg-white focus:outline-none focus:border-[#0F766E]">
                  <option value="all">Alla status</option>
                  <option value="pending">Väntar godkännande</option>
                  <option value="approved">Godkända</option>
                  <option value="rejected">Avslagna</option>
                </select>
              </div>
            )}
          </div>

          {/* List items */}
          <div>
            {filteredEntries.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[#94A3B8]">
                Inga tidposter denna vecka
              </div>
            ) : (
              <>
                {viewMode === 'list' && filteredEntries.some(e => !e.invoiced) && (
                  <div className="px-4 py-2 border-b border-thin border-[#E2E8F0]">
                    <button onClick={selectAll} className="flex items-center gap-2 text-[12px] text-[#94A3B8] hover:text-[#1E293B]">
                      <div className={`w-4 h-4 rounded border-thin ${selectedIds.size === filteredEntries.filter(e => !e.invoiced).length && selectedIds.size > 0 ? 'bg-[#0F766E] border-[#0F766E]' : 'border-[#E2E8F0]'} flex items-center justify-center`}>
                        {selectedIds.size === filteredEntries.filter(e => !e.invoiced).length && selectedIds.size > 0 && <Check className="w-3 h-3 text-white" />}
                      </div>
                      Välj alla ej fakturerade
                    </button>
                  </div>
                )}

                {filteredEntries.map(entry => {
                  const catLabel = ({ work: 'Arbete', travel: 'Restid', material_pickup: 'Material', meeting: 'Möte', admin: 'Admin' } as Record<string, string>)[(entry as any).work_category] || 'Arbete'
                  return (
                    <div key={entry.time_entry_id} className="px-4 py-3 border-b border-thin border-[#F1F5F9] last:border-b-0 hover:bg-[#F8FAFC]">
                      <div className="flex items-start gap-3">
                        {viewMode === 'list' && !entry.invoiced && (
                          <button onClick={() => toggleSelect(entry.time_entry_id)} className="mt-1 flex-shrink-0">
                            <div className={`w-4 h-4 rounded border-thin ${selectedIds.has(entry.time_entry_id) ? 'bg-[#0F766E] border-[#0F766E]' : 'border-[#E2E8F0] hover:border-[#94A3B8]'} flex items-center justify-center`}>
                              {selectedIds.has(entry.time_entry_id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </button>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-[#1E293B]">
                              {fmtDuration(entry.duration_minutes)}
                            </span>
                            <span className="text-[11px] text-[#94A3B8]">{catLabel}</span>
                            {entry.work_type && (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#CCFBF1] text-[#0F766E]">
                                {entry.work_type.name}
                              </span>
                            )}
                            {entry.invoiced ? (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#CCFBF1] text-[#0F766E]">
                                Fakturerad
                              </span>
                            ) : entry.is_billable ? (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-amber-50 text-amber-600">
                                Ofakturerad
                              </span>
                            ) : null}
                            {entry.approval_status === 'pending' && (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-yellow-50 text-yellow-600">
                                Väntar
                              </span>
                            )}
                            {entry.approval_status === 'approved' && (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#CCFBF1] text-[#0F766E]">
                                Godkänd
                              </span>
                            )}
                            {entry.approval_status === 'rejected' && (
                              <span className="px-2 py-0.5 text-[11px] rounded-full bg-red-50 text-red-600" title={entry.rejection_reason || ''}>
                                Avslagen
                              </span>
                            )}
                          </div>
                          {entry.description && (
                            <p className="text-[12px] text-[#64748B] mt-1 truncate">{entry.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-[#94A3B8] flex-wrap">
                            <span>{format(parseISO(entry.work_date), 'EEE d MMM', { locale: sv })}</span>
                            {isOwnerOrAdmin && entry.business_user && (
                              <span className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: entry.business_user.color }} />
                                {entry.business_user.name}
                              </span>
                            )}
                            {entry.customer && <span>{entry.customer.name}</span>}
                            {(entry as any).start_latitude && (
                              <a
                                href={`https://www.google.com/maps?q=${(entry as any).start_latitude},${(entry as any).start_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[#0F766E] hover:underline"
                                title={entry.start_address || 'Visa på karta'}
                                onClick={e => e.stopPropagation()}
                              >
                                <MapPin className="w-3 h-3" />
                                GPS
                              </a>
                            )}
                            {entry.hourly_rate && <span>{entry.hourly_rate.toLocaleString('sv-SE')} kr/tim</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!entry.invoiced && (
                            <>
                              <button onClick={() => openEditModal(entry)}
                                className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#94A3B8] hover:text-[#1E293B] flex items-center justify-center">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(entry.time_entry_id)}
                                className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#94A3B8] hover:text-red-500 flex items-center justify-center">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
