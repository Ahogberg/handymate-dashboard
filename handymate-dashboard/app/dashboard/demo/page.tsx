'use client'

import { useState } from 'react'
import { RefreshCcw, Loader2, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'

/**
 * /dashboard/demo — Demoläge.
 *
 * Nås via direkt-URL, ligger medvetet INTE i Sidebar/NavItem. Behöver inte
 * gömmas för icke-demokonton eftersom API:t (/api/admin/demo-reset) ändå
 * vägrar köra för alla utom det konto som matchar DEMO_BUSINESS_ID.
 */
export default function DemoPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; isForbidden?: boolean } | null>(null)

  async function handleReset() {
    setLoading(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/demo-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      })
      const json = await res.json().catch(() => null)

      if (res.status === 403) {
        setResult({ ok: false, isForbidden: true, text: json?.error || 'Det här är inte demokontot.' })
        return
      }
      if (!res.ok || !json?.success) {
        setResult({ ok: false, text: json?.error || 'Kunde inte återställa demon — försök igen.' })
        return
      }

      const totalArenden = (json.approvals || 0)
      setResult({
        ok: true,
        text: `Demon är återställd — ${json.customers} kunder, ${totalArenden} ärenden i kön.`,
      })
    } catch {
      setResult({ ok: false, text: 'Kunde inte återställa demon — försök igen.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Demoläge</h1>
      <p className="text-sm text-gray-500 leading-relaxed mb-6">
        Återställer demokontot med färsk exempeldata. Alla ändringar från tidigare
        demos raderas.
      </p>

      <button
        onClick={handleReset}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 h-12 px-5 bg-primary-700 hover:bg-primary-800 disabled:opacity-60 text-white text-[15px] font-semibold rounded-xl transition-colors"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCcw className="w-4 h-4" />
        )}
        {loading ? 'Återställer demon…' : 'Återställ demon'}
      </button>

      {result && (
        <div
          className={`mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium ${
            result.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : result.isForbidden
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : result.isForbidden ? (
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          )}
          <span>{result.text}</span>
        </div>
      )}
    </div>
  )
}
