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
    expect(builder).toMatch(/const jobTypeFyllPa = items\.length > 0 && !templatePickerOpen \? \(\s*<QuoteJobTypeStart pafyllnad/)
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
    expect(remsa).toContain('if (pafyllnad) setLokaltVal(job.slug); else onSelectJobType(job.slug)')
    expect(remsa).toContain("pafyllnad ? 'Fyll på från jobbtyp'")
  })

  test('ärvd jobbtyp låser inte påfyllningen', () => {
    expect(remsa).toContain('const visaSomArvd = inherited && !pafyllnad')
  })
})

test.describe('mallväljaren grupperar på jobbtyp', () => {
  const valjare = utanKommentarer(read('components/quotes/TemplateSelector.tsx'))

  test('sektioner i jobbtypernas ordning, övriga sist, tomma sektioner bort', () => {
    expect(valjare).toContain("fetch('/api/job-types/quote-setup'")
    expect(valjare).toMatch(/jobbtyper\.map\(j => \(\{ slug: j\.slug[^}]*mallar: sortedTemplates\.filter\(t => t\.job_type_slug === j\.slug\)/)
    expect(valjare).toContain("namn: 'Övriga mallar'")
    expect(valjare).toMatch(/\.filter\(sek => sek\.mallar\.length > 0\)/)
  })

  test('utan jobbtypsdata: platt lista, exakt som förut', () => {
    expect(valjare).toMatch(/: \[\{ slug: null, namn: '', mallar: sortedTemplates \}\]/)
    expect(valjare).toContain('if (!res.ok) return')
  })

  test('"Lägg under …" använder samma PUT som inställningarna, med mallens version som villkor', () => {
    expect(valjare).toMatch(/method: 'PUT'[\s\S]{0,200}templateId: mall\.id, jobTypeSlug, updatedAt: mall\.updated_at \?\? null/)
    // bara för den som får koppla
    expect(valjare).toContain('const kanKoppla = Boolean(setup?.canManage)')
    expect(valjare).toMatch(/\{kanKoppla && \(\s*<select/)
  })
})
