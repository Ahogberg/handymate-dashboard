import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
const ELKS_PHONE_NUMBER = process.env.ELKS_PHONE_NUMBER || '+46766867337'

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()

    switch (action) {
      case 'send_sms': {
        const { to, message } = data
        
        const response = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: 'Handymate',
            to: to,
            message: message,
          }),
        })

        const result = await response.json()
        
        if (!response.ok) {
          throw new Error(result.message || 'Failed to send SMS')
        }

        return NextResponse.json({ success: true, smsId: result.id })
      }

      case 'initiate_call': {
        const { to } = data
        
        const response = await fetch('https://api.46elks.com/a1/calls', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: ELKS_PHONE_NUMBER,
            to: to,
            voice_start: JSON.stringify({
              connect: '+46708379552', // Ditt nummer - ändra till teknikerns nummer
            }),
          }),
        })

        const result = await response.json()
        
        if (!response.ok) {
          throw new Error(result.message || 'Failed to initiate call')
        }

        return NextResponse.json({ success: true, callId: result.id })
      }

      case 'mark_resolved': {
        const { queueId, notes } = data
        
        const { error } = await supabase
          .from('human_followup_queue')
          .update({
            resolved_at: new Date().toISOString(),
            resolution_notes: notes || 'Markerad som klar',
          })
          .eq('queue_id', queueId)

        if (error) throw error

        return NextResponse.json({ success: true })
      }

      case 'update_case_status': {
        const { caseId, status } = data
        
        const { error } = await supabase
          .from('case_record')
          .update({
            status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('case_id', caseId)

        if (error) throw error

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Action error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
