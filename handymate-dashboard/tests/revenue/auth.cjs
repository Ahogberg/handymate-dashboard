const assert = require('node:assert/strict'),
  { load } = require('./harness.cjs')
async function main() {
  let user = null,
    error = null,
    business = null,
    getUserCalls = 0
  const api = load('lib/revenue/auth.ts', {
    'next/headers': { cookies: () => ({}) },
    '@supabase/auth-helpers-nextjs': {
      createRouteHandlerClient: () => ({
        auth: {
          getUser: async () => {
            getUserCalls++
            return { data: { user }, error }
          },
          getSession: () => {
            throw Error('Unverified session must never authorize')
          },
        },
      }),
    },
    '@/lib/admin-auth': { getAdminSupabase: () => ({}) },
    '@/lib/auth': { getAuthenticatedBusiness: async () => business },
  })
  const req = new Request('https://unit.test')
  assert.equal(await api.requireRevenue(req), null)
  user = {
    id: 'u',
    email: 'external@example.test',
    email_confirmed_at: '2026-01-01',
    user_metadata: { revenue_role: 'manager' },
  }
  assert.equal(await api.requireRevenue(req), null)
  user.app_metadata = { revenue_role: 'seller' }
  let ctx = await api.requireRevenue(req)
  assert.equal(ctx.manager, false)
  assert.equal(ctx.email, user.email)
  business = { _impersonation: { admin_user_id: 'u' } }
  assert.equal(await api.requireRevenue(req), null)
  business = null
  error = { message: 'Revoked user' }
  assert.equal(await api.requireRevenue(req), null)
  assert.equal(getUserCalls, 5)
  console.log(
    'PASS verified identity, no session trust, no user_metadata elevation, seller role, impersonation and revoked-user denial',
  )
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
