import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'

export const dynamic = 'force-dynamic'

interface ActivityItem {
  id: string
  type: string
  title: string
  sub: string
  icon: string
  color: string
  bg: string
  created_at: string
  link?: { route: string }
}

/**
 * Aggregerad aktivitetsfeed för Home-vy.
 * Returnerar de 10 senaste händelserna över quotes, invoices,
 * project-photos, customer_messages och project_tracker_stages.
 */
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const sinceIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() // 90d window

    // Hämta projekt-id:n för denna kund (för photo + tracker join)
    const { data: projects, error: projectsError } = await supabase
      .from('project')
      .select('project_id')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
    if (projectsError) console.error('[portal/activity] projects-hämtning misslyckades:', projectsError.message)
    const projectIds = (projects || []).map((p: any) => p.project_id)

    const [quotesRes, invoicesRes, photosRes, messagesRes, stagesRes] = await Promise.all([
      // Quotes — sent + accepted (declined ger negativ feed, hoppar över)
      supabase
        .from('quotes')
        .select('quote_id, title, status, sent_at, accepted_at')
        .eq('business_id', customer.business_id)
        .eq('customer_id', customer.customer_id)
        .gte('created_at', sinceIso),

      // Invoices — sent + paid
      supabase
        .from('invoice')
        .select('invoice_id, invoice_number, status, created_at, paid_at')
        .eq('business_id', customer.business_id)
        .eq('customer_id', customer.customer_id)
        .gte('created_at', sinceIso),

      // Project photos
      projectIds.length > 0
        ? supabase
            .from('project_photos')
            .select('id, project_id, caption, uploaded_at')
            .in('project_id', projectIds)
            .gte('uploaded_at', sinceIso)
            .order('uploaded_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),

      // Inkommande meddelanden från företaget
      supabase
        .from('customer_message')
        .select('id, message, direction, created_at')
        .eq('business_id', customer.business_id)
        .eq('customer_id', customer.customer_id)
        .eq('direction', 'outbound')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(20),

      // Tracker stage completions
      projectIds.length > 0
        ? supabase
            .from('project_stages')
            .select('project_id, stage, label, completed_at')
            .in('project_id', projectIds)
            .not('completed_at', 'is', null)
            .gte('completed_at', sinceIso)
            .order('completed_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ])

    // Aggregerad feed över fem oberoende tabeller — ett fel i en källa ska
    // inte tömma HELA aktivitetslistan (samma resonemang som /projects'
    // sekundärfrågor), men får aldrig förbli tyst (TD-22).
    for (const [namn, res] of Object.entries({ quotes: quotesRes, invoices: invoicesRes, photos: photosRes, messages: messagesRes, stages: stagesRes })) {
      if ((res as any)?.error) console.error(`[portal/activity] ${namn}-hämtning misslyckades:`, (res as any).error.message)
    }

    const events: ActivityItem[] = []

    // Quotes
    for (const q of (quotesRes.data || []) as any[]) {
      if (q.accepted_at) {
        events.push({
          id: `quote-accepted-${q.quote_id}`,
          type: 'quote_signed',
          title: 'Offert godkänd',
          sub: q.title || 'Offert',
          icon: 'FileSignature',
          color: 'var(--bee-700)',
          bg: 'var(--bee-50)',
          created_at: q.accepted_at,
          link: { route: 'docs' },
        })
      } else if (q.sent_at) {
        events.push({
          id: `quote-sent-${q.quote_id}`,
          type: 'quote_sent',
          title: 'Offert skickad',
          sub: q.title || 'Offert',
          icon: 'FileSignature',
          color: 'var(--bee-700)',
          bg: 'var(--bee-50)',
          created_at: q.sent_at,
          link: { route: 'docs' },
        })
      }
    }

    // Invoices
    for (const inv of (invoicesRes.data || []) as any[]) {
      if (inv.paid_at) {
        events.push({
          id: `invoice-paid-${inv.invoice_id}`,
          type: 'invoice_paid',
          title: 'Faktura betald',
          sub: `Faktura #${inv.invoice_number}`,
          icon: 'CheckCircle',
          color: 'var(--green-600)',
          bg: 'var(--green-50)',
          created_at: inv.paid_at,
          link: { route: 'docs' },
        })
      } else if (inv.status === 'sent') {
        events.push({
          id: `invoice-sent-${inv.invoice_id}`,
          type: 'invoice_sent',
          title: 'Ny faktura',
          sub: `Faktura #${inv.invoice_number}`,
          icon: 'Receipt',
          color: 'var(--ink)',
          bg: 'var(--bg)',
          created_at: inv.created_at,
          link: { route: 'docs' },
        })
      }
    }

    // Photos
    for (const p of (photosRes.data || []) as any[]) {
      events.push({
        id: `photo-${p.id}`,
        type: 'photo_uploaded',
        title: 'Ny bild',
        sub: p.caption || 'Projektbild',
        icon: 'Image',
        color: 'var(--blue-600)',
        bg: 'var(--blue-50)',
        created_at: p.uploaded_at,
        link: { route: 'project' },
      })
    }

    // Messages
    for (const m of (messagesRes.data || []) as any[]) {
      const preview = (m.message || '').substring(0, 60)
      events.push({
        id: `msg-${m.id}`,
        type: 'message_received',
        title: 'Nytt meddelande',
        sub: preview + (m.message?.length > 60 ? '…' : ''),
        icon: 'MessageCircle',
        color: 'var(--green-600)',
        bg: 'var(--green-50)',
        created_at: m.created_at,
        link: { route: 'messages' },
      })
    }

    // Stages
    for (const s of (stagesRes.data || []) as any[]) {
      events.push({
        id: `stage-${s.project_id}-${s.stage}`,
        type: 'stage_completed',
        title: s.label || 'Steg klart',
        sub: 'Projektets framsteg',
        icon: 'CheckCircle',
        color: 'var(--bee-700)',
        bg: 'var(--bee-50)',
        created_at: s.completed_at,
        link: { route: 'project' },
      })
    }

    // Sortera nyast först + ta topp 10
    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return NextResponse.json({ activity: events.slice(0, 10) })
  } catch (error: any) {
    console.error('[portal/activity] error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
