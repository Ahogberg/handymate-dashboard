/**
 * Frånkoppling av Google återkallar behörigheten hos Google (2026-09-03).
 *
 *   npx playwright test tests/google-revoke.spec.ts --project=chromium
 *
 * Frånkopplingen raderade kopplingsraden hos oss men lämnade behörigheten kvar
 * i användarens Google-konto. Integritetspolicyn (handymate.se/integritet §7)
 * utlovar nu att åtkomsten upphör i båda ändar inför OAuth-verifieringen — och
 * ett löfte i en publicerad policy är något Google kan granska mot koden.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { revokeGoogleAccess } from '../lib/google-calendar'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

/** Fejkad fetch som bokför vad som skickades. */
function fejk(status: number) {
  const anrop: Array<{ url: string; body: string }> = []
  const impl = (async (url: string, init?: RequestInit) => {
    anrop.push({ url: String(url), body: String(init?.body ?? '') })
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => '',
    }
  }) as unknown as typeof fetch
  return { impl, anrop }
}

test.describe('revokeGoogleAccess', () => {
  const original = globalThis.fetch
  test.afterEach(() => { globalThis.fetch = original })

  test('postar token till Googles revoke-endpoint', async () => {
    const { impl, anrop } = fejk(200)
    globalThis.fetch = impl
    const r = await revokeGoogleAccess('1//refresh-token-abc')
    expect(r.ok).toBe(true)
    expect(anrop).toHaveLength(1)
    expect(anrop[0].url).toBe('https://oauth2.googleapis.com/revoke')
    expect(anrop[0].body).toContain('token=1%2F%2Frefresh-token-abc')
  })

  test('400 räknas som ok — token var redan ogiltig, slutläget är det vi ville ha', async () => {
    const { impl } = fejk(400)
    globalThis.fetch = impl
    expect((await revokeGoogleAccess('x')).ok).toBe(true)
  })

  test('annat fel returneras men kastar aldrig', async () => {
    const { impl } = fejk(500)
    globalThis.fetch = impl
    const r = await revokeGoogleAccess('x')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('500')
  })

  test('nätverksfel kastar inte heller — frånkopplingen får aldrig falla på det', async () => {
    globalThis.fetch = (async () => { throw new Error('nere') }) as unknown as typeof fetch
    const r = await revokeGoogleAccess('x')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('nere')
  })

  test('tom token rör aldrig nätverket', async () => {
    let anropad = false
    globalThis.fetch = (async () => { anropad = true; return { ok: true, status: 200, text: async () => '' } }) as unknown as typeof fetch
    for (const t of ['', '   ']) {
      const r = await revokeGoogleAccess(t)
      expect(r.ok).toBe(false)
    }
    expect(anropad).toBe(false)
  })
})

test.describe('disconnect-rutten — ordningen är hela poängen', () => {
  const src = kod('app/api/google/disconnect/route.ts')

  test('token läses FÖRE raderingen — annars finns inget kvar att återkalla', () => {
    const las = src.indexOf("select('refresh_token, access_token')")
    const raderar = src.indexOf('.delete()')
    expect(las, 'token måste läsas').toBeGreaterThan(-1)
    expect(raderar, 'raden måste raderas').toBeGreaterThan(-1)
    expect(las, 'läsningen måste komma före raderingen').toBeLessThan(raderar)
  })

  test('refresh-token föredras framför access-token', () => {
    expect(src).toContain('koppling?.refresh_token || koppling?.access_token')
  })

  test('återkallningen sker efter raderingen och blockerar den aldrig', () => {
    const raderar = src.indexOf('.delete()')
    const revoke = src.indexOf('revokeGoogleAccess(')
    expect(revoke).toBeGreaterThan(raderar)
    // Ett misslyckande loggas men fäller inte svaret
    expect(src).toContain('console.warn')
    expect(src).toContain('success: true')
  })

  test('svaret säger sanningen om vad som faktiskt hände', () => {
    // En användare som får "återkallad" ska ha fått behörigheten återkallad
    expect(src).toContain('revoked,')
    expect(src).toContain('frånkopplad och behörigheten återkallad')
    expect(src).toContain("message: revoked")
  })

  test('rutten är fortfarande auth- och användargrindad', () => {
    expect(src).toContain('getAuthenticatedBusiness(request)')
    expect(src).toContain('getCurrentUser(request, business.business_id)')
    expect(src).toContain('status: 401')
  })
})
