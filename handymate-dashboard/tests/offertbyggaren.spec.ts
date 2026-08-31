/**
 * Facit för den kanoniska offertbyggaren (2026-08-09, offertauditens
 * Q-P1-1/Q-P1-8).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Fem ställen skrev offerter direkt i databasen, var och en med sin egen
 * uppfattning om vad en offert är:
 *
 *   api/quotes POST        ~50 fält, quote_items, nummer, sign_token
 *   api/quotes duplicate   ~40 fält — men INGEN sign_token: kopian olänkbar
 *   tool-router (agenten)   16 fält — inget nummer, ingen token:
 *                           smart-communication satte quote_link: undefined
 *                           och SMS:et till kunden gick ut UTAN länk
 *   matte/chat               6 fält — inga rader, inga totaler: tom PDF
 *   voice/execute            8 fält — inga rader
 *
 * lib/quotes/create-quote.ts äger nu invarianterna. Det här facitet är
 * SPÄRRHAKEN: listan över filer som får skriva quotes/quote_items direkt får
 * bara krympa — aldrig växa.
 *
 *   npx playwright test tests/offertbyggaren.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const BYGGAREN = 'lib/quotes/create-quote.ts'

/**
 * Filer som får röra quotes/quote_items med insert UTAN att gå via byggaren.
 * Får BARA krympa. Skälen är dokumenterade — en post utan skäl är ett fel.
 */
const TILLATNA_DIREKTSKRIVARE: Record<string, string> = {
  [BYGGAREN]: 'byggaren själv — den enda riktiga skrivaren',
  'lib/demo/seed-demo-account.ts':
    'demokontots manus kräver fasta id:n och nummer som berättelsen refererar',
  'app/api/debug/e2e-quote/route.ts':
    'testharnessen skapar en E2E-offert med avsiktligt fasta värden (#E2E)',
  'app/api/quotes/route.ts':
    'PUT-vägen skriver om quote_items vid REDIGERING — byggaren äger skapandet',
}

function skrivareAv(tabell: string): string[] {
  const träffar: string[] = []
  const gå = (dir: string) => {
    let poster
    try { poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }) } catch { return }
    for (const f of poster) {
      const rel = `${dir}/${f.name}`
      if (f.isDirectory()) {
        if (f.name === 'node_modules' || f.name === '.next') continue
        gå(rel)
        continue
      }
      if (!/\.tsx?$/.test(f.name)) continue
      const s = kod(rel)
      // insert/upsert i SAMMA kedja — ett mellanliggande .from( betyder att
      // skrivningen gäller en annan tabell (t.ex. quote_tracking_events).
      const mönster = new RegExp(
        `from\\('${tabell}'\\)(?:(?!\\.from\\()[\\s\\S]){0,200}?\\.(insert|upsert)\\(`
      )
      if (mönster.test(s)) träffar.push(rel)
    }
  }
  for (const rot of ['app', 'lib', 'components']) gå(rot)
  return träffar.sort()
}

test.describe('spärrhaken: en väg in', () => {
  test('ingen ny direktskrivare av quotes', () => {
    const skrivare = skrivareAv('quotes')
    const okända = skrivare.filter(f => !(f in TILLATNA_DIREKTSKRIVARE))
    expect(
      okända,
      `nya direktskrivare av quotes — gå via createQuote i stället: ${okända.join(', ')}`
    ).toEqual([])
  })

  test('ingen ny direktskrivare av quote_items', () => {
    const skrivare = skrivareAv('quote_items')
    const okända = skrivare.filter(f => !(f in TILLATNA_DIREKTSKRIVARE))
    expect(
      okända,
      `nya direktskrivare av quote_items: ${okända.join(', ')}`
    ).toEqual([])
  })

  test('de migrerade skrivarna använder byggaren', () => {
    for (const fil of [
      'app/api/voice/execute/route.ts',
      'app/api/agent/trigger/tool-router.ts',
      'app/api/quotes/route.ts',
    ]) {
      expect(kod(fil), `${fil} importerar inte byggaren`).toContain('quotes/create-quote')
    }
  })

  test('matte/chat delegerar sina quote-verktyg till tool-router, inte en egen skrivare', () => {
    // Offert-omtaget (2026-08-31): den döda lokala executeTool()-kopian togs
    // bort härifrån (den skapade aldrig annat än ett tomt skal). Matte
    // anropar nu SAMMA executeSharedTool/create_quote(_draft) som
    // tool-router.ts äger — route.ts importerar inte byggaren direkt längre,
    // och ska inte göra det igen utan att gå via tool-router.
    const s = kod('app/api/matte/chat/route.ts')
    expect(s).not.toContain('quotes/create-quote')
    expect(s).toContain('executeSharedTool')
  })

  test('api/quotes POST skriver inte offerthuvudet själv längre', () => {
    // PUT-vägen får skriva quote_items (redigering). Men .from('quotes').insert
    // ska inte finnas alls — skapandet, inklusive kopior, går via byggaren.
    const s = kod('app/api/quotes/route.ts')
    expect(s).not.toMatch(/from\('quotes'\)[\s\S]{0,120}?\.insert\(/)
  })
})

test.describe('invarianterna: det varje offert måste ha', () => {
  test('byggaren sätter nummer, token, datum och status', () => {
    const s = kod(BYGGAREN)
    for (const fält of ['quote_number', 'sign_token', 'valid_until', 'status', 'created_at', 'created_by']) {
      expect(s, `invarianten ${fält} saknas`).toContain(`${fält}:`)
    }
    expect(s).toContain('crypto.randomUUID()')
  })

  test('extra kan inte skriva över invarianterna', () => {
    // Spridningsordningen ÄR skyddet: härledda totaler först, extra sedan,
    // invarianterna sist. En extra med egen sign_token förlorar.
    const s = kod(BYGGAREN)
    const spridning = s.indexOf('...(input.extra || {})')
    const invariant = s.indexOf('quote_id: quoteId', spridning)
    expect(spridning, 'extra sprids inte').toBeGreaterThan(-1)
    expect(invariant, 'invarianterna appliceras inte EFTER extra').toBeGreaterThan(spridning)
  })

  test('nummerkollisionen möts med omtag, inte med fel', () => {
    const s = kod(BYGGAREN)
    expect(s).toContain('23505')
    expect(s, 'ingen omtagsloop').toMatch(/for \(let forsok = 0; forsok < 3/)
  })

  test('en offert utan sina rader lämnas inte kvar', () => {
    // Rollback-regeln fanns i tool-routern och api/quotes var för sig.
    // Nu bor den i byggaren och gäller ALLA skapare.
    const s = kod(BYGGAREN)
    const radFel = s.indexOf("from('quote_items').insert")
    const rollback = s.indexOf(".from('quotes').delete()", radFel)
    expect(rollback, 'ingen rollback efter radfel').toBeGreaterThan(radFel)
  })

  test('split-invarianten har EN definition', () => {
    // resolveItemSplit exporteras från byggaren; api/quotes importerar den.
    // En lokal kopia till hade varit två sanningar om samma regel.
    expect(kod(BYGGAREN)).toContain('export function resolveItemSplit')
    const route = kod('app/api/quotes/route.ts')
    expect(route, 'api/quotes har en egen kopia av resolveItemSplit')
      .not.toContain('function resolveItemSplit(')
    expect(route).toContain('resolveItemSplit')
  })
})

test.describe('följdfelen som drev fram byggaren', () => {
  test('smart-communication kan lita på att sign_token finns', () => {
    // Länkbygget får gärna ha kvar sin fallback — men vägen dit ska aldrig
    // behöva den för NYA offerter, oavsett skapare.
    const s = kod('lib/smart-communication.ts')
    expect(s).toContain('sign_token')
  })

  test('agentens svar bär offertnumret', () => {
    // Utan nummer kunde varken hantverkaren eller Matte referera offerten.
    const s = kod('app/api/agent/trigger/tool-router.ts')
    expect(s).toContain('quote_number: skapad.quoteNumber')
  })
})
