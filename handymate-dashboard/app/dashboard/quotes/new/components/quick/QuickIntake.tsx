'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, Loader2, Mic, Square, X } from 'lucide-react'
import { useAudioRecording } from '@/hooks/useAudioRecording'
/** Bara det intaget faktiskt behöver. Strukturell typ i stället för en import
    av sidans Customer: det finns tre olika Customer-typer i kodbasen, och den
    här komponenten ska inte behöva veta vilken anroparen råkar använda. */
interface IntakeCustomer {
  customer_id: string
  name: string
}

/**
 * Snabboffertens intag (etapp C1, 2026-08-06).
 *
 * ═══ VARFÖR DET SER UT SOM ETT SMS ═══
 *
 * Pilotkunden Christoffer om den vanliga offertskaparen: "för mycket, rörigt,
 * man får inte med allt — blir galen." Kartläggningen visade ~33 interaktiva
 * kontroller på en TOM offert. Den här skärmen har tre: berätta, foto, kund.
 *
 * Kunden är MEDVETET frivillig. Hantverkaren står ofta hemma hos någon som
 * ännu inte finns som kund i systemet, och att kräva ett kundval innan man
 * ens fått beskriva jobbet är precis den sortens grind som gör att man
 * skjuter upp offerten till kvällen — och sedan inte skriver den alls.
 *
 * ═══ RÖSTEN ═══
 *
 * Transkriptet landar REDIGERBART i textrutan, aldrig som en svart låda.
 * Whisper hör fel på fackord ibland, och hantverkaren måste kunna rätta det
 * innan AI:n bygger vidare på det. Att skicka ett orättat transkript direkt
 * till genereringen hade gjort felet dyrare att upptäcka.
 */

interface QuickIntakeProps {
  customers: IntakeCustomer[]
  selectedCustomer: string
  onSelectCustomer: (id: string) => void
  /** Fritexten hantverkaren skrivit eller talat in. */
  value: string
  onChange: (v: string) => void
  photos: string[]
  onPhotoFile: (file: File) => void
  onRemovePhoto: (index: number) => void
  maxPhotos: number
  onBuild: () => void
  onClose: () => void
  /** "Öppna fullständiga editorn" — samma offert, andra verktyget. */
  onOpenFullEditor: () => void
  building: boolean
}

export function QuickIntake({
  customers,
  selectedCustomer,
  onSelectCustomer,
  value,
  onChange,
  photos,
  onPhotoFile,
  onRemovePhoto,
  maxPhotos,
  onBuild,
  onClose,
  onOpenFullEditor,
  building,
}: QuickIntakeProps) {
  const recording = useAudioRecording()
  const [transcribing, setTranscribing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // När inspelningen är klar: transkribera och lägg texten i rutan.
  // Blob-referensen är vakten mot dubbeltranskribering — utan den skulle en
  // omrendering kunna skicka samma ljud två gånger och bränna krediter.
  const handledBlobRef = useRef<Blob | null>(null)
  useEffect(() => {
    const blob = recording.blob
    if (!blob || handledBlobRef.current === blob) return
    handledBlobRef.current = blob

    let cancelled = false
    const run = async () => {
      setTranscribing(true)
      setVoiceError(null)
      try {
        const form = new FormData()
        form.append('audio', blob, 'inspelning.webm')
        const res = await fetch('/api/matte/transcribe', { method: 'POST', body: form })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.text) {
          setVoiceError(data.error || 'Kunde inte tolka inspelningen — skriv gärna i stället.')
          return
        }
        // Läggs TILL befintlig text i stället för att ersätta den: den som
        // först skrev några ord och sedan pratar in resten ska inte förlora
        // det han skrev.
        onChange(value.trim() ? `${value.trim()}\n${data.text}` : data.text)
        requestAnimationFrame(() => textareaRef.current?.focus())
      } catch {
        if (!cancelled) setVoiceError('Kunde inte tolka inspelningen — skriv gärna i stället.')
      } finally {
        if (!cancelled) {
          setTranscribing(false)
          recording.reset()
        }
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.blob])

  const isRecording = recording.state === 'recording'
  const canBuild = value.trim().length > 0 && !building && !transcribing

  const voiceUnavailable = recording.state === 'denied' || recording.state === 'unsupported'

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      <div className="max-w-xl mx-auto min-h-screen flex flex-col px-4 py-6 sm:py-10">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6 -ml-1 px-2 py-2 self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          Tillbaka
        </button>

        <div className="mb-6">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Berätta om jobbet
          </h1>
          <p className="text-slate-500 mt-2">
            Skriv eller prata in — så bygger vi offerten åt dig. Du granskar allt innan något skickas.
          </p>
        </div>

        {/* Beskrivningen */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={6}
            placeholder={'T.ex. "Byta 12 fönster i villa, två plan. Kunden vill ha treglas och att vi tar hand om de gamla."'}
            className="w-full px-4 py-3.5 pr-16 border-2 border-slate-200 rounded-2xl text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:border-primary-700 focus:ring-4 focus:ring-primary-100 transition-colors resize-none leading-relaxed"
          />
          <button
            type="button"
            onClick={() => (isRecording ? recording.stop() : recording.start())}
            disabled={transcribing || voiceUnavailable}
            title={isRecording ? 'Stoppa inspelningen' : 'Prata in beskrivningen'}
            className={`absolute right-3 bottom-3 w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${
              isRecording
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-primary-50 hover:bg-primary-100 text-primary-700'
            }`}
          >
            {transcribing
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : isRecording
                ? <Square className="w-4 h-4" fill="currentColor" />
                : <Mic className="w-5 h-5" />}
          </button>
        </div>

        {/* Rösttillståndet — alltid uttalat, aldrig tyst */}
        <div className="mt-2 min-h-[20px]">
          {isRecording && (
            <p className="text-sm text-red-600 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              Lyssnar… {recording.durationLabel}
            </p>
          )}
          {transcribing && <p className="text-sm text-slate-500">Skriver ner…</p>}
          {voiceError && <p className="text-sm text-amber-700">{voiceError}</p>}
          {recording.state === 'denied' && (
            <p className="text-sm text-slate-500">
              Mikrofonen är blockerad i webbläsaren. Skriv i rutan i stället.
            </p>
          )}
          {recording.state === 'unsupported' && (
            <p className="text-sm text-slate-500">Inspelning fungerar inte här — skriv i rutan i stället.</p>
          )}
        </div>

        {/* Foton */}
        <div className="mt-5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) onPhotoFile(file)
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((photo, i) => (
              <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200">
                <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-slate-900/70 text-white flex items-center justify-center"
                  title="Ta bort foto"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {photos.length < maxPhotos && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-11 px-4 inline-flex items-center gap-2 border-2 border-dashed border-slate-200 hover:border-primary-700 rounded-xl text-sm font-medium text-slate-600 hover:text-primary-700 transition-colors"
              >
                <Camera className="w-4 h-4" />
                Lägg till foto
              </button>
            )}
          </div>
        </div>

        {/* Kund — frivillig med flit */}
        <div className="mt-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Kund
          </label>
          <select
            value={selectedCustomer}
            onChange={e => onSelectCustomer(e.target.value)}
            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-slate-900 bg-white focus:outline-none focus:border-primary-700 focus:ring-4 focus:ring-primary-100 transition-colors"
          >
            <option value="">Välj kund…</option>
            {customers.map(c => (
              <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1.5">Du kan välja kund senare — börja med jobbet.</p>
        </div>

        <div className="mt-auto pt-8">
          <button
            type="button"
            onClick={onBuild}
            disabled={!canBuild}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-4 bg-primary-700 hover:bg-primary-600 text-white text-base font-semibold rounded-2xl transition-colors disabled:opacity-40 shadow-sm"
          >
            {building && <Loader2 className="w-5 h-5 animate-spin" />}
            {building ? 'Bygger…' : 'Bygg utkast'}
          </button>
          <button
            type="button"
            onClick={onOpenFullEditor}
            className="w-full mt-3 py-3 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            Öppna fullständiga editorn i stället
          </button>
        </div>
      </div>
    </div>
  )
}
