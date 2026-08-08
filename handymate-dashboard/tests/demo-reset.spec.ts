/**
 * Browserlöst facit för Epic 4 — demo-reset hardening.
 *
 * Körs utan session/browser:
 *   npx playwright test tests/demo-reset.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  buildDemoManifest,
  DEMO_STORY_ENTITY_KEYS,
  DEMO_SUPPORTING_ENTITY_KEYS,
} from '../lib/demo/manifest'

const ROOT = path.resolve(__dirname, '..')
const ROUTE_PATH = path.join(ROOT, 'app/api/admin/demo-reset/route.ts')
const SEED_PATH = path.join(ROOT, 'lib/demo/seed-demo-account.ts')
const PAGE_PATH = path.join(ROOT, 'app/dashboard/demo/page.tsx')
const MIGRATION_PATH = path.join(ROOT, 'sql/v99_demo_reset_transaction.sql')

const routeSource = fs.readFileSync(ROUTE_PATH, 'utf8')
const seedSource = fs.readFileSync(SEED_PATH, 'utf8')
const pageSource = fs.readFileSync(PAGE_PATH, 'utf8')
const migrationSource = fs.readFileSync(MIGRATION_PATH, 'utf8')

test.describe('demo-reset route — tre oberoende grindar', () => {
  test('saknad DEMO_BUSINESS_ID och annan tenant stoppas med 403', () => {
    expect(routeSource).toMatch(/if\s*\(\s*!demoBusinessId\s*\|\|\s*business\.business_id\s*!==\s*demoBusinessId\s*\)/)
    const envGuard = routeSource.indexOf('!demoBusinessId || business.business_id !== demoBusinessId')
    const envResponse = routeSource.indexOf('{ status: 403 }', envGuard)
    expect(envGuard).toBeGreaterThan(-1)
    expect(envResponse).toBeGreaterThan(envGuard)
  })

  test('utan owner/admin blir svaret 403', () => {
    expect(routeSource).toContain("getCurrentUser(request, business.business_id)")
    const roleGuard = routeSource.indexOf('!currentUser || !isOwnerOrAdmin(currentUser)')
    const roleResponse = routeSource.indexOf('{ status: 403 }', roleGuard)
    const resetCall = routeSource.indexOf('resetDemoAccount(')
    expect(roleGuard).toBeGreaterThan(-1)
    expect(roleResponse).toBeGreaterThan(roleGuard)
    expect(resetCall).toBeGreaterThan(roleResponse)
  })

  test('manipulerad body kan aldrig välja production tenant', () => {
    expect(routeSource).not.toMatch(/await\s+request\.json\s*\(/)
    expect(routeSource).toContain('resetDemoAccount(\n      business.business_id,')
    expect(routeSource).not.toMatch(/resetDemoAccount\([^)]*body/i)
  })
})

test.describe('V99 RPC — atomisk, explicit och fail closed', () => {
  const expectedDeleteManifest = [
    'thread_message',
    'agent_handoffs',
    'agent_threads',
    'agent_messages',
    'agent_memories',
    'business_knowledge',
    'notification',
    'pending_approvals',
    'agent_runs',
    'pipeline_activity',
    'project_log',
    'project_photos',
    'project_checklist',
    'time_entry',
    'project_material',
    'project_change',
    'schedule_entry',
    'booking',
    'quote_items',
    'invoice',
    'project',
    'quotes',
    'deal',
    'customer',
    'business_preferences',
  ]

  test('RPC:n har exakt en parameter och SECURITY DEFINER', () => {
    expect(migrationSource).toMatch(/FUNCTION\s+public\.reset_demo_tenant\s*\(\s*p_business_id\s+TEXT\s*\)/i)
    expect(migrationSource).toContain('SECURITY DEFINER')
    expect(migrationSource).toContain('SET search_path = public, pg_temp')
    expect(migrationSource).toContain('user_id = auth.uid()::TEXT')
  })

  test('is_demo_tenant valideras före första DELETE', () => {
    const functionStart = migrationSource.indexOf('CREATE OR REPLACE FUNCTION public.reset_demo_tenant')
    const functionBody = migrationSource.slice(functionStart)
    const demoGuard = functionBody.indexOf('is_demo_tenant IS TRUE')
    const firstDelete = functionBody.indexOf('DELETE FROM')
    expect(demoGuard).toBeGreaterThan(-1)
    expect(firstDelete).toBeGreaterThan(demoGuard)
    expect(functionBody.slice(0, firstDelete)).toContain("MESSAGE = 'Demo reset denied: tenant is not explicitly demo-flagged'")
  })

  test('delete-manifestet är komplett och inga tabellnamn är dynamiska', () => {
    const actual = Array.from(migrationSource.matchAll(/DELETE FROM\s+public\.([a-z0-9_]+)/gi))
      .map(match => match[1].toLowerCase())
    expect(actual).toEqual(expectedDeleteManifest)
    expect(migrationSource).not.toMatch(/EXECUTE\s+format|EXECUTE\s+['"]/i)
  })

  test('varje tabell i delete-manifestet finns i repots schemafacit', () => {
    // Samma dokumenterade bastabeller som tests/schema-contract.spec.ts.
    const facit = new Set(['business_config', 'customer', 'booking', 'quotes', 'invoice', 'price_list'])
    const sqlDir = path.join(ROOT, 'sql')
    for (const file of fs.readdirSync(sqlDir).filter(file => file.endsWith('.sql'))) {
      const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8')
      for (const match of Array.from(sql.matchAll(
        /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?([a-z0-9_]+)"?/gi,
      ))) {
        facit.add(match[1].toLowerCase())
      }
    }

    const unknown = expectedDeleteManifest.filter(table => !facit.has(table))
    expect(unknown, `Okända tabeller i V99 DELETE-manifest: ${unknown.join(', ')}`).toEqual([])
  })

  test('auditen är smal och migrationen ska köras manuellt', () => {
    for (const column of [
      'id', 'business_id', 'actor_user_id', 'started_at', 'finished_at',
      'ok', 'error_text', 'reset_version',
    ]) {
      expect(migrationSource).toMatch(new RegExp(`\\b${column}\\b`))
    }
    expect(migrationSource).toContain('KÖRS MANUELLT i Supabase SQL Editor före nästa demo')
  })
})

test.describe('entity-manifestet', () => {
  const uuid = '4a7cda5c-d2ae-4aed-a349-272dd06d8cf2'
  const manifest = buildDemoManifest({
    businessId: 'biz_0lovw5vcwzqn',
    staleQuoteId: 'quote_abc123456',
    marginProjectId: uuid,
    overdueInvoiceId: 'inv_abc123456',
    ataMissedApprovalId: 'appr_ata123456',
    materialMissedApprovalId: 'appr_mat123456',
    profitabilityWarningApprovalId: 'appr_profit123',
    invoiceReminderApprovalId: 'appr_invoice12',
  })

  test('har sex storynycklar och samtliga stödnycklar', () => {
    expect(DEMO_STORY_ENTITY_KEYS).toHaveLength(6)
    for (const key of [...DEMO_STORY_ENTITY_KEYS, ...DEMO_SUPPORTING_ENTITY_KEYS]) {
      expect(manifest[key]).toBeTruthy()
      expect(manifest[key]).toMatch(/^[a-z0-9][a-z0-9_-]{7,}$/i)
    }
  })

  test('story-ID:n kommer från insertsens riktiga returvärden', () => {
    expect(seedSource).toContain('staleQuoteId: quotes.mikael_quote.quote_id')
    expect(seedSource).toContain('marginProjectId: annaProject.project_id')
    expect(seedSource).toContain('overdueInvoiceId: kristinaInvoice.invoice_id')
    expect(seedSource).toContain('ataMissedApprovalId,')
    expect(seedSource).toContain("key: 'demo_manifest'")
    expect(seedSource).toContain("source: 'user'")
  })

  test('varje seedinsert har synlig errorhantering', () => {
    expect(seedSource).not.toContain('failed (non-blocking)')
    expect(seedSource).not.toContain('insert failed (non-blocking)')
    for (const table of [
      'customer', 'deal', 'pipeline_activity', 'quotes', 'quote_items',
      'project', 'project_checklist', 'booking', 'schedule_entry', 'invoice',
      'pending_approvals', 'business_knowledge', 'agent_runs',
    ]) {
      expect(seedSource).toContain(`from('${table}')`)
    }
  })
})

test('klientreset rensar moment/story-state och startar om den lokala Matte-tråden', () => {
  expect(pageSource).toContain("localStorage.removeItem('hm_moments_seen')")
  expect(pageSource).toContain("startsWith('hm_demo_story')")
  expect(pageSource).toContain('window.location.reload()')
})
