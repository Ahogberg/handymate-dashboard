import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { checkPublicRateLimitDb } from '@/lib/rate-limit-db'
import { findPublicPreparation, BUCKET } from '@/lib/customer-preparation/server'
import { validateAnswers, imageExtension, isExpired, isTemplate, MAX_IMAGE_BYTES } from '@/lib/customer-preparation/contract'
import { readPreparationForm } from '@/lib/customer-preparation/body'
export const dynamic = 'force-dynamic'
type Params = { params: { token: string } }
const unavailable = () => NextResponse.json({ error: 'Länken är inte längre tillgänglig. Kontakta företaget.' }, { status: 404 })

// Kundväg: tidsbegränsad capability för exakt en förfrågan, inte företags-session.
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const row = await findPublicPreparation(params.token)
    if (!row || row.status === 'cancelled' || isExpired(row.expires_at) || !isTemplate(row.template)) return unavailable()
    // Inga kund-ID:n, interna bilder/svar eller ekonomiska uppgifter i publikt GET.
    return NextResponse.json({ template: row.template, context: row.context, due_date: row.due_date, status: row.status }, {
      headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
    })
  } catch { return NextResponse.json({ error: 'Kunde inte läsa underlaget. Försök igen.' }, { status: 503 }) }
}

export async function POST(request: NextRequest, { params }: Params) {
  const uploaded: string[] = []
  const db = getServerSupabase()
  let committed = false
  try {
    const row = await findPublicPreparation(params.token)
    if (!row || row.status === 'cancelled' || isExpired(row.expires_at) || !isTemplate(row.template)) return unavailable()
    if (row.status !== 'open') return NextResponse.json({ error: 'Svaret är redan mottaget.' }, { status: 409 })
    const rate = await checkPublicRateLimitDb(`preparation:${row.id}`, { maxRequests: 10, windowMs: 15 * 60 * 1000 })
    if (!rate.allowed) return NextResponse.json({ error: 'Vänta en stund innan du försöker igen.' }, { status: 429 })
    // Vercel request body limit is 4.5 MB; V1 accepts up to 3 MB TOTAL.
    if (Number(request.headers.get('content-length') || 0) > 3.5 * 1024 * 1024) return NextResponse.json({ error: 'Bilderna är för stora. Välj mindre bilder (högst 3 MB totalt).' }, { status: 413 })
    let form: FormData
    try { form = await readPreparationForm(request) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Ogiltigt underlag.' }, { status: 400 }) }
    let answers
    try { answers = validateAnswers(row.template, JSON.parse(String(form.get('answers') || '{}'))) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Kontrollera svaren.' }, { status: 400 }) }
    const files = form.getAll('images')
    if (files.length > 3 || files.some(file => typeof file === 'string')) return NextResponse.json({ error: 'Välj högst tre bilder.' }, { status: 400 })
    const imageFiles = files as File[]
    if (imageFiles.reduce((total, file) => total + file.size, 0) > 3 * 1024 * 1024) return NextResponse.json({ error: 'Välj bilder på högst 3 MB totalt.' }, { status: 413 })
    const checked = []
    for (const file of imageFiles) {
      if (!file.size || file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'En bild är tom eller för stor.' }, { status: 400 })
      const bytes = new Uint8Array(await file.arrayBuffer())
      const extension = imageExtension(bytes, file.type)
      if (!extension) return NextResponse.json({ error: 'Använd JPG, PNG eller WebP.' }, { status: 400 })
      checked.push({ bytes, extension, type: file.type })
    }
    for (const file of checked) {
      const path = `${row.business_id}/${row.id}/${crypto.randomUUID()}.${file.extension}`
      const { error } = await db.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.type, upsert: false })
      if (error) throw error
      uploaded.push(path)
    }
    // Compare-and-set: två samtidiga svar får aldrig skriva över varandra.
    const { data, error } = await db.from('customer_preparation').update({
      answers, images: uploaded, status: 'submitted', submitted_at: new Date().toISOString(),
    }).eq('id', row.id).eq('business_id', row.business_id).eq('customer_id', row.customer_id)
      .eq('status', 'open').gt('expires_at', new Date().toISOString()).select('id').maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Länken har ändrats eller svaret är redan mottaget. Läs in sidan igen.' }, { status: 409 })
    committed = true
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Kunde inte spara svaret. Läs in sidan igen för att kontrollera om det kom fram.' }, { status: 503 })
  } finally {
    if (!committed && uploaded.length) {
      // Vid osäkert nätutfall får cleanup aldrig radera bilder i ett sparat svar.
      try {
        const { data, error } = await db.from('customer_preparation').select('images').eq('token', params.token).maybeSingle()
        if (!error && data) {
          const retained = Array.isArray(data.images) ? data.images : []
          const unused = uploaded.filter(path => !retained.includes(path))
          if (unused.length) await db.storage.from(BUCKET).remove(unused)
        }
      } catch { /* orphan cleanup can be retried; preserve possible committed files */ }
    }
  }
}
