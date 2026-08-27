/**
 * Launch Promise Gauntlet — kärnskarvarna som piloterna faktiskt använder.
 *
 * Körning (hemligheter sätts i processen, aldrig i git):
 *   LAUNCH_TEST_A_EMAIL / PASSWORD / BUSINESS_ID
 *   LAUNCH_TEST_B_BUSINESS_ID
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   npx playwright test --project=launch-promise --workers=1
 *
 * Test A autentiseras genom appens RIKTIGA /api/auth. Service role används
 * bara för disponibla fixtures, DB-facit och exakt cleanup. Alla produkt-
 * handlingar går via de riktiga HTTP-rutterna och samma cookie som UI:t.
 */
import { expect, test, type APIResponse } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type Json = Record<string, any>

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Saknar ${name} för Launch Promise Gauntlet`)
  return value
}

function minimalPdf(marker: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
      `2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n` +
      `% ${marker}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    'utf8',
  )
}

async function expectJsonOk(response: APIResponse, label: string): Promise<Json> {
  const body = await response.json().catch(() => ({}))
  expect(response.ok(), `${label}: HTTP ${response.status()} ${JSON.stringify(body)}`).toBeTruthy()
  return body as Json
}

test('kund → affär → dokument → projekt → dokument → tid, med fel-tenant och felvägar', async ({ page }) => {
  const baseUrl = process.env.BASE_URL || 'https://app.handymate.se'
  const supabaseUrl = required('SUPABASE_URL')
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')
  const email = required('LAUNCH_TEST_A_EMAIL')
  const password = required('LAUNCH_TEST_A_PASSWORD')
  const businessA = required('LAUNCH_TEST_A_BUSINESS_ID')
  const businessB = required('LAUNCH_TEST_B_BUSINESS_ID')
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const run = `lpg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const phoneTail = Date.now().toString().slice(-7)
  const phoneA = `+4670${phoneTail}`
  const phoneB = `+4671${phoneTail}`
  const ids: Record<string, string | null> = {
    customerA: null,
    dealA: null,
    dealDocA: null,
    projectA: null,
    projectDocA: null,
    timeA: null,
    stageA: null,
    customerB: `${run}_customer_b`,
    dealB: `${run}_deal_b`,
    projectB: `${run}_project_b`,
    stageB: null,
  }
  const createdStages: string[] = []
  const storagePaths: { bucket: string; path: string }[] = []

  const ensureStage = async (businessId: string, suffix: string) => {
    const existing = await service
      .from('pipeline_stage')
      .select('id')
      .eq('business_id', businessId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) return existing.data.id as string
    const id = `${run}_stage_${suffix}`
    const inserted = await service.from('pipeline_stage').insert({
      id,
      business_id: businessId,
      name: 'Nytt',
      slug: `${run}_new_${suffix}`,
      sort_order: 0,
      is_system: false,
    })
    if (inserted.error) throw inserted.error
    createdStages.push(id)
    return id
  }

  const cleanup = async () => {
    // Vissa producenter fortsätter avsiktligt efter API-svaret. Ge dem en
    // kort chans att materialisera sina rader innan den exakta städningen.
    await new Promise((resolve) => setTimeout(resolve, 750))

    for (const item of storagePaths) {
      const removed = await service.storage.from(item.bucket).remove([item.path])
      if (removed.error) throw removed.error
    }

    // Fire-and-forget-producenter kan hinna skapa projektkort efter HTTP-
    // svaret. Ta bara kort vars payload uttryckligen pekar på testprojektet.
    if (ids.projectA) {
      const approvals = await service
        .from('pending_approvals')
        .select('id, payload')
        .eq('business_id', businessA)
      const approvalIds = (approvals.data || [])
        .filter((row: any) => row.payload?.project_id === ids.projectA)
        .map((row: any) => row.id)
      if (approvalIds.length > 0) {
        const removed = await service.from('pending_approvals').delete().in('id', approvalIds)
        if (removed.error) throw removed.error
      }
    }

    const exactDelete = async (table: string, column: string, values: Array<string | null>) => {
      const clean = values.filter((value): value is string => !!value)
      if (clean.length === 0) return
      const removed = await service.from(table).delete().in(column, clean)
      if (removed.error) throw new Error(`Cleanup ${table}: ${removed.error.message}`)
    }

    await exactDelete('time_entry', 'time_entry_id', [ids.timeA])
    await exactDelete('project_document', 'id', [ids.projectDocA])
    await exactDelete('project_assignment', 'project_id', [ids.projectA, ids.projectB])
    await exactDelete('project_milestone', 'project_id', [ids.projectA, ids.projectB])
    await exactDelete('project', 'project_id', [ids.projectA, ids.projectB])
    await exactDelete('customer_document', 'id', [ids.dealDocA])
    await exactDelete('pipeline_activity', 'deal_id', [ids.dealA, ids.dealB])
    await exactDelete('deal', 'id', [ids.dealA, ids.dealB])
    await exactDelete('customer', 'customer_id', [ids.customerA, ids.customerB])
    await exactDelete('pipeline_stage', 'id', createdStages)

    // Cleanup är en del av facitet. Ett grönt prov får aldrig lämna data
    // och samtidigt hävda att det städade.
    for (const [table, column, values] of [
      ['time_entry', 'time_entry_id', [ids.timeA]],
      ['project', 'project_id', [ids.projectA, ids.projectB]],
      ['deal', 'id', [ids.dealA, ids.dealB]],
      ['customer', 'customer_id', [ids.customerA, ids.customerB]],
    ] as const) {
      const clean = values.filter((value): value is string => !!value)
      if (clean.length === 0) continue
      const remaining = await service.from(table).select(column).in(column, clean)
      if (remaining.error) throw remaining.error
      expect(remaining.data, `Cleanup lämnade rader i ${table}`).toHaveLength(0)
    }
  }

  try {
    await test.step('disponibla tenants + fixtures', async () => {
      expect(businessA).not.toBe(businessB)
      ids.stageA = await ensureStage(businessA, 'a')
      ids.stageB = await ensureStage(businessB, 'b')

      const customerB = await service.from('customer').insert({
        customer_id: ids.customerB,
        business_id: businessB,
        name: `${run} främmande kund`,
        phone_number: phoneB,
      })
      if (customerB.error) throw customerB.error

      const dealB = await service.from('deal').insert({
        id: ids.dealB,
        business_id: businessB,
        customer_id: ids.customerB,
        title: `${run} främmande affär`,
        stage_id: ids.stageB,
      })
      if (dealB.error) throw dealB.error

      const projectB = await service.from('project').insert({
        project_id: ids.projectB,
        business_id: businessB,
        customer_id: ids.customerB,
        name: `${run} främmande projekt`,
        status: 'planning',
      })
      if (projectB.error) throw projectB.error
    })

    await test.step('riktig lösenordsinloggning resolvar till tenant A', async () => {
      await page.goto(baseUrl)
      const login = await page.request.post(`${baseUrl}/api/auth`, {
        data: { action: 'login', data: { email, password } },
      })
      const loginBody = await expectJsonOk(login, 'POST /api/auth')
      expect(loginBody.businessId).toBe(businessA)

      const me = await page.request.get(`${baseUrl}/api/me`)
      const meBody = await expectJsonOk(me, 'GET /api/me')
      expect(meBody.business?.business_id).toBe(businessA)
    })

    await test.step('kund skapas och består vid återläsning', async () => {
      const created = await page.request.post(`${baseUrl}/api/customers`, {
        data: {
          name: `${run} kund`,
          phone_number: phoneA,
          email: `${run}@example.invalid`,
          address_line: 'Testgatan 1',
          customer_type: 'private',
        },
      })
      const body = await expectJsonOk(created, 'POST /api/customers')
      ids.customerA = body.customer.customer_id
      expect(body.customer.business_id).toBe(businessA)

      const listed = await page.request.get(`${baseUrl}/api/customers?search=${encodeURIComponent(run)}`)
      const listBody = await expectJsonOk(listed, 'GET /api/customers')
      expect(listBody.customers.some((row: any) => row.customer_id === ids.customerA)).toBe(true)
    })

    await test.step('främmande kund nekas före deal- och projektskrivning', async () => {
      const deal = await page.request.post(`${baseUrl}/api/pipeline/deals`, {
        data: { title: `${run} attack`, customer_id: ids.customerB },
      })
      expect(deal.status()).toBe(400)
      expect((await deal.json()).error).toContain('Kunden hittades inte')

      const project = await page.request.post(`${baseUrl}/api/projects`, {
        data: { name: `${run} attack`, customer_id: ids.customerB },
      })
      expect(project.status()).toBe(403)
      expect((await project.json()).error).toContain('Kunden tillhör inte företaget')
    })

    await test.step('affär behåller kundrelationen', async () => {
      const created = await page.request.post(`${baseUrl}/api/pipeline/deals`, {
        data: {
          title: `${run} köksjobb`,
          customer_id: ids.customerA,
          value: 12500,
          description: 'Launch Promise-bevis',
          priority: 'medium',
        },
      })
      const body = await expectJsonOk(created, 'POST /api/pipeline/deals')
      ids.dealA = body.deal.id
      expect(body.deal.customer_id).toBe(ids.customerA)
    })

    await test.step('affärsdokument lagras, listas och streamas inline', async () => {
      const pdf = minimalPdf(run)
      const uploaded = await page.request.post(`${baseUrl}/api/deals/${ids.dealA}/documents/upload`, {
        multipart: {
          file: { name: `${run}.pdf`, mimeType: 'application/pdf', buffer: pdf },
          category: 'drawing',
        },
      })
      const body = await expectJsonOk(uploaded, 'POST deal document')
      ids.dealDocA = body.document.id
      expect(body.document.deal_id).toBe(ids.dealA)
      expect(body.document.customer_id).toBe(ids.customerA)
      storagePaths.push({ bucket: 'customer-documents', path: body.document.file_url })

      const listed = await page.request.get(`${baseUrl}/api/deals/${ids.dealA}/documents`)
      const listBody = await expectJsonOk(listed, 'GET deal documents')
      expect(listBody.documents).toHaveLength(1)
      expect(listBody.documents[0].id).toBe(ids.dealDocA)

      const inline = await page.request.get(
        `${baseUrl}/api/deals/${ids.dealA}/documents/${ids.dealDocA}?view=inline`,
      )
      expect(inline.status()).toBe(200)
      expect(inline.headers()['content-type']).toContain('application/pdf')
      expect(inline.headers()['content-disposition']).toContain('inline')
      expect((await inline.body()).subarray(0, 5).toString()).toBe('%PDF-')

      const empty = await page.request.post(`${baseUrl}/api/deals/${ids.dealA}/documents/upload`, {
        multipart: {
          file: { name: 'tom.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) },
        },
      })
      expect(empty.status()).toBe(400)
      const afterEmpty = await page.request.get(`${baseUrl}/api/deals/${ids.dealA}/documents`)
      expect((await afterEmpty.json()).documents).toHaveLength(1)
    })

    await test.step('främmande affär är osynlig för listning, upload och dokumentläsning', async () => {
      const list = await page.request.get(`${baseUrl}/api/deals/${ids.dealB}/documents`)
      expect(list.status()).toBe(404)
      const upload = await page.request.post(`${baseUrl}/api/deals/${ids.dealB}/documents/upload`, {
        multipart: {
          file: { name: 'attack.pdf', mimeType: 'application/pdf', buffer: minimalPdf('attack') },
        },
      })
      expect(upload.status()).toBe(404)
    })

    await test.step('vunnet-likvärdig projektskapning från deal ärver kund och ansvarig', async () => {
      const owner = await service
        .from('business_users')
        .select('id')
        .eq('business_id', businessA)
        .eq('role', 'owner')
        .eq('is_active', true)
        .limit(1)
        .single()
      if (owner.error) throw owner.error

      const created = await page.request.post(`${baseUrl}/api/projects`, {
        data: {
          from_deal_id: ids.dealA,
          name: `${run} projekt`,
          assigned_business_user_id: owner.data.id,
        },
      })
      const body = await expectJsonOk(created, 'POST /api/projects from deal')
      ids.projectA = body.project.project_id
      expect(body.project.business_id).toBe(businessA)
      expect(body.project.customer_id).toBe(ids.customerA)
      expect(body.project.deal_id).toBe(ids.dealA)
      expect(body.assignment?.business_user_id).toBe(owner.data.id)

      const assignment = await service
        .from('project_assignment')
        .select('business_user_id')
        .eq('business_id', businessA)
        .eq('project_id', ids.projectA)
        .maybeSingle()
      expect(assignment.error).toBeNull()
      expect(assignment.data?.business_user_id).toBe(owner.data.id)
    })

    await test.step('projektdokument lagras och visas inline även efter omläsning', async () => {
      const pdf = minimalPdf(`${run} project`)
      const uploaded = await page.request.post(`${baseUrl}/api/projects/${ids.projectA}/documents`, {
        multipart: {
          file: { name: `${run}-projekt.pdf`, mimeType: 'application/pdf', buffer: pdf },
          category: 'drawing',
        },
      })
      const body = await expectJsonOk(uploaded, 'POST project document')
      ids.projectDocA = body.document.id
      storagePaths.push({ bucket: 'project-files', path: body.document.file_path })

      const listed = await page.request.get(`${baseUrl}/api/projects/${ids.projectA}/documents`)
      const listBody = await expectJsonOk(listed, 'GET project documents')
      expect(listBody.documents.some((row: any) => row.id === ids.projectDocA)).toBe(true)

      const inline = await page.request.get(
        `${baseUrl}/api/projects/${ids.projectA}/documents/${ids.projectDocA}?view=inline`,
      )
      expect(inline.status()).toBe(200)
      expect(inline.headers()['content-disposition']).toContain('inline')
      expect((await inline.body()).subarray(0, 5).toString()).toBe('%PDF-')
    })

    await test.step('tidrapport skrivs kanoniskt och relationerna består', async () => {
      const created = await page.request.post(`${baseUrl}/api/time-entry`, {
        data: {
          project_id: ids.projectA,
          customer_id: ids.customerA,
          work_date: new Date().toISOString().slice(0, 10),
          duration_minutes: 30,
          break_minutes: 0,
          work_category: 'work',
          description: `${run} tid`,
          is_billable: true,
        },
      })
      const body = await expectJsonOk(created, 'POST /api/time-entry')
      ids.timeA = body.entry.time_entry_id
      expect(body.entry.project_id).toBe(ids.projectA)
      expect(body.entry.customer_id).toBe(ids.customerA)
      expect(body.entry.project?.project_id).toBe(ids.projectA)

      const listed = await page.request.get(
        `${baseUrl}/api/time-entry?project_id=${ids.projectA}`,
      )
      const listBody = await expectJsonOk(listed, 'GET /api/time-entry')
      expect(listBody.entries.some((row: any) => row.time_entry_id === ids.timeA)).toBe(true)

      const foreign = await page.request.post(`${baseUrl}/api/time-entry`, {
        data: {
          project_id: ids.projectB,
          work_date: new Date().toISOString().slice(0, 10),
          duration_minutes: 15,
          description: 'attack',
        },
      })
      expect(foreign.status()).toBe(400)
      expect((await foreign.json()).error).toContain('Valt projekt tillhör inte företaget')
    })

    await test.step('mobil/PWA-viewport kan öppna projektet utan krasch och data finns efter reload', async () => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${baseUrl}/dashboard/projects/${ids.projectA}?tab=documents`)
      await page.waitForLoadState('domcontentloaded')
      expect(page.url()).not.toContain('/login')
      await expect(page.getByRole('heading', { name: `${run} projekt` })).toBeVisible()
      expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth + 2)).toBe(true)

      await page.reload()
      await expect(page.getByRole('heading', { name: `${run} projekt` })).toBeVisible()
      const persisted = await service
        .from('time_entry')
        .select('time_entry_id, project_id, customer_id')
        .eq('time_entry_id', ids.timeA)
        .single()
      expect(persisted.error).toBeNull()
      expect(persisted.data).toMatchObject({ project_id: ids.projectA, customer_id: ids.customerA })
    })

    await test.step('främmande projekt kan inte läsas eller raderas via service-role-rutterna', async () => {
      const documents = await page.request.get(`${baseUrl}/api/projects/${ids.projectB}/documents`)
      expect(await documents.json()).toMatchObject({ documents: [] })

      const removed = await page.request.delete(`${baseUrl}/api/projects?projectId=${ids.projectB}`)
      expect(removed.status()).toBe(404)
      const stillThere = await service
        .from('project')
        .select('project_id')
        .eq('project_id', ids.projectB)
        .maybeSingle()
      expect(stillThere.data?.project_id).toBe(ids.projectB)
    })
  } finally {
    await cleanup()
  }
})
