'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface Slot { time: string; startISO: string; endISO: string }

function nextDays(n: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const base = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() + i * 86400000)
    const value = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })
    out.push({ value, label: i === 0 ? `Idag · ${label}` : label })
  }
  return out
}

export default function PublicBookingPage() {
  const params = useParams()
  const slug = Array.isArray(params.slug) ? params.slug[0] : (params.slug as string)

  const days = nextDays(14)
  const [date, setDate] = useState(days[0].value)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [picked, setPicked] = useState<Slot | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSlots = useCallback(async (d: string) => {
    setLoadingSlots(true); setSlots([]); setPicked(null)
    try {
      const res = await fetch(`/api/public/availability/${slug}?date=${d}&duration=60`)
      if (res.ok) { const j = await res.json(); setSlots(j.slots || []) }
    } catch { /* ignore */ }
    setLoadingSlots(false)
  }, [slug])

  useEffect(() => { loadSlots(date) }, [date, loadSlots])

  async function submit() {
    if (!picked) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/public/book/${slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time: picked.time, duration: 60, ...form }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Kunde inte boka tiden'); if (res.status === 409) loadSlots(date) }
      else setDone(`${date} kl ${picked.time}`)
    } catch { setError('Något gick fel. Försök igen.') }
    setSubmitting(false)
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 32 }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: '8px 0' }}>Tiden är bokad!</h1>
          <p style={{ color: '#475569' }}>Vi har bokat <strong>{done}</strong>. Du får en bekräftelse via SMS.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: 24 }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Boka tid</h1>
        <p style={{ color: '#64748B', marginBottom: 20 }}>Välj en tid som passar dig.</p>

        {/* Datum */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16 }}>
          {days.map(d => (
            <button key={d.value} onClick={() => setDate(d.value)}
              style={{
                whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: '1px solid ' + (date === d.value ? '#0F766E' : '#E2E8F0'),
                background: date === d.value ? '#0F766E' : '#fff', color: date === d.value ? '#fff' : '#475569',
              }}>{d.label}</button>
          ))}
        </div>

        {/* Slots */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          {loadingSlots ? <p style={{ color: '#94A3B8', textAlign: 'center', margin: 0 }}>Laddar tider…</p>
            : slots.length === 0 ? <p style={{ color: '#94A3B8', textAlign: 'center', margin: 0 }}>Inga lediga tider denna dag.</p>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
                {slots.map(s => (
                  <button key={s.time} onClick={() => setPicked(s)}
                    style={{
                      padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      border: '1px solid ' + (picked?.time === s.time ? '#0F766E' : '#E2E8F0'),
                      background: picked?.time === s.time ? '#0F766E' : '#fff', color: picked?.time === s.time ? '#fff' : '#0F172A',
                    }}>{s.time}</button>
                ))}
              </div>
            )}
        </div>

        {/* Formulär */}
        {picked && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16 }}>
            <p style={{ fontWeight: 600, color: '#0F172A', marginTop: 0 }}>Din uppgifter — {date} kl {picked.time}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Namn" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} />
              <input placeholder="Telefonnummer" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inp} />
              <input placeholder="E-post (valfritt)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inp} />
              <textarea placeholder="Vad gäller det? (valfritt)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inp, minHeight: 70 }} />
              {error && <p style={{ color: '#BE123C', fontSize: 13, margin: 0 }}>{error}</p>}
              <button onClick={submit} disabled={submitting || !form.name || !form.phone}
                style={{ padding: '12px', borderRadius: 10, border: 'none', background: '#0F766E', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: submitting || !form.name || !form.phone ? 0.5 : 1 }}>
                {submitting ? 'Bokar…' : 'Boka tiden'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = { padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }
