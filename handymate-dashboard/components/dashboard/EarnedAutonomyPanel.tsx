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
}

export default function EarnedAutonomyPanel() {
  const [items, setItems] = useState<AutonomyItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    fetch('/api/autonomy')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setItems(d?.items || []))
      .catch(() => {})
  }
  useEffect(load, [])

  async function revoke(key: string) {
    if (!confirm('Ta tillbaka ratten? Åtgärderna kräver ditt godkännande igen.')) return
    setBusy(key)
    try {
      await fetch('/api/autonomy/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      load()
    } finally { setBusy(null) }
  }

  if (items.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900 mb-1">Självständighet</h3>
      <p className="text-xs text-gray-400 mb-4">
        Teamet förtjänar rätten att agera själv — i takt med att du godkänner. Du kan alltid ta tillbaka ratten.
      </p>
      <div className="space-y-3">
        {items.map(it => (
          <div key={it.key} className="flex items-center justify-between gap-3">
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
        ))}
      </div>
    </div>
  )
}
