/**
 * Browserlöst facit för Epic 5 — story, presentergrind och ärlig recap.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/demo-story.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildDemoStory } from '../lib/demo/story'
import {
  DEMO_STORY_ENTITY_KEYS,
  type DemoManifest,
} from '../lib/demo/manifest'
import { buildDemoRecap } from '../lib/demo/recap'
import { canRenderDemoPresenter, resolveTalkingPoint } from '../lib/demo/presenter'
import type { PengarSummary } from '../lib/value/pengar-pa-bordet'
import type { WeeklyValue } from '../lib/weekly-value'

const ROOT = path.resolve(__dirname, '..')
const PRESENTER_PATH = path.join(ROOT, 'components/demo/PresenterBar.tsx')
const LAYOUT_PATH = path.join(ROOT, 'app/dashboard/layout.tsx')
const RECAP_PATH = path.join(ROOT, 'lib/demo/recap.ts')
const presenterSource = fs.readFileSync(PRESENTER_PATH, 'utf8')
const layoutSource = fs.readFileSync(LAYOUT_PATH, 'utf8')
const recapSource = fs.readFileSync(RECAP_PATH, 'utf8')

const manifest: DemoManifest = {
  morning_brief: 'biz_demo123',
  stale_quote: 'quote_demo123',
  margin_project: 'project_demo123',
  overdue_invoice: 'invoice_demo123',
  live_matte_project: 'project_demo123',
  value_recap: 'biz_demo123',
  ata_missed: 'appr_ata123',
  material_missed: 'appr_material123',
  profitability_warning: 'appr_profit123',
  invoice_reminder: 'appr_reminder123',
  experiment_readout: 'appr_expreadout123',
}

function targetHasProductionPage(targetRoute: string): boolean {
  const cleanPath = targetRoute.split(/[?#]/, 1)[0]
  const segments = cleanPath.split('/').filter(Boolean)
  let candidates = [path.join(ROOT, 'app')]

  for (const segment of segments) {
    const next: string[] = []
    for (const parent of candidates) {
      if (!fs.existsSync(parent)) continue
      for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const dynamic = /^\[[^\]]+\]$/.test(entry.name)
        if (entry.name === segment || dynamic) next.push(path.join(parent, entry.name))
      }
    }
    candidates = next
  }

  return candidates.some(candidate => fs.existsSync(path.join(candidate, 'page.tsx')))
}

test.describe('sexstegsstoryn', () => {
  const story = buildDemoStory(manifest)

  test('har exakt sex steg i rätt specialistordning', () => {
    expect(story.steps).toHaveLength(6)
    expect(story.steps.map(step => step.agent)).toEqual([
      'matte', 'daniel', 'lars', 'karin', 'matte', 'matte',
    ])
  })

  test('varje entityKey är del av reset-manifestets storytyp', () => {
    for (const step of story.steps) {
      expect(DEMO_STORY_ENTITY_KEYS).toContain(step.entityKey)
      expect(manifest[step.entityKey]).toBeTruthy()
    }
  })

  test('varje targetRoute är en konkret, existerande produktionsroute', () => {
    for (const step of story.steps) {
      expect(step.targetRoute).toMatch(/^\/dashboard(?:\/|$)/)
      expect(step.targetRoute).not.toContain('[id]')
      expect(targetHasProductionPage(step.targetRoute), step.targetRoute).toBe(true)
    }
  })

  test('talking points bär aldrig hårdkodade kronbelopp', () => {
    for (const step of story.steps) {
      expect(step.talkingPoint).not.toMatch(/\d{3,}\s*kr/i)
    }
  })

  test('beloppsplatshållaren löses från data, inte från manus', () => {
    const quoteStep = story.steps[1]
    expect(quoteStep.talkingPoint).toContain('{amount}')
    expect(resolveTalkingPoint(quoteStep, 84_501, amount => `${amount} kr`)).toContain('84501 kr')
    expect(resolveTalkingPoint(quoteStep, null, amount => `${amount} kr`)).toContain('beloppet i underlaget')
  })
})

test.describe('presentatörsgrinden', () => {
  const allowed = {
    businessId: 'biz_demo123',
    demoBusinessId: 'biz_demo123',
    isOwnerOrAdmin: true,
    userLoading: false,
  }

  test('är stängd utan publik demo-tenant', () => {
    expect(canRenderDemoPresenter({ ...allowed, demoBusinessId: undefined })).toBe(false)
    expect(canRenderDemoPresenter({ ...allowed, businessId: 'biz_production' })).toBe(false)
  })

  test('är stängd utan owner/admin och under rolladdning', () => {
    expect(canRenderDemoPresenter({ ...allowed, isOwnerOrAdmin: false })).toBe(false)
    expect(canRenderDemoPresenter({ ...allowed, userLoading: true })).toBe(false)
  })

  test('komponenten använder grinden och renderar null när den nekar', () => {
    expect(presenterSource).toContain('process.env.NEXT_PUBLIC_DEMO_BUSINESS_ID')
    expect(presenterSource).toContain('canRenderDemoPresenter({')
    expect(presenterSource).toContain('if (!isPresenter) return null')
  })
})

test.describe('navigation och reset', () => {
  test('panelen är global men ligger endast i den riktiga dashboard-layouten', () => {
    expect(layoutSource).toContain("import PresenterBar from '@/components/demo/PresenterBar'")
    expect(layoutSource).toContain('<PresenterBar />')
    expect(layoutSource).not.toContain('demo_manifest')
  })

  test('nästa/föregående sparar endast stepstate och navigerar med router.push', () => {
    expect(presenterSource).toContain('sessionStorage.setItem(DEMO_STORY_STORAGE_KEY, String(nextIndex))')
    expect(presenterSource).toContain('router.push(nextStep.targetRoute)')
    const navigationBody = presenterSource.slice(
      presenterSource.indexOf('function navigateTo'),
      presenterSource.indexOf('async function resetDemo'),
    )
    expect(navigationBody).not.toContain('fetch(')
  })

  test('fallbackknappen finns alltid och live-steget ändrar inte chatten', () => {
    expect(presenterSource).toContain('Öppna vy')
    expect(presenterSource).toContain('router.push(step.targetRoute)')
    expect(presenterSource).not.toContain('/api/matte/chat')
    expect(presenterSource).not.toContain('Jobbkompisen')
  })

  test('återställ använder befintlig API-väg och nollställer story/sessionstate', () => {
    expect(presenterSource).toContain("fetch('/api/admin/demo-reset'")
    expect(presenterSource).toContain("startsWith('hm_demo_story')")
    expect(presenterSource).toContain("localStorage.removeItem('hm_moments_seen')")
    expect(presenterSource).toContain("sessionStorage.removeItem('matte-chat-auto-opened')")
    expect(presenterSource).toContain("window.location.assign('/dashboard')")
  })
})

test.describe('recapen blandar aldrig kunskapsnivåerna', () => {
  const pengar: PengarSummary = {
    totalKr: 130_000,
    kategorier: [
      { key: 'offerter', titel: 'Offerter', beskrivning: 'X', summaKr: 80_000, antal: 1, href: '/dashboard/quotes' },
      { key: 'marginalrisk', titel: 'Marginal', beskrivning: 'Y', summaKr: 50_000, antal: 1, href: '/dashboard/projects' },
    ],
  }
  const weekly: WeeklyValue = {
    range_days: 30,
    confirmed_kr: 40_000,
    confirmed_items: [],
    captured_count: 2,
    captured_kr: 25_000,
    calls_captured: 0,
    time_minutes: 120,
    time_hours: 2,
    autonomous_count: 0,
  }

  test('behåller potential, bekräftat och leadpotential som tre separata värden', () => {
    const recap = buildDemoRecap(pengar, weekly)
    expect(recap.identifiedPotential.totalKr).toBe(130_000)
    expect(recap.confirmedValue.totalKr).toBe(40_000)
    expect(recap.capturedPotential.totalKr).toBe(25_000)
    expect(recap).not.toHaveProperty('totalKr')
  })

  test('källan har ingen additionsväg mellan potential och bekräftat', () => {
    expect(recapSource).not.toMatch(/identifiedPotential[^\n]*\+[^\n]*confirmedValue/)
    expect(recapSource).not.toMatch(/pengar\.totalKr\s*\+\s*weekly\.confirmed_kr/)
    expect(presenterSource).toContain('data-recap-kind="identifierad-potential"')
    expect(presenterSource).toContain('data-recap-kind="bekraftat-varde"')
  })
})
