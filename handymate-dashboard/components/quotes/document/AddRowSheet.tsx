'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Heading1, Loader2, Minus, Plus, Search, Star, X } from 'lucide-react'
import type { ProductWithComponents } from '@/app/dashboard/quotes/_shared/applyProductToItem'
import { useAllProducts, useProductSearch } from '@/app/dashboard/quotes/_shared/useProductSearch'
import { priceLabel, priceState } from '@/lib/products/pricing-state'

interface AddRowSheetProps {
  open: boolean
  /** Vald produkt → raden förfylls via addFromProductBank (snapshot byggs). */
  onSelectProduct: (product: ProductWithComponents, quantity: number) => void
  /** Tom rad, eventuellt med beskrivningen som skrivits. */
  onAddBlankRow: (description: string) => void
  /** Rubrikrad — grupperar offerten. */
  onAddHeading: () => void
  onClose: () => void
  /**
   * Hur många förbehåll artikeln drar med sig (spår C2). Utelämnad → inget
   * visas, så anropare utan reservationsmotor påverkas inte.
   */
  reservationCount?: (product: ProductWithComponents) => number
}

/** Kategorierna i den ordning hantverkaren tänker på dem. */
const KATEGORI_ORDNING = ['arbete', 'material', 'hyra', 'övrigt']

const KATEGORI_ETIKETT: Record<string, string> = {
  arbete: 'Arbete',
  material: 'Material',
  hyra: 'Maskiner och hyra',
  övrigt: 'Övrigt',
}

function kategoriEtikett(key: string): string {
  return KATEGORI_ETIKETT[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Övrigt')
}

/**
 * AddRowSheet — vägen in i artikelbanken från offertens canvas.
 *
 * ═══ VARFÖR BLÄDDRA FÖRE SÖK (spår B2) ═══
 *
 * Sheeten visade tidigare favoriterna (1–6 st) och ett sökfält. Sökning som
 * enda väg in förutsätter att hantverkaren vet vad artikeln HETER — och efter
 * utökningen 2026-08-06 (95 artiklar för el, 84 för bygg) är det skillnaden
 * mellan en bank han använder och en han gissar sig förbi.
 *
 * Nu: favoriterna först, sedan kategorierna som fällbara listor. Sökning
 * filtrerar i stället för att vara porten. Kategorierna är stängda från start
 * — nittiofem rader utfällda är en vägg, inte en lista.
 *
 * Sökningen går fortfarande till servern, inte mot den hämtade listan: den
 * expanderar synonymer, så "eluttag" hittar "Vägguttag". Lokal filtrering
 * hade tappat det tyst.
 *
 * ═══ VARFÖR ANTAL HÄR (spår B3) ═══
 *
 * Vägen till "8 timmar" var: välj artikel → raden får antal 1 → tryck raden →
 * RowEditSheet → skriv antal → stäng. Fyra extra interaktioner för det
 * vanligaste av alla fall. Stegaren sitter nu i raden och stoppar
 * propagering; själva kortet är fortfarande "lägg till", så snabbvägen (tryck
 * = en enhet) är oförändrad.
 *
 * Mönster och 44px-fält från RowEditSheet (samma overlay, drag-indikator,
 * Escape + scroll-lås, slide-up). Två sheets med samma formspråk är
 * medvetet — hantverkaren lär sig ETT rörelsemönster.
 */
export function AddRowSheet({
  open,
  onSelectProduct,
  onAddBlankRow,
  onAddHeading,
  onClose,
  reservationCount,
}: AddRowSheetProps) {
  const [query, setQuery] = useState('')
  const { results, loading } = useProductSearch(query)
  const { products: alla, loading: laddarAlla } = useAllProducts(open)
  const [oppnaKategorier, setOppnaKategorier] = useState<string[]>([])
  // Antal per artikel, bara för de rader hantverkaren rört. Nyckeln är
  // produkt-id; en artikel som aldrig rörts är alltid 1.
  const [antal, setAntal] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  // Nollställ mellan öppningar — annars möts hantverkaren av förra radens
  // sökning och förra artikelns antal nästa gång sheeten öppnas.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setAntal({})
      setOppnaKategorier([])
    }
  }, [open])

  const favoriter = useMemo(() => alla.filter(p => p.is_favorite), [alla])

  const kategorier = useMemo(() => {
    const grupper = new Map<string, ProductWithComponents[]>()
    for (const p of alla) {
      const key = ((p as { category?: string }).category || 'övrigt').toLowerCase()
      const lista = grupper.get(key)
      if (lista) lista.push(p)
      else grupper.set(key, [p])
    }
    return Array.from(grupper.entries()).sort((a, b) => {
      const ai = KATEGORI_ORDNING.indexOf(a[0])
      const bi = KATEGORI_ORDNING.indexOf(b[0])
      // Okända kategorier hamnar sist, inbördes i bokstavsordning.
      if (ai === -1 && bi === -1) return a[0].localeCompare(b[0], 'sv')
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [alla])

  if (!open) return null

  const trimmed = query.trim()
  const soker = trimmed.length > 0

  const antalFor = (id: string) => antal[id] ?? 1

  const andraAntal = (id: string, delta: number) => {
    setAntal(prev => {
      const nytt = Math.max(1, (prev[id] ?? 1) + delta)
      return { ...prev, [id]: nytt }
    })
  }

  const pick = (product: ProductWithComponents) => {
    onSelectProduct(product, antalFor(product.id))
    onClose()
  }

  const addBlank = () => {
    onAddBlankRow(trimmed)
    onClose()
  }

  const addHeading = () => {
    onAddHeading()
    onClose()
  }

  const toggleKategori = (key: string) => {
    setOppnaKategorier(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))
  }

  function ArtikelKort({ product }: { product: ProductWithComponents }) {
    const n = antalFor(product.id)
    const forbehall = reservationCount?.(product) ?? 0
    return (
      <li>
        <button
          type="button"
          onClick={() => pick(product)}
          className="w-full flex flex-col gap-1 px-3.5 py-2.5 text-left bg-white border border-slate-200 rounded-xl hover:border-primary-300 hover:bg-primary-50/40 active:bg-primary-50 transition-colors"
        >
          <span className="flex items-center gap-1.5 w-full">
            {product.is_favorite && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
            <span className="text-[15px] text-slate-900 truncate flex-1">{product.name}</span>
            {product.rot_eligible && (
              <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 uppercase tracking-wider shrink-0">
                ROT
              </span>
            )}
            {product.rut_eligible && (
              <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-sky-50 text-sky-700 rounded-full border border-sky-100 uppercase tracking-wider shrink-0">
                RUT
              </span>
            )}
          </span>

          <span className="flex items-center justify-between gap-3 w-full">
            <span className="min-w-0 flex-1">
              {/* En prislös artikel säger "Sätt pris", aldrig "0 kr" — det
                  senare hade påstått att den är gratis. Priset förtjänas av
                  användning; se lib/products/pricing-state.ts. */}
              <span
                className={`text-sm font-semibold tabular-nums ${
                  priceState(product.sales_price) === 'osatt' ? 'text-primary-700 font-medium' : 'text-slate-700'
                }`}
              >
                {priceLabel(product.sales_price, product.unit)}
              </span>
              {/* SPÅR C2: förbehållen syns INNAN raden läggs till. Motorn
                  kunde redan matcha på artikel-id; det som saknades var att
                  köra den i förväg och visa svaret. */}
              {forbehall > 0 && (
                <span className="ml-2 text-[11px] text-slate-500">
                  {forbehall === 1 ? '1 förbehåll följer med' : `${forbehall} förbehåll följer med`}
                </span>
              )}
            </span>

            {/* Stegaren stoppar propagering — kortet i övrigt är "lägg till". */}
            <span
              className="flex items-center gap-0.5 shrink-0"
              onClick={e => { e.stopPropagation() }}
            >
              <span
                role="button"
                tabIndex={0}
                aria-label={`Minska antal för ${product.name}`}
                onClick={e => { e.stopPropagation(); andraAntal(product.id, -1) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); andraAntal(product.id, -1) } }}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </span>
              <input
                type="number"
                min={1}
                inputMode="decimal"
                value={n}
                aria-label={`Antal ${product.unit} av ${product.name}`}
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  e.stopPropagation()
                  const v = parseFloat(e.target.value)
                  setAntal(prev => ({ ...prev, [product.id]: Number.isFinite(v) && v > 0 ? v : 1 }))
                }}
                className="w-12 h-9 text-center text-sm tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              <span
                role="button"
                tabIndex={0}
                aria-label={`Öka antal för ${product.name}`}
                onClick={e => { e.stopPropagation(); andraAntal(product.id, 1) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); andraAntal(product.id, 1) } }}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </span>
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/45 rowsheet-fade" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lägg till rad"
        className="relative w-full max-w-lg max-h-[85vh] sm:max-h-[80vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col rowsheet-up"
      >
        {/* Draghandtaget signalerar "svep ner för att stänga" — bara
            meningsfullt på mobilens bottom-sheet. Från sm och uppåt är
            sheeten en centrerad dialog (se sm:items-center ovan): flush mot
            skärmkanten med fyrkantiga hörn läste som avklippt, inte som en
            avsiktlig dialog, på en riktig desktopbredd (Andreas fynd,
            2026-08-17). */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0 sm:hidden" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lägg till rad</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="p-2 -m-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Sök artikel eller skriv en beskrivning…"
              className="w-full min-h-[44px] pl-11 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
            {loading && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>
        </div>

        <div className="px-5 pb-2 overflow-y-auto flex-1">
          {soker ? (
            <>
              {results.length > 0 && (
                <ul className="space-y-1.5">
                  {results.map(p => <ArtikelKort key={p.id} product={p} />)}
                </ul>
              )}
              {!loading && results.length === 0 && (
                <p className="text-sm text-slate-500 py-3">
                  Ingen artikel matchar «{trimmed}». Lägg till den som en egen rad nedan.
                </p>
              )}
            </>
          ) : (
            <>
              {laddarAlla && alla.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-slate-500 py-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Hämtar dina artiklar…
                </p>
              )}

              {favoriter.length > 0 && (
                <>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2 mt-1">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    Dina vanligaste
                  </p>
                  <ul className="space-y-1.5 mb-4">
                    {favoriter.map(p => <ArtikelKort key={p.id} product={p} />)}
                  </ul>
                </>
              )}

              {/* Kategorierna är stängda från start — nittiofem rader utfällda
                  är en vägg, inte en lista. Antalet i rubriken gör det möjligt
                  att välja rätt låda utan att öppna den. */}
              <div className="space-y-1.5">
                {kategorier.map(([key, produkter]) => {
                  const oppen = oppnaKategorier.includes(key)
                  return (
                    <div key={key}>
                      <button
                        type="button"
                        onClick={() => toggleKategori(key)}
                        aria-expanded={oppen}
                        className="w-full min-h-[44px] flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 active:bg-slate-100 transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {oppen
                            ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                          <span className="text-[15px] font-medium text-slate-800 truncate">
                            {kategoriEtikett(key)}
                          </span>
                        </span>
                        <span className="text-xs text-slate-500 tabular-nums shrink-0">{produkter.length} st</span>
                      </button>

                      {oppen && (
                        <ul className="space-y-1.5 mt-1.5 pl-2">
                          {produkter.map(p => <ArtikelKort key={p.id} product={p} />)}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>

              {!laddarAlla && alla.length === 0 && (
                <p className="text-sm text-slate-500 py-3">
                  Din artikelbank är tom än. Lägg till en egen rad nedan — du kan spara den i banken efteråt.
                </p>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 shrink-0 space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={addBlank}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 text-white text-[15px] font-semibold rounded-xl hover:bg-primary-800 active:bg-primary-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {trimmed ? `Lägg till «${trimmed}»` : 'Lägg till tom rad'}
          </button>
          <button
            type="button"
            onClick={addHeading}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-[15px] font-medium rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            <Heading1 className="w-4 h-4" />
            Lägg till rubrik
          </button>
        </div>
      </div>
    </div>
  )
}
