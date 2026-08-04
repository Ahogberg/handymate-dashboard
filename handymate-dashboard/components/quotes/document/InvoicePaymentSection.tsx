/** @jsxImportSource react */
import { formatCurrency } from '@/lib/document-html'

/**
 * Fakturaunika sektioner i dokumentmotorn — ETAPP 6a (offert-masterplan.md,
 * faktura-sprinten). Motsvarar det quote-läget löser med pay-box +
 * SignatureCta, men för en faktura: OCR-referensraden, betalinstruktioner
 * (bankgiro/plusgiro + Swish-QR — QR:en kommer in som en färdig data-URI,
 * se lib/invoice-templates/render-react.tsx för hur den genereras
 * server-side innan motorn ser den), förfallodatum-prominens + sen-notis,
 * "betald"-kvitto, och kreditfaktura-läget (ingen betalning att samla in).
 *
 * Ren presentationskomponent (inga hooks, ingen 'use client') — körs både
 * i renderToStaticMarkup (PDF/kundvy) och i edit-lägets canvas (framtida
 * 6c-scope; för närvarande renderas fakturor bara statiskt).
 */
interface InvoicePaymentSectionProps {
  ocrNumber: string
  bankgiro?: string | null
  plusgiro?: string | null
  swish?: string | null
  swishQrDataUrl?: string | null
  amountToPay: number
  dueDate: string
  isOverdue: boolean
  daysOverdue: number
  isPaid: boolean
  paidDate?: string | null
  isCreditNote: boolean
  creditReason?: string | null
}

export function InvoicePaymentSection({
  ocrNumber,
  bankgiro,
  plusgiro,
  swish,
  swishQrDataUrl,
  amountToPay,
  dueDate,
  isOverdue,
  daysOverdue,
  isPaid,
  paidDate,
  isCreditNote,
  creditReason,
}: InvoicePaymentSectionProps) {
  // Kreditfaktura: ingen betalning att samla in — beloppet regleras mot
  // kundens konto/nästa faktura. OCR/Swish/förfallo-notiser är irrelevanta.
  if (isCreditNote) {
    return (
      <div className="credit-banner">
        <div className="title">Kreditfaktura</div>
        <div className="text">
          {creditReason || 'Beloppet regleras mot kundens konto — ingen betalning ska ske på denna faktura.'}
        </div>
      </div>
    )
  }

  if (isPaid) {
    return (
      <div className="paid-banner">
        <div className="title">Fakturan är betald</div>
        {paidDate && <div className="sub">Betalning mottagen {paidDate}</div>}
      </div>
    )
  }

  return (
    <>
      <div className="refs">
        <div>
          <div className="l">OCR-nummer</div>
          <div className="v">{formatOcr(ocrNumber)}</div>
        </div>
        {bankgiro ? (
          <div><div className="l">Bankgiro</div><div className="v">{bankgiro}</div></div>
        ) : plusgiro ? (
          <div><div className="l">Plusgiro</div><div className="v">{plusgiro}</div></div>
        ) : (
          <div><div className="l">Att betala</div><div className="v">{formatCurrency(amountToPay)}</div></div>
        )}
        <div>
          <div className="l">Förfaller</div>
          <div className={isOverdue ? 'v due-overdue' : 'v'}>
            {dueDate}{isOverdue ? ` · ${daysOverdue} dagar försenad` : ''}
          </div>
        </div>
      </div>

      {isOverdue && (
        <div className="late-notice">
          <div className="icon">!</div>
          <div>
            <div className="title">Fakturan är försenad</div>
            <div className="text">
              Förfallodatum passerades {dueDate}. Dröjsmålsränta enligt räntelagen tillkommer från förfallodag.
              Betala omgående för att undvika ytterligare avgifter.
            </div>
          </div>
        </div>
      )}

      <div className={`pay-box${swish && swishQrDataUrl ? '' : ' single'}`}>
        <div>
          <div className="pay-title">Betalning</div>
          <div className="pay-text">
            <strong>{formatCurrency(amountToPay)}</strong> — OCR {formatOcr(ocrNumber)} anges som referens.
            {bankgiro ? ` Bankgiro ${bankgiro}.` : plusgiro ? ` Plusgiro ${plusgiro}.` : ''}
          </div>
        </div>
        {swish && swishQrDataUrl && (
          <div className="swish-mark">
            <img src={swishQrDataUrl} alt="Swish QR" />
            <div className="label">Swish</div>
            <div className="num">{swish}</div>
          </div>
        )}
      </div>
    </>
  )
}

/** Lägg till mellanslag var 4:e siffra för läsbarhet — identisk med
    formatOcr i de gamla lib/invoice-templates/modern.ts/premium.ts/
    friendly.ts (paritetskrav). */
function formatOcr(ocr: string): string {
  const digits = (ocr || '').replace(/\D/g, '')
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim() || ocr
}
