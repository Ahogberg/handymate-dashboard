'use client'

/**
 * "Kundresan i din färg" — sju kort i den ordning kunden möter företaget.
 * Tumnaglarna färgas av accent/logotyp direkt (utan att vänta på servern);
 * mail- och SMS-innehållet i modalen kommer från förhandsvisnings-API:t.
 */
import { KUNDVY_TOUCHPOINTS, EXEMPEL, bokningSms, omdomeSms, type TouchpointId } from '@/lib/branding/kundvy'
import { MailMini, PageMini, SmsMini, MINI_AMOUNTS, type MockBrand } from './mocks'

export interface TouchpointCardsProps {
  brand: MockBrand
  smsSender: string
  reviewUrl: string | null
  onOpen: (id: TouchpointId) => void
}

function Thumb({ id, brand, smsSender, reviewUrl }: { id: TouchpointId; brand: MockBrand; smsSender: string; reviewUrl: string | null }) {
  switch (id) {
    case 'offertmail':
      return <MailMini brand={brand} label={`Offert ${EXEMPEL.offert.nummer}`} amount={MINI_AMOUNTS.offertmail} />
    case 'faktura':
      return <MailMini brand={brand} label={`Faktura ${EXEMPEL.faktura.nummer}`} amount={MINI_AMOUNTS.faktura} />
    case 'bokning':
      return <SmsMini sender={smsSender} text={bokningSms(brand.businessName)} />
    case 'omdome':
      return <SmsMini sender={smsSender} text={omdomeSms(brand.businessName, reviewUrl)} />
    default:
      return <PageMini id={id} brand={brand} />
  }
}

export default function TouchpointCards({ brand, smsSender, reviewUrl, onOpen }: TouchpointCardsProps) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
      {KUNDVY_TOUCHPOINTS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t.id)}
          className="text-left bg-white border border-slate-200 rounded-[14px] overflow-hidden hover:border-teal-300 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          aria-label={`${t.nr}. ${t.titel} — öppna förhandsvisning`}
        >
          <div className="h-[150px] flex items-center justify-center overflow-hidden" style={{ background: '#eef2f6' }}>
            <Thumb id={t.id} brand={brand} smsSender={smsSender} reviewUrl={reviewUrl} />
          </div>
          <div className="px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center justify-center shrink-0 tabular-nums">
                {t.nr}
              </span>
              {/* Får radbrytas — "Bokningsbekräftelsen" ryms inte i ett tvåkolumnskort på mobil. */}
              <span lang="sv" className="text-[13px] font-semibold text-slate-900 leading-5 break-words [hyphens:auto] min-w-0">{t.titel}</span>
            </div>
            <div className="text-[12px] text-slate-500 mt-1 leading-snug">{t.under}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
