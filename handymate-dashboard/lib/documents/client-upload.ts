export interface DocumentUploadFailure {
  file: File
  message: string
}

export interface DocumentUploadResult {
  uploaded: number
  failures: DocumentUploadFailure[]
}

/** Gemensam klientväg för create-modalerna. Inga fel får sväljas. */
export async function uploadDocumentFiles(
  url: string,
  files: File[],
  options: { category?: string; maxBytes?: number } = {},
): Promise<DocumentUploadResult> {
  const failures: DocumentUploadFailure[] = []
  let uploaded = 0

  for (const file of files) {
    if (file.size === 0) {
      failures.push({ file, message: `${file.name} är tom` })
      continue
    }
    if (options.maxBytes && file.size > options.maxBytes) {
      failures.push({ file, message: `${file.name} är för stor` })
      continue
    }

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', options.category || 'other')
      const response = await fetch(url, { method: 'POST', body: formData })
      if (!response.ok) {
        const body = await response.json().catch(() => ({} as { error?: string }))
        failures.push({ file, message: body.error || `Uppladdningen svarade ${response.status}` })
        continue
      }
      uploaded++
    } catch (error) {
      failures.push({ file, message: error instanceof Error ? error.message : 'Nätverksfel' })
    }
  }

  return { uploaded, failures }
}

