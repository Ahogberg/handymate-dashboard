/** @jsxImportSource react */
import { EditableText, EditableDate, EditableNumber } from '@/components/quotes/editable/EditableFields'
import { formatCurrency } from '@/lib/document-html'
import { MODERN_DOCUMENT_CSS } from './modern-css'
import { QuoteDocumentRow } from './QuoteDocumentRow'
import { SignatureCta } from './SignatureCta'
import { InvoicePaymentSection } from './InvoicePaymentSection'
import { mixWithWhite } from './format'
import type { QuoteDocumentHandlers, QuoteDocumentMode, QuoteDocumentMobileProps, MoneyDocumentData } from './types'

export type { QuoteDocumentHandlers, QuoteItemPatch, QuoteDocumentMode, QuoteDocumentMobileProps, MoneyDocumentData } from './types'

/**
 * EN redigerbar dokumentmotor (ETAPP 2a, generaliserad i ETAPP 6a —
 * offert-masterplan.md) som renderar MoneyDocumentData (offert ELLER
 * faktura, docType-diskriminerad union) som ett Modern-dokument. Ersätter
 * BÅDE components/quotes/editable/ModernCanvas.tsx (offertens gamla
 * live-canvas) OCH mallsträngarna i lib/quote-templates/modern.ts +
 * lib/invoice-templates/modern.ts (båda raderade, se resp. render-react.tsx)
 * — live-canvas, preview-HTML och PDF renderas nu alla från DENNA
 * komponent, för båda dokumenttyperna.
 *
 * Isomorf med flit: INGEN 'use client', INGA hooks. mode="static" körs
 * genom renderToStaticMarkup (ren Node-kontext, ingen webbläsare) —
 * komponenten får därför aldrig referera webbläsar-API:er eller state
 * direkt. Edit-lägets interaktivitet kommer enbart via props (handlers) +
 * EditableText/EditableNumber-fälten.
 *
 * ETAPP 6a: docType='invoice' stödjer ENDAST mode="static" i praktiken
 * idag (fakturans redigerbara canvas är ETAPP 6c-scope) — men handlers-
 * kontraktet är oförändrat kvar på quote-grenen, så ingen regression för
 * offertens edit-läge. Parties-sektionen och items-tabellen (via
 * QuoteDocumentRow, som redan var docType-agnostisk) delas rakt av mellan
 * lägena — det är själva poängen med generaliseringen.
 *
 * Premium/Friendly: FÖRBERETT via `style`-prop men bara 'modern' är
 * implementerat i denna etapp — se offert-masterplan.md ETAPP 2a/6a.
 */
export interface QuoteDocumentProps extends QuoteDocumentMobileProps {
  data: MoneyDocumentData
  mode: QuoteDocumentMode
  /** Endast prep för E2a/6a-scope — bara 'modern' renderar fullt idag. */
  style?: 'modern'
  handlers?: QuoteDocumentHandlers
}

export default function QuoteDocument({ data, mode, handlers, sheetMode, onRowTap }: QuoteDocumentProps) {
  const accent = data.business.accentColor
  const accent50 = mixWithWhite(accent, 0.92)
  const accent100 = mixWithWhite(accent, 0.82)
  const isInvoice = data.docType === 'invoice'

  // Edit-läget visar ALLTID antal + à-pris (hantverkaren redigerar med full
  // insyn oavsett vad kunden senare får se) — samma beteende som
  // ModernCanvas hade. Static-läget respekterar offertens visningsnivå
  // (Del C); fakturan har ingen visningsnivå-koncept och visar alltid allt.
  const showQty = isInvoice ? true : (mode === 'edit' ? true : data.showQuantities !== false)
  const showPrice = isInvoice ? true : (mode === 'edit' ? true : data.showUnitPrices !== false)
  const colCount = 2 + (showQty ? 1 : 0) + (showPrice ? 1 : 0)

  const customerLines = [
    data.customer.address,
    [data.customer.postalCode, data.customer.city].filter(Boolean).join(' '),
  ].filter(Boolean) as string[]

  // Not under items-sektionen på OSIGNERAD offert med minst ett tillval —
  // endast static (kunden ska veta valen görs i portalen). Edit-läget
  // behöver inte noten — hantverkaren väljer inte tillval. Fakturor har
  // aldrig tillval ('option' produceras aldrig av buildInvoiceTemplateData).
  const items = isInvoice ? data.invoice.items : data.quote.items
  const hasOptions = !isInvoice && items.some(i => i.itemType === 'option')
  const showOptionsNote = !isInvoice && mode === 'static' && hasOptions && !data.isSigned

  // Signatur-CTA (punkt 5, offert-only): resolvad generisk default
  // (isSigned-baserad) om data.signatureCta är utelämnad.
  const resolvedCta = !isInvoice ? (data.signatureCta ?? (data.isSigned ? 'signed' : 'active')) : 'hidden'

  return (
    <div
      className="quote-document quote-document--modern"
      style={{
        ['--qd-accent' as any]: accent,
        ['--qd-accent-50' as any]: accent50,
        ['--qd-accent-100' as any]: accent100,
      }}
    >
      <style>{MODERN_DOCUMENT_CSS}</style>
      <div className="page">
        {/* Header */}
        <header className="header">
          <div className="brand">
            <div className="brand-mark">
              {data.business.logoUrl
                ? <img src={data.business.logoUrl} alt={data.business.name} />
                : data.business.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="brand-name">{data.business.name}</div>
              {data.business.tagline && <div className="brand-meta">{data.business.tagline}</div>}
            </div>
          </div>
          {isInvoice ? (
            <div className="doc-meta">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                <div className="doc-label">{data.invoice.isCreditNote ? 'Kreditfaktura' : 'Faktura'}</div>
                {data.invoice.status === 'paid' && (
                  <span className="status-badge paid"><span className="dot" />Betald</span>
                )}
                {data.invoice.status === 'overdue' && (
                  <span className="status-badge"><span className="dot" />Försenad</span>
                )}
              </div>
              <div className="doc-number">{data.invoice.number}</div>
              <div className="doc-dates">
                <div><strong>Fakturadatum:</strong> {data.invoice.invoiceDate}</div>
                {data.invoice.status === 'paid' && data.invoice.paidDate ? (
                  <div><strong>Betald:</strong> {data.invoice.paidDate}</div>
                ) : data.invoice.status === 'overdue' ? (
                  <div className="due-overdue"><strong>Förfallodatum:</strong> {data.invoice.dueDate} · {data.invoice.daysOverdue} dagar försenad</div>
                ) : (
                  <div><strong>Förfallodatum:</strong> {data.invoice.dueDate}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="doc-meta">
              <div className="doc-label">Offert</div>
              <div className="doc-number">{data.quote.number}</div>
              {data.quote.dealNumber && <div className="doc-ref">Ärende {data.quote.dealNumber}</div>}
              <div className="doc-dates">
                <div><strong>Utfärdad:</strong> {data.quote.issuedDate}</div>
                <div>
                  <strong>Giltig till:</strong>{' '}
                  {mode === 'edit' && handlers?.onValidUntilChange
                    ? (
                      <EditableDate
                        value={data.quote.validUntilDateISO || ''}
                        displayValue={data.quote.validUntilDate}
                        onChange={handlers.onValidUntilChange}
                      />
                    )
                    : data.quote.validUntilDate}
                </div>
              </div>
            </div>
          )}
        </header>

        <div className="accent" />

        {/* Avsändare / Mottagare — delad mellan offert och faktura */}
        <section className="parties">
          <div>
            <div className="party-label">Avsändare</div>
            <div className="party-name">{data.business.name}</div>
            {data.business.address && <div className="party-line">{data.business.address}</div>}
            <div className="party-meta">
              {[data.business.contactName, data.business.phone].filter(Boolean).join(' · ')}
              {data.business.email && <><br />{data.business.email}</>}
            </div>
            {!isInvoice && data.referencePerson && <div className="party-meta">Vår referens: {data.referencePerson}</div>}
          </div>
          <div>
            <div className="party-label">Mottagare</div>
            <div className="party-name">
              {!isInvoice && mode === 'edit' && handlers?.onCustomerNameChange
                ? <EditableText value={data.customer.name} onChange={handlers.onCustomerNameChange} placeholder="Kundnamn" />
                : data.customer.name}
            </div>
            {customerLines.map((l, i) => <div key={i} className="party-line">{l}</div>)}
            <div className="party-meta">
              {[data.customer.phone, data.customer.email].filter(Boolean).join(' · ')}
              {data.customer.personnummer && <><br />Personnr: {data.customer.personnummer}</>}
            </div>
          </div>
        </section>

        {/* OCR/betalinstruktions-refsraden hör hemma FÖRE titeln i fakturaläge
            (samma placering som de gamla mallsträngarna hade) — se
            InvoicePaymentSection, som renderar refs-blocket internt. */}

        {/* Titel + beskrivning */}
        <h1 className="quote-title">
          {isInvoice ? data.invoice.title : (
            mode === 'edit' && handlers
              ? <EditableText value={data.quote.title} onChange={handlers.onTitleChange} placeholder="Offerttitel" />
              : data.quote.title
          )}
        </h1>
        {isInvoice ? (
          data.invoice.description && <p className="quote-sub">{data.invoice.description}</p>
        ) : mode === 'edit' && handlers ? (
          <p className="quote-sub">
            <EditableText
              value={data.quote.description || ''}
              onChange={handlers.onDescriptionChange}
              placeholder="Beskriv vad offerten avser …"
              multiline
            />
          </p>
        ) : (
          data.quote.description && <p className="quote-sub">{data.quote.description}</p>
        )}

        {/* Items-tabell — delad mellan offert och faktura (QuoteDocumentRow
            är docType-agnostisk sedan ETAPP 6a). */}
        <table>
          <thead>
            <tr>
              <th>Beskrivning</th>
              {showQty && <th className="num">Antal</th>}
              {showPrice && <th className="num">Á-pris</th>}
              <th className="num">Summa</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <QuoteDocumentRow
                key={item.id ?? idx}
                item={item}
                mode={mode}
                showQty={showQty}
                showPrice={showPrice}
                colCount={colCount}
                handlers={handlers}
                sheetMode={sheetMode}
                onTap={sheetMode && onRowTap && item.id ? () => onRowTap(item.id!) : undefined}
              />
            ))}
          </tbody>
        </table>
        {showOptionsNote && (
          <div className="options-note">Välj dina tillval i kundportalen innan du signerar.</div>
        )}

        {!isInvoice && mode === 'edit' && handlers && (
          <button type="button" onClick={handlers.onItemAdd} className="add-row-btn">
            + Lägg till rad
          </button>
        )}

        {/* Totaler */}
        <div className="totals-wrap">
          <div className="totals">
            {isInvoice ? (
              <>
                <div className="total-row"><span className="lbl">Summa exkl. moms</span><span className="val">{formatCurrency(data.invoice.subtotalExVat)}</span></div>
                {data.invoice.discountPercent !== undefined ? (
                  <div className="total-row discount">
                    <span className="lbl">Rabatt ({data.invoice.discountPercent}%)</span>
                    <span className="val">−{formatCurrency(data.invoice.discountAmount || 0)}</span>
                  </div>
                ) : null}
                <div className="total-row"><span className="lbl">Moms {data.invoice.vatRate}%</span><span className="val">{formatCurrency(data.invoice.vatAmount)}</span></div>
                <div className="total-row"><span className="lbl">Summa inkl. moms</span><span className="val">{formatCurrency(data.invoice.totalIncVat)}</span></div>
                {data.invoice.rotDeduction ? (
                  <div className="total-row rot">
                    <span className="lbl">ROT-avdrag (30% av arbete)</span>
                    <span className="val">−{formatCurrency(data.invoice.rotDeduction)}</span>
                  </div>
                ) : null}
                {data.invoice.rutDeduction ? (
                  <div className="total-row rot">
                    <span className="lbl">RUT-avdrag (50% av arbete)</span>
                    <span className="val">−{formatCurrency(data.invoice.rutDeduction)}</span>
                  </div>
                ) : null}
                {data.invoice.lateInterest ? (
                  <div className="total-row late">
                    <span className="lbl">Dröjsmålsränta ({data.invoice.lateInterestRate}%)</span>
                    <span className="val">+ {formatCurrency(data.invoice.lateInterest)}</span>
                  </div>
                ) : null}
                {data.invoice.reminderFee ? (
                  <div className="total-row late">
                    <span className="lbl">Påminnelseavgift</span>
                    <span className="val">+ {formatCurrency(data.invoice.reminderFee)}</span>
                  </div>
                ) : null}
                <div className="total-row grand"><span className="lbl">Att betala</span><span className="val">{formatCurrency(data.invoice.amountToPay)}</span></div>
              </>
            ) : (
              <>
                <div className="total-row"><span className="lbl">Summa exkl. moms</span><span className="val">{formatCurrency(data.quote.subtotalExVat)}</span></div>
                {data.quote.discountPercent !== undefined ? (
                  <div className="total-row discount">
                    <span className="lbl">
                      Rabatt (
                      {mode === 'edit' && handlers?.onDiscountChange
                        ? <EditableNumber value={data.quote.discountPercent} onChange={handlers.onDiscountChange} width={36} format={v => `${v}`} step={1} min={0} />
                        : data.quote.discountPercent}
                      %)
                    </span>
                    <span className="val">−{formatCurrency(data.quote.discountAmount || 0)}</span>
                  </div>
                ) : null}
                <div className="total-row"><span className="lbl">Moms 25%</span><span className="val">{formatCurrency(data.quote.vatAmount)}</span></div>
                <div className="total-row"><span className="lbl">Summa inkl. moms</span><span className="val">{formatCurrency(data.quote.totalIncVat)}</span></div>
                {data.quote.rotDeduction ? (
                  <div className="total-row rot">
                    <span className="lbl">ROT-avdrag (30% av arbete)</span>
                    <span className="val">−{formatCurrency(data.quote.rotDeduction)}</span>
                  </div>
                ) : null}
                {data.quote.rutDeduction ? (
                  <div className="total-row rot">
                    <span className="lbl">RUT-avdrag (50% av arbete)</span>
                    <span className="val">−{formatCurrency(data.quote.rutDeduction)}</span>
                  </div>
                ) : null}
                {/* OBS (paritetsavvikelse, dokumenterad i rapporten): grön teknik-
                    avdraget visas ENDAST i edit-läget (samma som ModernCanvas
                    redan gjorde) — lib/quote-templates/modern.ts saknade denna
                    rad helt i produktion, och static-läget speglar det GAMLA
                    beteendet tills paritetstestet är löst/beslutet omprövas. */}
                {mode === 'edit' && data.quote.gronDeduction ? (
                  <div className="total-row rot">
                    <span className="lbl">Grön teknik-avdrag</span>
                    <span className="val">−{formatCurrency(data.quote.gronDeduction)}</span>
                  </div>
                ) : null}
                <div className="total-row grand"><span className="lbl">Att betala</span><span className="val">{formatCurrency(data.quote.amountToPay)}</span></div>
              </>
            )}
          </div>
        </div>

        {/* Faktura-snapshot (invoice.bankgiro_number/plusgiro_number, satt vid
            skapandet av vissa av de åtta vägarna) föredras framför företagets
            LEVANDE inställning — historisk korrekthet om kontot bytts sedan
            fakturan skickades. Faller tillbaka till business-nivå (samma som
            offertens pay-box redan gjorde). */}
        {isInvoice ? (
          <InvoicePaymentSection
            ocrNumber={data.invoice.ocrNumber}
            bankgiro={data.invoice.bankgiro ?? data.business.bankgiro}
            plusgiro={data.invoice.plusgiro ?? data.business.plusgiro}
            swish={data.business.swish}
            swishQrDataUrl={data.swishQrDataUrl}
            amountToPay={data.invoice.amountToPay}
            dueDate={data.invoice.dueDate}
            isOverdue={data.invoice.status === 'overdue'}
            daysOverdue={data.invoice.daysOverdue}
            isPaid={data.invoice.status === 'paid'}
            paidDate={data.invoice.paidDate}
            isCreditNote={!!data.invoice.isCreditNote}
            creditReason={data.invoice.creditReason}
          />
        ) : (
          /* Betalning (offert) */
          <div className={`pay-box${data.business.swish ? '' : ' single'}`}>
            <div>
              <div className="pay-title">Betalning</div>
              <div className="pay-text">
                Faktura skickas vid avslut.{' '}
                <strong>
                  {mode === 'edit' && handlers?.onPaymentTermsChange
                    ? <EditableText value={data.quote.paymentTerms} onChange={handlers.onPaymentTermsChange} placeholder="30 dagar netto" />
                    : data.quote.paymentTerms}.
                </strong>
                {data.business.swish && ' Vid mindre delbetalningar accepteras Swish till nummer nedan med offertnummer i meddelandet.'}
              </div>
            </div>
            {data.business.swish && (
              <div className="swish-mark">
                <div className="label">Swish</div>
                <div className="num">{data.business.swish}</div>
              </div>
            )}
          </div>
        )}

        {/* Villkor */}
        {isInvoice ? (
          <p className="terms">
            <strong>Betalningsvillkor.</strong> {data.invoice.paymentTerms}. Vid försenad betalning tillkommer dröjsmålsränta
            enligt räntelagen samt påminnelseavgift om 60 kr.{' '}
            {data.invoice.rotDeduction ? 'ROT-avdraget förutsätter Skatteverkets godkännande; vid avslag faktureras mellanskillnaden separat. ' : ''}
            Reklamation ska ske inom 10 dagar från fakturadatum.
            {data.invoice.conclusionText && <><br /><br />{data.invoice.conclusionText}</>}
          </p>
        ) : mode === 'edit' && handlers?.onTermsChange ? (
          <p className="terms">
            <strong>Villkor.</strong>{' '}
            <EditableText
              value={data.quote.termsText || ''}
              onChange={handlers.onTermsChange}
              placeholder={defaultTermsText(data)}
              multiline
            />
            {data.quote.notIncluded || handlers.onNotIncludedChange ? (
              <>
                <br /><br /><strong>Ej inkluderat:</strong>{' '}
                {handlers.onNotIncludedChange
                  ? (
                    <EditableText
                      value={data.quote.notIncluded || ''}
                      onChange={handlers.onNotIncludedChange}
                      placeholder="Vad ingår inte i offerten…"
                      multiline
                    />
                  )
                  : data.quote.notIncluded}
              </>
            ) : null}
            {data.quote.warrantyText && <><br /><br /><strong>Garanti:</strong> {data.quote.warrantyText}</>}
          </p>
        ) : (
          <p className="terms">
            <strong>Villkor.</strong> {data.quote.termsText || defaultTermsText(data)}
            {data.quote.notIncluded && <><br /><br /><strong>Ej inkluderat:</strong> {data.quote.notIncluded}</>}
            {data.quote.warrantyText && <><br /><br /><strong>Garanti:</strong> {data.quote.warrantyText}</>}
          </p>
        )}

        {!isInvoice && (
          <SignatureCta mode={mode} cta={resolvedCta} isSigned={!!data.isSigned} signedDate={data.signedDate} />
        )}

        {/* Footer — delad */}
        <footer className="footer">
          {data.business.orgNumber && <div><div className="l">Org.nr</div><div className="v">{data.business.orgNumber}</div></div>}
          {data.business.bankgiro && <div><div className="l">Bankgiro</div><div className="v">{data.business.bankgiro}</div></div>}
          <div><div className="l">F-skatt</div><div className="v">{data.business.fSkatt ? 'Innehas' : '—'}</div></div>
          {data.business.momsRegnr && <div><div className="l">Moms</div><div className="v">{data.business.momsRegnr}</div></div>}
        </footer>
      </div>
    </div>
  )
}

/** Exakt samma default-villkorstext som lib/quote-templates/modern.ts skrev
    (paritetskrav) — extraherad hit så BÅDE static-fallbacken och edit-lägets
    placeholder (visar hantverkaren vad som kommer stå om fältet lämnas tomt)
    använder samma sanning. Endast offert — anropas aldrig i fakturaläge. */
function defaultTermsText(data: Extract<MoneyDocumentData, { docType: 'quote' }>): string {
  return `Offerten gäller till ${data.quote.validUntilDate}. ${data.quote.rotDeduction ? 'ROT-avdrag förutsätter att kund äger fastigheten och har utrymme i avdrag. ' : ''}Eventuellt tilläggsarbete debiteras enligt löpande räkning. Alla priser är exkl. moms om inte annat anges.`
}
