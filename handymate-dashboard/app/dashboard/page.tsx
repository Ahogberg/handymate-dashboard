'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Calendar,
  Mail,
  Globe,
  Phone,
  Sparkles,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import OnboardingChecklist from '@/components/OnboardingChecklist'
import IdagCore from '@/components/dashboard/IdagCore'
import WeeklyValueDigest from '@/components/dashboard/WeeklyValueDigest'
import CashRadarCard from '@/components/dashboard/CashRadarCard'
import IdentityPill from '@/components/IdentityPill'

/**
 * Idag-vyn (omdesign 2026-07-11, från Idag-vy.html + Idag-mobil.html).
 *
 * Inverterad hierarki: teamets arbete och godkänn-kön först (IdagCore),
 * värdebevis (radar + veckovärde) därefter, onboarding/setup sist.
 * Gamla jämnviktade sektionerna (Säljtratt, Ekonomi, Senaste aktivitet,
 * Att göra idag, KPI-korten) utgick — datan nås via drill-korten i
 * IdagCore och lever kvar på sina undersidor.
 */

interface Booking {
  booking_id: string
  customer_id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  notes: string
  customer?: {
    name: string
    phone_number: string
  }
}

interface DashboardStats {
  bookings: { week: number; month: number; trend: number }
  customers: { new_this_month: number; total: number; trend: number }
  calls: { week: number; month: number; trend: number }
  quotes: { sent: number; accepted: number; acceptance_rate: number; total_value: number; accepted_value: number }
  time: { week_hours: number; month_hours: number }
  revenue: { month: number }
  ai: { pending_suggestions: number }
  bookings_per_day: { date: string; count: number }[]
}

interface OnboardingData {
  email_confirmed_at?: string | null
  assigned_phone_number?: string | null
  phone_setup_type?: string | null
  forwarding_confirmed?: boolean
  working_hours?: any
  logo_url?: string | null
  onboarding_dismissed?: boolean
  onboarding_data?: Record<string, unknown>
  lead_sources?: string[]
  google_calendar_connected?: boolean
  gmail_enabled?: boolean
}

export default function DashboardPage() {
  const business = useBusiness()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingsLoaded, setBookingsLoaded] = useState(false)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null)
  const [callCount, setCallCount] = useState(0)
  const [priceListCount, setPriceListCount] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [showWelcome, setShowWelcome] = useState(false)
  const [morningReport, setMorningReport] = useState<string | null>(null)
  const [activeProjects, setActiveProjects] = useState(0)
  const [pipelineStats, setPipelineStats] = useState<{
    byStage: Array<{ stage: string; slug: string; color: string; count: number; value: number }>
    totalDeals: number; totalValue: number; wonValue: number; lostCount: number; newLeadsToday: number; needsFollowUp: number
  } | null>(null)
  const [economics, setEconomics] = useState<{
    invoiced: number; unpaidCount: number; unpaidAmount: number
    estimatedMargin: number | null; overheadSet: boolean
  } | null>(null)
  // Inloggade användarens namn (business_users) — hälsningen ska vara personlig,
  // inte företagets kontaktperson (Bee-buggfix).
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  const [dashboardErrorSections, setDashboardErrorSections] = useState<Set<string>>(new Set())
  const markSectionError = (section: string) => {
    setDashboardErrorSections(prev => {
      if (prev.has(section)) return prev
      const next = new Set(prev)
      next.add(section)
      console.error(`[dashboard] section failed to load: ${section}`)
      return next
    })
  }
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!localStorage.getItem('hm_welcome_seen')) {
      setShowWelcome(true)
    }
    // Check for today's morning report
    const today = new Date().toISOString().slice(0, 10)
    const dismissedKey = `hm_morning_report_${today}`
    if (!localStorage.getItem(dismissedKey)) {
      supabase
        .from('business_preferences')
        .select('value')
        .eq('business_id', business.business_id)
        .eq('key', 'morning_report_latest')
        .single()
        .then(({ data }: { data: any }) => {
          if (data?.value) {
            try {
              const parsed = JSON.parse(data.value)
              if (parsed.date === today && parsed.summary) {
                setMorningReport(parsed.summary)
              }
            } catch { /* ignore */ }
          }
        })
    }
  }, [])

  const closeWelcome = () => {
    localStorage.setItem('hm_welcome_seen', '1')
    setShowWelcome(false)
  }

  useEffect(() => {
    fetchData()
  }, [business.business_id])

  // Realtime + polling: uppdatera när samtal/SMS/bokningar/affärer händer.
  // pending_approvals hanteras av IdagCore:s egen subscription.
  useRealtimeRefresh({
    tables: ['task', 'sms_conversation', 'booking', 'customer_activity', 'deal'],
    businessId: business.business_id,
    onChange: () => fetchData(),
    pollIntervalMs: 30_000,
  })

  async function fetchData() {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Fire ALL independent fetches in parallel
    const bookingsPromise = supabase
      .from('booking')
      .select(`
        booking_id, customer_id, scheduled_start, scheduled_end, status, notes,
        customer (name, phone_number)
      `)
      .eq('business_id', business.business_id)
      .gte('scheduled_start', todayStr)
      .lt('scheduled_start', todayStr + 'T23:59:59')
      .order('scheduled_start', { ascending: true })
      .then(({ data }: { data: any }) => {
        setBookings(data || [])
        setBookingsLoaded(true)
      })

    const configPromise = (async () => {
      const { data: configData } = await supabase
        .from('business_config')
        .select(`
          email_confirmed_at, assigned_phone_number, phone_setup_type,
          forwarding_confirmed, working_hours, logo_url,
          onboarding_dismissed, onboarding_data, lead_sources
        `)
        .eq('business_id', business.business_id)
        .single()

      if (configData) {
        const { data: calConn } = await supabase
          .from('calendar_connection')
          .select('id, gmail_sync_enabled')
          .eq('business_id', business.business_id)
          .maybeSingle()

        const enriched = {
          ...configData,
          google_calendar_connected: !!calConn,
          gmail_enabled: calConn?.gmail_sync_enabled || false,
        }
        setOnboardingData(enriched)
        setShowOnboarding(!configData.onboarding_dismissed)
        const obData = (configData.onboarding_data || {}) as Record<string, unknown>
        const dismissed = (obData.dismissed_reminders as string[]) || []
        if (dismissed.length > 0) {
          setDismissedReminders(new Set(dismissed))
        }
      }
    })()

    const callsPromise = supabase
      .from('call_recording')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .then(({ count }: { count: number | null }) => {
        setCallCount(count || 0)
      })

    const priceListPromise = supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .eq('is_active', true)
      .then(({ count }: { count: number | null }) => {
        setPriceListCount(count || 0)
      })

    const projectsPromise = supabase
      .from('project')
      .select('project_id', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .in('status', ['planning', 'active', 'paused'])
      .then(({ count }: { count: number | null }) => {
        setActiveProjects(count || 0)
      })

    const pipelinePromise = fetch('/api/pipeline/stats')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setPipelineStats(data)
        else markSectionError('pipeline')
      })
      .catch(() => { markSectionError('pipeline') })

    const statsPromise = fetch(`/api/dashboard/stats?businessId=${business.business_id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setStats(data)
        else markSectionError('stats')
      })
      .catch(() => { markSectionError('stats') })

    // Ekonomisammanfattning — Fakturor-drillkortet
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const economicsPromise = Promise.all([
      supabase.from('invoice').select('total_amount:total').eq('business_id', business.business_id).neq('status', 'draft').gte('created_at', startOfMonth),
      supabase.from('invoice').select('id:invoice_id, total_amount:total').eq('business_id', business.business_id).eq('status', 'sent'),
      supabase.from('business_config').select('overhead_monthly_sek, margin_target_percent').eq('business_id', business.business_id).single(),
    ]).then(([invRes, unpaidRes, bizRes]) => {
      const invoiced = (invRes.data || []).reduce((s: number, i: any) => s + (Number(i.total_amount) || 0), 0)
      const unpaidCount = unpaidRes.data?.length || 0
      const unpaidAmount = (unpaidRes.data || []).reduce((s: number, i: any) => s + (Number(i.total_amount) || 0), 0)
      const overhead = Number(bizRes.data?.overhead_monthly_sek) || 0
      const estimatedMargin = invoiced > 0 ? Math.round(((invoiced - overhead) / invoiced) * 100) : null
      setEconomics({ invoiced, unpaidCount, unpaidAmount, estimatedMargin, overheadSet: overhead > 0 })
    }).catch(() => {})

    await Promise.all([
      bookingsPromise, configPromise, callsPromise, priceListPromise,
      projectsPromise, pipelinePromise, statsPromise, economicsPromise,
    ])
  }

  // Hämta inloggade användarens namn en gång (oberoende av fetchData-pollningen)
  useEffect(() => {
    let active = true
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active && d?.user?.name) setCurrentUserName(d.user.name) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 10) return 'God morgon'
    if (hour < 18) return 'Hej'
    return 'God kväll'
  }

  const getFirstName = () => {
    // Bee-buggfix: hälsa den INLOGGADE användaren, inte företagets kontaktperson
    // (anställda fick "Hej Christoffer"). /api/me → business_users.name; fallback
    // till contact_name tills svaret laddat (ägaren = samma namn ändå).
    const name = currentUserName || business.contact_name || ''
    return name.split(' ')[0] || ''
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-secondary-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        {/* Dashboard-error-banner: visas om någon sektion failade att laddas
            så Christoffer ser direkt att det är ett tekniskt problem istället
            för att tro att data är tom. */}
        {dashboardErrorSections.size > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center justify-between gap-3">
            <p className="text-sm">
              ⚠️ Vissa delar av dashboarden kunde inte laddas just nu.
              {dashboardErrorSections.size > 1 && ` (${dashboardErrorSections.size} sektioner)`}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-medium underline whitespace-nowrap hover:text-amber-900"
            >
              Ladda om
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-5 sm:mb-6">
          <IdentityPill />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
            {getGreeting()}{getFirstName() ? `, ${getFirstName()}` : ''}!
          </h1>
          <p className="text-sm sm:text-base text-gray-500">
            <span className="capitalize">
              {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </p>
        </div>

        {/* Welcome popup — visas bara en gång */}
        {showWelcome && (
          <div className="mb-6 p-5 bg-[#F0FDFA] border border-[#E2E8F0] rounded-xl relative">
            <button
              onClick={closeWelcome}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-primary-700 flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Välkommen till Handymate!</h2>
                <p className="text-sm text-gray-600 mb-3">
                  Din AI-assistent är redo att hjälpa dig hantera kunder, offerter och bokningar. Börja med att fylla i dina uppgifter i checklistan nedan.
                </p>
                <button
                  onClick={closeWelcome}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 transition-colors"
                >
                  Kom igång
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Morning report popup */}
        {morningReport && (
          <div className="mb-6 p-5 bg-[#F0FDFA] border border-[#E2E8F0] rounded-xl relative">
            <button
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10)
                localStorage.setItem(`hm_morning_report_${today}`, '1')
                setMorningReport(null)
              }}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary-700" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Din dagliga rapport</h3>
                <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                  {morningReport}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Kärnstacken: bevisband → agentremsa → godkänn-kö → Klart idag →
            drill-rad → KPI-fot. Se IdagCore för detaljer. */}
        <IdagCore
          bookings={bookings}
          bookingsLoaded={bookingsLoaded}
          pipelineStats={pipelineStats}
          economics={economics}
          stats={stats}
          activeProjects={activeProjects}
        />

        {/* Värdebevis — Pengar in-radarn + veckovärdet (lanseringsytor) */}
        <CashRadarCard />
        <WeeklyValueDigest />

        {/* Onboarding Checklist */}
        {showOnboarding && onboardingData && (
          <OnboardingChecklist
            businessId={business.business_id}
            businessConfig={onboardingData}
            callCount={callCount}
            priceListCount={priceListCount}
            onDismiss={() => setShowOnboarding(false)}
            onUpdate={fetchData}
          />
        )}

        {/* AI Inbox Banner — fixed: no floating "0" when pending_suggestions is 0 */}
        {(stats?.ai?.pending_suggestions ?? 0) > 0 && (
          <Link href="/dashboard/ai-inbox">
            <div className="mb-6 p-4 bg-primary-50 border border-[#E2E8F0] rounded-xl hover:border-primary-300 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-700">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {stats!.ai.pending_suggestions} AI-förslag väntar
                    </p>
                    <p className="text-sm text-gray-500">
                      Från samtalsanalys – granska och godkänn
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-secondary-700" />
              </div>
            </div>
          </Link>
        )}

        {/* Phone setup banner — show when phone not configured and onboarding dismissed */}
        {!showOnboarding && onboardingData && !onboardingData.assigned_phone_number && (
          <Link href="/dashboard/settings/phone">
            <div className="mb-6 p-4 bg-primary-50 border border-[#E2E8F0] rounded-xl hover:border-primary-300 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-700">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      Koppla ditt nummer och missa aldrig ett samtal igen
                    </p>
                    <p className="text-sm text-gray-500">
                      Det tar bara 5 minuter.
                    </p>
                  </div>
                </div>
                <span className="text-secondary-700 font-medium text-sm flex items-center gap-1">
                  Kom igång <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Setup reminder banners — show one at a time after onboarding */}
        {!showOnboarding && onboardingData && (
          (() => {
            const reminders = []
            if (!onboardingData.google_calendar_connected && !dismissedReminders.has('google')) {
              reminders.push({ id: 'google', icon: Calendar, bgColor: 'bg-orange-50', border: 'border-orange-200', iconBg: 'bg-orange-100', iconColor: 'text-orange-600', title: 'Koppla Google Calendar för att synka bokningar', desc: 'Dina bokningar visas i Google Calendar automatiskt.', href: '/dashboard/settings?tab=integrations', cta: 'Koppla nu' })
            }
            if (!onboardingData.gmail_enabled && !dismissedReminders.has('gmail')) {
              reminders.push({ id: 'gmail', icon: Mail, bgColor: 'bg-primary-50', border: 'border-primary-200', iconBg: 'bg-primary-100', iconColor: 'text-primary-700', title: 'Koppla Gmail för att se all kundkommunikation', desc: 'Se email-historik direkt i kundkortet.', href: '/dashboard/settings?tab=integrations', cta: 'Aktivera' })
            }
            if ((!onboardingData.lead_sources || onboardingData.lead_sources.length === 0) && !dismissedReminders.has('leads')) {
              reminders.push({ id: 'leads', icon: Globe, bgColor: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', title: 'Konfigurera lead-källor för att få in kunder automatiskt', desc: 'Ta emot förfrågningar från Offerta, ServiceFinder m.fl.', href: '/dashboard/settings?tab=integrations', cta: 'Kom igång' })
            }
            const r = reminders[0]
            if (!r) return null
            return (
              <div className={`mb-6 p-4 ${r.bgColor} border ${r.border} rounded-xl`}>
                <div className="flex items-center justify-between">
                  <Link href={r.href} className="flex items-center gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${r.iconBg}`}>
                      <r.icon className={`w-5 h-5 ${r.iconColor}`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{r.title}</p>
                      <p className="text-sm text-gray-500">{r.desc}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 ml-3">
                    <Link href={r.href} className="text-secondary-700 font-medium text-sm flex items-center gap-1 whitespace-nowrap">
                      {r.cta} <ArrowRight className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={async () => {
                        setDismissedReminders(prev => new Set(prev).add(r.id))
                        // Persist dismiss
                        const existing = (onboardingData.onboarding_data || {}) as Record<string, unknown>
                        const dismissed = ((existing.dismissed_reminders as string[]) || [])
                        await supabase
                          .from('business_config')
                          .update({ onboarding_data: { ...existing, dismissed_reminders: [...dismissed, r.id] } })
                          .eq('business_id', business.business_id)
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })()
        )}
      </div>
    </div>
  )
}
