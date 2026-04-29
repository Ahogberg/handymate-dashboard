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
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bifogade dokument</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-600 disabled:opacity-50 transition-colors"
        >
          {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
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
        <p className="text-sm text-slate-400">Inga bifogade filer</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary-700 hover:underline truncate"
                >
                  {att.name}
                </a>
                {att.size ? (
                  <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                    {(att.size / 1024).toFixed(0)} KB
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                aria-label="Ta bort fil"
                className="p-1.5 -m-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
