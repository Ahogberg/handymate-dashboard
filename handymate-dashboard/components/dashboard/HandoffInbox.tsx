'use client'
import { useEffect, useState } from 'react'
import { autonomyDigest } from '@/lib/notifications/autonomy-digest'
import { AUTONOMY_META, type AutonomyKey } from '@/lib/autonomy/earned-autonomy'
export default function HandoffInbox({ businessId }: { businessId: string }) {
  return <Inbox key={businessId} businessId={businessId} />
}
function Inbox({ businessId }: { businessId: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(false),
    [hidden, setHidden] = useState(false),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [stopped, setStopped] = useState<string[]>([])
  useEffect(() => {
    const c = new AbortController()
    setData(null)
    setError(false)
    ;(async () => {
      let after: string | null = null
      const notices: any[] = []
      let last: any
      do {
        const r = await fetch(
          '/api/handoff' + (after ? '?after=' + encodeURIComponent(after) : ''),
          { cache: 'no-store', signal: c.signal },
        )
        if ([401, 403, 404].includes(r.status)) {
          if (!c.signal.aborted) setHidden(true)
          return
        }
        if (!r.ok) throw Error()
        last = await r.json()
        notices.push(...last.notices)
        after = last.next
      } while (after)
      if (!c.signal.aborted) setData({ ...last, notices })
    })().catch(() => {
      if (!c.signal.aborted) setError(true)
    })
    return () => c.abort()
  }, [attempt])
  async function off(key: string) {
    setBusy(key)
    try {
      const r = await fetch('/api/autonomy/off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          expected_business_id: businessId,
          token: data?.off_tokens?.[key],
        }),
      })
      if (!r.ok) throw Error()
      setStopped((x) => [...x, key])
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }
  if (hidden) return null
  if (error)
    return (
      <div role="alert">
        Inkorgen eller avstängningen kunde inte uppdateras.{' '}
        <button
          className="min-h-[44px] underline"
          onClick={() => setAttempt((x) => x + 1)}
        >
          Försök igen
        </button>
      </div>
    )
  if (!data) return <p role="status">Hämtar inkorgen…</p>
  const old: Record<string, any[]> = {},
    recent: any[] = []
  for (const n of [...data.notices].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )) {
    if (Date.now() - Date.parse(n.created_at) > 30 * 86400000) {
      const m = new Intl.DateTimeFormat('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        timeZone: 'Europe/Stockholm',
      }).format(new Date(n.created_at))
      ;(old[m] ??= []).push(n)
    } else recent.push(n)
  }
  return (
    <div className="space-y-4">
      {(data.digests || []).map((d: any) => (
        <section key={d.day} className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">Morgonkvitto {d.day}</h2>
          <p className="text-xs text-gray-500">
            {d.status === 'delivered'
              ? 'Aviseringen accepterades av notistjänsten.'
              : d.status === 'failed'
                ? 'Aviseringen kunde inte levereras. Kvittot finns här.'
                : 'Aviseringens leverans är inte bekräftad. Kvittot finns här.'}
          </p>
          {(d.snapshot.decisions || []).map((a: any) => (
            <p key={a.id}>
              <a
                className="underline min-h-[44px] inline-block py-2"
                href={
                  '/dashboard/approvals#approval-' + encodeURIComponent(a.id)
                }
              >
                {a.title} — granska beslut
              </a>
            </p>
          ))}
          {d.snapshot.remaining > 0 && (
            <p>{d.snapshot.remaining} ytterligare beslut väntar i kön.</p>
          )}
          {d.snapshot.items.filter((i: any) => i.kind === 'expired').length >
            0 && (
            <div>
              <p className="font-medium">
                {
                  d.snapshot.items.filter((i: any) => i.kind === 'expired')
                    .length
                }{' '}
                förslag fick inget svar
              </p>
              <ul>
                {d.snapshot.items
                  .filter((i: any) => i.kind === 'expired')
                  .map((i: any) => (
                    <li key={i.id}>{i.title}</li>
                  ))}
              </ul>
            </div>
          )}
          <ul>
            {autonomyDigest(d.snapshot.items).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {Array.from(
            new Set<string>(
              d.snapshot.items
                .filter((i: any) => i.kind === 'autonomy')
                .map((i: any) => i.autonomy_key),
            ),
          )
            .filter((k) => k in AUTONOMY_META)
            .map((k) => (
              <button
                key={k}
                disabled={busy === k || stopped.includes(k)}
                onClick={() => off(k)}
                className="min-h-[44px] mr-4 underline"
              >
                {stopped.includes(k)
                  ? 'Avstängt'
                  : `Stäng av ${AUTONOMY_META[k as AutonomyKey].label}`}
              </button>
            ))}
        </section>
      ))}
      {(data.channels || []).map((n: any) => (
        <p key={n.day + n.channel} className="rounded-lg bg-amber-50 p-3">
          {n.day}: {n.message}
        </p>
      ))}
      {recent.map((n) => (
        <article key={n.id} className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">{n.title}</h3>
          <p className="text-sm">{n.description}</p>
        </article>
      ))}
      {Object.entries(old)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, rows]) => (
          <details key={month} className="rounded-xl border bg-white p-4">
            <summary>
              Vi la det åt sidan · {month} · {rows.length} meddelanden
            </summary>
            {rows.map((n) => (
              <article key={n.id} className="mt-3">
                <h3 className="font-medium">{n.title}</h3>
                <p>{n.description}</p>
              </article>
            ))}
          </details>
        ))}
      {!data.notices.length &&
        !data.digests.length &&
        !data.channels.length && (
          <p>
            Inga meddelanden ännu. Här samlas teamets information och
            morgonkvitton.
          </p>
        )}
    </div>
  )
}
