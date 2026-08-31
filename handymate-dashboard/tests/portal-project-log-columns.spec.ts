/**
 * Facit: kundportalens byggdagboksfråga läser RIKTIGA project_log-kolumner.
 *
 * Bakgrund (2026-08-31): den ursprungliga SQL-designen (sql/rot_rut_
 * documents.sql) hette project_id/work_description, men den levande
 * tabellen döptes om till order_id/work_performed utan att portalens
 * fråga följde med. Selecten frågade efter kolumner som inte finns →
 * PostgREST 42703 → felet svaldes tyst av loggningen → latestLog blev
 * ALLTID null för varje portalbesök, oavsett hur många anteckningar som
 * fanns. Ingen kunddata läckte — frågan gav bara aldrig ett svar.
 *
 * Facit läser källan (inte en mockad DB) — verifierar att query-strängen
 * pekar på de kolumner som app/api/projects/[id]/logs/route.ts faktiskt
 * SKRIVER mot, så de två aldrig glider isär igen.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const source = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('portal/[token]/projects — project_log läser riktiga kolumner', () => {
  const route = source('app/api/portal/[token]/projects/route.ts')
  const writer = source('app/api/projects/[id]/logs/route.ts')

  test('selecten aliasar order_id→project_id och work_performed→description', () => {
    expect(route).toContain("select('project_id:order_id, description:work_performed, created_at')")
  })

  test('filtret använder den RIKTIGA kolumnen (order_id), inte den påhittade (project_id)', () => {
    const block = route.slice(route.indexOf("from('project_log')"), route.indexOf("from('schedule_entry')"))
    expect(block).toContain(".in('order_id', ids)")
    expect(block).not.toContain(".in('project_id', ids)")
  })

  test('log_report_%-spärren finns kvar — interna Work Report-rader exkluderas alltid', () => {
    const block = route.slice(route.indexOf("from('project_log')"), route.indexOf("from('schedule_entry')"))
    expect(block).toContain(".not('id', 'like', 'log_report_%')")
  })

  test('kryssprov: writer-routen skriver mot EXAKT samma kolumnnamn som portalen nu läser', () => {
    // order_id = projektet, work_performed = den kundvända narrativen.
    expect(writer).toContain('order_id: projectId')
    expect(writer).toContain('work_performed: work_description || null')
    // description (live-kolumnen) är INTERNA anteckningar (notes) —
    // portalen ska ALDRIG alisera dit.
    expect(writer).toContain('description: notes || null')
    expect(route).not.toContain('description:description')
  })
})
