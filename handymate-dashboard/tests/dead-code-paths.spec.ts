import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

test('fakturabetalning hittar projekt via invoice.project_id', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'lib', 'project-stages', 'automation-engine.ts'),
    'utf8',
  )
  const finder = source.slice(source.indexOf('export async function findProjectForEntity'))
  const invoiceBranch = finder.slice(
    finder.indexOf('if (opts.invoiceId)'),
    finder.indexOf("let query = supabase.from('project')"),
  )

  expect(invoiceBranch).toContain(".from('invoice')")
  expect(invoiceBranch).toContain(".select('project_id')")
  expect(invoiceBranch).toContain(".eq('business_id', opts.businessId)")
  expect(invoiceBranch).toContain(".eq('invoice_id', opts.invoiceId)")
  expect(finder).not.toMatch(/from\('project'\)[\s\S]{0,250}?eq\('invoice_id'/)
})

test('complete-job sätter inte project_completed=true vid Supabase-fel', () => {
  const route = fs.readFileSync(
    path.join(ROOT, 'app', 'api', 'booking', 'complete-job', 'route.ts'),
    'utf8',
  )
  const command = fs.readFileSync(
    path.join(ROOT, 'lib', 'projects', 'complete-project.ts'),
    'utf8',
  )

  const errorCheck = command.indexOf('if (transition.error)')
  const effectCall = command.indexOf('await runCompletionEffects(')
  expect(errorCheck).toBeGreaterThan(-1)
  expect(errorCheck).toBeLessThan(effectCall)
  expect(route).toContain('project_completed: closeoutResult?.completed ?? false')
  expect(route).not.toContain('projectCompleted = true')
})
