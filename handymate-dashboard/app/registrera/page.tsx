'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function RegistreraContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const ref = searchParams?.get('ref')
    const target = ref ? `/onboarding?ref=${ref}` : '/onboarding'
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
