'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Download, FileText, Loader2, X } from 'lucide-react'
import { filePreviewKind, type FilePreviewKind } from '@/lib/documents/file-preview'

export interface FilePreviewRequest {
  name: string
  mimeType?: string | null
  inlineUrl: string
  downloadUrl?: string
}

interface FilePreviewContextValue {
  openFilePreview: (file: FilePreviewRequest) => void
  closeFilePreview: () => void
}

const FilePreviewContext = createContext<FilePreviewContextValue | null>(null)

export function useFilePreview(): FilePreviewContextValue {
  const context = useContext(FilePreviewContext)
  if (!context) throw new Error('useFilePreview måste användas inom FilePreviewProvider')
  return context
}

export function FilePreviewProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<FilePreviewRequest | null>(null)
  const closeFilePreview = useCallback(() => setFile(null), [])
  const openFilePreview = useCallback((next: FilePreviewRequest) => setFile(next), [])

  useEffect(() => {
    if (!file) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFilePreview()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [file, closeFilePreview])

  const value = useMemo(() => ({ openFilePreview, closeFilePreview }), [openFilePreview, closeFilePreview])

  return (
    <FilePreviewContext.Provider value={value}>
      {children}
      {file && <FilePreviewModal file={file} onClose={closeFilePreview} />}
    </FilePreviewContext.Provider>
  )
}

function FilePreviewModal({ file, onClose }: { file: FilePreviewRequest; onClose: () => void }) {
  const kind = filePreviewKind(file.name, file.mimeType)
  const downloadUrl = file.downloadUrl
    || (file.inlineUrl.includes('view=inline')
      ? file.inlineUrl.replace('view=inline', 'view=download')
      : `${file.inlineUrl}${file.inlineUrl.includes('?') ? '&' : '?'}view=download`)

  return (
    <div className="fixed inset-0 z-[180] flex flex-col bg-slate-950/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Förhandsgranskning av ${file.name}`}>
      <div className="flex items-center gap-3 bg-white px-3 py-3 sm:px-5 border-b border-slate-200">
        <FileText className="w-5 h-5 text-primary-700 shrink-0" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{file.name}</p>
        <a
          href={downloadUrl}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Ladda ner</span>
        </a>
        <button type="button" onClick={onClose} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Stäng förhandsgranskning">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-2 sm:p-5">
        <PreviewBody kind={kind} file={file} downloadUrl={downloadUrl} />
      </div>
    </div>
  )
}

function PreviewBody({ kind, file, downloadUrl }: { kind: FilePreviewKind; file: FilePreviewRequest; downloadUrl: string }) {
  if (kind === 'image') {
    return <div className="flex h-full items-center justify-center overflow-auto rounded-xl bg-slate-900"><img src={file.inlineUrl} alt={file.name} className="max-h-full max-w-full object-contain" /></div>
  }
  if (kind === 'audio') {
    return <div className="flex h-full items-center justify-center rounded-xl bg-white"><audio src={file.inlineUrl} controls autoPlay={false} className="w-full max-w-xl" /></div>
  }
  if (kind === 'video') {
    return <div className="flex h-full items-center justify-center rounded-xl bg-black"><video src={file.inlineUrl} controls className="max-h-full max-w-full" /></div>
  }
  if (kind === 'pdf' || kind === 'text') {
    return (
      <div className="relative h-full overflow-hidden rounded-xl bg-white">
        <div className="absolute inset-0 flex items-center justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        <iframe src={file.inlineUrl} title={file.name} className="relative h-full w-full border-0 bg-white" />
      </div>
    )
  }
  return (
    <div className="flex h-full items-center justify-center rounded-xl bg-white p-6 text-center">
      <div>
        <FileText className="mx-auto mb-4 h-12 w-12 text-slate-300" />
        <h2 className="text-lg font-semibold text-slate-900">Den här filtypen kan inte visas direkt</h2>
        <p className="mt-2 text-sm text-slate-500">Word-, Excel- och andra programfiler behöver öppnas i sitt vanliga program.</p>
        <a href={downloadUrl} className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary-700 px-5 text-sm font-medium text-white hover:opacity-90">
          <Download className="w-4 h-4" /> Ladda ner filen
        </a>
      </div>
    </div>
  )
}
