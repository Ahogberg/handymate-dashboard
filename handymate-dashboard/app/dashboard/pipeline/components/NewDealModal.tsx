'use client'

import Link from 'next/link'
import { CheckCircle2, File as FileIcon, Loader2, Plus, Search, Upload, X } from 'lucide-react'
import { usePipelineContext } from '../context'

/**
 * Skapa-ny-deal-modal — öppnas från PipelineHeaderns "Ny deal"-knapp.
 *
 * Öppnandet warmar fetch:ar (kunder, jobbtyper, lead-källor) i headern,
 * så att modalen alltid har data redo. Inline-skapande av kund stöds —
 * lägger till nya kunden i context.customers + sätter customer_id direkt.
 */
export function NewDealModal() {
  const {
    showNewDeal,
    setShowNewDeal,
    newDealForm,
    setNewDealForm,
    newDealSubmitting,
    newDealFiles,
    setNewDealFiles,
    customers,
    setCustomers,
    customerSearch,
    setCustomerSearch,
    showCustomerDropdown,
    setShowCustomerDropdown,
    showNewCustomerForm,
    setShowNewCustomerForm,
    newCustomerForm,
    setNewCustomerForm,
    newCustomerSubmitting,
    setNewCustomerSubmitting,
    filteredCustomers,
    createDeal,
    jobTypes,
    jobTypeOptions,
    teamMembers,
    leadSourceOptions,
    showToast,
  } = usePipelineContext()

  if (!showNewDeal) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setShowNewDeal(false)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
            <h2 className="text-lg font-bold text-gray-900">Ny deal</h2>
            <button onClick={() => { setShowNewDeal(false); setNewDealFiles([]) }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Titel *</label>
              <input type="text" value={newDealForm.title} onChange={e => setNewDealForm(prev => ({ ...prev, title: e.target.value }))} placeholder="T.ex. Badrumsrenovering Andersson"
                className="w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400 uppercase tracking-wider block">Kund</label>
                {!newDealForm.customer_id && !showNewCustomerForm && (
                  <button
                    onClick={() => {
                      setShowNewCustomerForm(true)
                      setShowCustomerDropdown(false)
                      const parts = customerSearch.trim().split(/\s+/)
                      setNewCustomerForm({ firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '', phone: '', email: '' })
                    }}
                    className="flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800 font-medium"
                  >
                    <Plus className="w-3 h-3" /> Ny kund
                  </button>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={customerSearch}
                  onChange={e => {
                    setCustomerSearch(e.target.value)
                    setShowCustomerDropdown(true)
                    setShowNewCustomerForm(false)
                    if (newDealForm.customer_id) setNewDealForm(prev => ({ ...prev, customer_id: '' }))
                  }}
                  onFocus={() => { if (customerSearch && !newDealForm.customer_id) setShowCustomerDropdown(true) }}
                  placeholder="Sök kund..."
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400" />
              </div>
              {newDealForm.customer_id && (
                <div className="mt-1.5 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary-700" />
                  <span className="text-xs text-primary-700 font-medium">{customers.find(c => c.customer_id === newDealForm.customer_id)?.name || customerSearch}</span>
                  <button onClick={() => { setNewDealForm(prev => ({ ...prev, customer_id: '' })); setCustomerSearch('') }} className="text-xs text-gray-400 hover:text-gray-900"><X className="w-3 h-3" /></button>
                </div>
              )}
              {showCustomerDropdown && customerSearch && !newDealForm.customer_id && (
                <div className="mt-1 max-h-40 overflow-y-auto bg-white border border-[#E2E8F0] rounded-lg shadow-lg">
                  {filteredCustomers.slice(0, 8).map(c => (
                    <button key={c.customer_id} onClick={() => { setNewDealForm(prev => ({ ...prev, customer_id: c.customer_id })); setCustomerSearch(c.name || ''); setShowCustomerDropdown(false) }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-gray-50 transition-colors flex items-center justify-between">
                      <span>{c.name}</span><span className="text-xs text-gray-400">{c.phone_number}</span>
                    </button>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <>
                      <div className="px-3 py-2 text-xs text-gray-400">Inga kunder hittades för &ldquo;{customerSearch}&rdquo;</div>
                      <button
                        onClick={() => {
                          setShowCustomerDropdown(false)
                          setShowNewCustomerForm(true)
                          const parts = customerSearch.trim().split(/\s+/)
                          setNewCustomerForm({ firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '', phone: '', email: '' })
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-primary-700 font-medium hover:bg-primary-50 transition-colors flex items-center gap-2 border-t border-gray-100">
                        <Plus className="w-3.5 h-3.5" /> Skapa ny kund: &ldquo;{customerSearch}&rdquo;
                      </button>
                    </>
                  )}
                </div>
              )}
              {showNewCustomerForm && !newDealForm.customer_id && (
                <div className="mt-2 p-3 bg-primary-50/50 border border-[#E2E8F0] rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary-800">Ny kund</span>
                    <button onClick={() => setShowNewCustomerForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={newCustomerForm.firstName} onChange={e => setNewCustomerForm(prev => ({ ...prev, firstName: e.target.value }))} placeholder="Förnamn *"
                      className="px-2.5 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-400" />
                    <input type="text" value={newCustomerForm.lastName} onChange={e => setNewCustomerForm(prev => ({ ...prev, lastName: e.target.value }))} placeholder="Efternamn"
                      className="px-2.5 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="tel" value={newCustomerForm.phone} onChange={e => setNewCustomerForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="Telefon *"
                      className="px-2.5 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-400" />
                    <input type="email" value={newCustomerForm.email} onChange={e => setNewCustomerForm(prev => ({ ...prev, email: e.target.value }))} placeholder="E-post (valfritt)"
                      className="px-2.5 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-400" />
                  </div>
                  <button
                    onClick={async () => {
                      const fullName = [newCustomerForm.firstName, newCustomerForm.lastName].filter(Boolean).join(' ').trim()
                      if (!fullName) { showToast('Ange ett namn', 'error'); return }
                      if (!newCustomerForm.phone.trim()) { showToast('Ange telefonnummer', 'error'); return }
                      setNewCustomerSubmitting(true)
                      try {
                        const res = await fetch('/api/customers', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: fullName,
                            phone_number: newCustomerForm.phone.trim(),
                            email: newCustomerForm.email.trim() || null,
                          })
                        })
                        if (!res.ok) throw new Error()
                        const data = await res.json()
                        const created = data.customer
                        setCustomers(prev => [{ customer_id: created.customer_id, name: created.name, phone_number: created.phone_number || '', email: created.email }, ...prev])
                        setNewDealForm(prev => ({ ...prev, customer_id: created.customer_id }))
                        setCustomerSearch(created.name)
                        setShowNewCustomerForm(false)
                        setNewCustomerForm({ firstName: '', lastName: '', phone: '', email: '' })
                        showToast('Kund skapad', 'success')
                      } catch {
                        showToast('Kunde inte skapa kund', 'error')
                      } finally {
                        setNewCustomerSubmitting(false)
                      }
                    }}
                    disabled={newCustomerSubmitting || !newCustomerForm.firstName.trim() || !newCustomerForm.phone.trim()}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary-700 text-white text-sm font-medium transition-all disabled:opacity-50">
                    {newCustomerSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Skapa och välj
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Värde (kr)</label>
                <input type="number" value={newDealForm.value} onChange={e => setNewDealForm(prev => ({ ...prev, value: e.target.value }))} placeholder="0"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Prioritet</label>
                <select value={newDealForm.priority} onChange={e => setNewDealForm(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-400">
                  <option value="low">Låg</option><option value="medium">Medium</option><option value="high">Hög</option><option value="urgent">Brådskande</option>
                </select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400 uppercase tracking-wider block">Jobbtyp</label>
                <Link href="/dashboard/settings/job-types" className="text-[10px] text-primary-700 hover:text-primary-800">
                  Hantera →
                </Link>
              </div>
              <select
                value={newDealForm.job_type}
                onChange={e => {
                  const val = e.target.value
                  setNewDealForm(prev => ({ ...prev, job_type: val }))
                  // Föreslå automatiskt person med matchande specialitet
                  if (val && !newDealForm.assigned_to) {
                    const match = teamMembers.find(m => Array.isArray((m as any).specialties) && (m as any).specialties.includes(val))
                    if (match) setNewDealForm(prev => ({ ...prev, job_type: val, assigned_to: match.id }))
                  }
                }}
                className="w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-400"
              >
                <option value="">Välj jobbtyp...</option>
                {jobTypeOptions.length > 0
                  ? jobTypeOptions.map(jt => <option key={jt.id} value={jt.slug}>{jt.name}</option>)
                  : jobTypes.map(jt => <option key={jt} value={jt}>{jt}</option>)
                }
              </select>
            </div>

            {/* Tilldela till teammedlem */}
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Tilldela till</label>
              <select
                value={newDealForm.assigned_to}
                onChange={e => setNewDealForm(prev => ({ ...prev, assigned_to: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-400"
              >
                <option value="">Ej tilldelad</option>
                {teamMembers.map(m => {
                  const specs = Array.isArray((m as any).specialties) ? (m as any).specialties : []
                  const matches = newDealForm.job_type && specs.includes(newDealForm.job_type)
                  return (
                    <option key={m.id} value={m.id}>
                      {m.name}{matches ? ' ✓ matchar jobbtyp' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400 uppercase tracking-wider block">Var kom kunden ifrån?</label>
                <Link href="/dashboard/settings/lead-sources" className="text-[10px] text-primary-700 hover:text-primary-800">
                  Hantera källor →
                </Link>
              </div>
              <select value={newDealForm.source} onChange={e => setNewDealForm(prev => ({ ...prev, source: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-primary-400">
                <option value="">Välj källa (valfritt)...</option>
                {leadSourceOptions.filter(s => s.source_type === 'manual').length > 0 && (
                  <optgroup label="Egna kanaler">
                    {leadSourceOptions.filter(s => s.source_type === 'manual').map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </optgroup>
                )}
                {leadSourceOptions.filter(s => s.source_type !== 'manual').length > 0 && (
                  <optgroup label="Leverantörsportaler">
                    {leadSourceOptions.filter(s => s.source_type !== 'manual').map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Beskrivning</label>
              <textarea value={newDealForm.description} onChange={e => setNewDealForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Kort beskrivning..." rows={3}
                className="w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400 resize-y min-h-[80px] max-h-[300px]" />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Dokument (valfritt)</label>
              <label className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] border-dashed rounded-lg cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors">
                <Upload className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">Bifoga fil</span>
                <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden"
                  onChange={e => {
                    const files = e.target.files
                    if (!files) return
                    setNewDealFiles(prev => [...prev, ...Array.from(files).filter(f => f.size <= 10 * 1024 * 1024)])
                    e.target.value = ''
                  }} />
                <span className="text-xs text-gray-400 ml-auto">PDF, bilder, Word (max 10 MB)</span>
              </label>
              {newDealFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {newDealFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#E2E8F0] rounded-full text-xs text-gray-700">
                      <FileIcon className="w-3 h-3 text-gray-400" />
                      {f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name}
                      <button onClick={() => setNewDealFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-gray-700"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button onClick={() => { setShowNewDeal(false); setNewDealFiles([]) }} className="px-4 py-2 rounded-lg bg-gray-100 border border-[#E2E8F0] text-sm text-gray-600 hover:text-gray-900 transition-colors">Avbryt</button>
            <button onClick={createDeal} disabled={newDealSubmitting || !newDealForm.title.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-700 text-white text-sm font-medium transition-all disabled:opacity-50">
              {newDealSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Skapa deal
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
