'use client'

// Kundens signeringssida för fältrapporten — omdesignad 2026-09-07 som
// syskon till offertsidan (app/quote/[token]/page.tsx). Kunden fattar ett
// lika tungt beslut här ("arbetet är utfört som vi kom överens om") och
// möttes tidigare av emoji-ikoner utan varumärke, direkt efter ett
// offertmail i firmans färg. Nu:
//  - hantverkarens logotyp, accentfärg och företagsfot ur brand-lagret
//    (svaret från /api/field-reports/public bär varumärket + stämpeln)
//  - godkännande = namn + kryss ("ersätter en signatur"), samma som offerten
//  - invändning kräver en beskrivning — hantverkaren ska kunna agera på den
//  - servern är sanningen: vi läser res.ok och visar felet, i stället för
//    att säga "Signerat!" på ett 400
//  - redan avgjord rapport (signerad/invändning) visar rapporten kvar, med
//    utfallet överst — länken fungerar i efterhand
// API:t (/api/field-reports/[id]/sign) är orört: token i body + rapport-id.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, CheckCircle, AlertTriangle, MessageSquare, Zap } from 'lucide-react'
import type { Attribution } from '@/lib/branding/attribution'
import AttributionStamp from '@/components/branding/AttributionStamp'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReportPhoto {
  id: string
  url: string
  caption: string | null
  type: string | null
}

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
  customer_note: string | null
  created_at: string
  photos: ReportPhoto[]
}

interface BusinessInfo {
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  org_number: string | null
  f_skatt: boolean
  logo_url: string | null
  accent_color: string
}

type PageState = 'loading' | 'error' | 'viewing' | 'signed' | 'rejected'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

const PHOTO_TYPE_LABELS: Record<string, string> = {
  before: 'Före',
  after: 'Efter',
  during: 'Under arbetet',
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SignReportPage() {
  const params = useParams()
  const token = params?.token as string

  const [state, setState] = useState<PageState>('loading')
  const [report, setReport] = useState<Report | null>(null)
  const [business, setBusiness] = useState<BusinessInfo | null>(null)
  const [attribution, setAttribution] = useState<Attribution | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [signerName, setSignerName] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [note, setNote] = useState('')
  const [showObjection, setShowObjection] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Vad kunden just gjorde på DEN HÄR sidvisningen — styr tacktexten.
  const [justDecided, setJustDecided] = useState(false)

  // ── Hämta rapporten ────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await fetch(`/api/field-reports/public?token=${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.report) {
          setErrorMessage(data?.error || 'Rapporten hittades inte')
          setState('error')
          return
        }
        setReport(data.report)
        setBusiness(data.business || null)
        setAttribution(data.attribution || null)
        if (data.report.status === 'signed') setState('signed')
        else if (data.report.status === 'rejected') setState('rejected')
        else setState('viewing')
      } catch {
        setErrorMessage('Kunde inte ladda rapporten. Försök igen senare.')
        setState('error')
      }
    }
    if (token) fetchReport()
  }, [token])

  // ── Godkänn / invänd ───────────────────────────────────────────────────────

  async function submit(action: 'sign' | 'reject') {
    if (!report || submitting) return
    setSubmitting(true)
    setErrorMessage('')
    try {
      const res = await fetch(`/api/field-reports/${report.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: report.signature_token,
          signed_by: signerName.trim() || null,
          customer_note: note.trim() || null,
          action,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMessage(data?.error || 'Något gick fel. Försök igen.')
        return
      }
      const now = new Date().toISOString()
      setReport((prev) =>
        prev
          ? {
              ...prev,
              status: action === 'sign' ? 'signed' : 'rejected',
              signed_at: action === 'sign' ? now : prev.signed_at,
              signed_by: signerName.trim() || (action === 'sign' ? 'Kund' : prev.signed_by),
              customer_note: note.trim() || null,
            }
          : prev
      )
      setJustDecided(true)
      setState(action === 'sign' ? 'signed' : 'rejected')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setErrorMessage('Något gick fel. Försök igen.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSign = !!(signerName.trim() && termsAccepted && !submitting)
  const canObject = !!(note.trim() && !submitting)
  const accent = business?.accent_color || '#0F766E'
  const contact = business?.contact_name || business?.name || 'Hantverkaren'

  // ── Render: laddar ─────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
          <p className="text-gray-500 text-sm">Laddar rapporten...</p>
        </div>
      </div>
    )
  }

  // ── Render: fel ────────────────────────────────────────────────────────────

  if (state === 'error' || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Rapporten kunde inte visas</h2>
          <p className="text-gray-500 text-sm">{errorMessage || 'Rapporten hittades inte'}</p>
        </div>
      </div>
    )
  }

  const photos = report.photos || []
  const firstName = (report.signed_by || signerName).trim().split(' ')[0]

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-8">
        {/* ── Sidhuvud: hantverkarens varumärke ── */}
        <div className="flex items-center gap-3.5 mb-6">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md overflow-hidden text-white font-bold text-xl flex-none"
            style={{ background: accent }}
          >
            {business?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logo_url}
                alt={business.name}
                className="w-full h-full object-contain bg-white"
                onError={(e) => {
                  const parent = e.currentTarget.parentElement
                  if (parent) parent.textContent = (business.name || 'H').charAt(0).toUpperCase()
                }}
              />
            ) : business?.name ? (
              <span>{business.name.charAt(0).toUpperCase()}</span>
            ) : (
              <Zap className="w-6 h-6 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">{business?.name || 'Fältrapport'}</h1>
            <p className="text-[13px] text-gray-500">
              Fältrapport{report.report_number ? ` ${report.report_number}` : ''} · {formatDate(report.created_at)}
            </p>
          </div>
        </div>

        {/* ── Utfallet: godkänd ── */}
        {state === 'signed' && (
          <div className="mb-6 bg-teal-950 text-white rounded-2xl p-6">
            <div className="w-10 h-10 rounded-full bg-teal-300/20 flex items-center justify-center text-teal-300">
              <CheckCircle className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mt-4 leading-snug">
              {justDecided
                ? `Tack${firstName ? ` ${firstName}` : ''}. Arbetet är godkänt.`
                : 'Arbetet är redan godkänt.'}
            </h2>
            <p className="text-sm text-white/70 mt-2 leading-relaxed">
              {report.signed_by && <>Godkänt av {report.signed_by}</>}
              {report.signed_at && (
                <>
                  {report.signed_by ? ', ' : 'Godkänt '}
                  {formatDate(report.signed_at)}
                </>
              )}
              {(report.signed_by || report.signed_at) && '.'}
            </p>
          </div>
        )}

        {/* ── Utfallet: invändning ── */}
        {state === 'rejected' && (
          <div className="mb-6 bg-white shadow-sm rounded-2xl border border-amber-200 p-6">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <MessageSquare className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 mt-4 leading-snug">
              {justDecided ? 'Tack — din invändning är skickad.' : 'Du har lämnat en invändning.'}
            </h2>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              {contact} har fått ditt meddelande och hör av sig.
            </p>
            {report.customer_note && (
              <blockquote className="mt-4 pl-3 border-l-2 border-amber-300 text-sm text-gray-700 whitespace-pre-line">
                {report.customer_note}
              </blockquote>
            )}
          </div>
        )}

        {/* ── Vad händer nu ── */}
        {state === 'signed' && (
          <div className="mb-6 bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
            <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase">Vad händer nu</p>
            <div className="flex flex-col gap-3.5 mt-3.5 text-sm leading-relaxed">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full flex-none flex items-center justify-center text-xs font-bold text-white" style={{ background: accent }}>1</span>
                <span className="text-gray-700">
                  <strong className="text-gray-900">{contact} får besked direkt</strong> om att du godkänt arbetet.
                </span>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full flex-none flex items-center justify-center text-xs font-bold text-white" style={{ background: accent }}>2</span>
                <span className="text-gray-700">
                  <strong className="text-gray-900">Rapporten finns kvar här.</strong> Länken fungerar även i efterhand.
                </span>
              </div>
              {(business?.phone || business?.email) && (
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full flex-none flex items-center justify-center text-xs font-bold text-white" style={{ background: accent }}>3</span>
                  <span className="text-gray-700">
                    <strong className="text-gray-900">Frågor?</strong> Hör av dig till{' '}
                    {business?.phone ? <a href={`tel:${business.phone}`} className="underline">{business.phone}</a> : business?.email}.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Rapporten ── */}
        <div className="mb-6 bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase">
              {state === 'viewing' ? 'Arbetet är utfört' : 'Utfört arbete'}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 mt-1.5 leading-snug">{report.title}</h2>
            <p className="text-sm text-gray-500 mt-1.5">
              Utfört av {contact}
              {business?.contact_name && business?.name ? `, ${business.name}` : ''}
            </p>
            {report.description && (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mt-4">{report.description}</p>
            )}
          </div>

          {report.work_performed && (
            <div className="p-6 border-b border-gray-100">
              <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase mb-2">Det här gjorde vi</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{report.work_performed}</p>
            </div>
          )}

          {report.materials_used && (
            <div className="p-6 border-b border-gray-100">
              <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase mb-2">Material</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{report.materials_used}</p>
            </div>
          )}

          {photos.length > 0 && (
            <div className="p-6 border-b border-gray-100">
              <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase mb-3">
                Foton från jobbet · {photos.length}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {photos.map((photo) => {
                  const typeLabel = photo.type ? PHOTO_TYPE_LABELS[photo.type] : undefined
                  return (
                    <a
                      key={photo.id}
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative block aspect-square rounded-xl overflow-hidden bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={photo.caption || typeLabel || 'Foto från jobbet'} className="w-full h-full object-cover" loading="lazy" />
                      {(photo.caption || typeLabel) && (
                        <span className="absolute left-2 bottom-2 max-w-[calc(100%-16px)] truncate px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-medium">
                          {photo.caption || typeLabel}
                        </span>
                      )}
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {report.customer_note && state === 'signed' && (
            <div className="p-6 border-b border-gray-100">
              <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase mb-2">Din kommentar</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{report.customer_note}</p>
            </div>
          )}

          <div className="p-6 bg-gray-50">
            <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase mb-2">Utförare</p>
            <p className="text-sm font-semibold text-gray-900">{business?.contact_name || business?.name || '—'}</p>
            {business?.contact_name && business?.name && <p className="text-sm text-gray-500">{business.name}</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
              {business?.org_number && <span>Org.nr {business.org_number}</span>}
              {business?.f_skatt && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-medium">
                  <CheckCircle className="w-3 h-3" /> Godkänd för F-skatt
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Godkänn arbetet — namn + kryss ── */}
        {state === 'viewing' && (
          <div id="signature-card" className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-4 scroll-mt-4">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Godkänn arbetet</h3>
            <p className="text-gray-400 text-xs mb-5">Skriv ditt namn och bekräfta — ingen signatur behövs.</p>

            <div className="mb-4">
              <label htmlFor="signer-name" className="block text-xs text-gray-500 mb-1.5">Ditt namn</label>
              <input
                id="signer-name"
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Förnamn Efternamn"
                autoComplete="name"
                maxLength={120}
                required
                className="w-full h-12 px-4 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/40 transition-all"
              />
            </div>

            <label className="flex items-start gap-3 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-gray-300"
                style={{ accentColor: accent }}
              />
              <span className="text-sm text-gray-600 leading-relaxed">
                Jag bekräftar att arbetet är utfört enligt överenskommelse. Det ersätter en signatur.
              </span>
            </label>

            {!showObjection && (
              <div className="mb-5">
                <label htmlFor="signer-note" className="block text-xs text-gray-500 mb-1.5">Kommentar (valfritt)</label>
                <textarea
                  id="signer-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Något du vill skicka med?"
                  rows={2}
                  maxLength={1000}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/40 transition-all"
                />
              </div>
            )}

            {errorMessage && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-sm mb-4">
                {errorMessage}
              </div>
            )}

            {!showObjection ? (
              <>
                <button
                  type="button"
                  onClick={() => submit('sign')}
                  disabled={!canSign}
                  className="w-full py-4 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: accent }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Godkänner...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Godkänn arbetet
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowObjection(true); setErrorMessage('') }}
                  disabled={submitting}
                  className="w-full mt-3 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Något stämmer inte? Lämna en invändning
                </button>
              </>
            ) : (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40">
                <p className="text-sm font-semibold text-gray-900">Vad stämmer inte?</p>
                <p className="text-xs text-gray-600 leading-relaxed mt-1">
                  Beskriv så konkret du kan — {contact} får meddelandet direkt och hör av sig.
                </p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="T.ex. listen i hallen är inte monterad"
                  rows={3}
                  maxLength={1000}
                  autoFocus
                  className="w-full mt-3 px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
                />
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => submit('reject')}
                    disabled={!canObject}
                    className="flex-1 py-3 rounded-xl font-semibold text-white bg-amber-600 hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    Skicka invändning
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowObjection(false)}
                    disabled={submitting}
                    className="py-3 px-4 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Företagsfoten — hantverkarens varumärke + stämpeln ── */}
        <div className="pt-6 border-t border-slate-200 text-center text-xs leading-relaxed text-slate-500">
          {business && (
            <p>
              <strong className="text-slate-700">{business.name}</strong>
              {business.org_number && <> · Org.nr {business.org_number}</>}
              {business.f_skatt && <> · Godkänd för F-skatt</>}
              {(business.phone || business.email) && (
                <>
                  <br />
                  {[business.phone, business.email].filter(Boolean).join(' · ')}
                </>
              )}
            </p>
          )}
          <AttributionStamp attribution={attribution} className="mt-3 text-center text-xs text-gray-400 pb-8" linkClassName="font-medium" />
        </div>
      </div>
    </div>
  )
}
