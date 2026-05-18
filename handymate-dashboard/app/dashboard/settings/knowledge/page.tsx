'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Settings, Globe, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import KnowledgeEditor from '@/components/widget/KnowledgeEditor'

/**
 * /dashboard/settings/knowledge
 *
 * Behållts som egen route för bakåtkompatibilitet (gamla länkar fungerar).
 * Knowledge-redigeringen drivs nu av <KnowledgeEditor /> som även används som
 * "Kunskap"-tab i /dashboard/settings/website-widget. En sanning per data-fält.
 *
 * Jobbstil-preferenser (margin, geografi, kontaktkanal, m.m.) ligger kvar här
 * eftersom de styr AI-agent-flödet, inte hemsidans chatbot.
 */
export default function KnowledgeBasePage() {
  const business = useBusiness()
  const [prefs, setPrefs] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchPreferences()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id])

  async function fetchPreferences() {
    const { data } = await supabase
      .from('business_preferences')
      .select('key, value')
      .eq('business_id', business.business_id)

    if (data) {
      const map: Record<string, string> = {}
      data.forEach((p: { key: string; value: string }) => { map[p.key] = p.value })
      setPrefs(map)
    }
  }

  async function savePref(key: string, value: string) {
    setPrefs(prev => ({ ...prev, [key]: value }))
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, source: 'settings' }),
      })
    } catch { /* silent */ }
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-primary-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/settings" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Kunskap & Jobbstil</h1>
              <p className="text-sm text-gray-500">Vad AI:n vet om ditt företag, och hur du jobbar</p>
            </div>
          </div>
        </div>

        {/* Hub-banner — pekar mot AI på hemsidan där kunskap också finns */}
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Globe className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-sky-900 leading-relaxed">
            <strong className="font-semibold">Kunskapsbasen styr chattboten på din hemsida.</strong>{' '}
            Du kan redigera den både här och under{' '}
            <Link href="/dashboard/settings/website-widget?tab=knowledge" className="font-semibold underline hover:text-sky-700 inline-flex items-center gap-1">
              AI på hemsidan → Kunskap <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            {' '}— samma data, samma effekt.
          </div>
        </div>

        <div className="space-y-6">
          {/* Knowledge-base editor (delad komponent) */}
          <KnowledgeEditor businessId={business.business_id} />

          {/* Jobbstil — AI-preferenser. Separat data (business_preferences),
              styr AI-agent-flödet och inte hemsidans chatbot. */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary-700" />
              Jobbstil
            </h2>
            <p className="text-sm text-gray-500 mb-5">Hjälp AI:n förstå hur du jobbar (styr agent-systemet, inte hemsidans chatbot)</p>

            <div className="space-y-5">
              {/* Marginal på material */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vilken marginal tar du på material?</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: '10', label: '10%' },
                    { value: '15', label: '15%' },
                    { value: '20', label: '20%' },
                    { value: '25', label: '25%+' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => savePref('pricing_margin_default', opt.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        prefs.pricing_margin_default === opt.value
                          ? 'bg-primary-700 text-white border-primary-700'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minsta jobbvärde */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vad är ditt minsta jobbvärde?</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: '5000', label: '< 5 000 kr' },
                    { value: '10000', label: '5 000–10 000 kr' },
                    { value: '25000', label: '10 000–25 000 kr' },
                    { value: '25001', label: '> 25 000 kr' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => savePref('min_job_value_sek', opt.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        prefs.min_job_value_sek === opt.value
                          ? 'bg-primary-700 text-white border-primary-700'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Köravstånd */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hur långt är du villig att köra?</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: '10', label: '10 km' },
                    { value: '30', label: '30 km' },
                    { value: '50', label: '50 km' },
                    { value: 'any', label: 'Spelar ingen roll' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => savePref('geography_max_km', opt.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        prefs.geography_max_km === opt.value
                          ? 'bg-primary-700 text-white border-primary-700'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arbetstider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vilka arbetstider föredrar du?</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: '07-15', label: '07–15' },
                    { value: '07-17', label: '07–17' },
                    { value: '08-17', label: '08–17' },
                    { value: 'flexible', label: 'Flexibelt' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => savePref('scheduling_preferred_hours', opt.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        prefs.scheduling_preferred_hours === opt.value
                          ? 'bg-primary-700 text-white border-primary-700'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kontaktkanal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hur vill du helst bli kontaktad?</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'push', label: 'Push-notis' },
                    { value: 'email', label: 'E-post' },
                    { value: 'both', label: 'Båda' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => savePref('preferred_contact_channel', opt.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        prefs.preferred_contact_channel === opt.value
                          ? 'bg-primary-700 text-white border-primary-700'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
