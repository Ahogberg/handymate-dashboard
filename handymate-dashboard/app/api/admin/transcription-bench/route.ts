import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'
import { transcribe, type TranscriptionYta } from '@/lib/transcription/transcribe'
import { laddaVokabular, buildTranscriptionPrompt } from '@/lib/transcription/vocabulary'
import { whisperCostOre } from '@/lib/costs/meter'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/transcription-bench — mätprotokoll för transkribering.
 *
 * fltman/kundkoll gjorde något vi aldrig gjort: körde SAMMA ljudfil genom
 * varje motor och skrev ut tid och faktiska fel (docs/VERIFIERAD-STACK.md).
 * Det gav dem ett mätbart svar på vilken modell som klarar svenska — och
 * svaret var inte det man gissar: KB-Whisper medium slog den STÖRRE
 * large-v3-turbo på egennamn.
 *
 * Vi kan inte köra deras lokala modeller serverless, men vi kan mäta vårt
 * eget utbud på riktiga svenska hantverkarsamtal i stället för att gissa.
 * Det är särskilt viktigt eftersom OpenAI tvingar fram ett val:
 *
 *   whisper-1                  prompt: ja   talare: nej   verbose_json
 *   gpt-4o-transcribe          prompt: ja   talare: nej
 *   gpt-4o-transcribe-diarize  prompt: NEJ  talare: JA    diarized_json
 *
 * Prompt (egennamn) och diarisering (vem sa vad) utesluter alltså varandra.
 * Vilken som väger tyngst per yta ska avgöras på data, inte på magkänsla.
 *
 * ═══ ANVÄNDNING ═══
 *
 * Multipart med en ljudfil:
 *   curl -X POST .../api/admin/transcription-bench \
 *     -H "Cookie: <admin-session>" -F audio=@samtal.wav -F business_id=biz_x
 *
 * Eller ett riktigt inspelat samtal som redan ligger i databasen:
 *   { "recording_id": "rec_...", "business_id": "biz_..." }
 *
 * Svaret listar per motor: transkript, tid i millisekunder, uppskattad
 * kostnad och om vakten skulle ha avvisat texten. Egennamnen jämförs med
 * ögat — det är hela poängen med att lägga transkripten sida vid sida.
 *
 * KOSTAR PENGAR: varje körning transkriberar samma ljud N gånger. Kostnaden
 * bokförs INTE på kundens bränslemätare (hoppaOverKostnad) — det är
 * diagnostik, inte förbrukning, samma hållning som ProbeResource i
 * lib/costs/record.ts.
 */

/** Motorerna som jämförs. Utöka listan när OpenAI släpper något nytt. */
const MOTORER = ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-transcribe-diarize'] as const

interface MotorResultat {
  modell: string
  ok: boolean
  ms: number
  text: string
  teckenAntal: number
  harTalare: boolean
  antalSegment: number
  avvisadAvVakten: string | null
  uppskattadKostnadOre: number | null
  error?: string
}

export async function POST(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  let file: Blob | null = null
  let filename = 'bench.wav'
  let businessId = ''
  let yta: TranscriptionYta = 'samtal'
  let knownDuration = 0

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const uppladdad = form.get('audio')
    if (!(uppladdad instanceof File)) {
      return NextResponse.json({ error: 'Bifoga en ljudfil i fältet "audio"' }, { status: 400 })
    }
    file = uppladdad
    filename = uppladdad.name || filename
    businessId = String(form.get('business_id') || '')
    knownDuration = Number(form.get('duration_seconds') || 0)
    const ytaIn = String(form.get('yta') || 'samtal')
    if (ytaIn === 'mote' || ytaIn === 'matte' || ytaIn === 'jobbuddy') yta = ytaIn
  } else {
    const body = await request.json().catch(() => ({}))
    businessId = String(body.business_id || '')
    const recordingId = String(body.recording_id || '')
    if (!recordingId) {
      return NextResponse.json({ error: 'Ange recording_id, eller ladda upp en fil som multipart' }, { status: 400 })
    }

    const { data: recording, error } = await supabase
      .from('call_recording')
      .select('recording_url, business_id, duration_seconds')
      .eq('recording_id', recordingId)
      .maybeSingle()

    if (error || !recording?.recording_url) {
      return NextResponse.json({ error: 'Inspelningen hittades inte' }, { status: 404 })
    }

    businessId = businessId || recording.business_id
    knownDuration = Number(recording.duration_seconds) || 0

    // Samma URL-validering som app/api/voice/transcribe: inloggningsuppgifter
    // får aldrig följa med till en tredje part.
    const audioUrl = new URL(recording.recording_url)
    if (audioUrl.protocol !== 'https:' || audioUrl.hostname !== 'api.46elks.com' || audioUrl.username || audioUrl.password) {
      return NextResponse.json({ error: 'Inspelningsadressen kunde inte verifieras.' }, { status: 400 })
    }
    const res = await fetch(audioUrl.toString(), {
      redirect: 'error',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${process.env.ELKS_API_USER}:${process.env.ELKS_API_PASSWORD}`).toString('base64'),
      },
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Kunde inte hämta inspelningen: ${res.status}` }, { status: 502 })
    }
    file = new Blob([await res.arrayBuffer()], { type: 'audio/wav' })
    filename = 'recording.wav'
  }

  if (!businessId) {
    return NextResponse.json({ error: 'business_id krävs — vokabuläret byggs ur firmans data' }, { status: 400 })
  }

  const vocabulary = await laddaVokabular(supabase, businessId)
  const prompt = buildTranscriptionPrompt(vocabulary)

  const resultat: MotorResultat[] = []
  for (const modell of MOTORER) {
    const start = Date.now()
    const r = await transcribe(supabase, businessId, {
      yta,
      file: file as Blob,
      filename,
      knownDurationSeconds: knownDuration,
      vocabulary,
      refType: 'probe_transcription_bench',
      modellOverride: modell,
      hoppaOverKostnad: true,
    })
    const ms = Date.now() - start

    resultat.push({
      modell,
      ok: r.ok,
      ms,
      text: r.text,
      teckenAntal: r.text.length,
      harTalare: r.harTalare,
      antalSegment: r.segments?.length ?? 0,
      avvisadAvVakten: r.avvisad?.skal ?? null,
      uppskattadKostnadOre: r.durationSeconds > 0 ? whisperCostOre(r.durationSeconds) : null,
      error: r.error,
    })
  }

  return NextResponse.json({
    business_id: businessId,
    yta,
    ljudlangd_sekunder: knownDuration || null,
    // Prompten visas så den går att bedöma: fick egennamnen plats, eller
    // kapades de bort av teckengränsen?
    prompt,
    prompt_tecken: prompt?.length ?? 0,
    motorer: resultat,
    lasanvisning:
      'Jämför egennamn (firma, ort, kundnamn) mellan transkripten med ögat — det är där skillnaden syns. ' +
      'Skriv resultatet till docs/audits/TRANSKRIBERING-MATT-2026-09.md i samma form som Kundkolls tabell.',
  })
}
