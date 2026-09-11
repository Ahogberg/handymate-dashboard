import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createProjectApprovalReadGuard, loadProjectApprovalPage } from '../lib/projects/load-project-approvals'
import { areValidProjectReceiptRows, projectReceiptPresentation, resolveProjectReceiptRead } from '../lib/projects/project-receipt-presentation'

const row = (state: string, outcome: string = 'success') => ({ id: `id-${state}`, status: 'approved', resolved_at: '2026-09-11T10:00:00Z', payload: { execution_result: { outcome, executed_at: '2026-09-11T10:01:00Z', receipt: { state, text: `Original ${state}` } } } })

test('canonical receipt states remain distinct and only proven completion is green', () => {
  const cases = [['saved', 'Sparat', true], ['sent', 'Accepterat av sändtjänsten', true], ['queued', 'Köat', false], ['partial', 'Delvis utfört', false], ['failed', 'Misslyckat', false], ['needs_action', 'Behöver hanteras', false], ['rejected', 'Avvisat', false]] as const
  for (const [state, statusLabel, complete] of cases) expect(projectReceiptPresentation(row(state))).toMatchObject({ state, text: `Original ${state}`, statusLabel, complete, recordedAtLabel: 'Körning registrerad' })
  expect(projectReceiptPresentation(row('acknowledged'))).toMatchObject({ statusLabel: 'Noterat', complete: false })
  expect(projectReceiptPresentation(row('saved', 'retrying'))).toMatchObject({ statusLabel: 'Utfall ej bekräftat', text: 'Tidigare sparad kvittens: Original saved', complete: false })
  expect(projectReceiptPresentation(row('saved', 'failed'))).toMatchObject({ statusLabel: 'Utfall ej bekräftat', text: 'Tidigare sparad kvittens: Original saved', complete: false })
  expect(projectReceiptPresentation(row('sent', 'skipped'))).toMatchObject({ statusLabel: 'Utfall ej bekräftat', text: 'Tidigare sparad kvittens: Original sent', complete: false })
  expect(projectReceiptPresentation({ id: 'a', status: 'approved', resolved_at: '2026-09-11T10:00:00Z', payload: { execution_result: { receipt: { state: 'saved', text: 'old' } } } })).toMatchObject({ statusLabel: 'Utfall ej bekräftat', text: 'Tidigare sparad kvittens: old', complete: false, recordedAtLabel: 'Beslut registrerat' })
  expect(projectReceiptPresentation({ id: '', status: 'approved', payload: {} })).toBeNull()
  expect(projectReceiptPresentation({ id: 'a', status: 'approved', payload: { execution_result: { receipt: { state: 'made-up', text: 'x' } } } })).toBeNull()
})

test('resolved receipt rows reject null and missing identities before presentation', () => {
  expect(areValidProjectReceiptRows([null])).toBe(false)
  expect(areValidProjectReceiptRows([{ payload: {} }])).toBe(false)
  expect(areValidProjectReceiptRows([{ id: 'ok', payload: {} }])).toBe(true)
})

test('resolved loader retains project/status/pagination and malformed responses fail', async () => {
  let requested = ''
  const page = await loadProjectApprovalPage('p / å', undefined, 50, new AbortController().signal, async input => { requested = String(input); return new Response(JSON.stringify({ approvals: [], next_offset: 100 })) }, 'resolved')
  expect(requested).toContain('status=resolved')
  expect(requested).toContain('project_id=p+%2F+%C3%A5')
  expect(page.nextOffset).toBe(100)
  await expect(loadProjectApprovalPage('p', undefined, 0, new AbortController().signal, async () => new Response(JSON.stringify({ approvals: null, next_offset: null })), 'resolved')).rejects.toThrow('approval-read-malformed')
})

test('actual async receipt boundary drops stale project/company result and propagates read errors', async () => {
  const guard = createProjectApprovalReadGuard()
  const sequence = guard.begin()
  let release!: (value: string) => void
  const pending = resolveProjectReceiptRead({ sequence, isCurrent: guard.isCurrent, load: () => new Promise(resolve => { release = resolve }) })
  guard.invalidate(); release('old')
  await expect(pending).resolves.toEqual({ stale: true })
  await expect(resolveProjectReceiptRead({ sequence: guard.begin(), isCurrent: guard.isCurrent, load: async () => { throw new Error('read failed') } })).rejects.toThrow('read failed')
})

test('UI is independently mounted, paginates empty receipt pages, deduplicates and refreshes after decisions', () => {
  const todo = readFileSync('components/projects/ProjectTodoBlock.tsx', 'utf8')
  const ui = readFileSync('components/projects/ProjectReceiptsBlock.tsx', 'utf8')
  expect(todo).toContain('</div>\n    <div className="mt-5">\n      <ProjectReceiptsBlock')
  expect(ui).toContain('Projektets kvitton')
  expect(ui).toContain("key={`${business.business_id}:${projectId}`}")
  expect(ui).toContain('new Map(combined.map(row => [row.id, row]))')
  expect(ui).toContain('receipts.length === 0 && nextOffset !== null')
  expect(ui).toContain('APPROVAL_QUEUE_CHANGED')
  expect(ui).not.toContain('Godkänn')
})
