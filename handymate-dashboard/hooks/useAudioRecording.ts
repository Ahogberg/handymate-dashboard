'use client'

/**
 * Röstinspelning — delad mellan Jobbkompisen och Snabbofferten (etapp C1, 2026-08-06).
 *
 * ═══ VARFÖR EN EGEN HOOK ═══
 *
 * Logiken fanns bara inuti Jobbkompisen.tsx. Snabbofferten behöver exakt samma
 * sak, och en kopia hade garanterat glidit isär — särskilt kring iOS, där
 * felen är svåra att upptäcka från en Windows-maskin.
 *
 * ═══ DET SOM ÄR LÄTT ATT GÖRA FEL ═══
 *
 * - **iOS Safari stöder inte audio/webm.** Fallbacken till audio/mp4 är inte
 *   valfri — utan den kastar MediaRecorder-konstruktorn på varje iPhone, och
 *   hantverkare är på telefon.
 * - **Mikrofonspåren måste stoppas explicit.** Utan `track.stop()` blir den
 *   röda inspelningsindikatorn kvar i webbläsaren efter att inspelningen
 *   avslutats, vilket ser ut som att appen tjuvlyssnar.
 * - **Timern måste rensas i cleanup.** Lämnas den kvar tickar den vidare efter
 *   att komponenten avmonterats och sätter state på något som inte finns.
 * - **Avslaget nekande är ett normalt utfall**, inte ett fel att svälja tyst:
 *   hantverkaren måste få veta varför ingenting händer när han trycker på
 *   mikrofonen.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type RecordingState = 'idle' | 'recording' | 'stopped' | 'denied' | 'unsupported'

export interface UseAudioRecordingOptions {
  /**
   * Hård maxlängd i sekunder. Vid taket stoppas inspelningen AV HOOKEN —
   * inte av komponenten, som kan ha avmonterats eller tappat fokus.
   * Mötesassistenten kräver detta (10 min); utan tak växer en bortglömd
   * inspelning tills webbläsaren tar slut på minne eller filen blir för
   * stor för Whisper (25 MB).
   */
  maxDurationSeconds?: number
}

export interface UseAudioRecording {
  state: RecordingState
  /** Sekunder sedan inspelningen startade. */
  duration: number
  /** Klar inspelning, null tills något spelats in. */
  blob: Blob | null
  start: () => Promise<void>
  stop: () => void
  reset: () => void
  /** Formaterad speltid, t.ex. "0:12". */
  durationLabel: string
  /** Sekunder kvar till taket, null utan maxDurationSeconds. */
  secondsLeft: number | null
  /** Sant när inspelningen stoppades av taket, inte av användaren. */
  stoppedByLimit: boolean
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function useAudioRecording(options?: UseAudioRecordingOptions): UseAudioRecording {
  const [state, setState] = useState<RecordingState>('idle')
  const [duration, setDuration] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [stoppedByLimit, setStoppedByLimit] = useState(false)

  const maxSeconds = options?.maxDurationSeconds
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Släpper mikrofonen. Måste köras både vid stopp och vid avmontering —
  // annars ligger webbläsarens inspelningsindikator kvar och ser ut som att
  // appen fortsätter lyssna.
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      clearTimer()
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

      // iOS Safari stöder inte webm. Utan den här fallbacken kastar
      // konstruktorn på varje iPhone — och telefonen är hantverkarens
      // huvudsakliga yta.
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: mimeType }))
        releaseStream()
      }

      recorder.start()
      setBlob(null)
      setDuration(0)
      setStoppedByLimit(false)
      setState('recording')
      clearTimer()
      timerRef.current = setInterval(() => {
        setDuration(d => {
          const ny = d + 1
          // Taket verkställs HÄR, i hookens egen timer — komponenten kan ha
          // tappat fokus eller avmonterats, men inspelningen ska ändå stanna.
          if (maxSeconds && ny >= maxSeconds) {
            setStoppedByLimit(true)
            clearTimer()
            if (recorderRef.current?.state === 'recording') {
              try { recorderRef.current.stop() } catch { /* redan stoppad */ }
            }
            setState('stopped')
            return maxSeconds
          }
          return ny
        })
      }, 1000)
    } catch (err: any) {
      releaseStream()
      // NotAllowedError = användaren nekade. Allt annat (ingen mikrofon,
      // osäker kontext) hanteras som "går inte här" — båda måste synas i
      // gränssnittet, aldrig tystas.
      setState(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'unsupported')
    }
  }, [clearTimer, releaseStream])

  const stop = useCallback(() => {
    clearTimer()
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    } else {
      releaseStream()
    }
    setState(prev => (prev === 'recording' ? 'stopped' : prev))
  }, [clearTimer, releaseStream])

  const reset = useCallback(() => {
    clearTimer()
    if (recorderRef.current?.state === 'recording') {
      try { recorderRef.current.stop() } catch { /* redan stoppad */ }
    }
    releaseStream()
    chunksRef.current = []
    setBlob(null)
    setDuration(0)
    setStoppedByLimit(false)
    setState('idle')
  }, [clearTimer, releaseStream])

  return {
    state, duration, blob, start, stop, reset,
    durationLabel: formatDuration(duration),
    secondsLeft: maxSeconds ? Math.max(0, maxSeconds - duration) : null,
    stoppedByLimit,
  }
}
