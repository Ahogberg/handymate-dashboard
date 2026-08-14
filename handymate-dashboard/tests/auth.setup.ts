import { test as setup, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const AUTH_FILE = path.join('playwright', '.auth', 'user.json')

/**
 * Inloggningen (2026-08-14, ersätter magic link-vägen).
 *
 * ═══ VARFÖR MAGIC LINK BYTTES UT ═══
 *
 * `supabase.auth.admin.generateLink({type:'magiclink'})` + `page.goto(action_link)`
 * studsade tillbaka till /login inom någon sekund — reproducerat upprepade
 * gånger, även mot helt orörda, redan existerande tester (se tasks/todo.md).
 * Trolig orsak: appens `/auth/callback` (app/auth/callback/route.ts) väntar
 * en PKCE `?code=`-parameter och kör `exchangeCodeForSession` — men
 * adminskapade länkar konsumeras inte via den vägen, så sessionen aldrig
 * hann bli en riktig cookie-session innan sidan hann kolla den.
 *
 * Appens EGEN inloggning (lib/supabase.ts:29 — "Inloggningen sker helt på
 * servern") går via POST /api/auth {action:'login'} → createRouteHandlerClient
 * → signInWithPassword, som skriver cookien i EXAKT det format klienten
 * (createClientComponentClient) och getAuthenticatedBusiness() förväntar
 * sig. Genom att posta till den riktiga rutten (page.request delar
 * cookie-jar med page/context automatiskt) slipper vi gissa cookie-formatet
 * helt — det är samma kod en riktig inloggning kör.
 *
 * TEST_USER_PASSWORD sattes en gång via admin.updateUserById för
 * TEST_USER_EMAIL-kontot (ett dedikerat testkonto, ingen skarp kund).
 */
setup('authenticate', async ({ page, baseURL }) => {
  const authDir = path.dirname(AUTH_FILE)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const email = process.env.TEST_USER_EMAIL || 'andreashogberg93@gmail.com'
  const password = process.env.TEST_USER_PASSWORD || ''

  if (!password) {
    throw new Error('TEST_USER_PASSWORD saknas — sätt den i .env.test (se tasks/todo.md för hur den sattes).')
  }

  const response = await page.request.post('/api/auth', {
    data: { action: 'login', data: { email, password } },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok() || !body.success) {
    throw new Error(`Inloggning misslyckades (${response.status()}): ${body.error || 'okänt fel'}`)
  }

  console.log('Auth setup — Inloggad via /api/auth, businessId:', body.businessId)

  // Bekräfta att cookien verkligen ger en inloggad session vid en riktig
  // sidnavigering, innan vi sparar den till varje beroende projekt
  // (chromium/mobile) — annars upptäcks ett framtida regressionsfel först
  // som en förvirrande "elementet hittades inte" långt bort i en testfil.
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  expect(page.url(), `Sessionen gav inloggad åtkomst till /dashboard — URL: ${page.url()}`).not.toContain('/login')

  await page.context().storageState({ path: AUTH_FILE })
  console.log('Auth setup — Session sparad till', AUTH_FILE)
})
