import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDiaryContext } from '@/lib/diary/route-context'
import { DIARY_SELECT } from '@/lib/diary/serialize'
import { DIARY_BUCKET, isDiaryPhotoPath } from '@/lib/diary/photos'
import { isDiaryRowLocked, lockReason } from '@/lib/diary/locking'
import { WEATHER_LABELS, isDiaryWeather } from '@/lib/diary/weather'
import { sumTimeEntryHoursByDate } from '@/lib/diary/time-summary'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const ACCENT_RGB = [15, 118, 110] as const
const TEXT_PRIMARY = [30, 41, 59] as const
const TEXT_SECONDARY = [148, 163, 184] as const
const TEXT_MUTED = [100, 116, 139] as const
const AMBER_RGB = [180, 83, 9] as const

const PAGE_BOTTOM = 275
const PHOTO_SIZE = 40
const PHOTO_GAP = 4
const PHOTOS_PER_ROW = 4
const PHOTOS_PER_ENTRY = 8

type PdfLog = {
  id: string
  date: string
  weather: string | null
  temperature: number | null
  description: string | null
  work_performed: string | null
  issues: string | null
  workers_count: number | null
  hours_worked: number | null
  materials_used: string | null
  photos: unknown
  ata_change_id: string | null
  attested_by_user_id: string | null
  attested_at: string | null
  locked_at: string | null
  addendum: string | null
  business_user: { id: string; name: string | null } | null
}

function formatDatum(date: string): string {
  const s = new Date(date + 'T00:00:00').toLocaleDateString('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatTidpunkt(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

/** Laddar ett dagboksfoto ur lagringen som data-URL för jsPDF. Misslyckas
 * tyst (null) — ett saknat foto ska inte fälla hela exporten. */
async function laddaFoto(
  storage: SupabaseClient['storage'],
  path: string,
): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  try {
    const { data, error } = await storage.from(DIARY_BUCKET).download(path)
    if (error || !data) return null
    const buf = Buffer.from(await data.arrayBuffer())
    if (buf.length === 0) return null
    const isPng = /\.png$/i.test(path)
    const mime = isPng ? 'image/png' : 'image/jpeg'
    return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, format: isPng ? 'PNG' : 'JPEG' }
  } catch {
    return null
  }
}

/**
 * GET /api/projects/[id]/logs/pdf — exportera byggdagboken som PDF
 * (Etapp E2, 2026-09-02).
 *
 * Query: from, to (YYYY-MM-DD) — samma urval som dagboksfliken visar.
 * Varje rad tar med väder, timmar (egen uppskattning + registrerad tid),
 * foton, ÄTA-koppling, attest (teal) och låsning ("LÅST"), samt
 * tilläggsanteckningar i kursiv. Sidbrytning mäts FÖRE ritning så ett block
 * aldrig hamnar utanför sidan.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await loadDiaryContext(request, params.id)
  if (!ctx.ok) return ctx.response
  // Läsning följer GET /logs: alla i företaget som når projektet får exportera.
  const { supabase, businessId, projectId } = ctx

  try {
    const sp = request.nextUrl.searchParams
    const from = sp.get('from')
    const to = sp.get('to')
    const fromOk = !!from && /^\d{4}-\d{2}-\d{2}$/.test(from)
    const toOk = !!to && /^\d{4}-\d{2}-\d{2}$/.test(to)

    const [{ data: business }, { data: project }] = await Promise.all([
      supabase
        .from('business_config')
        .select('business_name, public_phone, phone_number, contact_email')
        .eq('business_id', businessId)
        .maybeSingle(),
      supabase
        .from('project')
        .select('name, start_date, end_date, customer:customer_id (name)')
        .eq('project_id', projectId)
        .eq('business_id', businessId)
        .maybeSingle(),
    ])
    if (!project) {
      return NextResponse.json({ error: 'Projektet finns inte' }, { status: 404 })
    }

    let query = supabase
      .from('project_log')
      .select(DIARY_SELECT)
      .eq('order_id', projectId)
      .eq('business_id', businessId)
    if (fromOk) query = query.gte('date', from as string)
    if (toOk) query = query.lte('date', to as string)
    const { data: rawLogs, error } = await query.order('date', { ascending: true }).order('created_at', { ascending: true })
    if (error) throw error
    const logs = (rawLogs ?? []) as unknown as PdfLog[]

    // Berikning: ÄTA-nummer, attestanter, registrerad tid — en fråga per sak.
    const ataIds = Array.from(new Set(logs.map(l => l.ata_change_id).filter((v): v is string => !!v)))
    const attesterIds = Array.from(new Set(logs.map(l => l.attested_by_user_id).filter((v): v is string => !!v)))
    const [ataRes, attesterRes, timeHours] = await Promise.all([
      ataIds.length
        ? supabase.from('project_change').select('change_id, ata_number, description').eq('business_id', businessId).eq('project_id', projectId).in('change_id', ataIds)
        : Promise.resolve({ data: [] as Array<{ change_id: string; ata_number: number | null; description: string | null }> }),
      attesterIds.length
        ? supabase.from('business_users').select('id, name').in('id', attesterIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
      sumTimeEntryHoursByDate(supabase, businessId, projectId, logs.map(l => l.date)),
    ])
    const ataById = new Map((ataRes.data ?? []).map(a => [a.change_id, a as { change_id: string; ata_number: number | null; description: string | null }]))
    const attesterById = new Map((attesterRes.data ?? []).map(u => [u.id, u as { id: string; name: string | null }]))

    const businessName = business?.business_name || 'Företag'
    const customer = (project as { customer?: { name?: string | null } | { name?: string | null }[] | null }).customer
    const customerName = Array.isArray(customer) ? customer[0]?.name : customer?.name

    // ── PDF ──
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - margin * 2
    let y = margin

    /** Mäts FÖRE ritning: får blocket inte plats bryts sidan först. */
    const ensureSpace = (h: number) => {
      if (y + h > PAGE_BOTTOM) {
        doc.addPage()
        y = margin
      }
    }
    const textBlock = (text: string, size: number, color: readonly [number, number, number], style: 'normal' | 'italic' | 'bold' = 'normal', lineH = 4) => {
      doc.setFont('helvetica', style)
      doc.setFontSize(size)
      doc.setTextColor(...color)
      const lines: string[] = doc.splitTextToSize(text, contentWidth)
      // Långa block bryts radvis så inget hamnar utanför sidan.
      let i = 0
      while (i < lines.length) {
        ensureSpace(lineH)
        const perPage = Math.max(1, Math.floor((PAGE_BOTTOM - y) / lineH))
        const chunk = lines.slice(i, i + perPage)
        doc.text(chunk, margin, y)
        y += chunk.length * lineH
        i += chunk.length
      }
      doc.setFont('helvetica', 'normal')
    }

    // Sidhuvud
    doc.setFontSize(16)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(businessName, margin, y + 6)
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_SECONDARY)
    const contactLine = [business?.public_phone || business?.phone_number, business?.contact_email].filter(Boolean).join(' · ')
    if (contactLine) doc.text(contactLine, margin, y + 12)
    doc.setFontSize(8)
    doc.setTextColor(...ACCENT_RGB)
    doc.text('BYGGDAGBOK', pageWidth - margin, y + 3, { align: 'right' })
    doc.setFontSize(14)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(project.name || 'Projekt', pageWidth - margin, y + 11, { align: 'right' })
    y += 22

    const metaLines: string[] = []
    if (customerName) metaLines.push(`Kund: ${customerName}`)
    if (project.start_date) metaLines.push(`Projektperiod: ${project.start_date}${project.end_date ? ` – ${project.end_date}` : ' –'}`)
    if (fromOk || toOk) metaLines.push(`Urval: ${fromOk ? from : '…'} – ${toOk ? to : '…'}`)
    const totalHours = logs.reduce((s, l) => s + (typeof l.hours_worked === 'number' ? l.hours_worked : 0), 0)
    metaLines.push(`Antal dagboksrader: ${logs.length}${totalHours > 0 ? ` · Timmar enligt dagbok: ${totalHours} h` : ''}`)
    metaLines.push(`Exporterad: ${new Date().toLocaleDateString('sv-SE')}`)
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    for (const line of metaLines) { doc.text(line, margin, y); y += 4.5 }
    y += 4
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 6

    if (logs.length === 0) {
      doc.setFontSize(10)
      doc.setTextColor(...TEXT_SECONDARY)
      doc.text('Inga dagboksrader.', margin, y)
    }

    const today = new Date()
    for (const log of logs) {
      const lockable = { date: log.date, locked_at: log.locked_at, attested_at: log.attested_at }
      const locked = isDiaryRowLocked(lockable, today)
      const reason = lockReason(lockable, today)

      // Datumrad + meta — hålls ihop med första textraden.
      ensureSpace(14)
      doc.setFontSize(10)
      doc.setTextColor(...TEXT_PRIMARY)
      doc.text(formatDatum(log.date), margin, y)

      let rightX = pageWidth - margin
      if (locked) {
        // Stämpel "LÅST" — ramad etikett längst till höger.
        doc.setFontSize(7)
        doc.setTextColor(...TEXT_MUTED)
        doc.setDrawColor(148, 163, 184)
        doc.setLineWidth(0.3)
        const label = 'LÅST'
        const w = doc.getTextWidth(label) + 3
        doc.rect(rightX - w, y - 3.6, w, 4.8)
        doc.text(label, rightX - w / 2, y - 0.3, { align: 'center' })
        rightX -= w + 3
      }
      const metaParts: string[] = []
      if (isDiaryWeather(log.weather)) {
        let w = WEATHER_LABELS[log.weather]
        if (log.temperature != null) w += `, ${log.temperature}°C`
        metaParts.push(w)
      } else if (log.temperature != null) {
        metaParts.push(`${log.temperature}°C`)
      }
      if (log.workers_count != null) metaParts.push(`${log.workers_count} på plats`)
      if (log.business_user?.name) metaParts.push(log.business_user.name)
      if (metaParts.length > 0) {
        doc.setFontSize(8)
        doc.setTextColor(...TEXT_MUTED)
        doc.text(metaParts.join('  ·  '), rightX, y, { align: 'right' })
      }
      y += 5

      // Timmar + ÄTA på egen rad
      const tagParts: string[] = []
      if (log.hours_worked != null) tagParts.push(`Timmar: ${log.hours_worked} h`)
      const registrerad = timeHours[log.date]
      if (registrerad != null && registrerad > 0) tagParts.push(`Registrerad tid: ${registrerad} h`)
      const ata = log.ata_change_id ? ataById.get(log.ata_change_id) : null
      if (log.ata_change_id) tagParts.push(ata?.ata_number != null ? `ÄTA #${ata.ata_number}` : 'ÄTA')
      if (tagParts.length > 0) {
        ensureSpace(4)
        doc.setFontSize(8)
        doc.setTextColor(...ACCENT_RGB)
        doc.text(tagParts.join('  ·  '), margin, y)
        y += 4
      }

      if (log.work_performed) textBlock(log.work_performed, 9, TEXT_PRIMARY)
      if (log.materials_used) textBlock(`Material: ${log.materials_used}`, 8, TEXT_MUTED)
      if (log.issues) textBlock(`Avvikelse: ${log.issues}`, 8, AMBER_RGB)
      if (log.description) textBlock(log.description, 8, TEXT_SECONDARY)

      // Foton — 40×40 mm, max 4 per rad, max 8 per rad-post
      const paths = Array.isArray(log.photos)
        ? (log.photos as unknown[]).filter((p): p is string => typeof p === 'string' && isDiaryPhotoPath(p, businessId)).slice(0, PHOTOS_PER_ENTRY)
        : []
      if (paths.length > 0) {
        const images = await Promise.all(paths.map(p => laddaFoto(supabase.storage, p)))
        let col = 0
        for (const img of images) {
          if (col === 0) {
            y += 1
            ensureSpace(PHOTO_SIZE + PHOTO_GAP)
          }
          const x = margin + col * (PHOTO_SIZE + PHOTO_GAP)
          if (img) {
            try {
              doc.addImage(img.dataUrl, img.format, x, y, PHOTO_SIZE, PHOTO_SIZE)
            } catch {
              doc.setDrawColor(226, 232, 240)
              doc.rect(x, y, PHOTO_SIZE, PHOTO_SIZE)
              doc.setFontSize(7)
              doc.setTextColor(...TEXT_SECONDARY)
              doc.text('Foto kunde inte läsas', x + PHOTO_SIZE / 2, y + PHOTO_SIZE / 2, { align: 'center' })
            }
          } else {
            doc.setDrawColor(226, 232, 240)
            doc.rect(x, y, PHOTO_SIZE, PHOTO_SIZE)
            doc.setFontSize(7)
            doc.setTextColor(...TEXT_SECONDARY)
            doc.text('Foto saknas', x + PHOTO_SIZE / 2, y + PHOTO_SIZE / 2, { align: 'center' })
          }
          col += 1
          if (col === PHOTOS_PER_ROW) {
            col = 0
            y += PHOTO_SIZE + PHOTO_GAP
          }
        }
        if (col !== 0) y += PHOTO_SIZE + PHOTO_GAP
      }

      // Tilläggsanteckningar — kursivt, originalet ovan orört
      if (log.addendum) {
        ensureSpace(8)
        doc.setFontSize(7)
        doc.setTextColor(...TEXT_SECONDARY)
        doc.text('TILLÄGGSANTECKNINGAR', margin, y)
        y += 3.5
        textBlock(log.addendum, 8, TEXT_MUTED, 'italic')
      }

      // Attestrad i teal
      if (log.attested_at) {
        ensureSpace(5)
        const attester = log.attested_by_user_id ? attesterById.get(log.attested_by_user_id) : null
        doc.setFontSize(8)
        doc.setTextColor(...ACCENT_RGB)
        doc.text(
          `Attesterad ${formatTidpunkt(log.attested_at)}${attester?.name ? ` av ${attester.name}` : ''}`,
          margin, y,
        )
        y += 4
      } else if (locked && reason === 'age') {
        ensureSpace(5)
        doc.setFontSize(7)
        doc.setTextColor(...TEXT_SECONDARY)
        doc.text('Låst automatiskt (äldre än 7 dagar)', margin, y)
        y += 4
      }

      y += 2
      doc.setDrawColor(241, 245, 249)
      doc.setLineWidth(0.2)
      doc.line(margin, y, pageWidth - margin, y)
      y += 5
    }

    // Sidfot
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(...TEXT_SECONDARY)
      doc.text(
        `${businessName} — Byggdagbok — Sida ${i} av ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      )
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="byggdagbok-${projectId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    console.error('Byggdagbok PDF error:', error)
    return NextResponse.json({ error: 'Dagboken kunde inte exporteras' }, { status: 500 })
  }
}
