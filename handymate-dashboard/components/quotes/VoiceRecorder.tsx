'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, Square, X, Loader2, Play, RotateCcw } from 'lucide-react'

interface VoiceRecorderProps {
  onTranscript: (transcript: string) => void
  onBack: () => void
  transcribing?: boolean
}

export default function VoiceRecorder({ onTranscript, onBack, transcribing }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  async function startRecording() {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)
    } catch (err) {
      setError('Kunde inte starta mikrofonen. Kontrollera att du gett behörighet.')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  async function submitRecording() {
    if (!audioBlob) return

    const formData = new FormData()
    formData.append('audio', audioBlob, 'recording.webm')

    try {
      const response = await fetch('/api/quotes/transcribe-voice', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (data.transcript) {
        onTranscript(data.transcript)
      } else {
        setError(data.error || 'Transkribering misslyckades')
      }
    } catch (err) {
      setError('Nätverksfel vid transkribering')
    }
  }

  function resetRecording() {
    setAudioBlob(null)
    setDuration(0)
    setError(null)
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (transcribing) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin mx-auto mb-3" />
        <p className="text-white font-medium">Transkriberar...</p>
        <p className="text-sm text-zinc-500 mt-1">Omvandlar tal till text</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Beskriv jobbet med röst</h2>
        <button onClick={onBack} className="p-2 text-zinc-400 hover:text-white rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="text-center py-6">
        {!audioBlob ? (
          <>
            <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 transition-all ${
              isRecording
                ? 'bg-red-500/20 border-2 border-red-500 animate-pulse'
                : 'bg-zinc-800 border-2 border-zinc-700'
            }`}>
              <Mic className={`w-10 h-10 ${isRecording ? 'text-red-400' : 'text-zinc-400'}`} />
            </div>

            {isRecording && (
              <p className="text-2xl font-mono text-white mb-2">{formatTime(duration)}</p>
            )}

            <div className="flex justify-center">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90 min-h-[48px]"
                >
                  <Mic className="w-5 h-5" />
                  Starta inspelning
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 rounded-xl text-white font-medium hover:bg-red-600 min-h-[48px]"
                >
                  <Square className="w-5 h-5" />
                  Stoppa
                </button>
              )}
            </div>

            <p className="text-xs text-zinc-600 mt-4">
              Beskriv vad som ska göras, ungefärlig omfattning och eventuella speciella förutsättningar.
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mb-3">
              <Play className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-white font-medium mb-1">Inspelning klar</p>
            <p className="text-sm text-zinc-500 mb-4">{formatTime(duration)}</p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={resetRecording}
                className="flex items-center gap-2 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700 min-h-[48px]"
              >
                <RotateCcw className="w-4 h-4" />
                Spela in igen
              </button>
              <button
                onClick={submitRecording}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90 min-h-[48px]"
              >
                Transkribera
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
