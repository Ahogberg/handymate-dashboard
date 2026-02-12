'use client'

import { useState, useRef } from 'react'
import { Camera, Upload, X, RotateCcw, Loader2 } from 'lucide-react'

interface PhotoCaptureProps {
  onCapture: (base64: string) => void
  onBack: () => void
  analyzing?: boolean
}

export default function PhotoCapture({ onCapture, onBack, analyzing }: PhotoCaptureProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      setPreview(result)
    }
    reader.readAsDataURL(file)
  }

  function submitImage() {
    if (!preview) return
    // Extract base64 data from data URL
    const base64 = preview.split(',')[1]
    onCapture(base64)
  }

  if (analyzing) {
    return (
      <div className="text-center py-8">
        {preview && (
          <div className="w-32 h-32 mx-auto mb-4 rounded-xl overflow-hidden">
            <img src={preview} alt="Uploaded" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="space-y-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="text-gray-900 font-medium">Analyserar bild...</p>
          <div className="space-y-2 text-sm text-gray-400">
            <p>Identifierar arbete och material...</p>
            <p>Hämtar din prishistorik...</p>
            <p>Genererar offertförslag...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Ta foto av jobbet</h2>
        <button onClick={onBack} className="p-2 text-gray-500 hover:text-gray-900 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {!preview ? (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
            <Camera className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">Ta bild på det som ska åtgärdas</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 min-h-[48px]"
              >
                <Camera className="w-5 h-5" />
                Ta bild
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200 min-h-[48px]"
              >
                <Upload className="w-5 h-5" />
                Ladda upp
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">
            Tips: Ta bild på det som ska åtgärdas — elcentral, trasigt rör, ytan som ska målas, etc.
          </p>

          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden">
            <img src={preview} alt="Preview" className="w-full max-h-[300px] object-contain bg-gray-100 rounded-xl" />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setPreview(null)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200 min-h-[48px]"
            >
              <RotateCcw className="w-4 h-4" />
              Ta ny bild
            </button>
            <button
              onClick={submitImage}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 min-h-[48px]"
            >
              Analysera bild
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
