'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function RegistreraContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const ref = searchParams?.get('ref')
    const via = searchParams?.get('via')
    const qs = new URLSearchParams()
    if (ref) qs.set('ref', ref)
    // Företagsskannern-handoff (tasks/plan-foretagsskannern.md): ?via=skanner
    // måste följa med in i /onboarding — sidan läser den vid mount för att
    // stämpla rätt tratt-variant.
    if (via) qs.set('via', via)
    const target = qs.toString() ? `/onboarding?${qs.toString()}` : '/onboarding'
    router.replace(target)
  }, [router, searchParams])

  return (
    <div className="text-zinc-500">Omdirigerar...</div>
  )
}

export default function RegistreraPage() {
  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <Suspense fallback={<div className="text-zinc-500">Omdirigerar...</div>}>
        <RegistreraContent />
      </Suspense>
    </div>
  )
}
