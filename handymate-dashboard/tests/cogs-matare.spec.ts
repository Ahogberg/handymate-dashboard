/**
 * Facit för COGS-mätaren (plan: telefonins ekonomi vid skala, 2026-08-08).
 *
 * Bakgrunden: vi kunde inte svara på vad en kund kostar oss. Två mätsystem
 * fanns, båda otillräckliga — `sms_usage` mäter vad vi TAR (0,89/0,79/0,69),
 * inte vad vi BETALAR (0,52), och `usage_record` var helt död med noll
 * callsites medan billing-sidan läste den och visade 0 för kunden.
 *
 * Det som testas här är i huvudsak inte funktionerna utan GRÄNSERNA:
 *   - priser bor på ETT ställe och är versionerade
 *   - kvot-tabellen och kostnads-tabellen blandas aldrig
 *   - antalet SMS-vägar som kringgår strypunkten får bara KRYMPA
 *
 * Plus SMS-delräkningen, som är den enda logik här som är lätt att få
 * subtilt fel — och där ett fel kostar riktiga pengar tyst.
 *
 *   npx playwright test tests/cogs-matare.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  smsPartCount,
  smsCostOre,
  classifySwedishNumber,
  billableMinutes,
  callCostOre,
  whisperCostOre,
  llmCostOre,
  usdToOre,
} from '../lib/costs/meter'
import { PRICE_VERSION, currentPriceList, priceListFor, llmPriceFor } from '../lib/costs/price-list'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Kommentarer beskriver ofta det som togs bort — mät på koden. */
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

test.describe('SMS-delar — där pengarna läcker tyst', () => {
  const a = (n: number) => 'a'.repeat(n)

  test('GSM-7: 160 tecken är en del, 161 är två', () => {
    expect(smsPartCount(a(160))).toBe(1)
    // Sammanfogade SMS offrar 7 positioner per del till UDH → 153, inte 160.
    expect(smsPartCount(a(161))).toBe(2)
    expect(smsPartCount(a(306))).toBe(2)
    expect(smsPartCount(a(307))).toBe(3)
  })

  test('svenska å ä ö kostar ingenting extra — de ligger i GSM-7', () => {
    expect(smsPartCount('å'.repeat(160))).toBe(1)
    expect(smsPartCount('Förhandsbesked på åtgärden är klart. Hälsningar Bygg & Co')).toBe(1)
  })

  test('EN emoji halverar utrymmet — hela meddelandet blir UCS-2', () => {
    // Det här är själva fyndet: 100 tecken + en emoji går från 1 till 2 delar,
    // alltså dubbel kostnad, utan att någon ser det.
    expect(smsPartCount(a(100))).toBe(1)
    expect(smsPartCount(a(100) + '😊')).toBe(2)
    expect(smsPartCount('😊' + a(60))).toBe(1)
  })

  test('escape-tecken tar två positioner var', () => {
    // 80 × '€' = 160 GSM-7-positioner = precis en del.
    expect(smsPartCount('€'.repeat(80))).toBe(1)
    expect(smsPartCount('€'.repeat(81))).toBe(2)
  })

  test('tomt meddelande är en del — operatören debiterar det ändå', () => {
    expect(smsPartCount('')).toBe(1)
    expect(smsCostOre('')).toBe(currentPriceList().sms_part_ore)
  })

  test('kostnaden är delar × delpris', () => {
    const p = currentPriceList()
    expect(smsCostOre(a(160))).toBe(p.sms_part_ore)
    expect(smsCostOre(a(307))).toBe(3 * p.sms_part_ore)
  })
})

test.describe('typografitvätten — den verkliga läckan var inte emoji', () => {
  const { normalizeForGsm7, normalizeIfCheaper } = require('../lib/costs/meter')

  test('tankstreck och typografiska citattecken tvingar UCS-2', () => {
    // Fyndet: två historiska SMS flaggades som UCS-2 och INGET av dem hade
    // emoji. De hade `—` och `"…"` — tecken AI:n skriver naturligt.
    const medTankstreck = 'a'.repeat(100) + ' — klart'
    expect(smsPartCount(medTankstreck)).toBe(2)
    expect(smsPartCount(normalizeForGsm7(medTankstreck))).toBe(1)
  })

  test('ett enda tankstreck dubblar kostnaden för ett kort meddelande', () => {
    const rent = 'Hej Andreas! Jag sag att du tittade pa offerten. Hor av dig.'
    const medTyp = 'Hej Andreas — jag såg att du tittade på offerten. Hör av dig.'
    expect(smsPartCount(rent)).toBe(1)
    expect(smsPartCount(medTyp)).toBe(1) // kort nog att rymmas ändå
    // ...men i ett meddelande nära gränsen är skillnaden hela kostnaden:
    const nästanFullt = 'å'.repeat(150)
    expect(smsPartCount(nästanFullt)).toBe(1)
    expect(smsPartCount(nästanFullt + '—')).toBe(3) // 151 tecken UCS-2
  })

  test('svenska tecken rörs aldrig — de är redan GSM-7', () => {
    const svenska = 'Håkan på Ängsvägen fick förslaget. Övrigt är klart.'
    expect(normalizeForGsm7(svenska)).toBe(svenska)
  })

  test('riktiga emoji lämnas orörda — då är UCS-2 avsiktligt', () => {
    // Att stryka en emoji vore att ändra vad hantverkaren faktiskt skickar.
    const medEmoji = 'Tack för jobbet! 😊'
    expect(normalizeForGsm7(medEmoji)).toContain('😊')
    // Och tvätten görs inte alls när den ändå inte sparar något:
    const r = normalizeIfCheaper('Kort text 😊')
    expect(r.sparadeDelar).toBe(0)
    expect(r.text).toBe('Kort text 😊')
  })

  test('tvätten sker bara när den faktiskt sparar delar', () => {
    const kort = 'Hej — allt klart!'
    // Ryms i en del även som UCS-2 → ingen anledning att röra texten.
    expect(normalizeIfCheaper(kort).sparadeDelar).toBe(0)
    expect(normalizeIfCheaper(kort).text).toBe(kort)
  })

  test('strypunkten tvättar innan den räknar och skickar', () => {
    const s = kod('lib/sms-send.ts')
    const tvätt = s.indexOf('normalizeIfCheaper(råMeddelande)')
    expect(tvätt, 'ingen tvätt vid strypunkten').toBeGreaterThan(-1)
    // Måste ske FÖRE både kostnadsberäkning och 46elks-anropet, annars
    // betalar vi för den otvättade texten.
    expect(s.indexOf('smsPartCount(message)')).toBeGreaterThan(tvätt)
    expect(s.indexOf('api.46elks.com/a1/sms')).toBeGreaterThan(tvätt)
  })
})

test.describe('samtal — fyra gånger prisskillnad på klassificeringen', () => {
  test('svenska mobilserier känns igen', () => {
    expect(classifySwedishNumber('+46701234567')).toBe('mobile')
    expect(classifySwedishNumber('+46 73 123 45 67')).toBe('mobile')
    expect(classifySwedishNumber('+46761234567')).toBe('mobile')
  })

  test('fast telefoni och utländskt skiljs åt', () => {
    expect(classifySwedishNumber('+4686001000')).toBe('landline')
    expect(classifySwedishNumber('+4631123456')).toBe('landline')
    // +47 är Norge — utländskt, ingen svensk prislista gäller.
    expect(classifySwedishNumber('+4712345678')).toBe('unknown')
    expect(classifySwedishNumber('')).toBe('unknown')
  })

  test('debitering per påbörjad minut', () => {
    expect(billableMinutes(0)).toBe(0)
    expect(billableMinutes(1)).toBe(1)
    expect(billableMinutes(60)).toBe(1)
    expect(billableMinutes(61)).toBe(2)
  })

  test('okänd destination prissätts som mobil — underskattning är farligare', () => {
    const p = currentPriceList()
    expect(callCostOre(120, 'mobile')).toBe(2 * p.call_mobile_ore_per_min)
    expect(callCostOre(120, 'landline')).toBe(2 * p.call_landline_ore_per_min)
    expect(callCostOre(120, 'unknown')).toBe(2 * p.call_mobile_ore_per_min)
    expect(callCostOre(0, 'mobile')).toBe(0)
  })
})

test.describe('Whisper och LLM', () => {
  test('Whisper räknas per sekund, inte per påbörjad minut', () => {
    expect(whisperCostOre(0)).toBe(0)
    // 30 s ska kosta ungefär halva minutpriset — inte ett helt.
    const halv = whisperCostOre(30)
    const hel = whisperCostOre(60)
    expect(halv).toBeLessThan(hel)
    expect(halv).toBeGreaterThan(0)
  })

  test('okänd modell bokförs som 0 — aldrig ett gissat pris', () => {
    expect(llmCostOre({ input_tokens: 1_000_000 }, 'gpt-hittepå')).toBe(0)
    expect(llmPriceFor('gpt-hittepå')).toBeNull()
  })

  test('cache-tokens prissätts separat och billigare än vanlig input', () => {
    const p = currentPriceList()
    const sonnet = llmPriceFor('claude-sonnet-4-6', p)!
    expect(sonnet.cache_read_ore_per_mtok).toBeLessThan(sonnet.in_ore_per_mtok)
    expect(sonnet.cache_write_ore_per_mtok).toBeGreaterThan(sonnet.in_ore_per_mtok)

    const bara_in = llmCostOre({ input_tokens: 1_000_000 }, 'claude-sonnet-4-6', p)
    const bara_cache = llmCostOre({ cache_read_input_tokens: 1_000_000 }, 'claude-sonnet-4-6', p)
    expect(bara_cache).toBeLessThan(bara_in)
  })

  test('Haiku är billigare än Sonnet är billigare än Opus', () => {
    const p = currentPriceList()
    const u = { input_tokens: 1_000_000, output_tokens: 1_000_000 }
    const haiku = llmCostOre(u, 'claude-haiku-4-5-20251001', p)
    const sonnet = llmCostOre(u, 'claude-sonnet-4-6', p)
    const opus = llmCostOre(u, 'claude-opus-4-7', p)
    expect(haiku).toBeLessThan(sonnet)
    expect(sonnet).toBeLessThan(opus)
  })

  test('USD-omräkningen är enda valutabryggan och ger heltal öre', () => {
    const öre = usdToOre(1)
    expect(öre).toBe(currentPriceList().usd_ore)
    expect(Number.isInteger(öre)).toBe(true)
  })
})

test.describe('prislistan är versionerad och bor på ett ställe', () => {
  test('nuvarande version pekar på sig själv', () => {
    expect(currentPriceList().version).toBe(PRICE_VERSION)
    expect(priceListFor(PRICE_VERSION).version).toBe(PRICE_VERSION)
  })

  test('varje nyckel i registret matchar sitt eget version-fält', () => {
    const { PRICE_LISTS } = require('../lib/costs/price-list')
    for (const [nyckel, lista] of Object.entries(PRICE_LISTS) as Array<[string, any]>) {
      expect(lista.version, `nyckeln ${nyckel} bär fel version`).toBe(nyckel)
    }
  })

  test('okänd version faller tillbaka i stället för att krascha', () => {
    expect(priceListFor('1999-01').version).toBe(PRICE_VERSION)
  })

  test('inköpspriser förekommer inte som literaler utanför prislistan', () => {
    // LLM-priserna bodde på TRE ställen med kommentaren "håll i synk om
    // priserna ändras" — vilket är precis det en delad källa gör onödigt.
    // De flyttade hit i etapp 5; testet fångar om de återinförs.
    const flyttade = [
      'lib/agents/shared/thinking-call.ts',
      'lib/egenkontroll/photo-assessment.ts',
      'lib/agents/hanna/avtal-forslag.ts',
    ]
    for (const fil of flyttade) {
      const s = kod(fil)
      // Prisliteraler i token-beräkningar: talet dividerat med en miljon.
      expect(s, `${fil} har ett LLM-pris inbakat igen`).not.toMatch(/1_000_000\)\s*\*\s*\d/)
      expect(s, `${fil} räknar inte via prislistan`).toContain('llmCostUsd')
    }
    // Telefonipriserna får inte heller läcka ut i mätaren.
    expect(kod('lib/costs/meter.ts')).not.toMatch(/\b(0\.52|0\.57)\b/)
  })
})

test.describe('LLM-kostnaden: samma värde, två mottagare', () => {
  test('logAgentRun skriver både governorn och boken från samma variabel', () => {
    const s = kod('lib/agents/shared/cost-guard.ts')
    // agent_runs.estimated_cost är dygnstaket (USD), cost_event är COGS (öre).
    expect(s).toContain("estimated_cost: debug.estimated_cost_usd")
    expect(s).toContain("resource: 'llm'")
    expect(s).toContain('usdToOre(debug.estimated_cost_usd)')
    // Samma refId knyter bokraden till agentkörningen.
    expect(s).toContain("refType: 'agent_run'")
  })

  test('ingen annan fil bokför LLM-kostnad — en skrivare per faktum', () => {
    const träffar: string[] = []
    const gå = (dir: string) => {
      let poster
      try {
        poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      } catch { return }
      for (const f of poster) {
        const rel = `${dir}/${f.name}`
        if (f.isDirectory()) {
          if (f.name === 'node_modules' || f.name === '.next') continue
          gå(rel)
        } else if (/\.tsx?$/.test(f.name)) {
          if (/resource:\s*'llm'/.test(kod(rel))) träffar.push(rel)
        }
      }
    }
    for (const rot of ['lib', 'app']) gå(rot)
    expect(träffar, `flera skrivare av LLM-kostnad: ${träffar.join(', ')}`)
      .toEqual(['lib/agents/shared/cost-guard.ts'])
  })

  test('dollar hamnar aldrig direkt i cost_ore', () => {
    // usdToOre är enda valutabryggan. Ett USD-tal i en öreskolumn blir fel
    // med en faktor tio, vilket ser rimligt ut och därför inte upptäcks.
    const s = kod('lib/agents/shared/cost-guard.ts')
    expect(s).not.toMatch(/costOre:\s*debug\.estimated_cost_usd/)
  })

  test('små anrop nollas inte av avrundning — taket summerar många', () => {
    // llmCostOre avrundar per rad, men USD-vägen (som cost-guardens tak
    // räknar på) måste behålla bråkdelarna. Ett anrop på 1000 tokens kostar
    // långt under ett öre.
    const { llmCostUsd } = require('../lib/costs/meter')
    // 100 in + 20 ut på Haiku ≈ 0,2 öre — under boksföringens upplösning.
    const pyttelitet = { input_tokens: 100, output_tokens: 20 }
    expect(llmCostOre(pyttelitet, 'claude-haiku-4-5-20251001')).toBe(0)
    expect(
      llmCostUsd(pyttelitet, 'claude-haiku-4-5-20251001'),
      'USD-vägen nollades av avrundning — taket skulle urholkas'
    ).toBeGreaterThan(0)
  })
})

test.describe('COGS-mätaren etapp 1 — de tre förut omätta ytorna (2026-08-14)', () => {
  // tasks/cost-cap-analysis.md §7: agent-triggerns flat-taxa, Matte-chatten,
  // den publika widgeten var kodbasens tre största mätluckor. Detta facit
  // låser att de faktiskt går genom mätaren nu — inte bara att de gjorde det
  // dagen de byggdes.

  test('agent-triggern räknar riktig kostnad per modell — flat-taxan är borta', () => {
    const s = kod('app/api/agent/trigger/route.ts')
    expect(s, 'den gamla blandtaxan finns kvar').not.toMatch(/totalTokens\s*\*\s*0\.000009/)
    expect(s).toContain('llmCostUsd(cumulativeUsage, MODEL)')
    expect(s).toContain('meterDirectLlmCall({')
    expect(s).toContain("refType: 'agent_run'")
  })

  test('Matte-chatten bokför kostnad — tidigare helt omätt', () => {
    const s = kod('app/api/matte/chat/route.ts')
    expect(s).toContain('meterDirectLlmCall({')
    expect(s).toContain("refType: 'matte_chat_turn'")
    // Bokförs på VARJE return-väg (klart-svar, pending_confirmation och,
    // sedan efb8d69 2026-08-31, offertgeneratorns create_quote_draft-gren),
    // inte bara den vanliga — annars läcker en tyst gren igen. Talet var
    // stelt kodat till 2 och blev rött på main när tredje grenen tillkom.
    expect(s.match(/await bokforMatteUsage\(/g)?.length).toBe(3)
  })

  test('den publika widgeten kör Haiku och mäts, inte längre obevakad Sonnet', () => {
    const s = kod('app/api/widget/chat/route.ts')
    expect(s, 'widgeten kör fortfarande Sonnet').not.toMatch(/model:\s*'claude-sonnet-4-6'/)
    expect(s).toContain("WIDGET_MODEL = 'claude-haiku-4-5-20251001'")
    expect(s).toContain('meterDirectLlmCall({')
  })
})

test.describe('spärrhaken — läckaget får bara krympa', () => {
  /**
   * ═══ VARFÖR EN ALLOWLIST OCH INTE EN REFAKTORERING ═══
   *
   * 26 av 27 filer skickar SMS genom en egen fetch mot api.46elks.com i
   * stället för genom sendSmsViaElks. Konsekvensen är inte främst omätt
   * kostnad — det är att **opt-out-spärren mot customer.sms_opt_out kringgås**.
   * En kund som svarat STOPP får i dag SMS ändå från 26 av 27 vägar.
   *
   * Att migrera allt i ett svep vore en big bang mot 26 filer där varje fil
   * dessutom FÅR ett nytt beteende (spärren slår till). Listan nedan gör
   * skulden till en nedräkning i stället: den får krympa, aldrig växa. Ny
   * kod som lägger till en egen 46elks-fetch fäller det här testet.
   *
   * Samma teknik som tests/voice-boundaries.spec.ts använder för
   * voice/execute.
   */
  const KVAR_ATT_MIGRERA = [
    // ── Batch 1 MIGRERAD 2026-08-08 ──────────────────────────────────────
    // sms/send, campaigns/send, reminders, quotes/send, invoices/send går nu
    // genom sendSmsViaElks. Beteendeändring: opt-out-spärren gäller dem alla.
    // I sms/send (hantverkarens EGNA manuella utskick) returneras 409 med ett
    // tydligt besked i stället för tyst bortfall — hen ska kunna ringa i
    // stället, inte undra varför inget hände.
    // ── Batch 2 MIGRERAD 2026-08-08 ──────────────────────────────────────
    // approve-actions ×2, automation-engine, smart-communication, on-my-way,
    // suggestions/approve ×2, agentens send_sms. Här betyder opt-out mest:
    // ingen människa läser dessa innan de går. Två sidofynd: avsändaren var
    // hårdkodad till 'Handymate' i fyra av dem (kunden såg vår produkt i
    // stället för sin hantverkare), och lib/approve-actions.ts påstår i sitt
    // filhuvud att den används av både manuell och automatisk godkännande —
    // men suggestions/approve har en EGEN kopia av alla sex handlers.
    // ── Batch 3 MIGRERAD 2026-08-08 ──────────────────────────────────────
    // maintenance (recensionsförfrågan), monthly-review, morning-report.
    // Två av tre går till HANTVERKAREN själv och använder recipient:'owner'
    // — se facit "opt-out gäller kunder, inte hantverkaren" nedan.
    // ── Batch 4 MIGRERAD 2026-08-08 — SVANSEN ÄR SLUT ────────────────────
    // field-reports ×2, work-orders, projektsteg, kundportalen,
    // fakturapåminnelsen, Matte-chatten, actions ×2, referral, golden-path.
    //
    // Alla 24 migrerbara vägar går nu genom sendSmsViaElks. Kvar är bara de
    // tre nedan, som medvetet aldrig migreras.
    // Migreras medvetet ALDRIG:
    // Deno edge function — kan inte importera lib/, och det är oklart om den
    // ens är deployad (se docs/audits/ROSTVAGAR_KARTLAGGNING_2026-08-08.md).
    'supabase/functions/scheduled-triggers/index.ts',
    // (lib/e2e-deal-flow.ts stod först här som "testharness" — fel läsning
    //  av namnet. "E2E" betyder end-to-end DEAL FLOW, hela affärslivscykeln,
    //  anropad från app/api/deals/[id]/flow. Den är migrerad.)
    // Utvecklarverktyg — men det skickar RIKTIGA SMS som kostar riktiga
    // pengar. Nåbarhet i produktion behöver kontrolleras separat.
    'app/api/debug/sms/route.ts',
    // Internt driftlarm till Handymates EGET team (launch desk, v165/v166,
    // klassat 2026-08-25): fast mottagarlista via env
    // (HANDYMATE_SUPPORT_ALERT_PHONES), inget business_id, ingen kund —
    // opt-out-spärren och kundkvoten är per definition inte tillämpliga.
    // Filens eget filhuvud dokumenterar avgränsningen; facit-vakten i
    // tests/facit-handymate-team-alert.spec.ts låser att kvotkoll INTE
    // smyger in (den ska inte gå genom strypunkten).
    'lib/notifications/handymate-team-alert.ts',
  ]

  /** Strypunkten själv ska förstås anropa 46elks — den är målet, inte läckan. */
  const STRYPUNKTEN = 'lib/sms-send.ts'

  function hittaCallsites(): string[] {
    const träffar: string[] = []
    const gå = (dir: string) => {
      let poster
      try {
        poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      } catch {
        return
      }
      for (const f of poster) {
        const rel = `${dir}/${f.name}`
        if (f.isDirectory()) {
          if (f.name === 'node_modules' || f.name === '.next') continue
          gå(rel)
        } else if (/\.tsx?$/.test(f.name)) {
          if (read(rel).includes('api.46elks.com/a1/sms')) träffar.push(rel)
        }
      }
    }
    for (const rot of ['lib', 'app', 'supabase']) gå(rot)
    return träffar.sort()
  }

  test('ingen NY väg kringgår strypunkten', () => {
    const faktiska = hittaCallsites().filter(f => f !== STRYPUNKTEN)
    const tillåtna = new Set(KVAR_ATT_MIGRERA)
    const nya = faktiska.filter(f => !tillåtna.has(f))
    expect(
      nya,
      `Nya SMS-vägar som kringgår sendSmsViaElks (och därmed opt-out-spärren): ${nya.join(', ')}`
    ).toEqual([])
  })

  test('listan städas när en väg migrerats — inga döda poster', () => {
    // Utan detta blir allowlisten en kyrkogård: en migrerad fil står kvar och
    // listan slutar berätta hur mycket som återstår.
    const faktiska = new Set(hittaCallsites())
    const döda = KVAR_ATT_MIGRERA.filter(f => !faktiska.has(f))
    expect(
      döda,
      `Migrerade — ta bort ur KVAR_ATT_MIGRERA: ${döda.join(', ')}`
    ).toEqual([])
  })

  test("opt-out gäller kunder, inte hantverkaren — och listan är kort", () => {
    // customer.sms_opt_out är ett KUNDSKYDD. Några utskick går till företagets
    // ägare eller medarbetare, inte till kunden. Råkar deras nummer finnas som
    // en kundrad i samma företag med opt-out satt — vanligt i test- och
    // demokonton — skulle interna rapporter/notiser annars tyst försvinna.
    //
    // Flaggan är farlig om den sprider sig till kundmeddelanden, så listan
    // hålls kort och explicit här.
    const TILLATNA_INTERNA_SITES = [
      'lib/agent/morning-report.ts',
      'app/api/cron/monthly-review/route.ts',
      'lib/leads/golden-path.ts',
      'lib/onboarding/first-event-sms.ts',
      'lib/referral/discounts.ts',
      'app/api/work-orders/[id]/send/route.ts',
      'app/api/field-reports/[id]/sign/route.ts',
      'app/api/public/book/[slug]/route.ts',
      // Etapp 0 (2026-08-27, OUTBOUND_COMMUNICATION_INVENTORY 8.1): ägar-
      // notiser som tidigare gick via den sessions-grindade /api/sms/send
      // (401) och nu går genom strypunkten — till ÄGAREN, inte kunden.
      'lib/projects/auto-invoice-on-complete.ts',
      'lib/projects/create-from-lead.ts',
      'lib/projects/create-from-quote.ts',
    ]
    const träffar: string[] = []
    const gå = (dir: string) => {
      let poster
      try { poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }) } catch { return }
      for (const f of poster) {
        const rel = `${dir}/${f.name}`
        if (f.isDirectory()) {
          if (f.name === 'node_modules' || f.name === '.next') continue
          gå(rel)
        } else if (/\.tsx?$/.test(f.name)) {
          if (/recipient:\s*'internal'/.test(kod(rel))) träffar.push(rel)
        }
      }
    }
    for (const rot of ['lib', 'app']) gå(rot)
    expect(träffar.sort(), `oväntad internal-flagga: ${träffar.join(', ')}`)
      .toEqual(TILLATNA_INTERNA_SITES.sort())

    // Callsite-kontraktet går genom samma centrala grind; ingen callsite
    // implementerar ett eget undantag från kundskyddet.
    const s = kod('lib/sms-send.ts')
    expect(s).toContain('gateCustomerSms({')
    expect(s).toContain('recipient,')
    expect(s).toContain('purpose,')
  })

  test('strypunkten mäter kostnad och delar', () => {
    const s = kod(STRYPUNKTEN)
    expect(s).toContain('smsPartCount(message)')
    expect(s).toContain("resource: 'sms'")
    expect(s).toContain('sms_parts: smsParts')
    // Bara lyckade utskick kostar — ett avvisat SMS debiteras inte.
    expect(s).toContain('success ? smsCostOre(message) : 0')
  })
})

test.describe('billing-sidan visar inga falska siffror', () => {
  test('mätarna som alltid var 0 är borta', () => {
    // Två oberoende fel samtidigt: usage_record fylldes aldrig, OCH formen
    // matchade inte (setUsage fick { period, usage } men renderingen läste
    // usage?.calls?.used). De hade visat 0 även med full tabell.
    const s = kod('app/dashboard/settings/billing/page.tsx')
    for (const falsk of ['usage?.calls', 'usage?.ai', 'usage?.storage']) {
      expect(s, `${falsk} renderas fortfarande`).not.toContain(falsk)
    }
    expect(s, 'den döda rutten anropas fortfarande').not.toContain("fetch('/api/billing/usage')")
    // SMS-mätaren SKA vara kvar — den läser sms_usage och är sann.
    expect(s).toContain('smsUsage?.sent')
  })

  test('rutterna slutar rapportera förbrukning ur den döda tabellen', () => {
    for (const fil of ['app/api/billing/route.ts', 'app/api/billing/usage/route.ts']) {
      expect(kod(fil), `${fil} läser usage_record`).not.toContain("from('usage_record')")
    }
    // Rollgrinden i /api/billing/usage rörs inte (permission-contract).
    expect(kod('app/api/billing/usage/route.ts')).toContain('usage_measurement')
  })

  test('COGS ligger bakom adminspärren, inte på kundens sida', () => {
    const admin = kod('app/api/admin/metrics/route.ts')
    expect(admin).toContain('getAllTenantCogs')
    expect(admin).toContain('cogs_per_tenant')
    // Fail-soft: kostnadsläsning får inte fälla hela adminpanelen.
    expect(admin).toContain('cogsNote')

    const kundsida = kod('app/dashboard/settings/billing/page.tsx')
    expect(kundsida, 'COGS läcker till kundens yta').not.toMatch(/cogs|cost_ore|costOre/i)
  })
})

test.describe('Whisper och samtalsminuter', () => {
  test('Whisper bokförs där ljudlängden är känd', () => {
    const s = kod('app/api/voice/transcribe/route.ts')
    expect(s).toContain("resource: 'whisper'")
    expect(s).toContain('whisperCostOre(ljudSekunder)')
    // Utan känd längd bokförs inget — hellre omätt än gissat.
    expect(s).toContain('ljudSekunder > 0')
  })

  test('samtalsminuter bokförs INTE än — payloaden ska avstämmas först', () => {
    // Medvetet ofärdigt. Ett antagande om duration-fältets enhet är fel med
    // en faktor 60, så steget börjar med en loggad payload.
    const s = kod('app/api/voice/missed/route.ts')
    expect(s).toContain('RÅ PAYLOAD för kostnadsmätning')
    expect(s, 'prislogik infördes innan payloaden var avstämd')
      .not.toContain("resource: 'call_out'")
  })

  test('utgående samtal via Handymate bokförs i hangup-webhooken — och bara där', () => {
    // "Ring via Handymate" (2026-09-01) är den första vägen där VI startar
    // ett samtal medvetet och vet att båda benen (kund + hantverkare) är
    // våra. Kostnaden bokförs i whenhangup, där duration är känd, som
    // resource 'call_out'. Payloaden loggas rå ändå — avstämningen mot
    // 46elks-fakturan gäller fortfarande.
    const s = kod('app/api/voice/outbound/hangup/route.ts')
    expect(s).toContain('RÅ PAYLOAD för kostnadsmätning')
    expect(s).toContain("resource: 'call_out'")
    // Inte i voice_start-routen: där finns ingen duration att bokföra.
    expect(kod('app/api/voice/outbound/route.ts')).not.toContain("resource: 'call_out'")
  })
})

test.describe('hälsosonden — en tyst mätare måste gå att fråga', () => {
  const s = kod('app/api/admin/cost-probe/route.ts')

  test('sonden är adminspärrad som övriga adminrutter', () => {
    expect(s).toContain('isAdmin(request)')
    expect(s).toContain('status: 403')
  })

  test('den LÄSER TILLBAKA — recordCost:s tystnad går inte att lita på', () => {
    // recordCost sväljer sina fel. Ett svar byggt på att den "inte kastade"
    // hade rapporterat grönt på en trasig mätare.
    const skriv = s.indexOf('recordCost({')
    const läs = s.indexOf(".from('cost_event')")
    expect(skriv).toBeGreaterThan(-1)
    expect(läs, 'sonden läser inte tillbaka raden').toBeGreaterThan(skriv)
    expect(s).toContain('matare_fungerar: !!data')
  })

  test('sonden kostar noll — den får inte förorena rapporten', () => {
    expect(s).toContain('costOre: 0')
    expect(s).toContain("refType: 'probe'")
  })
})

test.describe('ägarskapsgränsen — planens viktigaste test', () => {
  test('kvot-modulen känner inte till kostnad', () => {
    // sms_usage äger KVOT (vad vi tar av kunden). Kostnad i samma modul gör
    // att ingen läsare kan veta vilken siffra som är vilken.
    const s = kod('lib/sms-usage.ts')
    expect(s, 'kvotmodulen har fått kostnadsbegrepp').not.toMatch(/cost_event|cost_ore/)
  })

  test('prislistan och mätaren läser ingen databas', () => {
    // Rena funktioner. Går de mot DB blir de otestbara och kan fälla ett
    // utskick — se fail-soft-regeln i record.ts.
    for (const fil of ['lib/costs/price-list.ts', 'lib/costs/meter.ts']) {
      expect(kod(fil), `${fil} rör databasen`).not.toMatch(/supabase|from\(['"]/)
    }
  })
})
