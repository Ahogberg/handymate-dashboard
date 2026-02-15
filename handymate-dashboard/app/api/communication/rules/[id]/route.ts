import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const body = await request.json()
    const supabase = getServerSupabase()

    // Get the rule to check ownership
    const { data: rule } = await supabase
      .from('communication_rule')
      .select('*')
      .eq('id', id)
      .single()

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    // System rules: can only toggle is_enabled or update message_template
    if (rule.is_system) {
      // Create a business-specific override if it doesn't exist
      if (!rule.business_id) {
        const { data: override, error } = await supabase
          .from('communication_rule')
          .insert({
            business_id: business.business_id,
            name: rule.name,
            description: rule.description,
            trigger_type: rule.trigger_type,
            trigger_config: rule.trigger_config,
            message_template: body.message_template || rule.message_template,
            channel: rule.channel,
            is_enabled: body.is_enabled !== undefined ? body.is_enabled : rule.is_enabled,
            is_system: true,
            sort_order: rule.sort_order,
          })
          .select()
          .single()

        if (error) throw error
        return NextResponse.json(override)
      }
    }

    // Own rules or business overrides: can update everything
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.message_template !== undefined) updates.message_template = body.message_template
    if (body.is_enabled !== undefined) updates.is_enabled = body.is_enabled
    if (body.trigger_config !== undefined) updates.trigger_config = body.trigger_config
    if (body.channel !== undefined) updates.channel = body.channel

    const { data, error } = await supabase
      .from('communication_rule')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const supabase = getServerSupabase()

    // Can only delete own rules, not system rules without business_id
    const { data: rule } = await supabase
      .from('communication_rule')
      .select('business_id, is_system')
      .eq('id', id)
      .single()

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    if (!rule.business_id) {
      return NextResponse.json({ error: 'Cannot delete system rules' }, { status: 403 })
    }

    if (rule.business_id !== business.business_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabase
      .from('communication_rule')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
