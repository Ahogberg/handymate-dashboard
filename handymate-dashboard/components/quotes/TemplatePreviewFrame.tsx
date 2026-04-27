'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

export interface TemplatePreviewPayload {
  quote: Record<string, any>
  quote_items: any[]
  customer_id?: string | null
  deal_id?: string | null
  template_style?: 'modern' | 'premium' | 'friendly' | null
}

interface Props {
  payload: TemplatePreviewPayload
  /** Debounce-fördröjning i ms innan vi anropar preview-endpointen igen */
  debounceMs?: number
  /** Höjd på iframe (default: 100% av container) */
  className?: string
}

/**
 * Iframe-preview som anropar /api/quotes/preview-html och visar exakt
 * samma HTML som offerten kommer renderas med när den skickas.
 *
 * Debouncar payload-ändringar så vi inte hamrar endpointen vid varje knapptryck.
 * Behåller senaste genererade HTML medan ny laddas så previewn inte blinkar.
 */
export default function TemplatePreviewFrame({ payload, debounceMs = 600, className }: Props) {
  const [html, setHtml] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = setTimeout(async () => {
      // Avbryt eventuell pågående request
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/quotes/preview-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({} as any))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        const text = await res.text()
        setHtml(text)
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Kunde inte ladda förhandsgranskning')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [payload, debounceMs])

  // Skriv HTML in i iframe via srcDoc — säkrare än blob URL och inga CORS-bekymmer
  return (
    <div className={`relative bg-gray-50 rounded-xl overflow-hidden border border-[#E2E8F0] ${className || ''}`}>
      {loading && html === '' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      )}
      {error && html === '' && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <p className="text-xs text-red-600 text-center">{error}</p>
        </div>
      )}
      {html && (
        <iframe
          ref={iframeRef}
          srcDoc={html}
          className="w-full h-full bg-white"
          // sandbox utan allow-scripts — ren statisk rendering
          sandbox=""
          title="Offert-förhandsgranskning"
        />
      )}
      {/* Subtil indikator när ny render pågår men vi visar gammal */}
      {loading && html !== '' && (
        <div className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 shadow-sm">
          <Loader2 className="w-3.5 h-3.5 text-primary-700 animate-spin" />
        </div>
      )}
    </div>
  )
}
