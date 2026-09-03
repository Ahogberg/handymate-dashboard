/**
 * Transkriberingskedjan — hallucinationsvakten, egennamnen och den delade
 * modulen (Kundkoll-jämförelsen 2026-09-03).
 *
 *   npx playwright test tests/transcription.spec.ts --project=chromium
 *
 * Rena funktioner + källskanning — ingen webbläsare, inget ljud, ingen databas.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  granskaTranskript,
  _ARTEFAKTER,
  _MIN_TECKEN_PER_SEKUND,
  _KORTASTE_LJUD_FOR_TATHET,
} from '../lib/transcription/guard'
import {
  buildTranscriptionPrompt,
  buildVocabularyTerms,
  buildKeywords,
  MAX_PROMPT_TECKEN,
} from '../lib/transcription/vocabulary'
import { valjModell, _FLERPARTSYTOR, _ENSAMTALARYTOR } from '../lib/transcription/transcribe'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

// ─────────────────────────────────────────────────────────────────
// Vakten — det som stoppar en hallucination från att bli ett kort
// ─────────────────────────────────────────────────────────────────

test.describe('hallucinationsvakten', () => {
  test('Kundkolls mätta fall: tystnad ger " Tack." — och avvisas', () => {
    const r = granskaTranskript(' Tack.', 5)
    expect(r.ok).toBe(false)
    expect(r.skal).toBe('artefakt')
    expect(r.meddelande).toBeTruthy()
  })

  test('kända artefakter avvisas oavsett skiftläge och mellanrum', () => {
    for (const fras of ['Tack.', 'TACK', '  tack  ', 'Undertexter från amara.org', 'Hej då', 'Thanks for watching']) {
      expect(granskaTranskript(fras, 30).ok, fras).toBe(false)
    }
  })

  test('artefakt-listan matchas mot HELA texten, aldrig som delsträng', () => {
    // Ett riktigt samtal som SLUTAR med "tack" får aldrig kastas
    const akta = 'Hej, det är Anders från Bee Bygg. Jag kommer på torsdag klockan nio. Tack.'
    expect(granskaTranskript(akta, 20).ok).toBe(true)
  })

  test('tomt eller bara blanksteg ⇒ avvisat som tomt', () => {
    for (const v of ['', '   ', null, undefined]) {
      const r = granskaTranskript(v, 30)
      expect(r.ok).toBe(false)
      expect(r.skal).toBe('tomt')
    }
  })

  test('för lite text mot ljudlängden ⇒ avvisat', () => {
    // 60 sekunder ljud, tio tecken text — under 1 tecken/sekund
    expect(granskaTranskript('Hej hej ja', 60).skal).toBe('for_gles')
  })

  test('täthetsregeln gäller INTE korta klipp — "Hej, det är Anders" är äkta', () => {
    const kort = 'Hej, det är Anders'
    expect(granskaTranskript(kort, 5).ok).toBe(true)
    expect(granskaTranskript(kort, _KORTASTE_LJUD_FOR_TATHET - 1).ok).toBe(true)
  })

  test('okänd ljudlängd (0) hoppar över täthetsregeln i stället för att gissa', () => {
    expect(granskaTranskript('Hej hej ja', 0).ok).toBe(true)
  })

  test('normal svensk talhastighet passerar med marginal', () => {
    // ~12 tecken/sekund är normalt; tröskeln ligger på 1
    const text = 'a'.repeat(60 * 12)
    expect(granskaTranskript(text, 60).ok).toBe(true)
    expect(_MIN_TECKEN_PER_SEKUND).toBeLessThan(2)
  })

  test('listan innehåller de fraser Whisper faktiskt producerar ur tystnad', () => {
    expect(_ARTEFAKTER).toContain('tack')
    expect(_ARTEFAKTER).toContain('undertexter från amara.org')
    expect(_ARTEFAKTER.every(a => a === a.toLowerCase())).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
// Egennamnen — vår motsvarighet till en svensktränad modell
// ─────────────────────────────────────────────────────────────────

const trade = {
  primary: 'electrician' as const,
  secondary: [],
  specialties: ['Laddboxar', 'Elbesiktning'],
  jobTypes: ['Byte av elcentral'],
}

test.describe('vokabuläret', () => {
  test('egennamn först — firma, kund och ort är omöjliga för modellen att gissa', () => {
    const termer = buildVocabularyTerms({
      businessName: 'Bee Bygg AB',
      customerName: 'Karin Lindqvist',
      serviceArea: 'Sollentuna',
      trade,
    })
    expect(termer.slice(0, 3)).toEqual(['Bee Bygg AB', 'Karin Lindqvist', 'Sollentuna'])
  })

  test('dubbletter tas bort oavsett skiftläge', () => {
    const termer = buildVocabularyTerms({
      businessName: 'Bee Bygg',
      customerName: 'bee bygg',
      productNames: ['BEE BYGG'],
    })
    expect(termer).toEqual(['Bee Bygg'])
  })

  test('prompten håller sig inom modellens teckengräns', () => {
    const prompt = buildTranscriptionPrompt({
      businessName: 'Bee Bygg AB',
      serviceArea: 'Sollentuna',
      trade,
      productNames: Array.from({ length: 200 }, (_, i) => `Artikel nummer ${i} med ett långt namn`),
    })
    expect(prompt).toBeTruthy()
    expect(prompt!.length).toBeLessThanOrEqual(MAX_PROMPT_TECKEN)
    // Det viktigaste fick plats trots kapningen
    expect(prompt).toContain('Bee Bygg AB')
  })

  test('tomt underlag ⇒ ingen prompt alls, aldrig en tom eller påhittad', () => {
    expect(buildTranscriptionPrompt({})).toBeNull()
    expect(buildTranscriptionPrompt({ businessName: '   ' })).toBeNull()
  })

  test('keywords är samma termer i annan form, kapade till max', () => {
    const input = { businessName: 'Bee Bygg', productNames: Array.from({ length: 100 }, (_, i) => `Art ${i}`) }
    expect(buildKeywords(input, 10)).toHaveLength(10)
    expect(buildKeywords(input)[0]).toBe('Bee Bygg')
  })
})

// ─────────────────────────────────────────────────────────────────
// Motorvalet — prompt och diarisering utesluter varandra
// ─────────────────────────────────────────────────────────────────

test.describe('motorvalet', () => {
  test.afterEach(() => {
    delete process.env.TRANSCRIPTION_DIARIZE
    delete process.env.TRANSCRIPTION_MODEL
  })

  test('standard är whisper-1 tills mätningen säger annat', () => {
    for (const yta of ['samtal', 'mote', 'matte', 'jobbuddy'] as const) {
      expect(valjModell(yta)).toBe('whisper-1')
    }
  })

  test('diariseringen slås på för FLERPARTSYTOR — och bara dem', () => {
    process.env.TRANSCRIPTION_DIARIZE = '1'
    expect(valjModell('samtal')).toBe('gpt-4o-transcribe-diarize')
    expect(valjModell('mote')).toBe('gpt-4o-transcribe-diarize')
    // Ensamtalarytor: diarisering ger inget, prompten allt
    expect(valjModell('matte')).toBe('whisper-1')
    expect(valjModell('jobbuddy')).toBe('whisper-1')
  })

  test('varje yta hör till exakt en grupp — ingen kan glömmas bort', () => {
    const alla = ['samtal', 'mote', 'matte', 'jobbuddy'] as const
    for (const yta of alla) {
      const iFlerpart = _FLERPARTSYTOR.has(yta)
      const iEnsam = _ENSAMTALARYTOR.has(yta)
      expect(iFlerpart !== iEnsam, yta + ' måste ligga i exakt en grupp').toBe(true)
    }
    expect(_FLERPARTSYTOR.size + _ENSAMTALARYTOR.size).toBe(alla.length)
  })

  test('matte och jobbuddy behandlas lika — en skillnad ska vara ett beslut, inte en slump', () => {
    process.env.TRANSCRIPTION_DIARIZE = '1'
    expect(valjModell('matte')).toBe(valjModell('jobbuddy'))
    delete process.env.TRANSCRIPTION_DIARIZE
    expect(valjModell('matte')).toBe(valjModell('jobbuddy'))
  })

  test('mätrutten kan tvinga en modell utan att röra produktionens val', () => {
    expect(valjModell('samtal', 'gpt-4o-transcribe')).toBe('gpt-4o-transcribe')
  })
})

// ─────────────────────────────────────────────────────────────────
// Källskanning — en väg till API:t, kostnaden mätt en gång
// ─────────────────────────────────────────────────────────────────

const YTOR: Array<[string, string]> = [
  ['46elks-samtal', 'app/api/voice/transcribe/route.ts'],
  ['mötessegment', 'lib/meetings/process-job.ts'],
  ['Matte röstläge', 'app/api/matte/transcribe/route.ts'],
  ['JobBuddy röst', 'app/api/jobbuddy/voice/route.ts'],
]

test.describe('en modul, en sanning', () => {
  test('ingen fil utanför lib/transcription anropar audio/transcriptions', () => {
    const traffar: string[] = []
    const sok = (dir: string) => {
      for (const post of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${post.name}`
        if (post.isDirectory()) {
          if (post.name === 'node_modules' || post.name === '.next') continue
          sok(rel)
        } else if (post.name.endsWith('.ts') || post.name.endsWith('.tsx')) {
          if (rel.startsWith('lib/transcription/')) continue
          if (kod(rel).includes('audio/transcriptions')) traffar.push(rel)
        }
      }
    }
    sok('app')
    sok('lib')
    expect(traffar, 'Whisper-anrop utanför den delade modulen — kvalitetslyft skulle behöva göras igen där').toEqual([])
  })

  for (const [namn, fil] of YTOR) {
    test(`${namn} går via modulen, med vakt och vokabulär`, () => {
      const src = kod(fil)
      expect(src).toContain("from '@/lib/transcription/transcribe'")
      expect(src).toContain('laddaVokabular(')
      expect(src).toContain('vocabulary,')
      // Vakten måste hanteras — annars vore den verkningslös just här
      expect(src).toContain('resultat.avvisad')
    })
  }

  test('kostnaden bokförs i modulen, inte längre per yta', () => {
    const modul = kod('lib/transcription/transcribe.ts')
    expect(modul).toContain("resource: 'whisper'")
    expect(modul).toContain('whisperCostOre(durationSeconds)')
    // Varje yta behåller sitt refType — de är mappade i REF_TYPE_BUCKET
    expect(modul).toContain('refType: input.refType')
    for (const [, fil] of YTOR) {
      expect(kod(fil), `${fil} ska inte bokföra Whisper-kostnad själv längre`)
        .not.toMatch(/resource: 'whisper'/)
    }
  })

  test('refType-värdena är de som finns i bränslemätarens bucket-karta', () => {
    const fuel = kod('lib/costs/fuel.ts')
    for (const ref of ['call_recording', 'meeting_segment', 'matte_transcribe', 'jobbuddy_voice']) {
      expect(fuel, `${ref} måste ha en bucket, annars fälls bransle-matare.spec.ts`).toContain(`${ref}:`)
    }
  })

  test('känd ljudlängd ur databasen vinner över motorns egen', () => {
    const modul = kod('lib/transcription/transcribe.ts')
    expect(modul).toContain('Number(input.knownDurationSeconds) || Number(json.duration) || 0')
  })

  test('diariseringsmotorn får varken prompt eller verbose_json', () => {
    const modul = kod('lib/transcription/transcribe.ts')
    expect(modul).toContain("return !modell.includes('diarize')")
    expect(modul).toContain("if (modell.includes('diarize')) return 'diarized_json'")
  })

  test('modulen kastar aldrig — ett fel är ett resultat', () => {
    const modul = kod('lib/transcription/transcribe.ts')
    expect(modul).toContain('ok: false')
    expect(modul).not.toMatch(/throw new Error/)
  })
})

test.describe('mätrutten', () => {
  const src = kod('app/api/admin/transcription-bench/route.ts')

  test('adminspärrad och dynamisk', () => {
    expect(src).toContain('isAdmin(request)')
    expect(src).toContain('status: 403')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
  })

  test('jämför alla tre kandidatmotorer på samma ljud', () => {
    expect(src).toContain("'whisper-1', 'gpt-4o-transcribe', 'gpt-4o-transcribe-diarize'")
    expect(src).toContain('modellOverride: modell')
  })

  test('belastar aldrig kundens bränslemätare — mätning är inte förbrukning', () => {
    expect(src).toContain('hoppaOverKostnad: true')
  })

  test('samma URL-validering som samtalsvägen när ljudet hämtas från 46elks', () => {
    expect(src).toContain("audioUrl.hostname !== 'api.46elks.com'")
    expect(src).toContain("redirect: 'error'")
  })
})

test.describe('avvisade transkript syns i stället för att bli tomma', () => {
  test('sql/v210 lägger till kolumnerna idempotent', () => {
    const sql = kod('sql/v210_transkript_kvalitet.sql')
    for (const k of ['transcript_skipped_reason', 'transcript_segments', 'speaker_segments']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${k}`)
    }
    expect(sql).toContain('COMMENT ON COLUMN')
  })

  test('samtalsvägen sparar anledningen och startar INGEN analys', () => {
    const src = kod('app/api/voice/transcribe/route.ts')
    const block = src.slice(src.indexOf('if (resultat.avvisad)'), src.indexOf('if (!resultat.ok)'))
    expect(block).toContain('transcript_skipped_reason')
    expect(block).toContain('status: 422')
    // Analysen får aldrig triggas från avvisningsgrenen
    expect(block).not.toContain('continueAnalysis')
  })

  test('mötesvägen ger upp segmentet i stället för att retria tystnad i evighet', () => {
    const src = kod('lib/meetings/process-job.ts')
    const block = src.slice(src.indexOf('if (resultat.avvisad)'), src.indexOf('if (!resultat.ok)'))
    expect(block).toContain("status: 'transcribed'")
    expect(block).toContain('transcript_skipped_reason')
    expect(block).not.toContain('bumpRetry')
  })
})

/**
 * T5 — relativa datum blir riktiga datum.
 *
 * Hela promise-kedjan fanns redan byggd: prompten bad om due_date_iso,
 * normalizeDueDateIso validerade, approvals-handlern skrev due_at +
 * promise_status='open', och cron/promise-deadlines svepte dem. Men modellen
 * fick aldrig veta VILKEN DAG samtalet ägde rum — den kunde alltså inte
 * räkna ut vad "på fredag" betyder, samtidigt som prompten (rätteligen)
 * förbjuder den att gissa. Kedjan var komplett utom sin första länk.
 */
test.describe('datumankaret för löften', () => {
  const src = kod('app/api/voice/analyze/route.ts')

  test('samtalsdatumet härleds ur inspelningen, inte ur serverns klocka', () => {
    expect(src).toContain('const samtalsdatum = new Date(recording.created_at || Date.now())')
    expect(src).toContain(".toISOString().slice(0, 10)")
  })

  test('alla tre prompter bär ankaret — annars är vägen bara delvis lagad', () => {
    const traffar = src.match(/Samtalet ägde rum \$\{samtalsdatum\}|\$\{samtalsdatum\} — räkna ut relativa uttryck/g) || []
    expect(traffar.length, 'map-steget, engångsanropet och samtalsvarianten').toBeGreaterThanOrEqual(3)
  })

  test('ankaret följer med genom map-reduce till varje chunk', () => {
    expect(src).toContain('extraheraFyndFranChunk(anthropic, model, chunks[i], i, chunks.length, samtalsdatum)')
    expect(src).toContain('samtalsdatum: string')
  })

  test('gissningsförbudet står kvar — ankaret ger underlag, inte licens att hitta på', () => {
    expect(src).toContain('Gissa ALDRIG ett datum')
  })

  test('valideringen i kod är kvar — prompttillit räcker inte', () => {
    const build = kod('lib/customer-facts/build-card.ts')
    expect(build).toContain('export function normalizeDueDateIso')
    // Formatkontrollen står som regex-literal i källan: /^\d{4}-\d{2}-\d{2}/
    expect(build).toContain(String.raw`\d{4}-\d{2}-\d{2}`)
  })
})
