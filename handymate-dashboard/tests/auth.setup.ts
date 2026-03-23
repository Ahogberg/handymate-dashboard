import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const AUTH_FILE = path.join('playwright', '.auth', 'user.json')

setup('authenticate', async ({ page }) => {
  // Skapa auth-katalog om den saknas
  const authDir = path.dirname(AUTH_FILE)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  console.log('Auth setup — SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING')
  console.log('Auth setup — SERVICE_ROLE_KEY:', serviceKey ? 'SET' : 'MISSING')

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      `SUPABASE_URL (${supabaseUrl ? 'SET' : 'MISSING'}) och SUPABASE_SERVICE_ROLE_KEY (${serviceKey ? 'SET' : 'MISSING'}) måste vara satta`
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

  console.log('Auth setup — Magic link genererad, navigerar...')

  // Navigera till magic link — loggar in automatiskt
  await page.goto(data.properties.action_link)

  // Vänta på redirect — kan vara /dashboard eller /onboarding
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 })

  // Vänta extra så att Supabase-cookies sätts korrekt
  await page.waitForTimeout(2000)

  console.log('Auth setup — Inloggad, URL:', page.url())

  // Spara session state (cookies + localStorage)
  await page.context().storageState({ path: AUTH_FILE })
  console.log('Auth setup — Session sparad till', AUTH_FILE)
})
