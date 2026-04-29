'use client'

import { useRef } from 'react'
import { Loader2, Paperclip, Trash2 } from 'lucide-react'

interface Attachment {
  name: string
  url: string
  size?: number
}

interface QuoteNewAttachmentsCardProps {
  attachments: Attachment[]
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>
  uploadingFile: boolean
  onFileUpload: (file: File) => Promise<void>
}

export function QuoteNewAttachmentsCard({
  attachments,
  setAttachments,
  uploadingFile,
  onFileUpload,
}: QuoteNewAttachmentsCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569]">Bifogade dokument</div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          className="flex items-center gap-1.5 text-[12px] text-[#0F766E] hover:text-primary-800 disabled:opacity-50"
        >
          {uploadingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
          Bifoga fil
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) onFileUpload(file)
            e.target.value = ''
          }}
        />
      </div>
      {attachments.length === 0 ? (
        <p className="text-[12px] text-gray-400">Inga bifogade filer</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((att, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-primary-700 hover:underline truncate"
                >
                  {att.name}
                </a>
                {att.size ? (
                  <span className="text-[10px] text-gray-400 shrink-0">{(att.size / 1024).toFixed(0)} KB</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                className="p-1 text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
