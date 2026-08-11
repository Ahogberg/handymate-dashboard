'use client'

import { useEffect, useState } from 'react'

/**
 * Förtroendetrappan — per åtgärdstyp: Gatad (streak X/15) → Autonom, med
 * "ta tillbaka ratten". All svensk copy, inga tekniska termer (CLAUDE.md).
 */

interface AutonomyItem {
  key: string
  label: string
  agent: string
  status: 'autonomous' | 'gated'
  streak: number
  target: number
  handled_60d?: { approved: number; edited: number; failed: number }
  cap_kr?: number | null
}

/** "37 hanterade senaste 60 dagarna — 36 oförändrade, 1 justerad, 0 misslyckade". */
function handledText(h?: { approved: number; edited: number; failed: number }): string | null {
  if (!h) return null
  const total = h.approved + h.edited + h.failed
  if (total === 0) return null
  const oforandrade = h.approved === 1 ? 'oförändrad' : 'oförändrade'
  const justerad = h.edited === 1 ? 'justerad' : 'justerade'
  const misslyckade = h.failed === 1 ? 'misslyckad' : 'misslyckade'
  return `${total} hanterade senaste 60 dagarna — ${h.approved} ${oforandrade}, ${h.edited} ${justerad}, ${h.failed} ${misslyckade}`
}

/** "Över 25 000 kr frågar Karin alltid först." */
function capText(agent: string, capKr?: number | null): string | null {
  if (capKr == null) return null
  return `Över ${capKr.toLocaleString('sv-SE')} kr frågar ${agent} alltid först.`
}

export default function EarnedAutonomyPanel() {
  const [items, setItems] = useState<AutonomyItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = () =>
    fetch('/api/autonomy')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setItems(d?.items || []))
      .catch(() => {})

  useEffect(() => {
    let active = true
    fetch('/api/autonomy')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active) setItems(d?.items || []) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  async function revoke(key: string) {
    if (!confirm('Ta tillbaka ratten? Åtgärderna kräver ditt godkännande igen.')) return
    setBusy(key)
    try {
      await fetch('/api/autonomy/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      await load()
    } catch { /* nätverksfel — state förblir sanningen från servern vid nästa load */ }
    finally { setBusy(null) }
  }

  if (items.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900 mb-1">Förtroendetrappan</h3>
      <p className="text-xs text-gray-400 mb-4">
        Teamet förtjänar rätten att agera själv — i takt med att du godkänner. Du kan alltid ta tillbaka ratten.
      </p>
      <div className="space-y-3">
        {items.map(it => {
          const evidence = handledText(it.handled_60d)
          const cap = capText(it.agent, it.cap_kr)
          return (
            <div key={it.key} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 capitalize">{it.label}</p>
                  <p className="text-xs text-gray-400">{it.agent}</p>
                </div>
                {it.status === 'autonomous' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Sköts självständigt</span>
                    <button
                      onClick={() => revoke(it.key)}
                      disabled={busy === it.key}
                      className="text-xs text-gray-400 hover:text-red-600 underline disabled:opacity-50"
                    >
                      Ta tillbaka
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full">
                    {it.streak}/{it.target} godkända i rad
                  </span>
                )}
              </div>
              {evidence && <p className="text-xs text-gray-400">{evidence}</p>}
              {cap && <p className="text-xs text-gray-400">{cap}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
