'use client'

import { usePipelineContext } from '../context'

/**
 * Boka-platsbesök-modal — öppnas från deal-detaljvyns "Platsbesök"-knapp.
 * Kräver att en deal är vald (selectedDeal). All state + bookSiteVisit kommer
 * från context; team-listan laddas av page.tsx (bookSiteVisit behöver den
 * för att skicka SMS till inbjudna deltagare).
 */
export function SiteVisitModal() {
  const {
    selectedDeal,
    showSiteVisit,
    setShowSiteVisit,
    siteVisitForm,
    setSiteVisitForm,
    siteVisitSaving,
    siteVisitTeam,
    bookSiteVisit,
  } = usePipelineContext()

  if (!showSiteVisit || !selectedDeal) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) setShowSiteVisit(false) }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Boka platsbesök</h3>
        <p className="text-sm text-gray-500 mb-4">{selectedDeal.title}{selectedDeal.customer?.name ? ` · ${selectedDeal.customer.name}` : ''}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Datum *</label>
              <input type="date" value={siteVisitForm.date} onChange={e => setSiteVisitForm(p => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tid</label>
              <input type="time" value={siteVisitForm.time} onChange={e => setSiteVisitForm(p => ({ ...p, time: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Längd</label>
            <select value={siteVisitForm.duration} onChange={e => setSiteVisitForm(p => ({ ...p, duration: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="30">30 min</option>
              <option value="60">1 timme</option>
              <option value="90">1,5 timmar</option>
              <option value="120">2 timmar</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Anteckning</label>
            <input type="text" value={siteVisitForm.notes} onChange={e => setSiteVisitForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="T.ex. adress eller vad som ska inspekteras"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          {selectedDeal.customer?.phone_number && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={siteVisitForm.sendSms} onChange={e => setSiteVisitForm(p => ({ ...p, sendSms: e.target.checked }))}
                className="rounded border-gray-300 text-primary-700 focus:ring-primary-600" />
              <span className="text-sm text-gray-600">Skicka SMS till kund</span>
            </label>
          )}

          {/* Team invite */}
          {siteVisitTeam.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bjud in deltagare (valfritt)</label>
              <div className="flex flex-wrap gap-1.5">
                {siteVisitTeam.map(m => (
                  <button key={m.id} type="button"
                    onClick={() => setSiteVisitForm(p => ({
                      ...p,
                      invitedTeam: p.invitedTeam.includes(m.id)
                        ? p.invitedTeam.filter(id => id !== m.id)
                        : [...p.invitedTeam, m.id]
                    }))}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                      siteVisitForm.invitedTeam.includes(m.id)
                        ? 'bg-primary-50 border-primary-400 text-primary-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* External UE */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Extern underentreprenör (valfritt)</label>
            <input type="text" value={siteVisitForm.externalUe}
              onChange={e => setSiteVisitForm(p => ({ ...p, externalUe: e.target.value }))}
              placeholder="Namn + telefon, t.ex. Erik +46701234567"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={bookSiteVisit} disabled={siteVisitSaving || !siteVisitForm.date}
            className="flex-1 bg-primary-800 text-white py-2.5 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-primary-800 transition-colors">
            {siteVisitSaving ? 'Bokar...' : 'Boka platsbesök'}
          </button>
          <button onClick={() => setShowSiteVisit(false)} className="px-4 py-2.5 border border-[#E2E8F0] rounded-xl text-sm text-gray-500">
            Avbryt
          </button>
        </div>
      </div>
    </div>
  )
}
