'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * /dashboard/calls → /dashboard/inkorg (2026-08-09).
 *
 * Den här sidan var en flikbehållare (Inbox · E-post · Samtalshistorik) som
 * aldrig fanns i sidomenyn. Inkorgen ersätter den och lägger till SMS, så att
 * allt som kommer in bor på ett ställe.
 *
 * Sidan finns kvar som omdirigering i stället för att tas bort — bokmärken och
 * gamla djuplänkar ska inte dö. `?tab=`-värdet följer med; Inkorgen översätter
 * de gamla nycklarna (inbox/email/history) till sina egna.
 */
export default function CallsRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const tab = searchParams?.get('tab')
    router.replace(tab ? `/dashboard/inkorg?tab=${encodeURIComponent(tab)}` : '/dashboard/inkorg')
  }, [router, searchParams])

  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
    </div>
  )
}
