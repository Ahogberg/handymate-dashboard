'use client'

/**
 * Två små kort på "Så ser dina kunder dig": stämpelnoten (varför
 * "Skickat via Handymate" står längst ner) och demobanderollen som bara
 * visas på demokontot (presentatörens manus för sidan).
 */
import Link from 'next/link'
import { ATTRIBUTION_BRAND, ATTRIBUTION_PREFIX } from '@/lib/branding/attribution'

export function StampNote() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-200 bg-slate-50 px-2.5 h-7 text-[12px] text-slate-600 whitespace-nowrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="w-4 h-4 rounded-sm" />
        {ATTRIBUTION_PREFIX}<span className="text-teal-700 font-medium">{ATTRIBUTION_BRAND}</span>
      </span>
      <p className="text-[12px] text-slate-600 leading-snug flex-1">
        Raden står längst ner i allt vi skickar åt dig. Den är länkad: en kund som klickar och själv blir Handymate-kund ger dig provision.{' '}
        <Link href="/dashboard/referral" className="text-teal-700 font-medium hover:underline whitespace-nowrap">Om partnerprogrammet</Link>
      </p>
    </div>
  )
}

export function DemoBanner({ onHide }: { onHide: () => void }) {
  return (
    <div className="rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: '#0f172a' }}>
      <span className="self-start rounded-full border border-teal-300 text-teal-300 px-2.5 h-6 inline-flex items-center text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap">
        Demokonto
      </span>
      <p className="text-[12px] text-slate-200 leading-snug flex-1">
        Byt färg eller logotyp och låt kunden se alla sju uppdateras. Tryck på offertsidan för stor vy. Stämpeln längst ner är länkad till partnerprogrammet.
      </p>
      <button type="button" onClick={onHide} className="self-start sm:self-auto text-[12px] font-medium text-slate-300 hover:text-white">
        Dölj
      </button>
    </div>
  )
}
