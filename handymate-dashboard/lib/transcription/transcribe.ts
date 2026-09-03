/**
 * Transkribering — EN väg till audio/transcriptions (2026-09-03).
 *
 * Före den här modulen fanns fyra separata Whisper-anrop med olika parametrar
 * och ingen delad kod:
 *   app/api/voice/transcribe/route.ts   (46elks-samtal)
 *   lib/meetings/process-job.ts         (mötessegment)
 *   app/api/matte/transcribe/route.ts   (Matte röstläge)
 *   app/api/jobbuddy/voice/route.ts     (JobBuddy röst)
 *
 * Ingen skickade prompt. Ingen hade hallucinationsvakt. Inget facit låste
 * något av det. En kvalitetshöjning fick alltså göras fyra gånger, eller
 * glömmas på tre ställen — och båda huvudvägarna (samtal och möte) landar i
 * samma POST /api/voice/analyze, där agenterna bygger godkännandekort på
 * texten. Transkriptkvaliteten är kedjans smalaste punkt.
 *
 * Samma mönster som lib/branding/attribution.ts och
 * lib/billing/write-billing-update.ts: en modul, en sanning, facit ovanpå.
 *
 * ═══ MOTORVAL PER YTA ═══
 *
 * OpenAI:s utbud tvingar fram ett val (verifierat mot dokumentationen
 * 2026-09-03): `gpt-4o-transcribe-diarize` är den enda som märker upp TALARE,
 * men den stöder INTE prompt. `whisper-1` och `gpt-4o-transcribe` tar prompt
 * men vet inte vem som talar. Prompt och diarisering utesluter alltså
 * varandra, och vilken som väger tyngst skiljer sig per yta:
 *
 *   samtal, mote      — flera parter. Vem som lovade vad avgör om ett ÄTA
 *                       eller ett promise_deadline är riktigt. Diarisering
 *                       väger tyngst (aktiveras när TRANSCRIPTION_DIARIZE=1,
 *                       efter att mätningen i /api/admin/transcription-bench
 *                       visat att den håller på svenska).
 *   matte, jobbuddy   — en talare. Diarisering ger inget; egennamn allt.
 *
 * Standardmotorn är whisper-1 tills mätningen säger annat. Byte sker med en
 * miljövariabel, inte med en kodändring på fyra ställen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { recordCost } from '@/lib/costs/record'
import { whisperCostOre } from '@/lib/costs/meter'
import { granskaTranskript, type GuardResultat } from './guard'
import { buildTranscriptionPrompt, buildKeywords, type VocabularyInput } from './vocabulary'

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'

export type TranscriptionYta = 'samtal' | 'mote' | 'matte' | 'jobbuddy'

/** Ytor där flera personer talar och talaruppmärkning är värd att offra prompten för. */
const FLERPARTSYTOR: ReadonlySet<TranscriptionYta> = new Set<TranscriptionYta>(['samtal', 'mote'])

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  /** Satt först när diariseringsmotorn används. */
  speaker?: string | null
}

export interface TranscribeInput {
  yta: TranscriptionYta
  /** Ljudet. Blob från Supabase Storage, File från en uppladdning, m.m. */
  file: Blob
  filename: string
  /**
   * Känd ljudlängd i sekunder när den finns i databasen
   * (call_recording.duration_seconds, meeting_segment.duration_seconds).
   * Saknas den läses den ur svaret när motorn rapporterar den.
   */
  knownDurationSeconds?: number | null
  /** Egennamn och fackord — se vocabulary.ts. Utelämnas för ytor utan kontext. */
  vocabulary?: VocabularyInput | null
  /**
   * Kostnadens ref_type. Varje yta behåller sitt befintliga värde
   * ('call_recording', 'meeting_segment', 'matte_transcribe', 'jobbuddy_voice')
   * — de är alla mappade i REF_TYPE_BUCKET (lib/costs/fuel.ts), vars facit
   * kräver att varje ref_type i kodbasen har en explicit bucket. Ett nytt
   * namn här hade fällt tests/bransle-matare.spec.ts, och värre: gjort
   * bränslemätarens historik ojämförbar över bytet.
   */
  refType: string
  refId?: string
  /** Tvingar en specifik modell. Används av mätrutten, aldrig i produktion. */
  modellOverride?: string
  /** Mätrutten bokför ingen kundkostnad — den är diagnostik, inte förbrukning. */
  hoppaOverKostnad?: boolean
}

export interface TranscribeResultat {
  ok: boolean
  text: string
  segments: TranscriptSegment[] | null
  /** true när minst ett segment bär en talare. */
  harTalare: boolean
  durationSeconds: number
  modell: string
  /** Satt när vakten avvisade texten — se guard.ts. */
  avvisad?: GuardResultat
  error?: string
}

/** Modellen för en yta. Bytet sker här, inte i fyra rutter. */
export function valjModell(yta: TranscriptionYta, override?: string): string {
  if (override) return override
  if (FLERPARTSYTOR.has(yta) && process.env.TRANSCRIPTION_DIARIZE === '1') {
    return 'gpt-4o-transcribe-diarize'
  }
  return process.env.TRANSCRIPTION_MODEL || 'whisper-1'
}

/** Diariseringsmodellen tar varken prompt eller verbose_json. */
function stoderPrompt(modell: string): boolean {
  return !modell.includes('diarize')
}

function svarsformat(modell: string): string {
  if (modell.includes('diarize')) return 'diarized_json'
  // verbose_json ger segment OCH en faktisk ljudlängd (modellen mäter, gissar
  // inte ur filstorlek) — det är vad som gör kostnaden mätbar.
  return 'verbose_json'
}

interface RaSegment {
  start?: number
  end?: number
  text?: string
  speaker?: string
}

function lasSegment(json: Record<string, unknown>): TranscriptSegment[] | null {
  const ra = json.segments
  if (!Array.isArray(ra)) return null
  const ut = (ra as RaSegment[])
    .map(s => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: typeof s.text === 'string' ? s.text : '',
      speaker: typeof s.speaker === 'string' ? s.speaker : null,
    }))
    .filter(s => s.text.length > 0)
  return ut.length > 0 ? ut : null
}

/**
 * Transkriberar och granskar. Kastar aldrig — ett fel är ett resultat med
 * ok:false, så anroparen kan välja mellan retry och att ge upp.
 *
 * Kostnaden mäts HÄR, en gång per lyckat anrop, så den inte kan glömmas på en
 * ny yta. Mätningen är best-effort och får aldrig fälla transkriberingen.
 */
export async function transcribe(
  supabase: SupabaseClient,
  businessId: string,
  input: TranscribeInput,
): Promise<TranscribeResultat> {
  const modell = valjModell(input.yta, input.modellOverride)

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false, text: '', segments: null, harTalare: false, durationSeconds: 0, modell,
      error: 'Transkribering är inte konfigurerad (OPENAI_API_KEY saknas).',
    }
  }

  const form = new FormData()
  form.append('file', input.file, input.filename)
  form.append('model', modell)
  form.append('language', 'sv')
  form.append('response_format', svarsformat(modell))

  // Egennamn — vår motsvarighet till en svensktränad modell, se vocabulary.ts.
  if (input.vocabulary && stoderPrompt(modell)) {
    const prompt = buildTranscriptionPrompt(input.vocabulary)
    if (prompt) form.append('prompt', prompt)
    if (modell.startsWith('gpt-4o')) {
      for (const ord of buildKeywords(input.vocabulary)) form.append('keywords[]', ord)
    }
  }

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    })
  } catch (err) {
    return {
      ok: false, text: '', segments: null, harTalare: false, durationSeconds: 0, modell,
      error: err instanceof Error ? err.message : 'Transkriberingsanropet misslyckades',
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return {
      ok: false, text: '', segments: null, harTalare: false, durationSeconds: 0, modell,
      error: `Transkribering ${res.status}: ${errText.slice(0, 200)}`,
    }
  }

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!json) {
    return {
      ok: false, text: '', segments: null, harTalare: false, durationSeconds: 0, modell,
      error: 'Transkriberingssvaret kunde inte läsas',
    }
  }

  const text = typeof json.text === 'string' ? json.text : ''
  const segments = lasSegment(json)
  // Känd längd ur databasen vinner: den är sann även när motorn inte
  // rapporterar någon (diariseringsmodellen gör det inte).
  const durationSeconds = Number(input.knownDurationSeconds) || Number(json.duration) || 0

  const granskning = granskaTranskript(text, durationSeconds)

  // Kostnaden uppstod oavsett vad vakten tycker om texten — anropet är gjort
  // och OpenAI debiterar. Att inte mäta den hade gömt kostnaden för tysta
  // samtal, som är precis de vi nu upptäcker att vi har.
  if (durationSeconds > 0 && !input.hoppaOverKostnad) {
    await recordCost({
      supabase,
      businessId,
      resource: 'whisper',
      units: durationSeconds,
      costOre: whisperCostOre(durationSeconds),
      refType: input.refType,
      refId: input.refId,
    })
  }

  if (!granskning.ok) {
    return {
      ok: false, text: '', segments: null, harTalare: false, durationSeconds, modell,
      avvisad: granskning,
      error: granskning.meddelande,
    }
  }

  return {
    ok: true,
    text,
    segments,
    harTalare: Boolean(segments?.some(s => s.speaker)),
    durationSeconds,
    modell,
  }
}
