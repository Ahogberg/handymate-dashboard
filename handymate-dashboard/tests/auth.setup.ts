import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

setup('authenticate', async ({ page }) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY måste vara satta i .env.test'
    )
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Generera magic link via admin API
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: process.env.TEST_USER_EMAIL || 'andreashogberg93@gmail.com',
  })

  if (error || !data?.properties?.action_link) {
    throw new Error(`Kunde inte skapa magic link: ${error?.message || 'Ingen länk genererad'}`)
  }

  // Navigera till magic link — loggar in automatiskt
  await page.goto(data.properties.action_link)

  // Vänta på redirect till dashboard
  await page.waitForURL('**/dashboard**', { timeout: 15_000 })

  // Spara session state
  await page.context().storageState({ path: 'playwright/.auth/user.json' })
})
