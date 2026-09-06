'use client'
import { useEffect, useRef, useState } from 'react'
/** Dictation only creates editable text. It never asks the agent to execute. */
export function useReportDictation(onText: (text: string) => void, onError: (text: string) => void) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)
  const request = useRef<AbortController | null>(null)
  const starting = useRef(false)
  useEffect(() => { alive.current = true; return () => {
    alive.current = false; request.current?.abort()
    if (timer.current) clearTimeout(timer.current)
    if (recorder.current?.state === 'recording') recorder.current.stop()
    stream.current?.getTracks().forEach(track => track.stop())
  } }, [])
  async function start() {
    if (starting.current || busy || recording) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { onError('Diktering stöds inte här. Skriv rapporten i textrutan.'); return }
    starting.current = true; setBusy(true)
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!alive.current) { media.getTracks().forEach(track => track.stop()); return }
      stream.current = media
      const mimeType = ['audio/webm;codecs=opus','audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const rec = new MediaRecorder(media, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 })
      recorder.current = rec
      const chunks: Blob[] = []
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      rec.onstop = async () => {
        media.getTracks().forEach(track => track.stop())
        if (timer.current) clearTimeout(timer.current)
        if (!alive.current) return
        setRecording(false); setBusy(true)
        try {
          const audio = new Blob(chunks, { type: rec.mimeType })
          if (!audio.size || audio.size > 3 * 1024 * 1024) throw new Error('Inspelningen är tom eller för stor. Försök med en kortare rapport.')
          const form = new FormData(); form.set('audio', audio, rec.mimeType.includes('mp4') ? 'rapport.m4a' : 'rapport.webm')
          request.current = new AbortController()
          const res = await fetch('/api/matte/transcribe', { method: 'POST', body: form, signal: request.current.signal })
          const body = await res.json()
          if (!res.ok || typeof body.text !== 'string' || !body.text.trim()) throw new Error('Kunde inte tolka inspelningen. Skriv rapporten eller försök igen.')
          if (alive.current) onText(body.text.trim())
        } catch (err) { if (alive.current) onError(err instanceof Error ? err.message : 'Dikteringen misslyckades.') }
        finally { if (alive.current) setBusy(false) }
      }
      rec.start(); setRecording(true)
      timer.current = setTimeout(() => { if (rec.state === 'recording') rec.stop() }, 60000)
    } catch { stream.current?.getTracks().forEach(track => track.stop()); if (alive.current) onError('Mikrofonen kunde inte startas. Kontrollera behörigheten eller skriv rapporten.') }
    finally { starting.current = false; if (alive.current) setBusy(false) }
  }
  function stop() { if (recorder.current?.state === 'recording') recorder.current.stop() }
  return { recording, busy, start, stop }
}
