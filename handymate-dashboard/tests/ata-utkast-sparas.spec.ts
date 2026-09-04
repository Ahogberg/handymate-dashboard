/**
 * Facit — ÄTA/offert-utkast sparas vid godkännande (2026-09-04).
 *
 * Bakgrund: tasks/plan-sann-agentstatus.md, avsnitt "Andra pre-launch-
 * kandidaten: ÄTA/offert-utkast sparas aldrig". Filhuvudet på
 * lib/ata/suggest-ata-draft.ts dokumenterade ett hål: godkänt
 * 'create_ata_draft'/'create_quote_draft' postade till
 * /api/quotes/ai-generate, som bara RETURNERAR ett genererat objekt —
 * ingen rad skrevs till `project_change` eller `quotes`. Hantverkaren
 * tryckte Godkänn och fick ingenting.
 *
 * Den här filen låser att exekveraren (app/api/approvals/[id]/route.ts)
 * faktiskt skriver:
 *  - 'create_ata_draft' med ett projekt  → POST /api/ata → project_change
 *    (status 'draft', sign_token, ata_number satt av DB-triggern).
 *  - 'create_ata_draft' utan projekt / 'create_quote_draft' → POST /api/quotes
 *    → quotes (status 'draft', ai_generated: true) + quote_items.
 *  - `quotes` saknar en `project_id`-kolumn — ingen skrivväg får låtsas
 *    annat.
 *  - Idempotens: samma godkända kort (omkörning/dubbelklick) skapar aldrig
 *    en andra rad — nycklat på kortets eget id.
 *
 * Källskanning, ingen browser — kommentarer strippas innan mönster söks så
 * en dokumentationskommentar aldrig ger en falsk träff (samma metod som
 * tests/autopilot-utgang.spec.ts).
 *
 * Körs: npx playwright test tests/ata-utkast-sparas.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

/** Strippar // och /* *\/ -kommentarer (inte innehållet i strängar/mallsträngar). */
function utanKommentarer(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const approvalsRoute = read('app/api/approvals/[id]/route.ts')
const approvalsRen = utanKommentarer(approvalsRoute)
const createAta = read('lib/ata/create-ata.ts')
const createAtaRen = utanKommentarer(createAta)
const createQuote = read('lib/quotes/create-quote.ts')
const createQuoteRen = utanKommentarer(createQuote)
const ataRoute = read('app/api/ata/route.ts')
const quotesRoute = read('app/api/quotes/route.ts')
const suggestAtaDraft = read('lib/ata/suggest-ata-draft.ts')
const actionContract = read('lib/approvals/action-contract.ts')

/** Hämtar innehållet i EN `case '<typ>': {` … matchande `}` ur exekveraren
    (enkel bracket-räknare — tillräckligt robust för switch-case-block som
    inte innehåller mallsträngar med obalanserade klammer). */
function extractCase(src: string, caseHeader: string): string {
  const idx = src.indexOf(caseHeader)
  expect(idx, `hittade inte "${caseHeader}" i exekveraren`).toBeGreaterThan(-1)
  const braceStart = src.indexOf('{', idx)
  let depth = 0
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(braceStart, i + 1)
    }
  }
  throw new Error(`obalanserade klamrar för "${caseHeader}"`)
}

const ataCase = extractCase(approvalsRen, "case 'create_ata_draft': {")
const quoteCaseIdx = approvalsRen.indexOf("case 'create_quote_draft':")
const quoteCase = extractCase(approvalsRen, "case 'quote_addition': {")
void quoteCaseIdx

test.describe('create_ata_draft — godkännande skriver en riktig ÄTA', () => {
  test('med ett project_id POSTAR caset till POST /api/ata (inte bara ai-generate)', () => {
    expect(ataCase).toContain('/api/ata`')
    expect(ataCase).toMatch(/if\s*\(pl\.project_id\)\s*\{[\s\S]*fetch\(`\$\{appUrl\}\/api\/ata`/)
  })

  test('ata-anropet skickar projectId, changeType och items — inte bara text', () => {
    const idx = ataCase.indexOf('fetch(`${appUrl}/api/ata`')
    const block = ataCase.slice(idx, idx + 700)
    expect(block).toContain('projectId: pl.project_id')
    expect(block).toContain("changeType: 'addition'")
    expect(block).toContain('items: ataItems')
  })

  test('ett misslyckat /api/ata-anrop returneras som fel, aldrig tyst success', () => {
    const idx = ataCase.indexOf('const ataR = await classifyResponse(ataRes)')
    expect(idx).toBeGreaterThan(-1)
    const block = ataCase.slice(idx, idx + 200)
    expect(block).toContain('if (!ataR.ok)')
    expect(block).toContain("return { action: 'create_ata_draft', ...ataR }")
  })

  test('lyckad ÄTA-skapelse returnerar ata_id (change_id) och project_id, inte bara ok:true', () => {
    const idx = ataCase.indexOf('const ata = (ataR.metadata as any)?.ata')
    expect(idx).toBeGreaterThan(-1)
    const block = ataCase.slice(idx, idx + 300)
    expect(block).toContain('ata_id: ata?.change_id')
    expect(block).toContain('project_id: pl.project_id')
  })

  test('utan project_id (reservvägen) POSTAR caset till POST /api/quotes, inte /api/ata', () => {
    // "// Reservvägen ..." är en kommentar och strippas av utanKommentarer —
    // hitta reservgrenen på koden efter if(pl.project_id){...}-blocket i
    // stället: variabeln som bara finns i reservvägen.
    const idx = ataCase.indexOf('let projectLabel: string | null = null')
    expect(idx, 'reservvägens kod hittades inte').toBeGreaterThan(-1)
    const block = ataCase.slice(idx)
    expect(block).toContain('fetch(`${appUrl}/api/quotes`')
  })
})

test.describe('lib/ata/create-ata.ts — den delade ÄTA-skrivaren', () => {
  test('skriver en rad i project_change, status draft, med sign_token', () => {
    const idx = createAtaRen.indexOf(".from('project_change')")
    expect(idx).toBeGreaterThan(-1)
    const block = createAtaRen.slice(idx, idx + 700)
    expect(block).toContain('.insert(')
    expect(block).toContain("status: 'draft'")
    expect(block).toContain('sign_token: randomUUID()')
  })

  test('sätter INTE ata_number själv — DB-triggern äger den (annars race/dubbletter)', () => {
    const idx = createAtaRen.indexOf(".from('project_change')")
    const insertIdx = createAtaRen.indexOf('.insert(', idx)
    const closeIdx = createAtaRen.indexOf('.select()', insertIdx)
    const insertBlock = createAtaRen.slice(insertIdx, closeIdx)
    expect(insertBlock).not.toMatch(/ata_number\s*:/)
  })

  test('insert-objektet skriver bara verifierade project_change-kolumner', () => {
    const idx = createAtaRen.indexOf(".from('project_change')")
    const insertIdx = createAtaRen.indexOf('.insert(', idx)
    const closeIdx = createAtaRen.indexOf('.select()', insertIdx)
    const insertBlock = createAtaRen.slice(insertIdx, closeIdx)
    const verifieradeKolumner = [
      'business_id', 'project_id', 'change_type', 'description', 'items',
      'total', 'amount', 'hours', 'vat_rate', 'status', 'sign_token',
      'notes', 'customer_id',
    ]
    const keys = Array.from(insertBlock.matchAll(/^\s*([a-z_]+):/gm)).map(m => m[1])
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(verifieradeKolumner, `okänd project_change-kolumn i insert: ${key}`).toContain(key)
    }
  })

  test('POST /api/ata använder skapaAta (den delade skrivaren), inte en egen insert', () => {
    expect(ataRoute).toContain("from '@/lib/ata/create-ata'")
    expect(ataRoute).toContain('skapaAta(')
    expect(utanKommentarer(ataRoute)).not.toMatch(/\.from\('project_change'\)\s*\.insert\(/)
  })
})

test.describe('create_quote_draft — godkännande skriver en riktig offert', () => {
  test('POSTAR till POST /api/quotes med quote_items, ai_generated och title', () => {
    const idx = quoteCase.indexOf('fetch(`${appUrl}/api/quotes`')
    expect(idx).toBeGreaterThan(-1)
    const block = quoteCase.slice(idx, idx + 900)
    expect(block).toContain('quote_items: quoteItems')
    expect(block).toContain('ai_generated: true')
    expect(block).toContain('title: generated.jobTitle')
  })

  test('quote_items byggs via den delade bryggan generatedQuoteToQuoteItems, ingen egen mappning', () => {
    expect(approvalsRen).toContain("from '@/lib/quotes/generated-to-quote-items'")
    expect(quoteCase).toContain('generatedQuoteToQuoteItems(')
  })

  test('ett misslyckat /api/quotes-anrop returneras som fel, aldrig tyst success', () => {
    const idx = quoteCase.indexOf('const createR = await classifyResponse(createRes)')
    expect(idx).toBeGreaterThan(-1)
    const block = quoteCase.slice(idx, idx + 250)
    expect(block).toContain('if (!createR.ok)')
    expect(block).toContain("return { action: 'create_quote_draft', ...createR }")
  })

  test('lyckad skapelse returnerar quote_id från den sparade raden, inte från AI-svaret', () => {
    const idx = quoteCase.indexOf('const savedQuote = (createR.metadata as any)?.quote')
    expect(idx).toBeGreaterThan(-1)
    const block = quoteCase.slice(idx, idx + 200)
    expect(block).toContain('quote_id: savedQuote?.quote_id')
  })
})

test.describe('lib/quotes/create-quote.ts — den delade offert-skrivaren', () => {
  test('skriver quotes (status draft som default) och quote_items i samma flöde', () => {
    expect(createQuoteRen).toContain(".from('quotes')\n      .insert({")
    expect(createQuoteRen).toContain("status: input.status ?? 'draft'")
    expect(createQuoteRen).toContain(".from('quote_items').insert(radRader)")
  })

  test('quotes-inserten har INGEN project_id — kolumnen finns inte i tabellen', () => {
    const idx = createQuoteRen.indexOf(".from('quotes')\n      .insert({")
    expect(idx).toBeGreaterThan(-1)
    const closeIdx = createQuoteRen.indexOf('.select()', idx)
    const insertBlock = createQuoteRen.slice(idx, closeIdx)
    expect(insertBlock).not.toMatch(/project_id\s*:/)
  })

  test('ett misslyckat quote_items-skrivförsök städar bort det redan skapade huvudet', () => {
    const idx = createQuoteRen.indexOf(".from('quote_items').insert(radRader)")
    const block = createQuoteRen.slice(idx, idx + 400)
    expect(block).toContain("from('quotes').delete()")
  })
})

test.describe('ingen .from(\'quotes\').insert med project_id någonstans', () => {
  const filer = [
    'lib/quotes/create-quote.ts',
    'app/api/quotes/route.ts',
    'app/api/approvals/[id]/route.ts',
    'app/api/quotes/ai-generate/route.ts',
  ]

  for (const rel of filer) {
    test(`${rel}: ingen quotes-insert bär project_id`, () => {
      const ren = utanKommentarer(read(rel))
      const re = /\.from\(\s*['"]quotes['"]\s*\)[\s\S]{0,20}\.insert\(/g
      let match: RegExpExecArray | null
      let antalTraffar = 0
      while ((match = re.exec(ren))) {
        antalTraffar++
        const start = match.index
        // Läs framåt tills matchande insert-anropets stängande ')' — enkel
        // djupräkning från första '(' efter '.insert'.
        const openIdx = ren.indexOf('(', ren.indexOf('.insert', start))
        let depth = 0
        let closeIdx = openIdx
        for (let i = openIdx; i < ren.length; i++) {
          if (ren[i] === '(') depth++
          else if (ren[i] === ')') {
            depth--
            if (depth === 0) { closeIdx = i; break }
          }
        }
        const insertBlock = ren.slice(openIdx, closeIdx)
        expect(insertBlock, `${rel}: .from('quotes').insert med project_id`).not.toMatch(/project_id\s*:/)
      }
      // Filerna som faktiskt SKRIVER quotes måste ha minst en träff, annars
      // testar regexen inget.
      if (rel === 'lib/quotes/create-quote.ts') {
        expect(antalTraffar, 'hittade ingen quotes-insert i create-quote.ts').toBeGreaterThan(0)
      }
    })
  }
})

test.describe('idempotens — samma godkända kort skapar aldrig två rader', () => {
  test('exekveraren har delade uppslagsfunktioner nycklade på kortets id', () => {
    expect(approvalsRen).toContain('function idempotensMarkorFor(approvalId: string): string')
    expect(approvalsRen).toContain('async function hittaBefintligAtaForKort(')
    expect(approvalsRen).toContain('async function hittaBefintligOffertForKort(')
  })

  test('ÄTA-uppslaget filtrerar på business_id + project_id + en markör som innehåller kortets id', () => {
    const idx = approvalsRen.indexOf('async function hittaBefintligAtaForKort(')
    const block = approvalsRen.slice(idx, idx + 700)
    expect(block).toContain("from('project_change')")
    expect(block).toContain("eq('business_id', businessId)")
    expect(block).toContain("eq('project_id', projectId)")
    expect(block).toMatch(/ilike\('notes',\s*`%\$\{idempotensMarkorFor\(approvalId\)\}%`\)/)
  })

  test('offert-uppslaget filtrerar på business_id + en markör som innehåller kortets id', () => {
    const idx = approvalsRen.indexOf('async function hittaBefintligOffertForKort(')
    const block = approvalsRen.slice(idx, idx + 700)
    expect(block).toContain("from('quotes')")
    expect(block).toContain("eq('business_id', businessId)")
    expect(block).toMatch(/ilike\('source_transcript',\s*`%\$\{idempotensMarkorFor\(approvalId\)\}%`\)/)
  })

  test('create_ata_draft: uppslaget körs FÖRE ai-generate-anropet, inte efter', () => {
    const lookupIdx = ataCase.indexOf('hittaBefintligAtaForKort(')
    const aiIdx = ataCase.indexOf('/api/quotes/ai-generate')
    expect(lookupIdx).toBeGreaterThan(-1)
    expect(aiIdx).toBeGreaterThan(-1)
    expect(lookupIdx).toBeLessThan(aiIdx)
  })

  test('create_ata_draft: en befintlig träff returneras direkt (ok:true, idempotent:true) utan att posta till /api/ata', () => {
    const lookupIdx = ataCase.indexOf('const befintligAta = await hittaBefintligAtaForKort(')
    expect(lookupIdx).toBeGreaterThan(-1)
    const block = ataCase.slice(lookupIdx, lookupIdx + 400)
    expect(block).toContain('if (befintligAta)')
    expect(block).toContain('ok: true')
    expect(block).toContain('idempotent: true')
    const postAtaIdx = ataCase.indexOf('fetch(`${appUrl}/api/ata`')
    expect(lookupIdx).toBeLessThan(postAtaIdx)
  })

  test('create_quote_draft: uppslaget körs FÖRE all AI-generering (kostar inget vid omkörning)', () => {
    const lookupIdx = quoteCase.indexOf('hittaBefintligOffertForKort(')
    const previewIdx = quoteCase.indexOf('const preview = pl.preview')
    expect(lookupIdx).toBeGreaterThan(-1)
    expect(previewIdx).toBeGreaterThan(-1)
    expect(lookupIdx).toBeLessThan(previewIdx)
  })

  test('den skapade ÄTA-radens notes bär markören — så nästa uppslag hittar den', () => {
    const idx = ataCase.indexOf("fetch(`${appUrl}/api/ata`")
    const block = ataCase.slice(idx, idx + 900)
    expect(block).toMatch(/notes:\s*\[[\s\S]*idempotensMarkorFor\(approvalId\)/)
  })

  test('den skapade offertens source_transcript bär markören (create_quote_draft OCH ÄTA-reservvägen)', () => {
    expect(quoteCase).toMatch(/source_transcript:\s*\[textDescription,\s*idempotensMarkorFor\(approvalId\)\]/)
    expect(ataCase).toMatch(/source_transcript:\s*\[pl\.description,\s*idempotensMarkorFor\(approvalId\)\]/)
  })
})

test.describe('godkännande-kontraktet: fortfarande fältlokala utkast, inget utskick', () => {
  test('create_ata_draft och create_quote_draft är EXECUTABLE_ACTION (en riktig skrivning, inte ett kundutskick)', () => {
    const contractRen = utanKommentarer(actionContract)
    expect(contractRen).toMatch(/create_quote_draft:\s*'EXECUTABLE_ACTION'/)
    expect(contractRen).toMatch(/create_ata_draft:\s*'EXECUTABLE_ACTION'/)
  })

  test('inget send_sms/send_email/sendQuote-anrop finns inuti något av de två casen', () => {
    expect(ataCase).not.toMatch(/sendSms\(|sendEmailViaResend\(|\/api\/quotes\/send|\/api\/ata\/[^`]*\/send/)
    expect(quoteCase).not.toMatch(/sendSms\(|sendEmailViaResend\(|\/api\/quotes\/send/)
  })
})

test.describe('filhuvudet i suggest-ata-draft.ts beskriver inte längre hålet som öppet', () => {
  test('påstår inte längre att exekveraren sparar ingenting', () => {
    expect(suggestAtaDraft).not.toMatch(/sparar INTE offerten/)
    expect(suggestAtaDraft).not.toMatch(/skapar INGEN rad i\s*\n?\s*\* project_change/)
    expect(suggestAtaDraft).not.toMatch(/hantverkaren måste fortfarande\s*\n\s*\*\s*själv skapa den riktiga ÄTA:n manuellt/)
  })

  test('beskriver hålet som stängt och pekar på POST /api/ata och POST /api/quotes', () => {
    expect(suggestAtaDraft).toMatch(/STÄNGD/)
    expect(suggestAtaDraft).toContain('POST /api/ata')
    expect(suggestAtaDraft).toContain('POST /api/quotes')
  })

  test('nämner idempotensen så en läsare inte återuppfinner den', () => {
    expect(suggestAtaDraft).toMatch(/[Ii]dempotens/)
  })
})
