'use client'

import { createContext, useContext } from 'react'

interface Business {
  business_id: string
  business_name: string
  contact_name: string
  contact_email: string
}

export const BusinessContext = createContext<Business | null>(null)

export function useBusiness() {
  const context = useContext(BusinessContext)
  if (!context) {
    throw new Error('useBusiness must be used within BusinessProvider')
  }
  return context
}
