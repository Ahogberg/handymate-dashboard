'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActiveTimer {
  time_entry_id: string
  check_in_time: string
  check_in_address?: string | null
  break_minutes?: number
  work_category?: string
  customer?: { customer_id: string; name: string } | null
  project?: { project_id: string; name: string } | null
}

export interface JobbuddySuggestion {
  id: string
  type: 'create_invoice' | 'log_time' | 'update_project' | 'send_sms' | 'create_quote' | 'order_material'
  title: string
  description: string
  data?: Record<string, any>
}

interface JobbuddyContextValue {
  // Active timer state (shared with TimerWidget)
  activeTimer: ActiveTimer | null
  setActiveTimer: (timer: ActiveTimer | null) => void

  // Smart suggestions based on context
  suggestions: JobbuddySuggestion[]
  setSuggestions: (suggestions: JobbuddySuggestion[]) => void
  clearSuggestion: (id: string) => void

  // Jobbkompisen open state
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  activeTab: 'chat' | 'voice' | 'photo'
  setActiveTab: (tab: 'chat' | 'voice' | 'photo') => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const JobbuddyContext = createContext<JobbuddyContextValue | null>(null)

export function useJobbuddy() {
  const context = useContext(JobbuddyContext)
  if (!context) {
    throw new Error('useJobbuddy must be used within JobbuddyProvider')
  }
  return context
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function JobbuddyProvider({ children }: { children: ReactNode }) {
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [suggestions, setSuggestions] = useState<JobbuddySuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'voice' | 'photo'>('chat')

  const clearSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id))
  }, [])

  return (
    <JobbuddyContext.Provider value={{
      activeTimer,
      setActiveTimer,
      suggestions,
      setSuggestions,
      clearSuggestion,
      isOpen,
      setIsOpen,
      activeTab,
      setActiveTab,
    }}>
      {children}
    </JobbuddyContext.Provider>
  )
}
