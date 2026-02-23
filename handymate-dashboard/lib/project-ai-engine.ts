/**
 * AI Projektledare – Event-driven engine
 *
 * Osynlig infrastruktur som automatiskt:
 * - Skapar projekt när offert accepteras
 * - Uppdaterar framsteg vid tidsrapportering
 * - Detekterar milstolpesavslut
 * - Beräknar hälsopoäng
 * - Varnar vid budgetöverträdelser och förseningar
 * - Föreslår projektavslut vid faktura betald
 *
 * Alla AI-handlingar loggas i project_ai_log.
 */

import { getServerSupabase } from '@/lib/supabase'
import { createNotification } from '@/lib/notifications'

// ── Event Types ───────────────────────────────────────────────

export type ProjectEvent =
  | { type: 'quote_accepted'; businessId: string; quoteId: string }
  | { type: 'time_logged'; businessId: string; projectId: string; entryId: string }
  | { type: 'milestone_completed'; businessId: string; projectId: string; milestoneId: string }
  | { type: 'invoice_paid'; businessId: string; invoiceId: string }
  | { type: 'daily_health_check'; businessId: string; projectId: string }

// ── Main Dispatcher ───────────────────────────────────────────

export async function handleProjectEvent(event: ProjectEvent): Promise<void> {
  try {
    switch (event.type) {
      case 'quote_accepted':
        return await onQuoteAccepted(event.businessId, event.quoteId)
      case 'time_logged':
        return await onTimeLogged(event.businessId, event.projectId, event.entryId)
      case 'milestone_completed':
        return await onMilestoneCompleted(event.businessId, event.projectId, event.milestoneId)
      case 'invoice_paid':
        return await onInvoicePaid(event.businessId, event.invoiceId)
      case 'daily_health_check':
        return await onDailyHealthCheck(event.businessId, event.projectId)
    }
  } catch (err) {
    console.error(`[AI ProjectManager] Error handling ${event.type}:`, err)
  }
}

// ── Helpers ───────────────────────────────────────────────────

async function logAiAction(
  businessId: string,
  projectId: string,
  eventType: string,
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = getServerSupabase()
    await supabase.from('project_ai_log').insert({
      business_id: businessId,
      project_id: projectId,
      event_type: eventType,
      action,
      details,
    })
  } catch (err) {
    console.error('[AI ProjectManager] Failed to log action:', err)
  }
}

function calculateHealthScore(params: {
  budgetHours: number | null
  actualHours: number
  budgetAmount: number | null
  actualAmount: number
  endDate: string | null
  startDate: string | null
  milestonesTotal: number
  milestonesCompleted: number
  daysSinceLastActivity: number
  progressPercent: number
}): { score: number; issues: string[] } {
  let score = 100
  const issues: string[] = []

  // Budget hours check
  if (params.budgetHours && params.budgetHours > 0) {
    const hourUtilization = params.actualHours / params.budgetHours
    if (hourUtilization > 1.0) {
      score -= 30
      issues.push(`Timbudget överskriden (${Math.round(hourUtilization * 100)}%)`)
    } else if (hourUtilization > 0.9) {
      score -= 15
      issues.push(`Nära timbudgetgräns (${Math.round(hourUtilization * 100)}%)`)
    } else if (hourUtilization > 0.8) {
      score -= 5
    }
  }

  // Budget amount check
  if (params.budgetAmount && params.budgetAmount > 0) {
    const amountUtilization = params.actualAmount / params.budgetAmount
    if (amountUtilization > 1.0) {
      score -= 25
      issues.push(`Kostnadsbudget överskriden (${Math.round(amountUtilization * 100)}%)`)
    } else if (amountUtilization > 0.9) {
      score -= 10
      issues.push(`Nära kostnadsbudgetgräns (${Math.round(amountUtilization * 100)}%)`)
    }
  }

  // Timeline check
  if (params.endDate) {
    const end = new Date(params.endDate)
    const now = new Date()
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysLeft < 0) {
      score -= 25
      issues.push(`Försenat med ${Math.abs(daysLeft)} dagar`)
    } else if (daysLeft <= 3) {
      score -= 10
      issues.push(`Deadline inom ${daysLeft} dagar`)
    } else if (daysLeft <= 7) {
      score -= 5
    }

    // Progress vs timeline check
    if (params.startDate && params.endDate) {
      const start = new Date(params.startDate)
      const totalDuration = end.getTime() - start.getTime()
      const elapsed = now.getTime() - start.getTime()
      if (totalDuration > 0 && elapsed > 0) {
        const expectedProgress = Math.min(100, Math.round((elapsed / totalDuration) * 100))
        if (params.progressPercent < expectedProgress - 20) {
          score -= 15
          issues.push(`Framsteg efter schema (${params.progressPercent}% vs förväntat ${expectedProgress}%)`)
        }
      }
    }
  }

  // Stalled project check
  if (params.daysSinceLastActivity > 14) {
    score -= 20
    issues.push(`Ingen aktivitet på ${params.daysSinceLastActivity} dagar`)
  } else if (params.daysSinceLastActivity > 7) {
    score -= 10
    issues.push(`Ingen aktivitet på ${params.daysSinceLastActivity} dagar`)
  }

  return { score: Math.max(0, Math.min(100, score)), issues }
}

// ── Event: Quote Accepted → Auto-create Project ──────────────

async function onQuoteAccepted(businessId: string, quoteId: string): Promise<void> {
  const supabase = getServerSupabase()

  // Check if project already exists for this quote
  const { data: existingProject } = await supabase
    .from('project')
    .select('project_id')
    .eq('quote_id', quoteId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (existingProject) return // Already handled

  // Fetch quote data
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('quote_id, title, customer_id, items, total, labor_total, material_total')
    .eq('quote_id', quoteId)
    .eq('business_id', businessId)
    .single()

  if (quoteError || !quote) return

  // Calculate budget from quote items
  const items = (quote.items || []) as Array<{ type?: string; quantity?: number; total?: number; name?: string; description?: string }>
  const laborHours = items
    .filter((i) => i.type === 'labor')
    .reduce((sum: number, i) => sum + (i.quantity || 0), 0)
  const totalAmount = items.reduce((sum: number, i) => sum + (i.total || 0), 0)

  // Determine project type
  let projectType = 'hourly'
  const hasLabor = laborHours > 0
  const hasMaterial = items.some((i) => i.type === 'material')
  if (hasLabor && hasMaterial) projectType = 'mixed'
  else if (!hasLabor) projectType = 'fixed_price'

  // Create the project
  const { data: project, error: projectError } = await supabase
    .from('project')
    .insert({
      business_id: businessId,
      customer_id: quote.customer_id || null,
      quote_id: quoteId,
      name: quote.title || 'Projekt från offert',
      project_type: projectType,
      status: 'active',
      budget_hours: laborHours || null,
      budget_amount: totalAmount || null,
      ai_auto_created: true,
      ai_health_score: 100,
      ai_health_summary: 'Nytt projekt — redo att starta',
      start_date: new Date().toISOString().split('T')[0],
    })
    .select('project_id')
    .single()

  if (projectError || !project) {
    console.error('[AI ProjectManager] Failed to create project:', projectError)
    return
  }

  // Create milestones from labor items
  const laborItems = items.filter((i) => i.type === 'labor')
  if (laborItems.length > 1) {
    const milestones = laborItems.map((item, idx) => ({
      business_id: businessId,
      project_id: project.project_id,
      name: item.name || item.description || `Moment ${idx + 1}`,
      budget_hours: item.quantity || null,
      budget_amount: item.total || null,
      sort_order: idx,
      status: 'pending',
    }))
    await supabase.from('project_milestone').insert(milestones)
  }

  // Log and notify
  await logAiAction(businessId, project.project_id, 'quote_accepted', 'Projekt skapat automatiskt från accepterad offert', {
    quote_id: quoteId,
    budget_hours: laborHours,
    budget_amount: totalAmount,
    milestones_created: laborItems.length > 1 ? laborItems.length : 0,
  })

  // Fetch customer name for notification
  let customerName = 'Kund'
  if (quote.customer_id) {
    const { data: customer } = await supabase
      .from('customer')
      .select('name')
      .eq('customer_id', quote.customer_id)
      .single()
    if (customer?.name) customerName = customer.name
  }

  await createNotification({
    businessId,
    type: 'system',
    title: `Nytt projekt: ${quote.title || 'Från offert'}`,
    message: `Projekt skapades automatiskt för ${customerName} (${totalAmount?.toLocaleString('sv-SE')} kr)`,
    icon: 'folder-kanban',
    link: `/dashboard/projects/${project.project_id}`,
    metadata: { project_id: project.project_id, ai_action: 'auto_create_project' },
  })
}

// ── Event: Time Logged → Progress + Budget Check ─────────────

async function onTimeLogged(businessId: string, projectId: string, entryId: string): Promise<void> {
  const supabase = getServerSupabase()

  // Fetch project
  const { data: project } = await supabase
    .from('project')
    .select('project_id, name, budget_hours, budget_amount, progress_percent, end_date, start_date, status')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .single()

  if (!project || project.status === 'completed' || project.status === 'cancelled') return

  // Calculate actual totals
  const { data: entries } = await supabase
    .from('time_entry')
    .select('duration_minutes, hourly_rate, is_billable, milestone_id')
    .eq('project_id', projectId)

  const allEntries = entries || []
  const totalMinutes = allEntries.reduce((sum: number, e: { duration_minutes: number }) => sum + (e.duration_minutes || 0), 0)
  const actualHours = totalMinutes / 60
  const actualAmount = allEntries.reduce((sum: number, e: { duration_minutes: number; hourly_rate: number }) => {
    return sum + ((e.duration_minutes || 0) / 60) * (e.hourly_rate || 0)
  }, 0)

  // Update progress based on budget utilization
  let newProgress = project.progress_percent
  if (project.budget_hours && project.budget_hours > 0) {
    newProgress = Math.min(100, Math.round((actualHours / project.budget_hours) * 100))
  }

  // Check milestones progress
  const { data: milestones } = await supabase
    .from('project_milestone')
    .select('milestone_id, budget_hours, status')
    .eq('project_id', projectId)

  if (milestones && milestones.length > 0) {
    // Calculate milestone-based progress
    const completed = milestones.filter((m: { status: string }) => m.status === 'completed').length
    const milestoneProgress = Math.round((completed / milestones.length) * 100)
    // Use the higher of budget-based and milestone-based progress
    newProgress = Math.max(newProgress, milestoneProgress)

    // Check if any milestone's hours are met (auto-detect near-completion)
    for (const ms of milestones) {
      if (ms.status !== 'pending' && ms.status !== 'in_progress') continue
      if (!ms.budget_hours || ms.budget_hours <= 0) continue

      const msEntries = allEntries.filter((e: { milestone_id: string }) => e.milestone_id === ms.milestone_id)
      const msMinutes = msEntries.reduce((sum: number, e: { duration_minutes: number }) => sum + (e.duration_minutes || 0), 0)
      const msHours = msMinutes / 60
      const msProgress = Math.round((msHours / ms.budget_hours) * 100)

      // Update milestone AI progress
      await supabase
        .from('project_milestone')
        .update({ ai_progress_percent: Math.min(100, msProgress) })
        .eq('milestone_id', ms.milestone_id)
    }
  }

  // Update project progress
  const updates: Record<string, unknown> = {
    progress_percent: newProgress,
    updated_at: new Date().toISOString(),
  }

  await supabase
    .from('project')
    .update(updates)
    .eq('project_id', projectId)

  // Budget warnings
  if (project.budget_hours && project.budget_hours > 0) {
    const utilization = actualHours / project.budget_hours

    if (utilization >= 1.0) {
      // Budget exceeded
      await createNotification({
        businessId,
        type: 'escalation',
        title: `Timbudget överskriden: ${project.name}`,
        message: `${Math.round(actualHours)}h av ${project.budget_hours}h budgeterade (${Math.round(utilization * 100)}%)`,
        icon: 'alert-triangle',
        link: `/dashboard/projects/${projectId}`,
        metadata: { project_id: projectId, ai_action: 'budget_exceeded' },
      })

      await logAiAction(businessId, projectId, 'time_logged', 'Timbudget överskriden — varning skickad', {
        actual_hours: Math.round(actualHours * 100) / 100,
        budget_hours: project.budget_hours,
        utilization: Math.round(utilization * 100),
      })
    } else if (utilization >= 0.8) {
      // Approaching budget — only warn once (check existing log)
      const { data: existingWarning } = await supabase
        .from('project_ai_log')
        .select('id')
        .eq('project_id', projectId)
        .eq('event_type', 'time_logged')
        .like('action', '%80%%')
        .limit(1)

      if (!existingWarning || existingWarning.length === 0) {
        await createNotification({
          businessId,
          type: 'system',
          title: `Nära timbudget: ${project.name}`,
          message: `${Math.round(actualHours)}h av ${project.budget_hours}h (${Math.round(utilization * 100)}%)`,
          icon: 'clock',
          link: `/dashboard/projects/${projectId}`,
          metadata: { project_id: projectId, ai_action: 'budget_warning_80' },
        })

        await logAiAction(businessId, projectId, 'time_logged', '80% av timbudget nådd — varning skickad', {
          actual_hours: Math.round(actualHours * 100) / 100,
          budget_hours: project.budget_hours,
        })
      }
    }
  }
}

// ── Event: Milestone Completed → Progress + Suggestion ───────

async function onMilestoneCompleted(businessId: string, projectId: string, milestoneId: string): Promise<void> {
  const supabase = getServerSupabase()

  // Fetch all milestones
  const { data: milestones } = await supabase
    .from('project_milestone')
    .select('milestone_id, name, status')
    .eq('project_id', projectId)

  if (!milestones || milestones.length === 0) return

  const completed = milestones.filter((m: { status: string }) => m.status === 'completed')
  const completedMilestone = milestones.find((m: { milestone_id: string }) => m.milestone_id === milestoneId)
  const remaining = milestones.length - completed.length

  // Fetch project name
  const { data: project } = await supabase
    .from('project')
    .select('name')
    .eq('project_id', projectId)
    .single()

  const projectName = project?.name || 'Projekt'

  await logAiAction(businessId, projectId, 'milestone_completed', `Delmoment "${completedMilestone?.name}" klart`, {
    milestone_id: milestoneId,
    completed_count: completed.length,
    total_count: milestones.length,
    remaining,
  })

  if (remaining === 0) {
    // All milestones done — suggest completing project
    await createNotification({
      businessId,
      type: 'system',
      title: `Alla delmoment klara: ${projectName}`,
      message: 'Alla delmoment är avslutade. Överväg att markera projektet som klart.',
      icon: 'check-circle',
      link: `/dashboard/projects/${projectId}`,
      metadata: { project_id: projectId, ai_action: 'all_milestones_complete' },
    })

    await logAiAction(businessId, projectId, 'milestone_completed', 'Alla delmoment klara — förslag att avsluta projekt', {})
  } else {
    await createNotification({
      businessId,
      type: 'system',
      title: `Delmoment klart: ${completedMilestone?.name || ''}`,
      message: `${completed.length}/${milestones.length} delmoment klara i ${projectName}`,
      icon: 'check-circle',
      link: `/dashboard/projects/${projectId}`,
      metadata: { project_id: projectId, ai_action: 'milestone_complete' },
    })
  }
}

// ── Event: Invoice Paid → Project Closure Check ──────────────

async function onInvoicePaid(businessId: string, invoiceId: string): Promise<void> {
  const supabase = getServerSupabase()

  // Find invoice with quote_id to find project
  const { data: invoice } = await supabase
    .from('invoice')
    .select('invoice_id, quote_id, customer_id, total')
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .single()

  if (!invoice) return

  // Find project by quote_id or by direct match
  let project: { project_id: string; name: string; status: string } | null = null

  if (invoice.quote_id) {
    const { data } = await supabase
      .from('project')
      .select('project_id, name, status')
      .eq('quote_id', invoice.quote_id)
      .eq('business_id', businessId)
      .single()
    project = data
  }

  if (!project) return
  if (project.status === 'completed' || project.status === 'cancelled') return

  // Check if all time entries for the project are invoiced
  const { data: uninvoiced } = await supabase
    .from('time_entry')
    .select('time_entry_id')
    .eq('project_id', project.project_id)
    .eq('invoiced', false)
    .eq('is_billable', true)
    .limit(1)

  const allInvoiced = !uninvoiced || uninvoiced.length === 0

  // Check milestones
  const { data: milestones } = await supabase
    .from('project_milestone')
    .select('status')
    .eq('project_id', project.project_id)

  const allMilestonesDone = milestones
    ? milestones.every((m: { status: string }) => m.status === 'completed')
    : true

  if (allInvoiced && allMilestonesDone) {
    // Suggest closing the project
    await createNotification({
      businessId,
      type: 'system',
      title: `Projekt redo att avslutas: ${project.name}`,
      message: 'Faktura betald, alla timmar fakturerade och delmoment klara.',
      icon: 'check-circle',
      link: `/dashboard/projects/${project.project_id}`,
      metadata: { project_id: project.project_id, ai_action: 'ready_to_close' },
    })

    await logAiAction(businessId, project.project_id, 'invoice_paid', 'Faktura betald + allt fakturerat — föreslår projektavslut', {
      invoice_id: invoiceId,
      total: invoice.total,
    })
  } else {
    await logAiAction(businessId, project.project_id, 'invoice_paid', 'Faktura betald — projekt har kvarvarande arbete', {
      invoice_id: invoiceId,
      all_invoiced: allInvoiced,
      all_milestones_done: allMilestonesDone,
    })
  }
}

// ── Event: Daily Health Check ────────────────────────────────

async function onDailyHealthCheck(businessId: string, projectId: string): Promise<void> {
  const supabase = getServerSupabase()

  // Fetch project
  const { data: project } = await supabase
    .from('project')
    .select('project_id, name, budget_hours, budget_amount, progress_percent, start_date, end_date, status')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .single()

  if (!project || project.status === 'completed' || project.status === 'cancelled') return

  // Fetch time entries
  const { data: entries } = await supabase
    .from('time_entry')
    .select('duration_minutes, hourly_rate, work_date')
    .eq('project_id', projectId)
    .order('work_date', { ascending: false })

  const allEntries = entries || []
  const totalMinutes = allEntries.reduce((sum: number, e: { duration_minutes: number }) => sum + (e.duration_minutes || 0), 0)
  const actualHours = totalMinutes / 60
  const actualAmount = allEntries.reduce((sum: number, e: { duration_minutes: number; hourly_rate: number }) => {
    return sum + ((e.duration_minutes || 0) / 60) * (e.hourly_rate || 0)
  }, 0)

  // Calculate days since last activity
  let daysSinceLastActivity = 999
  if (allEntries.length > 0) {
    const lastDate = new Date(allEntries[0].work_date)
    daysSinceLastActivity = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Fetch milestones
  const { data: milestones } = await supabase
    .from('project_milestone')
    .select('status')
    .eq('project_id', projectId)

  const milestonesTotal = milestones?.length || 0
  const milestonesCompleted = milestones?.filter((m: { status: string }) => m.status === 'completed').length || 0

  // Calculate health
  const { score, issues } = calculateHealthScore({
    budgetHours: project.budget_hours,
    actualHours,
    budgetAmount: project.budget_amount,
    actualAmount,
    endDate: project.end_date,
    startDate: project.start_date,
    milestonesTotal,
    milestonesCompleted,
    daysSinceLastActivity,
    progressPercent: project.progress_percent,
  })

  // Build summary
  let summary = 'Projektet är på rätt spår'
  if (issues.length > 0) {
    summary = issues.join('. ')
  }
  if (score >= 80) summary = 'Bra — ' + summary
  else if (score >= 50) summary = 'Varning — ' + summary
  else summary = 'Kritiskt — ' + summary

  // Update project
  await supabase
    .from('project')
    .update({
      ai_health_score: score,
      ai_health_summary: summary,
      ai_last_analyzed_at: new Date().toISOString(),
    })
    .eq('project_id', projectId)

  // Alert on critical projects
  if (score < 50) {
    await createNotification({
      businessId,
      type: 'escalation',
      title: `Projekt kräver uppmärksamhet: ${project.name}`,
      message: summary,
      icon: 'alert-triangle',
      link: `/dashboard/projects/${projectId}`,
      metadata: { project_id: projectId, ai_action: 'health_critical', score },
    })
  }

  await logAiAction(businessId, projectId, 'daily_health_check', `Hälsopoäng: ${score}/100`, {
    score,
    issues,
    actual_hours: Math.round(actualHours * 100) / 100,
    actual_amount: Math.round(actualAmount),
    days_since_activity: daysSinceLastActivity,
  })
}

// ── Exported Utilities ───────────────────────────────────────

export { logAiAction, calculateHealthScore }
