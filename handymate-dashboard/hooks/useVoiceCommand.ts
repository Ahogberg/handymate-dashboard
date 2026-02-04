'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface UseVoiceCommandOptions {
  language?: string
  continuous?: boolean
  onResult?: (transcript: string) => void
  onError?: (error: string) => void
}

interface UseVoiceCommandReturn {
  isListening: boolean
  transcript: string
  isSupported: boolean
  error: string | null
  startListening: () => void
  stopListening: () => void
  resetTranscript: () => void
}

// Type definitions for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => any) | null
  onend: ((this: SpeechRecognitionInstance, ev: Event) => any) | null
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => any) | null
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => any) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

export function useVoiceCommand(options: UseVoiceCommandOptions = {}): UseVoiceCommandReturn {
  const {
    language = 'sv-SE',
    continuous = false,
    onResult,
    onError
  } = options

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  // Check for browser support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      setIsSupported(!!SpeechRecognition)

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = continuous
        recognition.interimResults = true
        recognition.lang = language

        recognition.onstart = () => {
          setIsListening(true)
          setError(null)
        }

        recognition.onend = () => {
          setIsListening(false)
        }

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = ''
          let interimTranscript = ''

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i]
            if (result.isFinal) {
              finalTranscript += result[0].transcript
            } else {
              interimTranscript += result[0].transcript
            }
          }

          const currentTranscript = finalTranscript || interimTranscript
          setTranscript(currentTranscript)

          if (finalTranscript && onResult) {
            onResult(finalTranscript)
          }
        }

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          let errorMessage = 'Ett fel uppstod'

          switch (event.error) {
            case 'no-speech':
              errorMessage = 'Inget tal upptäcktes'
              break
            case 'audio-capture':
              errorMessage = 'Ingen mikrofon hittades'
              break
            case 'not-allowed':
              errorMessage = 'Mikrofonåtkomst nekades'
              break
            case 'network':
              errorMessage = 'Nätverksfel'
              break
            case 'aborted':
              errorMessage = 'Inspelningen avbröts'
              break
            default:
              errorMessage = `Fel: ${event.error}`
          }

          setError(errorMessage)
          setIsListening(false)

          if (onError) {
            onError(errorMessage)
          }
        }

        recognitionRef.current = recognition
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [language, continuous, onResult, onError])

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript('')
      setError(null)
      try {
        recognitionRef.current.start()
      } catch (e) {
        // Recognition may already be started
        console.error('Recognition start error:', e)
      }
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
  }, [isListening])

  const resetTranscript = useCallback(() => {
    setTranscript('')
  }, [])

  return {
    isListening,
    transcript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript
  }
}
