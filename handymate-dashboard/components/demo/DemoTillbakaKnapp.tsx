'use client'

import { useEffect, useState } from 'react'
import { Loader2, Undo2 } from 'lucide-react'

/**
 * "Tillbaka till demon" — utgången ur onboardingen på demokontot.
 *
 * Bakgrund (2026-09-10, Andreas): "Visa onboardingen" i PresenterBar tar dig
 * TILL guiden, men PresenterBar renderas bara i dashboardens layout — så fort
 * du landat på /onboarding är knappen borta, och dashboardgrinden skickar dig
 * tillbaka hit varje gång du försöker gå in. Enda vägen ut var att klicka
 * igenom hela guiden. Se app/api/admin/demo-onboarding-exit/route.ts.
 *
 * Servern avgör om knappen ska visas. Klienten KAN inte avgöra det:
 * onboardingsidan ligger utanför BusinessProvider/CurrentUserProvider. Samma
 * hållning som pushstatusen samma dag — vet vi inte, visar vi ingenting,
 * hellre än att gissa fram en knapp för en riktig kund.
 */
export function DemoTillbakaKnapp() {
  const [visa, setVisa] = useState(false)
  const [arbetar, setArbetar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)

  useEffect(() => {
    let avbruten = false
    fetch('/api/admin/demo-onboarding-exit')
      .then(res => (res.ok ? res.json() : { visa: false }))
      .then(data => { if (!avbruten) setVisa(data?.visa === true) })
      .catch(() => { /* tyst: ingen knapp är rätt utfall vid fel */ })
    return () => { avbruten = true }
  }, [])

  if (!visa) return null

  async function tillbaka() {
    setArbetar(true)
    setFel(null)
    try {
      const res = await fetch('/api/admin/demo-onboarding-exit', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || 'okänt fel')
      // Hel omladdning, inte router.push: dashboardgrinden läser business i
      // sin egen provider, och en mjuk navigering kan hinna se det gamla
      // onboardingläget och skicka tillbaka hit igen.
      window.location.assign('/dashboard')
    } catch (err) {
      setFel(err instanceof Error ? err.message : 'Kunde inte gå tillbaka. Försök igen.')
      setArbetar(false)
    }
  }

  return (
    <div className="ob-demo-tillbaka">
      <button type="button" onClick={tillbaka} disabled={arbetar} className="ob-exit-link">
        {arbetar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
        <span>Tillbaka till demon</span>
      </button>
      {fel && <p className="ob-demo-tillbaka-fel">{fel}</p>}
    </div>
  )
}
