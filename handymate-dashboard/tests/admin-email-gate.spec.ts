/**
 * Facit för adminbehörighetens grind (lib/auth/admin-email.ts).
 *
 * Grinden är ren logik utan I/O — körs utan live auth och utan databas.
 * Den låg tidigare i två kopior (lib/admin-auth.ts och lib/auth/superadmin.ts);
 * det här provet är skälet till att den bara får finnas på ett ställe.
 *
 * Körs: npx playwright test tests/admin-email-gate.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { isAdminEmail } from '../lib/auth/admin-email'
import { isSuperAdmin } from '../lib/auth/superadmin'

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS

test.afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS
})

test('@handymate.se släpps in, allt annat stängs ute', async () => {
  delete process.env.ADMIN_EMAILS

  expect(isAdminEmail('andreas@handymate.se')).toBe(true)
  expect(isAdminEmail('christoffer@handymate.se')).toBe(true)
  // Versaler och blanksteg får inte avgöra behörighet
  expect(isAdminEmail('  Andreas@Handymate.SE  ')).toBe(true)

  // Utan ADMIN_EMAILS är domänen den enda vägen in
  expect(isAdminEmail('andreashogberg93@gmail.com')).toBe(false)
  expect(isAdminEmail('kund@beeservice.se')).toBe(false)
  expect(isAdminEmail('')).toBe(false)
  expect(isAdminEmail(null)).toBe(false)
  expect(isAdminEmail(undefined)).toBe(false)
})

test('domänen måste avsluta adressen — inte bara finnas i den', async () => {
  delete process.env.ADMIN_EMAILS

  // De här är den farliga formen: en angripare som äger en egen domän kan
  // registrera vilken lokaldel som helst. Ingen av dem får släppas in.
  expect(isAdminEmail('angripare@handymate.se.example.com')).toBe(false)
  expect(isAdminEmail('andreas@handymate.se.co')).toBe(false)
  expect(isAdminEmail('handymate.se@gmail.com')).toBe(false)
  expect(isAdminEmail('andreas@nothandymate.se')).toBe(false)
})

test('ADMIN_EMAILS är en exakt lista, inte ett mönster', async () => {
  process.env.ADMIN_EMAILS = 'andreashogberg93@gmail.com, Reserv@Example.COM'

  expect(isAdminEmail('andreashogberg93@gmail.com')).toBe(true)
  // Listan normaliseras på båda sidor
  expect(isAdminEmail('RESERV@example.com')).toBe(true)

  // Ingen delsträngsmatchning
  expect(isAdminEmail('andreashogberg93@gmail.com.evil.com')).toBe(false)
  expect(isAdminEmail('hogberg93@gmail.com')).toBe(false)
  expect(isAdminEmail('annan@example.com')).toBe(false)
})

test('ADMIN_EMAILS läses vid anrop, inte vid modulladdning', async () => {
  // Kravet som gör punkt 3 i tasks/efter-lansering.md ofarlig att genomföra:
  // när variabeln tas bort ur Vercel ska grinden stänga utan ny deploy.
  process.env.ADMIN_EMAILS = 'tillfallig@example.com'
  expect(isAdminEmail('tillfallig@example.com')).toBe(true)

  delete process.env.ADMIN_EMAILS
  expect(isAdminEmail('tillfallig@example.com')).toBe(false)
})

test('isSuperAdmin använder samma grind, med app_metadata som extra väg', async () => {
  delete process.env.ADMIN_EMAILS

  const makeUser = (email: string | null, appMetadata: Record<string, unknown> = {}) =>
    ({ id: 'u1', email, app_metadata: appMetadata, user_metadata: {}, aud: 'authenticated', created_at: '' }) as any

  expect(isSuperAdmin(makeUser('andreas@handymate.se'))).toBe(true)
  expect(isSuperAdmin(makeUser('kund@beeservice.se'))).toBe(false)
  expect(isSuperAdmin(makeUser('angripare@handymate.se.example.com'))).toBe(false)
  expect(isSuperAdmin(null)).toBe(false)

  // app_metadata kan bara sättas via service_role — den vägen står kvar
  expect(isSuperAdmin(makeUser('kund@beeservice.se', { is_superadmin: true }))).toBe(true)
})
