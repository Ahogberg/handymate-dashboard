import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import {
  sendPortalNotification,
  type PortalNotificationEvent,
} from '@/lib/portal/notification-emails'

const VALID_EVENTS: PortalNotificationEvent[] = [
  'new_message',
  'quote_sent',
  'invoice_sent',
  'invoice_paid',
  'invoice_overdue',
  'project_update',
  'photos_added',
  'review_request',
]

/**
 * Dev-test endpoint för portal-notifikationer.
 *
 * POST /api/test/portal-notification
 * Body:
 *   {
 *     "customerId": "cust_xxx",
 *     "event": "new_message" | "quote_sent" | ...,
 *     "context": { ... },           // optional
 *     "skipDedup": true              // optional (kringgå 1h-spärr för testning)
 *   }
 *
 * Kräver inloggning. Använder den inloggade användarens business_id.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { customerId, event, context, skipDedup } = body || {}

    if (!customerId || typeof customerId !== 'string') {
      return NextResponse.json({ error: 'customerId krävs' }, { status: 400 })
    }

    if (!event || !VALID_EVENTS.includes(event)) {
      return NextResponse.json({
        error: 'Ogiltigt event',
        valid_events: VALID_EVENTS,
      }, { status: 400 })
    }

    const result = await sendPortalNotification(
      business.business_id,
      customerId,
      event as PortalNotificationEvent,
      {
        context: context && typeof context === 'object' ? context : {},
        skipDedup: !!skipDedup,
      }
    )

    return NextResponse.json({
      ok: result.success,
      ...result,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Serverfel' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Skicka POST med customerId + event för att testa portal-notifikationer.',
    valid_events: VALID_EVENTS,
    example: {
      customerId: 'cust_xxx',
      event: 'new_message',
      context: { preview: 'Hej, ville bara höra om ni hinner förbi imorgon?' },
      skipDedup: true,
    },
  })
}
