'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { supabase } from '@/lib/supabase'

/**
 * Liten pill ovanför dashboard-rubriken som visar företagsnamn + logo.
 * Ger ägaren en snabb identitetsbekräftelse: "det här är din verksamhet".
 */
export default function IdentityPill() {
  const business = useBusiness()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!business.business_id) return
    supabase
      .from('business_config')
      .select('logo_url')
      .eq('business_id', business.business_id)
      .maybeSingle()
      .then(({ data }: { data: { logo_url: string | null } | null }) => {
        if (data?.logo_url) setLogoUrl(data.logo_url)
      })
  }, [business.business_id])

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-full mb-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={business.business_name}
          className="w-5 h-5 rounded-full object-cover"
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
          <Building2 className="w-3 h-3 text-primary-700" />
        </div>
      )}
      <span className="text-xs font-medium text-gray-700">{business.business_name}</span>
    </div>
  )
}
