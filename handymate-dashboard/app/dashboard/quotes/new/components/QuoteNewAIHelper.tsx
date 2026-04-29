'use client'

import { useRef } from 'react'
import { Camera, ChevronDown, Loader2, Sparkles, Upload, X } from 'lucide-react'

interface QuoteNewAIHelperProps {
  open: boolean
  setOpen: (b: boolean) => void
  generating: boolean
  photos: string[]
  maxPhotos: number
  onPhotoFile: (file: File) => void
  onRemovePhoto: (index: number) => void
  photoDescription: string
  setPhotoDescription: (s: string) => void
  onAnalyzePhoto: () => void
  aiTextInput: string
  setAiTextInput: (s: string) => void
  onGenerateFromText: () => void
}

/**
 * AI-helper sektion: foto-uppladdning (kamera + galleri) + textbeskrivning.
 * Ligger högst upp i vänsterspalten — det är den primära genvägen för att
 * skapa en offert snabbt.
 */
export function QuoteNewAIHelper({
  open,
  setOpen,
  generating,
  photos,
  maxPhotos,
  onPhotoFile,
  onRemovePhoto,
  photoDescription,
  setPhotoDescription,
  onAnalyzePhoto,
  aiTextInput,
  setAiTextInput,
  onGenerateFromText,
}: QuoteNewAIHelperProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 sm:px-6 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">AI-hjälp</h2>
          <p className="text-xs text-slate-500 mt-0.5">Fota eller beskriv jobbet</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 sm:px-6 pb-6 border-t border-slate-100 pt-5 space-y-5">
          {/* Photo capture */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Fota jobbet
            </p>
            <p className="text-sm text-slate-500 mb-3">AI analyserar och fyller i rader</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) onPhotoFile(file)
                }}
              />
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) onPhotoFile(file)
                }}
              />
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={generating}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl text-sm font-medium text-slate-700 transition-colors disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                Kamera
              </button>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={generating}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl text-sm font-medium text-slate-700 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Ladda upp
              </button>
            </div>

            {photos.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  {photos.map((photo, i) => (
                    <div
                      key={i}
                      className="relative aspect-square rounded-xl overflow-hidden border border-slate-200"
                    >
                      <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => onRemovePhoto(i)}
                        aria-label="Ta bort foto"
                        className="absolute top-1 right-1 w-5 h-5 bg-slate-900/60 rounded-full inline-flex items-center justify-center hover:bg-slate-900/80 transition-colors"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {photos.length < maxPhotos && (
                    <label className="aspect-square border border-dashed border-slate-300 rounded-xl inline-flex items-center justify-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors text-slate-400 hover:text-primary-700 text-2xl font-light">
                      +
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) onPhotoFile(f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
                <textarea
                  value={photoDescription}
                  onChange={e => setPhotoDescription(e.target.value)}
                  placeholder="Beskriv jobbet (valfritt) — t.ex. mått, materialönskemål, speciella förutsättningar"
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors resize-y leading-relaxed"
                />
                <button
                  type="button"
                  onClick={onAnalyzePhoto}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'Analyserar…' : `Analysera ${photos.length} foto${photos.length > 1 ? 'n' : ''}`}
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">eller</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Text description */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Beskriv jobbet
            </p>
            <p className="text-sm text-slate-500 mb-3">AI genererar offertrader</p>
            <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 mb-3">
              <p className="text-xs font-semibold text-primary-700 mb-1.5">Tips för bästa resultat:</p>
              <ul className="text-xs text-primary-700 space-y-0.5 list-disc list-inside marker:text-primary-400">
                <li>Ange rum/plats (kök, badrum, fasad)</li>
                <li>Beskriv yta eller antal (15 m², 3 uttag)</li>
                <li>Nämn material om du vet (klinker, gips, LED)</li>
                <li>Beskriv vad som ska göras (byta, installera, renovera)</li>
              </ul>
            </div>
            <textarea
              value={aiTextInput}
              onChange={e => setAiTextInput(e.target.value)}
              placeholder="T.ex. 'Byta 3 eluttag i kök, dra ny kabel från elcentral, installera dimmer i vardagsrum'"
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors resize-y leading-relaxed"
            />
            <button
              type="button"
              onClick={onGenerateFromText}
              disabled={generating || !aiTextInput.trim()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'Genererar…' : 'Generera offertförslag'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
