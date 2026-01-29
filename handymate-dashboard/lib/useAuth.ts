'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Business {
  business_id: string
  business_name: string
  contact_name: string
  contact_email: string
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
          router.push('/login')
        }
      } catch (error) {
        if (requireAuth) {
          router.push('/login')
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
