'use client'

import { createContext, useContext } from 'react'

interface Business {
  business_id: string
  business_name: string
  contact_name: string
  contact_email: string
  subscription_plan: 'starter' | 'professional' | 'business'
  onboarding_step: number
  onboarding_completed_at: string | null
  created_at?: string
  /** Hemturens gate (docs/design/FORSTA-30-MINUTERNA.md) — null = turen är osedd. */
  welcome_tour_seen?: string | null
}

export const BusinessContext = createContext<Business | null>(null)

export function useBusiness() {
  const context = useContext(BusinessContext)
  if (!context) {
    throw new Error('useBusiness must be used within BusinessProvider')
  }
  return context
}
