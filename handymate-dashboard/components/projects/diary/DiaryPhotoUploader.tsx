'use client'

import { useRef } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { DIARY_PHOTO_MAX_BYTES } from '@/lib/diary/photos'

/**
 * Fotoväljaren i dagboksmodalen.
 *
 * Två sorters bilder visas i samma rutnät: redan uppladdade (signerade
 * URL:er från servern) och väntande filer (lokala object-URL:er) som laddas
 * upp först när raden sparats — en ny rad har inget id att lägga foton på
 * förrän POST svarat. Modalen äger listorna; den här komponenten ritar och
 * rapporterar bara.
 */
export interface PendingPhoto {
  file: File
  previewUrl: string
}

export default function DiaryPhotoUploader({
  existing,
  pending,
  uploading,
  disabled,
  onAddFiles,
  onRemovePending,
  onRemoveExisting,
  onTooLarge,
}: {
  existing: Array<{ path: string; url: string | null }>
  pending: PendingPhoto[]
  uploading: boolean
  disabled?: boolean
  onAddFiles: (files: File[]) => void
  onRemovePending: (index: number) => void
  onRemoveExisting: (path: string) => void
  onTooLarge: (name: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (list: FileList | null) => {
    if (!list) return
    const ok: File[] = []
    for (const f of Array.from(list)) {
      if (f.size > DIARY_PHOTO_MAX_BYTES) { onTooLarge(f.name); continue }
      ok.push(f)
    }
    if (ok.length) onAddFiles(ok)
    if (inputRef.current) inputRef.current.value = ''
  }

  const thumbCls = 'relative w-20 h-20 rounded-lg overflow-hidden border border-[#E2E8F0] bg-gray-50 flex-shrink-0'

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {existing.map(p => (
          <div key={p.path} className={thumbCls}>
            {p.url ? (
              <img src={p.url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">Saknas</div>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemoveExisting(p.path)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 text-gray-700 flex items-center justify-center shadow"
                aria-label="Ta bort foto"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {pending.map((p, i) => (
          <div key={p.previewUrl} className={thumbCls}>
            <img src={p.previewUrl} alt="" className="w-full h-full object-cover opacity-90" />
            {uploading ? (
              <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-primary-700" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onRemovePending(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 text-gray-700 flex items-center justify-center shadow"
                aria-label="Ta bort foto"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-[#E2E8F0] text-gray-400 hover:border-primary-400 hover:text-primary-700 flex flex-col items-center justify-center gap-1 text-[11px] transition-colors"
          >
            <Camera className="w-5 h-5" />
            Foto
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        // Inget `capture`: på telefon ska man kunna välja kamera ELLER
        // galleri — capture tvingar kameran och stänger galleriet.
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
      <p className="text-[11px] text-gray-400 mt-1.5">Bilder upp till 10 MB. Foton lagras privat på projektet.</p>
    </div>
  )
}
