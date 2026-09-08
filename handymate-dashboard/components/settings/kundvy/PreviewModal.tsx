'use client'

/**
 * Stor vy av en kontaktpunkt. Mail renderas i en iframe (srcdoc = exakt
 * HTML:en sändvägen bygger), SMS som bubbla, sidorna som React-mockuper.
 * Mobil/Desktop-växlaren byter ram; bläddra med pilarna eller tangentbordet.
 */
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Send } from 'lucide-react'
import { KUNDVY_TOUCHPOINTS, type KundvyPreview, type TouchpointId } from '@/lib/branding/kundvy'
import { PageMock, SmsBubble, type MockBrand } from './mocks'

export interface PreviewModalProps {
  id: TouchpointId
  brand: MockBrand
  preview: KundvyPreview | undefined
  previewLoading: boolean
  sendingTest: boolean
  onNavigate: (id: TouchpointId) => void
  onSendTest: (id: TouchpointId) => void
  onClose: () => void
}

type Device = 'mobil' | 'desktop'

/** Telefonramen: 300 px yttre, 8 px kant → 284 px innehåll. Mailet renderas i iPhone-bredd och skalas. */
const PHONE_INNER_WIDTH = 284
const PHONE_MAIL_WIDTH = 375
const PHONE_MAIL_SCALE = PHONE_INNER_WIDTH / PHONE_MAIL_WIDTH

export default function PreviewModal({ id, brand, preview, previewLoading, sendingTest, onNavigate, onSendTest, onClose }: PreviewModalProps) {
  const index = KUNDVY_TOUCHPOINTS.findIndex((t) => t.id === id)
  const punkt = KUNDVY_TOUCHPOINTS[index]
  const prev = KUNDVY_TOUCHPOINTS[index - 1]
  const next = KUNDVY_TOUCHPOINTS[index + 1]
  const [device, setDevice] = useState<Device>('mobil')
  const canSwitch = punkt.kind === 'email'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && prev) onNavigate(prev.id)
      else if (e.key === 'ArrowRight' && next) onNavigate(next.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onClose, onNavigate])

  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [])

  const mobile = device === 'mobil' || !canSwitch

  function renderBody() {
    if (punkt.kind === 'email') {
      if (previewLoading || !preview?.html) {
        return <div className="flex-1 flex items-center justify-center text-[13px] text-slate-500">Bygger mailet…</div>
      }
      return (
        <div className="flex flex-col h-full">
          <div className="px-3 py-2 border-b border-slate-200 bg-white text-[12px] text-slate-600 truncate">
            <span className="text-slate-400">Ämne:</span> <span className="text-slate-900 font-medium">{preview.subject}</span>
          </div>
          {mobile ? (
            // Telefonramen är smalare än en riktig mobil (284 px). Rendera
            // mailet i riktig mobilbredd (375 px) och skala ner — annars ser
            // ägaren en avklippt vy som ingen kund får.
            <div className="flex-1 relative overflow-hidden">
              <iframe
                title={punkt.titel}
                srcDoc={preview.html}
                sandbox=""
                className="absolute top-0 left-0 bg-white border-0"
                style={{ width: PHONE_MAIL_WIDTH, height: `${100 / PHONE_MAIL_SCALE}%`, transform: `scale(${PHONE_MAIL_SCALE})`, transformOrigin: 'top left' }}
              />
            </div>
          ) : (
            <iframe
              title={punkt.titel}
              srcDoc={preview.html}
              sandbox=""
              className="flex-1 w-full bg-white border-0"
            />
          )}
        </div>
      )
    }
    if (punkt.kind === 'sms') {
      if (previewLoading || !preview?.sms) {
        return <div className="flex-1 flex items-center justify-center text-[13px] text-slate-500">Hämtar SMS:et…</div>
      }
      return (
        <div className="bg-white h-full">
          <SmsBubble sender={preview.sender} text={preview.sms} />
        </div>
      )
    }
    return <PageMock id={id as 'offertsida' | 'portal' | 'jobbpass'} brand={brand} />
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center"
      style={{ background: 'rgba(15,23,42,.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${punkt.nr} · ${punkt.titel}`}
    >
      <div
        className="bg-white w-full sm:w-[760px] sm:max-w-[calc(100vw-32px)] h-full sm:h-auto sm:max-h-[calc(100vh-32px)] sm:rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidhuvud */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-slate-900 truncate">{punkt.nr} · {punkt.titel}</div>
            <div className="text-[12px] text-slate-500 truncate">{punkt.modalSub}</div>
          </div>
          {canSwitch && (
            <div className="hidden sm:flex rounded-lg border border-slate-200 p-0.5 text-[12px] font-medium">
              {(['mobil', 'desktop'] as Device[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={`px-2.5 py-1 rounded-md ${device === d ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {d === 'mobil' ? 'Mobil' : 'Desktop'}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="Stäng" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Kropp */}
        <div className="flex-1 min-h-0 bg-slate-100 overflow-auto flex items-start justify-center p-4 sm:p-6">
          {mobile ? (
            <div className="w-[300px] h-[640px] max-h-full shrink-0 rounded-[40px] overflow-hidden border-[8px] border-[#0f172a] bg-white flex flex-col">
              {renderBody()}
            </div>
          ) : (
            <div className="w-full max-w-[640px] h-[560px] shrink-0 rounded-xl overflow-hidden border border-slate-300 bg-white flex flex-col">
              {renderBody()}
            </div>
          )}
        </div>

        {/* Sidfot */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-200">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && onNavigate(prev.id)}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-slate-300 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> {prev ? prev.titel : 'Första'}
          </button>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && onNavigate(next.id)}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-slate-300 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {next ? next.titel : 'Sista'} <ChevronRight className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          {punkt.kind === 'email' && (
            <button
              type="button"
              disabled={sendingTest}
              onClick={() => onSendTest(id)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-teal-700 text-white text-[13px] font-medium hover:bg-teal-800 disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingTest ? 'Skickar…' : 'Skicka det här mailet till mig'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
