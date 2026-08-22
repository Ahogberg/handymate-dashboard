'use client'

/**
 * Inställningshubben — sex områden i stället för tjugosju val (etapp 2, 2026-08-07).
 *
 * ═══ VARFÖR INTE FLIKCHIPS ═══
 *
 * Den gamla mobilmenyn var en vågrät remsa som filtrerade bort varje post som
 * navigerade till en egen sida. Hela gruppen Försäljning — all offertkonfiguration
 * — var alltså oåtkomlig på telefon, liksom sju av tio under Drift och
 * Bolagsprofilen som Karins kalender räknar sina datum ur.
 *
 * Här är varje nivå en LODRÄT lista med fullbreddsrader. En rad kan aldrig hamna
 * utanför skärmen, och listan tål att växa. Tre nivåer, aldrig fyra:
 * hub → område → inställning.
 *
 * ═══ TVÅ IKONER, EN BETYDELSE VAR ═══
 *
 * Nedåtpil  = raden fälls ut här.
 * Snedpil   = egen sida med eget innehåll.
 *
 * Att den skillnaden var osynlig var själva förvirringen i den gamla hubben.
 * Legenden står en gång per vy, inte som brus vid varje rad.
 *
 * Träffytor: områdeskort 76px, inställningsrader 60px. Ingenting under 44px —
 * hantverkaren står på ett tak med telefonen i handen.
 */
import Link from 'next/link'
import { ChevronRight, ChevronLeft, ChevronDown, ArrowUpRight, Settings2 } from 'lucide-react'
import type { SettingsArea, SettingsEntry } from '@/lib/settings/areas'
import { primaryCount } from '@/lib/settings/areas'

/** Ikonen som säger vart raden leder. */
function RiktningsIkon({ entry, aktiv }: { entry: SettingsEntry; aktiv?: boolean }) {
  if (entry.href) return <ArrowUpRight className="w-4 h-4 text-primary-700 shrink-0" />
  return (
    <ChevronDown
      className={`w-[18px] h-[18px] shrink-0 transition-transform ${aktiv ? 'rotate-180 text-primary-700' : 'text-gray-300'}`}
    />
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-2.5 mt-4 text-xs text-gray-400">
      <ChevronDown className="w-3.5 h-3.5" />
      <span>öppnas här</span>
      <span className="w-px h-3.5 bg-[#E2E8F0]" />
      <ArrowUpRight className="w-3.5 h-3.5 text-primary-700" />
      <span>egen sida</span>
    </div>
  )
}

/** En rad i ett område. Länk eller utfällning — aldrig oklart vilket. */
function EntryRow({
  entry,
  aktiv,
  onOpen,
}: {
  entry: SettingsEntry
  aktiv: boolean
  onOpen: (id: string) => void
}) {
  const innehall = (
    <>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium text-gray-900 truncate">{entry.label}</span>
        <span className="block text-xs text-gray-400 truncate">{entry.desc}</span>
      </span>
      <RiktningsIkon entry={entry} aktiv={aktiv} />
    </>
  )

  const klass =
    'w-full flex items-center gap-3 min-h-[60px] px-4 py-2.5 text-left border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors'

  if (entry.href) {
    return (
      <Link href={entry.href} className={klass}>
        {innehall}
      </Link>
    )
  }
  return (
    <button type="button" onClick={() => onOpen(entry.id)} className={klass}>
      {innehall}
    </button>
  )
}

/**
 * Hubben: de sex områdena.
 *
 * Korten visar sitt innehåll, inte bara sitt namn. Ett områdesnamn ensamt tvingar
 * till gissning; raderna gör att man ser vart man ska utan att klicka fel.
 */
export function SettingsHub({
  areas,
  onOpenArea,
  businessName,
}: {
  areas: SettingsArea[]
  onOpenArea: (key: string) => void
  businessName?: string | null
}) {
  return (
    <div>
      <p className="text-sm text-gray-500">
        {businessName ? `${businessName} · ` : ''}Ändringar sparas direkt och gäller för hela teamet.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
        {areas.map(area => {
          const rader = area.groups.flatMap(g => g.entries).filter(e => !e.advanced)
          const avancerade = area.groups.flatMap(g => g.entries).filter(e => e.advanced).length
          return (
            <button
              key={area.key}
              type="button"
              onClick={() => onOpenArea(area.key)}
              className="text-left bg-white border border-[#E2E8F0] rounded-2xl p-5 min-h-[76px] hover:border-primary-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
                  <Settings2 className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-heading text-[17px] font-semibold text-gray-900 truncate">{area.label}</span>
                  <span className="block text-xs text-gray-400 truncate">{area.tagline}</span>
                </span>
                <ChevronRight className="w-5 h-5 text-gray-300 ml-auto shrink-0 md:hidden" />
              </div>

              <div className="flex flex-col gap-1.5 text-[13px] text-gray-600">
                {rader.slice(0, 4).map(e => (
                  <span key={e.id} className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{e.label}</span>
                    <RiktningsIkon entry={e} />
                  </span>
                ))}
                {rader.length > 4 && (
                  <span className="text-gray-400">+{rader.length - 4} till</span>
                )}
                {avancerade > 0 && (
                  <span className="text-gray-400">Avancerat · {avancerade}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <Legend />
    </div>
  )
}

/**
 * Ett öppnat område.
 *
 * Grupperna är hantverkarens ordning genom ett jobb — hur ser det ut, vad står
 * det, vad kostar det, hur fakturerar vi — inte tabellernas.
 *
 * Det avancerade ligger sist och hopfällt. Det sparar inte plats, det sparar
 * uppmärksamhet: posterna ändras sällan men påverkar hur allt annat räknas.
 */
export function SettingsAreaView({
  area,
  areas,
  activeTab,
  onOpenEntry,
  onOpenArea,
  onBack,
  visaAvancerat,
  onToggleAvancerat,
  children,
}: {
  area: SettingsArea
  areas: SettingsArea[]
  activeTab: string | null
  onOpenEntry: (id: string) => void
  onOpenArea: (key: string) => void
  onBack: () => void
  visaAvancerat: boolean
  onToggleAvancerat: () => void
  /** Innehållet för den utfällda inställningen, renderat av sidan. */
  children?: React.ReactNode
}) {
  const vanliga = area.groups.filter(g => g.entries.some(e => !e.advanced))
  const avancerade = area.groups.flatMap(g => g.entries).filter(e => e.advanced)

  return (
    <div className="lg:grid lg:grid-cols-[212px_1fr] lg:gap-8">
      {/* Områdesväxlare — exakt sex poster, och den växer inte. Nya
          inställningar hamnar inuti ett område, aldrig i den här listan. */}
      <nav className="hidden lg:flex flex-col gap-0.5 text-[13px]">
        <p className="px-3 pb-2 text-[10px] font-semibold tracking-widest uppercase text-gray-400">Områden</p>
        {areas.map(a => (
          <button
            key={a.key}
            type="button"
            onClick={() => onOpenArea(a.key)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
              a.key === area.key ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {a.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0">
        {/* Mobilens tillbaka-länk säger vart man kommer, inte bara "Tillbaka". */}
        <button
          type="button"
          onClick={onBack}
          className="lg:hidden flex items-center gap-2 h-11 text-[15px] font-medium text-primary-700"
        >
          <ChevronLeft className="w-5 h-5" />
          Inställningar
        </button>

        <h1 className="font-heading text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{area.label}</h1>
        <p className="mt-1.5 text-sm text-gray-500">{area.tagline}</p>

        <div className="flex flex-col gap-4 mt-5">
          {vanliga.map(grupp => (
            <div key={grupp.label}>
              <p className="px-1 pb-2 text-[10px] font-semibold tracking-widest uppercase text-gray-400">
                {grupp.label}
              </p>
              <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
                {grupp.entries.filter(e => !e.advanced).map(e => (
                  <div key={e.id}>
                    <EntryRow entry={e} aktiv={activeTab === e.id} onOpen={onOpenEntry} />
                    {/* Utfällningen sker inuti sitt kort — korten intill står
                        still, så man tappar aldrig var man var. */}
                    {activeTab === e.id && !e.href && (
                      <div className="border-t border-gray-100 bg-[#FCFDFE] px-4 py-4">{children}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {avancerade.length > 0 && (
            <div>
              <button
                type="button"
                onClick={onToggleAvancerat}
                className="w-full flex items-center gap-3 min-h-[56px] px-4 py-3 border border-dashed border-[#E2E8F0] rounded-2xl text-left hover:bg-gray-50 transition-colors"
              >
                <Settings2 className="w-[18px] h-[18px] text-gray-400 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">Avancerat</span>
                  <span className="block text-xs text-gray-400 truncate">
                    Ändras sällan, påverkar hur allt annat räknas
                  </span>
                </span>
                <span className="text-xs text-gray-400">{avancerade.length}</span>
                <ChevronDown
                  className={`w-[18px] h-[18px] text-gray-300 shrink-0 transition-transform ${visaAvancerat ? 'rotate-180' : ''}`}
                />
              </button>

              {visaAvancerat && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden mt-2">
                  {avancerade.map(e => (
                    <div key={e.id}>
                      <EntryRow entry={e} aktiv={activeTab === e.id} onOpen={onOpenEntry} />
                      {activeTab === e.id && !e.href && (
                        <div className="border-t border-gray-100 bg-[#FCFDFE] px-4 py-4">{children}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Legend />
      </div>
    </div>
  )
}
