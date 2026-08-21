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

  test('reply-rutten sparar direkt i thread_message och kontrollerar felet (ingen tyst fire-and-forget), ingen Claude-runda', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/reply/route.ts'),
      'utf8',
    )
    // saveThreadMessage() sväljer DB-fel internt — fel för en "sluten loop"
    // där bekräftad leverans är hela poängen. Rutten ska göra inserten
    // direkt och faktiskt kontrollera felet istället. (En kommentar som
    // FÖRKLARAR varför saveThreadMessage medvetet inte används är okej —
    // det är importen som inte får finnas, dvs funktionen får inte anropas.)
    expect(route).not.toMatch(/import\s*{[^}]*saveThreadMessage[^}]*}/)
    expect(route).toContain("from('thread_message')")
    expect(route).toMatch(/error:\s*msgErr/)
    expect(route).toMatch(/if\s*\(\s*msgErr\s*\)/)
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
