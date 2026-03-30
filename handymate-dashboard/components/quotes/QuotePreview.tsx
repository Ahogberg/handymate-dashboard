'use client'

import React, { useMemo } from 'react'
import type { QuoteItem, PaymentPlanEntry, DetailLevel } from '@/lib/types/quote'
import { calculateQuoteTotals, recalculateItems, calculatePaymentPlan } from '@/lib/quote-calculations'
import { getItemRotRutType } from '@/lib/quote-calculations'
import { getCategoryLabel, type CustomCategory } from '@/lib/constants/categories'

// ── Design tokens (matching document-html.ts) ──
const ACCENT = '#0F766E'
const BORDER = '#E2E8F0'
const LABEL = '#CBD5E1'
const TEXT = '#1E293B'
const MUTED = '#64748B'
const SECONDARY = '#94A3B8'

export interface QuotePreviewData {
  title: string
  customerName: string
  customerAddress: string
  validDays: number
  items: QuoteItem[]
  discountPercent: number
  vatRate: number
  introductionText: string
  conclusionText: string
  notIncluded: string
  ataTerms: string
  paymentPlan: PaymentPlanEntry[]
  referencePerson: string
  customerReference: string
  projectAddress: string
  detailLevel: DetailLevel
  showUnitPrices: boolean
  showQuantities: boolean
  showCategorySubtotals?: boolean
  customCategories?: CustomCategory[]
}

interface QuotePreviewProps {
  data: QuotePreviewData
  businessName: string
  contactName: string
}

function formatCurrency(amount: number): string {
  if (!amount && amount !== 0) return '0 kr'
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + ' kr'
}

function formatDateLong(date: Date): string {
  const months = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

function getUnitLabel(unit: string): string {
  switch (unit) {
    case 'hour': case 'h': case 'tim': return 'tim'
    case 'piece': case 'st': return 'st'
    case 'm2': return 'm²'
    case 'm': return 'm'
    case 'lm': return 'lm'
    case 'pauschal': return 'pauschal'
    case 'kg': return 'kg'
    case 'l': return 'l'
    default: return unit || 'st'
  }
}

export default function QuotePreview({ data, businessName, contactName }: QuotePreviewProps) {
  const totals = useMemo(() => {
    const recalculated = recalculateItems(data.items)
    return calculateQuoteTotals(recalculated, data.discountPercent, data.vatRate)
  }, [data.items, data.discountPercent, data.vatRate])

  const now = new Date()
  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + data.validDays)

  const hasRotItems = data.items.some(i => i.is_rot_eligible || getItemRotRutType(i) === 'rot')
  const hasRutItems = data.items.some(i => i.is_rut_eligible || getItemRotRutType(i) === 'rut')
  const totalDeduction = totals.rotDeduction + totals.rutDeduction

  const calculatedPlan = useMemo(() => {
    if (data.paymentPlan.length === 0) return []
    return calculatePaymentPlan(totals.total, data.paymentPlan)
  }, [data.paymentPlan, totals.total])

  const itemsToRender = data.items.filter(i => {
    if (data.detailLevel === 'total_only') return false
    if (data.detailLevel === 'subtotals_only' && (i.item_type === 'item' || i.item_type === 'text')) return false
    return true
  })

  // Group items by category for subtotal rendering
  const groupedByCategory = useMemo(() => {
    if (!data.showCategorySubtotals) return null
    const groups: { slug: string; label: string; items: QuoteItem[]; subtotal: number }[] = []
    const slugMap = new Map<string, typeof groups[0]>()

    for (const item of itemsToRender) {
      if (item.item_type !== 'item') continue
      const slug = item.category_slug || '__uncategorized__'
      if (!slugMap.has(slug)) {
        const label = slug === '__uncategorized__' ? 'Övrigt' : getCategoryLabel(slug, data.customCategories)
        const group = { slug, label, items: [], subtotal: 0 }
        slugMap.set(slug, group)
        groups.push(group)
      }
      const group = slugMap.get(slug)!
      group.items.push(item)
      group.subtotal += item.quantity * item.unit_price
    }
    return groups
  }, [itemsToRender, data.showCategorySubtotals, data.customCategories])

  return (
    <div
      className="origin-top-left bg-white border border-[#E2E8F0] rounded-lg overflow-hidden"
      style={{ fontSize: '7.5px', lineHeight: 1.6, color: TEXT, fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}
    >
      <div className="p-5">
        {/* ── Header ── */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500 }}>{businessName || 'Företag'}</div>
            <div style={{ fontSize: '6.5px', color: SECONDARY, marginTop: 2 }}>{contactName}</div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: '9px', fontWeight: 600 }}>
              {data.title ? `Offert — ${data.title}` : 'Offert'}
            </div>
            <div style={{ fontSize: '6px', color: SECONDARY, marginTop: 2 }}>Ref: #XXXX</div>
          </div>
        </div>

        {/* ── Teal line ── */}
        <div style={{ height: 1, background: ACCENT, opacity: 0.25, marginBottom: 12 }} />

        {/* ── Meta row ── */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 2 }}>Kund</div>
            <div style={{ fontSize: '7.5px' }}>{data.customerName || 'Ej vald'}</div>
            {data.customerAddress && <div style={{ fontSize: '7.5px' }}>{data.customerAddress}</div>}
          </div>
          <div>
            <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 2 }}>Offertdatum</div>
            <div style={{ fontSize: '7.5px' }}>{formatDateLong(now)}</div>
            <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 2, marginTop: 6 }}>Giltig till</div>
            <div style={{ fontSize: '7.5px', color: ACCENT, fontWeight: 500 }}>{formatDateLong(validUntil)}</div>
          </div>
          <div>
            <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 2 }}>Avser</div>
            <div style={{ fontSize: '7.5px' }}>{data.title || data.projectAddress || 'Arbete enligt nedan'}</div>
          </div>
        </div>

        {/* ── References ── */}
        {(data.referencePerson || data.customerReference) && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {data.referencePerson && (
              <div style={{ fontSize: '6.5px', color: MUTED }}>
                Vår referens: <strong style={{ color: TEXT, fontWeight: 500 }}>{data.referencePerson}</strong>
              </div>
            )}
            {data.customerReference && (
              <div style={{ fontSize: '6.5px', color: MUTED }}>
                Er referens: <strong style={{ color: TEXT, fontWeight: 500 }}>{data.customerReference}</strong>
              </div>
            )}
          </div>
        )}

        {/* ── Introduction text ── */}
        {data.introductionText && (
          <div style={{ fontSize: '7px', color: MUTED, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
            {data.introductionText}
          </div>
        )}

        {/* ── Items ── */}
        {itemsToRender.length > 0 && (
          <>
            <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 6 }}>
              Arbeten och material
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <thead>
                <tr style={{ borderBottom: `0.5px solid ${BORDER}` }}>
                  <th style={{ textAlign: 'left', fontSize: '5.5px', letterSpacing: '0.08em', textTransform: 'uppercase', color: LABEL, paddingBottom: 4, fontWeight: 400, width: '44%' }}>Beskrivning</th>
                  {data.showQuantities && (
                    <>
                      <th style={{ textAlign: 'right', fontSize: '5.5px', letterSpacing: '0.08em', textTransform: 'uppercase', color: LABEL, paddingBottom: 4, fontWeight: 400, width: '10%' }}>Antal</th>
                      <th style={{ textAlign: 'right', fontSize: '5.5px', letterSpacing: '0.08em', textTransform: 'uppercase', color: LABEL, paddingBottom: 4, fontWeight: 400, width: '10%' }}>Enhet</th>
                    </>
                  )}
                  {data.showUnitPrices && (
                    <th style={{ textAlign: 'right', fontSize: '5.5px', letterSpacing: '0.08em', textTransform: 'uppercase', color: LABEL, paddingBottom: 4, fontWeight: 400, width: '18%' }}>Pris/enhet</th>
                  )}
                  <th style={{ textAlign: 'right', fontSize: '5.5px', letterSpacing: '0.08em', textTransform: 'uppercase', color: LABEL, paddingBottom: 4, fontWeight: 400, width: '18%' }}>Summa</th>
                </tr>
              </thead>
              <tbody>
                {groupedByCategory ? (
                  <>
                    {groupedByCategory.map((group) => (
                      <React.Fragment key={group.slug}>
                        <tr>
                          <td colSpan={10} style={{ fontWeight: 500, fontSize: '7.5px', paddingTop: 8, paddingBottom: 4, borderBottom: `0.5px solid ${BORDER}` }}>
                            {group.label}
                          </td>
                        </tr>
                        {group.items.map((item) => {
                          const lineTotal = item.quantity * item.unit_price
                          const rotRutType = getItemRotRutType(item)
                          return (
                            <tr key={item.id} style={{ borderBottom: `0.5px solid #F1F5F9` }}>
                              <td style={{ padding: '4px 0', verticalAlign: 'top', paddingLeft: 6 }}>
                                <span style={{ fontWeight: 500, fontSize: '7.5px' }}>{item.description}</span>
                                {rotRutType === 'rot' && (
                                  <span style={{ display: 'inline-block', fontSize: '5px', fontWeight: 500, color: ACCENT, background: '#CCFBF1', padding: '0 3px', borderRadius: 2, marginLeft: 3 }}>ROT</span>
                                )}
                                {rotRutType === 'rut' && (
                                  <span style={{ display: 'inline-block', fontSize: '5px', fontWeight: 500, color: '#1d4ed8', background: '#dbeafe', padding: '0 3px', borderRadius: 2, marginLeft: 3 }}>RUT</span>
                                )}
                              </td>
                              {data.showQuantities && (
                                <>
                                  <td style={{ textAlign: 'right', padding: '4px 0', color: SECONDARY }}>{item.quantity}</td>
                                  <td style={{ textAlign: 'right', padding: '4px 0', color: SECONDARY }}>{getUnitLabel(item.unit)}</td>
                                </>
                              )}
                              {data.showUnitPrices && (
                                <td style={{ textAlign: 'right', padding: '4px 0', color: SECONDARY }}>{formatCurrency(item.unit_price)}</td>
                              )}
                              <td style={{ textAlign: 'right', padding: '4px 0', fontWeight: 500 }}>{formatCurrency(lineTotal)}</td>
                            </tr>
                          )
                        })}
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'right', fontWeight: 500, borderTop: `0.5px solid ${BORDER}`, paddingTop: 3, paddingBottom: 6, fontSize: '7px', color: MUTED }}>
                            Delsumma {group.label.toLowerCase()}: {formatCurrency(group.subtotal)}
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                    {/* Non-item rows (headings, texts, discounts, subtotals) rendered after groups */}
                    {itemsToRender.filter(i => i.item_type !== 'item').map((item) => {
                      if (item.item_type === 'heading') {
                        return (
                          <tr key={item.id}>
                            <td colSpan={10} style={{ fontWeight: 500, fontSize: '7.5px', paddingTop: 8, paddingBottom: 4, borderBottom: `0.5px solid ${BORDER}` }}>
                              {item.description || item.group_name}
                            </td>
                          </tr>
                        )
                      }
                      if (item.item_type === 'discount') {
                        return (
                          <tr key={item.id}>
                            <td colSpan={10} style={{ display: 'flex', justifyContent: 'space-between', color: ACCENT, padding: '4px 0', borderBottom: `0.5px solid #F1F5F9` }}>
                              <span>{item.description || 'Rabatt'}</span>
                              <span>{formatCurrency(item.total)}</span>
                            </td>
                          </tr>
                        )
                      }
                      return null
                    })}
                  </>
                ) : (
                  itemsToRender.map((item) => {
                    if (item.item_type === 'heading') {
                      return (
                        <tr key={item.id}>
                          <td colSpan={10} style={{ fontWeight: 500, fontSize: '7.5px', paddingTop: 8, paddingBottom: 4, borderBottom: `0.5px solid ${BORDER}` }}>
                            {item.description || item.group_name}
                          </td>
                        </tr>
                      )
                    }
                    if (item.item_type === 'text') {
                      return (
                        <tr key={item.id}>
                          <td colSpan={10} style={{ fontSize: '6.5px', color: SECONDARY, fontStyle: 'italic', padding: '3px 0' }}>
                            {item.description}
                          </td>
                        </tr>
                      )
                    }
                    if (item.item_type === 'subtotal') {
                      return (
                        <tr key={item.id}>
                          <td colSpan={10} style={{ textAlign: 'right', fontWeight: 500, borderTop: `0.5px solid ${BORDER}`, paddingTop: 4, paddingBottom: 4, fontSize: '7.5px' }}>
                            {item.description || 'Delsumma'} — {formatCurrency(item.total)}
                          </td>
                        </tr>
                      )
                    }
                    if (item.item_type === 'discount') {
                      return (
                        <tr key={item.id}>
                          <td colSpan={10} style={{ display: 'flex', justifyContent: 'space-between', color: ACCENT, padding: '4px 0', borderBottom: `0.5px solid #F1F5F9` }}>
                            <span>{item.description || 'Rabatt'}</span>
                            <span>{formatCurrency(item.total)}</span>
                          </td>
                        </tr>
                      )
                    }
                    // item
                    const lineTotal = item.quantity * item.unit_price
                    const rotRutType = getItemRotRutType(item)
                    return (
                      <tr key={item.id} style={{ borderBottom: `0.5px solid #F1F5F9` }}>
                        <td style={{ padding: '4px 0', verticalAlign: 'top' }}>
                          <span style={{ fontWeight: 500, fontSize: '7.5px' }}>{item.description}</span>
                          {rotRutType === 'rot' && (
                            <span style={{ display: 'inline-block', fontSize: '5px', fontWeight: 500, color: ACCENT, background: '#CCFBF1', padding: '0 3px', borderRadius: 2, marginLeft: 3 }}>ROT</span>
                          )}
                          {rotRutType === 'rut' && (
                            <span style={{ display: 'inline-block', fontSize: '5px', fontWeight: 500, color: '#1d4ed8', background: '#dbeafe', padding: '0 3px', borderRadius: 2, marginLeft: 3 }}>RUT</span>
                          )}
                        </td>
                        {data.showQuantities && (
                          <>
                            <td style={{ textAlign: 'right', padding: '4px 0', color: SECONDARY }}>{item.quantity}</td>
                            <td style={{ textAlign: 'right', padding: '4px 0', color: SECONDARY }}>{getUnitLabel(item.unit)}</td>
                          </>
                        )}
                        {data.showUnitPrices && (
                          <td style={{ textAlign: 'right', padding: '4px 0', color: SECONDARY }}>{formatCurrency(item.unit_price)}</td>
                        )}
                        <td style={{ textAlign: 'right', padding: '4px 0', fontWeight: 500 }}>{formatCurrency(lineTotal)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </>
        )}

        {/* ── Not included ── */}
        {data.notIncluded && (
          <div style={{ padding: '6px 8px', border: `0.5px solid ${BORDER}`, borderRadius: 4, marginBottom: 10 }}>
            <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 3 }}>Ej inkluderat i offerten</div>
            <div style={{ fontSize: '6.5px', color: MUTED, whiteSpace: 'pre-wrap' }}>{data.notIncluded}</div>
          </div>
        )}

        {/* ── ÄTA terms ── */}
        {data.ataTerms && (
          <div style={{ padding: '6px 8px', border: `0.5px solid ${BORDER}`, borderRadius: 4, marginBottom: 10 }}>
            <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 3 }}>ÄTA-villkor</div>
            <div style={{ fontSize: '6.5px', color: MUTED, whiteSpace: 'pre-wrap' }}>{data.ataTerms}</div>
          </div>
        )}

        {/* ── Totals ── */}
        <div className="flex justify-end mb-4">
          <div style={{ width: 140 }}>
            <div className="flex justify-between" style={{ padding: '2px 0', fontSize: '7.5px', color: MUTED }}>
              <span>Netto exkl. moms</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            {data.discountPercent > 0 && totals.discountAmount > 0 && (
              <div className="flex justify-between" style={{ padding: '2px 0', fontSize: '7.5px', color: MUTED }}>
                <span>Rabatt</span>
                <span>-{formatCurrency(totals.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between" style={{ padding: '2px 0', fontSize: '7.5px', color: MUTED }}>
              <span>Moms {data.vatRate}%</span>
              <span>{formatCurrency(totals.vat)}</span>
            </div>
            {hasRotItems && totals.rotDeduction > 0 && (
              <div className="flex justify-between" style={{ padding: '2px 0', fontSize: '7.5px', color: ACCENT }}>
                <span>ROT-avdrag 30%</span>
                <span>-{formatCurrency(totals.rotDeduction)}</span>
              </div>
            )}
            {hasRutItems && totals.rutDeduction > 0 && (
              <div className="flex justify-between" style={{ padding: '2px 0', fontSize: '7.5px', color: ACCENT }}>
                <span>RUT-avdrag 50%</span>
                <span>-{formatCurrency(totals.rutDeduction)}</span>
              </div>
            )}
            <div className="flex justify-between" style={{ borderTop: `0.5px solid ${BORDER}`, marginTop: 4, paddingTop: 6, fontSize: '8.5px', fontWeight: 500 }}>
              <span>{totalDeduction > 0 ? 'Att betala' : 'Totalt inkl. moms'}</span>
              <span>{formatCurrency(totalDeduction > 0 ? totals.total - totalDeduction : totals.total)}</span>
            </div>
          </div>
        </div>

        {/* ── Payment plan ── */}
        {calculatedPlan.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 4 }}>Betalningsplan</div>
            {calculatedPlan.map((entry, idx) => (
              <div key={idx} className="flex justify-between" style={{ fontSize: '6.5px', color: MUTED, padding: '1px 0' }}>
                <span>{entry.label || `Delfaktura ${idx + 1}`} ({entry.percent}%)</span>
                <span>{formatCurrency(entry.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Conclusion text ── */}
        {data.conclusionText && (
          <div style={{ fontSize: '7px', color: MUTED, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
            {data.conclusionText}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ borderTop: `0.5px solid ${BORDER}`, paddingTop: 8, marginTop: 4 }}>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 2 }}>Betalningsvillkor</div>
              <div style={{ fontSize: '6.5px', color: MUTED }}>30 dagar netto</div>
            </div>
            <div>
              <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 2 }}>Org.nr</div>
              <div style={{ fontSize: '6.5px', color: MUTED }}>—</div>
            </div>
            <div>
              <div style={{ fontSize: '5.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: LABEL, marginBottom: 2 }}>Bankgiro</div>
              <div style={{ fontSize: '6.5px', color: MUTED }}>—</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
