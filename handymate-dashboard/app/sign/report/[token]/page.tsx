'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react'

interface Report {
  id: string
  title: string
  description: string | null
  work_performed: string | null
  materials_used: string | null
  report_number: string | null
  status: string
  signed_at: string | null
  signed_by: string | null
  signature_token: string
  created_at: string
  photos: Array<{ id: string; url: string; caption: string | null; type: string }>
  business: {
    business_name: string
    contact_name: string | null
    org_number: string | null
    f_skatt_registered: boolean | null
    logo_url: string | null
  } | null
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function SignReportPage() {
  const params = useParams()
  const token = params?.token as string

  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [signerName, setSignerName] = useState('')
  const [note, setNote] = useState('')
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [rejected, setRejected] = useState(false)

  useEffect(() => {
    fetchReport()
  }, [token])

  async function fetchReport() {
    try {
      const res = await fetch(`/api/field-reports/public?token=${token}`)
      if (!res.ok) {
        setError('Rapporten hittades inte')
        setLoading(false)
        return
      }
      const data = await res.json()
      setReport(data.report)
    } catch {
      setError('Kunde inte ladda rapporten')
    }
    setLoading(false)
  }

  async function handleSign() {
    if (!signerName.trim() || !report) return
    setSigning(true)
    try {
      await fetch(`/api/field-reports/${report.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: report.signature_token,
          signed_by: signerName.trim(),
          customer_note: note.trim() || null,
          action: 'sign',
        }),
      })
      setSigned(true)
    } catch {
      setError('Något gick fel')
    }
    setSigning(false)
  }

  async function handleReject() {
    if (!report) return
    setSigning(true)
    try {
      await fetch(`/api/field-reports/${report.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: report.signature_token,
          signed_by: signerName.trim() || null,
          customer_note: note.trim() || null,
          action: 'reject',
        }),
      })
      setRejected(true)
    } catch {
      setError('Något gick fel')
    }
    setSigning(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">{error || 'Rapporten hittades inte'}</p>
        </div>
      </div>
    )
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Signerat!</h2>
          <p className="text-gray-500">Tack {signerName}! Rapporten är nu signerad och sparad.</p>
        </div>
      </div>
    )
  }

  if (rejected) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">📝</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invändning skickad</h2>
          <p className="text-gray-500">Hantverkaren har fått ditt meddelande och återkommer.</p>
        </div>
      </div>
    )
  }

  if (report.status === 'signed') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-12 h-12 text-primary-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Redan signerad</h2>
          <p className="text-gray-500">Signerades av {report.signed_by} den {report.signed_at ? formatDate(report.signed_at) : '—'}.</p>
        </div>
      </div>
    )
  }

  const biz = report.business

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {biz?.logo_url && (
            <img src={biz.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
          )}
          <div>
            <p className="font-semibold text-gray-900">{biz?.business_name || 'Hantverkare'}</p>
            <p className="text-sm text-gray-400">Fältrapport {report.report_number}</p>
          </div>
        </div>

        {/* Report content */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
          <div className="p-5 border-b border-gray-100">
            <h1 className="text-xl font-bold text-gray-900">{report.title}</h1>
            <p className="text-sm text-gray-400 mt-1">{formatDate(report.created_at)}</p>
          </div>

          {report.work_performed && (
            <div className="p-5 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Utfört arbete</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{report.work_performed}</p>
            </div>
          )}

          {report.materials_used && (
            <div className="p-5 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Material</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{report.materials_used}</p>
            </div>
          )}

          {report.photos?.length > 0 && (
            <div className="p-5 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Foton</p>
              <div className="grid grid-cols-2 gap-2">
                {report.photos.map(photo => (
                  <img key={photo.id} src={photo.url} alt={photo.caption || ''} className="w-full aspect-square object-cover rounded-xl" />
                ))}
              </div>
            </div>
          )}

          <div className="p-5 bg-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Utförare</p>
            <p className="text-sm font-medium text-gray-900">{biz?.contact_name || '—'}</p>
            <p className="text-sm text-gray-500">{biz?.business_name}</p>
            {biz?.f_skatt_registered && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full mt-1 inline-block">F-skatt godkänd</span>
            )}
            {biz?.org_number && (
              <p className="text-xs text-gray-400 mt-1">Org.nr: {biz.org_number}</p>
            )}
          </div>
        </div>

        {/* Signing form */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          <h3 className="font-semibold text-gray-900 mb-4">Signera rapporten</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Ditt namn *</label>
              <input
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="För- och efternamn"
                className="w-full border border-gray-300 rounded-xl p-3 mt-1 text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Kommentar (valfritt)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Eventuella synpunkter..."
                rows={2}
                className="w-full border border-gray-300 rounded-xl p-3 mt-1 text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleSign}
          disabled={!signerName.trim() || signing}
          className="w-full bg-primary-800 text-white py-4 rounded-2xl font-semibold text-lg mb-3 disabled:opacity-40 hover:bg-primary-800 transition-colors"
        >
          {signing ? 'Signerar...' : 'Jag godkänner arbetet'}
        </button>

        <button
          onClick={handleReject}
          disabled={signing}
          className="w-full border-2 border-red-200 text-red-600 py-3 rounded-2xl font-medium text-sm hover:bg-red-50 transition-colors"
        >
          Jag har invändningar
        </button>

        <p className="text-center text-xs text-gray-400 mt-4">
          Genom att signera bekräftar du att arbetet är utfört enligt överenskommelse.
        </p>
      </div>
    </div>
  )
}
