export type FilePreviewKind = 'image' | 'pdf' | 'text' | 'audio' | 'video' | 'unsupported'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'])
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'log'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v'])

function extension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

/**
 * Bara passiva filformat får bäddas in på app.handymate.se. HTML, SVG,
 * XML och kontorsformat hålls utanför iframes även om en klient skickat ett
 * missvisande MIME-värde. Det förhindrar lagrad scriptkörning på appens origin.
 */
export function filePreviewKind(fileName: string, mimeType?: string | null): FilePreviewKind {
  const ext = extension(fileName)
  const mime = (mimeType || '').toLowerCase().split(';')[0].trim()

  if (ext === 'pdf' && (mime === 'application/pdf' || !mime || mime === 'application/octet-stream')) return 'pdf'
  if (IMAGE_EXTENSIONS.has(ext) && (mime.startsWith('image/') || !mime || mime === 'application/octet-stream')) return 'image'
  if (TEXT_EXTENSIONS.has(ext) && (mime.startsWith('text/') || !mime || mime === 'application/octet-stream')) return 'text'
  if (AUDIO_EXTENSIONS.has(ext) && (mime.startsWith('audio/') || !mime || mime === 'application/octet-stream')) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext) && (mime.startsWith('video/') || !mime || mime === 'application/octet-stream')) return 'video'

  return 'unsupported'
}

export function safePreviewContentType(
  fileName: string,
  mimeType?: string | null,
): string | null {
  const kind = filePreviewKind(fileName, mimeType)
  const mime = (mimeType || '').toLowerCase().split(';')[0].trim()

  if (kind === 'pdf') return 'application/pdf'
  if (kind === 'text') return 'text/plain; charset=utf-8'
  if (kind === 'image') return mime.startsWith('image/') ? mime : `image/${extension(fileName) === 'jpg' ? 'jpeg' : extension(fileName)}`
  if (kind === 'audio') return mime.startsWith('audio/') ? mime : 'audio/mpeg'
  if (kind === 'video') return mime.startsWith('video/') ? mime : 'video/mp4'
  return null
}

