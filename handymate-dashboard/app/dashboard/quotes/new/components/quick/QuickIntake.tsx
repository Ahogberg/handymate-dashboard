'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Camera, FileText, Loader2, Mic, Square, X } from 'lucide-react'
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
 *
 * ═══ VÄGVALET ÄR FÖRSTKLASSIGT (designpasset 2026-08-10, Andreas fynd) ═══
 *
 * "Öppna editorn direkt" låg som en grå fotnot under en jättelik inaktiverad
 * knapp — en vägtull med gömd nödutgång för den som kan editorn. Nu ligger
 * den i headerhöjd och mallvalet är en riktig sekundärknapp bredvid Bygg
 * utkast. Standarden förblir beskriv-vägen (den byggdes åt piloten som blev
 * galen på editorns ~33 kontroller); rymningarna är synliga, och D2-vanan
 * ("vill du alltid börja så här?") minns valet efter tredje gången.
 */

/** Exempelchips mot tomma-sidan-paralysen. Klick FYLLER rutan — texten är
    redigerbar som allt annat, aldrig en svart låda. Döljs så fort något
    står i rutan. */
const EXEMPEL = [
  'Byta 12 fönster i villa, två plan',
  'Helrenovera badrum, ca 6 m²',
  'Nya eluttag och jordfelsbrytare i garage',
]

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
  /**
   * "Använd en mall i stället". Sedan startväljaren togs bort (2026-08-06) är
   * mallvalet en av två utgångar härifrån, inte ett eget startval.
   */
  onUseTemplate: () => void
  /**
   * true när offerten redan har rader. Mallänken DÖLJS då: handleTemplateSelect
   * skriver över titel, beskrivning och rader, så en mall vald efter att AI
   * byggt ett utkast hade raderat arbetet utan förvarning. Att dölja länken
   * gör krocken omöjlig i stället för att varna om den — ett beslut mindre i
   * ett flöde vi försöker tömma på beslut.
   */
  hasContent: boolean
  /**
   * En tredje väg in i samma guidade, sektion-för-sektion-upplevelse — bara
   * utan AI-beskrivningen. Andreas fynd (2026-08-14): steg-för-steg ska vara
   * standard oavsett starttyp, inte bara AI-vägen. Leder till en egen liten
   * skärm (kund + titel) i stället för direkt till 'blank', så granskningen
   * alltid har en titel att visa.
   */
  onSkipDescription: () => void
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
  onUseTemplate,
  hasContent,
  onSkipDescription,
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
    <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto">
      <div className="max-w-xl mx-auto min-h-screen flex flex-col px-4 py-5 sm:py-8">
        {/* Headerraden: vägen ut åt BÅDA hållen är synlig från början —
            "Tillbaka" lämnar offerten, editorlänken byter verktyg. Ingen av
            dem ska behöva letas fram under en inaktiverad knapp. */}
        <div className="flex items-center justify-between mb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 -ml-1 px-2 py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Tillbaka
          </button>
          <button
            type="button"
            onClick={onOpenFullEditor}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-700 px-2 py-2 transition-colors"
          >
            Öppna editorn direkt
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-5">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Berätta om jobbet
          </h1>
          <p className="text-slate-500 mt-2">
            Skriv eller prata in — så bygger vi offerten åt dig. Du granskar allt innan något skickas.
          </p>
        </div>

        {/* Arbetsytan — ett kort, tre kontroller. */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={6}
            placeholder="Vad ska göras, var, och vad kunden önskat sig …"
            className="w-full px-4 py-3.5 pr-16 border-2 border-slate-200 rounded-2xl text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:border-primary-700 focus:ring-4 focus:ring-primary-100 transition-colors resize-none leading-relaxed"
          />
          <button
            type="button"
            onClick={() => (isRecording ? recording.stop() : recording.start())}
            disabled={transcribing || voiceUnavailable}
            title={isRecording ? 'Stoppa inspelningen' : 'Prata in beskrivningen'}
            // Ytans mest laddade kontroll: den byter BETYDELSE, inte bara
            // färg. transition-all plus en mjuk röd ring säger "live" med ljus
            // i stället för med ett hårt byte. Ikonerna bär anim-fade eftersom
            // varje skepnad är ett nytt element — ingen state behövs.
            className={`absolute right-3 bottom-3 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-base ease-standard disabled:opacity-40 ${
              isRecording
                ? 'bg-red-600 hover:bg-red-500 text-white ring-4 ring-red-100'
                : 'bg-primary-50 hover:bg-primary-100 text-primary-700'
            }`}
          >
            {transcribing
              ? <Loader2 className="w-5 h-5 animate-spin anim-fade" />
              : isRecording
                ? <Square className="w-4 h-4 anim-fade" fill="currentColor" />
                : <Mic className="w-5 h-5 anim-fade" />}
          </button>
        </div>

        {/* Exempelchips — mot tomma-sidan-paralysen. Bara när rutan är tom:
            så fort något står där är de brus och försvinner. */}
        {!value.trim() && !isRecording && !transcribing && (
          <div className="flex flex-wrap gap-1.5 mt-2.5 anim-fade">
            <span className="text-xs text-slate-400 self-center mr-0.5">T.ex.</span>
            {EXEMPEL.map(exempel => (
              <button
                key={exempel}
                type="button"
                onClick={() => {
                  onChange(exempel)
                  requestAnimationFrame(() => textareaRef.current?.focus())
                }}
                className="inline-flex items-center min-h-[32px] px-3 rounded-full border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 hover:border-primary-200 hover:text-primary-700 hover:bg-primary-50 transition-colors"
              >
                {exempel}
              </button>
            ))}
          </div>
        )}

        {/* Rösttillståndet — alltid uttalat, aldrig tyst.
            Höjden är reserverad (min-h), så tillstånden kan tona in och ut
            utan att knuffa resten av skärmen. */}
        <div className="mt-2 min-h-[20px]">
          {isRecording && (
            <p className="text-sm text-red-600 font-medium flex items-center gap-2 anim-fade">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              Lyssnar… {recording.durationLabel}
            </p>
          )}
          {transcribing && <p className="text-sm text-slate-500 anim-fade">Skriver ner…</p>}
          {voiceError && <p className="text-sm text-amber-700 anim-fade">{voiceError}</p>}
          {recording.state === 'denied' && (
            <p className="text-sm text-slate-500 anim-fade">
              Mikrofonen är blockerad i webbläsaren. Skriv i rutan i stället.
            </p>
          )}
          {recording.state === 'unsupported' && (
            <p className="text-sm text-slate-500 anim-fade">Inspelning fungerar inte här — skriv i rutan i stället.</p>
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
              <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 anim-pop">
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
        <div className="mt-5">
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
        </div>

        <div className="mt-auto pt-6">
          {/* Två riktiga knappar, inte en hjälte och två fotnoter. Bygg
              utkast är primär; mallen är en synlig sekundär (döljs när
              offerten har innehåll — se hasContent). Editorlänken bor i
              headern. */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={onBuild}
              disabled={!canBuild}
              // Släppet av opacity-40 ska glida när knappen blir tillgänglig,
              // inte slå om — det är ögonblicket beskrivningen räcker till.
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-4 bg-primary-700 hover:bg-primary-600 text-white text-base font-semibold rounded-2xl transition-[background-color,opacity] duration-base ease-standard disabled:opacity-40 shadow-sm"
            >
              {building && <Loader2 className="w-5 h-5 animate-spin" />}
              {building ? 'Bygger…' : 'Bygg utkast'}
            </button>
            {!hasContent && (
              <button
                type="button"
                onClick={onUseTemplate}
                className="sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-4 bg-white border-2 border-slate-200 hover:border-primary-700 rounded-2xl text-base font-semibold text-slate-700 hover:text-primary-700 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Använd en mall
              </button>
            )}
          </div>
          {/* Den inaktiverade knappen förklarar sig — höjden är reserverad
              så förklaringen inte knuffar knapparna när den försvinner. */}
          <p className="text-center text-xs text-slate-400 mt-2.5 min-h-[16px] m-0">
            {!canBuild && !building && !transcribing ? 'Beskriv jobbet först — sedan bygger vi utkastet åt dig.' : ''}
          </p>
          {!hasContent && (
            <p className="text-center mt-1 m-0">
              <button
                type="button"
                onClick={onSkipDescription}
                className="text-xs text-slate-400 hover:text-primary-700 underline underline-offset-2 transition-colors"
              >
                Hoppa över beskrivningen — jag fyller i själv
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
