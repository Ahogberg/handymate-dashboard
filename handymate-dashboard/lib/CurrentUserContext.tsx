'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export interface BusinessUser {
  id: string
  business_id: string
  user_id: string | null
  role: 'owner' | 'admin' | 'employee'
  name: string
  email: string
  phone: string | null
  title: string | null
  hourly_cost: number | null
  hourly_rate: number | null
  color: string
  avatar_url: string | null
  is_active: boolean
  can_see_all_projects: boolean
  can_see_financials: boolean
  can_manage_users: boolean
  can_approve_time: boolean
  can_create_invoices: boolean
}

type Permission =
  | 'see_all_projects'
  | 'see_financials'
  | 'manage_users'
  | 'approve_time'
  | 'create_invoices'
  | 'manage_settings'

const PERMISSION_MAP: Record<Permission, keyof BusinessUser> = {
  see_all_projects: 'can_see_all_projects',
  see_financials: 'can_see_financials',
  manage_users: 'can_manage_users',
  approve_time: 'can_approve_time',
  create_invoices: 'can_create_invoices',
  manage_settings: 'can_manage_users',
}

interface CurrentUserContextValue {
  user: BusinessUser | null
  loading: boolean
  isOwner: boolean
  isAdmin: boolean
  isOwnerOrAdmin: boolean
  can: (permission: Permission) => boolean
  refetch: () => Promise<void>
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null)

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<BusinessUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/me')
      if (res.ok) {
        const data = await res.json()
        setUser(data.user || null)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const isOwner = user?.role === 'owner'
  const isAdmin = user?.role === 'admin'
  const isOwnerOrAdmin = isOwner || isAdmin

  const can = useCallback((permission: Permission): boolean => {
    if (!user) return false
    if (user.role === 'owner') return true
    if (user.role === 'admin') {
      if (permission === 'manage_settings') return false
      return true
    }
    const field = PERMISSION_MAP[permission]
    if (!field) return false
    return user[field] as boolean
  }, [user])

  return (
    <CurrentUserContext.Provider value={{ user, loading, isOwner, isAdmin, isOwnerOrAdmin, can, refetch: fetchUser }}>
      {children}
    </CurrentUserContext.Provider>
  )
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext)
  if (!context) {
    throw new Error('useCurrentUser must be used within CurrentUserProvider')
  }
  return context
}
