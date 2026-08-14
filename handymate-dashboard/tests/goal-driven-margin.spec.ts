/**
 * Källkontrakt för Goal-driven Margin Guardian V1 (2026-08-14).
 *
 * Körs browserlöst:
 *   npx playwright test tests/goal-driven-margin.spec.ts --no-deps --project=chromium
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const migration = read('sql/v134_margin_target_explicit.sql')
const profitability = read('lib/profitability.ts')
const malBlock = read('components/value/MalBlock.tsx')
const profitabilityRoute = read('app/api/projects/[id]/profitability/route.ts')

test.describe('v134 — defaultvärde är aldrig bevis för ett ägarmål', () => {
  test('explicithetskolumnen skapas före backfill och trigger', () => {
    const addColumn = migration.indexOf('ADD COLUMN IF NOT EXISTS margin_target_set_at')
    const backfill = migration.indexOf('UPDATE public.business_config')
    const trigger = migration.indexOf('CREATE TRIGGER trg_business_config_margin_target_explicit')
    expect(addColumn).toBeGreaterThan(-1)
    expect(backfill).toBeGreaterThan(addColumn)
    expect(trigger).toBeGreaterThan(backfill)
  })

  test('backfill bevisar bara värden som avviker från default 50', () => {
    expect(migration).toContain('margin_target_set_at IS NULL')
    expect(migration).toContain('margin_target_percent IS NOT NULL')
    expect(migration).toContain('margin_target_percent <> 50')
  })

  test('framtida explicit sparning stämplas även när värdet är oförändrat', () => {
    expect(migration).toContain('BEFORE UPDATE OF margin_target_percent ON public.business_config')
    expect(migration).toContain('NEW.margin_target_set_at := now()')
  })
})

test.describe('konsumenterna kräver explicithetsbeviset', () => {
  test('Mål-blocket väljer inte margin_target_percent utan margin_target_set_at', () => {
    expect(malBlock).toContain(".select('margin_target_percent, margin_target_set_at, revenue_target_annual_sek')")
    expect(malBlock).toContain('data.margin_target_set_at && typeof data.margin_target_percent')
  })

  test('Guardian läser målet en gång före projektloopen, inte N+1', () => {
    expect(profitability).toContain(".select('margin_target_percent, margin_target_set_at')")
    expect(profitability).toContain('if (!data?.margin_target_set_at) return null')

    const checkStart = profitability.indexOf('export async function checkProfitabilityWarnings')
    const targetRead = profitability.indexOf('await getExplicitMarginTarget', checkStart)
    const projectLoop = profitability.indexOf('for (const project of projects)', checkStart)
    const guardianCall = profitability.indexOf('computeGuardianVarningForProject(supabase, businessId, project, marginTargetPercent)', projectLoop)
    expect(targetRead).toBeGreaterThan(checkStart)
    expect(projectLoop).toBeGreaterThan(targetRead)
    expect(guardianCall).toBeGreaterThan(projectLoop)
  })

  test('projektdetaljens live-Guardian använder samma explicita mål', () => {
    const targetRead = profitabilityRoute.indexOf('await getExplicitMarginTarget')
    const guardianCall = profitabilityRoute.indexOf('computeGuardianVarningForProject', targetRead)
    expect(targetRead).toBeGreaterThan(-1)
    expect(guardianCall).toBeGreaterThan(targetRead)
    expect(profitabilityRoute.slice(guardianCall, guardianCall + 500)).toContain('marginTargetPercent')
  })

  test('målbeviset följer med i approval-payloaden till befintliga ytor', () => {
    expect(profitability).toContain('margin_target_percent: result.margin_target_percent')
    expect(profitability).toContain('margin_target_breached: result.margin_target_breached')
    expect(profitability).toContain('Marginalmålet underskrids')
  })
})
