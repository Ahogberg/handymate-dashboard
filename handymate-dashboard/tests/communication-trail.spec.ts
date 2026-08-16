/**
 * Facit för Kommunikationsunderlaget V1 (2026-08-16) — den deterministiska,
 * läsande exporten av all kund↔företag-kommunikation per kund.
 *
 * Bygger ovanpå kontextrevisionens capture-lager (tests/customer-context-trail.spec.ts)
 * och låser exportens kärnkontrakt så det inte kan regressa tyst:
 *   - varje källa tenant-filtrerad på business_id
 *   - fel per källa RAPPORTERAS (sources_with_errors) — aldrig tyst svalda,
 *     eftersom ett ofullständigt underlag som ser komplett ut är värre än
 *     inget underlag alls i en tvist
 *   - hela kedjan är läsande — inga mutationer någonstans
 *   - auth på båda API-ytorna, verktyget finns i definitions + router + Mattes lista
 *
 *   npx playwright test tests/communication-trail.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  sortTrailEntries,
  groupEntriesByDay,
  normalizeTrailRange,
  TRAIL_CHANNEL_LABELS,
  type TrailEntry,
} from '../lib/compliance/communication-trail'
import { escapeHtml, renderTrailHtml } from '../lib/compliance/trail-html'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const LIB = 'lib/compliance/communication-trail.ts'
const API_ROUTE = 'app/api/customers/[id]/communication-trail/route.ts'
const PDF_ROUTE = 'app/api/customers/[id]/communication-trail/pdf/route.ts'

// ─── (a) varje källtabell frågas i libben, tenant-filtrerad ─────────────────

test.describe('datainsamlingen täcker alla kommunikationskällor, tenant-filtrerat', () => {
  const SOURCES = [
    'sms_conversation',
    'sms_log',
    'email_conversations',
    'customer_message',
    'call_recording',
    'widget_conversation',
    'quote_tracking_events',
    'customer_activity',
  ]

  for (const table of SOURCES) {
    test(`${table} frågas med business_id-filter`, () => {
      const s = read(LIB)
      const i = s.indexOf(`from('${table}')`)
      expect(i, `källan ${table} saknas i underlaget`).toBeGreaterThan(-1)
      const gren = s.slice(i, i + 600)
      expect(gren, `${table} saknar tenant-filter`).toContain(".eq('business_id', businessId)")
    })
  }

  test('kundens egen rad slås upp tenant-filtrerat (widget-matchning via telefon/e-post)', () => {
    const s = read(LIB)
    const i = s.indexOf("from('customer')")
    expect(i).toBeGreaterThan(-1)
    const gren = s.slice(i, i + 400)
    expect(gren).toContain(".eq('business_id', businessId)")
    // Widget saknar customer_id — matchas via det besökaren själv angav.
    expect(s).toContain('visitor_phone')
    expect(s).toContain('visitor_email')
  })

  test('historiska sms_log-rader tidsavgränsas mot speglingens start (dedup-gränsen)', () => {
    const s = read(LIB)
    const i = s.indexOf("from('sms_log')")
    const gren = s.slice(i, i + 700)
    expect(gren).toContain(".eq('direction', 'outbound')")
    expect(gren).toContain(".lt('sent_at'")
  })
})

// ─── (b) fel rapporteras — aldrig tyst svalda ───────────────────────────────

test.describe('ärlighetskontraktet: fel och avkortning rapporteras', () => {
  test('varje källa error-checkas och hamnar i sources_with_errors', () => {
    const s = read(LIB)
    expect(s).toContain('sources_with_errors')
    // Den gemensamma insamlaren destrukturerar { data, error } och loggar felet.
    expect(s).toContain('const { data, error }')
    expect(s).toContain('console.error')
    expect(s).toMatch(/sources_with_errors\.push|sourcesWithErrors\.push/)
  })

  test('avkortade källor rapporteras i truncated_sources', () => {
    const s = read(LIB)
    expect(s).toContain('truncated_sources')
    expect(s).toMatch(/truncated_sources\.push|truncatedSources\.push/)
    expect(s).toContain('PER_SOURCE_LIMIT')
  })
})

// ─── (c) + (f) auth på båda API-ytorna ──────────────────────────────────────

test.describe('API-ytorna kräver auth', () => {
  for (const route of [API_ROUTE, PDF_ROUTE]) {
    test(`${route} anropar getAuthenticatedBusiness och svarar 401`, () => {
      const s = read(route)
      expect(s).toContain('getAuthenticatedBusiness(request)')
      expect(s).toContain('401')
    })
  }
})

// ─── (d) verktyget finns i definitions + router + Mattes kurerade lista ─────

test('get_communication_trail finns i definition, router och Mattes kurerade lista', () => {
  for (const file of [
    'app/api/agent/trigger/tool-definitions.ts',
    'app/api/agent/trigger/tool-router.ts',
    'app/api/matte/chat/route.ts',
  ]) {
    expect(read(file), `${file} saknar verktyget`).toContain('get_communication_trail')
  }
})

// ─── (e) hela kedjan är läsande ─────────────────────────────────────────────

test('underlags-libben är strikt läsande — inga mutationer', () => {
  const source = read(LIB)
  expect(source).not.toMatch(/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/)
})

test('HTML-renderaren är ren — ingen Supabase alls', () => {
  const source = read('lib/compliance/trail-html.ts')
  expect(source).not.toContain('supabase')
})

// ─── (g) UI-ingången finns på kundkortet ────────────────────────────────────

test('kundkortet länkar till exporten och tidslinjen har portal/chatt-filter', () => {
  const page = read('app/dashboard/customers/[id]/page.tsx')
  expect(page).toContain('/communication-trail/pdf')
  expect(page.toLowerCase()).toContain('kommunikationsunderlag')

  // Filter-nycklarna måste matcha timeline-routens sektioner 3d ('portal')
  // och 3g ('chat') exakt — annars blir chipsen tomma vyer.
  const timeline = read('components/CustomerTimeline.tsx')
  expect(timeline).toContain("{ key: 'portal', label: 'Portal' }")
  expect(timeline).toContain("{ key: 'chat', label: 'Webbchatt' }")
})

// ─── rena hjälpfunktioner ───────────────────────────────────────────────────

const entry = (over: Partial<TrailEntry>): TrailEntry => ({
  channel: 'sms',
  direction: 'in',
  timestamp: '2026-08-01T10:00:00Z',
  title: 'SMS mottaget',
  body: 'Hej',
  ...over,
})

test.describe('sortering och dagsgruppering är deterministiska', () => {
  test('sortTrailEntries sorterar stigande kronologiskt utan att mutera indata', () => {
    const input = [
      entry({ timestamp: '2026-08-03T09:00:00Z', title: 'C' }),
      entry({ timestamp: '2026-08-01T09:00:00Z', title: 'A' }),
      entry({ timestamp: '2026-08-02T09:00:00Z', title: 'B' }),
    ]
    const frozen = [...input]
    const sorted = sortTrailEntries(input)
    expect(sorted.map(e => e.title)).toEqual(['A', 'B', 'C'])
    expect(input).toEqual(frozen)
  })

  test('groupEntriesByDay grupperar på svensk kalenderdag (Europe/Stockholm)', () => {
    // 22:30 UTC den 1:a är 00:30 den 2:a i Stockholm på sommaren —
    // dagsgruppering på UTC hade lagt posten på fel dygn i underlaget.
    const groups = groupEntriesByDay(sortTrailEntries([
      entry({ timestamp: '2026-08-01T10:00:00Z', title: 'dag1' }),
      entry({ timestamp: '2026-08-01T22:30:00Z', title: 'dag2-natt' }),
      entry({ timestamp: '2026-08-02T08:00:00Z', title: 'dag2' }),
    ]))
    expect(groups.map(g => g.day)).toEqual(['2026-08-01', '2026-08-02'])
    expect(groups[1].entries.map(e => e.title)).toEqual(['dag2-natt', 'dag2'])
  })

  test('normalizeTrailRange gör datum till dygnsgränser och släpper igenom fulla ISO-stämplar', () => {
    expect(normalizeTrailRange('2026-08-01', '2026-08-05')).toEqual({
      fromIso: '2026-08-01T00:00:00Z',
      toIso: '2026-08-05T23:59:59.999Z',
    })
    expect(normalizeTrailRange('2026-08-01T12:00:00Z', undefined)).toEqual({
      fromIso: '2026-08-01T12:00:00Z',
      toIso: undefined,
    })
    expect(normalizeTrailRange(undefined, undefined)).toEqual({ fromIso: undefined, toIso: undefined })
  })
})

test.describe('HTML-exporten är trogen och trygg', () => {
  test('escapeHtml neutraliserar markup i meddelandekroppar', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'citat'`))
      .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;citat&#39;')
  })

  test('renderTrailHtml visar kanaletiketter, parter och ofullständighetsvarning', () => {
    const html = renderTrailHtml({
      businessName: 'Byglo Bygg AB',
      customerName: 'Kalle Kund',
      generatedAtIso: '2026-08-16T12:00:00Z',
      entries: [
        entry({ channel: 'sms', direction: 'in', body: 'Kan ni komma på tisdag?' }),
        entry({ channel: 'meeting', direction: null, title: 'Platsbesök', body: 'Sammanfattning', timestamp: '2026-08-02T09:00:00Z' }),
      ],
      sourcesWithErrors: ['email_conversations'],
      truncatedSources: [],
    })
    expect(html).toContain('Kommunikationsunderlag')
    expect(html).toContain('Byglo Bygg AB')
    expect(html).toContain('Kalle Kund')
    expect(html).toContain(TRAIL_CHANNEL_LABELS.meeting)
    expect(html).toContain('Kan ni komma på tisdag?')
    // Ärlighetskravet: ett underlag med bortfall SÄGER det, i klartext.
    expect(html).toContain('Underlaget är ofullständigt')
    expect(html).toContain('e-post')
  })

  test('renderTrailHtml utan bortfall visar INGEN varning', () => {
    const html = renderTrailHtml({
      businessName: 'Byglo Bygg AB',
      customerName: 'Kalle Kund',
      generatedAtIso: '2026-08-16T12:00:00Z',
      entries: [entry({})],
      sourcesWithErrors: [],
      truncatedSources: [],
    })
    expect(html).not.toContain('Underlaget är ofullständigt')
  })
})
