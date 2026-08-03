'use client'

/**
 * Klientsidan bildkomprimering (B1, kodrevision 2026-08-03 — trolig
 * prod-krasch): `handlePhotoFile` i quotes/new/page.tsx gjorde tidigare
 * `readAsDataURL` direkt på originalfilen och postade base64 i JSON-bodyn
 * till /api/quotes/ai-generate. En mobilkamerabild på 3-8 MB blir 4-11 MB
 * som base64 — spränger både Vercels ~4,5 MB request-gräns och Anthropics
 * 5 MB/bild-gräns. Exakt mobilscenariot ("fota jobbet") kraschade alltså i
 * produktion.
 *
 * Denna helper körs ENDAST i browsern (canvas/Image/createImageBitmap
 * finns inte i Node) — kan därför inte enhetstestas utan en riktig browser-
 * miljö. Dokumenterat undantag, se F2-uppdraget.
 *
 * EXIF-orientation: `canvas.drawImage` respekterar INTE EXIF-orientation-
 * taggen i alla browsers (mobilkameror skriver nästan alltid en rotations-
 * tagg i stället för att rotera pixeldatan). `createImageBitmap(file,
 * { imageOrientation: 'from-image' })` löser detta i alla moderna browsers
 * genom att applicera rotationen vid avkodning. Fallback till vanlig
 * `Image`-inläsning (utan EXIF-hantering) för äldre browsers/format där
 * createImageBitmap saknas eller kastar.
 */
export async function compressImageFile(
  file: File,
  maxDim: number = 1568,
  quality: number = 0.8,
): Promise<string> {
  const { width, height, source } = await loadImageSource(file)

  // Skala aldrig UPP — bilder mindre än maxDim lämnas i sin ursprungsstorlek
  // (fortfarande omkomprimerade till JPEG q~0.8, vilket normalt krymper dem).
  const scale = Math.min(1, maxDim / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Kunde inte skapa canvas-kontext för bildkomprimering')
  }
  ctx.drawImage(source as CanvasImageSource, 0, 0, targetWidth, targetHeight)

  if (typeof (source as ImageBitmap).close === 'function') {
    ;(source as ImageBitmap).close()
  }

  return canvas.toDataURL('image/jpeg', quality)
}

async function loadImageSource(
  file: File,
): Promise<{ width: number; height: number; source: ImageBitmap | HTMLImageElement }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { width: bitmap.width, height: bitmap.height, source: bitmap }
    } catch {
      // Faller igenom till Image-fallback nedan — t.ex. browser som inte
      // stödjer imageOrientation-optionen, eller ett filformat
      // createImageBitmap inte kan avkoda.
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: img.naturalWidth, height: img.naturalHeight, source: img })
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Kunde inte läsa in bilden'))
    }
    img.src = objectUrl
  })
}
