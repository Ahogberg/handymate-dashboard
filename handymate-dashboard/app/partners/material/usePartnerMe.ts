'use client'

// Delad partnerhämtning för säljmaterialsidorna (2026-09-07).
// Materialet är portalinnehåll: kräver inloggad partner, och förifyller
// partnerns namn + referrallänk i deck och leave-behind — det som i
// Design-filerna var manuella props.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface MaterialPartner {
  id: string
  name: string
  company: string | null
  email: string
  referral_code: string
  referral_url: string | null
}

export function usePartnerMe() {
  const router = useRouter()
  const [partner, setPartner] = useState<MaterialPartner | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/partners/me')
        if (res.status === 401) {
          router.push('/partners/login')
          return
        }
        const data = await res.json()
        if (!cancelled) setPartner(data.partner || null)
      } catch {
        router.push('/partners/login')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const referralUrl = partner
    ? partner.referral_url || `https://app.handymate.se/registrera?ref=${partner.referral_code}`
    : ''

  return { partner, loading, referralUrl }
}
