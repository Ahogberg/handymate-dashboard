import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

/**
 * POST /api/quotes/from-photo
 * Body: { imageBase64: string, mediaType?: string }
 *
 * Claude Vision analyses the image and returns structured job data.
 * Matches extracted materials against the price_list table for accurate pricing.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { imageBase64, mediaType = 'image/jpeg' } = await request.json()
    if (!imageBase64) return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 })

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const supabase = getServerSupabase()

    // Step 1: Analyse the image with Claude Vision
    const visionResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'Du är en erfaren hantverkare och offertspecialist. Analysera bilden och returnera ENDAST JSON utan markdown:\n{"job_type":"string","scope":"string","materials":["string"],"complexity":"low|medium|high","notes":"string"}',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageBase64 },
            },
            { type: 'text', text: 'Analysera bilden och returnera JSON.' },
          ],
        },
      ],
    })

    const rawText = visionResponse.content[0].type === 'text' ? visionResponse.content[0].text : '{}'
    let analysis: { job_type: string; scope: string; materials: string[]; complexity: string; notes: string }

    try {
      analysis = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    } catch {
      return NextResponse.json({ error: 'Kunde inte tolka bilden', raw: rawText }, { status: 422 })
    }

    // Step 2: Match materials against price_list
    const { data: priceList } = await supabase
      .from('price_list')
      .select('name, unit, unit_price, category')
      .eq('business_id', business.business_id)
      .limit(100)

    const pricedItems: Array<{ description: string; quantity: number; unit: string; unitPrice: number; type: string }> = []

    for (const mat of analysis.materials || []) {
      const match = priceList?.find((p: any) =>
        p.name.toLowerCase().includes(mat.toLowerCase()) ||
        mat.toLowerCase().includes(p.name.toLowerCase())
      )
      if (match) {
        pricedItems.push({
          description: match.name,
          quantity: 1,
          unit: match.unit || 'st',
          unitPrice: match.unit_price,
          type: match.category === 'labor' ? 'labor' : 'material',
        })
      } else {
        pricedItems.push({
          description: mat,
          quantity: 1,
          unit: 'st',
          unitPrice: 0,
          type: 'material',
        })
      }
    }

    // Add labor estimate based on complexity
    const hourlyRate = business.pricing_settings?.hourly_rate || 650
    const laborHours = analysis.complexity === 'high' ? 8 : analysis.complexity === 'medium' ? 4 : 2
    pricedItems.unshift({
      description: `Arbete — ${analysis.job_type}`,
      quantity: laborHours,
      unit: 'tim',
      unitPrice: hourlyRate,
      type: 'labor',
    })

    return NextResponse.json({
      success: true,
      analysis,
      items: pricedItems,
      job_title: analysis.job_type,
      job_description: analysis.scope,
    })
  } catch (error: any) {
    console.error('[from-photo] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
