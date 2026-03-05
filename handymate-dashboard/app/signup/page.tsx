'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/onboarding')
  }, [router])

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="text-zinc-500">Omdirigerar...</div>
    </div>
  )
}
