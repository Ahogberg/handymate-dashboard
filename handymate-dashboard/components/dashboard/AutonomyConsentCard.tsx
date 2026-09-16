'use client'
import { useEffect, useState } from 'react'
export default function AutonomyConsentCard({
  businessId,
}: {
  businessId: string
}) {
  return <ConsentSession key={businessId} businessId={businessId} />
}
export function ConsentSession({ businessId }: { businessId: string }) {
  const [state, setState] = useState<
      'loading' | 'hidden' | 'ask' | 'saved' | 'error'
    >('loading'),
    [busy, setBusy] = useState(false),
    [answer, setAnswer] = useState<boolean | null>(null),
    [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    setState('loading')
    fetch('/api/autonomy/consent', { cache: 'no-store', signal: c.signal })
      .then(async (r) => {
        if ([401, 403, 404].includes(r.status)) {
          if (!c.signal.aborted) setState('hidden')
          return
        }
        if (!r.ok) throw Error()
        const d = await r.json()
        if (!c.signal.aborted) {
          setAnswer(d.consent?.answer ?? null)
          setState(d.consent ? 'hidden' : 'ask')
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setState('error')
      })
    return () => c.abort()
  }, [attempt])
  async function choose(value: boolean) {
    setBusy(true)
    try {
      const r = await fetch('/api/autonomy/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: value,
          expected_business_id: businessId,
        }),
      })
      if (!r.ok) throw Error()
      const d = await r.json()
      if (!d.changed) {
        setAttempt((x) => x + 1)
        return
      }
      setAnswer(value)
      setState('saved')
    } catch {
      setState('error')
    } finally {
      setBusy(false)
    }
  }
  if (state === 'hidden' || state === 'loading') return null
  return (
    <section
      className="rounded-2xl border border-teal-200 bg-white p-5 my-4"
      aria-label="Låt teamet hjälpa till"
    >
      <h2 className="font-semibold text-gray-900">
        Låt teamet sköta påminnelserna
      </h2>
      {state === 'error' ? (
        <>
          <p role="alert">Ditt val kunde inte kontrolleras eller sparas.</p>
          <button
            onClick={() => setAttempt((x) => x + 1)}
            className="min-h-[44px] underline"
          >
            Försök igen
          </button>
        </>
      ) : state === 'saved' ? (
        <p role="status">
          {answer
            ? 'Ditt godkännande är sparat. Du ser varje åtgärd i morgonkvittot och kan stänga av direkt.'
            : 'Ditt nej är sparat. Inga nya automatiska utskick har aktiverats.'}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            Får Handymate skicka fakturapåminnelser, bokningspåminnelser,
            offertuppföljningar och recensionsförfrågningar åt dig?
          </p>
          <p className="mt-2 text-sm">
            Du ser varje utskick och eventuella problem i morgonkvittot.
            Befintliga beloppsgränser gäller och du kan stänga av med ett tryck.
          </p>
          <div className="flex gap-3 mt-3">
            <button
              disabled={busy}
              onClick={() => choose(true)}
              className="min-h-[44px] rounded-lg bg-teal-700 text-white px-4"
            >
              Ja, sköt dessa åt mig
            </button>
            <button
              disabled={busy}
              onClick={() => choose(false)}
              className="min-h-[44px] underline"
            >
              Nej, aktivera inget nytt
            </button>
          </div>
        </>
      )}
    </section>
  )
}
