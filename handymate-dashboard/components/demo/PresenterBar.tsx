'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  PlayCircle,
  RefreshCcw,
} from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { supabase } from '@/lib/supabase'
import { formatKr } from '@/lib/moments/derive'
import { isDemoManifest, type DemoManifest } from '@/lib/demo/manifest'
import {
  buildDemoStory,
  DEMO_STORY_STORAGE_KEY,
  type DemoStep,
} from '@/lib/demo/story'
import { buildDemoRecap } from '@/lib/demo/recap'
import { canRenderDemoPresenter, resolveTalkingPoint } from '@/lib/demo/presenter'
import type { PengarSummary } from '@/lib/value/pengar-pa-bordet'
import type { WeeklyValue } from '@/lib/weekly-value'

interface PreferenceRow {
  key: string
  value: string
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.json() as Promise<T>
}

function parseManifest(preferences: PreferenceRow[]): DemoManifest {
  const row = preferences.find(preference => preference.key === 'demo_manifest')
  if (!row) throw new Error('demo_manifest saknas')
  const value = JSON.parse(row.value) as unknown
  if (!isDemoManifest(value)) throw new Error('demo_manifest har fel form')
  return value
}

export function PresenterBar() {
  const business = useBusiness()
  const { isOwnerOrAdmin, loading: userLoading } = useCurrentUser()
  const router = useRouter()
  const demoBusinessId = process.env.NEXT_PUBLIC_DEMO_BUSINESS_ID
  const isPresenter = canRenderDemoPresenter({
    businessId: business.business_id,
    demoBusinessId,
    isOwnerOrAdmin,
    userLoading,
  })

  const [manifest, setManifest] = useState<DemoManifest | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [pengar, setPengar] = useState<PengarSummary | null>(null)
  const [weeklyValue, setWeeklyValue] = useState<WeeklyValue | null>(null)
  const [quoteAmount, setQuoteAmount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [replaying, setReplaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const story = useMemo(() => manifest ? buildDemoStory(manifest) : null, [manifest])
  const recap = useMemo(
    () => pengar && weeklyValue ? buildDemoRecap(pengar, weeklyValue) : null,
    [pengar, weeklyValue],
  )

  useEffect(() => {
    if (!isPresenter) return
    try {
      const stored = Number.parseInt(sessionStorage.getItem(DEMO_STORY_STORAGE_KEY) || '0', 10)
      setStepIndex(Number.isFinite(stored) ? Math.min(5, Math.max(0, stored)) : 0)
    } catch {
      setStepIndex(0)
    }
  }, [isPresenter])

  useEffect(() => {
    if (!isPresenter) return
    let active = true
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const preferencesData = await readJson<{ preferences: PreferenceRow[] }>('/api/preferences')
        const nextManifest = parseManifest(preferencesData.preferences || [])
        if (!active) return
        setManifest(nextManifest)

        const [pengarData, weeklyData, quoteData] = await Promise.all([
          readJson<PengarSummary>('/api/dashboard/pengar'),
          readJson<WeeklyValue>('/api/dashboard/weekly-value?days=30'),
          readJson<{ quote?: { total?: number | null } }>(
            `/api/quotes?quoteId=${encodeURIComponent(nextManifest.stale_quote)}`,
          ),
        ])
        if (!active) return
        setPengar(pengarData)
        setWeeklyValue(weeklyData)
        setQuoteAmount(typeof quoteData.quote?.total === 'number' ? quoteData.quote.total : null)
      } catch {
        if (active) setError('Storyunderlaget kunde inte laddas. Återställ demon och försök igen.')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => { active = false }
  }, [isPresenter])

  if (!isPresenter) return null

  const steps = story?.steps || []
  const step = steps[stepIndex] as DemoStep | undefined
  const categoryAmount = (category: 'marginalrisk' | 'forfallet') =>
    pengar?.kategorier.find(item => item.key === category)?.summaKr ?? null
  const stepAmount = step?.amountSource?.kind === 'quote'
    ? quoteAmount
    : step?.amountSource?.kind === 'pengar'
      ? categoryAmount(step.amountSource.category)
      : null
  const talkingPoint = step ? resolveTalkingPoint(step, stepAmount, formatKr) : null

  function navigateTo(index: number) {
    if (!story) return
    const nextIndex = Math.min(story.steps.length - 1, Math.max(0, index))
    const nextStep = story.steps[nextIndex]
    setStepIndex(nextIndex)
    try { sessionStorage.setItem(DEMO_STORY_STORAGE_KEY, String(nextIndex)) } catch { /* optional state */ }
    router.push(nextStep.targetRoute)
  }

  // Delas av resetDemo och showOnboarding — samma story/moment-state ska
  // bort oavsett vilken av de två knapparna som körs, annars kan
  // presentatörsbaren visa ett steg-index eller en recap som hör till en
  // demo-runda som inte längre finns.
  function clearDemoStoryState() {
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index--) {
        const key = sessionStorage.key(index)
        if (key?.startsWith('hm_demo_story')) sessionStorage.removeItem(key)
      }
      localStorage.removeItem('hm_moments_seen')
      sessionStorage.removeItem('matte-chat-auto-opened')
    } catch { /* full reload/navigation återställer ändå komponentstate */ }
  }

  async function resetDemo() {
    setResetting(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/admin/demo-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Reset misslyckades')
      }

      clearDemoStoryState()
      window.location.assign('/dashboard')
    } catch {
      setError('Demon kunde inte återställas. Försök igen från demosidan.')
      setResetting(false)
    }
  }

  // mode: presentatören väljer flöde per knapp — 'studio' tänder Setup
  // Studio-lagret för demokontot via ?studio=1 (se demo-överridden i
  // app/onboarding/page.tsx), 'classic' kör klassiska guiden.
  async function showOnboarding(mode: 'classic' | 'studio') {
    setReplaying(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/admin/demo-onboarding-replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Kunde inte visa onboardingen')
      }

      clearDemoStoryState()
      window.location.assign(mode === 'studio' ? '/onboarding?studio=1' : '/onboarding?classic=1')
    } catch {
      setError('Onboardingen kunde inte visas. Försök igen från demosidan.')
      setReplaying(false)
    }
  }

  return (
    <aside
      aria-label="Presentatörsläge"
      data-demo-presenter="true"
      className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white shadow-sm"
    >
      <div className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => navigateTo(stepIndex - 1)}
          disabled={!step || stepIndex === 0}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-35"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Föregående
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          {step ? <AgentAvatar agentKey={step.agent} size="sm" /> : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="font-semibold uppercase tracking-wide text-teal-300">Presentatör</span>
              <span>{step ? `Steg ${stepIndex + 1}/${steps.length}` : 'Laddar storyn'}</span>
            </div>
            <p className="m-0 truncate text-xs sm:text-sm" title={talkingPoint || undefined}>
              {loading ? 'Laddar riktigt storyunderlag…' : talkingPoint || error || 'Storymanifest saknas.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => step && router.push(step.targetRoute)}
          disabled={!step}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-35"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Öppna vy
        </button>

        <button
          type="button"
          onClick={() => navigateTo(stepIndex + 1)}
          disabled={!step || stepIndex === steps.length - 1}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-35"
        >
          Nästa
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => showOnboarding('classic')}
          disabled={replaying}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-60"
        >
          {replaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
          Onboarding · klassisk
        </button>

        <button
          type="button"
          onClick={() => showOnboarding('studio')}
          disabled={replaying}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 px-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-60"
        >
          {replaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
          Onboarding · med Matte
        </button>

        <button
          type="button"
          onClick={resetDemo}
          disabled={resetting}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-bold text-slate-950 hover:bg-slate-100 disabled:opacity-60"
        >
          {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          Återställ
        </button>
      </div>

      {step?.liveAction === 'recap' && recap ? (
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-3 py-2 text-[11px] sm:px-4">
          <div data-recap-kind="identifierad-potential" className="rounded-md bg-amber-400/10 px-2 py-1 text-amber-100">
            <strong>Identifierad potential: {formatKr(recap.identifiedPotential.totalKr)}</strong>
            <span className="ml-1 text-amber-100/70">
              {recap.identifiedPotential.categories.map(category => `${category.titel}: ${formatKr(category.summaKr)}`).join(' · ')}
            </span>
          </div>
          <div data-recap-kind="bekraftat-varde" className="rounded-md bg-emerald-400/10 px-2 py-1 text-emerald-100">
            <strong>Bekräftat: {formatKr(recap.confirmedValue.totalKr)}</strong>
          </div>
          {recap.capturedPotential.totalKr > 0 ? (
            <div data-recap-kind="fangad-potential" className="rounded-md bg-sky-400/10 px-2 py-1 text-sky-100">
              <strong>Fångad leadpotential: {formatKr(recap.capturedPotential.totalKr)}</strong>
            </div>
          ) : null}
          {recap.estimatedTimeHours > 0 ? (
            <div data-recap-kind="uppskattad-tid" className="rounded-md bg-white/5 px-2 py-1 text-slate-200">
              Uppskattad adminbesparing: ≈ {recap.estimatedTimeHours} h
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="border-t border-red-400/20 bg-red-400/10 px-4 py-1.5 text-xs text-red-100">
          {error}
        </div>
      ) : null}
    </aside>
  )
}

export default PresenterBar
