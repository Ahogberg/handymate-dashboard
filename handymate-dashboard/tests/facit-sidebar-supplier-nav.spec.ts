import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const SIDEBAR = fs.readFileSync(
  path.join(__dirname, '..', 'components/Sidebar.tsx'),
  'utf8',
)

test.describe('Sidebar — leverantörsfakturor och underentreprenörer', () => {
  test('Leverantörsfakturor-posten finns i jobs-gruppen', () => {
    const jobsStart = SIDEBAR.indexOf("key: 'jobs'")
    const jobsEnd = SIDEBAR.indexOf('],', jobsStart)
    const block = SIDEBAR.slice(jobsStart, jobsEnd)
    expect(block).toContain("href: '/dashboard/supplier-invoices'")
  })

  test('Underentreprenörer-posten finns i jobs-gruppen med featureGate subcontractors', () => {
    const jobsStart = SIDEBAR.indexOf("key: 'jobs'")
    const jobsEnd = SIDEBAR.indexOf('],', jobsStart)
    const block = SIDEBAR.slice(jobsStart, jobsEnd)
    expect(block).toMatch(/href: '\/dashboard\/subcontractors'[\s\S]{0,40}featureGate: 'subcontractors'/)
  })

  test('/dashboard/supplier-invoices är dold för anställda (HIDDEN_CHILDREN_FOR_EMPLOYEE)', () => {
    const hiddenIdx = SIDEBAR.indexOf('HIDDEN_CHILDREN_FOR_EMPLOYEE = new Set([')
    const hiddenEnd = SIDEBAR.indexOf('])', hiddenIdx)
    const block = SIDEBAR.slice(hiddenIdx, hiddenEnd)
    expect(block).toContain("'/dashboard/supplier-invoices'")
  })

  test('/dashboard/subcontractors är INTE i HIDDEN_CHILDREN_FOR_EMPLOYEE (planbaserad grind räcker)', () => {
    const hiddenIdx = SIDEBAR.indexOf('HIDDEN_CHILDREN_FOR_EMPLOYEE = new Set([')
    const hiddenEnd = SIDEBAR.indexOf('])', hiddenIdx)
    const block = SIDEBAR.slice(hiddenIdx, hiddenEnd)
    expect(block).not.toContain("'/dashboard/subcontractors'")
  })
})
