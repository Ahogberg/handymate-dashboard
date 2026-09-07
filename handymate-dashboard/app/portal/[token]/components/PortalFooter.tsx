'use client'

import type { PortalData } from '../types'
import PortalHandymateAttribution from './PortalHandymateAttribution'

/**
 * Portalens sidfot (portalens beslutskort, Design 2026-09-07): firman som
 * avsändare — namn, org.nr, F-skatt, telefon, e-post — och därunder
 * "Skickat via Handymate"-stämpeln som en pill. Samma fot under ÄTA,
 * faktura och omdöme så kunden alltid vet vem hen har att göra med.
 */
export default function PortalFooter({
  business,
  attribution,
}: {
  business: PortalData['business']
  attribution?: PortalData['attribution']
}) {
  const firmLine = [
    business.orgNumber ? `Org.nr ${business.orgNumber}` : null,
    business.fSkatt ? 'Godkänd för F-skatt' : null,
  ].filter(Boolean)
  const contactLine = [business.phone, business.email].filter(Boolean)

  return (
    <div className="bp-footer">
      <div>
        <strong>{business.name}</strong>
        {firmLine.map(x => <span key={x}> · {x}</span>)}
      </div>
      {contactLine.length > 0 && <div>{contactLine.join(' · ')}</div>}
      <PortalHandymateAttribution attribution={attribution} />
    </div>
  )
}
