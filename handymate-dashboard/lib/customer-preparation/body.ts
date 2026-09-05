/** Enforce the total limit while reading; Content-Length is not trusted. */
export async function readPreparationForm(request: Request): Promise<FormData> {
  const limit = 3.5 * 1024 * 1024
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Tomt underlag.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('Bilderna är för stora. Välj högst 3 MB totalt.') }
      chunks.push(next.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData()
}
