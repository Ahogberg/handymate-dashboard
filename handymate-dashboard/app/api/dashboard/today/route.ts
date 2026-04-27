import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/dashboard/today
 * Aggregerar alla "att göra"-items för idag från olika källor.
 */
export async function GET(req: NextRequest) {
  const business = await getAuthenticatedBusiness(req)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const bizId = business.business_id

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0]

  interface TodoContext {
    type: 'project' | 'deal'
    label: string
    link: string
  }

  interface TodoItem {
    id: string
    type: 'task' | 'booking' | 'work_order' | 'approval' | 'overdue_task' | 'overdue_invoice'
    title: string
    subtitle?: string
    due?: string
    priority: 'low' | 'medium' | 'high'
    status: 'pending' | 'done'
    link?: string
    icon: string
    context?: TodoContext
  }

  const items: TodoItem[] = []

  try {
    // 1. Uppgifter med deadline idag eller förfallna
    const { data: tasks } = await supabase
      .from('task')
      .select('id, title, description, status, priority, due_date, due_time, deal_id, project_id, customer_id')
      .eq('business_id', bizId)
      .in('status', ['pending', 'in_progress'])
      .lte('due_date', todayStr)
      .order('due_date', { ascending: true })
      .limit(20)

    // 2. Dagens bokningar
    const { data: bookings } = await supabase
      .from('booking')
      .select('id, title, customer_name, scheduled_date, scheduled_start, scheduled_end, address, status, project_id')
      .eq('business_id', bizId)
      .gte('scheduled_date', todayStr)
      .lt('scheduled_date', tomorrowStr)
      .neq('status', 'cancelled')
      .order('scheduled_start', { ascending: true })
      .limit(10)

    // 3. Arbetsordrar att slutföra
    const { data: workOrders } = await supabase
      .from('work_orders')
      .select('id, title, order_number, scheduled_date, status, project_id')
      .eq('business_id', bizId)
      .eq('status', 'sent')
      .lte('scheduled_date', todayStr)
      .order('scheduled_date', { ascending: true })
      .limit(10)

    // ── Resolva projekt-namn och deal-titlar i ett enda batch ──
    const projectIdSet = new Set<string>()
    const dealIdSet = new Set<string>()
    for (const t of tasks || []) {
      if (t.project_id) projectIdSet.add(t.project_id)
      if (t.deal_id) dealIdSet.add(t.deal_id)
    }
    for (const b of bookings || []) {
      if (b.project_id) projectIdSet.add(b.project_id)
    }
    for (const wo of workOrders || []) {
      if (wo.project_id) projectIdSet.add(wo.project_id)
    }

    const projectMap: Record<string, string> = {}
    if (projectIdSet.size > 0) {
      const { data: projects } = await supabase
        .from('project')
        .select('id, name')
        .in('id', Array.from(projectIdSet))
      for (const p of projects || []) projectMap[p.id] = p.name
    }

    const dealMap: Record<string, { title: string; deal_number: number | null }> = {}
    if (dealIdSet.size > 0) {
      const { data: deals } = await supabase
        .from('deal')
        .select('id, title, deal_number')
        .in('id', Array.from(dealIdSet))
      for (const d of deals || []) dealMap[d.id] = { title: d.title, deal_number: d.deal_number }
    }

    // Bygg items
    for (const t of (tasks || [])) {
      const isOverdue = t.due_date && t.due_date < todayStr
      let context: TodoContext | undefined
      let link: string | undefined

      if (t.deal_id && dealMap[t.deal_id]) {
        const d = dealMap[t.deal_id]
        const ref = d.deal_number ? `#${d.deal_number}` : ''
        context = {
          type: 'deal',
          label: `Ärende ${ref}${ref ? ' · ' : ''}${d.title}`.trim(),
          link: `/dashboard/pipeline?deal=${t.deal_id}`,
        }
        link = context.link
      } else if (t.project_id && projectMap[t.project_id]) {
        context = {
          type: 'project',
          label: `Projekt · ${projectMap[t.project_id]}`,
          link: `/dashboard/projects/${t.project_id}?tab=tasks`,
        }
        link = context.link
      } else if (t.deal_id) {
        link = `/dashboard/pipeline?deal=${t.deal_id}`
      } else if (t.project_id) {
        link = `/dashboard/projects/${t.project_id}?tab=tasks`
      }

      items.push({
        id: `task_${t.id}`,
        type: isOverdue ? 'overdue_task' : 'task',
        title: t.title,
        subtitle: t.due_time ? `Kl ${t.due_time}` : (isOverdue ? 'Förfallen' : 'Idag'),
        due: t.due_date,
        priority: isOverdue ? 'high' : (t.priority || 'medium'),
        status: 'pending',
        link,
        icon: isOverdue ? '🔴' : '📋',
        context,
      })
    }

    for (const b of (bookings || [])) {
      const time = b.scheduled_start ? b.scheduled_start.slice(0, 5) : ''
      let context: TodoContext | undefined
      if (b.project_id && projectMap[b.project_id]) {
        context = {
          type: 'project',
          label: `Projekt · ${projectMap[b.project_id]}`,
          link: `/dashboard/projects/${b.project_id}`,
        }
      }

      items.push({
        id: `booking_${b.id}`,
        type: 'booking',
        title: b.title || 'Bokning',
        subtitle: [time, b.customer_name, b.address].filter(Boolean).join(' · '),
        priority: 'medium',
        status: b.status === 'completed' ? 'done' : 'pending',
        link: context?.link || (b.project_id ? `/dashboard/projects/${b.project_id}` : '/dashboard/planning/schedule'),
        icon: '📅',
        context,
      })
    }

    for (const wo of (workOrders || [])) {
      let context: TodoContext | undefined
      if (wo.project_id && projectMap[wo.project_id]) {
        context = {
          type: 'project',
          label: `Projekt · ${projectMap[wo.project_id]}`,
          link: `/dashboard/projects/${wo.project_id}`,
        }
      }

      items.push({
        id: `wo_${wo.id}`,
        type: 'work_order',
        title: `${wo.order_number} — ${wo.title}`,
        subtitle: wo.scheduled_date === todayStr ? 'Idag' : 'Förfallen',
        priority: wo.scheduled_date < todayStr ? 'high' : 'medium',
        status: 'pending',
        link: context?.link || (wo.project_id ? `/dashboard/projects/${wo.project_id}` : undefined),
        icon: '🔧',
        context,
      })
    }

    // 4. Väntande godkännanden (max 5)
    const { data: approvals } = await supabase
      .from('pending_approvals')
      .select('id, title, description, priority, agent_id')
      .eq('business_id', bizId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)

    for (const a of (approvals || [])) {
      items.push({
        id: `approval_${a.id}`,
        type: 'approval',
        title: a.title,
        subtitle: a.description?.slice(0, 60) || undefined,
        priority: a.priority === 'high' ? 'high' : 'medium',
        status: 'pending',
        link: '/dashboard/approvals',
        icon: '🤖',
      })
    }

    // 5. Förfallna fakturor
    const { data: overdueInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, customer_name, total_amount, due_date')
      .eq('business_id', bizId)
      .eq('status', 'sent')
      .lt('due_date', todayStr)
      .order('due_date', { ascending: true })
      .limit(5)

    for (const inv of (overdueInvoices || [])) {
      items.push({
        id: `inv_${inv.id}`,
        type: 'overdue_invoice',
        title: `Faktura #${inv.invoice_number} förfallen`,
        subtitle: `${inv.customer_name} · ${Number(inv.total_amount).toLocaleString('sv-SE')} kr`,
        due: inv.due_date,
        priority: 'high',
        status: 'pending',
        link: `/dashboard/invoices/${inv.id}`,
        icon: '💰',
      })
    }

    // Sortera: high priority först, sedan medium, sedan low
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

    return NextResponse.json({
      items,
      summary: {
        total: items.length,
        overdue: items.filter(i => i.type === 'overdue_task' || i.type === 'overdue_invoice').length,
        bookings: items.filter(i => i.type === 'booking').length,
        approvals: items.filter(i => i.type === 'approval').length,
      },
    })
  } catch (err: any) {
    console.error('[today] Error:', err.message)
    return NextResponse.json({ items: [], summary: { total: 0, overdue: 0, bookings: 0, approvals: 0 } })
  }
}
