'use client'

import { useEffect } from 'react'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { readAndClearFirstMissionPrompt } from '@/lib/onboarding/first-mission-handoff'

/**
 * Konsumerar onboardingens Första-uppdraget-beat (Step6LiveTour, sista
 * onboarding-steget) — se lib/onboarding/first-mission-handoff.ts för
 * varför bryggan behövs (JobbuddyProvider finns inte i onboardingens
 * layout). Renderar ingenting; körs en gång per dashboard-montering och
 * gör inget alls om ingen prompt väntar (normalfallet för alla andra
 * dashboard-besök).
 *
 * Monteras i app/dashboard/layout.tsx, INUTI JobbuddyProvider.
 */
export default function FirstMissionHandoff() {
  const { setPendingPrompt, setActiveTab, setIsOpen } = useJobbuddy()

  useEffect(() => {
    const prompt = readAndClearFirstMissionPrompt()
    if (!prompt) return
    // Exakt ReaktiveringsInsikt-mekaniken: förifyll och öppna — skicka ALDRIG
    // automatiskt. Hantverkaren ser och kan redigera frågan innan den går iväg.
    setPendingPrompt(prompt)
    setActiveTab('chat')
    setIsOpen(true)
    // Ska bara köras vid montering — nyckeln är redan konsumerad/nollad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
