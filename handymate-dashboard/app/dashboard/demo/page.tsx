'use client'

import { useEffect, useState } from 'react'
import { RefreshCcw, Loader2, CheckCircle2, AlertTriangle, ShieldAlert, Mic } from 'lucide-react'
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

  const [meetingLoading, setMeetingLoading] = useState(false)
  const [meetingResult, setMeetingResult] = useState<{ ok: boolean; text: string; isForbidden?: boolean } | null>(null)

  useEffect(() => {
    try {
      const notice = sessionStorage.getItem('hm_demo_reset_notice')
      if (!notice) return
      sessionStorage.removeItem('hm_demo_reset_notice')
      const parsed = JSON.parse(notice) as { text?: string }
      if (parsed.text) setResult({ ok: true, text: parsed.text })
    } catch {
      // Storage kan vara avstängt; resetten är ändå klar på servern.
    }
  }, [])

  function clearDemoClientState(successText: string) {
    try {
      localStorage.removeItem('hm_moments_seen')
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const key = localStorage.key(index)
        if (key?.startsWith('hm_demo_story')) localStorage.removeItem(key)
      }
      for (let index = sessionStorage.length - 1; index >= 0; index--) {
        const key = sessionStorage.key(index)
        if (key?.startsWith('hm_demo_story')) sessionStorage.removeItem(key)
      }
      sessionStorage.removeItem('matte-chat-auto-opened')
      sessionStorage.setItem('hm_demo_reset_notice', JSON.stringify({ text: successText }))
    } catch {
      // Full reload nedan nollställer ändå Jobbkompisens aktiva thread-state.
    }
  }

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
      const successText = `Demon är återställd — ${json.customers} kunder, ${totalArenden} ärenden i kön.`
      clearDemoClientState(successText)
      // Jobbkompisens threadId är avsiktligt komponentstate, inte storage.
      // En full reload efter att RPC:n raderat agent_threads garanterar därför
      // att nästa Matte-fråga börjar i en ny tråd.
      window.location.reload()
    } catch {
      setResult({ ok: false, text: 'Kunde inte återställa demon — försök igen.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSeedMeeting() {
    setMeetingLoading(true)
    setMeetingResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/demo-seed-meeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      })
      const json = await res.json().catch(() => null)

      if (res.status === 403) {
        setMeetingResult({ ok: false, isForbidden: true, text: json?.error || 'Det här är inte demokontot.' })
        return
      }
      if (!res.ok || !json?.success) {
        setMeetingResult({ ok: false, text: json?.error || 'Kunde inte skapa testmötet — försök igen.' })
        return
      }

      const kort = json.analysis?.cards_created
      const kortText = typeof kort === 'number' ? ` ${kort} kort skapades.` : ''
      setMeetingResult({ ok: true, text: `Testmötet är analyserat.${kortText}` })
    } catch {
      setMeetingResult({ ok: false, text: 'Kunde inte skapa testmötet — försök igen.' })
    } finally {
      setMeetingLoading(false)
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

      <h2 className="text-lg font-bold text-gray-900 mt-10 mb-2">Testmöte</h2>
      <p className="text-sm text-gray-500 leading-relaxed mb-6">
        Skapar ett påhittat mötestranskript på en seedad kund och kör det genom
        mötesanalysen — samma sak som händer efter ett riktigt fältbesök.
      </p>

      <button
        onClick={handleSeedMeeting}
        disabled={meetingLoading}
        className="w-full inline-flex items-center justify-center gap-2 h-12 px-5 bg-primary-700 hover:bg-primary-800 disabled:opacity-60 text-white text-[15px] font-semibold rounded-xl transition-colors"
      >
        {meetingLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
        {meetingLoading ? 'Skapar testmöte…' : 'Skapa testmöte'}
      </button>

      {meetingResult && (
        <div
          className={`mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium ${
            meetingResult.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : meetingResult.isForbidden
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {meetingResult.ok ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : meetingResult.isForbidden ? (
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          )}
          <span>{meetingResult.text}</span>
        </div>
      )}
    </div>
  )
}
