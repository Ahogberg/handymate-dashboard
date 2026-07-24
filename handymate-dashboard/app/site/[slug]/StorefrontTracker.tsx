'use client'

import { useEffect, useRef } from 'react'

// Sidvisningsspårning för mikrosajten. Ligger i en klientkomponent (istället
// för ett fire-and-forget-fetch i server-komponenten) så att
// app/site/[slug]/page.tsx kan ISR-cachas — ett fetch-anrop utan
// cache-inställning i själva sidkomponenten tvingar annars Next.js att
// rendera sidan dynamiskt vid varje request.
export default function StorefrontTracker({ businessId }: { businessId: string }) {
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current || !businessId) return
    sent.current = true

    fetch('/api/storefront/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, event: 'page_view' }),
    }).catch(() => {})
  }, [businessId])

  return null
}
