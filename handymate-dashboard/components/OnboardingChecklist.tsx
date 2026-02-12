'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Check,
  Circle,
  Mail,
  Phone,
  PhoneForwarded,
  Clock,
  PhoneCall,
  Image,
  X,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Loader2,
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
  }
  callCount: number
  onDismiss: () => void
  onUpdate: () => void
}

interface ChecklistItem {
  id: string
  label: string
  description?: string
  completed: boolean
  action?: {
    type: 'link' | 'button' | 'external'
    label: string
    href?: string
    onClick?: () => void
  }
}

export default function OnboardingChecklist({
  businessId,
  businessConfig,
  callCount,
  onDismiss,
  onUpdate,
}: OnboardingChecklistProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [resendingEmail, setResendingEmail] = useState(false)

  // Don't show if dismissed or all complete
  if (businessConfig.onboarding_dismissed) {
    return null
  }

  // Build checklist items
  const items: ChecklistItem[] = [
    {
      id: 'account',
      label: 'Konto skapat',
      completed: true, // Always true if they can see dashboard
    },
    {
      id: 'email',
      label: 'E-post verifierad',
      description: businessConfig.email_confirmed_at ? undefined : 'Verifiera för att få påminnelser och notiser',
      completed: !!businessConfig.email_confirmed_at,
      action: businessConfig.email_confirmed_at ? undefined : {
        type: 'button',
        label: 'Skicka nytt mail',
        onClick: async () => {
          setResendingEmail(true)
          try {
            await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'resend_verification' }),
            })
            alert('Verifieringsmail skickat!')
          } catch (e) {
            alert('Kunde inte skicka mail')
          }
          setResendingEmail(false)
        },
      },
    },
    {
      id: 'phone',
      label: 'Telefonnummer aktiverat',
      description: businessConfig.assigned_phone_number
        ? `Ditt nummer: ${businessConfig.assigned_phone_number}`
        : 'Aktivera för att ta emot AI-assisterade samtal',
      completed: !!businessConfig.assigned_phone_number,
      action: businessConfig.assigned_phone_number ? undefined : {
        type: 'link',
        label: 'Konfigurera',
        href: '/dashboard/settings',
      },
    },
  ]

  // Only show forwarding item if they chose "keep_existing"
  if (businessConfig.phone_setup_type === 'keep_existing' && businessConfig.assigned_phone_number) {
    items.push({
      id: 'forwarding',
      label: 'Vidarekoppling konfigurerad',
      description: businessConfig.forwarding_confirmed
        ? undefined
        : `Vidarebefordra samtal till ${businessConfig.assigned_phone_number}`,
      completed: !!businessConfig.forwarding_confirmed,
      action: businessConfig.forwarding_confirmed ? undefined : {
        type: 'button',
        label: 'Markera som klar',
        onClick: async () => {
          setLoading('forwarding')
          try {
            await fetch('/api/onboarding/status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                businessId,
                forwarding_confirmed: true,
              }),
            })
            onUpdate()
          } catch (e) {
            console.error('Failed to update forwarding status')
          }
          setLoading(null)
        },
      },
    })
  }

  items.push(
    {
      id: 'hours',
      label: 'Öppettider inställda',
      description: businessConfig.working_hours ? undefined : 'Ställ in när AI-assistenten ska svara',
      completed: !!businessConfig.working_hours,
      action: businessConfig.working_hours ? undefined : {
        type: 'link',
        label: 'Konfigurera',
        href: '/dashboard/settings',
      },
    },
    {
      id: 'test_call',
      label: 'Första testsamtalet',
      description: callCount > 0 ? `${callCount} samtal mottagna` : 'Ring ditt nummer för att testa',
      completed: callCount > 0,
      action: callCount > 0 ? undefined : {
        type: 'external',
        label: 'Se instruktioner',
        href: '#test-call-instructions',
        onClick: () => {
          // Show test call modal or instructions
          alert(`Ring ${businessConfig.assigned_phone_number || 'ditt tilldelade nummer'} för att testa AI-assistenten.`)
        },
      },
    },
    {
      id: 'logo',
      label: 'Logotyp uppladdad',
      description: businessConfig.logo_url ? undefined : 'Visas i offerter och fakturor',
      completed: !!businessConfig.logo_url,
      action: businessConfig.logo_url ? undefined : {
        type: 'link',
        label: 'Ladda upp',
        href: '/dashboard/settings',
      },
    }
  )

  const completedCount = items.filter(i => i.completed).length
  const totalCount = items.length
  const progressPercent = Math.round((completedCount / totalCount) * 100)

  // Don't show if all complete
  if (completedCount === totalCount) {
    return null
  }

  const handleDismiss = async () => {
    try {
      await fetch('/api/onboarding/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          onboarding_dismissed: true,
        }),
      })
      onDismiss()
    } catch (e) {
      console.error('Failed to dismiss onboarding')
    }
  }

  return (
    <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-2xl p-5 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500">
            <Sparkles className="w-5 h-5 text-gray-900" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Kom igång med Handymate</h2>
            <p className="text-sm text-gray-500">{completedCount} av {totalCount} steg klara</p>
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
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
              item.completed
                ? 'bg-emerald-50 border border-emerald-500/20'
                : 'bg-gray-50 border border-gray-300/50 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {item.completed ? (
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-emerald-600" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0">
                  <Circle className="w-3 h-3 text-gray-400" />
                </div>
              )}
              <div className="min-w-0">
                <p className={`text-sm font-medium ${item.completed ? 'text-emerald-600' : 'text-gray-900'}`}>
                  {item.label}
                </p>
                {item.description && (
                  <p className="text-xs text-gray-400 truncate">{item.description}</p>
                )}
              </div>
            </div>

            {item.action && !item.completed && (
              <>
                {item.action.type === 'link' && item.action.href && (
                  <Link
                    href={item.action.href}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0"
                  >
                    {item.action.label}
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                )}
                {item.action.type === 'button' && item.action.onClick && (
                  <button
                    onClick={item.action.onClick}
                    disabled={loading === item.id || resendingEmail}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50"
                  >
                    {(loading === item.id || (item.id === 'email' && resendingEmail)) ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      item.action.label
                    )}
                  </button>
                )}
                {item.action.type === 'external' && item.action.onClick && (
                  <button
                    onClick={item.action.onClick}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0"
                  >
                    {item.action.label}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Helpful tip */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">
          Slutför dessa steg för att få ut det mesta av Handymate. Du kan alltid hitta den här listan i inställningarna.
        </p>
      </div>
    </div>
  )
}
