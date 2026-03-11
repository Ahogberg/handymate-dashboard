import { getServerSupabase } from '@/lib/supabase'

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/octet-stream': 'bin', // fallback, checked by filename too
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

const ALLOWED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'pdf', 'zip', 'doc', 'docx', 'xls', 'xlsx',
])

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

interface AttachmentMeta {
  filename: string
  mimeType: string
  attachmentId: string
  size: number
}

/**
 * Recursively scan Gmail message payload for attachment parts.
 * Returns parts that have a filename and an attachmentId.
 */
export function extractAttachmentMeta(payload: any): AttachmentMeta[] {
  const found: AttachmentMeta[] = []

  const scan = (part: any): void => {
    if (!part) return

    const filename = part.filename as string | undefined
    const attachmentId = part.body?.attachmentId as string | undefined
    const size = part.body?.size as number | undefined
    const mimeType = (part.mimeType as string | undefined) || ''

    if (filename && attachmentId) {
      const ext = filename.split('.').pop()?.toLowerCase() || ''
      const mimeAllowed = !!ALLOWED_MIME_TYPES[mimeType]
      const extAllowed = ALLOWED_EXTENSIONS.has(ext)

      if (mimeAllowed || extAllowed) {
        found.push({ filename, mimeType, attachmentId, size: size || 0 })
      }
    }

    if (part.parts) {
      for (const child of part.parts) scan(child)
    }
  }

  scan(payload)
  return found
}

interface SavedAttachment {
  filename: string
  storagePath: string
  fileUrl: string
  fileSize: number
  fileType: string
}

/**
 * Download Gmail attachments and save them to Supabase Storage + customer_document table.
 * Returns list of successfully saved attachments.
 */
export async function downloadAndSaveAttachments(
  gmail: any,
  messageId: string,
  payload: any,
  customerId: string | null,
  leadId: string | null,
  businessId: string
): Promise<SavedAttachment[]> {
  const attachments = extractAttachmentMeta(payload)
  if (attachments.length === 0) return []

  const supabase = getServerSupabase()
  const saved: SavedAttachment[] = []

  for (const att of attachments) {
    try {
      if (att.size > MAX_FILE_SIZE) {
        console.warn(`[gmail-attachments] Skipping ${att.filename} — too large (${att.size} bytes)`)
        continue
      }

      // Download attachment from Gmail
      const { data: attData } = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: att.attachmentId,
      })

      if (!attData?.data) {
        console.warn(`[gmail-attachments] No data for attachment ${att.filename}`)
        continue
      }

      // Gmail returns URL-safe base64 — convert to standard base64 then to Buffer
      const base64 = attData.data.replace(/-/g, '+').replace(/_/g, '/')
      const buffer = Buffer.from(base64, 'base64')

      // Build storage path: {businessId}/gmail-leads/{messageId}/{filename}
      const safeFilename = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${businessId}/gmail-leads/${messageId}/${safeFilename}`

      const contentType = ALLOWED_MIME_TYPES[att.mimeType]
        ? att.mimeType
        : 'application/octet-stream'

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(storagePath, buffer, {
          contentType,
          upsert: true,
        })

      if (uploadError) {
        console.error(`[gmail-attachments] Upload failed for ${att.filename}:`, uploadError)
        continue
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('customer-documents')
        .getPublicUrl(storagePath)

      const fileUrl = urlData?.publicUrl || ''

      // Insert customer_document record
      const { error: dbError } = await supabase
        .from('customer_document')
        .insert({
          customer_id: customerId,
          business_id: businessId,
          file_name: att.filename,
          file_url: fileUrl,
          file_type: contentType,
          file_size: buffer.length,
          category: 'lead_attachment',
          source: 'gmail_lead',
          lead_id: leadId,
          storage_path: storagePath,
        })

      if (dbError) {
        console.error(`[gmail-attachments] DB insert failed for ${att.filename}:`, dbError)
        continue
      }

      saved.push({
        filename: att.filename,
        storagePath,
        fileUrl,
        fileSize: buffer.length,
        fileType: contentType,
      })
    } catch (err) {
      console.error(`[gmail-attachments] Error processing attachment ${att.filename}:`, err)
    }
  }

  return saved
}
