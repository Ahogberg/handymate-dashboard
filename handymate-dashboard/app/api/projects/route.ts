import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getNextProjectNumber, bumpCounter } from '@/lib/numbering'

/**
 * GET - Lista projekt för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const status = request.nextUrl.searchParams.get('status')
    const customerId = request.nextUrl.searchParams.get('customerId')

    let query = supabase
      .from('project')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      if (status === 'active') {
        query = query.in('status', ['planning', 'active'])
      } else {
        query = query.eq('status', status)
      }
    }

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data: projects, error } = await query

    if (error) throw error

    // Fetch actual hours and amounts for each project
    const projectIds = (projects || []).map((p: any) => p.project_id)

    let timeData: any[] = []
    if (projectIds.length > 0) {
      const { data } = await supabase
        .from('time_entry')
        .select('project_id, duration_minutes, hourly_rate, is_billable, invoiced')
        .in('project_id', projectIds)

      timeData = data || []
    }

    // Fetch next milestone deadline per project
    let milestoneData: any[] = []
    if (projectIds.length > 0) {
      const { data } = await supabase
        .from('project_milestone')
        .select('project_id, due_date, status')
        .in('project_id', projectIds)
        .neq('status', 'completed')
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })

      milestoneData = data || []
    }

    // Fetch customer names for projects
    const customerIds = Array.from(new Set((projects || []).map((p: any) => p.customer_id).filter(Boolean)))
    let customerMap: Record<string, { customer_id: string; name: string; phone_number?: string; email?: string }> = {}
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, email')
        .in('customer_id', customerIds)
      for (const c of (customers || [])) {
        customerMap[c.customer_id] = c
      }
    }

    // Hämta jobbtyper för business — används för badge-färg/namn på projekt-
    // listans rader. Frontend joinar lokalt via slug.
    const { data: jobTypesData } = await supabase
      .from('job_types')
      .select('id, name, slug, color, icon')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    const enrichedProjects = (projects || []).map((project: any) => {
      const entries = timeData.filter((t: any) => t.project_id === project.project_id)
      const actual_minutes = entries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
      const actual_amount = entries.reduce((sum: number, e: any) => {
        const hours = (e.duration_minutes || 0) / 60
        return sum + (hours * (e.hourly_rate || 0))
      }, 0)
      const uninvoiced_minutes = entries
        .filter((e: any) => !e.invoiced && e.is_billable)
        .reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)

      const nextDeadline = milestoneData.find((m: any) => m.project_id === project.project_id)

      return {
        ...project,
        customer: project.customer_id ? customerMap[project.customer_id] || null : null,
        actual_hours: Math.round(actual_minutes / 60 * 100) / 100,
        actual_amount: Math.round(actual_amount),
        uninvoiced_hours: Math.round(uninvoiced_minutes / 60 * 100) / 100,
        next_deadline: nextDeadline?.due_date || null
      }
    })

    return NextResponse.json({
      projects: enrichedProjects,
      job_types: jobTypesData || [],
    })

  } catch (error: any) {
    console.error('Get projects error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa nytt projekt (manuellt eller från offert)
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const businessId = business.business_id

    let projectData: any = {
      business_id: businessId,
      name: body.name,
      description: body.description || null,
      customer_id: body.customer_id || null,
      project_type: body.project_type || 'hourly',
      status: body.status || 'planning',
      budget_hours: body.budget_hours || null,
      budget_amount: body.budget_amount || null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      job_type: body.job_type || null,
    }

    // Spåra ev. deal som projektet kommer från (via offert eller direkt) —
    // används för att projektnumret ska matcha deal-numret.
    let dealNumber: number | null = null
    let dealTitle: string | null = null
    let dealIdForLink: string | null = null

    // Create from quote
    if (body.from_quote_id) {
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('quote_id', body.from_quote_id)
        .eq('business_id', businessId)
        .single()

      if (quoteError || !quote) {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
      }

      projectData.quote_id = quote.quote_id
      projectData.customer_id = quote.customer_id

      // Hämta dealen som offerten tillhör (via quotes.deal_id) — så projektet
      // ärver samma ärende-nummer och kan falla tillbaka på deal-titeln.
      if (quote.deal_id) {
        const { data: deal } = await supabase
          .from('deal')
          .select('id, deal_number, title, job_type')
          .eq('id', quote.deal_id)
          .eq('business_id', businessId)
          .maybeSingle()
        if (deal) {
          dealNumber = deal.deal_number ?? null
          dealTitle = deal.title ?? null
          dealIdForLink = deal.id
          // Ärva jobbtyp från deal om body inte överrider
          if (!projectData.job_type && deal.job_type) {
            projectData.job_type = deal.job_type
          }
        }
      }

      // Titel-prio: 1) explicit i body, 2) offerttitel, 3) deal-titel, 4) fallback
      projectData.name = projectData.name || quote.title || dealTitle || `Projekt från offert`

      // Calculate budget from quote
      const items = quote.items || []
      const laborHours = items
        .filter((i: any) => i.type === 'labor')
        .reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)

      const totalAmount = items.reduce((sum: number, i: any) => sum + (i.total || 0), 0)

      projectData.budget_hours = projectData.budget_hours || laborHours || null
      projectData.budget_amount = projectData.budget_amount || totalAmount || null

      // Determine project type
      if (laborHours > 0 && items.some((i: any) => i.type === 'material')) {
        projectData.project_type = 'mixed'
      } else if (laborHours > 0) {
        projectData.project_type = 'hourly'
      } else {
        projectData.project_type = 'fixed_price'
      }
    }

    // Direktkoppling till deal (om anroparen skickar from_deal_id)
    if (body.from_deal_id && !dealIdForLink) {
      const { data: deal } = await supabase
        .from('deal')
        .select('id, deal_number, title, customer_id, description, value, job_type')
        .eq('id', body.from_deal_id)
        .eq('business_id', businessId)
        .maybeSingle()
      if (deal) {
        dealNumber = deal.deal_number ?? null
        dealTitle = deal.title ?? null
        dealIdForLink = deal.id
        projectData.customer_id = projectData.customer_id || deal.customer_id || null
        projectData.name = projectData.name || deal.title || `Projekt`
        projectData.description = projectData.description || deal.description || null
        projectData.budget_amount = projectData.budget_amount || deal.value || null
        if (!projectData.job_type && deal.job_type) {
          projectData.job_type = deal.job_type
        }
      }
    }

    if (dealIdForLink) {
      projectData.deal_id = dealIdForLink
    }

    if (!projectData.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Tilldela projektnummer. Om projektet kommer från en deal: använd dealens
    // nummer (P-{deal_number}) så att hantverkaren ser samma ärende-id i hela
    // flödet. Annars: dra nästa nummer ur den delade case-räknaren.
    let projectNumber: string | null = null
    try {
      if (dealNumber) {
        projectNumber = `P-${dealNumber}`
        // Synka räknaren — får aldrig ge ut samma nummer igen
        await bumpCounter(supabase, businessId, 'project', dealNumber)
      } else {
        projectNumber = await getNextProjectNumber(supabase, businessId)
      }
      projectData.project_number = projectNumber
    } catch {
      // Kolumnen kanske inte finns — skippa
    }

    let project: any = null
    let insertError: any = null

    // Försök med project_number
    const result1 = await supabase
      .from('project')
      .insert(projectData)
      .select('*')
      .single()

    if (result1.error && projectNumber) {
      // Om felet beror på project_number-kolumnen, försök utan den
      console.warn('Project insert failed with project_number, retrying without:', result1.error.message)
      delete projectData.project_number
      const result2 = await supabase
        .from('project')
        .insert(projectData)
        .select('*')
        .single()
      project = result2.data
      insertError = result2.error
    } else {
      project = result1.data
      insertError = result1.error
    }

    if (insertError) {
      console.error('Project insert error:', insertError)
      return NextResponse.json({ error: insertError.message || 'Kunde inte skapa projekt' }, { status: 500 })
    }

    // If from quote, create milestones from quote items
    if (body.from_quote_id && body.create_milestones !== false) {
      const { data: quote } = await supabase
        .from('quotes')
        .select('items')
        .eq('quote_id', body.from_quote_id)
        .single()

      if (quote?.items && Array.isArray(quote.items)) {
        const laborItems = quote.items.filter((i: any) => i.type === 'labor')
        if (laborItems.length > 1) {
          const milestones = laborItems.map((item: any, idx: number) => ({
            business_id: businessId,
            project_id: project.project_id,
            name: item.name || item.description || `Moment ${idx + 1}`,
            budget_hours: item.quantity || null,
            budget_amount: item.total || null,
            sort_order: idx,
            status: 'pending'
          }))

          await supabase.from('project_milestone').insert(milestones)
        }
      }
    }

    return NextResponse.json({ project })

  } catch (error: any) {
    console.error('Create project error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera projekt
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { project_id } = body

    if (!project_id) {
      return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.project_type !== undefined) updates.project_type = body.project_type
    if (body.status !== undefined) {
      // 4-eyes check för projektstängning
      if (body.status === 'completed') {
        const { data: fourEyesConfig } = await supabase
          .from('business_config')
          .select('four_eyes_enabled, four_eyes_threshold_sek')
          .eq('business_id', business.business_id)
          .single()

        const projectValue = body.budget_amount || 0
        // Hämta befintligt projektvärde om inte i body
        if (!projectValue) {
          const { data: existingProject } = await supabase
            .from('project')
            .select('budget_amount')
            .eq('project_id', project_id)
            .single()
          if (existingProject) {
            const pVal = existingProject.budget_amount || 0
            if (
              fourEyesConfig?.four_eyes_enabled &&
              pVal >= (fourEyesConfig.four_eyes_threshold_sek || 50000)
            ) {
              const approvalId = `appr_4e_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
              await supabase.from('pending_approvals').insert({
                id: approvalId,
                business_id: business.business_id,
                approval_type: 'four_eyes_project_close',
                title: `Projektstängning kräver godkännande — ${pVal.toLocaleString('sv-SE')} kr`,
                description: `Projektets värde överstiger gränsen på ${(fourEyesConfig.four_eyes_threshold_sek || 50000).toLocaleString('sv-SE')} kr.`,
                payload: { project_id, budget_amount: pVal, threshold: fourEyesConfig.four_eyes_threshold_sek },
                status: 'pending',
                risk_level: 'high',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              })

              return NextResponse.json({
                requires_approval: true,
                approval_id: approvalId,
                message: `Projektstängning kräver admin-godkännande (${pVal.toLocaleString('sv-SE')} kr)`,
              })
            }
          }
        }

        updates.completed_at = new Date().toISOString()
      }
      if (body.status === 'active' || body.status === 'planning') {
        updates.completed_at = null
      }
    }
    if (body.budget_hours !== undefined) updates.budget_hours = body.budget_hours
    if (body.budget_amount !== undefined) updates.budget_amount = body.budget_amount
    if (body.progress_percent !== undefined) updates.progress_percent = body.progress_percent
    if (body.start_date !== undefined) updates.start_date = body.start_date
    if (body.end_date !== undefined) updates.end_date = body.end_date
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id

    const { data: project, error } = await supabase
      .from('project')
      .update(updates)
      .eq('project_id', project_id)
      .eq('business_id', business.business_id)
      .select('*')
      .single()

    if (error) throw error

    // Project workflow stage: 'Jobb påbörjat' när status blir 'active'
    if (body.status === 'active' && project) {
      try {
        const { advanceProjectStage, SYSTEM_STAGES } = await import('@/lib/project-stages/automation-engine')
        await advanceProjectStage(project.project_id, SYSTEM_STAGES.JOB_STARTED, business.business_id)
      } catch (err) {
        console.error('[projects] advanceProjectStage failed:', err)
      }
    }

    // Project workflow stage: 'Slutbesiktning' när status blir 'completed'
    if (body.status === 'completed' && project) {
      try {
        const { advanceProjectStage, SYSTEM_STAGES } = await import('@/lib/project-stages/automation-engine')
        await advanceProjectStage(project.project_id, SYSTEM_STAGES.FINAL_INSPECTION, business.business_id)
      } catch (err) {
        console.error('[projects] advanceProjectStage failed:', err)
      }
    }

    // Fire job_completed event → triggar review request + nurture
    if (body.status === 'completed' && project) {
      try {
        const { fireEvent } = await import('@/lib/automation-engine')
        await fireEvent(supabase, 'job_completed', business.business_id, {
          project_id: project.project_id,
          customer_id: project.customer_id,
          project_name: project.name,
        })
      } catch { /* non-blocking */ }

      // Auto-faktura vid projektavslut
      try {
        const { autoInvoiceOnComplete } = await import('@/lib/projects/auto-invoice-on-complete')
        await autoInvoiceOnComplete(business.business_id, project.project_id)
      } catch (invoiceErr) {
        console.error('Auto-invoice on complete error (non-blocking):', invoiceErr)
      }

      // Schemalägg Google-recension 24h efter projektslut
      try {
        const { data: customer } = await supabase
          .from('customer')
          .select('name, phone_number')
          .eq('customer_id', project.customer_id)
          .single()

        const { data: config } = await supabase
          .from('business_config')
          .select('business_name, google_review_url')
          .eq('business_id', business.business_id)
          .single()

        if (customer?.phone_number && config?.google_review_url) {
          const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h from now
          await supabase.from('pending_approvals').insert({
            business_id: business.business_id,
            approval_type: 'scheduled_review_request',
            type: 'scheduled_review_request',
            title: `Recensionsförfrågan — ${customer.name}`,
            description: `Skicka Google-recensionsförfrågan till ${customer.name} för projekt "${project.name}"`,
            risk_level: 'low',
            status: 'pending',
            expires_at: scheduledAt.toISOString(),
            payload: {
              customer_id: project.customer_id,
              customer_name: customer.name,
              customer_phone: customer.phone_number,
              project_id: project.project_id,
              project_name: project.name,
              business_name: config.business_name,
              google_review_url: config.google_review_url,
            },
          })
        }
      } catch (reviewErr) {
        console.error('Review request scheduling error (non-blocking):', reviewErr)
      }

      // Flytta deal till "Slutfört" i pipeline
      try {
        const { data: linkedDeal } = await supabase
          .from('deal')
          .select('id')
          .eq('business_id', business.business_id)
          .or(`quote_id.eq.${project.quote_id},lead_id.eq.${project.lead_id}`)
          .maybeSingle()

        if (linkedDeal) {
          const { moveDeal } = await import('@/lib/pipeline')
          await moveDeal({
            dealId: linkedDeal.id,
            businessId: business.business_id,
            toStageSlug: 'invoiced',
            triggeredBy: 'system',
            aiReason: 'Projekt markerat som slutfört',
          })
        }
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({ project })

  } catch (error: any) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort projekt (bara om inga tidrapporter kopplade)
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = request.nextUrl.searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    // Check for linked time entries
    const { count } = await supabase
      .from('time_entry')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Kan inte ta bort projekt med tidrapporter' },
        { status: 400 }
      )
    }

    // Delete all child records first (order matters for FK constraints)
    await supabase.from('project_document').delete().eq('project_id', projectId)
    await supabase.from('project_log').delete().eq('order_id', projectId)
    await supabase.from('project_checklist').delete().eq('project_id', projectId)
    await supabase.from('project_assignment').delete().eq('project_id', projectId)
    await supabase.from('project_material').delete().eq('project_id', projectId)
    await supabase.from('project_milestone').delete().eq('project_id', projectId)
    await supabase.from('project_change').delete().eq('project_id', projectId)

    const { error } = await supabase
      .from('project')
      .delete()
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete project error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
