/** Rasterize the ACTUAL reviewed bytes on the server. A sandboxed iframe/native
 * WebView does not reliably support PDF plugins. HTML containing only page PNGs
 * works without JavaScript, external resources, storage URLs or PDF plugins.
 */
export async function renderReviewedPdf(pdf: Buffer): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false,
    standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
    wasmUrl: `${process.cwd()}/node_modules/pdfjs-dist/wasm/`,
  })
  const document = await task.promise
  try {
    if (document.numPages > 30) throw new Error('Rapporten är för lång för säker granskning.')
    const pages: string[] = []
    const factory = document.canvasFactory as {
      create(width: number, height: number): { canvas: any; context: any }
      destroy(value: { canvas: any; context: any }): void
    }
    let totalBytes = 0
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n)
      const viewport = page.getViewport({ scale: 1.6 })
      const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
      try {
        await page.render({ canvasContext: context, canvas, viewport }).promise
        const png = canvas.toBuffer('image/png') as Buffer
        // Photo-heavy pages otherwise exceed serverless response limits after
        // base64 encoding. Preserve PNG text pages; compress only large pages.
        const mime = png.length <= 200_000 ? 'image/png' : 'image/jpeg'
        const image = mime === 'image/png' ? png : canvas.toBuffer('image/jpeg', 90) as Buffer
        totalBytes += image.length
        if (totalBytes > 3 * 1024 * 1024) throw new Error('Rapportens förhandsvisning är för stor.')
        pages.push(`<figure><figcaption>Sida ${n} av ${document.numPages}</figcaption><img alt="Jobbrapport, sida ${n} av ${document.numPages}" width="${canvas.width}" height="${canvas.height}" src="data:${mime};base64,${image.toString('base64')}"></figure>`)
      } finally { factory.destroy({ canvas, context }); page.cleanup() }
    }
    return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Granskad jobbrapport</title><style>body{margin:0;background:#e2e8f0;font:16px sans-serif}figure{margin:12px 0}figcaption{padding:12px}img{display:block;max-width:100%;height:auto;background:white}</style></head><body>${pages.join('')}</body></html>`
  } finally { await task.destroy() }
}
