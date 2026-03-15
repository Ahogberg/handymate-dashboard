'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Check,
  X,
  ChevronRight,
  Sparkles,
  ChevronDown,
} from 'lucide-react'

interface OnboardingChecklistProps {
  businessId: string
  businessConfig: {
    email_confirmed_at?: string | null
    assigned_phone_number?: string | null
    phone_setup_type?: string | null
    forwarding_confirmed?: boolean
    working_hours?: any
    logo_url?: string | null
    onboarding_dismissed?: boolean
    google_connected?: boolean
    google_calendar_connected?: boolean
    gmail_enabled?: boolean
    services_offered?: string[]
    default_hourly_rate?: number
  }
  callCount: number
  customerCount?: number
  priceListCount?: number
  onDismiss: () => void
  onUpdate: () => void
}

interface ChecklistItem {
  id: string
  label: string
  completed: boolean
  optional?: boolean
  link?: string
}

interface ChecklistGroup {
  title: string
  items: ChecklistItem[]
}

export default function OnboardingChecklist({
  businessId,
  businessConfig,
  callCount,
  customerCount = 0,
  priceListCount = 0,
  onDismiss,
  onUpdate,
}: OnboardingChecklistProps) {
  const [showConfetti, setShowConfetti] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null)

  // Don't show if dismissed
  if (businessConfig.onboarding_dismissed) {
    return null
  }

  const groups: ChecklistGroup[] = [
    {
      title: 'Grundinställningar',
      items: [
        {
          id: 'company',
          label: 'Företagsinfo ifylld',
          completed: true,
          link: '/dashboard/settings',
        },
        {
          id: 'pricing',
          label: 'Prislista ifylld',
          completed: priceListCount > 0,
          link: '/dashboard/settings/my-prices',
        },
        {
          id: 'logo',
          label: 'Logotyp uppladdad',
          completed: !!businessConfig.logo_url,
          link: '/dashboard/settings',
        },
      ],
    },
    {
      title: 'Anslutningar',
      items: [
        {
          id: 'phone',
          label: 'Telefonnummer aktiverat',
          completed: !!businessConfig.assigned_phone_number,
          link: '/dashboard/settings',
        },
        {
          id: 'calendar',
          label: 'Google Calendar kopplad',
          completed: !!(businessConfig.google_connected || businessConfig.google_calendar_connected),
          link: '/dashboard/settings',
        },
        {
          id: 'gmail',
          label: 'Gmail kopplad',
          completed: !!businessConfig.gmail_enabled,
          link: '/dashboard/settings',
        },
        {
          id: 'website',
          label: 'Hemsida kopplad (valfritt)',
          completed: false,
          optional: true,
          link: '/dashboard/settings/integrations',
        },
      ],
    },
    {
      title: 'Anpassa AI:n',
      items: [
        {
          id: 'ai_style',
          label: 'AI-jobbstil konfigurerad',
          completed: !!businessConfig.working_hours,
          link: '/dashboard/settings/knowledge',
        },
        {
          id: 'automations',
          label: 'Automationer aktiverade',
          completed: callCount > 0,
          link: '/dashboard/automations',
        },
        {
          id: 'invite',
          label: 'Bjud in kollega (valfritt)',
          completed: false,
          optional: true,
          link: '/dashboard/referral',
        },
      ],
    },
  ]

  const allItems = groups.flatMap(g => g.items)
  const requiredItems = allItems.filter(i => !i.optional)
  const completedRequired = requiredItems.filter(i => i.completed).length
  const totalRequired = requiredItems.length
  const allRequiredDone = completedRequired === totalRequired
  const progressPercent = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0

  // Auto-expand first incomplete group
  useEffect(() => {
    if (expandedGroup !== null) return
    const firstIncomplete = groups.findIndex(g => g.items.some(i => !i.completed && !i.optional))
    setExpandedGroup(firstIncomplete >= 0 ? firstIncomplete : null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Show confetti once when all required done, then auto-dismiss
  useEffect(() => {
    if (allRequiredDone && !showConfetti) {
      setShowConfetti(true)
      const timer = setTimeout(async () => {
        try {
          await fetch('/api/onboarding/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessId, onboarding_dismissed: true }),
          })
          onDismiss()
        } catch { /* silent */ }
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [allRequiredDone]) // eslint-disable-line react-hooks/exhaustive-deps

  if (showConfetti) {
    return (
      <div className="relative bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 mb-6 text-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full animate-bounce"
              style={{
                left: `${10 + (i * 4.2)}%`,
                top: `${10 + ((i * 17) % 80)}%`,
                backgroundColor: ['#10b981', '#0f766e', '#f59e0b', '#3b82f6', '#ec4899'][i % 5],
                animationDelay: `${(i * 0.1)}s`,
                animationDuration: `${1 + (i % 3) * 0.3}s`,
              }}
            />
          ))}
        </div>
        <div className="relative z-10">
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Allt är klart!</h2>
          <p className="text-sm text-gray-500">Du har konfigurerat allt. Handymate är redo att hjälpa dig.</p>
        </div>
      </div>
    )
  }

  const handleDismiss = async () => {
    try {
      await fetch('/api/onboarding/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, onboarding_dismissed: true }),
      })
      onDismiss()
    } catch { /* silent */ }
  }

  return (
    <div className="bg-gradient-to-r from-teal-600/10 to-teal-500/10 border border-teal-500/20 rounded-2xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-teal-600">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Kom igång med Handymate</h2>
            <p className="text-sm text-gray-500">{completedRequired} av {totalRequired} klart</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          title="Dölj checklista"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-teal-600 rounded-full transition-all duration-700"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Grouped checklist */}
      <div className="space-y-3">
        {groups.map((group, gi) => {
          const groupCompleted = group.items.filter(i => !i.optional && i.completed).length
          const groupTotal = group.items.filter(i => !i.optional).length
          const isExpanded = expandedGroup === gi

          return (
            <div key={group.title} className="rounded-xl border border-gray-200 bg-white/60 overflow-hidden">
              <button
                onClick={() => setExpandedGroup(isExpanded ? null : gi)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{group.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    groupCompleted === groupTotal
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {groupCompleted}/{groupTotal}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 space-y-1.5">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                        item.completed ? 'bg-emerald-50/50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.completed ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                        )}
                        <span className={`text-sm ${
                          item.completed ? 'text-emerald-600 line-through' : 'text-gray-700'
                        } ${item.optional ? 'italic' : ''}`}>
                          {item.label}
                        </span>
                      </div>

                      {!item.completed && item.link && (
                        <Link
                          href={item.link}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors flex-shrink-0"
                        >
                          Konfigurera
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
