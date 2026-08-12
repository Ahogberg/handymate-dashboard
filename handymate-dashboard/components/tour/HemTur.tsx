'use client'

/**
 * Hemturen — landningen efter onboardingen (docs/design/FORSTA-30-MINUTERNA.md,
 * DEL 2 "Min 12–17"). Samma spotlight/placement-mekanik som Step6LiveTour
 * hade inbyggt (components/tour/TourPrimitives.tsx), men över RIKTIGA
 * DOM-noder på JarvisHome i stället för en mockad förhandsvisning.
 *
 * FEM STOPP, markerade med data-tour-target på befintliga sektioner i
 * components/jarvis/JarvisHome.tsx (och tourTarget-proppen på SkrivRad/
 * RailCard) — inga sektioner byggs om, bara märks upp. Stopp vars sektion
 * inte renderas för kontot (t.ex. "Pengar just nu" utan ägarbehörighet, eller
 * "Möte idag?" om kortet skulle flyttas) hoppas över automatiskt — turen får
 * ALDRIG spotlighta tomhet.
 *
 * GATE: `business_config.welcome_tour_seen IS NULL` (business-kontexten,
 * lib/BusinessContext.tsx) OCH `localStorage['hm_hemtur_klar']` saknas —
 * dubbelt skydd mot att turen visas igen (samma mönster som momentlagrets
 * hm_moments_seen). Vid avslut/hopp skrivs båda: localStorage direkt (turen
 * ska aldrig komma tillbaka i den här webbläsaren ens om skrivningen mot
 * servern skulle faila) och `welcome_tour_seen` fire-and-forget via
 * PUT /api/onboarding (samma rutt Step6 redan skriver via, kolumnen är
 * whitelistad där).
 *
 * SÄKERHETSNÄT (B7-mönstret från Step6LiveTour): hänger turen kvar på ett
 * steg i över 5 s utan att ha hittat sin target — tvinga fram avslut. Turen
 * ska aldrig kunna spärra sidan.
 */

import { useEffect, useRef, useState } from 'react'
import { SpotlightOverlay, TourHighlightFrame, type TourStepBase } from '@/components/tour/TourPrimitives'
import { useBusiness } from '@/lib/BusinessContext'

const SEEN_KEY = 'hm_hemtur_klar'
/** Sidan hinner rendera sina sektioner (queue, pengaband m.m.) innan turen letar efter dem. */
const START_DELAY_MS = 700
const HANG_TIMEOUT_MS = 5000

interface HemTurStep extends TourStepBase {
  id: string
}

const BASE_STEPS: HemTurStep[] = [
  {
    id: 'hemtur-attn',
    title: 'Det här behöver dig idag',
    body: 'Allt teamet vill göra hamnar här. Inget går ut utan ditt ja.',
    placement: 'bottom',
  },
  {
    id: 'hemtur-pengar',
    title: 'Pengar just nu',
    body: 'Här ser du läget på pengarna som väntar in — Karin bevakar dem åt dig.',
    placement: 'bottom',
  },
  {
    id: 'hemtur-team',
    title: 'Det här sköter teamet',
    body: 'Medan du jobbar håller de ögonen på fakturor, offerter och projekt.',
    placement: 'top',
  },
  {
    id: 'hemtur-mote',
    title: 'Möte idag?',
    body: 'Spela in nästa platsbesök — Matte skriver utkastet.',
    placement: 'top',
  },
  {
    id: 'hemtur-skriv',
    title: 'Fråga Matte',
    body: "Fråga Matte vad som helst — testa: \"Vilka projekt behöver mig?\"",
    placement: 'top',
  },
]

/** Ren best-effort-skrivning — blockerar aldrig turen och kastar aldrig. */
function markSeenOnServer() {
  fetch('/api/onboarding', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: { welcome_tour_seen: new Date().toISOString() } }),
  }).catch(() => { /* localStorage-spärren räcker — servern får en ny chans nästa gång */ })
}

export default function HemTur() {
  const business = useBusiness()
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [pengarText, setPengarText] = useState<string | null>(null)
  const foundRef = useRef(false)
  const finishedRef = useRef(false)

  // ═══ GRINDEN ═══
  useEffect(() => {
    if (finishedRef.current) return
    if (business.welcome_tour_seen) return
    try {
      if (localStorage.getItem(SEEN_KEY)) return
    } catch {
      // Trasig/blockerad localStorage — fail-safe: ingen tur snarare än en
      // som inte kan komma ihåg att den visats.
      return
    }
    const t = setTimeout(() => setActive(true), START_DELAY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.welcome_tour_seen])

  // Karins krona-fynd, återanvänt ur onboardingens payoff-rutt. Ägargrindad
  // (403 för anställda) och blockerar aldrig turen — vid fel/tomt faller
  // pengar-stoppet tillbaka på den generiska texten i BASE_STEPS.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetch('/api/onboarding/instant-value')
      .then(r => (r.ok ? r.json() : null))
      .then(json => { if (!cancelled && json?.headline?.text) setPengarText(String(json.headline.text)) })
      .catch(() => { /* generisk text räcker */ })
    return () => { cancelled = true }
  }, [active])

  function finish() {
    if (finishedRef.current) return
    finishedRef.current = true
    setActive(false)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch { /* best effort — se kommentaren vid markSeenOnServer */ }
    markSeenOnServer()
  }

  function next() {
    setStepIndex(i => i + 1)
  }

  const steps: HemTurStep[] = BASE_STEPS.map(s =>
    s.id === 'hemtur-pengar' && pengarText ? { ...s, body: pengarText } : s,
  )

  // ═══ MÄT/LETA UPP RIKTIGA TARGETEN ═══
  useEffect(() => {
    if (!active) return
    if (stepIndex >= steps.length) {
      finish()
      return
    }
    foundRef.current = false
    const step = steps[stepIndex]
    const el = document.querySelector<HTMLElement>(`[data-tour-target="${step.id}"]`)
    if (!el) {
      // Sektionen renderas inte för det här kontot (t.ex. anställd utan
      // ekonomibehörighet) — hoppa direkt, turen får aldrig spotlighta tomhet.
      // Nollställ rect så inget gammalt ramverk hinner blinka till bakom det
      // nya stoppets text.
      setRect(null)
      setStepIndex(i => i + 1)
      return
    }
    foundRef.current = true
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    const raf = requestAnimationFrame(measure)
    const t = setTimeout(measure, 350) // efter ev. smooth-scroll hunnit landa
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex])

  // ═══ SÄKERHETSNÄTET (B7-mönstret) ═══
  // Hittades ingen target inom 5 s (hängt DOM, oväntat fel) — tvinga fram
  // avslut. Turen ska aldrig kunna spärra sidan.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => {
      if (!foundRef.current) finish()
    }, HANG_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex])

  if (!active || stepIndex >= steps.length || !rect) return null

  return (
    <>
      <TourHighlightFrame rect={rect} />
      <SpotlightOverlay
        step={steps[stepIndex]}
        index={stepIndex}
        total={steps.length}
        position="fixed"
        onNext={next}
        onSkip={finish}
      />
    </>
  )
}
