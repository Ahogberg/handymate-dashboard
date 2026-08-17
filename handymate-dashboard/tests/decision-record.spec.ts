/**
 * Facit för beslutsposten (spår 1.1, 2026-08-06).
 *
 * Det som testas hårdast är inte att stämpeln byggs, utan att den inte bär
 * med sig innehåll den inte ska bära, och att den kan LÄSAS TILLBAKA från en
 * payload som varit genom JSON — vilket den alltid har, eftersom den bor i
 * pending_approvals.payload.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/decision-record.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  buildDecisionRecord,
  hashInput,
  withDecisionRecord,
  readDecisionRecord,
  PROMPT_VERSIONS,
  DECISION_KEY,
  type PromptKey,
} from '../lib/ai/decision-record'

const ROOT = path.resolve(__dirname, '..')

// Fast tidpunkt — aldrig new Date() i ett test, då blir facit rörligt.
const NOW = new Date('2026-08-06T10:30:00.000Z')

test.describe('stämpeln', () => {
  test('bär modell, prompt och version', () => {
    const r = buildDecisionRecord({
      model: 'claude-sonnet-4-6', prompt: 'quoteGeneration', input: 'Byta 12 fönster', now: NOW,
    })
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.prompt).toBe('quoteGeneration')
    expect(r.promptVersion).toBe(PROMPT_VERSIONS.quoteGeneration)
    expect(r.decidedAt).toBe('2026-08-06T10:30:00.000Z')
  })

  test('bär INTE indata självt — bara en hash', () => {
    // Payloaden ligger i pending_approvals och läses av gränssnittet. Att baka
    // in kundbeskrivningen där hade dubbellagrat personuppgifter på ett ställe
    // ingen städar.
    const beskrivning = 'Anna Svensson, Kundvägen 1, personnummer 19800101-1234'
    const r = buildDecisionRecord({
      model: 'm', prompt: 'quoteGeneration', input: beskrivning, now: NOW,
    })
    const serialiserad = JSON.stringify(r)
    expect(serialiserad).not.toContain('Anna')
    expect(serialiserad).not.toContain('19800101')
    expect(serialiserad).not.toContain('Kundvägen')
  })
})

test.describe('hashen svarar på rätt fråga', () => {
  test('samma underlag ger samma hash', () => {
    expect(hashInput('Byta 12 fönster')).toBe(hashInput('Byta 12 fönster'))
  })

  test('omformatering är INTE nytt underlag', () => {
    // Vi vill veta om innehållet skilde sig, inte om någon råkade lägga till
    // en radbrytning.
    expect(hashInput('Byta 12 fönster')).toBe(hashInput('  Byta   12\n\nfönster  '))
  })

  test('men annat innehåll ger annan hash', () => {
    expect(hashInput('Byta 12 fönster')).not.toBe(hashInput('Byta 13 fönster'))
  })

  test('tomt underlag är ett eget, läsbart värde', () => {
    // 'tom' i stället för en hash av tomma strängen: syns direkt i en logg.
    expect(hashInput('')).toBe('tom')
    expect(hashInput(null)).toBe('tom')
    expect(hashInput(undefined)).toBe('tom')
    expect(hashInput('   \n  ')).toBe('tom')
  })

  test('hashen är kort nog att jämföra med ögat', () => {
    expect(hashInput('något').length).toBeLessThanOrEqual(12)
  })
})

test.describe('på och av en payload', () => {
  test('läggs på utan att röra resten', () => {
    const payload = { message: 'Hej Anna', customer_id: 'c1' }
    const stamped = withDecisionRecord(payload, buildDecisionRecord({
      model: 'm', prompt: 'ataDraftSuggestion', input: 'x', now: NOW,
    }))
    expect(stamped.message).toBe('Hej Anna')
    expect(stamped.customer_id).toBe('c1')
    expect(stamped[DECISION_KEY].model).toBe('m')
  })

  test('överlever en tur genom JSON — payloaden lagras som JSONB', () => {
    const stamped = withDecisionRecord({ a: 1 }, buildDecisionRecord({
      model: 'claude-haiku-4-5-20251001', prompt: 'photoAssessment', input: 'foto', now: NOW,
    }))
    const round = JSON.parse(JSON.stringify(stamped))
    const read = readDecisionRecord(round)
    expect(read?.model).toBe('claude-haiku-4-5-20251001')
    expect(read?.promptVersion).toBe(PROMPT_VERSIONS.photoAssessment)
  })
})

test.describe('äldre förslag saknar stämpel — och det är normalt', () => {
  test('payload utan stämpel ger null, inte en krasch', () => {
    // Allt skapat före 2026-08-06, och alla vägar som ännu inte stämplar.
    expect(readDecisionRecord({ message: 'hej' })).toBeNull()
  })

  test('skräp ger null', () => {
    for (const junk of [null, undefined, 'sträng', 42, [], { _decision: 'inte ett objekt' }, { _decision: {} }]) {
      expect(readDecisionRecord(junk), String(junk)).toBeNull()
    }
  })
})

test.describe('promptregistret', () => {
  test('varje version är ett positivt heltal', () => {
    for (const [key, version] of Object.entries(PROMPT_VERSIONS)) {
      expect(Number.isInteger(version), `${key} är inte ett heltal`).toBe(true)
      expect(version, `${key} måste börja på minst 1`).toBeGreaterThanOrEqual(1)
    }
  })

  test('offertprompten är versionerad förbi 1', () => {
    // Sanity: den ändrades i etapp B (produkthandtag, radgräns 8→12,
    // notIncludedSuggestions). Står den kvar på 1 har någon glömt bumpa —
    // och då är versionsnumret värdelöst som grupperingsnyckel.
    expect(PROMPT_VERSIONS.quoteGeneration).toBeGreaterThan(1)
  })

  test('alla nycklar går att stämpla med', () => {
    for (const key of Object.keys(PROMPT_VERSIONS) as PromptKey[]) {
      const r = buildDecisionRecord({ model: 'm', prompt: key, input: 'x', now: NOW })
      expect(r.promptVersion).toBe(PROMPT_VERSIONS[key])
    }
  })
})

test.describe('producenterna stämplar — kopplingen kan inte tyst försvinna', () => {
  // Vägar som BÄR ett AI-beslut ska stämpla det. price_adjustment-korten är
  // medvetet utanför: ren matematik, inget AI-beslut att stämpla.
  const PRODUCENTER: Array<[string, string]> = [
    ['lib/quotes/suggest-quote-draft.ts', 'quoteDraftSuggestion'],
    ['lib/ata/suggest-ata-draft.ts', 'ataDraftSuggestion'],
    ['app/api/voice/analyze/route.ts', 'callAnalysis'],
  ]

  for (const [fil, nyckel] of PRODUCENTER) {
    test(`${nyckel} stämplas i ${fil}`, () => {
      const s = fs.readFileSync(path.join(ROOT, fil), 'utf8')
      expect(s, `${fil} importerar inte beslutsposten`).toContain('withDecisionRecord')
      expect(s, `${fil} stämplar inte med nyckeln ${nyckel}`).toContain(`prompt: '${nyckel}'`)
    })
  }

  test('analysen stämplar modellvariabeln som faktiskt användes', () => {
    const s = fs.readFileSync(path.join(ROOT, 'app/api/voice/analyze/route.ts'), 'utf8')
    // Samma variabel i anropet och i stämpeln — inte två getClaudeModel-anrop
    // som kan glida isär om routing-logiken blir tidsberoende.
    expect(s).toContain('model: analysModell,')
    expect((s.match(/model: analysModell/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

test.describe('playbookPatternDetection — detect-pattern.ts bygger, propose-pattern.ts stämplar payloaden', () => {
  // Ovanligt mot övriga PRODUCENTER-raderna ovan: den här AI-vägen bygger
  // DecisionRecord i EN fil (detect-pattern.ts, där modellanropet sker) och
  // hänger den på kortets payload i EN ANNAN fil (propose-pattern.ts, där
  // pending_approvals-raden skapas) — ansvaret är redan uppdelat så i
  // koden, se lib/playbook/propose-pattern.ts filhuvud.
  test('detect-pattern.ts bygger en DecisionRecord med rätt prompt-nyckel', () => {
    const s = fs.readFileSync(path.join(ROOT, 'lib/playbook/detect-pattern.ts'), 'utf8')
    expect(s, 'detect-pattern.ts bygger inte en DecisionRecord').toContain('buildDecisionRecord')
    expect(s, 'detect-pattern.ts stämplar inte med nyckeln playbookPatternDetection').toContain("prompt: 'playbookPatternDetection'")
  })

  test('propose-pattern.ts hänger DecisionRecord på kortets payload via withDecisionRecord', () => {
    const s = fs.readFileSync(path.join(ROOT, 'lib/playbook/propose-pattern.ts'), 'utf8')
    expect(s, 'propose-pattern.ts importerar inte withDecisionRecord').toContain('withDecisionRecord')
  })
})
