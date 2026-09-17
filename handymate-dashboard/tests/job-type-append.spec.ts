import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { byggPafyllnadsrader } from '../lib/quotes/job-type-append'
import type { QuoteItem } from '../lib/types/quote'

// Fyll på från jobbtyp (2026-09-17, Andreas: "skapa tom offert, välj olika
// jobbtypers standardrader som fyller på — sömlöst"). Första valet ersätter
// (fanns sedan 2026-09-01); det här är det andra valet, som LÄGGER TILL under
// en rubrik med jobbtypens namn. Facit: ren funktion + källskanning av
// kopplingen i byggaren, remsan och mallväljaren.

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let n = 0
const id = () => `id_${++n}`
const rad = (over: Partial<QuoteItem>): QuoteItem => ({
  id: 'mall', item_type: 'item', description: 'Arbete', quantity: 2, unit: 'tim', unit_price: 650, total: 1300,
  is_rot_eligible: true, is_rut_eligible: false, sort_order: 0, ...over,
})

test.describe('byggPafyllnadsrader — ren', () => {
  test('rubrikrad först, med jobbtypens namn, aldrig mallnamnet', () => {
    const ut = byggPafyllnadsrader({ default_items: [rad({})] }, 'El', [], 700, 5, id)
    expect(ut[0].item_type).toBe('heading')
    expect(ut[0].description).toBe('El')
    expect(ut[0].group_name).toBe('El')
    expect(ut[0].total).toBe(0)
  })

  test('sort_order fortsätter efter befintliga rader — påfyllning, inte ersättning', () => {
    const ut = byggPafyllnadsrader({ default_items: [rad({}), rad({ description: 'Material', unit: 'st' })] }, 'El', [], 700, 7, id)
    expect(ut.map(r => r.sort_order)).toEqual([7, 8, 9])
  })

  test('varje rad bär jobbtypens namn som group_name — dokumentet sektionerar på det', () => {
    const ut = byggPafyllnadsrader({ default_items: [rad({ group_name: 'Från mallen' }), rad({})] }, 'El', [], 700, 0, id)
    expect(ut.slice(1).every(r => r.group_name === 'El')).toBe(true)
  })

  test('nya id:n på allt, aldrig mallens', () => {
    const ut = byggPafyllnadsrader({ default_items: [rad({ id: 'a' }), rad({ id: 'a' })] }, 'El', [], 700, 0, id)
    const ids = ut.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('a')
  })

  test('priserna går genom resolvern: arbetsraden får FÖRETAGETS timpris, inte mallens 650', () => {
    const ut = byggPafyllnadsrader({ default_items: [rad({ unit_price: 650 })] }, 'El', [], 900, 0, id)
    expect(ut[1].unit_price).toBe(900)
    expect(ut[1].total).toBe(1800)
  })

  test('utan timpris blir arbetsraden prislös och flaggad — ingen dold reserv', () => {
    const ut = byggPafyllnadsrader({ default_items: [rad({ unit_price: 650 })] }, 'El', [], null, 0, id)
    expect(ut[1].unit_price).toBe(0)
    expect(ut[1].ai_price_missing).toBe(true)
  })

  test('tom mall ger ingen rubrik — en rubrik utan rader är en tom sektion', () => {
    expect(byggPafyllnadsrader({ default_items: [] }, 'El', [], 700, 3, id)).toEqual([])
    expect(byggPafyllnadsrader({ default_items: undefined as any }, 'El', [], 700, 3, id)).toEqual([])
  })

  test('muterar aldrig mallens rader', () => {
    const original = rad({ id: 'orig', unit_price: 650, sort_order: 99 })
    const frusen = JSON.stringify(original)
    byggPafyllnadsrader({ default_items: [original] }, 'El', [], 900, 0, id)
    expect(JSON.stringify(original)).toBe(frusen)
  })
})

test.describe('kopplingen i byggaren', () => {
  const builder = utanKommentarer(read('app/dashboard/quotes/_shared/QuoteBuilder.tsx'))
  const fn = builder.slice(builder.indexOf('async function applyJobTypeAppend'), builder.indexOf('function handleTemplateSelect('))

  test('påfyllningen lägger till med funktionell setItems — aldrig ersätter', () => {
    expect(fn.length).toBeGreaterThan(50)
    expect(fn).toMatch(/setItems\(prev => recalculateItems\(\[\.\.\.prev,/)
    expect(fn).toContain('byggPafyllnadsrader(')
    expect(fn).toContain('start.jobTypeName')
  })

  test('påfyllningen rör aldrig titel, beskrivning, betalplan, villkor, jobbtyp eller template_id', () => {
    for (const forbjuden of ['setTitle(', 'setDescription(', 'setPaymentPlan(', 'setTemplateId(', 'setQuoteJobType(', 'setNotIncluded(', 'setAtaTerms(', 'handleNewTemplateSelect(']) {
      expect(fn, `${forbjuden} i påfyllningen`).not.toContain(forbjuden)
    }
  })

  test('samma verifiering som starten — mallversion och aktiv jobbtyp', () => {
    expect(fn).toContain('await loadJobTypeStart(selection, signal)')
    expect(fn).toContain('if (signal.aborted) return')
  })

  test('remsan monteras i påfyllningsläge först när offerten har rader', () => {
    expect(builder).toMatch(/const jobTypeFyllPa = items\.length > 0 \? \(\s*<QuoteJobTypeStart pafyllnad/)
    expect(builder).toMatch(/onApply=\{applyJobTypeAppend\}/)
    // och renderas bredvid startremsan, inte bara deklareras
    expect(builder).toMatch(/\{jobTypeStart\}\s*\{jobTypeFyllPa\}/)
  })

  test('starten bär jobbtypens namn — rubriken får aldrig bli "Standardrader · …"', () => {
    const start = utanKommentarer(read('lib/quotes/job-type-start.ts'))
    expect(start).toContain('jobTypeName: string')
    expect(start).toMatch(/jobTypeName: setup\.jobTypes\.find\(j => j\.slug === verified\.jobTypeSlug\)\?\.name/)
  })
})

test.describe('remsan i påfyllningsläge', () => {
  const remsa = utanKommentarer(read('components/onboarding/QuoteJobTypeStart.tsx'))

  test('automatiken är avstängd och valet är lokalt — offertens jobbtyp rörs inte', () => {
    expect(remsa).toMatch(/if \(pafyllnad \|\| !data \|\| attempted\.current/)
    expect(remsa).toContain('if (pafyllnad) setLokaltVal(slug); else onSelectJobType(slug)')
    expect(remsa).toContain("pafyllnad ? 'Fyll på från jobbtyp'")
  })

  test('ärvd jobbtyp låser inte påfyllningen', () => {
    expect(remsa).toContain('const visaSomArvd = inherited && !pafyllnad')
  })
})

test.describe('ett begrepp i offertflödet: jobbtyp (2026-09-17)', () => {
  // Andreas: "blir det inte dubbelt med både mallsektioner för jobbtyper och
  // hela mallar?" Jo. Datan behåller två tabeller (jobbtypen används på ~30
  // ställen utanför offerten; ett upplägg bär betalplan och villkor), men
  // flödet har ETT begrepp: jobbtyp, med varianter när det finns flera.
  const remsa = utanKommentarer(read('components/onboarding/QuoteJobTypeStart.tsx'))
  const builder = utanKommentarer(read('app/dashboard/quotes/_shared/QuoteBuilder.tsx'))
  const intake = utanKommentarer(read('app/dashboard/quotes/new/components/quick/QuickIntake.tsx'))

  test('mallistan finns inte längre — varken fil, import eller tillstånd', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/dashboard/quotes/new/components/QuoteNewStartChooser.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'components/quotes/TemplateSelector.tsx'))).toBe(false)
    expect(builder).not.toContain('templatePickerOpen')
    expect(builder).not.toContain('QuoteNewStartChooser')
    expect(intake).not.toContain('Använd en mall')
  })

  test('två nivåer: jobbtypschipet är standardupplägget, varianterna egna chips', () => {
    expect(remsa).toMatch(/const standard = standardForVal\(slug\)\s*if \(standard\) void apply\(\{ jobTypeSlug: slug, templateId: standard\.id \}\)/)
    expect(remsa).toContain('onClick={() => valjJobbtyp(job.slug)}')
    expect(remsa).toMatch(/varianterFor\(data\.templates, job\.slug\)\.map\(v => <button/)
    expect(remsa).toContain('onClick={() => valjVariant(job.slug, v.id)}')
    // I ärvt läge finns inga chips — standardknappen får inte gömmas där.
    expect(remsa).toContain('(!harStandard || visaSomArvd) && matching.map')
  })

  test('sparade upplägg utan jobbtyp göms inte — "Övriga upplägg" finns så länge de finns', () => {
    expect(remsa).toContain("export const OVRIGA = '__ovriga'")
    expect(remsa).toMatch(/const ovriga = data && onApplyOvrig \? data\.templates\.filter\(t => !t\.jobTypeSlug && t\.items\.length > 0\)/)
    expect(remsa).toMatch(/ovriga\.length > 0 && <button/)
    expect(remsa).toContain('Övriga upplägg')
    // Båda monteringarna i byggaren erbjuder dem.
    expect((builder.match(/onApplyOvrig=\{applyOvrigtUpplagg\}/g) || []).length).toBe(2)
  })

  test('"Spara som upplägg" bär offertens jobbtyp, och servern validerar den', () => {
    expect(builder).toMatch(/job_type_slug: quoteJobType \|\| null,/)
    const rutt = utanKommentarer(read('app/api/quote-templates/route.ts'))
    expect(rutt).toMatch(/from\('job_types'\)\.select\('slug'\)[\s\S]{0,200}\.eq\('slug', body\.job_type_slug\)\.eq\('is_active', true\)/)
    expect(rutt).toContain('job_type_slug: jobTypeSlug,')
    expect(rutt).not.toMatch(/job_type_slug: body\.job_type_slug/)
    // Ordet "mall" är borta ur knapp och dialog.
    expect(read('app/dashboard/quotes/_shared/QuoteBuilderHeader.tsx')).toContain('Spara som upplägg')
    expect(read('app/dashboard/quotes/_shared/QuoteSaveTemplateModal.tsx')).not.toContain('Spara som mall')
  })

  test('upplägget heter som jobbet — inget systemnamn', () => {
    const server = utanKommentarer(read('lib/quotes/job-standard-server.ts'))
    expect(server).toContain('name: job.name, job_type_slug: job.slug')
    expect(server).not.toContain('Standardrader ·')
    // och databasen är i samma läge (v253)
    const sql = read('sql/v253_upplagg_utan_systemnamn.sql')
    expect(sql).toContain("WHERE name LIKE 'Standardrader · %'")
    expect(sql).toContain('AND job_type_slug IS NOT NULL')
  })

  test('kopplingen mall → jobbtyp bor i Inställningar, med mallens version som villkor', () => {
    const sida = utanKommentarer(read('app/dashboard/settings/quote-templates/page.tsx'))
    expect(sida).toMatch(/method: 'PUT'[\s\S]{0,200}templateId: mall\.id, jobTypeSlug, updatedAt: mall\.updated_at \?\? null/)
    expect(sida).toContain('const kanKoppla = Boolean(setup?.canManage)')
    expect(sida).toMatch(/\{kanKoppla && \(\s*<select/)
    expect(sida).toContain("fetch('/api/job-types/quote-setup'")
  })
})

import { standardFor, varianterFor, toSetupTemplate } from '../lib/quotes/job-type-setup'
import { getDefaultQuoteTemplates, JOBBTYP_FOR_MALL, ALLMANT_ARBETE } from '../lib/quote-template-defaults'
import { ADDITIONAL_JOB_TYPES_BY_TRADE } from '../lib/job-type-catalog'

test.describe('två nivåer — standard och varianter (v254)', () => {
  const mall = (id: string, over: Record<string, unknown> = {}) =>
    toSetupTemplate({ id, name: id, job_type_slug: 'badrum', default_items: [{ description: 'Arbete', unit: 'tim' }], ...over })

  test('flaggad standard vinner; utan flagga är det enda upplägget standard; flera utan flagga = ingen', () => {
    expect(standardFor([mall('a'), mall('b', { is_default: true })], 'badrum')?.id).toBe('b')
    expect(standardFor([mall('a')], 'badrum')?.id).toBe('a')
    expect(standardFor([mall('a'), mall('b')], 'badrum')).toBeNull()
    // ett tomt upplägg räknas inte — det går inte att starta en offert från
    expect(standardFor([mall('tom', { default_items: [] })], 'badrum')).toBeNull()
  })

  test('varianterna är allt utom standarden — och tomma utan standard', () => {
    expect(varianterFor([mall('a'), mall('b', { is_default: true }), mall('c')], 'badrum').map(t => t.id)).toEqual(['a', 'c'])
    expect(varianterFor([mall('a'), mall('b')], 'badrum')).toEqual([])
    expect(varianterFor([mall('a'), mall('x', { job_type_slug: 'kok' })], 'badrum')).toEqual([])
  })

  test('is_default läses bara som exakt true', () => {
    expect(toSetupTemplate({ id: 't', name: 't', is_default: 'true' }).isDefault).toBe(false)
    expect(toSetupTemplate({ id: 't', name: 't' }).isDefault).toBe(false)
  })

  test('seeden: specifik branschmall = egen jobbtyp ur onboardingens katalog; formatmallar under Allmänt arbete', () => {
    const katalog = new Set(Object.values(ADDITIONAL_JOB_TYPES_BY_TRADE).flat())
    for (const branch of ['construction', 'electrician', 'plumber', 'painter', 'other']) {
      const standarder = new Map<string, string[]>()
      for (const t of getDefaultQuoteTemplates(branch)) {
        const namn = t.job_type_name!
        expect(JOBBTYP_FOR_MALL[t.name], `${t.name} saknas i tabellen`).toBe(namn)
        // Namnet är onboardingens eget (samma chip som kundens val), eller
        // mallens egen identitet när katalogen saknar den, eller samlingen.
        expect(katalog.has(namn) || namn === t.name || namn === ALLMANT_ARBETE, `${branch}/${t.name} → ${namn}`).toBe(true)
        if (t.is_default) standarder.set(namn, [...(standarder.get(namn) || []), t.name])
      }
      // exakt EN standard per jobbtyp i seeden — indexet hade annars fällt insert
      for (const [namn, mallar] of Array.from(standarder)) expect(mallar, `${branch}: ${namn} har flera standarder`).toHaveLength(1)
      expect(standarder.get(ALLMANT_ARBETE)).toEqual(['Enkel offert'])
    }
    // Inga breda buckets kvar.
    for (const t of getDefaultQuoteTemplates('electrician')) expect(t.job_type_name).not.toBe('Elarbete')
  })

  test('en mall utanför tabellen kastar — ingen tyst mall utan jobbtyp', () => {
    expect(() => getDefaultQuoteTemplates('electrician')).not.toThrow()
    expect(Object.keys(JOBBTYP_FOR_MALL).length).toBeGreaterThanOrEqual(17)
  })

  test('seedern kopplar om befintliga seedade rader och delar koden med seed-rutten', () => {
    const seed = utanKommentarer(read('lib/seed-defaults.ts'))
    expect(seed).toContain('export async function seedQuoteTemplates')
    expect(seed).toContain('job_type_slug: jobTypesReady ? t.job_type_slug : null')
    expect(seed).toMatch(/const attKoppla = defaults\.filter\(t => \{ const r = befintliga\.get\(t\.name\); return !!r && !r\.job_type_slug \}\)/)
    expect(seed).toContain('is_default: taStandard(t)')
    // företagets befintliga standard vinner
    expect(seed).toMatch(/harStandard = new Set\(\(existingRows \|\| \[\]\)\.filter\(r => r\.is_default && r\.job_type_slug\)/)
    const rutt = utanKommentarer(read('app/api/quote-templates/seed/route.ts'))
    expect(rutt).toContain('await seedQuoteTemplates(supabase, businessId, branch)')
    expect(rutt).not.toContain("from('quote_templates')")
  })

  test('första upplägget för en jobbtyp blir standard vid "Spara som upplägg"; Förbered standardrader är alltid standard', () => {
    const rutt = utanKommentarer(read('app/api/quote-templates/route.ts'))
    expect(rutt).toMatch(/isDefault = \(count \?\? 0\) === 0/)
    expect(rutt).toContain('is_default: isDefault,')
    expect(utanKommentarer(read('lib/quotes/job-standard-server.ts'))).toContain('is_default: true, default_items: []')
  })

  test('Inställningar: Gör till standard, och badgen', () => {
    const setup = utanKommentarer(read('components/onboarding/JobTypeQuoteSetup.tsx'))
    expect(setup).toContain('isDefault: true })}>Gör till standard för {job.name}')
    expect(setup).toContain('Standardupplägg.')
    const sida = utanKommentarer(read('app/dashboard/settings/quote-templates/page.tsx'))
    expect(sida).toMatch(/template\.is_default && template\.job_type_slug && \(/)
  })
})
