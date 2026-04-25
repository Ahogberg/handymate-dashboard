'use client'

import { useBusiness } from '@/lib/BusinessContext'

/**
 * Identitets-pill ovanför dashboard-rubriken: Handymate H-badge + företagsnamn.
 * Subtil bekräftelse på vilken verksamhet som är inloggad — matchar sidebarens
 * varumärkesmärke uppe till vänster.
 */
export default function IdentityPill() {
  const business = useBusiness()

  return (
    <div className="inline-flex items-center gap-2 pl-1 pr-3 py-1 bg-white border border-[#E2E8F0] rounded-full mb-3 shadow-sm">
      <span className="w-6 h-6 rounded-full bg-primary-700 text-white text-[11px] font-bold flex items-center justify-center">
        H
      </span>
      <span className="text-xs font-semibold text-gray-800 truncate max-w-[200px]">
        {business.business_name}
      </span>
    </div>
  )
}
