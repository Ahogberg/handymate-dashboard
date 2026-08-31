/**
 * Facit för artikelregistret (2026-08-06).
 *
 * ═══ VARFÖR DEN HÄR VAKTEN BYGGS NU ═══
 *
 * Registret innehåller i dag 214 artiklar fördelade på 13 branscher — men en
 * enskild kund får bara sin egen bransch plus tre gemensamma, alltså 12–24
 * stycken. Planen är att utöka rejält, och då blir varje invariant som inte
 * vaktas en femdubbling av samma fel.
 *
 * `sku` är dessutom inte bara ett artikelnummer i offerten: det är
 * SEED-IDEMPOTENSNYCKELN. Två artiklar med samma sku betyder att omseedning
 * skriver över fel rad, och att en kunds egna priser kan hamna på en annan
 * artikel än den han satte dem på. Unikheten är alltså inte kosmetik.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/product-register.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  getDefaultProducts,
  getSeededBranches,
  resolveBranches,
  type ProductDefault,
} from '../lib/product-defaults'
import fs from 'fs'
import path from 'path'
import { unitFamily } from '../lib/products/match-generated-items'

function allProducts(): ProductDefault[] {
  const seen = new Map<string, ProductDefault>()
  for (const branch of getSeededBranches()) {
    for (const p of getDefaultProducts(branch)) seen.set(p.sku, p)
  }
  return Array.from(seen.values())
}

/** Alla artiklar per bransch, inklusive de gemensamma. */
function perBranch(): Array<{ branch: string; products: ProductDefault[] }> {
  return getSeededBranches().map(branch => ({ branch, products: getDefaultProducts(branch) }))
}

test.describe('sku — seed-idempotensnyckeln', () => {
  test('inga dubbletter inom en bransch', () => {
    // Två artiklar med samma sku betyder att omseedning skriver över fel rad
    // och att kundens egna priser kan hamna på fel artikel.
    for (const { branch, products } of perBranch()) {
      const skus = products.map(p => p.sku)
      const dupes = skus.filter((s, i) => skus.indexOf(s) !== i)
      expect(dupes, `${branch} har dubbla artikelnummer`).toEqual([])
    }
  })

  test('samma sku betyder alltid samma artikel över branschgränsen', () => {
    // De gemensamma raderna (HM-GEN-*) delas mellan branscher. Om ett sku
    // återanvänds för olika artiklar i olika branscher blir registret
    // obegripligt — och seed-idempotensen fel.
    const byKey = new Map<string, ProductDefault>()
    const conflicts: string[] = []
    for (const { products } of perBranch()) {
      for (const p of products) {
        const known = byKey.get(p.sku)
        if (known && known.name !== p.name) conflicts.push(`${p.sku}: "${known.name}" vs "${p.name}"`)
        else byKey.set(p.sku, p)
      }
    }
    expect(conflicts, 'Samma artikelnummer används för olika artiklar').toEqual([])
  })

  test('formatet är HM-<BRANSCH>-<NNN>', () => {
    // Formatet är kontraktet mot Easoft-vanan: ett globalt nummer som är
    // detsamma hos alla kunder, där var och en sätter sitt eget pris.
    const bad = allProducts().filter(p => !/^HM-[A-ZÅÄÖ]{2,5}-\d{3}$/.test(p.sku))
    expect(bad.map(p => p.sku), 'Artikelnummer som bryter formatet').toEqual([])
  })
})

test.describe('prissättning — det svåra, och det som kunden faktiskt bedömer', () => {
  test('noll är tillåtet — men då exakt noll', () => {
    // Registret får seedas PRISLÖST. Ett gissat pris är sämre än inget, för
    // systemet quotar det med full självsäkerhet i offerten, telefonagenten
    // och storefronten. Priset förtjänas i stället av användning: hantverkaren
    // skriver in det första gången och får då frågan om det ska bli standard
    // (lib/products/pricing-state.ts).
    //
    // Men noll måste vara ETT MEDVETET tillstånd, inte en glidning. Ett
    // negativt pris eller ett öresbelopp är alltid ett skrivfel — och de
    // fångas här, eftersom gränssnittet läser allt ≤ 0 som "osatt" och därmed
    // skulle dölja dem.
    const glidande = allProducts().filter(p => p.unit_price !== 0 && p.unit_price < 1)
    expect(glidande.map(p => `${p.sku} ${p.unit_price}`), 'Priser som varken är noll eller ett riktigt pris').toEqual([])
  })

  test('inga orimliga prisnivåer', () => {
    // Trubbig sanity, inte en åsikt om marknaden: en artikel över 500 000 kr
    // är nästan säkert ett skrivfel med en nolla för mycket. Christoffers
    // branschkoll är den riktiga valideringen.
    const orimliga = allProducts().filter(p => p.unit_price > 500_000)
    expect(orimliga.map(p => `${p.sku} ${p.unit_price}`), 'Prisnivåer som ser ut som skrivfel').toEqual([])
  })
})

test.describe('ROT och arbetsandel — de fält som blir fel pengar', () => {
  test('arbetsandelen ligger mellan 0 och 1', () => {
    const fel = allProducts().filter(p => !(p.labor_share >= 0 && p.labor_share <= 1))
    expect(fel.map(p => `${p.sku}: ${p.labor_share}`), 'labor_share utanför 0–1').toEqual([])
  })

  test('en artikel med avdrag måste ha arbetsandel över noll', () => {
    // ROT/RUT räknas på ARBETSKOSTNADEN. Ett avdrag på en rad med
    // labor_share = 0 ger avdrag på noll kronor — kunden lovas något som
    // inte blir av, vilket är värre än att inte lova det.
    const tomma = allProducts().filter(p => p.deduction !== null && p.labor_share === 0)
    expect(tomma.map(p => p.sku), 'Avdrag på artiklar utan arbetsandel').toEqual([])
  })

  test('ren material har varken avdrag eller arbetsandel', () => {
    const fel = allProducts().filter(p => p.category === 'material' && p.labor_share > 0.5)
    expect(fel.map(p => `${p.sku}: ${p.labor_share}`), 'Materialartiklar med hög arbetsandel — troligen fel kategori').toEqual([])
  })

  test('en arbetsartikel är aldrig material i legacy-fältet', () => {
    // legacy_category matar telefonagenten, widgeten och storefronten.
    //
    // Invarianten är INTE att arbete måste vara 'labor': registret skiljer
    // medvetet på 'labor' (timdebiterat) och 'service' (fastpris), och 122 av
    // 144 arbetsartiklar är fastpristjänster. Den skillnaden är riktig.
    //
    // Det som däremot ALDRIG får hända är att en arbetsartikel kallas
    // 'material' — då quotar telefonagenten den som material och ROT-splitten
    // försvinner. Kunden lovas ett avdrag som aldrig blir av.
    const fel = allProducts().filter(p =>
      (p.category === 'arbete' && p.legacy_category === 'material') ||
      (p.category === 'material' && p.legacy_category !== 'material'),
    )
    expect(fel.map(p => `${p.sku}: ${p.category}/${p.legacy_category}`), 'Arbete och material blandas ihop').toEqual([])
  })
})

test.describe('täckning — varje bransch ska duga till en riktig offert', () => {
  test('minst tolv artiklar per bransch', () => {
    // Tröskeln höjdes till 12 när banken fylldes på (commit 1b319665).
    for (const { branch, products } of perBranch()) {
      expect(products.length, `${branch} har för få artiklar`).toBeGreaterThanOrEqual(12)
    }
  })

  test('varje bransch har både arbete och material', () => {
    // En bank med bara arbetsrader tvingar fram fritext för allt material,
    // och då tappar offerten både marginalunderlag och ROT-splitten.
    for (const { branch, products } of perBranch()) {
      expect(products.some(p => p.category === 'arbete'), `${branch} saknar arbetsartiklar`).toBe(true)
      expect(products.some(p => p.category === 'material'), `${branch} saknar materialartiklar`).toBe(true)
    }
  })

  test('varje bransch har minst en timdebiterad rad', () => {
    // is_favorite sätts på kategori 'arbete' med enhet 'tim' (seed-defaults).
    // Utan en sådan får branschen noll favoriter, och snabbvalen fylls
    // alfabetiskt i stället för med det man faktiskt använder.
    for (const { branch, products } of perBranch()) {
      const tim = products.filter(p => p.category === 'arbete' && p.unit === 'tim')
      expect(tim.length, `${branch} får noll favoriter i snabbvalen`).toBeGreaterThan(0)
    }
  })
})

test.describe('svenska — registret är kundvänt', () => {
  test('inga namn med engelska nyckelord eller platshållare', () => {
    const misstankta = allProducts().filter(p =>
      /\b(TODO|TBD|placeholder|test|dummy|lorem)\b/i.test(p.name),
    )
    expect(misstankta.map(p => p.sku), 'Platshållarnamn i registret').toEqual([])
  })

  test('varje artikel har ett namn värt namnet', () => {
    const korta = allProducts().filter(p => p.name.trim().length < 3)
    expect(korta.map(p => p.sku), 'Artiklar utan begripligt namn').toEqual([])
  })

  test('enheter är svenska hantverksenheter ur en känd mängd', () => {
    // Enheten syns för kunden i offerten och matar dessutom
    // enhetsfamiljekontrollen i produktmatchningen (match-generated-items).
    //
    // Listan är svenska branschenheter, inte SI: 'kvm' och 'kbm' används i
    // praktiken av hantverkare, 'lpm' är löpmeter. Lägg till nya här ENDAST
    // tillsammans med en post i UNIT_FAMILIES — annars kan en AI-rad i 'm3'
    // inte matcha en bankartikel i 'kbm', vilket var precis vad den här
    // testen avslöjade 2026-08-06.
    const kanda = new Set([
      'tim', 'st', 'm', 'm2', 'm²', 'kvm', 'lpm', 'löpm', 'm3', 'm³', 'kbm',
      'kg', 'ton', 'l', 'liter', 'dag', 'vecka', 'månad',
      'paket', 'rulle', 'set', 'säck', 'hink',
    ])
    const okanda = allProducts().filter(p => !kanda.has(p.unit.toLowerCase()))
    expect(okanda.map(p => `${p.sku}: ${p.unit}`), 'Okända enheter — lägg till i listan OCH i UNIT_FAMILIES om de är rätt').toEqual([])
  })

  test('varje enhet i registret har en enhetsfamilj i produktmatchningen', () => {
    // Kopplingen som saknades: registret använde 'kbm' medan UNIT_FAMILIES
    // bara kände 'm3'/'m³'. En volymrad från AI:n kunde alltså aldrig
    // fuzzy-matcha en volymartikel i banken — tyst, och omöjligt att se.
    const utan = allProducts().filter(p => {
      const family = unitFamily(p.unit)
      // unitFamily faller tillbaka på enheten själv för okända — då är det
      // ingen familj, bara ett eko.
      return !family || family === p.unit.trim().toLowerCase()
    })
    // 'säck', 'hink', 'paket', 'rulle', 'set' saknar familj med flit: de är
    // förpackningsformer som bara ska matcha sig själva.
    const forpackning = new Set(['säck', 'hink', 'paket', 'rulle', 'set', 'dag', 'vecka', 'månad'])
    const oväntade = utan.filter(p => !forpackning.has(p.unit.toLowerCase()))
    expect(
      oväntade.map(p => `${p.sku}: ${p.unit}`),
      'Enheter utan familj i UNIT_FAMILIES — produktmatchningen kan aldrig fuzzy-matcha dem',
    ).toEqual([])
  })
})

test.describe('SANITY — vakten läser faktiskt registret', () => {
  test('registret är inte tomt och har alla branscher', () => {
    // Utan detta kan getSeededBranches gå sönder och hela sviten bli grön
    // av fel skäl.
    expect(getSeededBranches().length).toBeGreaterThanOrEqual(13)
    expect(allProducts().length).toBeGreaterThanOrEqual(200)
  })

  test('okänd bransch faller tillbaka på ett bibliotek, inte på tomhet', () => {
    expect(getDefaultProducts('finns-inte').length).toBeGreaterThan(0)
  })
})

test.describe('prislösa artiklar når aldrig kundvända ytor (B2: vyn äger filtret)', () => {
  test('getPublicPriceList filtrerar sales_price > 0 — källkontrakt', () => {
    // Produktbanken kan visa "Sätt pris" i stället för ett belopp; en röst/
    // widget/storefront kan inte. Filtret bor nu i den kanoniska vyn
    // (lib/products/price-list-view.ts) i stället för i en seed-funktion —
    // getDefaultPriceList är borttagen (price_list var död, aldrig en rad).
    const vy = fs.readFileSync(path.resolve(__dirname, '../lib/products/price-list-view.ts'), 'utf8')
    expect(vy).toContain(".gt('sales_price', 0)")
    expect(vy).toContain(".eq('is_active', true)")
  })

  test('men produktbanken behåller dem', () => {
    // Filtret får bara gälla den kundvända vyn. Försvinner de ur products är
    // hela långsvansen borta och hantverkaren skriver fritext igen.
    const prislosa = getDefaultProducts('electrician').filter(p => p.unit_price === 0)
    expect(prislosa.length).toBeGreaterThan(0)
  })

  test('varje bransch har prissatta rader att visa kundvänt', () => {
    // Om allt seedas prislöst blir widget/storefront stumma om priser.
    for (const branch of getSeededBranches()) {
      const prissatta = getDefaultProducts(branch).filter(p => p.unit_price > 0)
      expect(prissatta.length, `${branch} saknar prissatta rader`).toBeGreaterThan(0)
    }
  })
})

test.describe('flera branscher — verkligheten är sällan en bransch', () => {
  test('två branscher ger båda sortimenten', () => {
    // Bee arbetar både som elektriker och med bygg. Ett påtvingat val hade
    // gett en halv artikelbank åt en hantverkare som gör hela jobbet.
    const bada = getDefaultProducts(['electrician', 'construction'])
    const bara = getDefaultProducts('electrician')
    expect(bada.length).toBeGreaterThan(bara.length)
    expect(bada.some(p => p.sku.startsWith('HM-EL-'))).toBe(true)
    expect(bada.some(p => p.sku.startsWith('HM-BYG-'))).toBe(true)
  })

  test('sammanslagningen ger aldrig dubbletter på sku', () => {
    // sku är seed-idempotensnyckeln. En dubblett får omseedning att skriva
    // över fel rad och kundens egna priser att hamna på fel artikel.
    for (const par of [
      ['electrician', 'construction'],
      ['carpenter', 'construction'],
      ['plumber', 'electrician', 'construction'],
    ]) {
      const skus = getDefaultProducts(par).map(p => p.sku)
      expect(new Set(skus).size, `Dubbletter i ${par.join(' + ')}`).toBe(skus.length)
    }
  })

  test('de gemensamma raderna kommer med exakt en gång', () => {
    const skus = getDefaultProducts(['electrician', 'construction']).map(p => p.sku)
    expect(skus.filter(s => s === 'HM-GEN-901')).toHaveLength(1)
  })

  test('en okänd extrabransch späder inte ut den kända', () => {
    // ['electrician', 'nonsens'] ska ge elsortimentet — inte elsortimentet
    // plus allmängodset ur 'other'-fallbacken.
    const blandat = getDefaultProducts(['electrician', 'finns-inte'])
    const rent = getDefaultProducts('electrician')
    expect(blandat.map(p => p.sku).sort()).toEqual(rent.map(p => p.sku).sort())
  })

  test('tom lista faller tillbaka, den kraschar inte', () => {
    expect(getDefaultProducts([]).length).toBeGreaterThan(0)
  })
})

test.describe('branschupplösningen — vilken kolumn som gäller', () => {
  test('branch går före industry', () => {
    expect(resolveBranches({ branch: 'electrician', industry: 'plumber' })).toEqual(['electrician'])
  })

  test('industry är reserv för konton som bara har den', () => {
    expect(resolveBranches({ branch: null, industry: 'plumber' })).toEqual(['plumber'])
  })

  test('utan bransch alls blir det other, inte tomt', () => {
    expect(resolveBranches({})).toEqual(['other'])
  })

  test('huvudbranschen står först — den vinner vid delade artiklar', () => {
    const b = resolveBranches({ branch: 'electrician', secondary_branches: ['construction'] })
    expect(b[0]).toBe('electrician')
    expect(b).toContain('construction')
  })

  test('huvudbranschen upprepas aldrig om den råkat hamna i listan', () => {
    expect(resolveBranches({ branch: 'electrician', secondary_branches: ['electrician', 'construction'] }))
      .toEqual(['electrician', 'construction'])
  })

  test('rader seedade före v93 saknar kolumnen — det får inte krascha', () => {
    expect(resolveBranches({ branch: 'electrician', secondary_branches: null })).toEqual(['electrician'])
  })
})
