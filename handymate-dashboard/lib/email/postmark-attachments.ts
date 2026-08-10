import { getServerSupabase } from '@/lib/supabase'
import { ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '@/lib/gmail-attachments'

/**
 * Postmark-bilagor → customer_document (B4, Epic B).
 *
 * Postmark skickar bilagor som base64 direkt i JSON-payloaden (till skillnad
 * från Gmail-vägen i lib/gmail-attachments.ts som kräver en separat
 * hämtning per bilaga) — ingen extra API-fetch behövs här.
 *
 * Återanvänder samma bucket (customer-documents), samma tabell
 * (customer_document) och samma allowlist som Gmail-leadbilagorna. Ingen ny
 * SQL — kolumnerna finns redan (sql/gmail_attachments.sql).
 *
 * Fail-mjukt med flit: leaden är redan skapad när den här funktionen
 * anropas. En trasig/för stor/otillåten bilaga får aldrig göra att hela
 * webhook-anropet ser ut som ett fel — bara den bilagan hoppas över, loggad.
 *
 * KÄND PLATTFORMSGRÄNS: Vercel Serverless Functions har en inbyggd
 * request-body-gräns på ~4,5 MB för hela JSON-payloaden (base64 + Postmarks
 * envelope-overhead). Ett mail med en riktigt stor bilaga (t.ex. en 15 MB
 * video) kommer alltså aldrig nå den här funktionen — Vercel avvisar
 * requesten innan vår kod körs. MAX_FILE_SIZE nedan skyddar mot bilagor som
 * FAKTISKT kommer igenom (foton, PDF:er, dokument), inte mot den gränsen.
 * Inget att bygga runt i denna sprint.
 */

export interface PostmarkAttachment {
  Name?: string
  Content?: string // base64
  ContentType?: string
  ContentLength?: number
  ContentID?: string
}

interface SavedPostmarkAttachment {
  filename: string
  storagePath: string
  fileUrl: string
  fileSize: number
  fileType: string
}

const MAX_ATTACHMENTS_PER_EMAIL = 5

export async function saveInboundAttachments(
  attachments: PostmarkAttachment[] | undefined,
  businessId: string,
  leadId: string | null,
  customerId: string | null,
  messageId: string | null,
): Promise<SavedPostmarkAttachment[]> {
  if (!attachments || attachments.length === 0) return []

  const supabase = getServerSupabase()
  const saved: SavedPostmarkAttachment[] = []
  const safeMessageId = (messageId || `no-id-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_')

  for (const att of attachments.slice(0, MAX_ATTACHMENTS_PER_EMAIL)) {
    try {
      if (!att.Name || !att.Content) {
        console.warn('[postmark-attachments] Hoppar bilaga utan namn/innehåll')
        continue
      }

      const ext = att.Name.split('.').pop()?.toLowerCase() || ''
      const mimeAllowed = !!(att.ContentType && ALLOWED_MIME_TYPES[att.ContentType])
      const extAllowed = ALLOWED_EXTENSIONS.has(ext)
      if (!mimeAllowed && !extAllowed) {
        console.warn(`[postmark-attachments] Otillåten filtyp, hoppar: ${att.Name} (${att.ContentType})`)
        continue
      }

      let buffer: Buffer
      try {
        buffer = Buffer.from(att.Content, 'base64')
      } catch {
        console.warn(`[postmark-attachments] Ogiltig base64, hoppar: ${att.Name}`)
        continue
      }

      if (buffer.length === 0 || buffer.length > MAX_FILE_SIZE) {
        console.warn(`[postmark-attachments] Hoppar ${att.Name} — ogiltig storlek (${buffer.length} bytes)`)
        continue
      }

      const safeFilename = att.Name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${businessId}/postmark-leads/${safeMessageId}/${safeFilename}`
      const contentType = (att.ContentType && ALLOWED_MIME_TYPES[att.ContentType])
        ? att.ContentType
        : 'application/octet-stream'

      const { error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(storagePath, buffer, { contentType, upsert: true })

      if (uploadError) {
        console.error(`[postmark-attachments] Uppladdning misslyckades för ${att.Name}:`, uploadError)
        continue
      }

      const { data: urlData } = supabase.storage
        .from('customer-documents')
        .getPublicUrl(storagePath)
      const fileUrl = urlData?.publicUrl || ''

      const { error: dbError } = await supabase
        .from('customer_document')
        .insert({
          customer_id: customerId,
          business_id: businessId,
          file_name: att.Name,
          file_url: fileUrl,
          file_type: contentType,
          file_size: buffer.length,
          category: 'lead_attachment',
          source: 'postmark_email',
          lead_id: leadId,
          storage_path: storagePath,
        })

      if (dbError) {
        console.error(`[postmark-attachments] DB-insert misslyckades för ${att.Name}:`, dbError)
        continue
      }

      saved.push({
        filename: att.Name,
        storagePath,
        fileUrl,
        fileSize: buffer.length,
        fileType: contentType,
      })
    } catch (err) {
      console.error('[postmark-attachments] Fel vid bilagehantering:', err)
    }
  }

  return saved
}
