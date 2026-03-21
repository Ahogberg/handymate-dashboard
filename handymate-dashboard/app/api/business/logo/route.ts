import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { ensureBucket } from '@/lib/storage'

/** POST — Ladda upp företagslogga */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'Ingen fil bifogad' }, { status: 400 })
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'Filen är för stor (max 2 MB)' }, { status: 400 })
  }

  const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
  if (!validTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Ogiltigt filformat — använd PNG, JPG eller SVG' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'png'
  const filePath = `${business.business_id}/logo.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Säkerställ att bucket finns
  await ensureBucket(supabase, 'business-assets', { public: true })

  // Upload (upsert to replace old logo)
  const { error: uploadError } = await supabase.storage
    .from('business-assets')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    console.error('Logo upload error:', uploadError)
    return NextResponse.json({ error: 'Kunde inte ladda upp loggan: ' + uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage
    .from('business-assets')
    .getPublicUrl(filePath)

  // Save URL in business_config
  await supabase
    .from('business_config')
    .update({ logo_url: urlData.publicUrl })
    .eq('business_id', business.business_id)

  return NextResponse.json({ logo_url: urlData.publicUrl })
}
