/**
 * Inspelningsläge — gemensamma fixtures (2026-08-28).
 *
 * Syfte: sätta demokontot i EXAKT det tillstånd en film i Video Creative
 * Bible behöver, via produktens egna vägar, och spela in skärmen i 9:16
 * (1080×1920) så att varje UI-klipp i en annons är sant per definition och
 * kan spelas om när UI:t ändras. Handbokens grundregel: produktbeviset
 * kommer alltid från Handymates verkliga ytor och verkliga statusar.
 *
 * Sanningsregler som fixtures låser:
 *  - Kör BARA mot ett konto som är demo-flaggat i databasen
 *    (business_config.is_demo_tenant). assertFilmingTenant() kastar annars.
 *  - Filmdata får ALDRIG heta E2E/Testkund eller ha test_/e2e_-id: då
 *    filtreras den bort från hemskärmen och cronarna (lib/testdata.ts) och
 *    filmen skulle visa något som inte finns för en riktig kund.
 *  - Alla filmkunder bär harnessets telefonnummer/mejl (E2E_TEST_PHONE /
 *    E2E_TEST_EMAIL) så att ett eventuellt utskick landar hos oss, och så
 *    att sweepE2eResidue() städar dem som vanlig E2E-rest.
 *  - Inga påhittade belopp läggs i UI:t i efterhand — allt som syns är
 *    produktens egna rader.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  DEMO_BUSINESS_ID,
  DEMO_OWNER_EMAIL,
  E2E_TEST_PHONE,
  E2E_TEST_EMAIL,
  requireDemoOwnerPassword,
  getSupabaseAdmin,
  sweepE2eResidue,
} from '../../e2e-golden-path/fixtures/db'

export { DEMO_BUSINESS_ID, getSupabaseAdmin }

export const FILM_PHONE = E2E_TEST_PHONE
export const FILM_EMAIL = E2E_TEST_EMAIL

/** 9:16 i CSS-pixlar × skalfaktor = 1080×1920 (handbokens Reels/TikTok/Shorts-format). */
export const FILM_VIEWPORT = { width: 432, height: 768 }
export const FILM_SCALE = 2.5
/**
 * Playwright skalar bara NER till recordVideo.size — en större size ger
 * innehållet oskalat i övre vänstra hörnet (upptäckt i F04-piloten
 * 2026-08-28). Videon spelas därför in i viewport-storlek och skalas upp i
 * klippet; SKARPA bilder kommer från beat-stillbilderna (1080×1920 via
 * deviceScaleFactor) — använd dem för stillastående produktbevis-segment.
 */
export const FILM_VIDEO_SIZE = FILM_VIEWPORT

export const RECORDINGS_ROOT = path.join(__dirname, '..', '..', '..', 'docs', 'marketing', 'recordings')

/** Filmdata får aldrig träffa testdata-filtret (lib/testdata.ts). */
export function assertFilmName(name: string): string {
  if (/E2E|Testkund/.test(name) || /^(test_|e2e_)/.test(name)) {
    throw new Error(`Filmnamnet "${name}" skulle filtreras som testdata och aldrig synas i UI:t`)
  }
  return name
}

/** Spärren: inspelningsläget kör bara mot konton som databasen själv kallar demo. */
export async function assertFilmingTenant(): Promise<void> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('business_config')
    .select('business_id, business_name, is_demo_tenant')
    .eq('business_id', DEMO_BUSINESS_ID)
    .maybeSingle()
  if (error) throw new Error(`Kunde inte läsa business_config för ${DEMO_BUSINESS_ID}: ${error.message}`)
  if (!data || data.is_demo_tenant !== true) {
    throw new Error(
      `Inspelningsläget vägrar: ${DEMO_BUSINESS_ID} är inte demo-flaggat (is_demo_tenant). ` +
        'Sätt DEMO_BUSINESS_ID till ett demokonto — aldrig ett riktigt kundkonto.',
    )
  }
}

/** Städa förra inspelningens rester (matchar på harnessets telefonnummer). */
export async function sweepFilmResidue(): Promise<void> {
  const { leftover } = await sweepE2eResidue()
  if (leftover.length) throw new Error(`Filmrester kunde inte städas: ${leftover.join(', ')}`)
  // Kort som en filmspec skapat via produktens byggare bär payload.filming_source
  // (F06, F13). Städas kunden före kortet (vilket hände efter F06 2026-08-28)
  // når sweepE2eResidue inte kortet via kund → offert/faktura — det låg kvar
  // som ett fjärde kort på hemskärmen. Därför städas de här på sin egen stämpel.
  const { error } = await getSupabaseAdmin()
    .from('pending_approvals')
    .delete()
    .eq('business_id', DEMO_BUSINESS_ID)
    .not('payload->>filming_source', 'is', null)
  if (error) throw new Error(`Filmkort (filming_source) kunde inte städas: ${error.message}`)
}

export interface FilmSession {
  context: BrowserContext
  page: Page
  dir: string
}

export async function openFilmContext(browser: Browser, film: string): Promise<FilmSession> {
  const dir = path.join(RECORDINGS_ROOT, film)
  fs.mkdirSync(dir, { recursive: true })
  const context = await browser.newContext({
    viewport: FILM_VIEWPORT,
    deviceScaleFactor: FILM_SCALE,
    isMobile: true,
    hasTouch: true,
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    colorScheme: 'light',
    recordVideo: { dir, size: FILM_VIDEO_SIZE },
    storageState: { cookies: [], origins: [] },
  })
  // Samma knep som tests/auth.setup.ts: välkomstmodalen ska inte hamna på film.
  // Presentatörsbandet (components/demo/PresenterBar.tsx) renderas alltid för
  // demokontots ägare — det är demoverktyg som ingen riktig kund ser, inte
  // produkt, och det döljs därför här. Inget annat i UI:t rörs.
  await context.addInitScript(() => {
    try {
      localStorage.setItem('handymate_welcome_dismissed', '1')
      localStorage.setItem('hm_kom_igang_klar', '1')
    } catch {
      /* privat läge etc. */
    }
    const style = document.createElement('style')
    style.setAttribute('data-filming', 'hide-presenter')
    style.textContent = '[data-demo-presenter="true"] { display: none !important; }'
    const mount = () => (document.head || document.documentElement).appendChild(style)
    if (document.head) mount()
    else document.addEventListener('DOMContentLoaded', mount)
  })
  const page = await context.newPage()
  return { context, page, dir }
}

/** Stänger kontexten (då blir videon klar) och döper om den till handbokens arkivnamn. */
export async function finishFilm(session: FilmSession, fileBase: string): Promise<string> {
  const video = session.page.video()
  await session.context.close()
  const target = path.join(session.dir, `${fileBase}.webm`)
  if (video) {
    await video.saveAs(target)
    await video.delete().catch(() => undefined)
  }
  return target
}

/** Riktig lösenordsinloggning som demoägaren — samma mönster som Golden Path station 1. */
export async function loginOwner(page: Page): Promise<void> {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(DEMO_OWNER_EMAIL)
  await page.locator('input[type="password"]').fill(requireDemoOwnerPassword())
  await page.getByRole('button', { name: 'Logga in' }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 })
  await dismissOverlays(page, 6_000)
}

/**
 * Overlays som annars hamnar på film (samma lista som Golden Path
 * KNOWN_OVERLAYS): Måndagsmötet, cookiebannern, Company Scan, välkomst-
 * modalen. Fast pollfönster eftersom de monteras på oberoende async-grindar.
 */
export async function dismissOverlays(page: Page, windowMs = 4_000, pollMs = 400): Promise<void> {
  const deadline = Date.now() + windowMs
  while (Date.now() < deadline) {
    for (const name of ['Stäng', 'Godkänn alla', 'Hoppa över']) {
      const btn = page.getByRole('button', { name, exact: true }).first()
      if (await btn.isVisible().catch(() => false)) await btn.click({ timeout: 1_500 }).catch(() => undefined)
    }
    const welcome = page.getByText('Välkommen — ditt team är på plats.')
    if (await welcome.isVisible().catch(() => false)) await page.mouse.click(10, 10)
    await page.waitForTimeout(pollMs)
  }
}

/** Ett "beat" = en läsbar stillbild + dwell-tid i videon. */
export async function beat(
  session: FilmSession,
  film: string,
  n: number,
  label: string,
  dwellMs = 2_500,
): Promise<string> {
  await session.page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  // scrollIntoView kan ha dragit sidan i sidled på en yta som är bredare än
  // viewporten — bilden ska alltid börja vid vänsterkanten.
  await session.page.evaluate(() => {
    const el = document.scrollingElement
    if (el) el.scrollLeft = 0
    window.scrollTo(0, window.scrollY)
    // …och varje inre scrollcontainer (layouten scrollar i <main>, inte i dokumentet).
    document.querySelectorAll<HTMLElement>('*').forEach((n) => {
      if (n.scrollLeft > 0) n.scrollLeft = 0
    })
  }).catch(() => undefined)
  await session.page.waitForTimeout(dwellMs)
  const file = path.join(session.dir, `HM_${film}_BEAT-${String(n).padStart(2, '0')}_${label}_1080x1920.png`)
  await session.page.screenshot({ path: file, scale: 'device', fullPage: false })
  return file
}

/** Långsam inmatning så formulär-scenen går att se på film. */
export async function typeSlow(page: Page, placeholder: string, text: string, delay = 45): Promise<void> {
  const field = page.getByPlaceholder(placeholder)
  await field.click()
  await field.pressSequentially(text, { delay })
}

export interface ApiResult<T = any> {
  status: number
  json: T
}

/** Produktens API med sidans egna cookies — så att seedningen går samma väg som en riktig ägare. */
export async function api<T = any>(page: Page, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await page.request.fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    data: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 300) }
  }
  return { status: res.status(), json }
}

export async function apiOk<T = any>(page: Page, method: 'POST' | 'PUT' | 'PATCH', url: string, body: unknown, what: string): Promise<T> {
  const r = await api<T>(page, method, url, body)
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`${what} misslyckades: ${method} ${url} → ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`)
  }
  return r.json
}

/** Plocka ett id ur de svarformer produktens rutter använder. */
export function pickId(json: any, ...keys: string[]): string {
  for (const k of keys) {
    const direct = json?.[k]
    if (typeof direct === 'string' && direct) return direct
    for (const wrap of ['customer', 'quote', 'project', 'change', 'data', 'ata']) {
      const v = json?.[wrap]?.[k]
      if (typeof v === 'string' && v) return v
    }
  }
  throw new Error(`Hittade inget id (${keys.join('/')}) i svaret: ${JSON.stringify(json).slice(0, 300)}`)
}

/** Vänta på att en rad finns — sanningen läses ur databasen, inte ur UI:t. */
export async function pollRow<T = Record<string, any>>(
  table: string,
  filters: Record<string, unknown>,
  opts: { timeoutMs?: number; select?: string } = {},
): Promise<T> {
  const admin = getSupabaseAdmin()
  const deadline = Date.now() + (opts.timeoutMs ?? 20_000)
  let lastErr = ''
  while (Date.now() < deadline) {
    let q = admin.from(table).select(opts.select ?? '*').limit(1)
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v as any)
    const { data, error } = await q
    if (error) lastErr = error.message
    if (data && data.length) return data[0] as T
    await new Promise((r) => setTimeout(r, 750))
  }
  throw new Error(`Ingen rad i ${table} för ${JSON.stringify(filters)}${lastErr ? ` (senaste fel: ${lastErr})` : ''}`)
}

export function daysAgoIso(days: number, hour = 9): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Mobil-overflow-diagnos: element som är bredare än viewporten på den sida
 * som filmas. Produkten är mobil-först — allt som dyker upp här är ett fynd,
 * inte ett inspelningsproblem. Skrivs in i sanningsfilen.
 */
export async function measureOverflow(
  page: Page,
  label: string,
): Promise<{
  label: string
  skarm: number
  layout_viewport: number
  dokumentbredd: number
  viewport_meta: string | null
  overflow: Array<{ tag: string; cls: string; right: number; text: string }>
  syndabockar: Array<{ tag: string; cls: string; width: number; why: string; text: string }>
}> {
  // Med isMobile zoomar Chromium ut när innehållet är bredare än skärmen —
  // då växer window.innerWidth. Därför jämförs mot SKÄRMENS bredd, inte innerWidth.
  return page.evaluate((args) => {
    const { lbl, skarm } = args
    const hits: Array<{ tag: string; cls: string; right: number; text: string }> = []
    document.querySelectorAll<HTMLElement>('body *').forEach((n) => {
      const r = n.getBoundingClientRect()
      if (r.right > skarm + 2 && r.width < 4000 && r.height > 0 && n.offsetParent !== null) {
        hits.push({
          tag: n.tagName.toLowerCase(),
          cls: (typeof n.className === 'string' ? n.className : '').slice(0, 90),
          right: Math.round(r.right),
          text: (n.innerText || '').slice(0, 60).replace(/\s+/g, ' '),
        })
      }
    })
    hits.sort((a, b) => b.right - a.right)
    // Syndabockar: element som TVINGAR bredden (nowrap, fast px-bredd/min-width,
    // eller eget innehåll bredare än sin box) — det är dessa som ska fixas.
    const culprits: Array<{ tag: string; cls: string; width: number; why: string; text: string }> = []
    document.querySelectorAll<HTMLElement>('body *').forEach((n) => {
      const r = n.getBoundingClientRect()
      if (r.height === 0 || n.offsetParent === null || r.width >= 4000) return
      const cs = getComputedStyle(n)
      const why: string[] = []
      if (cs.whiteSpace === 'nowrap' && r.width > skarm - 48) why.push('nowrap')
      if (cs.minWidth.endsWith('px') && parseFloat(cs.minWidth) > skarm - 48) why.push(`min-width:${cs.minWidth}`)
      if (cs.width.endsWith('px') && parseFloat(cs.width) > skarm - 48 && !cs.width.startsWith('auto') && n.scrollWidth > (n.parentElement?.clientWidth ?? 0) + 2) why.push(`width:${cs.width}`)
      if (n.scrollWidth > n.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') why.push(`scrollWidth:${n.scrollWidth}`)
      if (why.length) {
        culprits.push({
          tag: n.tagName.toLowerCase(),
          cls: (typeof n.className === 'string' ? n.className : '').slice(0, 90),
          width: Math.round(r.width),
          why: why.join(' '),
          text: (n.innerText || '').slice(0, 60).replace(/\s+/g, ' '),
        })
      }
    })
    return {
      label: lbl,
      skarm,
      layout_viewport: window.innerWidth,
      dokumentbredd: document.documentElement.scrollWidth,
      viewport_meta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
      overflow: hits.slice(0, 6),
      syndabockar: culprits.slice(0, 10),
    }
  }, { lbl: label, skarm: FILM_VIEWPORT.width })
}

/** Skriv sanningsfilen bredvid inspelningen: vad databasen sa när bilden togs. */
export function writeTruth(session: FilmSession, film: string, truth: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(session.dir, `HM_${film}_SANNING.json`),
    JSON.stringify({ recorded_at: new Date().toISOString(), business_id: DEMO_BUSINESS_ID, ...truth }, null, 2),
  )
}

export { expect }
