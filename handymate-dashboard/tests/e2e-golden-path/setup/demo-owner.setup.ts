/**
 * Demo-ägarens auth-setup — ADAPTERAD KOPIA av tests/auth.setup.ts's
 * magic-link-mönster (kopierad, inte importerad, med flit — se plan-filens
 * Arkitektur-avsnitt: de två auth-setuperna ska vara helt oberoende så att
 * den befintliga filen aldrig behöver röras för det här harnessets skull).
 *
 * VIKTIGT — vad den HÄR filen bevisar vs. vad Station 1 gör:
 * golden-path.spec.ts Station 1 loggar in med en RIKTIG lösenords-inmatning
 * i UI:t (page.goto('/login') + fyll email/lösenord + klicka) — det är
 * fortfarande den huvudsakliga bevispunkten ("kör som en riktig ägare").
 * Den här filen konsumeras INTE av golden-path.spec.ts. Den finns för att:
 *   1. Bekräfta TIDIGT (innan Station 1 ens startar) att demo-ägarkontot
 *      går att nå via Supabase admin-API:t alls — ett snabbt, tydligt fel
 *      här är mycket lättare att felsöka än ett timeout i en UI-inloggning.
 *   2. Producera en egen storageState (playwright/.auth/demo-owner.json)
 *      som framtida spec-filer kan återanvända för ägar-auth UTAN att
 *      upprepa en full UI-inloggning — matchar arkitekturen redan byggd
 *      för demo-employee.setup.ts.
 */
import { test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { DEMO_OWNER_EMAIL } from '../fixtures/db'

const AUTH_FILE = path.join('playwright', '.auth', 'demo-owner.json')

setup('demo-owner: sanity-precheck + storageState', async ({ page }) => {
  const authDir = path.dirname(AUTH_FILE)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  console.log('demo-owner.setup — SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING')
  console.log('demo-owner.setup — SERVICE_ROLE_KEY:', serviceKey ? 'SET' : 'MISSING')

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

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: DEMO_OWNER_EMAIL,
  })

  if (error || !data?.properties?.action_link) {
    throw new Error(
      `Kunde inte skapa magic link för demo-ägaren (${DEMO_OWNER_EMAIL}): ${
        error?.message || 'Ingen länk genererad'
      }. Finns kontot i Supabase Auth överhuvudtaget?`,
    )
  }

  console.log('demo-owner.setup — Magic link genererad, navigerar...')

  await page.goto(data.properties.action_link)
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 })
  await page.waitForTimeout(2000)

  console.log('demo-owner.setup — Inloggad, URL:', page.url())

  await page.context().storageState({ path: AUTH_FILE })
  console.log('demo-owner.setup — Session sparad till', AUTH_FILE)
})
