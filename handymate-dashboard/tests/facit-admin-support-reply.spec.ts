import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('Admin support-svar — sluten loop till samma chattråd', () => {
  test('GET-rutten kräver isAdmin', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/route.ts'),
      'utf8',
    )
    expect(route).toContain('isAdmin')
  })

  test('reply-rutten använder saveThreadMessage, ingen Claude-runda', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/reply/route.ts'),
      'utf8',
    )
    expect(route).toContain('saveThreadMessage')
    expect(route).not.toMatch(/callClaude|anthropic\.com\/v1\/messages/)
  })

  test('reply-rutten sätter agent till support', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/reply/route.ts'),
      'utf8',
    )
    expect(route).toMatch(/agent:\s*'support'/)
  })

  test('reply-rutten flyttar ärendet till in_progress', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/reply/route.ts'),
      'utf8',
    )
    expect(route).toContain("'in_progress'")
  })

  test('resolve-rutten sätter resolved_at och resolved_by', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/resolve/route.ts'),
      'utf8',
    )
    expect(route).toContain('resolved_at')
    expect(route).toContain('resolved_by')
  })
})
