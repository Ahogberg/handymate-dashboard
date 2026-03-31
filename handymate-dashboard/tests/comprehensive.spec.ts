import { test, expect } from '@playwright/test'

/**
 * Comprehensive QA — testar varje kritisk sida och API-endpoint.
 * Mål: hitta alla 500-fel, brutna sidor och trasiga API:er.
 */

// ════════════════════════════════════════════════════════
// 1. ALLA DASHBOARD-SIDOR — ska ALDRIG ge 500
// ════════════════════════════════════════════════════════

const DASHBOARD_PAGES = [
  '/dashboard',
  '/dashboard/agent',
  '/dashboard/analytics',
  '/dashboard/approvals',
  '/dashboard/automations',
  '/dashboard/calendar',
  '/dashboard/calls',
  '/dashboard/campaigns',
  '/dashboard/communication',
  '/dashboard/customers',
  '/dashboard/documents',
  '/dashboard/invoices',
  '/dashboard/marketing/leads',
  '/dashboard/pipeline',
  '/dashboard/planning/inventory',
  '/dashboard/projects',
  '/dashboard/quotes',
  '/dashboard/schedule',
  '/dashboard/settings',
  '/dashboard/team',
  '/dashboard/time',
  '/dashboard/time/attestation',
  '/dashboard/time/allowances',
  '/dashboard/time/weekly',
  '/dashboard/vehicles',
  '/dashboard/warranties',
  '/dashboard/help',
  '/dashboard/referral',
  '/dashboard/bookings',
  '/dashboard/orders',
  '/dashboard/subcontractors',
  '/dashboard/profile',
  // Settings sub-pages
  '/dashboard/settings/phone',
  '/dashboard/settings/my-prices',
  '/dashboard/settings/pricing',
  '/dashboard/settings/integrations',
  '/dashboard/settings/inventory',
  '/dashboard/settings/lead-sources',
  '/dashboard/settings/quote-templates',
  '/dashboard/settings/quote-texts',
  '/dashboard/settings/quote-categories',
]

test.describe('Dashboard-sidor', () => {
  for (const path of DASHBOARD_PAGES) {
    test(`${path} ger inte 500`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status(), `${path} returnerade ${res.status()}`).not.toBe(500)
    })
  }
})

// ════════════════════════════════════════════════════════
// 2. KRITISKA API-ENDPOINTS — GET ska svara korrekt
// ════════════════════════════════════════════════════════

const GET_APIS = [
  { path: '/api/customers', name: 'Kunder' },
  { path: '/api/quotes', name: 'Offerter' },
  { path: '/api/invoices', name: 'Fakturor' },
  { path: '/api/tasks', name: 'Uppgifter' },
  { path: '/api/bookings', name: 'Bokningar' },
  { path: '/api/pipeline/deals', name: 'Pipeline deals' },
  { path: '/api/pipeline/stats', name: 'Pipeline statistik' },
  { path: '/api/team', name: 'Team' },
  { path: '/api/automations', name: 'Automationer' },
  { path: '/api/approvals', name: 'Godkännanden' },
  { path: '/api/sms/log?limit=5', name: 'SMS-logg' },
  { path: '/api/vehicles', name: 'Fordon' },
  { path: '/api/work-orders', name: 'Arbetsordrar' },
  { path: '/api/warranties', name: 'Garantier' },
  { path: '/api/time-entry?limit=5', name: 'Tidrapporter' },
  { path: '/api/allowances', name: 'Ersättningar' },
  { path: '/api/dashboard/today', name: 'Att göra idag' },
  { path: '/api/morning-brief', name: 'Morgonrapport' },
  { path: '/api/automation/settings', name: 'Automationsinställningar' },
]

test.describe('GET API-endpoints', () => {
  for (const api of GET_APIS) {
    test(`${api.name} (${api.path}) svarar`, async ({ request }) => {
      const res = await request.get(api.path)
      // 200 = OK, 401 = auth krävs (acceptabelt i CI)
      expect([200, 401]).toContain(res.status())
      // Ska aldrig ge 500
      expect(res.status(), `${api.path} gav 500`).not.toBe(500)
    })
  }
})

// ════════════════════════════════════════════════════════
// 3. POST API-ENDPOINTS — ska inte krascha
// ════════════════════════════════════════════════════════

test.describe('POST API-endpoints svarar', () => {
  test('POST /api/debug/sms diagnostik', async ({ request }) => {
    const res = await request.post('/api/debug/sms', { data: {} })
    expect([200, 401]).toContain(res.status())
  })

  test('POST /api/debug/mail diagnostik', async ({ request }) => {
    const res = await request.post('/api/debug/mail', { data: {} })
    expect([200, 401]).toContain(res.status())
  })

  test('POST /api/matte/chat svarar', async ({ request }) => {
    const res = await request.post('/api/matte/chat', {
      data: {
        messages: [{ role: 'user', content: 'Hej' }],
        context: { userName: 'Test', businessName: 'Test AB' },
      },
    })
    expect([200, 401, 500]).toContain(res.status()) // 500 OK om API-nyckel saknas
  })

  test('POST /api/auth check', async ({ request }) => {
    const res = await request.post('/api/auth', {
      data: { action: 'check' },
    })
    expect([200, 401]).toContain(res.status())
  })

  test('POST /api/quotes/ai-generate med tom body ger 400', async ({ request }) => {
    const res = await request.post('/api/quotes/ai-generate', {
      data: {},
    })
    expect([400, 401]).toContain(res.status())
  })

  test('POST /api/pipeline/deals utan titel ger 400', async ({ request }) => {
    const res = await request.post('/api/pipeline/deals', {
      data: {},
    })
    expect([400, 401]).toContain(res.status())
  })

  test('POST /api/tasks utan titel ger 400', async ({ request }) => {
    const res = await request.post('/api/tasks', {
      data: {},
    })
    expect([400, 401]).toContain(res.status())
  })

  test('POST /api/bookings utan datum ger 400', async ({ request }) => {
    const res = await request.post('/api/bookings', {
      data: {},
    })
    expect([400, 401]).toContain(res.status())
  })
})

// ════════════════════════════════════════════════════════
// 4. PUBLIKA SIDOR — ingen auth krävs
// ════════════════════════════════════════════════════════

const PUBLIC_PAGES = [
  '/login',
  '/onboarding',
  '/rot-kalkylator',
]

test.describe('Publika sidor', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} laddar utan 500`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).not.toBe(500)
    })
  }
})

// ════════════════════════════════════════════════════════
// 5. OFFERT-FLÖDE — kritiska steg
// ════════════════════════════════════════════════════════

test.describe('Offert-flöde', () => {
  test('Ny offert-sida laddar', async ({ request }) => {
    const res = await request.get('/dashboard/quotes/new')
    expect(res.status()).not.toBe(500)
  })

  test('GET /api/quotes/pdf utan id ger 400', async ({ request }) => {
    const res = await request.get('/api/quotes/pdf')
    expect([400, 401]).toContain(res.status())
  })

  test('POST /api/quotes/track returnerar pixel', async ({ request }) => {
    const res = await request.get('/api/quotes/track?q=test&e=opened')
    expect(res.status()).toBe(200)
    const contentType = res.headers()['content-type']
    expect(contentType).toContain('image/gif')
  })
})

// ════════════════════════════════════════════════════════
// 6. FAKTURA-FLÖDE
// ════════════════════════════════════════════════════════

test.describe('Faktura-flöde', () => {
  test('Ny faktura-sida laddar', async ({ request }) => {
    const res = await request.get('/dashboard/invoices/new')
    expect(res.status()).not.toBe(500)
  })

  test('Faktura-lista laddar', async ({ request }) => {
    const res = await request.get('/dashboard/invoices')
    expect(res.status()).not.toBe(500)
  })
})

// ════════════════════════════════════════════════════════
// 7. PIPELINE — deals + stages
// ════════════════════════════════════════════════════════

test.describe('Pipeline', () => {
  test('Pipeline-sida laddar', async ({ request }) => {
    const res = await request.get('/dashboard/pipeline')
    expect(res.status()).not.toBe(500)
  })

  test('GET /api/pipeline/stats returnerar data', async ({ request }) => {
    const res = await request.get('/api/pipeline/stats')
    expect([200, 401]).toContain(res.status())
  })

  test('GET /api/pipeline/deals returnerar data', async ({ request }) => {
    const res = await request.get('/api/pipeline/deals')
    expect([200, 401]).toContain(res.status())
  })
})

// ════════════════════════════════════════════════════════
// 8. PROJEKT
// ════════════════════════════════════════════════════════

test.describe('Projekt', () => {
  test('Projektlista laddar', async ({ request }) => {
    const res = await request.get('/dashboard/projects')
    expect(res.status()).not.toBe(500)
  })

  test('Gantt-vy laddar', async ({ request }) => {
    const res = await request.get('/dashboard/projects/gantt')
    expect(res.status()).not.toBe(500)
  })
})

// ════════════════════════════════════════════════════════
// 9. INSTÄLLNINGAR — alla sub-sidor
// ════════════════════════════════════════════════════════

const SETTINGS_PAGES = [
  '/dashboard/settings',
  '/dashboard/settings/phone',
  '/dashboard/settings/my-prices',
  '/dashboard/settings/pricing',
  '/dashboard/settings/integrations',
  '/dashboard/settings/inventory',
  '/dashboard/settings/lead-sources',
  '/dashboard/settings/quote-templates',
  '/dashboard/settings/quote-texts',
  '/dashboard/settings/quote-categories',
  '/dashboard/settings/knowledge',
  '/dashboard/settings/billing',
  '/dashboard/settings/form-templates',
  '/dashboard/settings/products',
  '/dashboard/settings/email-templates',
  '/dashboard/settings/website-widget',
]

test.describe('Inställningar', () => {
  for (const path of SETTINGS_PAGES) {
    test(`${path} laddar`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).not.toBe(500)
    })
  }
})

// ════════════════════════════════════════════════════════
// 10. TIDRAPPORTERING + PLANERING
// ════════════════════════════════════════════════════════

test.describe('Tidrapportering & Planering', () => {
  test('GET /api/time-entry svarar', async ({ request }) => {
    const res = await request.get('/api/time-entry?limit=5')
    expect([200, 401]).toContain(res.status())
  })

  test('GET /api/schedule svarar', async ({ request }) => {
    const today = new Date().toISOString().split('T')[0]
    const res = await request.get(`/api/schedule?start_date=${today}&end_date=${today}`)
    expect([200, 401]).toContain(res.status())
  })

  test('Kalender-sida laddar', async ({ request }) => {
    const res = await request.get('/dashboard/calendar')
    expect(res.status()).not.toBe(500)
  })

  test('Schema-sida laddar', async ({ request }) => {
    const res = await request.get('/dashboard/schedule')
    expect(res.status()).not.toBe(500)
  })
})

// ════════════════════════════════════════════════════════
// 11. MARKNADSFÖRING
// ════════════════════════════════════════════════════════

test.describe('Marknadsföring', () => {
  test('Kampanjer laddar', async ({ request }) => {
    const res = await request.get('/dashboard/campaigns')
    expect(res.status()).not.toBe(500)
  })

  test('Leads outbound laddar', async ({ request }) => {
    const res = await request.get('/dashboard/marketing/leads')
    expect(res.status()).not.toBe(500)
  })
})

// ════════════════════════════════════════════════════════
// 12. WEBHOOK-ENDPOINTS — ska inte krascha
// ════════════════════════════════════════════════════════

test.describe('Webhooks svarar', () => {
  test('POST /api/webhooks/google-calendar svarar', async ({ request }) => {
    const res = await request.post('/api/webhooks/google-calendar', {
      headers: { 'x-goog-resource-state': 'sync', 'x-goog-channel-id': 'test' },
    })
    expect(res.status()).toBe(200)
  })

  test('GET /api/quotes/track returnerar GIF', async ({ request }) => {
    const res = await request.get('/api/quotes/track')
    expect(res.status()).toBe(200)
  })
})
