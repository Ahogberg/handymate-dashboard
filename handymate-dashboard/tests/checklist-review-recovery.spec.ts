import { test, expect } from '@playwright/test'
import { prepareApprovalReview } from '../lib/approvals/prepare-review'
import { approvalErrorText } from '../lib/approvals/error-presentation'

const approval = { id: 'a', approval_type: 'checklist_forslag', payload: { project_id: 'p', template_name: 'Elsäkerhet', template_items: [{ id: 'i', text: 'Kontrollera kabel', required: true }] } }
function database(existing: any = null, fail = false, project = true) {
  return { from(table: string) {
    const filters: any[] = []
    const q: any = { select() { return q }, eq(k: string, v: string) { filters.push([k, v]); return q }, maybeSingle() {
      expect(filters).toContainEqual(['business_id', 'b'])
      return Promise.resolve(table === 'project' ? { data: project ? { project_id: 'p', name: 'Testprojekt' } : null, error: null } : { data: existing, error: fail ? { message: 'read failed' } : null })
    } }; return q
  } } as any
}
test('new checklist review lists every point and states that points start unchecked', async () => {
  const r = await prepareApprovalReview(database(), 'b', approval, { action: 'retry' })
  expect(r?.review.confirmLabel).toBe('Skapa checklistan')
  expect(r?.review.effect).toContain('ej utförda')
  expect(r?.review.details).toContainEqual({ label: 'Punkt 1 (obligatorisk)', text: 'Kontrollera kabel' })
})
test('lost response recovery confirms stored checklist without promising reset or duplicate', async () => {
  const existing = { id: 'stable', project_id: 'p', name: 'Sparad kontroll', items: [{ checked: true }], status: 'completed' }
  const r = await prepareApprovalReview(database(existing), 'b', approval, { action: 'retry' })
  expect(r?.review.confirmLabel).toBe('Bekräfta sparad checklista')
  expect(r?.snapshot.checklist).toEqual(existing)
  expect(r?.review.effect).toContain('utan att skapa en dubblett eller återställa')
})
test('unverified project, changed checklist project and failed read block confirmation', async () => {
  for (const db of [database(null, false, false), database({ project_id: 'foreign' }), database(null, true)]) {
    const r = await prepareApprovalReview(db, 'b', approval, { action: 'retry' })
    expect(r?.review.confirmLabel).toBeNull()
    expect(r?.review.blockedReason).toBeTruthy()
  }
})
test('technical storage errors become actionable text while normal errors keep their meaning', () => {
  const text = approvalErrorText('null value in column "order_id" of relation "project_checklist" violates not-null constraint')
  expect(text).toContain('projektkopplingen')
  expect(text).not.toContain('order_id')
  expect(approvalErrorText('Kundens nummer har ändrats')).toBe('Kundens nummer har ändrats')
})
