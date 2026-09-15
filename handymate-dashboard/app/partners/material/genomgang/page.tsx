'use client'

// Säljgenomgången i partnerportalen (2026-09-15, Andreas: "lägg in bland
// materialet som ingår som partner").
//
// Tredje monteringsplatsen för SAMMA komponent som /admin/sales och
// /case/<token>. Ingen kopia: partnern ska se exakt den genomgång vi själva
// kör, annars driver materialet isär från produkten vid första ändringen.
//
// showSalesSession={true} — partnern ÄR säljaren här. Det är hela poängen
// med sidan: kan partnern inte spara ett case kan hen inte heller lämna
// ifrån sig en länk som bär den egna hänvisningskoden, och då gör partnern
// jobbet medan affären blir oattribuerad (Andreas 2026-09-15). POST
// /api/sales-case läser koden ur partnerns EGEN rad, aldrig ur anropet.

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { usePartnerMe } from '../usePartnerMe'

const SalesExperience = dynamic(
  () => import('@/components/sales/sales-experience.generated'),
  { ssr: false, loading: () => <p className="p-6 text-slate-500">Öppnar genomgången…</p> },
)

export default function PartnerGenomgang() {
  // Samma grind som resten av säljmaterialet: 401 skickar till inloggningen.
  const { partner, loading } = usePartnerMe()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-5 h-5 animate-spin text-primary-700" />
      </div>
    )
  }
  if (!partner) return null

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-5">
        <Link
          href="/partners/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-primary-700 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Tillbaka till portalen
        </Link>
      </div>
      <SalesExperience showSalesSession={true} />
    </div>
  )
}
