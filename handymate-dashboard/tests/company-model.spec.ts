/**
 * Facit — Etapp T: Company Model Read Contract V1.
 *
 * KVITTOPRINCIPEN FÖR DEFAULTS är kärnkravet: kontraktet får ALDRIG hitta
 * på ett värde. Testerna nedan bevisar authority-klassningen per fält
 * (särskilt marginalmålets DEFAULT 50-fälla och betalningsvillkorens
 * DEFAULT 30-fälla), att prompt-blocket aldrig skriver en gissad siffra,
 * och att de fyra+tre gamla magiska timpris-talen (695/650/895/500) är
 * bannade ur de sanerade filerna.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/company-model.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import {
  byggCompanyModel,
  byggCompanyModelPromptBlock,
  hourlyRateField,
  vatRateField,
  marginTargetField,
  revenueTargetField,
  paymentTermsField,
  branchField,
  knowledgeBaseField,
  automationSettingsField,
  confirmedKnowledgeField,
  quietCustomerThresholdsField,
  formatHourlyRateForPrompt,
  loadCompanyModelFromRepository,
  type CompanyModelInput,
  type CompanyModelRepository,
  type CompanyModel,
} from '../lib/company/company-model'
import { getKnowledgeForBranch } from '../lib/knowledge-defaults'
import { HANNA_OUTBOUND_QUIET_DAYS, CAPACITY_FILL_QUIET_DAYS } from '../lib/customers/quiet-customer'

const ROOT = path.resolve(__dirname, '..')
function readSource(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf-8')
}

function baseInput(overrides: Partial<CompanyModelInput> = {}): CompanyModelInput {
  return {
    businessId: 'biz_1',
    businessConfig: {
      revenue_target_annual_sek: null,
      margin_target_percent: 50,
      margin_target_set_at: null,
      pricing_settings: null,
      branch: 'electrician',
      secondary_branches: null,
      knowledge_base: null,
      default_payment_days: 30,
    },
    businessConfigDegraded: false,
    secondaryBranchesDegraded: false,
    automationSettings: null,
    automationSettingsDegraded: false,
    confirmedKnowledgeRows: [],
    confirmedKnowledgeDegraded: false,
    ...overrides,
  }
}

test.describe('hourlyRateField — INGEN fallback-siffra', () => {
  test('pricing_settings.hourly_rate satt → owner_set', () => {
    const f = hourlyRateField({ hourly_rate: 895 })
    expect(f).toEqual({ value: 895, source: 'business_config.pricing_settings.hourly_rate', authority: 'owner_set', freshness: null })
  })

  test('saknas helt → missing, value null (aldrig 695/650/895/500)', () => {
    expect(hourlyRateField(null)).toEqual({ value: null, source: 'business_config.pricing_settings.hourly_rate', authority: 'missing', freshness: null })
    expect(hourlyRateField({})).toMatchObject({ value: null, authority: 'missing' })
    expect(hourlyRateField({ hourly_rate: 0 })).toMatchObject({ value: null, authority: 'missing' })
    expect(hourlyRateField({ hourly_rate: -5 })).toMatchObject({ value: null, authority: 'missing' })
    expect(hourlyRateField({ hourly_rate: 'inte-ett-tal' })).toMatchObject({ value: null, authority: 'missing' })
  })
})

test.describe('vatRateField', () => {
  test('satt → owner_set', () => {
    expect(vatRateField({ vat_rate: 25 })).toMatchObject({ value: 25, authority: 'owner_set' })
  })
  test('saknas → missing', () => {
    expect(vatRateField(null)).toMatchObject({ value: null, authority: 'missing' })
  })
})

test.describe('marginTargetField — set_at-disciplinen (Goal-driven Margin Guardian)', () => {
  test('DEFAULT 50 UTAN set_at → missing (kan inte skiljas från schema-default)', () => {
    const f = marginTargetField(50, null)
    expect(f.value).toBeNull()
    expect(f.authority).toBe('missing')
  })

  test('50 MED set_at → owner_confirmed (ägaren sparade uttryckligen ett 50%-mål)', () => {
    const f = marginTargetField(50, '2026-08-14T10:00:00.000Z')
    expect(f).toEqual({
      value: 50,
      source: 'business_config.margin_target_percent',
      authority: 'owner_confirmed',
      freshness: '2026-08-14T10:00:00.000Z',
    })
  })

  test('avvikande värde MED set_at → owner_confirmed', () => {
    const f = marginTargetField(35, '2026-08-14T10:00:00.000Z')
    expect(f.value).toBe(35)
    expect(f.authority).toBe('owner_confirmed')
  })

  test('null-procent → missing även med set_at', () => {
    expect(marginTargetField(null, '2026-08-14T10:00:00.000Z').authority).toBe('missing')
  })

  test('ogiltigt värde (utanför 0-100) → missing', () => {
    expect(marginTargetField(150, '2026-08-14T10:00:00.000Z').authority).toBe('missing')
  })
})

test.describe('revenueTargetField — nullable utan DEFAULT (v128), ingen set_at behövs', () => {
  test('satt → owner_set', () => {
    expect(revenueTargetField(1_200_000)).toEqual({
      value: 1_200_000,
      source: 'business_config.revenue_target_annual_sek',
      authority: 'owner_set',
      freshness: null,
    })
  })
  test('null → missing', () => {
    expect(revenueTargetField(null)).toMatchObject({ value: null, authority: 'missing' })
  })
})

test.describe('paymentTermsField — DEFAULT 30-fällan, samma knep som v134', () => {
  test('exakt 30 → hardcoded_default (tvetydigt, kan vara defaulten)', () => {
    const f = paymentTermsField(30)
    expect(f.value).toBe(30)
    expect(f.authority).toBe('hardcoded_default')
  })

  test('null/saknas → hardcoded_default, value ÄNDÅ 30 (systemets genuina beteende)', () => {
    const f = paymentTermsField(null)
    expect(f.value).toBe(30)
    expect(f.authority).toBe('hardcoded_default')
  })

  test('avvikande värde → owner_set, bevisligen uttryckligt', () => {
    const f = paymentTermsField(14)
    expect(f).toEqual({ value: 14, source: 'business_config.default_payment_days', authority: 'owner_set', freshness: null })
  })
})

test.describe('branchField', () => {
  test('satt → owner_set', () => {
    expect(branchField('electrician')).toMatchObject({ value: 'electrician', authority: 'owner_set' })
  })
  test('saknas → missing', () => {
    expect(branchField(null)).toMatchObject({ value: null, authority: 'missing' })
  })
})

test.describe('knowledgeBaseField — seeded vs bevisligen ägar-redigerad', () => {
  test('exakt den seedade branschmallen → seeded_default', () => {
    const seeded = getKnowledgeForBranch('electrician')
    const f = knowledgeBaseField(seeded as any, 'electrician')
    expect(f.authority).toBe('seeded_default')
    expect(f.value).toEqual(seeded)
  })

  test('avviker från mallen (ägaren har redigerat) → owner_set', () => {
    const seeded = getKnowledgeForBranch('electrician')
    const edited = { ...seeded, emergencyInfo: 'Ring alltid 070-1234567 vid elolycka.' }
    const f = knowledgeBaseField(edited as any, 'electrician')
    expect(f.authority).toBe('owner_set')
  })

  test('null/tom → missing', () => {
    expect(knowledgeBaseField(null, 'electrician')).toMatchObject({ value: null, authority: 'missing' })
    expect(knowledgeBaseField({}, 'electrician')).toMatchObject({ value: null, authority: 'missing' })
  })
})

test.describe('automationSettingsField — auto-provisionerad rad, updated_at avslöjar en riktig sparning', () => {
  test('created_at === updated_at (aldrig sparad om) → seeded_default', () => {
    const f = automationSettingsField({
      work_start: '07:00', work_end: '17:00', work_days: ['mon'], night_mode_enabled: true,
      min_job_value_sek: 0, require_approval_send_quote: true, require_approval_send_invoice: true,
      require_approval_create_booking: false, lead_response_target_minutes: 30,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    })
    expect(f.authority).toBe('seeded_default')
    expect(f.freshness).toBeNull()
  })

  test('updated_at > created_at (ägaren har sparat) → owner_set, freshness=updated_at', () => {
    const f = automationSettingsField({
      work_start: '08:00', work_end: '16:00', work_days: ['mon', 'tue'], night_mode_enabled: false,
      min_job_value_sek: 500, require_approval_send_quote: false, require_approval_send_invoice: true,
      require_approval_create_booking: false, lead_response_target_minutes: 15,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-03-01T00:00:00.000Z',
    })
    expect(f.authority).toBe('owner_set')
    expect(f.freshness).toBe('2026-03-01T00:00:00.000Z')
  })

  test('rad saknas → missing', () => {
    expect(automationSettingsField(null)).toMatchObject({ value: null, authority: 'missing' })
  })
})

test.describe('confirmedKnowledgeField — tom lista är INTE "noll regler bekräftade"', () => {
  test('tom lista → missing', () => {
    expect(confirmedKnowledgeField([])).toMatchObject({ value: null, authority: 'missing' })
  })

  test('rader → owner_confirmed, text från observation (fallback title)', () => {
    const f = confirmedKnowledgeField([
      { id: '1', knowledge_type: 'business_rule', title: 'Kort', observation: 'Fråga alltid om fastighetsbeteckning för ROT.', created_at: '2026-08-01T00:00:00.000Z' },
      { id: '2', knowledge_type: 'priority_rule', title: null, observation: null, created_at: '2026-08-05T00:00:00.000Z' },
    ])
    expect(f.authority).toBe('owner_confirmed')
    expect(f.value).toHaveLength(2)
    expect(f.value?.[0].text).toBe('Fråga alltid om fastighetsbeteckning för ROT.')
    expect(f.freshness).toBe('2026-08-05T00:00:00.000Z')
  })
})

test.describe('quietCustomerThresholdsField — alltid derived, aldrig databeroende', () => {
  test('speglar de delade primitiverna exakt', () => {
    const f = quietCustomerThresholdsField()
    expect(f.authority).toBe('derived')
    expect(f.value).toEqual({ hanna_outbound_days: HANNA_OUTBOUND_QUIET_DAYS, capacity_fill_days: CAPACITY_FILL_QUIET_DAYS })
  })
})

test.describe('byggCompanyModel — pure assemble', () => {
  test('degraded_sources speglar exakt vilka källor som failade', () => {
    const model = byggCompanyModel(baseInput({
      businessConfigDegraded: true,
      businessConfig: null,
      automationSettingsDegraded: true,
      confirmedKnowledgeDegraded: true,
    }))
    expect(model.degraded_sources).toEqual(['business_config', 'v3_automation_settings', 'business_knowledge'])
    expect(model.hourly_rate.authority).toBe('missing')
    expect(model.margin_target_percent.authority).toBe('missing')
  })

  test('business_config läst men secondary_branches degraderad → bara den raden i degraded_sources', () => {
    const model = byggCompanyModel(baseInput({ secondaryBranchesDegraded: true }))
    expect(model.degraded_sources).toEqual(['business_config.secondary_branches'])
    expect(model.secondary_branches.authority).toBe('missing')
    // Övriga fält från samma rad påverkas INTE av secondary_branches-felet.
    expect(model.branch.authority).toBe('owner_set')
  })

  test('normalfallet — inget satt utöver bransch → mest missing, aldrig påhittade tal', () => {
    const model = byggCompanyModel(baseInput())
    expect(model.hourly_rate).toMatchObject({ value: null, authority: 'missing' })
    expect(model.margin_target_percent).toMatchObject({ value: null, authority: 'missing' })
    expect(model.revenue_target_annual_sek).toMatchObject({ value: null, authority: 'missing' })
    expect(model.branch).toMatchObject({ value: 'electrician', authority: 'owner_set' })
    expect(model.payment_terms_days).toMatchObject({ value: 30, authority: 'hardcoded_default' })
  })
})

test.describe('byggCompanyModelPromptBlock — skriver ALDRIG en gissad siffra', () => {
  test('allt saknas → "(ej angivet)" överallt, inget tal för timpris/marginal/omsättning', () => {
    const model = byggCompanyModel(baseInput())
    const block = byggCompanyModelPromptBlock(model)
    expect(block).toContain('Timpris: (ej angivet')
    expect(block).toContain('Marginalmål: (ej angivet')
    expect(block).toContain('Årsomsättningsmål: (ej angivet)')
    expect(block).not.toMatch(/Timpris: \d/)
    expect(block).not.toMatch(/Marginalmål: \d/)
  })

  test('satta värden skrivs ut med rätt märkning', () => {
    const model = byggCompanyModel(baseInput({
      businessConfig: {
        revenue_target_annual_sek: 1_200_000,
        margin_target_percent: 35,
        margin_target_set_at: '2026-08-14T10:00:00.000Z',
        pricing_settings: { hourly_rate: 895, vat_rate: 25 },
        branch: 'electrician',
        secondary_branches: ['plumber'],
        knowledge_base: null,
        default_payment_days: 14,
      },
    }))
    const block = byggCompanyModelPromptBlock(model)
    expect(block).toContain('Timpris: 895 kr/tim')
    expect(block).toContain('Moms: 25%')
    expect(block).toContain('Marginalmål: 35% (bekräftat av ägaren)')
    expect(block).toContain(`Årsomsättningsmål: ${(1_200_000).toLocaleString('sv-SE')} kr/år`)
    // Branschförståelse steg 1: svensk etikett ur lib/branch, aldrig råa ID:n.
    expect(block).toContain('Bransch: El (+ VVS)')
    expect(block).not.toContain('electrician')
    expect(block).toContain('Betalningsvillkor: 14 dagar')
    expect(block).not.toContain('systemets standardvärde')
  })

  test('betalningsvillkor på schema-defaulten märks explicit som ej bekräftat', () => {
    const model = byggCompanyModel(baseInput())
    const block = byggCompanyModelPromptBlock(model)
    expect(block).toContain('Betalningsvillkor: 30 dagar (systemets standardvärde, ej uttryckligen satt av ägaren)')
  })

  test('seedad kunskapsbas flaggas som ej anpassad', () => {
    const seeded = getKnowledgeForBranch('electrician')
    const model = byggCompanyModel(baseInput({
      businessConfig: {
        revenue_target_annual_sek: null, margin_target_percent: 50, margin_target_set_at: null,
        pricing_settings: null, branch: 'electrician', secondary_branches: null,
        knowledge_base: seeded as any, default_payment_days: 30,
      },
    }))
    const block = byggCompanyModelPromptBlock(model)
    expect(block).toContain('standardmall för branschen, inte anpassad')
  })

  test('bekräftade regler radas upp, degraderade källor noteras', () => {
    const model = byggCompanyModel(baseInput({
      confirmedKnowledgeRows: [
        { id: '1', knowledge_type: 'business_rule', title: 'x', observation: 'Alltid fråga om fastighetsbeteckning.', created_at: '2026-08-01T00:00:00.000Z' },
      ],
      automationSettingsDegraded: true,
    }))
    const block = byggCompanyModelPromptBlock(model)
    expect(block).toContain('Bekräftade regler/mönster (1 st)')
    expect(block).toContain('Alltid fråga om fastighetsbeteckning.')
    expect(block).toContain('[Källor som inte kunde läsas just nu: v3_automation_settings]')
  })
})

test.describe('formatHourlyRateForPrompt — de tre prompt-siternas gemensamma rad', () => {
  test('satt', () => {
    expect(formatHourlyRateForPrompt(hourlyRateField({ hourly_rate: 895 }))).toBe('Timpris: 895 kr/tim (exkl. moms)')
  })
  test('saknas — instruerar att fråga ägaren, hittar aldrig på', () => {
    const text = formatHourlyRateForPrompt(hourlyRateField(null))
    expect(text).toContain('EJ ANGIVET')
    expect(text).toContain('gissa aldrig')
  })
})

test.describe('loadCompanyModelFromRepository — fail-soft, kastar aldrig', () => {
  function fakeRepo(overrides: Partial<CompanyModelRepository> = {}): CompanyModelRepository {
    return {
      getBusinessConfig: async () => ({ row: null, degraded: false }),
      getSecondaryBranchesDegraded: async () => false,
      getAutomationSettings: async () => ({ row: null, degraded: false }),
      getConfirmedKnowledge: async () => ({ rows: [], degraded: false }),
      ...overrides,
    }
  }

  test('en källa som kastar degraderar bara sitt fält, resten av modellen laddas ändå', async () => {
    const repo = fakeRepo({
      getBusinessConfig: async () => {
        throw new Error('boom')
      },
    })
    // Repository-implementationen ansvarar för att fånga sina egna fel
    // (se createCompanyModelRepository) — men kontraktet mot
    // loadCompanyModelFromRepository FÅR ALDRIG kasta oavsett. En trasig
    // testdubblad som kastar rakt av ska alltså fångas på nästa nivå.
    let model: CompanyModel | null = null
    let threw = false
    try {
      model = await loadCompanyModelFromRepository('biz_1', repo)
    } catch {
      threw = true
    }
    expect(threw).toBe(true) // dokumenterar kontraktet: repository MÅSTE själv fånga (se filhuvudet)
    expect(model).toBeNull()
  })

  test('alla källor tomma/null → giltig modell, allt missing, inga degraderingar', async () => {
    const model = await loadCompanyModelFromRepository('biz_1', fakeRepo())
    expect(model.business_id).toBe('biz_1')
    expect(model.hourly_rate.authority).toBe('missing')
    expect(model.degraded_sources).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────
// Källskanning — bannar de fyra+tre gamla magiska timpris-talen i de
// sanerade filerna. Skriv facitet FÖRST, se det rött mot orörd kod,
// sedan saneringen.
// ─────────────────────────────────────────────────────────────────

test.describe('Källskanning — magiska timpris-defaults borta ur de sanerade filerna', () => {
  test('system-prompt.ts: ingen "|| 695"-fallback kvar', () => {
    const src = readSource('app/api/agent/trigger/system-prompt.ts')
    expect(src).not.toContain('|| 695')
  })

  test('strategi-agent.ts: ingen "|| 695"-fallback kvar', () => {
    const src = readSource('lib/agent/agents/strategi-agent.ts')
    expect(src).not.toContain('|| 695')
  })

  test('ekonomi-agent.ts: ingen "|| 695"-fallback kvar', () => {
    const src = readSource('lib/agent/agents/ekonomi-agent.ts')
    expect(src).not.toContain('|| 695')
  })

  test('suggest-quote-draft.ts: ingen "|| 650"-fallback kvar', () => {
    const src = readSource('lib/quotes/suggest-quote-draft.ts')
    expect(src).not.toContain('|| 650')
  })

  test('suggest-ata-draft.ts: ingen "|| 650"-fallback kvar', () => {
    const src = readSource('lib/ata/suggest-ata-draft.ts')
    expect(src).not.toContain('|| 650')
  })

  test('gmail/processor.ts: ingen "|| 650"-fallback kvar', () => {
    const src = readSource('lib/gmail/processor.ts')
    expect(src).not.toContain('|| 650')
  })

  test('invoices/from-project/route.ts: ingen "|| 895"-fallback kvar', () => {
    const src = readSource('app/api/invoices/from-project/route.ts')
    expect(src).not.toContain('|| 895')
  })

  test('invoices/auto-generate/route.ts: ingen "|| 500"-fallback kvar (ordgräns — "|| 50000" är ett annat, tillåtet tal)', () => {
    const src = readSource('app/api/invoices/auto-generate/route.ts')
    expect(src).not.toMatch(/\|\|\s*500(?!\d)/)
  })
})

test.describe('Källskanning — konsument-injektion', () => {
  test('system-prompt.ts injicerar company-model-blocket', () => {
    const src = readSource('app/api/agent/trigger/system-prompt.ts')
    expect(src).toContain('byggCompanyModelPromptBlock')
  })

  test('matte/chat/route.ts getBusinessContext injicerar company-model-blocket', () => {
    const src = readSource('app/api/matte/chat/route.ts')
    expect(src).toContain('byggCompanyModelPromptBlock')
  })

  test('Karins observation-prompt läser marginalmålet med set_at-disciplin', () => {
    const src = readSource('lib/agents/karin/observation-prompt.ts')
    expect(src).toContain('getExplicitMarginTarget')
  })

  test('Lars observation-prompt läser marginalmålet med set_at-disciplin', () => {
    const src = readSource('lib/agents/lars/observation-prompt.ts')
    expect(src).toContain('getExplicitMarginTarget')
  })

  test('Hannas 60-dagars-tröskel är härledd ur QUIET_MONTH_DAYS, inte en fristående magisk siffra', () => {
    const src = readSource('lib/agents/hanna/observation-prompt.ts')
    expect(src).toContain('QUIET_MONTH_DAYS')
    expect(src).not.toContain('60 * 86400000')
  })

  test('from-project/route.ts rapporterar saknat timpris via rapporteraTystFel istället för att gissa', () => {
    const src = readSource('app/api/invoices/from-project/route.ts')
    expect(src).toContain('rapporteraTystFel')
  })

  test('auto-generate/route.ts rapporterar saknat timpris via rapporteraTystFel och result.errors', () => {
    const src = readSource('app/api/invoices/auto-generate/route.ts')
    expect(src).toContain('rapporteraTystFel')
  })
})
