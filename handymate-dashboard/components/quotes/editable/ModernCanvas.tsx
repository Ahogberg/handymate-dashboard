'use client'

import { useEffect, useRef } from 'react'
import { EditableText, EditableNumber } from './EditableFields'
import type { QuoteTemplateData, QuoteTemplateItem } from '@/lib/quote-templates/types'
import { formatCurrency } from '@/lib/document-html'

/**
 * Live-redigerbar version av Modern-mallen. Återskapar pixel-perfect
 * samma layout och CSS som lib/quote-templates/modern.ts, men varje
 * fält är inline-editable. PDF/email använder fortfarande HTML-mallen
 * — detta är bara editing-vyn.
 */

const MODERN_CSS = `
.modern-canvas { font-family: 'DM Sans', system-ui, sans-serif; color: #0F172A; line-height: 1.5; }
.modern-canvas * { margin: 0; padding: 0; box-sizing: border-box; }
.modern-canvas .page {
  width: 210mm; min-height: 297mm; padding: 22mm 20mm;
  margin: 0 auto; background: #fff; box-shadow: 0 16px 40px rgba(15,23,42,0.10);
  display: flex; flex-direction: column;
}
.modern-canvas .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.modern-canvas .brand { display: flex; align-items: center; gap: 12px; }
.modern-canvas .brand-mark { width: 44px; height: 44px; border-radius: 10px; color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 22px; overflow: hidden; }
.modern-canvas .brand-mark img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
.modern-canvas .brand-name { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; color: #0F172A; letter-spacing: -0.01em; }
.modern-canvas .brand-meta { color: #64748B; font-size: 11px; margin-top: 2px; }
.modern-canvas .doc-meta { text-align: right; }
.modern-canvas .doc-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.16em; color: #64748B; }
.modern-canvas .doc-number { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 26px; color: #0F172A; letter-spacing: -0.02em; margin-top: 2px; }
.modern-canvas .doc-ref { font-size: 11px; color: #64748B; margin-top: 4px; font-weight: 500; }
.modern-canvas .doc-dates { font-size: 12px; color: #64748B; margin-top: 8px; line-height: 1.7; }
.modern-canvas .doc-dates strong { color: #0F172A; font-weight: 600; }
.modern-canvas .accent { height: 2px; margin: 20px 0 28px; opacity: 0.85; }
.modern-canvas .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
.modern-canvas .party-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 6px; }
.modern-canvas .party-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; color: #0F172A; }
.modern-canvas .party-line { font-size: 13px; color: #0F172A; margin-top: 2px; }
.modern-canvas .party-meta { font-size: 12px; color: #64748B; margin-top: 4px; line-height: 1.6; }
.modern-canvas .quote-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 22px; color: #0F172A; letter-spacing: -0.015em; margin-bottom: 4px; }
.modern-canvas .quote-sub { color: #64748B; font-size: 13px; margin-bottom: 24px; white-space: pre-line; }
.modern-canvas table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
.modern-canvas thead th { text-align: left; padding: 10px 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #64748B; border-bottom: 1.5px solid #0F172A; }
.modern-canvas thead th.num { text-align: right; }
.modern-canvas tbody td { padding: 12px; vertical-align: top; font-size: 13px; }
.modern-canvas tbody tr:nth-child(even) { background: #F8FAFC; }
.modern-canvas tbody tr.row-hover:hover { background: rgba(15, 118, 110, 0.05) !important; }
.modern-canvas .item-name { font-weight: 600; color: #0F172A; }
.modern-canvas .item-desc { color: #64748B; font-size: 12px; margin-top: 2px; }
.modern-canvas td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.modern-canvas tbody tr.row-heading, .modern-canvas tbody tr.row-text, .modern-canvas tbody tr.row-subtotal { background: transparent; }
.modern-canvas tbody tr.row-heading td { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 13px; color: #0F172A; padding: 18px 12px 6px; border-bottom: 1px solid #E2E8F0; }
.modern-canvas tbody tr.row-text td { color: #64748B; font-size: 12px; white-space: pre-line; }
.modern-canvas tbody tr.row-subtotal td { font-weight: 600; color: #0F172A; text-align: right; border-top: 1px solid #E2E8F0; }
.modern-canvas tbody tr.row-discount .item-name, .modern-canvas tbody tr.row-discount td.num { color: var(--canvas-accent); }
.modern-canvas .opt-box { color: var(--canvas-accent); font-size: 15px; line-height: 1; margin-right: 4px; }
.modern-canvas tr.row-option-unselected .opt-box { color: #64748B; }
.modern-canvas .opt-badge { display: inline-block; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--canvas-accent); background: var(--canvas-accent-50); border: 1px solid var(--canvas-accent-100); border-radius: 4px; padding: 1px 6px; margin-left: 6px; vertical-align: 1px; }
.modern-canvas tr.row-option-unselected .opt-badge { color: #64748B; background: transparent; border-color: #E2E8F0; }
.modern-canvas .row-action { opacity: 0; transition: opacity 0.15s; }
.modern-canvas tr.row-hover:hover .row-action { opacity: 1; }
.modern-canvas .row-action button { background: transparent; border: none; cursor: pointer; padding: 2px 4px; color: #94a3b8; font-size: 14px; line-height: 1; }
.modern-canvas .row-action button:hover { color: #ef4444; }
.modern-canvas .add-row-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: rgba(15, 118, 110, 0.08); border: 1px dashed currentColor; border-radius: 6px; color: var(--canvas-accent); font-size: 12px; font-weight: 500; cursor: pointer; margin-bottom: 24px; transition: background 0.15s; }
.modern-canvas .add-row-btn:hover { background: rgba(15, 118, 110, 0.15); }
.modern-canvas .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 28px; }
.modern-canvas .totals { width: 50%; min-width: 280px; }
.modern-canvas .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #E2E8F0; }
.modern-canvas .total-row:last-child { border-bottom: none; }
.modern-canvas .total-row.rot { font-weight: 600; }
.modern-canvas .total-row.grand { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; padding: 14px 0 6px; border-top: 1.5px solid #0F172A; border-bottom: none; margin-top: 6px; }
.modern-canvas .total-row .lbl { color: #64748B; }
.modern-canvas .total-row.grand .lbl { color: #0F172A; }
.modern-canvas .total-row .val { font-weight: 600; color: #0F172A; font-variant-numeric: tabular-nums; }
.modern-canvas .pay-box { border: 1px solid var(--canvas-accent-100); background: var(--canvas-accent-50); border-radius: 10px; padding: 16px 18px; display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; margin-bottom: 28px; }
.modern-canvas .pay-box.single { grid-template-columns: 1fr; }
.modern-canvas .pay-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.modern-canvas .pay-text { font-size: 12px; color: #0F172A; line-height: 1.6; }
.modern-canvas .pay-text strong { font-weight: 600; }
.modern-canvas .swish-mark { background: #fff; border: 1px solid var(--canvas-accent-100); border-radius: 8px; padding: 8px 14px; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 110px; }
.modern-canvas .swish-mark .label { font-size: 9px; color: #64748B; text-transform: uppercase; letter-spacing: 0.14em; }
.modern-canvas .swish-mark .num { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; color: #0F172A; letter-spacing: -0.01em; }
.modern-canvas .terms { font-size: 11px; color: #64748B; line-height: 1.7; margin-bottom: 28px; }
.modern-canvas .terms strong { color: #0F172A; font-weight: 600; }
.modern-canvas .footer { margin-top: auto; padding-top: 18px; border-top: 1px solid #E2E8F0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; font-size: 10px; color: #64748B; }
.modern-canvas .footer .l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #64748B; margin-bottom: 2px; }
.modern-canvas .footer .v { color: #0F172A; font-weight: 500; font-size: 11px; }
`

function mixWithWhite(hex: string, whitePct: number): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i)
  if (!m) return hex
  const r = parseInt(m[1].substring(0, 2), 16)
  const g = parseInt(m[1].substring(2, 4), 16)
  const b = parseInt(m[1].substring(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * whitePct)
  return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toLocaleString('sv-SE', { maximumFractionDigits: 2 })
}

export interface ModernCanvasHandlers {
  onTitleChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onItemChange: (index: number, item: QuoteTemplateItem) => void
  onItemAdd: () => void
  onItemRemove: (index: number) => void
  onCustomerNameChange?: (v: string) => void
  onPaymentTermsChange?: (v: string) => void
}

interface Props {
  data: QuoteTemplateData
  handlers: ModernCanvasHandlers
}

export default function ModernCanvas({ data, handlers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Injicera Google Fonts en gång
  useEffect(() => {
    const linkId = 'modern-canvas-fonts'
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  const accent = data.business.accentColor
  const accentLight = mixWithWhite(accent, 0.92)
  const accent100 = mixWithWhite(accent, 0.82)

  const customerLines = [
    data.customer.address,
    [data.customer.postalCode, data.customer.city].filter(Boolean).join(' '),
  ].filter(Boolean)

  return (
    <>
      <style>{MODERN_CSS}</style>
      <div
        ref={containerRef}
        className="modern-canvas"
        style={{
          ['--canvas-accent' as any]: accent,
          ['--canvas-accent-50' as any]: accentLight,
          ['--canvas-accent-100' as any]: accent100,
        }}
      >
        <div className="page">
          {/* Header */}
          <header className="header">
            <div className="brand">
              <div className="brand-mark" style={{ background: accent }}>
                {data.business.logoUrl
                  ? <img src={data.business.logoUrl} alt={data.business.name} />
                  : data.business.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="brand-name">{data.business.name}</div>
                {data.business.tagline && <div className="brand-meta">{data.business.tagline}</div>}
              </div>
            </div>
            <div className="doc-meta">
              <div className="doc-label">Offert</div>
              <div className="doc-number">{data.quote.number}</div>
              {data.quote.dealNumber && <div className="doc-ref">Ärende {data.quote.dealNumber}</div>}
              <div className="doc-dates">
                <div><strong>Utfärdad:</strong> {data.quote.issuedDate}</div>
                <div><strong>Giltig till:</strong> {data.quote.validUntilDate}</div>
              </div>
            </div>
          </header>

          <div className="accent" style={{ background: accent }}></div>

          {/* Avsändare / Mottagare */}
          <section className="parties">
            <div>
              <div className="party-label" style={{ color: accent }}>Avsändare</div>
              <div className="party-name">{data.business.name}</div>
              {data.business.address && <div className="party-line">{data.business.address}</div>}
              <div className="party-meta">
                {[data.business.contactName, data.business.phone].filter(Boolean).join(' · ')}
                {data.business.email && <><br />{data.business.email}</>}
              </div>
            </div>
            <div>
              <div className="party-label" style={{ color: accent }}>Mottagare</div>
              <div className="party-name">
                {handlers.onCustomerNameChange
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

          {/* Titel + intro */}
          <h1 className="quote-title">
            <EditableText
              value={data.quote.title}
              onChange={handlers.onTitleChange}
              placeholder="Offerttitel"
            />
          </h1>
          {/* Beskrivningen är offertens öppningstext — inlednings-/avslutnings-
              texterna är borttagna ur flödet (redundanta, pilot-beslut 2026-07). */}
          <p className="quote-sub">
            <EditableText
              value={data.quote.description || ''}
              onChange={handlers.onDescriptionChange}
              placeholder="Beskriv vad offerten avser …"
              multiline
            />
          </p>

          {/* Items-tabell */}
          <table>
            <thead>
              <tr>
                <th>Beskrivning</th>
                <th className="num">Antal</th>
                <th className="num">Á-pris</th>
                <th className="num">Summa</th>
              </tr>
            </thead>
            <tbody>
              {data.quote.items.map((item, idx) => {
                // Speciella radtyper renderas som i den statiska modern-mallen
                // (lib/quote-templates/modern.ts) — utan inline-redigering.
                const itemType = item.itemType || 'item'
                if (itemType === 'heading') {
                  return (
                    <tr key={idx} className="row-heading">
                      <td colSpan={4}>{item.name}</td>
                    </tr>
                  )
                }
                if (itemType === 'text') {
                  return (
                    <tr key={idx} className="row-text">
                      <td colSpan={4}>{item.name}</td>
                    </tr>
                  )
                }
                if (itemType === 'subtotal') {
                  return (
                    <tr key={idx} className="row-subtotal">
                      <td colSpan={3}>{item.name || 'Delsumma'}</td>
                      <td className="num">{formatCurrency(item.total)}</td>
                    </tr>
                  )
                }
                if (itemType === 'discount') {
                  return (
                    <tr key={idx} className="row-discount">
                      <td><div className="item-name">{item.name || 'Rabatt'}</div></td>
                      <td className="num">{formatNumber(item.quantity)} {item.unit}</td>
                      <td className="num">{formatCurrency(Math.abs(item.unitPrice))}</td>
                      <td className="num">−{formatCurrency(Math.abs(item.total))}</td>
                    </tr>
                  )
                }
                // Tillvalsrader ('option') redigeras som vanliga item-rader,
                // men visar kryss-symbol (☑ vald / ☐ bortvald) + Tillval-badge.
                const isOption = itemType === 'option'
                return (
                <tr key={idx} className={`row-hover${isOption && !item.optionSelected ? ' row-option-unselected' : ''}`}>
                  <td style={{ position: 'relative' }}>
                    <span className="row-action" style={{ position: 'absolute', left: -22, top: 12 }}>
                      <button onClick={() => handlers.onItemRemove(idx)} title="Ta bort rad">×</button>
                    </span>
                    <div className="item-name">
                      {isOption && (
                        <span className="opt-box" title={item.optionSelected ? 'Förvalt tillval' : 'Ej förvalt tillval'}>
                          {item.optionSelected ? '☑' : '☐'}
                        </span>
                      )}
                      <EditableText
                        value={item.name}
                        onChange={v => handlers.onItemChange(idx, { ...item, name: v })}
                        placeholder="Rubrik"
                      />
                      {isOption && <span className="opt-badge">Tillval</span>}
                    </div>
                    <div className="item-desc">
                      <EditableText
                        value={item.description || ''}
                        onChange={v => handlers.onItemChange(idx, { ...item, description: v })}
                        placeholder="Beskrivning (valfri)"
                      />
                    </div>
                  </td>
                  <td className="num">
                    <EditableNumber
                      value={item.quantity}
                      onChange={v => {
                        const next = { ...item, quantity: v, total: v * item.unitPrice }
                        handlers.onItemChange(idx, next)
                      }}
                      width={50}
                      format={formatNumber}
                    />
                    {' '}{item.unit}
                  </td>
                  <td className="num">
                    <EditableNumber
                      value={item.unitPrice}
                      onChange={v => {
                        const next = { ...item, unitPrice: v, total: item.quantity * v }
                        handlers.onItemChange(idx, next)
                      }}
                      width={80}
                      format={formatCurrency}
                    />
                  </td>
                  <td className="num">{formatCurrency(item.total)}</td>
                </tr>
                )
              })}
            </tbody>
          </table>

          <button onClick={handlers.onItemAdd} className="add-row-btn">
            + Lägg till rad
          </button>

          {/* Totaler */}
          <div className="totals-wrap">
            <div className="totals">
              <div className="total-row"><span className="lbl">Summa exkl. moms</span><span className="val">{formatCurrency(data.quote.subtotalExVat)}</span></div>
              <div className="total-row"><span className="lbl">Moms 25%</span><span className="val">{formatCurrency(data.quote.vatAmount)}</span></div>
              <div className="total-row"><span className="lbl">Summa inkl. moms</span><span className="val">{formatCurrency(data.quote.totalIncVat)}</span></div>
              {data.quote.rotDeduction && (
                <div className="total-row rot" style={{ color: accent }}>
                  <span className="lbl">ROT-avdrag (30% av arbete)</span>
                  <span className="val" style={{ color: accent }}>−{formatCurrency(data.quote.rotDeduction)}</span>
                </div>
              )}
              {data.quote.rutDeduction && (
                <div className="total-row rot" style={{ color: accent }}>
                  <span className="lbl">RUT-avdrag (50% av arbete)</span>
                  <span className="val" style={{ color: accent }}>−{formatCurrency(data.quote.rutDeduction)}</span>
                </div>
              )}
              {data.quote.gronDeduction && (
                <div className="total-row rot" style={{ color: accent }}>
                  <span className="lbl">Grön teknik-avdrag</span>
                  <span className="val" style={{ color: accent }}>−{formatCurrency(data.quote.gronDeduction)}</span>
                </div>
              )}
              <div className="total-row grand"><span className="lbl">Att betala</span><span className="val">{formatCurrency(data.quote.amountToPay)}</span></div>
            </div>
          </div>

          {/* Betalning */}
          <div className={`pay-box ${data.business.swish ? '' : 'single'}`}>
            <div>
              <div className="pay-title" style={{ color: accent }}>Betalning</div>
              <div className="pay-text">
                Faktura skickas vid avslut.{' '}
                <strong>
                  {handlers.onPaymentTermsChange
                    ? <EditableText
                        value={data.quote.paymentTerms}
                        onChange={handlers.onPaymentTermsChange}
                        placeholder="30 dagar netto"
                      />
                    : data.quote.paymentTerms}
                </strong>.
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

          {/* Villkor */}
          <p className="terms">
            <strong>Villkor.</strong> Offerten gäller till {data.quote.validUntilDate}.{' '}
            {data.quote.rotDeduction && 'ROT-avdrag förutsätter att kund äger fastigheten och har utrymme i avdrag. '}
            Eventuellt tilläggsarbete debiteras enligt löpande räkning. Alla priser är exkl. moms om inte annat anges.
            {data.quote.notIncluded && <><br /><br /><strong>Ej inkluderat:</strong> {data.quote.notIncluded}</>}
            {data.quote.warrantyText && <><br /><br /><strong>Garanti:</strong> {data.quote.warrantyText}</>}
          </p>

          {/* Footer */}
          <footer className="footer">
            {data.business.orgNumber && <div><div className="l">Org.nr</div><div className="v">{data.business.orgNumber}</div></div>}
            {data.business.bankgiro && <div><div className="l">Bankgiro</div><div className="v">{data.business.bankgiro}</div></div>}
            <div><div className="l">F-skatt</div><div className="v">{data.business.fSkatt ? 'Innehas' : '—'}</div></div>
            {data.business.momsRegnr && <div><div className="l">Moms</div><div className="v">{data.business.momsRegnr}</div></div>}
          </footer>
        </div>
      </div>
    </>
  )
}
