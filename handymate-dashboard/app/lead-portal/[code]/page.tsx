'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  Plus,
  Send,
  Loader2,
  Clock,
  CheckCircle2,
  Trophy,
  XCircle,
  Phone,
  Mail,
  FileText,
  X,
  AlertTriangle,
} from 'lucide-react'
import { LEAD_CATEGORIES, getLeadCategory } from '@/lib/lead-categories'

interface PortalData {
  source: { id: string; name: string; portal_code: string; default_category: string | null }
  business: { business_name: string; logo_url: string | null; contact_name: string | null }
  leads: Lead[]
  stats: { total: number; contacted: number; won: number }
}

interface Lead {
  lead_id: string
  name: string
  phone: string
  email: string | null
  status: string
  notes: string | null
  source: string
  source_ref: string | null
  created_at: string
  estimated_value: number | null
  pipeline_stage_key: string | null
  category: string | null
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  new: { label: 'Ny', color: 'bg-blue-100 text-blue-700', icon: Clock },
  contacted: { label: 'Kontaktad', color: 'bg-yellow-100 text-yellow-700', icon: CheckCircle2 },
  qualified: { label: 'Kvalificerad', color: 'bg-purple-100 text-purple-700', icon: CheckCircle2 },
  quote_sent: { label: 'Offert skickad', color: 'bg-indigo-100 text-indigo-700', icon: FileText },
  won: { label: 'Vunnen', color: 'bg-green-100 text-green-700', icon: Trophy },
  lost: { label: 'Ej intresse', color: 'bg-red-100 text-red-700', icon: XCircle },
}

const serviceOptions = [
  'Badrum', 'Kök', 'El', 'VVS', 'Måleri', 'Bygg', 'Golv', 'Tak', 'Fasad', 'Trädgård', 'Annat',
]

export default function LeadPortalPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const code = params?.code as string
  const urlCategory = searchParams?.get('kategori') || searchParams?.get('category') || ''

  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ lead_id: string; lead_number: string | null } | null>(null)
  const [tab, setTab] = useState<'form' | 'leads'>('leads')

  // Formulärfält
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formService, setFormService] = useState('')
  const [formCategory, setFormCategory] = useState(urlCategory)
  const [formDescription, setFormDescription] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formRef, setFormRef] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/lead-portal/${code}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Portal hittades inte eller är inaktiv.')
        } else {
          setError('Något gick fel. Försök igen senare.')
        }
        return
      }
      const json = await res.json()
      setData(json)
      // Default-kategori från källan om URL-param saknas och fältet är tomt
      if (!urlCategory && !formCategory && json.source?.default_category) {
        setFormCategory(json.source.default_category)
      }
    } catch {
      setError('Kunde inte ladda portalen.')
    } finally {
      setLoading(false)
    }
  }, [code, urlCategory, formCategory])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Polling: uppdatera status var 30:e sekund (publik sida, ingen auth för realtime)
  useEffect(() => {
    if (!data?.source?.id) return

    const interval = setInterval(() => {
      fetchData()
    }, 30000)

    return () => clearInterval(interval)
  }, [data?.source?.id, fetchData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim() || !formPhone.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/lead-portal/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim() || null,
          service: formService || null,
          category: formCategory || null,
          description: formDescription.trim() || null,
          address: formAddress.trim() || null,
          estimated_value: formValue ? parseInt(formValue) : null,
          desired_date: formDate || null,
          source_ref: formRef.trim() || null,
        }),
      })

      if (!res.ok) throw new Error('Submit failed')

      const result = await res.json()
      setSubmitted({ lead_id: result.lead_id, lead_number: result.lead_number })

      // Reset form (behåll kategori — fortsatt relevant för samma källa)
      setFormName('')
      setFormPhone('')
      setFormEmail('')
      setFormService('')
      setFormCategory(urlCategory || data?.source?.default_category || '')
      setFormDescription('')
      setFormAddress('')
      setFormValue('')
      setFormDate('')
      setFormRef('')
      setShowForm(false)

      // Refresh data
      setTimeout(() => fetchData(), 1000)
    } catch {
      alert('Kunde inte skicka leadet. Försök igen.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-700 mb-2">Portal otillgänglig</h1>
          <p className="text-sm text-gray-500">{error || 'Kunde inte ladda portalen.'}</p>
        </div>
      </div>
    )
  }

  const getStatus = (lead: Lead) => {
    const key = lead.status || 'new'
    return statusConfig[key] || statusConfig.new
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            {data.business.logo_url ? (
              <img src={data.business.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary-700 flex items-center justify-center text-white font-bold text-lg">
                {data.business.business_name.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="font-bold text-gray-900">{data.business.business_name}</h1>
              <p className="text-xs text-gray-500">Lead-portal för {data.source.name}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => { setShowForm(true); setTab('form'); setSubmitted(null) }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-700 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Skicka nytt lead
          </button>
          <button
            onClick={() => { setShowForm(false); setTab('leads') }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'leads' && !showForm
                ? 'bg-white border border-gray-200 text-gray-900 shadow-sm'
                : 'text-gray-600 hover:bg-white hover:border-gray-200 border border-transparent'
            }`}
          >
            Mina leads ({data.stats.total})
          </button>
        </div>

        {/* Submitted success */}
        {submitted && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">Lead skickat!</p>
              <p className="text-xs text-green-600 mt-0.5">
                {submitted.lead_number ? `Ref: ${submitted.lead_number}` : 'Registrerat.'}
                {' '}Du kan följa status i portalen.
              </p>
            </div>
            <button onClick={() => setSubmitted(null)} className="ml-auto">
              <X className="w-4 h-4 text-green-400" />
            </button>
          </div>
        )}

        {/* Formulär */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">Skicka nytt lead</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Kontaktuppgifter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Namn *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                    placeholder="Erik Andersson"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Telefon *</label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                    placeholder="0701234567"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">E-post</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                  placeholder="erik@example.com"
                />
              </div>

              {/* Uppdragsinformation */}
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Uppdragsinformation</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Kategori
                      {urlCategory && <span className="ml-1 text-[10px] text-primary-700">(från länk)</span>}
                    </label>
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none bg-white"
                    >
                      <option value="">Välj kategori...</option>
                      {LEAD_CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tjänst (frivilligt)</label>
                    <select
                      value={formService}
                      onChange={e => setFormService(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none bg-white"
                    >
                      <option value="">Välj...</option>
                      {serviceOptions.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Estimerat värde (kr)</label>
                    <input
                      type="number"
                      value={formValue}
                      onChange={e => setFormValue(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                      placeholder="50000"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Beskrivning</label>
                  <textarea
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none resize-none"
                    placeholder="Beskriv uppdraget..."
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Adress</label>
                    <input
                      type="text"
                      value={formAddress}
                      onChange={e => setFormAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                      placeholder="Storgatan 1, Stockholm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Önskat datum</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={e => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Referens */}
              <div className="border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ert referens-nr</label>
                  <input
                    type="text"
                    value={formRef}
                    onChange={e => setFormRef(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                    placeholder="Ert interna ID för denna lead"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={!formName.trim() || !formPhone.trim() || submitting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary-700 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Skicka lead
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Leads-lista */}
        {!showForm && (
          <>
            {data.leads.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Inga leads ännu</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Skicka ditt första lead genom att klicka på knappen ovan.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.leads.map(lead => {
                  const status = getStatus(lead)
                  const StatusIcon = status.icon
                  const date = new Date(lead.created_at)

                  return (
                    <div key={lead.lead_id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-medium text-gray-900 text-sm truncate">{lead.name}</h3>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {status.label}
                            </span>
                            {(() => {
                              const cat = getLeadCategory(lead.category)
                              return cat ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cat.bgClass}`}>
                                  {cat.label}
                                </span>
                              ) : null
                            })()}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                            {lead.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {lead.phone}
                              </span>
                            )}
                            {lead.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {lead.email}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {date.toLocaleDateString('sv-SE')}
                            </span>
                          </div>
                          {lead.notes && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{lead.notes}</p>
                          )}
                        </div>
                        {lead.estimated_value && (
                          <span className="text-sm font-medium text-gray-700 ml-3 flex-shrink-0">
                            {lead.estimated_value.toLocaleString('sv-SE')} kr
                          </span>
                        )}
                      </div>
                      {lead.source_ref && (
                        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                          Ref: {lead.source_ref}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Statistik-footer */}
            {data.stats.total > 0 && (
              <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-around text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{data.stats.total}</div>
                    <div className="text-xs text-gray-500">Skickade</div>
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">{data.stats.contacted}</div>
                    <div className="text-xs text-gray-500">Kontaktade</div>
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div>
                    <div className="text-2xl font-bold text-green-600">{data.stats.won}</div>
                    <div className="text-xs text-gray-500">Vunna</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-400">
          Drivs av <span className="font-medium text-primary-700">Handymate</span>
        </div>
      </div>
    </div>
  )
}
