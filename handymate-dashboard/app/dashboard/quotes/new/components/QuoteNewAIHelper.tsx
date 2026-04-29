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
 * Användaren kan välja antingen att fota jobbet eller skriva en beskrivning,
 * och AI:n genererar offertrader.
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
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#0F766E]" />
          <span className="text-[13px] font-medium text-[#1E293B]">AI-hjälp</span>
          <span className="text-[11px] text-[#94A3B8]">Fota eller beskriv jobbet</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Photo capture */}
          <div>
            <p className="text-[12px] text-[#64748B] mb-2">Fota jobbet — AI analyserar och fyller i rader</p>
            <div className="flex items-center gap-2">
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
                className="flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] hover:border-[#0F766E] transition-colors disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                Kamera
              </button>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] hover:border-[#0F766E] transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Ladda upp
              </button>
            </div>

            {photos.length > 0 && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  {photos.map((photo, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border-thin border-[#E2E8F0]">
                      <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => onRemovePhoto(i)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {photos.length < maxPhotos && (
                    <label className="aspect-square border-thin border-dashed border-[#CBD5E1] rounded-lg flex items-center justify-center cursor-pointer hover:border-[#0F766E] transition-colors text-[#CBD5E1] hover:text-[#0F766E] text-xl">
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
                  className="w-full px-3 py-2 text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:border-[#0F766E] resize-y"
                />
                <button
                  type="button"
                  onClick={onAnalyzePhoto}
                  disabled={generating}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#0F766E] text-white rounded-lg text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'Analyserar...' : `Analysera ${photos.length} foto${photos.length > 1 ? 'n' : ''}`}
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#E2E8F0]" />
            <span className="text-[11px] text-[#CBD5E1]">eller</span>
            <div className="flex-1 h-px bg-[#E2E8F0]" />
          </div>

          {/* Text description */}
          <div>
            <p className="text-[12px] text-[#64748B] mb-1">Beskriv jobbet — AI genererar offertrader</p>
            <div className="bg-primary-50 border border-[#E2E8F0] rounded-lg px-3 py-2 mb-2">
              <p className="text-[11px] text-primary-700 font-medium mb-1">Tips för bästa resultat:</p>
              <ul className="text-[11px] text-primary-700 space-y-0.5 list-disc list-inside">
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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600 resize-y"
            />
            <button
              type="button"
              onClick={onGenerateFromText}
              disabled={generating || !aiTextInput.trim()}
              className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-[#0F766E] text-white rounded-lg text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'Genererar...' : 'Generera offertförslag'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
