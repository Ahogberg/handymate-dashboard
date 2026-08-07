'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { getAllCategories } from '@/lib/constants/categories'
import type { ReservationTrigger } from '@/lib/reservations/match'

/**
 * Reservationsbiblioteket — Inställningar → Förbehåll.
 *
 * ═══ VARFÖR SIDAN FINNS (spår C3, 2026-08-06) ═══
 *
 * ReservationSuggestionBanner lovade redan i klartext: "Du kan ändra det under
 * Inställningar → Reservationer." Den sidan fanns inte. Ett gränssnitt som
 * hänvisar till en plats som inte existerar är värre än att inte hänvisa alls
 * — hantverkaren letar, hittar inte, och slutar tro på nästa hänvisning.
 *
 * Sidan ger fyra saker som saknades helt:
 *
 * 1. **Se biblioteket.** Förbehållen fanns bara som förslag i offertflödet.
 * 2. **Slå på och av.** Muted-läget kunde bara nås genom att avvisa tre
 *    gånger i rad; det gick inte att ångra någonstans.
 * 3. **Skriva ett eget.** POST /api/reservations fanns men hade INGEN
 *    anropare — samma felklass som resten av veckan.
 * 4. **Koppla en artikel.** Motorn stöder produkttriggrar sedan B1
 *    (match.ts:70), men noll fanns i databasen eftersom ingenting kunde skapa
 *    dem. Här skapas de.
 *
 * "Förbehåll" i UI:t, aldrig "reservation" — det senare betyder bokning för
 * de flesta. Rutten heter reservations för att matcha tabellen.
 */

interface Reservation {
  id: string
  title: string
  content: string
  is_active?: boolean
  suggest_enabled?: boolean
  consecutive_rejects?: number
  sort_order?: number
  source?: string
  triggers: ReservationTrigger[]
}

interface Product {
  id: string
  name: string
  sku?: string | null
  unit: string
}

const KATEGORIER = getAllCategories()

function triggerEtikett(t: ReservationTrigger, produkter: Product[]): string {
  if (t.trigger_type === 'product') {
    const p = produkter.find(x => x.id === t.product_id)
    return p ? p.name : 'En artikel'
  }
  if (t.trigger_type === 'category') {
    const k = KATEGORIER.find(c => c.slug === t.category_slug)
    return k ? k.label : (t.category_slug || 'Kategori')
  }
  return `«${t.keyword}»`
}

export default function ReservationsSettingsPage() {
  const toast = useToast()

  const [reservationer, setReservationer] = useState<Reservation[]>([])
  const [produkter, setProdukter] = useState<Product[]>([])
  const [laddar, setLaddar] = useState(true)
  const [sparar, setSparar] = useState(false)

  const [redigerarId, setRedigerarId] = useState<string | null>(null)
  const [visaNy, setVisaNy] = useState(false)
  const [titel, setTitel] = useState('')
  const [text, setText] = useState('')
  const [triggrar, setTriggrar] = useState<ReservationTrigger[]>([])
  const [artikelSok, setArtikelSok] = useState('')
  const [nyttNyckelord, setNyttNyckelord] = useState('')

  const hamta = useCallback(async () => {
    setLaddar(true)
    try {
      const [rRes, pRes] = await Promise.all([
        fetch('/api/reservations?include=triggers'),
        fetch('/api/products'),
      ])
      const rData = rRes.ok ? await rRes.json() : { reservations: [] }
      const pData = pRes.ok ? await pRes.json() : { products: [] }
      setReservationer(rData.reservations || [])
      setProdukter(pData.products || [])
    } catch {
      toast.error('Kunde inte hämta förbehållen')
    } finally {
      setLaddar(false)
    }
  }, [toast])

  useEffect(() => { void hamta() }, [hamta])

  const nollstall = () => {
    setRedigerarId(null)
    setVisaNy(false)
    setTitel('')
    setText('')
    setTriggrar([])
    setArtikelSok('')
    setNyttNyckelord('')
  }

  const oppnaNy = () => {
    nollstall()
    setVisaNy(true)
  }

  const oppnaRedigering = (r: Reservation) => {
    setVisaNy(false)
    setRedigerarId(r.id)
    setTitel(r.title)
    setText(r.content)
    setTriggrar(r.triggers || [])
    setArtikelSok('')
    setNyttNyckelord('')
  }

  const spara = async () => {
    if (!titel.trim() || !text.trim()) {
      toast.error('Både rubrik och text behövs')
      return
    }
    setSparar(true)
    try {
      const redigerar = !!redigerarId
      const res = await fetch('/api/reservations', {
        method: redigerar ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(redigerar ? { id: redigerarId } : {}),
          title: titel.trim(),
          content: text.trim(),
          triggers: triggrar,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success(redigerar ? 'Förbehållet uppdaterat' : 'Förbehållet skapat')
      nollstall()
      await hamta()
    } catch {
      toast.error('Kunde inte spara förbehållet')
    } finally {
      setSparar(false)
    }
  }

  /**
   * Slår på och av att förbehållet FÖRESLÅS. `is_active` rörs inte: ett
   * förbehåll som redan ligger på en skickad offert ska stå kvar där även om
   * hantverkaren slutar vilja ha det föreslaget i framtiden.
   */
  const vaxlaForslag = async (r: Reservation) => {
    const nytt = !(r.suggest_enabled ?? true)
    setReservationer(prev => prev.map(x => (x.id === r.id ? { ...x, suggest_enabled: nytt, consecutive_rejects: nytt ? 0 : x.consecutive_rejects } : x)))
    try {
      const res = await fetch('/api/reservations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, suggest_enabled: nytt }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      // Rulla tillbaka — en växel som ser på men inte är det är värre än ett fel.
      setReservationer(prev => prev.map(x => (x.id === r.id ? r : x)))
      toast.error('Kunde inte ändra')
    }
  }

  const taBort = async (r: Reservation) => {
    if (!confirm(`Ta bort förbehållet «${r.title}»? Offerter som redan skickats påverkas inte.`)) return
    try {
      const res = await fetch(`/api/reservations?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(String(res.status))
      setReservationer(prev => prev.filter(x => x.id !== r.id))
      toast.success('Förbehållet borttaget')
    } catch {
      toast.error('Kunde inte ta bort')
    }
  }

  const laggTillTrigger = (t: ReservationTrigger) => {
    setTriggrar(prev => {
      const finns = prev.some(x =>
        x.trigger_type === t.trigger_type &&
        x.product_id === t.product_id &&
        x.category_slug === t.category_slug &&
        x.keyword === t.keyword,
      )
      return finns ? prev : [...prev, t]
    })
  }

  const taBortTrigger = (i: number) => setTriggrar(prev => prev.filter((_, n) => n !== i))

  const artikelTraffar = useMemo(() => {
    const q = artikelSok.trim().toLowerCase()
    if (!q) return []
    return produkter
      .filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [artikelSok, produkter])

  const formularOppet = visaNy || !!redigerarId

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="text-gray-400 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Förbehåll</h1>
            <p className="text-gray-500 text-sm">
              Villkor som föreslås automatiskt när offerten innehåller vissa arbeten
            </p>
          </div>
        </div>
        {!formularOppet && (
          <button
            onClick={oppnaNy}
            className="flex items-center gap-2 px-4 min-h-[44px] bg-primary-700 text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Nytt förbehåll
          </button>
        )}
      </div>

      {formularOppet && (
        <div className="mb-6 p-5 bg-white border border-slate-200 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {redigerarId ? 'Ändra förbehåll' : 'Nytt förbehåll'}
            </h2>
            <button onClick={nollstall} aria-label="Avbryt" className="p-2 -m-2 text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Rubrik</label>
            <input
              value={titel}
              onChange={e => setTitel(e.target.value)}
              placeholder="t.ex. Dolda fel bakom ytskikt"
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Text till kunden</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={3}
              placeholder="Skriv som du skulle sagt det till kunden."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          {/* Kopplingarna: när ska det här förbehållet föreslås? */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Föreslås när offerten innehåller</label>

            {triggrar.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {triggrar.map((t, i) => (
                  <span
                    key={`${t.trigger_type}_${t.product_id || t.category_slug || t.keyword}_${i}`}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-primary-50 border border-primary-100 text-primary-800 text-sm rounded-full"
                  >
                    {triggerEtikett(t, produkter)}
                    <button
                      onClick={() => taBortTrigger(i)}
                      aria-label={`Ta bort kopplingen ${triggerEtikett(t, produkter)}`}
                      className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-primary-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {triggrar.length === 0 && (
              <p className="text-sm text-slate-500 mb-3">
                Utan kopplingar föreslås förbehållet aldrig av sig självt — men du kan
                fortfarande lägga till det för hand i en offert.
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              {/* Artikel — den koppling som varit omöjlig att skapa förut */}
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    value={artikelSok}
                    onChange={e => setArtikelSok(e.target.value)}
                    placeholder="Sök artikel att koppla…"
                    className="w-full min-h-[44px] pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary-600"
                  />
                </div>
                {artikelTraffar.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {artikelTraffar.map(p => (
                      <li key={p.id}>
                        <button
                          onClick={() => {
                            laggTillTrigger({ trigger_type: 'product', product_id: p.id })
                            setArtikelSok('')
                          }}
                          className="w-full min-h-[44px] px-3 py-2 text-left text-sm bg-white border border-slate-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/40"
                        >
                          {p.name}
                          {p.sku && <span className="block text-[11px] text-slate-400">{p.sku}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Nyckelord */}
              <div className="flex gap-2">
                <input
                  value={nyttNyckelord}
                  onChange={e => setNyttNyckelord(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && nyttNyckelord.trim()) {
                      e.preventDefault()
                      laggTillTrigger({ trigger_type: 'keyword', keyword: nyttNyckelord.trim().toLowerCase() })
                      setNyttNyckelord('')
                    }
                  }}
                  placeholder="Ord i beskrivningen…"
                  className="flex-1 min-h-[44px] px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
                <button
                  onClick={() => {
                    if (!nyttNyckelord.trim()) return
                    laggTillTrigger({ trigger_type: 'keyword', keyword: nyttNyckelord.trim().toLowerCase() })
                    setNyttNyckelord('')
                  }}
                  className="px-4 min-h-[44px] bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Lägg till
                </button>
              </div>
            </div>

            {/* Ett generiskt ord som "arbete" träffar nästan varje rad, och efter
                tre avvisningar tystas förbehållet av inlärningen. Varningen är
                billigare än den tystnaden. */}
            {triggrar.some(t => t.trigger_type === 'keyword' && (t.keyword || '').length <= 6) && (
              <p className="mt-2 text-xs text-amber-700">
                Korta ord träffar brett. Kopplar du till en artikel i stället blir förslaget
                mer träffsäkert.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => void spara()}
              disabled={sparar}
              className="inline-flex items-center gap-2 px-5 min-h-[44px] bg-primary-700 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-60"
            >
              {sparar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Spara
            </button>
            <button
              onClick={nollstall}
              className="px-4 min-h-[44px] text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {laddar ? (
        <p className="flex items-center gap-2 text-slate-500 py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Hämtar dina förbehåll…
        </p>
      ) : reservationer.length === 0 ? (
        <div className="p-6 bg-white border border-slate-200 rounded-xl text-center">
          <p className="text-slate-600">Du har inga förbehåll än.</p>
          <p className="text-sm text-slate-500 mt-1">
            De vanligaste för din bransch läggs till automatiskt vid uppstart. Du kan
            skriva egna här.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {reservationer.map(r => {
            const foreslas = r.suggest_enabled ?? true
            const tystad = !foreslas && (r.consecutive_rejects ?? 0) >= 3
            return (
              <li key={r.id} className="p-4 bg-white border border-slate-200 rounded-xl">
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => oppnaRedigering(r)} className="min-w-0 flex-1 text-left">
                    <span className="block font-semibold text-gray-900">{r.title}</span>
                    <span className="block text-sm text-slate-600 mt-0.5 line-clamp-2">{r.content}</span>

                    {r.triggers?.length > 0 && (
                      <span className="flex flex-wrap gap-1.5 mt-2">
                        {r.triggers.map((t, i) => (
                          <span
                            key={`${r.id}_t${i}`}
                            className="px-2 py-0.5 text-[11px] bg-slate-100 text-slate-600 rounded-full"
                          >
                            {triggerEtikett(t, produkter)}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      role="switch"
                      aria-checked={foreslas}
                      aria-label={foreslas ? `Sluta föreslå ${r.title}` : `Föreslå ${r.title} igen`}
                      onClick={() => void vaxlaForslag(r)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${foreslas ? 'bg-primary-700' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${foreslas ? 'left-[22px]' : 'left-0.5'}`}
                      />
                    </button>
                    <button
                      onClick={() => void taBort(r)}
                      aria-label={`Ta bort ${r.title}`}
                      className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Tystnaden ska gå att förstå och ångra — den var tidigare
                    osynlig och permanent. */}
                {tystad && (
                  <p className="mt-2 text-xs text-slate-500">
                    Föreslås inte längre — du tackade nej tre gånger i rad. Slå på växeln
                    för att börja om.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
