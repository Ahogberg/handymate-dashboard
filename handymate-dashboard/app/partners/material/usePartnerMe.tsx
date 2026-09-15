'use client'

// Delad partnerhämtning för säljmaterialsidorna (2026-09-07).
// Materialet är portalinnehåll: kräver inloggad partner, och förifyller
// partnerns namn + referrallänk i deck och leave-behind — det som i
// Design-filerna var manuella props.
//
// AVTALSGRINDEN LIGGER HÄR (2026-09-15, Andreas). Portalens startsida har
// haft den sedan 2026-09-01, men materialsidorna nåddes på sin adress med
// bara en inloggning. Det biter den dagen AGREEMENT_VERSION höjs: då blir
// alla befintliga partners icke-aktuella på en gång, och en partner utan
// gällande avtal kan inte få provision — claimPartnerAttribution avvisar
// koden med agreement_not_current. Då ska materialet inte gå att använda
// som om ingenting hänt.
//
// Grinden returneras som en färdig nod i stället för en flagga, så varje
// sida lägger till en (1) rad och logiken bor på ett enda ställe.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AgreementGate from '../components/AgreementGate'

export interface MaterialPartner {
  id: string
  name: string
  company: string | null
  email: string
  referral_code: string
  referral_url: string | null
  /** Härlett av servern: partnern har inte accepterat den version som gäller nu. */
  agreement_required?: boolean
  /** Versionen som gäller nu, enligt servern — aldrig hårdkodad i klienten. */
  current_agreement_version?: string
}

export function usePartnerMe() {
  const router = useRouter()
  const [partner, setPartner] = useState<MaterialPartner | null>(null)
  const [loading, setLoading] = useState(true)

  const hamta = useCallback(async () => {
    try {
      const res = await fetch('/api/partners/me')
      if (res.status === 401) {
        router.push('/partners/login')
        return
      }
      const data = await res.json()
      setPartner(data.partner || null)
    } catch {
      router.push('/partners/login')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    hamta()
  }, [hamta])

  const referralUrl = partner
    ? partner.referral_url || `https://app.handymate.se/registrera?ref=${partner.referral_code}`
    : ''

  // Samma komponent portalens startsida visar, och samma bevis loggas —
  // acceptansen gäller överallt, oavsett var partnern råkade möta grinden.
  // onAccepted hämtar om, så sidan öppnar sig direkt efter godkännandet.
  const grind =
    partner && partner.agreement_required ? (
      <AgreementGate
        partnerName={partner.name}
        agreementVersion={partner.current_agreement_version || ''}
        onAccepted={hamta}
      />
    ) : null

  return { partner, loading, referralUrl, grind, hamta }
}
