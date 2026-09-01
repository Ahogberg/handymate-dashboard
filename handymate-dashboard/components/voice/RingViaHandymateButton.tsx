'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Phone, PhoneCall, Smartphone, X } from 'lucide-react'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'

/**
 * "Ring via Handymate" — ersätter den vanliga tel:-länken där en kund kan
 * ringas (kundkortet, affärsmodalen).
 *
 * Faller tillbaka till en EXAKT likadan tel:-länk när funktionen inte är
 * tillgänglig (inget Handymate-nummer, inspelning avstängd, grindarna
 * stängda, ingen mobil att koppla till) eller när kunden saknar nummer —
 * hantverkaren ska aldrig märka att knappen "försvann".
 *
 * Kapabiliteten hämtas EN gång per sidladdning (modulcache) — samma svar
 * gäller för alla knappar på sidan.
 */

interface Capability {
  available: boolean
  reason?: string
  craftsman_phone_masked?: string
}

let capabilityCache: Capability | null = null
let capabilityInFlight: Promise<Capability> | null = null

async function fetchCapability(): Promise<Capability> {
  if (capabilityCache) return capabilityCache
  if (!capabilityInFlight) {
    capabilityInFlight = fetch('/api/voice/outbound/start', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return { available: false, reason: 'Kunde inte läsa telefoni-inställningarna' } as Capability
        const json = (await res.json()) as Capability
        return { available: !!json.available, reason: json.reason, craftsman_phone_masked: json.craftsman_phone_masked }
      })
      .catch(() => ({ available: false, reason: 'Kunde inte läsa telefoni-inställningarna' } as Capability))
      .then((cap) => {
        capabilityCache = cap
        capabilityInFlight = null
        return cap
      })
  }
  return capabilityInFlight
}

function useOutboundCapability(): Capability | null {
  const [cap, setCap] = useState<Capability | null>(capabilityCache)
  useEffect(() => {
    let alive = true
    fetchCapability().then((c) => { if (alive) setCap(c) })
    return () => { alive = false }
  }, [])
  return cap
}

export interface RingViaHandymateButtonProps {
  customerId: string
  dealId?: string | null
  projectId?: string | null
  /** Kundens nummer som det står i databasen — normaliseras för tel: här. */
  phone: string | null | undefined
  variant: 'tile' | 'chip'
  customerName?: string | null
  className?: string
}

const TILE_CLASS = 'flex-1 min-w-[60px] flex flex-col items-center justify-center gap-1.5 min-h-[64px] p-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all'
const CHIP_CLASS = 'flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 hover:bg-emerald-100 transition-colors'

export default function RingViaHandymateButton({
  customerId,
  dealId,
  projectId,
  phone,
  variant,
  customerName,
  className,
}: RingViaHandymateButtonProps) {
  const cap = useOutboundCapability()
  const [open, setOpen] = useState(false)
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState<{ recordingId: string } | null>(null)

  const telHref = phone ? `tel:${normalizeSwedishPhone(phone)}` : null
  const baseClass = `${variant === 'tile' ? TILE_CLASS : CHIP_CLASS}${className ? ` ${className}` : ''}`

  const label = (text: string, Icon: typeof Phone) =>
    variant === 'tile' ? (
      <>
        <Icon className="w-5 h-5" />
        <span className="text-xs font-medium">{text}</span>
      </>
    ) : (
      <>
        <Icon className="w-4 h-4" /> {text}
      </>
    )

  // Inget nummer alls: inget att visa (anroparen brukar redan vakta på detta).
  if (!telHref) return null

  // Inte tillgängligt (eller inte utrett än): exakt samma tel:-länk som förut.
  if (!cap || !cap.available) {
    return (
      <a href={telHref} className={baseClass}>
        {label('Ring', Phone)}
      </a>
    )
  }

  const startCall = async () => {
    setCalling(true)
    setError(null)
    try {
      const res = await fetch('/api/voice/outbound/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ customer_id: customerId, deal_id: dealId || undefined, project_id: projectId || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'Samtalet kunde inte startas. Ring direkt från mobilen istället.')
        return
      }
      setStarted({ recordingId: String(json.recording_id) })
      setOpen(false)
    } catch {
      setError('Samtalet kunde inte startas. Ring direkt från mobilen istället.')
    } finally {
      setCalling(false)
    }
  }

  const who = customerName || 'kunden'

  return (
    <>
      <button type="button" onClick={() => { setError(null); setOpen(true) }} className={baseClass}>
        {label('Ring', Phone)}
      </button>

      {started && (
        <div
          className={
            variant === 'tile'
              ? 'basis-full flex items-center gap-2 text-sm text-[#0F766E] bg-teal-50 border border-teal-200 rounded-xl px-3 py-2'
              : 'basis-full flex items-center gap-2 text-sm text-[#0F766E] bg-teal-50 border border-teal-200 rounded-lg px-3 py-2'
          }
          role="status"
        >
          <PhoneCall className="w-4 h-4 shrink-0" />
          <span>
            Ringer upp {who} … svara när din telefon ringer.{' '}
            <Link href={`/dashboard/recordings/${started.recordingId}`} className="underline font-medium">
              Följ samtalet
            </Link>
          </span>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={() => !calling && setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ring-via-handymate-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 id="ring-via-handymate-title" className="text-lg font-semibold text-gray-900">
                Ring via Handymate
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={calling}
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Stäng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed">
              Vi ringer upp kunden från ditt Handymate-nummer och spelar upp inspelningsmeddelandet. Direkt därefter
              ringer din telefon ({cap.craftsman_phone_masked || 'din mobil'}) — svara så kopplas ni ihop. Samtalet
              spelas in och Lisa sammanfattar det efteråt.
            </p>

            {error && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={startCall}
                disabled={calling}
                className="min-h-[48px] w-full flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] text-white font-medium hover:bg-[#0d6a63] disabled:opacity-60 transition-colors"
              >
                <PhoneCall className="w-5 h-5" />
                {calling ? 'Startar samtalet …' : 'Ring nu'}
              </button>
              <a
                href={telHref}
                onClick={() => setOpen(false)}
                className="min-h-[44px] w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-gray-800 font-medium hover:bg-gray-50 transition-colors"
              >
                <Smartphone className="w-4 h-4" />
                Ring direkt från mobilen istället
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={calling}
                className="min-h-[44px] w-full flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
