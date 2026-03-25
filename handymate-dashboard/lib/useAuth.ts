'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Business {
  business_id: string
  business_name: string
  contact_name: string
  contact_email: string
  subscription_plan: 'starter' | 'professional' | 'business'
  subscription_status: string | null
  is_pilot: boolean | null
  trial_ends_at: string | null
  onboarding_step: number
  onboarding_completed_at: string | null
}

export function useAuth(requireAuth = true) {
  const router = useRouter()
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check' }),
        })

        if (response.ok) {
          const data = await response.json()
          setBusiness(data.business)
        } else if (requireAuth) {
          router.push('/login?redirect=' + encodeURIComponent(window.location.pathname))
        }
      } catch (error) {
        if (requireAuth) {
          router.push('/login?redirect=' + encodeURIComponent(window.location.pathname))
        }
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [requireAuth, router])

  const logout = async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    })
    router.push('/login')
  }

  return { business, loading, logout }
}
