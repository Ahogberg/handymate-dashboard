'use client'

/**
 * Segmenterad röstinspelning — Mötesassistenten V2 (Meeting Intelligence,
 * 2026-08).
 *
 * ═══ VARFÖR SEGMENT, INTE EN LÅNG INSPELNING ═══
 *
 * V1 (`useAudioRecording`) spelar in EN sammanhängande fil i max 10 minuter
 * och laddar upp den synkront när hantverkaren trycker "spara". Det håller
 * inte för 90-minuters möten: filen blir för stor, och en krasch eller
 * nätverksbortfall mot slutet slänger hela mötet.
 *
 * Lösningen är att starta om MediaRecorder var femte minut. Varje segment
 * blir därmed en HELT EGEN, självständigt avkodbar ljudfil — inte en bit av
 * en större ström. Det är avsiktligt, inte en begränsning vi råkat hamna i:
 *
 * - MediaRecorders `timeslice`-chunkar (andra argumentet till `.start()`)
 *   är INTE självständigt avkodbara var för sig — bara den första chunken
 *   bär containerhuvudet (webm/mp4-boxarna). Chunk 2, 3, 4... är bara
 *   fortsättningsbytes som kräver chunk 1 för att kunna spelas upp.
 * - iOS Safaris fragmenterade MP4 (`fMP4`) är opålitlig i praktiken.
 * - Genom att stoppa och starta om MediaRecorder-INSTANSEN (inte bara be om
 *   en ny timeslice) får varje segment sitt eget kompletta containerhuvud
 *   och kan laddas upp och transkriberas oberoende av alla andra segment.
 *
 * Samma ström (`getUserMedia`-resultatet) återanvänds genom hela mötet —
 * bara MediaRecorder-instansen byts ut. Att be om en ny ström per segment
 * skulle be om mikrofontillstånd 18 gånger under ett 90-minutersmöte.
 *
 * ═══ VAD SOM ÄRVS FRÅN V1, OCH VAD SOM MEDVETET INTE GÖR DET ═══
 *
 * Ärvt: mime-fallbacken (`audio/webm` → `audio/mp4` för iOS Safari),
 * felmappningen för getUserMedia (NotAllowedError/SecurityError → 'denied',
 * annars 'unsupported'), och att varje ljudspår stoppas explicit så att
 * webbläsarens röda inspelningsindikator inte blir hängande.
 *
 * INTE ärvt: V1 verkställde taket genom att anropa `recorder.stop()` inuti
 * en `setDuration`-updater-funktion — en sidoeffekt gömd i en reducer.
 * Den här hooken kör alla recorder-sidoeffekter (rotera, stoppa) som vanliga
 * satser i timerns callback, utanför alla `setState`-updaters.
 *
 * ═══ VARFÖR ONSEGMENT LIGGER I EN REF ═══
 *
 * `onstop`-hanteraren sätts en gång per MediaRecorder-instans (18 gånger
 * under ett 90-minutersmöte). Om den stängde in `options.onSegment` direkt
 * skulle den fånga vilken version av callbacken som fanns när just DEN
 * instansen skapades — och komponentens uppladdningskö-logik kan ha ändrats
 * (nytt jobId, ny kö-referens) sedan dess. Refen läses alltid i nuet.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type SegmentedRecordingState =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'denied'
  | 'unsupported'

export interface SegmentPayload {
  blob: Blob
  seq: number
  durationSeconds: number
  mimeType: string
}

export interface UseSegmentedRecordingOptions {
  /** Segmentlängd i sekunder innan MediaRecorder roteras. Default 300 (5 min). */
  segmentSeconds?: number
  /** Hårt tak för hela mötet i sekunder. Default 5400 (90 min). */
  maxTotalSeconds?: number
  /** Anropas med varje färdigt, självständigt avkodbart segment. */
  onSegment: (segment: SegmentPayload) => void
}

export interface UseSegmentedRecording {
  state: SegmentedRecordingState
  /** Total speltid i sekunder sedan start() — fryser under paus. */
  duration: number
  /** Formaterad total speltid, t.ex. "12:34". */
  durationLabel: string
  /** Sekunder kvar till 90-minuterstaket. */
  secondsLeft: number
  /** Löpnummer för det segment som just nu spelas in (eller senast startades). */
  currentSeq: number
  start: () => Promise<void>
  /** Stoppar innevarande segment (laddas upp) — strömmen hålls vid liv. */
  pause: () => void
  /** Startar ett nytt segment på samma ström. */
  resume: () => void
  /** Stoppar sista segmentet och släpper mikrofonen helt. */
  stop: () => void
  /** Avbryter allt UTAN att sista, ofärdiga segmentet laddas upp. */
  reset: () => void
  /** Sant om mötet tog slut för att 90-minuterstaket nåddes, inte av användaren. */
  stoppedByLimit: boolean
}

const DEFAULT_SEGMENT_SECONDS = 5 * 60
const DEFAULT_MAX_TOTAL_SECONDS = 90 * 60

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function useSegmentedRecording(options: UseSegmentedRecordingOptions): UseSegmentedRecording {
  const segmentSeconds = options.segmentSeconds ?? DEFAULT_SEGMENT_SECONDS
  const maxTotalSeconds = options.maxTotalSeconds ?? DEFAULT_MAX_TOTAL_SECONDS

  const [state, setState] = useState<SegmentedRecordingState>('idle')
  const [duration, setDuration] = useState(0)
  const [currentSeq, setCurrentSeq] = useState(0)
  const [stoppedByLimit, setStoppedByLimit] = useState(false)

  const onSegmentRef = useRef(options.onSegment)
  useEffect(() => {
    onSegmentRef.current = options.onSegment
  })

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const mimeTypeRef = useRef<string>('audio/webm')
  const seqRef = useRef(0)
  const totalElapsedRef = useRef(0)
  const segmentElapsedRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // reset() sätter denna INNAN den stoppar den aktiva recordern — onstop
  // kollar flaggan och hoppar över uppladdning av det avbrutna segmentet.
  const abortingRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Släpper mikrofonen. Måste köras vid stop/reset/avmontering — annars
  // ligger webbläsarens röda inspelningsindikator kvar.
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [])

  // Startar ETT segment på den befintliga strömmen. `chunks` och `startedAt`
  // är lokala variabler stängda in av just DEN HÄR recorderns callbacks —
  // inte delade refar. Det är medvetet: vid rotation startas nästa segment
  // innan förra hunnit trigga sitt (asynkrona) onstop-event, och en delad
  // ref för chunkarna skulle blanda ihop svansen av segment N med huvudet
  // av segment N+1.
  const beginSegment = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return

    seqRef.current += 1
    setCurrentSeq(seqRef.current)

    const seq = seqRef.current
    const mimeType = mimeTypeRef.current
    const chunks: Blob[] = []
    const startedAt = Date.now()

    const recorder = new MediaRecorder(stream, { mimeType })
    recorderRef.current = recorder

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      if (abortingRef.current) return // reset() — kasta tyst, ladda inte upp

      const segDuration = Math.round((Date.now() - startedAt) / 1000)
      const blob = new Blob(chunks, { type: mimeType })
      // Ett 0-längds svanssegment (snabb stopp direkt efter start) hoppas
      // tyst över — inget att transkribera, bara brus i uppladdningskön.
      if (blob.size > 0 && segDuration >= 1) {
        onSegmentRef.current({ blob, seq, durationSeconds: segDuration, mimeType })
      }
    }

    recorder.start()
  }, [])

  // Stoppar innevarande segment (emitterar det) och släpper mikrofonen helt.
  const finishRecording = useCallback((byLimit: boolean) => {
    clearTimer()
    const rec = recorderRef.current
    if (rec && rec.state === 'recording') {
      rec.stop()
    }
    recorderRef.current = null
    releaseStream()
    setStoppedByLimit(byLimit)
    setState('stopped')
  }, [clearTimer, releaseStream])

  // Enda timern för hela mötet. Sidoeffekter (rotera/stoppa) körs som vanliga
  // satser här — INTE gömda inuti en setState-updater (V1:s misstag).
  const tick = useCallback(() => {
    totalElapsedRef.current += 1
    segmentElapsedRef.current += 1
    setDuration(totalElapsedRef.current)

    if (totalElapsedRef.current >= maxTotalSeconds) {
      finishRecording(true)
      return
    }
    if (segmentElapsedRef.current >= segmentSeconds) {
      segmentElapsedRef.current = 0
      const old = recorderRef.current
      if (old && old.state === 'recording') {
        old.stop() // emitterar det färdiga segmentet asynkront via onstop
      }
      beginSegment() // nytt segment på SAMMA ström, ingen ny getUserMedia
    }
  }, [maxTotalSeconds, segmentSeconds, finishRecording, beginSegment])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = setInterval(tick, 1000)
  }, [clearTimer, tick])

  useEffect(() => {
    return () => {
      clearTimer()
      abortingRef.current = true
      if (recorderRef.current?.state === 'recording') {
        try { recorderRef.current.stop() } catch { /* redan stoppad */ }
      }
      releaseStream()
    }
  }, [clearTimer, releaseStream])

  const start = useCallback(async () => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // iOS Safari stöder inte webm — utan fallbacken kastar konstruktorn
      // på varje iPhone, och telefonen är hantverkarens huvudsakliga yta.
      mimeTypeRef.current = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'

      abortingRef.current = false
      seqRef.current = 0
      totalElapsedRef.current = 0
      segmentElapsedRef.current = 0
      setDuration(0)
      setCurrentSeq(0)
      setStoppedByLimit(false)

      beginSegment()
      setState('recording')
      startTimer()
    } catch (err) {
      releaseStream()
      // NotAllowedError = användaren nekade. Allt annat (ingen mikrofon,
      // osäker kontext) hanteras som "går inte här" — båda måste synas i
      // gränssnittet, aldrig tystas.
      const name = err instanceof Error ? err.name : ''
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unsupported')
    }
  }, [beginSegment, startTimer, releaseStream])

  const pause = useCallback(() => {
    // Läget avgörs av recordern själv, inte av React-state — samma princip
    // som timerns sidoeffekter: inga statuskontroller gömda i en updater.
    if (recorderRef.current?.state !== 'recording') return
    clearTimer()
    recorderRef.current.stop() // emitterar innevarande segment, strömmen lever kvar
    recorderRef.current = null
    setState('paused')
  }, [clearTimer])

  const resume = useCallback(() => {
    if (!streamRef.current) return
    segmentElapsedRef.current = 0
    beginSegment()
    setState('recording')
    startTimer()
  }, [beginSegment, startTimer])

  const stop = useCallback(() => {
    if (!streamRef.current) return // inget att stoppa (idle eller redan stoppat)
    finishRecording(false)
  }, [finishRecording])

  const reset = useCallback(() => {
    abortingRef.current = true
    clearTimer()
    if (recorderRef.current?.state === 'recording') {
      try { recorderRef.current.stop() } catch { /* redan stoppad */ }
    }
    recorderRef.current = null
    releaseStream()
    seqRef.current = 0
    totalElapsedRef.current = 0
    segmentElapsedRef.current = 0
    setDuration(0)
    setCurrentSeq(0)
    setStoppedByLimit(false)
    setState('idle')
  }, [clearTimer, releaseStream])

  return {
    state,
    duration,
    durationLabel: formatDuration(duration),
    secondsLeft: Math.max(0, maxTotalSeconds - duration),
    currentSeq,
    start,
    pause,
    resume,
    stop,
    reset,
    stoppedByLimit,
  }
}
