/**
 * Test-anställd — hitta-eller-skapa (idempotent), knuten ENDAST till
 * DEMO_BUSINESS_ID, med ALLA can_*-flaggor false (sql/business_users.sql:
 * can_see_all_projects, can_see_financials, can_manage_users,
 * can_approve_time, can_create_invoices). Detta konto är permanent —
 * städas ALDRIG bort av golden-path.spec.ts's cleanup (samma "hitta-eller-
 * skapa"-princip som ett riktigt teammedlemskonto; det återanvänds mellan
 * körningar, precis som planen beskriver).
 *
 * Adapterad kopia av tests/auth.setup.ts's magic-link-mönster (kopierad,
 * inte importerad — se demo-owner.setup.ts's filhuvud för samma motivering).
 */
import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_BUSINESS_ID } from '../fixtures/db'

const AUTH_FILE = path.join('playwright', '.auth', 'demo-employee.json')
const EMPLOYEE_EMAIL = 'demo.employee.test@handymate.se'
const EMPLOYEE_NAME = 'E2E Testanställd'

setup('demo-employee: hitta-eller-skapa + storageState', async ({ page }) => {
  const authDir = path.dirname(AUTH_FILE)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      `SUPABASE_URL (${supabaseUrl ? 'SET' : 'MISSING'}) och SUPABASE_SERVICE_ROLE_KEY (${
        serviceKey ? 'SET' : 'MISSING'
      }) måste vara satta`,
    )
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 1. Hitta eller skapa auth-användaren ────────────────────────────────
  // admin.listUsers() filtrerar inte på email i alla supabase-js-versioner —
  // sidbläddra istället tills vi hittar matchen eller sidorna tar slut.
  // Begränsat till 10 sidor (à 1000) — en demo/dev-miljös auth-tabell är
  // liten; når vi taket är något annat fel och vi vill hellre kasta tydligt
  // än pollra i evighet.
  let userId: string | null = null
  for (let pageNum = 1; pageNum <= 10 && !userId; pageNum++) {
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({
      page: pageNum,
      perPage: 1000,
    })
    if (listErr) throw new Error(`Kunde inte lista auth-users (sida ${pageNum}): ${listErr.message}`)
    const match = listData.users.find((u) => u.email?.toLowerCase() === EMPLOYEE_EMAIL)
    if (match) userId = match.id
    if (listData.users.length < 1000) break // sista sidan
  }

  if (!userId) {
    console.log('demo-employee.setup — konto saknas, skapar nytt:', EMPLOYEE_EMAIL)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: EMPLOYEE_EMAIL,
      email_confirm: true,
      user_metadata: { source: 'e2e-golden-path', purpose: 'permission-check' },
    })
    if (createErr || !created?.user) {
      throw new Error(`Kunde inte skapa test-anställd-kontot: ${createErr?.message || 'okänt fel'}`)
    }
    userId = created.user.id
  } else {
    console.log('demo-employee.setup — konto fanns redan:', EMPLOYEE_EMAIL, userId)
  }

  // ── 2. Hitta eller skapa business_users-raden — idempotent, alla
  //    can_*-flaggor TVINGAS false varje körning (även om något manuellt
  //    ändrat dem mellan körningar — behörighetstestet kräver noll access). ──
  const { data: existingBu, error: buLookupErr } = await supabase
    .from('business_users')
    .select('id')
    .eq('business_id', DEMO_BUSINESS_ID)
    .eq('email', EMPLOYEE_EMAIL)
    .maybeSingle()

  if (buLookupErr) {
    throw new Error(`Kunde inte slå upp business_users-raden: ${buLookupErr.message}`)
  }

  const forcedPermissions = {
    role: 'employee',
    user_id: userId,
    name: EMPLOYEE_NAME,
    is_active: true,
    can_see_all_projects: false,
    can_see_financials: false,
    can_manage_users: false,
    can_approve_time: false,
    can_create_invoices: false,
  }

  if (existingBu) {
    const { error: updErr } = await supabase
      .from('business_users')
      .update(forcedPermissions)
      .eq('id', existingBu.id)
    if (updErr) throw new Error(`Kunde inte återställa business_users-raden till noll-behörigheter: ${updErr.message}`)
    console.log('demo-employee.setup — business_users-rad återställd (noll behörigheter):', existingBu.id)
  } else {
    const { error: insErr } = await supabase.from('business_users').insert({
      business_id: DEMO_BUSINESS_ID,
      email: EMPLOYEE_EMAIL,
      accepted_at: new Date().toISOString(),
      ...forcedPermissions,
    })
    if (insErr) throw new Error(`Kunde inte skapa business_users-raden: ${insErr.message}`)
    console.log('demo-employee.setup — business_users-rad skapad')
  }

  // ── 3. Magic link + spara storageState ──────────────────────────────────
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: EMPLOYEE_EMAIL,
  })

  if (error || !data?.properties?.action_link) {
    throw new Error(`Kunde inte skapa magic link för test-anställd: ${error?.message || 'Ingen länk genererad'}`)
  }

  await page.goto(data.properties.action_link)
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 })
  await page.waitForTimeout(2000)

  console.log('demo-employee.setup — Inloggad, URL:', page.url())

  await page.context().storageState({ path: AUTH_FILE })
  console.log('demo-employee.setup — Session sparad till', AUTH_FILE)
})
