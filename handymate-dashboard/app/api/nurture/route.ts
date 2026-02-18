import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getNurtureStats, seedDefaultSequences, enrollInSequence, cancelEnrollmentsForEvent } from '@/lib/nurture'

/**
 * GET - Hämta sekvenser och statistik
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Seed defaults if no sequences exist
    await seedDefaultSequences(business.business_id)

    const [stats, { data: sequences }, { data: enrollments }] = await Promise.all([
      getNurtureStats(business.business_id),
      supabase
        .from('nurture_sequence')
        .select('*')
        .eq('business_id', business.business_id)
        .order('created_at', { ascending: true }),
      supabase
        .from('nurture_enrollment')
        .select('*, customer:customer_id(name, phone_number, email)')
        .eq('business_id', business.business_id)
        .eq('status', 'active')
        .order('next_action_at', { ascending: true })
        .limit(20),
    ])

    return NextResponse.json({
      sequences: sequences || [],
      active_enrollments: enrollments || [],
      stats,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa/uppdatera sekvens, manuell enrollment, eller avregistrering
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    const supabase = getServerSupabase()

    switch (action) {
      case 'update_sequence': {
        const { sequence_id, name, is_active, steps } = body
        if (!sequence_id) {
          return NextResponse.json({ error: 'Missing sequence_id' }, { status: 400 })
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() }
        if (name !== undefined) updates.name = name
        if (is_active !== undefined) updates.is_active = is_active
        if (steps !== undefined) updates.steps = steps

        const { data, error } = await supabase
          .from('nurture_sequence')
          .update(updates)
          .eq('id', sequence_id)
          .eq('business_id', business.business_id)
          .select()
          .single()

        if (error) throw error
        return NextResponse.json({ sequence: data })
      }

      case 'create_sequence': {
        const { name, trigger_type, steps } = body
        if (!name || !trigger_type || !steps) {
          return NextResponse.json({ error: 'Missing name, trigger_type, or steps' }, { status: 400 })
        }

        const { data, error } = await supabase
          .from('nurture_sequence')
          .insert({
            business_id: business.business_id,
            name,
            trigger_type,
            is_active: true,
            steps,
          })
          .select()
          .single()

        if (error) throw error
        return NextResponse.json({ sequence: data })
      }

      case 'enroll': {
        const { customer_id, trigger_type, deal_id } = body
        if (!customer_id || !trigger_type) {
          return NextResponse.json({ error: 'Missing customer_id or trigger_type' }, { status: 400 })
        }

        const result = await enrollInSequence({
          businessId: business.business_id,
          triggerType: trigger_type,
          customerId: customer_id,
          dealId: deal_id,
        })

        return NextResponse.json(result)
      }

      case 'cancel_enrollment': {
        const { enrollment_id, reason } = body
        if (!enrollment_id) {
          return NextResponse.json({ error: 'Missing enrollment_id' }, { status: 400 })
        }

        const { error } = await supabase
          .from('nurture_enrollment')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: reason || 'manual',
          })
          .eq('id', enrollment_id)
          .eq('business_id', business.business_id)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'cancel_for_event': {
        const { customer_id, cancel_event } = body
        if (!customer_id || !cancel_event) {
          return NextResponse.json({ error: 'Missing customer_id or cancel_event' }, { status: 400 })
        }

        const cancelled = await cancelEnrollmentsForEvent({
          businessId: business.business_id,
          customerId: customer_id,
          cancelEvent: cancel_event,
        })

        return NextResponse.json({ cancelled_count: cancelled })
      }

      case 'seed_defaults': {
        await seedDefaultSequences(business.business_id)
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort en sekvens (och avbryt dess enrollments)
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sequenceId = request.nextUrl.searchParams.get('id')
    if (!sequenceId) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Cancel all active enrollments for this sequence
    await supabase
      .from('nurture_enrollment')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'sequence_deleted',
      })
      .eq('sequence_id', sequenceId)
      .eq('business_id', business.business_id)
      .eq('status', 'active')

    // Delete the sequence
    const { error } = await supabase
      .from('nurture_sequence')
      .delete()
      .eq('id', sequenceId)
      .eq('business_id', business.business_id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
