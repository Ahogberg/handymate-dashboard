'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Home, Send } from 'lucide-react'

interface NeighbourModalProps {
  jobType: string
  address: string
  jobId?: string
  onClose: () => void
  onCreated?: () => void
}

const SLIDER_OPTIONS = [0, 5, 10, 20, 50]
const COST_PER_LETTER = 15

export default function NeighbourModal({ jobType, address, jobId, onClose, onCreated }: NeighbourModalProps) {
  const [count, setCount] = useState(10)
  const [letterContent, setLetterContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [quota, setQuota] = useState({ used: 0, quota: 20, remaining: 20 })

  useEffect(() => {
    // Fetch quota + generate letter
    Promise.all([
      fetch('/api/leads/outbound/usage').then(r => r.json()).catch(() => ({ used: 0, quota: 20, remaining: 20 })),
      fetch('/api/leads/neighbours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: jobType,
          source_address: address,
          job_id: jobId,
          neighbour_count: 0, // just generate letter, don't create yet
        }),
      }).then(r => r.json()).catch(() => null),
    ]).then(([quotaData, campaignData]) => {
      if (quotaData) setQuota({ used: quotaData.used || 0, quota: quotaData.quota || 20, remaining: quotaData.remaining || 20 })
      if (campaignData?.campaign?.letter_content) setLetterContent(campaignData.campaign.letter_content)
      setLoading(false)
    })
  }, [])

  const totalCost = count * COST_PER_LETTER
  const overQuota = Math.max(0, count - quota.remaining)
  const extraCost = overQuota * COST_PER_LETTER

  async function handleSend() {
    if (count === 0 || !letterContent.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/leads/neighbours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: jobType,
          source_address: address,
          job_id: jobId,
          neighbour_count: count,
          letter_content: letterContent,
        }),
      })

      if (res.ok) {
        const { campaign } = await res.json()
        // Auto-approve
        await fetch(`/api/leads/neighbours/${campaign.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        })
        onCreated?.()
        onClose()
      }
    } catch { /* silent */ }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-lg">🏘️</div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Nå grannar i området?</h2>
              </div>
            </div>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Du avslutade precis <strong>{jobType}</strong> på <strong>{address}</strong>.
            Grannar kan vara intresserade av samma tjänst.
          </p>

          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-teal-700 animate-spin" />
            </div>
          ) : (
            <>
              {/* Slider */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">Antal grannar</label>
                <div className="flex gap-2">
                  {SLIDER_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        count === n
                          ? 'bg-teal-700 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost info */}
              {count > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Uppskattad kostnad</span>
                    <span className="font-semibold text-gray-900">~{totalCost} kr</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Återstående kvot</span>
                    <span className="text-gray-900">{quota.remaining} brev denna månad</span>
                  </div>
                  {overQuota > 0 && (
                    <div className="flex justify-between text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 -mx-1">
                      <span>Överstiger kvot</span>
                      <span className="font-semibold">{overQuota} extra à {COST_PER_LETTER} kr = {extraCost} kr</span>
                    </div>
                  )}
                </div>
              )}

              {/* Letter content */}
              {count > 0 && (
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brevinnehåll</label>
                  <p className="text-xs text-gray-400 mb-2">AI-genererat — redigera fritt</p>
                  <textarea
                    value={letterContent}
                    onChange={e => setLetterContent(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-y"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {count > 0 ? (
                  <button
                    onClick={handleSend}
                    disabled={saving || !letterContent.trim()}
                    className="flex-1 flex items-center justify-center gap-2 bg-teal-700 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-teal-800 transition-colors"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {saving ? 'Skapar...' : `Skicka till ${count} grannar · ${totalCost} kr`}
                  </button>
                ) : (
                  <button onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-medium text-sm">
                    Inte nu
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
