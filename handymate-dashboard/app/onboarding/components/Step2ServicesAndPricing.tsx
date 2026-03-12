'use client'

import { useState, Component, type ReactNode } from 'react'
import { Plus, X, ArrowRight, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import { BRANCH_SERVICES, BRANCH_HOURLY_RATE, ROT_BRANCHES, RUT_BRANCHES } from '../constants'
import type { StepProps } from '../types'

class Step2ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[Step2] Runtime error:', error.message, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-red-400 font-medium">Steg 2 kraschade</p>
          <p className="text-zinc-400 text-sm font-mono">{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })} className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700">
            Försök igen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Step2Content({ data, onNext, onBack, onUpdate, saving }: StepProps) {
  const [selectedServices, setSelectedServices] = useState<string[]>(
    Array.isArray(data.services_offered) ? data.services_offered : []
  )
  const [customService, setCustomService] = useState('')
  const [hourlyRate, setHourlyRate] = useState(data.default_hourly_rate || BRANCH_HOURLY_RATE[data.branch] || 450)
  const [calloutFee, setCalloutFee] = useState(data.callout_fee || 0)
  const [rotEnabled, setRotEnabled] = useState(data.rot_enabled || ROT_BRANCHES.includes(data.branch))
  const [rutEnabled, setRutEnabled] = useState(data.rut_enabled || RUT_BRANCHES.includes(data.branch))
  const [orgNumber, setOrgNumber] = useState(data.org_number || '')
  const [address, setAddress] = useState(data.address || '')

  const branchServices = BRANCH_SERVICES[data.branch] || BRANCH_SERVICES.other

  const toggleService = (service: string) => {
    setSelectedServices(prev =>
      prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]
    )
  }

  const addCustomService = () => {
    if (customService.trim() && !selectedServices.includes(customService.trim())) {
      setSelectedServices(prev => [...prev, customService.trim()])
      setCustomService('')
    }
  }

  const handleNext = async () => {
    // Save via settings endpoint
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        services_offered: selectedServices,
        default_hourly_rate: hourlyRate,
        callout_fee: calloutFee,
        rot_enabled: rotEnabled,
        rut_enabled: rutEnabled,
        org_number: orgNumber,
        address,
      }),
    }).catch(() => {})

    onUpdate({
      services_offered: selectedServices,
      default_hourly_rate: hourlyRate,
      callout_fee: calloutFee,
      rot_enabled: rotEnabled,
      rut_enabled: rutEnabled,
      org_number: orgNumber,
      address,
    })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Tjänster & priser</h1>
        <p className="text-zinc-400 mt-2">Steg 2 av 7 — Välj dina tjänster och sätt ditt timpris</p>
      </div>

      {/* Services */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Dina tjänster</h2>
        <p className="text-sm text-zinc-400">Välj vilka tjänster du erbjuder. Du kan ändra detta när som helst.</p>

        <div className="flex flex-wrap gap-2">
          {branchServices.map((service) => (
            <button
              key={service}
              onClick={() => toggleService(service)}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                selectedServices.includes(service)
                  ? 'bg-teal-500/20 border-teal-500 text-white'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {service}
            </button>
          ))}
        </div>

        {/* Custom service */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customService}
            onChange={(e) => setCustomService(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomService()}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-teal-500"
            placeholder="Lägg till egen tjänst..."
          />
          <button onClick={addCustomService} className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-white">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Selected (custom) services that are not in branch defaults */}
        {selectedServices.filter(s => !branchServices.includes(s)).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
            {selectedServices.filter(s => !branchServices.includes(s)).map((service) => (
              <span key={service} className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-500/20 border border-teal-500 rounded-lg text-white text-sm">
                {service}
                <button onClick={() => toggleService(service)} className="text-teal-300 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Pricing */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Prissättning</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Timpris (kr/timme)</label>
            <input
              type="number"
              value={hourlyRate || ''}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-teal-500"
              placeholder="450"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Utryckningsavgift (kr)</label>
            <input
              type="number"
              value={calloutFee || ''}
              onChange={(e) => setCalloutFee(Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-teal-500"
              placeholder="0"
            />
          </div>
        </div>

        {/* ROT/RUT */}
        <div className="flex flex-col sm:flex-row gap-4 pt-2">
          {(ROT_BRANCHES.includes(data.branch) || rotEnabled) && (
            <button
              type="button"
              onClick={() => setRotEnabled(v => !v)}
              className="flex items-center gap-3 cursor-pointer text-left"
            >
              <div className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${rotEnabled ? 'bg-teal-600' : 'bg-zinc-700'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${rotEnabled ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
              <span className="text-sm text-white">ROT-avdrag (30% arbetskostnad)</span>
            </button>
          )}
          {(RUT_BRANCHES.includes(data.branch) || rutEnabled) && (
            <button
              type="button"
              onClick={() => setRutEnabled(v => !v)}
              className="flex items-center gap-3 cursor-pointer text-left"
            >
              <div className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${rutEnabled ? 'bg-teal-600' : 'bg-zinc-700'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${rutEnabled ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
              <span className="text-sm text-white">RUT-avdrag (50% arbetskostnad)</span>
            </button>
          )}
        </div>
      </div>

      {/* Business details */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Företagsuppgifter</h2>
        <p className="text-sm text-zinc-400">Visas på offerter och fakturor. Du kan fylla i detta senare.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Organisationsnummer</label>
            <input
              type="text"
              value={orgNumber}
              onChange={(e) => setOrgNumber(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
              placeholder="XXXXXX-XXXX"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Adress</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
              placeholder="Gatuadress, postnr, ort"
            />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {onBack && (
          <button onClick={onBack} className="px-6 py-3 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl hover:bg-zinc-700 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Tillbaka
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={saving}
          className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Fortsätt <ArrowRight className="w-5 h-5" /></>}
        </button>
      </div>
    </div>
  )
}

export default function Step2ServicesAndPricing(props: StepProps) {
  return (
    <Step2ErrorBoundary>
      <Step2Content {...props} />
    </Step2ErrorBoundary>
  )
}
