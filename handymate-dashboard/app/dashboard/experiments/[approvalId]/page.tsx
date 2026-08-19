'use client'

/**
 * OperatingExperiment Etapp 2 (2026-08-19) — beslutssidan för ett
 * redovisningskort ('operating_experiment_readout').
 *
 * Tre val ryms inte i godkännande-kön (bara godkänn/avvisa) — samma
 * avvägning som husets övriga flerval-kort (project_debrief öppnar en
 * modal, jobbpass_proposal länkar till en egen yta). Här: en egen,
 * fristående beslutssida (target_route i kortets payload, se
 * app/dashboard/approvals/page.tsx) i stället för trippelknappar i kön.
 *
 * "Fortsätt testa"/"Gör till standard" postar edited_payload.decision via
 * action:'edit' — samma idiom som project_debrief:s edited_payload.answers
 * (app/api/approvals/[id]/route.ts, case 'operating_experiment_readout').
 * "Avvisa" använder den vanliga reject-vägen (owner_decision='rejected'
 * skrivs av ett reject-side-effect-block i samma rutt).
 *
 * Bara RÄKNADE fakta visas — inga värdeord, ingen kausalitet (se
 * lib/experiment/types.ts filhuvud).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FlaskConical, ArrowLeft, CheckCircle2, XCircle, Repeat } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface MeasuredValue {
  project_id: string
  value: number
}
interface UnassessableProject {
  project_id: string
  reasons: string[]
}
interface MeasureResult {
  measure: string
  values: MeasuredValue[]
  ej_bedombar: UnassessableProject[]
}
interface ExperimentMeasurement {
  projects_enrolled: number
  projects_completed: number
  projects_with_sufficient_data: number
  measures: MeasureResult[]
  verdict: 'for_tidigt' | 'underlag_finns'
}

interface ReadoutPayload {
  experiment_id: string
  job_type: string
  hypothesis: string
  source_pattern_id: string | null
  verdict: 'for_tidigt' | 'underlag_finns'
  measurement: ExperimentMeasurement
}

interface ApprovalRow {
  id: string
  approval_type: string
  title: string
  description: string | null
  status: string
  payload: ReadoutPayload
}

const MEASURE_LABELS: Record<string, string> = {
  sena_andringar: 'Sena ändringar',
  marginal: 'Marginal',
  extra_timmar: 'Extra timmar',
  faktureringstid: 'Faktureringstid',
  forseningar: 'Förseningar',
  materialavvikelser: 'Materialavvikelser',
}

export default function ExperimentReadoutPage({ params }: { params: { approvalId: string } }) {
  const router = useRouter()
  const [approval, setApproval] = useState<ApprovalRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [actionLoading, setActionLoading] = useState<'continue_testing' | 'made_standard' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultText, setResultText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/approvals/${params.approvalId}`, {
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      })
      if (cancelled) return
      if (!res.ok) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const result = await res.json().catch(() => null)
      setApproval(result?.approval || null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [params.approvalId])

  async function act(action: 'edit' | 'reject', decision?: 'continue_testing' | 'made_standard') {
    if (!approval) return
    setActionLoading(decision || 'reject')
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(
          action === 'edit'
            ? { action: 'edit', edited_payload: { decision } }
            : { action: 'reject' },
        ),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok || result?.execution?.ok === false) {
        setError(result?.execution?.error || result?.error || 'Något gick fel — försök igen om en stund')
        setActionLoading(null)
        return
      }
      setResultText(
        decision === 'made_standard'
          ? 'Sparat som en bekräftad regel.'
          : decision === 'continue_testing'
            ? 'Ett nytt förslag skapas — det dyker upp i kön.'
            : 'Försöket avvisades.',
      )
      setTimeout(() => router.push('/dashboard/approvals'), 1500)
    } catch (err) {
      setError('Något gick fel — försök igen om en stund')
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-slate-500">Laddar…</p>
      </div>
    )
  }

  if (notFound || !approval || approval.approval_type !== 'operating_experiment_readout') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-slate-600">Kunde inte hitta det här försöksresultatet.</p>
        <Link href="/dashboard/approvals" className="text-primary-700 hover:underline text-sm mt-2 inline-block">
          Tillbaka till kön
        </Link>
      </div>
    )
  }

  const pl = approval.payload
  const m = pl.measurement
  const alreadyResolved = approval.status !== 'pending'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
      <Link href="/dashboard/approvals" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Tillbaka till kön
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
          <FlaskConical className="w-5 h-5 text-primary-700" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Försöket är klart att redovisas</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">{pl.job_type}</p>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Hypotesen som testades</p>
        <p className="text-sm text-slate-800">&quot;{pl.hypothesis}&quot;</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Räknade fakta</p>
        <p className="text-sm text-slate-800">
          {m.projects_enrolled} projekt inskrivna, {m.projects_completed} avslutade,{' '}
          {m.projects_with_sufficient_data} med tillräckligt underlag.
        </p>
        {m.verdict === 'for_tidigt' && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            För tidigt att säga något ännu — för få projekt har tillräckligt underlag.
          </p>
        )}
        <div className="divide-y divide-slate-100">
          {m.measures.map(measure => (
            <div key={measure.measure} className="py-2">
              <p className="text-sm font-medium text-slate-700">{MEASURE_LABELS[measure.measure] || measure.measure}</p>
              <p className="text-xs text-slate-500">
                {measure.values.length} mätta värden, {measure.ej_bedombar.length} ej bedömbara
              </p>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
      )}
      {resultText && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2 mb-4">{resultText}</div>
      )}

      {alreadyResolved && !resultText && (
        <p className="text-sm text-slate-500 mb-4">Det här försöket har redan avgjorts.</p>
      )}

      {!alreadyResolved && !resultText && (
        <div className="space-y-2">
          <button
            onClick={() => act('edit', 'continue_testing')}
            disabled={actionLoading !== null}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-sm font-medium rounded-lg transition-all"
          >
            <Repeat className="w-4 h-4" />
            {actionLoading === 'continue_testing' ? 'Skapar nytt förslag…' : 'Fortsätt testa'}
          </button>
          <button
            onClick={() => act('edit', 'made_standard')}
            disabled={actionLoading !== null}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            {actionLoading === 'made_standard' ? 'Sparar…' : 'Gör till standard'}
          </button>
          <button
            onClick={() => act('reject')}
            disabled={actionLoading !== null}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 text-slate-700 text-sm font-medium rounded-lg transition-all"
          >
            <XCircle className="w-4 h-4" />
            {actionLoading === 'reject' ? 'Avvisar…' : 'Avvisa'}
          </button>
        </div>
      )}
    </div>
  )
}
