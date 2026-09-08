'use client'

/**
 * Bokningssidan /site/[slug]/boka — yta 5 i varumärkeslagret (2026-09-07,
 * Design "Bokning.dc.html"). Länkas från firmans EGEN hemsida, Google-
 * profilen eller ett SMS; storefronten (/site/[slug]) designas inte om.
 *
 * Före: repots sämsta kundyta — ingen logotyp, inget firmanamn, allt i
 * Handymates teal, 14 dagchips i rad, särskrivningsfel i rubriken,
 * bekräftelse med ISO-datum. Nu:
 *  - hantverkarens logotyp, accentfärg (ramp ur lib/bookings/booking-page)
 *    och företagsfot ur brand-lagret, stämpeln längst ner
 *  - tre lugna steg: välj dag (veckovis, mån–fre eller firmans dagar),
 *    välj tid, dina uppgifter med vald tid som rad + "Ändra"
 *  - bekräftelse på svenska med "Lägg i kalendern" (ICS i klienten) och
 *    ärlig ändringsväg: ring — kunden kan inte avboka själv, så vi säger det
 *  - 409/429/400 som lugna inforutor, aldrig alert
 *  - desktop ≥1024: förklaringen till vänster, hela bokningen i ett kort
 *
 * Sanningsregler: kunden bokar ett BESÖK (en timme), inte ett arbete.
 * "kostar inget" bara när firman valt det (visit_free). Inga prislöften.
 * Vem som kommer = kontaktpersonen, annars firmanamnet.
 *
 * Data: GET /api/public/booking-page/[slug] (varumärke + fjorton dagars
 * lediga tider i ett svar), POST /api/public/book/[slug] (orörd).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, Calendar, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { Attribution } from '@/lib/branding/attribution'
import AttributionStamp from '@/components/branding/AttributionStamp'
import { isValidSwedishPhone } from '@/lib/phone-normalize'
import type { Slot } from '@/lib/bookings/availability'
import {
  accentRamp,
  buildVisitIcs,
  dayLabel,
  groupWeeks,
  nextFreeDay,
  whenLong,
  whenShort,
  WEEKDAY_SHORT,
  type BookingDay,
  type WeekdayKey,
} from '@/lib/bookings/booking-page'

// ── Typer ──────────────────────────────────────────────────────────────────

interface BusinessInfo {
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  org_number: string | null
  f_skatt: boolean
  logo_url: string | null
  accent_color: string
}

interface PageData {
  business: BusinessInfo
  attribution: Attribution | null
  visit_free: boolean
  duration: number
  today: string
  columns: WeekdayKey[]
  hours_summary: string
  days: BookingDay[]
}

type Step = 'pick' | 'form' | 'done'
type Notice = { where: 'pick' | 'form'; title: string; text: string } | null

const DARK = '#0F172A'

// ── Sidan ──────────────────────────────────────────────────────────────────

export default function BokaPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [data, setData] = useState<PageData | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')

  const [weekIndex, setWeekIndex] = useState(0)
  const [date, setDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [step, setStep] = useState<Step>('pick')
  const [notice, setNotice] = useState<Notice>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [booked, setBooked] = useState<{ id: string; date: string; slot: Slot } | null>(null)

  // ── Hämta sidan (och ladda om listan efter en krock) ─────────────────────

  const load = useCallback(async (): Promise<PageData | null> => {
    try {
      const res = await fetch(`/api/public/booking-page/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      if (res.status === 404) {
        setLoadState('missing')
        return null
      }
      const json = (await res.json().catch(() => null)) as PageData | null
      if (!res.ok || !json?.business) {
        setLoadState('error')
        return null
      }
      setData(json)
      setLoadState('ready')
      return json
    } catch {
      setLoadState('error')
      return null
    }
  }, [slug])

  useEffect(() => {
    if (!slug) return
    load().then((json) => {
      if (!json) return
      const first = nextFreeDay(json.days)
      setDate(first?.date ?? json.days[0]?.date ?? null)
    })
  }, [slug, load])

  // ── Härledda värden ──────────────────────────────────────────────────────

  const ramp = useMemo(() => accentRamp(data?.business.accent_color), [data?.business.accent_color])
  const weeks = useMemo(() => (data ? groupWeeks(data.days, data.columns) : []), [data])
  const duration = data?.duration ?? 60

  // Vald dag styr vilken vecka som visas.
  useEffect(() => {
    if (!date || !weeks.length) return
    const i = weeks.findIndex((w) => w.cells.some((c) => c.date === date))
    if (i >= 0) setWeekIndex(i)
  }, [date, weeks])

  const week = weeks[Math.min(weekIndex, Math.max(weeks.length - 1, 0))]
  const day = data?.days.find((d) => d.date === date) ?? null
  const nextFree = data ? nextFreeDay(data.days, date) : null
  const person = data?.business.contact_name || data?.business.name || 'Vi'
  const firm = data?.business.name ?? ''
  const phoneOk = isValidSwedishPhone(phone)
  const canSubmit = !!(name.trim() && phone.trim() && slot && date && !submitting)

  // ── Handlingar ───────────────────────────────────────────────────────────

  function pickDay(d: string) {
    setDate(d)
    setSlot(null)
    setNotice(null)
  }

  function pickSlot(s: Slot) {
    setSlot(s)
    setNotice(null)
    setStep('form')
    if (typeof window !== 'undefined' && window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function changeWeek(delta: number) {
    const next = Math.min(Math.max(weekIndex + delta, 0), weeks.length - 1)
    setWeekIndex(next)
    const firstWithSlots = weeks[next]?.cells.find((c) => c.date && c.slotCount > 0) ?? weeks[next]?.cells.find((c) => c.date)
    if (firstWithSlots?.date) {
      setDate(firstWithSlots.date)
      setSlot(null)
    }
  }

  async function submit() {
    if (!canSubmit || !slot || !date) return
    if (!phoneOk) {
      setNotice({ where: 'form', title: 'Kontrollera mobilnumret.', text: 'Skriv det som 070-000 00 00 så vi kan skicka bekräftelsen.' })
      return
    }
    setSubmitting(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/public/book/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          time: slot.time,
          duration,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; booking_id?: string; error?: string }
      if (res.status === 409) {
        // Någon hann före — ladda om listan och gå tillbaka till tidvalet.
        const fresh = await load()
        setSlot(null)
        setStep('pick')
        setNotice({ where: 'pick', title: 'Tiden är tyvärr inte längre ledig.', text: 'Någon hann före. Välj en annan tid – listan är uppdaterad.' })
        if (fresh && !fresh.days.some((d) => d.date === date && d.slots.length)) {
          const nf = nextFreeDay(fresh.days)
          if (nf) setDate(nf.date)
        }
        return
      }
      if (res.status === 429) {
        setNotice({
          where: 'form',
          title: 'För många bokningsförsök.',
          text: `Försök igen om en stund${data?.business.phone ? `, eller ring oss på ${data.business.phone}` : ''}.`,
        })
        return
      }
      if (!res.ok || !json.ok) {
        setNotice({ where: 'form', title: 'Bokningen gick inte igenom.', text: json.error || 'Försök igen om en stund.' })
        return
      }
      setBooked({ id: json.booking_id || `book_${Date.now()}`, date, slot })
      setStep('done')
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setNotice({ where: 'form', title: 'Bokningen gick inte igenom.', text: 'Kontrollera uppkopplingen och försök igen.' })
    } finally {
      setSubmitting(false)
    }
  }

  function downloadIcs() {
    if (!booked || !data) return
    const ics = buildVisitIcs({
      uid: booked.id,
      startISO: booked.slot.startISO,
      endISO: booked.slot.endISO,
      businessName: data.business.name,
      phone: data.business.phone,
    })
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `besok-${booked.date}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // ── Render: laddar / saknas ──────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin" />
          <p className="text-sm">Hämtar lediga tider…</p>
        </div>
      </div>
    )
  }

  if (loadState !== 'ready' || !data) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">
            {loadState === 'missing' ? 'Bokningen är inte öppen' : 'Sidan kunde inte visas'}
          </h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {loadState === 'missing'
              ? 'Länken leder inte till någon bokningssida just nu. Hör av dig till firman direkt.'
              : 'Något gick fel när vi hämtade lediga tider. Ladda om sidan och försök igen.'}
          </p>
        </div>
      </div>
    )
  }

  const b = data.business

  // ── Byggstenar ───────────────────────────────────────────────────────────

  const header = (
    <div className="flex items-center gap-3 px-0.5 pt-1.5 pb-3 lg:hidden" style={{ borderBottom: `2px solid ${ramp.accent}` }}>
      <BrandMark business={b} ramp={ramp} size={42} />
      <div className="min-w-0">
        <div className="font-bold text-[16px] leading-tight text-slate-900 truncate">{b.name}</div>
        <div className="text-[12.5px] text-slate-500">Boka ett besök</div>
      </div>
    </div>
  )

  const footer = (
    <div className="text-center lg:text-left text-[12.5px] leading-relaxed text-slate-500">
      <strong className="text-slate-700">{b.name}</strong>
      {b.org_number && <> · Org.nr {b.org_number}</>}
      {b.f_skatt && <> · Godkänd för F-skatt</>}
      {(b.phone || b.email) && (
        <>
          <br />
          {b.phone && <a href={`tel:${b.phone.replace(/[\s-]/g, '')}`} className="text-slate-500">{b.phone}</a>}
          {b.phone && b.email && ' · '}
          {b.email && <a href={`mailto:${b.email}`} className="text-slate-500">{b.email}</a>}
        </>
      )}
      <div className="mt-3">
        <div className="inline-flex items-center gap-1.5 pl-2 pr-3 h-7 rounded-full border border-slate-200 bg-white text-[12px] font-medium text-slate-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="w-4 h-4 object-contain" />
          <AttributionStamp attribution={data.attribution} className="m-0" />
        </div>
      </div>
    </div>
  )

  const noticeBox = (n: NonNullable<Notice>) => (
    <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-red-50 border border-red-200 text-[13.5px] leading-relaxed text-red-800">
      <AlertCircle className="w-[18px] h-[18px] flex-none text-red-600 mt-0.5" />
      <span>
        <strong>{n.title}</strong> {n.text}
      </span>
    </div>
  )

  const stepNumber = (n: number, big = false) => (
    <span
      className={`${big ? 'w-7 h-7 text-[13px]' : 'w-6 h-6 text-[12px]'} rounded-full flex-none flex items-center justify-center font-bold`}
      style={{ background: ramp.a50, color: ramp.a700 }}
    >
      {n}
    </span>
  )

  // ── Bekräftelsen ─────────────────────────────────────────────────────────

  if (step === 'done' && booked) {
    const when = whenLong(booked.date, booked.slot.time, duration)
    const firstName = name.trim().split(' ')[0]
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <div className="max-w-md lg:max-w-xl mx-auto px-4 py-4 lg:py-10 flex flex-col gap-3">
          {header}
          <DesktopHeader business={b} ramp={ramp} />

          <div className="rounded-2xl px-5 py-6 text-white" style={{ background: DARK }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(74,222,128,.18)', color: '#4ade80' }}>
              <Check className="w-[18px] h-[18px]" strokeWidth={2.5} />
            </div>
            <h1 className="font-bold text-[23px] leading-tight tracking-tight mt-3.5">Tack {firstName}. Besöket är bokat.</h1>
            <div className="mt-3.5 p-3.5 rounded-xl" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)' }}>
              <div className="font-bold text-[18px]">{when}</div>
              <div className="text-[13.5px] mt-1" style={{ color: 'rgba(255,255,255,.7)' }}>
                {b.name} kommer till dig. Räkna med ungefär en timme.
              </div>
            </div>
            <button
              type="button"
              onClick={downloadIcs}
              className="w-full flex items-center justify-center gap-2 h-11 mt-3 rounded-xl text-white font-semibold text-[14px]"
              style={{ border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)' }}
            >
              <Calendar className="w-4 h-4" />
              Lägg i kalendern
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-[18px]">
            <div className="text-[11px] font-semibold tracking-[.14em] uppercase text-slate-500">Vad händer nu</div>
            <div className="flex flex-col gap-3 mt-3 text-[14px] leading-relaxed text-slate-700">
              <div className="flex gap-3">
                {stepNumber(1)}
                <span>
                  <strong className="text-slate-900">Du får ett SMS nu</strong> till {phone.trim()} med tiden.
                </span>
              </div>
              <div className="flex gap-3">
                {stepNumber(2)}
                <span>
                  <strong className="text-slate-900">{person} kommer på utsatt tid,</strong> tittar på jobbet och ställer frågor.
                </span>
              </div>
              <div className="flex gap-3">
                {stepNumber(3)}
                <span>
                  <strong className="text-slate-900">Du får en offert</strong> efter besöket.
                </span>
              </div>
            </div>
            <div className="mt-4 pt-3.5 border-t border-slate-200 text-[13.5px] leading-relaxed text-slate-700">
              Behöver du ändra tiden?{' '}
              {b.phone ? (
                <>
                  Ring oss på{' '}
                  <a href={`tel:${b.phone.replace(/[\s-]/g, '')}`} className="font-semibold text-slate-900">
                    {b.phone}
                  </a>
                  .
                </>
              ) : b.email ? (
                <>
                  Mejla oss på{' '}
                  <a href={`mailto:${b.email}`} className="font-semibold text-slate-900">
                    {b.email}
                  </a>
                  .
                </>
              ) : (
                <>Hör av dig till {b.name}.</>
              )}{' '}
              Du kan inte ändra bokningen här ännu.
            </div>
          </div>

          <div className="mt-2 pt-4 border-t border-slate-200 lg:text-center">{footer}</div>
        </div>
      </div>
    )
  }

  // ── Välj tid + dina uppgifter ────────────────────────────────────────────

  const pickerVisible = step === 'pick' ? 'flex' : 'hidden lg:flex'
  const formVisible = step === 'form' ? 'flex' : 'hidden lg:flex'

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <DesktopHeader business={b} ramp={ramp} />

      <div className="max-w-md lg:max-w-[1120px] mx-auto px-4 lg:px-10 py-4 lg:py-14 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_520px] lg:gap-12 lg:items-start">
        {header}

        {/* Desktop: vad besöket är, till vänster */}
        <div className="hidden lg:block pt-2">
          <h1 className="font-bold text-[40px] leading-[1.1] tracking-tight">Vi kommer ut och tittar. Sedan får du en offert.</h1>
          <p className="text-[16px] leading-relaxed text-slate-700 mt-4 max-w-[480px]">
            {person} kommer hem till dig på utsatt tid, tittar på jobbet och ställer frågor. Besöket tar ungefär en timme
            {data.visit_free ? ' och kostar inget' : ''}. Efter besöket får du en offert.
          </p>
          <div className="flex flex-col gap-3.5 mt-8 text-[15px] leading-relaxed text-slate-700">
            <div className="flex gap-3.5">
              {stepNumber(1, true)}
              <span>
                <strong className="text-slate-900">Välj en tid</strong> som passar dig{data.hours_summary ? `, ${data.hours_summary}` : ''}.
              </span>
            </div>
            <div className="flex gap-3.5">
              {stepNumber(2, true)}
              <span>
                <strong className="text-slate-900">Du får ett SMS direkt</strong> med bekräftelsen. Inget konto, ingen betalning.
              </span>
            </div>
            <div className="flex gap-3.5">
              {stepNumber(3, true)}
              <span>
                <strong className="text-slate-900">Behöver du ändra?</strong>{' '}
                {b.phone ? `Ring oss på ${b.phone}.` : b.email ? `Mejla oss på ${b.email}.` : 'Hör av dig till oss.'}
              </span>
            </div>
          </div>
          <div className="mt-12">{footer}</div>
        </div>

        {/* Bokningskortet */}
        <div className="bg-white border border-slate-200 rounded-2xl p-[18px] lg:p-7 flex flex-col gap-3.5 lg:gap-4">
          {/* Mobil: vald tid + Ändra, ovanför formuläret */}
          {step === 'form' && slot && date && (
            <div
              className="lg:hidden flex justify-between items-center gap-2.5 px-3.5 py-3 rounded-xl"
              style={{ background: ramp.a50, border: `1px solid ${ramp.a100}` }}
            >
              <div className="flex items-center gap-2.5 text-slate-900">
                <Calendar className="w-[18px] h-[18px]" style={{ color: ramp.a700 }} />
                <span className="font-semibold text-[14.5px]">{whenShort(date, slot.time, duration)}</span>
              </div>
              <button type="button" onClick={() => { setStep('pick'); setNotice(null) }} className="font-semibold text-[13.5px] text-slate-700">
                Ändra
              </button>
            </div>
          )}

          {/* Steg 1–2: välj dag och tid */}
          <div className={`${pickerVisible} flex-col gap-3.5 lg:gap-4`}>
            <div>
              <h2 className="font-bold text-[21px] lg:text-[22px] leading-tight tracking-tight">När passar det att vi kommer?</h2>
              <p className="lg:hidden text-[13.5px] leading-relaxed text-slate-500 mt-1.5">
                {person} kommer hem till dig, tittar på jobbet och återkommer med offert. Besöket tar ungefär en timme
                {data.visit_free ? ' och kostar inget' : ''}.
              </p>
            </div>

            {notice?.where === 'pick' && noticeBox(notice)}

            {weeks.length === 0 || !week ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-[14px] leading-relaxed text-slate-700 text-center">
                Det finns inga bokningsbara tider just nu.
                {b.phone ? (
                  <>
                    <br />
                    Ring oss på{' '}
                    <a href={`tel:${b.phone.replace(/[\s-]/g, '')}`} className="font-semibold text-slate-900">
                      {b.phone}
                    </a>{' '}
                    så hittar vi en tid.
                  </>
                ) : null}
              </div>
            ) : (
              <>
                {/* WeekPicker */}
                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => changeWeek(-1)}
                    disabled={weekIndex === 0}
                    aria-label="Föregående vecka"
                    className="w-9 h-9 rounded-[10px] border border-slate-200 bg-white text-slate-700 flex items-center justify-center disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-semibold text-[14px] lg:text-[14.5px]">{week.label}</span>
                  <button
                    type="button"
                    onClick={() => changeWeek(1)}
                    disabled={weekIndex >= weeks.length - 1}
                    aria-label="Nästa vecka"
                    className="w-9 h-9 rounded-[10px] border border-slate-200 bg-white text-slate-700 flex items-center justify-center disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid gap-1.5 lg:gap-2" style={{ gridTemplateColumns: `repeat(${week.cells.length}, minmax(0, 1fr))` }}>
                  {week.cells.map((c) => {
                    const selected = !!c.date && c.date === date
                    const available = !!c.date && c.slotCount > 0
                    return (
                      <button
                        key={c.weekday}
                        type="button"
                        disabled={!available}
                        onClick={() => c.date && pickDay(c.date)}
                        className="h-[60px] lg:h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 p-0"
                        style={{
                          border: `1px solid ${selected ? ramp.accent : '#E2E8F0'}`,
                          background: selected ? ramp.accent : available ? '#fff' : '#F8FAFC',
                          color: selected ? ramp.onAccent : available ? DARK : '#CBD5E1',
                          cursor: available ? 'pointer' : 'default',
                        }}
                      >
                        <span className="text-[11.5px] lg:text-[12px] uppercase tracking-[.06em] opacity-80">{WEEKDAY_SHORT[c.weekday]}</span>
                        <span className="font-bold text-[17px] lg:text-[18px]">{c.date ? Number(c.date.slice(8, 10)) : '–'}</span>
                      </button>
                    )
                  })}
                </div>

                {/* SlotGrid */}
                {day && (
                  <div className="text-[13px] lg:text-[13.5px] text-slate-500">
                    {day.slots.length
                      ? `${day.slots.length} ${day.slots.length === 1 ? 'ledig tid' : 'lediga tider'} ${dayLabel(day.date)}`
                      : `${dayLabel(day.date).charAt(0).toUpperCase()}${dayLabel(day.date).slice(1)}`}
                  </div>
                )}
                {day && day.slots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {day.slots.map((s) => {
                      const selected = slot?.time === s.time
                      return (
                        <button
                          key={s.time}
                          type="button"
                          onClick={() => pickSlot(s)}
                          className="h-11 lg:h-[46px] rounded-[10px] font-semibold text-[15px] tabular-nums"
                          style={{
                            border: `1px solid ${selected ? ramp.accent : '#E2E8F0'}`,
                            background: selected ? ramp.accent : '#fff',
                            color: selected ? ramp.onAccent : DARK,
                          }}
                        >
                          {s.time}
                        </button>
                      )
                    })}
                  </div>
                )}
                {day && day.slots.length === 0 && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-[14px] leading-relaxed text-slate-700 text-center">
                    Inga lediga tider den dagen.
                    {nextFree && (
                      <>
                        <br />
                        <button type="button" onClick={() => pickDay(nextFree.date)} className="font-semibold text-slate-900">
                          Nästa lediga: {dayLabel(nextFree.date)}
                        </button>
                      </>
                    )}
                  </div>
                )}
                <p className="lg:hidden text-[12.5px] leading-relaxed text-slate-400 text-center">
                  Tider visas i {duration}-minutersluckor inom {b.name}s arbetstider{data.hours_summary ? `, ${data.hours_summary}` : ''}.
                </p>
              </>
            )}
          </div>

          {/* Steg 3: dina uppgifter */}
          <div className={`${formVisible} flex-col gap-3.5 lg:gap-4`}>
            <div className="hidden lg:block h-px bg-slate-200" />
            <h2 className="lg:hidden font-bold text-[19px] leading-tight tracking-tight">Dina uppgifter</h2>

            {notice?.where === 'form' && noticeBox(notice)}

            <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-3">
              <label className="flex flex-col gap-1.5 text-[13px] text-slate-500">
                Namn
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Förnamn Efternamn"
                  autoComplete="name"
                  maxLength={120}
                  className="h-12 lg:h-[46px] border border-slate-300 rounded-[10px] px-3.5 font-medium text-[16px] lg:text-[15px] text-slate-900 bg-white outline-none focus:border-slate-500"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] text-slate-500">
                Mobilnummer
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="070-000 00 00"
                  maxLength={20}
                  className="h-12 lg:h-[46px] border border-slate-300 rounded-[10px] px-3.5 font-medium text-[16px] lg:text-[15px] text-slate-900 bg-white outline-none focus:border-slate-500"
                />
                <span className="lg:hidden text-[12px] text-slate-400">Bekräftelsen kommer som SMS.</span>
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] text-slate-500">
              <span className="flex justify-between">
                E-post <span className="text-slate-400">valfritt</span>
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="namn@exempel.se"
                maxLength={160}
                className="h-12 lg:h-[46px] border border-slate-300 rounded-[10px] px-3.5 font-medium text-[16px] lg:text-[15px] text-slate-900 bg-white outline-none focus:border-slate-500"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] text-slate-500">
              <span className="flex justify-between">
                Vad gäller det? <span className="text-slate-400">valfritt</span>
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="T.ex. badrum som ska renoveras, ca 6 kvm"
                className="border border-slate-300 rounded-[10px] px-3.5 py-3 text-[15px] leading-snug text-slate-900 bg-white outline-none focus:border-slate-500 resize-none"
              />
            </label>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="h-[52px] rounded-xl text-white font-semibold text-[16px] disabled:opacity-45 flex items-center justify-center gap-2"
              style={{ background: DARK }}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="lg:hidden">{submitting ? 'Bokar…' : 'Boka besöket'}</span>
              <span className="hidden lg:inline">
                {submitting ? 'Bokar…' : slot && date ? `Boka besöket ${whenShort(date, slot.time, duration)}` : 'Välj en tid först'}
              </span>
            </button>
            <p className="text-[12.5px] leading-relaxed text-slate-500 text-center">
              <span className="hidden lg:inline">Bekräftelsen kommer som SMS. </span>
              <span className="lg:hidden">Inget konto, ingen betalning. </span>
              Dina uppgifter går bara till {firm}.
            </p>
          </div>
        </div>

        <div className="lg:hidden mt-2 pt-4 border-t border-slate-200">{footer}</div>
      </div>
    </div>
  )
}

// ── Delkomponenter ─────────────────────────────────────────────────────────

/**
 * Logotyp i vit ruta, annars firmans initial på accenten. Rutan är kvadratisk
 * för kvadratiska loggor men får växa på bredden (max 3×) — de flesta
 * hantverkarloggor är liggande och blir en strimma i en kvadrat.
 */
function BrandMark({ business, ramp, size }: { business: BusinessInfo; ramp: ReturnType<typeof accentRamp>; size: number }) {
  const [broken, setBroken] = useState(false)
  const initial = (business.name || 'H').charAt(0).toUpperCase()
  if (business.logo_url && !broken) {
    return (
      <div
        className="rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-none overflow-hidden px-1"
        style={{ minWidth: size, maxWidth: size * 3, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={business.logo_url}
          alt={business.name}
          className="object-contain w-auto"
          style={{ height: size - 10, maxWidth: size * 3 - 12 }}
          onError={() => setBroken(true)}
        />
      </div>
    )
  }
  return (
    <div
      className="rounded-xl flex items-center justify-center flex-none font-bold"
      style={{ width: size, height: size, background: ramp.accent, color: ramp.onAccent, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </div>
  )
}

/** Desktop ≥1024: 64 px list med logotyp, firmanamn och telefon. */
function DesktopHeader({ business, ramp }: { business: BusinessInfo; ramp: ReturnType<typeof accentRamp> }) {
  return (
    <div className="hidden lg:flex h-16 px-10 items-center gap-3 bg-white" style={{ borderBottom: `2px solid ${ramp.accent}` }}>
      <BrandMark business={business} ramp={ramp} size={36} />
      <div className="font-bold text-[16px]">{business.name}</div>
      <span className="ml-auto text-[13.5px] text-slate-500">
        Boka ett besök{business.phone ? ` · ${business.phone}` : ''}
      </span>
    </div>
  )
}
