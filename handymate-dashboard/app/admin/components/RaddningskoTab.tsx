'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, LifeBuoy, ShieldCheck } from 'lucide-react'

interface Arende {
  id: string
  business_id: string
  signal: string
  severity: 'hog' | 'medel' | 'lag'
  status: 'oppet' | 'pagaende'
  summary: string
  evidence: Record<string, unknown>
  first_seen_at: string
  last_seen_at: string
  owner: string | null
  atgard: string | null
  business_config?: { business_name?: string } | null
}

interface Bevis {
  key: string
  label: string
  status: 'pass' | 'blocked' | 'manual'
  detail: string
  evidence?: string
  evidence_url?: string | null
  proven_at?: string
  proven_by?: string
}

// Svenska etiketter för signalerna — måste hållas i synk med
// SIGNAL_LABELS i lib/raddning/signaler.ts.
const SIGNAL_LABELS: Record<string, string> = {
  onboarding_stannat: 'Onboarding stannade',
  ingen_verifierad_kanal: 'Ingen verifierad kanal',
  ingen_aktivering: 'Ingen aktivering',
  ingen_offert: 'Ingen offert',
  inget_uppdrag: 'Inget uppdrag',
  integration_bruten: 'Integration bruten',
  misslyckad_handling: 'Misslyckad handling',
  fastnat_kort: 'Fastnat kort',
  falsk_framgang: 'Falsk framgång',
  manuell_fix_kravdes: 'Manuell fix krävdes',
}

const SEVERITY_STYLE: Record<string, string> = {
  hog: 'bg-red-50 text-red-700 border-red-200',
  medel: 'bg-amber-50 text-amber-700 border-amber-200',
  lag: 'bg-gray-100 text-gray-600 border-gray-200',
}

const SEVERITY_LABEL: Record<string, string> = { hog: 'Hög', medel: 'Medel', lag: 'Låg' }

function sv(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE')
}

export default function RaddningskoTab() {
  const [arenden, setArenden] = useState<Arende[]>([])
  const [bevis, setBevis] = useState<Bevis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [losText, setLosText] = useState<Record<string, string>>({})
  const [fixBusinessId, setFixBusinessId] = useState('')
  const [fixSummary, setFixSummary] = useState('')
  const [fixBusy, setFixBusy] = useState(false)
  const [bevisForm, setBevisForm] = useState<{ station: string; evidence: string; evidence_url: string; business_id: string }>({
    station: '',
    evidence: '',
    evidence_url: '',
    business_id: '',
  })
  const [bevisBusy, setBevisBusy] = useState(false)

  async function load() {
    try {
      const [arendenRes, readinessRes] = await Promise.all([
        fetch('/api/admin/raddningsko'),
        fetch('/api/admin/launch-readiness'),
      ])
      if (!arendenRes.ok) throw new Error()
      const arendenData = await arendenRes.json()
      setArenden(arendenData.arenden || [])
      if (readinessRes.ok) {
        const readinessData = await readinessRes.json()
        setBevis(readinessData.manual_proofs || [])
      }
      setError(null)
    } catch {
      setError('Kunde inte hämta räddningskön — försök igen.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function agera(id: string, action: 'ta' | 'los' | 'avfarda') {
    if (action === 'los' && !(losText[id] || '').trim()) return
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/raddningsko/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, atgard: losText[id] }),
      })
      if (res.ok) await load()
    } finally {
      setBusy(null)
    }
  }

  async function bokforManuellFix(e: React.FormEvent) {
    e.preventDefault()
    if (!fixBusinessId.trim() || !fixSummary.trim()) return
    setFixBusy(true)
    try {
      const res = await fetch('/api/admin/raddningsko/manuell-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: fixBusinessId.trim(), summary: fixSummary.trim() }),
      })
      if (res.ok) {
        setFixBusinessId('')
        setFixSummary('')
        await load()
      }
    } finally {
      setFixBusy(false)
    }
  }

  async function bokforBevis(e: React.FormEvent) {
    e.preventDefault()
    if (!bevisForm.station || !bevisForm.evidence.trim()) return
    setBevisBusy(true)
    try {
      const res = await fetch('/api/admin/launch-readiness/bevis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station: bevisForm.station,
          evidence: bevisForm.evidence.trim(),
          evidence_url: bevisForm.evidence_url.trim() || undefined,
          business_id: bevisForm.business_id.trim() || undefined,
        }),
      })
      if (res.ok) {
        setBevisForm({ station: '', evidence: '', evidence_url: '', business_id: '' })
        await load()
      }
    } finally {
      setBevisBusy(false)
    }
  }

  if (loading) return <div className="text-gray-400 text-sm">Laddar...</div>

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
  }

  return (
    <div className="space-y-8">
      {/* RÄDDNINGSKÖN */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <LifeBuoy className="w-4 h-4 text-primary-700" /> Öppna ärenden ({arenden.length})
        </h3>
        {arenden.length === 0 && <div className="text-gray-400 text-sm">Inga öppna ärenden — rent.</div>}
        {arenden.map((a) => (
          <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="font-semibold text-gray-900 text-sm">{a.business_config?.business_name || a.business_id}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[a.severity] || ''}`}>
                    {SEVERITY_LABEL[a.severity] || a.severity}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                    {SIGNAL_LABELS[a.signal] || a.signal}
                  </span>
                  {a.status === 'pagaende' && (
                    <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full">Tagen</span>
                  )}
                </div>
                <div className="text-sm text-gray-700 mt-1">{a.summary}</div>
                <div className="text-xs text-gray-400 mt-1">
                  Sedd först {sv(a.first_seen_at)} · senast {sv(a.last_seen_at)}
                  {a.owner ? ` · ägare ${a.owner}` : ''}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-50">
              {a.status !== 'pagaende' && (
                <button
                  onClick={() => agera(a.id, 'ta')}
                  disabled={busy === a.id}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-primary-700 rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  Tar det
                </button>
              )}
              <input
                type="text"
                value={losText[a.id] || ''}
                onChange={(e) => setLosText((prev) => ({ ...prev, [a.id]: e.target.value }))}
                placeholder="Vad gjorde du?"
                className="flex-1 min-w-[160px] px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
              />
              <button
                onClick={() => agera(a.id, 'los')}
                disabled={busy === a.id || !(losText[a.id] || '').trim()}
                className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                Löst
              </button>
              <button
                onClick={() => agera(a.id, 'avfarda')}
                disabled={busy === a.id}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Avfärda
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* BOKFÖR MANUELL FIX */}
      <form onSubmit={bokforManuellFix} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Bokför manuell fix</h3>
        <p className="text-xs text-gray-500">
          Inga manuella databasfixar under provet — behövs en ändå, bokförs den här (signal manuell_fix_kravdes).
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={fixBusinessId}
            onChange={(e) => setFixBusinessId(e.target.value)}
            placeholder="business_id"
            className="sm:w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg"
          />
          <input
            type="text"
            value={fixSummary}
            onChange={(e) => setFixSummary(e.target.value)}
            placeholder="Vad krävdes?"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
          />
          <button
            type="submit"
            disabled={fixBusy || !fixBusinessId.trim() || !fixSummary.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-700 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            Bokför
          </button>
        </div>
      </form>

      {/* LANSERINGSBEVIS (GRIND B) */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary-700" /> Lanseringsbevis (Grind B)
        </h3>
        <div className="space-y-2">
          {bevis.map((b) => (
            <div key={b.key} className="bg-white rounded-xl border border-gray-100 p-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    b.status === 'pass' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                  }`}>
                    {b.status === 'pass' ? 'Bevisat' : 'Manuellt'}
                  </span>
                  <span className="font-medium text-gray-900 text-sm">{b.label}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{b.detail}</div>
                {b.proven_by && b.proven_at && (
                  <div className="text-xs text-gray-400 mt-1">{b.proven_by} · {sv(b.proven_at)}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={bokforBevis} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 mt-2">
          <h4 className="text-sm font-semibold text-gray-700">Bokför ett bevis</h4>
          <div className="flex flex-col gap-2">
            <select
              value={bevisForm.station}
              onChange={(e) => setBevisForm((prev) => ({ ...prev, station: e.target.value }))}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
            >
              <option value="">Välj station…</option>
              {bevis.map((b) => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={bevisForm.evidence}
              onChange={(e) => setBevisForm((prev) => ({ ...prev, evidence: e.target.value }))}
              placeholder="Beskriv beviset (event-id, kvitto, vad som hände)"
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={bevisForm.evidence_url}
                onChange={(e) => setBevisForm((prev) => ({ ...prev, evidence_url: e.target.value }))}
                placeholder="Länk (valfritt)"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
              <input
                type="text"
                value={bevisForm.business_id}
                onChange={(e) => setBevisForm((prev) => ({ ...prev, business_id: e.target.value }))}
                placeholder="business_id (valfritt)"
                className="sm:w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg"
              />
              <button
                type="submit"
                disabled={bevisBusy || !bevisForm.station || !bevisForm.evidence.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-700 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                Bokför
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
