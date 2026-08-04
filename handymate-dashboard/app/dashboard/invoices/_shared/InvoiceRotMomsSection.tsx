'use client'

import { Percent } from 'lucide-react'

const INPUT_CLS =
  'w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'

interface InvoiceRotMomsSectionProps {
  vatRate: number
  setVatRate: (n: number) => void
  rotRutType: string
  setRotRutType: (s: string) => void
  personalNumber: string
  setPersonalNumber: (s: string) => void
  propertyDesignation: string
  setPropertyDesignation: (s: string) => void
}

/**
 * ETAPP 6c (offert-masterplan.md, faktura-sprinten): "ROT-detaljer"-panelen
 * i fakturaskaparens "Mer"-rad — speglar korten som redan fanns i de gamla
 * new/edit-sidorna (momssats, ROT/RUT-typ, personnummer/fastighetsbeteckning)
 * men i det delade, canvas-first-kortmönstret (rounded-2xl, eyebrow-etiketter).
 */
export function InvoiceRotMomsSection({
  vatRate,
  setVatRate,
  rotRutType,
  setRotRutType,
  personalNumber,
  setPersonalNumber,
  propertyDesignation,
  setPropertyDesignation,
}: InvoiceRotMomsSectionProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          <Percent className="w-4.5 h-4.5" />
        </div>
        <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">Moms &amp; ROT-avdrag</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Momssats</label>
          <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))} className={INPUT_CLS}>
            <option value={25}>25%</option>
            <option value={12}>12%</option>
            <option value={6}>6%</option>
            <option value={0}>0% (momsfri)</option>
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <div>
            <span className="text-sm text-slate-900">ROT/RUT-avdrag</span>
            {!rotRutType && (
              <p className="text-xs text-slate-500 mt-0.5">Slå på för att markera rader som avdragsberättigade</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setRotRutType(rotRutType ? '' : 'rot')}
            className={`w-9 h-5 rounded-full relative transition-colors ${rotRutType ? 'bg-primary-700' : 'bg-slate-300'}`}
            aria-pressed={!!rotRutType}
          >
            <span className={`absolute w-3.5 h-3.5 bg-white rounded-full top-[3px] transition-all ${rotRutType ? 'left-[19px]' : 'left-[3px]'}`} />
          </button>
        </div>

        {rotRutType && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Typ</label>
              <select value={rotRutType} onChange={e => setRotRutType(e.target.value)} className={INPUT_CLS}>
                <option value="rot">ROT-avdrag (30%)</option>
                <option value="rut">RUT-avdrag (50%)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Personnummer</label>
              <input
                type="text"
                value={personalNumber}
                onChange={e => setPersonalNumber(e.target.value)}
                placeholder="YYYYMMDD-XXXX"
                className={INPUT_CLS}
              />
            </div>
            {rotRutType === 'rot' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Fastighetsbeteckning</label>
                <input
                  type="text"
                  value={propertyDesignation}
                  onChange={e => setPropertyDesignation(e.target.value)}
                  placeholder="T.ex. Stockholm Söder 1:23"
                  className={INPUT_CLS}
                />
              </div>
            )}
            <p className="text-xs text-primary-700 sm:col-span-2">
              {rotRutType === 'rot'
                ? 'Markera raderna som är ROT-berättigade i dokumentet eller listvyn — kunden betalar 70%, Skatteverket betalar resterande 30% direkt till dig.'
                : 'Markera raderna som är RUT-berättigade i dokumentet eller listvyn — kunden betalar 50%, Skatteverket betalar resterande 50% direkt till dig.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
