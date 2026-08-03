/** @jsxImportSource react */
import { EditableText, EditableNumber, EditableSelect } from '@/components/quotes/editable/EditableFields'
import { UNIT_OPTIONS } from '@/components/quotes/ItemRow'
import { formatCurrency } from '@/lib/document-html'
import type { QuoteTemplateItem } from '@/lib/quote-templates/types'
import type { QuoteDocumentHandlers, QuoteDocumentMode } from './types'
import { formatNumber } from './format'

/**
 * En rads rendering i Modern-dokumentet — ETAPP 2a (offert-masterplan.md).
 * Körs BÅDE i static-läge (→ renderToStaticMarkup → PDF/kundvy-HTML, måste
 * producera EXAKT samma textinnehåll som gamla lib/quote-templates/modern.ts
 * gjorde — se tests/quote-document-parity.spec.ts) och edit-läge (den
 * redigerbara canvasen i offert-byggaren).
 *
 * VIKTIGT för pariteten: ROT/RUT-badgen och "Förvald"-togglen är NYA
 * canvas-ENDAST-affordanser (fanns inte i modern.ts:s statiska HTML) —
 * de får ALDRIG renderas i static-läge, annars läggs text till som gamla
 * mallen aldrig skrev ut och paritetstestet slår fast fel.
 */

interface QuoteDocumentRowProps {
  item: QuoteTemplateItem
  mode: QuoteDocumentMode
  /** Endast static-läge: styr om antal/à-pris-kolumnerna visas
      (displayLevel/visningsnivå). Edit-läget visar ALLTID båda — hantverkaren
      redigerar alltid med full insyn, oavsett vad kunden senare får se
      (samma beteende som ModernCanvas hade). */
  showQty: boolean
  showPrice: boolean
  colCount: number
  handlers?: QuoteDocumentHandlers
}

function componentSpec(components: QuoteTemplateItem['components']) {
  if (!components || components.length === 0) return null
  return (
    <ul className="item-components">
      {components.map((c, i) => (
        <li key={i}>
          {c.description}
          {c.quantityPerUnit ? ` · ${formatNumber(c.quantityPerUnit)} ${c.unit}` : ''}
        </li>
      ))}
    </ul>
  )
}

/** Klickbar ROT/RUT-badge — ENDAST edit-läge (se filkommentaren ovan). */
function RotBadge({ item, onCycle }: { item: QuoteTemplateItem; onCycle?: () => void }) {
  const type = item.rotRutType ?? (item.isRotEligible ? 'rot' : item.isRutEligible ? 'rut' : null)
  const isGron = type === 'gron_solceller' || type === 'gron_lagring' || type === 'gron_laddpunkt'
  const label = type === 'rot' ? 'ROT' : type === 'rut' ? 'RUT' : isGron ? 'Grön teknik' : 'ROT/RUT —'
  return (
    <span
      className={`rot-badge${isGron ? ' gron' : ''}`}
      onClick={onCycle}
      title={isGron
        ? 'Grön teknik väljs i radlistan — klicka för att byta till ROT'
        : 'Klicka för att växla ROT/RUT'}
    >
      {label}
    </span>
  )
}

function DeleteButton({ id, handlers }: { id: string | undefined; handlers?: QuoteDocumentHandlers }) {
  if (!id || !handlers) return null
  return (
    <span className="row-action">
      <button type="button" onClick={() => handlers.onItemRemove(id)} title="Ta bort rad">×</button>
    </span>
  )
}

export function QuoteDocumentRow({ item, mode, showQty, showPrice, colCount, handlers }: QuoteDocumentRowProps) {
  const isEdit = mode === 'edit' && !!handlers && !!item.id
  const itemType = item.itemType || 'item'

  const qtyCell = showQty ? (
    <td className="num">
      {isEdit ? (
        <>
          <EditableNumber
            value={item.quantity}
            onChange={v => handlers!.onItemChange(item.id!, { quantity: v })}
            width={50}
            format={formatNumber}
          />{' '}
          <EditableSelect
            value={item.unit}
            onChange={v => handlers!.onItemChange(item.id!, { unit: v })}
            options={UNIT_OPTIONS}
          />
        </>
      ) : (
        <>{formatNumber(item.quantity)} {item.unit}</>
      )}
    </td>
  ) : null

  const priceCell = (displayValue: number, onEdit?: (v: number) => void) =>
    showPrice ? (
      <td className="num">
        {isEdit && onEdit ? (
          <EditableNumber value={displayValue} onChange={onEdit} width={80} format={formatCurrency} />
        ) : (
          formatCurrency(displayValue)
        )}
      </td>
    ) : null

  // ── Rubrik ────────────────────────────────────────────────────
  if (itemType === 'heading') {
    return (
      <tr className="row-heading">
        <td colSpan={colCount}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            {isEdit
              ? <EditableText value={item.name} onChange={v => handlers!.onItemChange(item.id!, { name: v })} placeholder="Rubriktext" />
              : item.name}
            <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
          </div>
        </td>
      </tr>
    )
  }

  // ── Fritext ───────────────────────────────────────────────────
  if (itemType === 'text') {
    return (
      <tr className="row-text">
        <td colSpan={colCount}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            {isEdit
              ? <EditableText value={item.name} onChange={v => handlers!.onItemChange(item.id!, { name: v })} placeholder="Fritext…" />
              : item.name}
            <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
          </div>
        </td>
      </tr>
    )
  }

  // ── Delsumma ──────────────────────────────────────────────────
  if (itemType === 'subtotal') {
    return (
      <tr className="row-subtotal">
        <td colSpan={colCount - 1}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
            {isEdit
              ? <EditableText value={item.name || 'Delsumma'} onChange={v => handlers!.onItemChange(item.id!, { name: v })} placeholder="Delsumma" />
              : (item.name || 'Delsumma')}
          </div>
        </td>
        <td className="num">{formatCurrency(item.total)}</td>
      </tr>
    )
  }

  // ── Rabatt ────────────────────────────────────────────────────
  if (itemType === 'discount') {
    return (
      <tr className={`row-discount${isEdit ? ' row-hover' : ''}`}>
        <td style={isEdit ? { position: 'relative' } : undefined}>
          <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
          <div className="item-name">
            {isEdit
              ? <EditableText value={item.name || 'Rabatt'} onChange={v => handlers!.onItemChange(item.id!, { name: v })} placeholder="Rabatt" />
              : (item.name || 'Rabatt')}
          </div>
        </td>
        {showQty ? <td className="num">{formatNumber(item.quantity)} {item.unit}</td> : null}
        {priceCell(Math.abs(item.unitPrice), isEdit ? v => handlers!.onItemChange(item.id!, { unitPrice: v }) : undefined)}
        <td className="num">−{formatCurrency(Math.abs(item.total))}</td>
      </tr>
    )
  }

  // ── Tillval ───────────────────────────────────────────────────
  if (itemType === 'option') {
    const box = item.optionSelected ? '☑' : '☐'
    return (
      <tr className={`row-option${item.optionSelected ? '' : ' unselected'}${isEdit ? ' row-hover' : ''}`}>
        <td style={isEdit ? { position: 'relative' } : undefined}>
          <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
          <div className="item-name">
            <span className="opt-box" title={item.optionSelected ? 'Ikryssat av kunden' : 'Ej ikryssat'}>{box}</span>{' '}
            {isEdit
              ? <EditableText value={item.name} onChange={v => handlers!.onItemChange(item.id!, { name: v })} placeholder="Tillval" />
              : item.name}{' '}
            <span className="opt-badge">Tillval</span>
            {isEdit && (
              <label className="opt-toggle">
                <input
                  type="checkbox"
                  checked={item.optionSelected ?? false}
                  onChange={e => handlers!.onOptionDefaultToggle(item.id!, e.target.checked)}
                  style={{ width: 12, height: 12 }}
                />
                Förvald
              </label>
            )}
            {isEdit && <>{' '}<RotBadge item={item} onCycle={() => handlers!.onItemRotRutCycle(item.id!)} /></>}
          </div>
          {item.description ? <div className="item-desc">{item.description}</div> : null}
          {componentSpec(item.components)}
        </td>
        {qtyCell}
        {priceCell(item.unitPrice, isEdit ? v => handlers!.onItemChange(item.id!, { unitPrice: v }) : undefined)}
        <td className="num">{formatCurrency(item.total)}</td>
      </tr>
    )
  }

  // ── Vanlig rad ('item') ──────────────────────────────────────
  return (
    <tr className={isEdit ? 'row-hover' : undefined}>
      <td style={isEdit ? { position: 'relative' } : undefined}>
        <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
        <div className="item-name">
          {isEdit
            ? <EditableText value={item.name} onChange={v => handlers!.onItemChange(item.id!, { name: v })} placeholder="Rubrik" />
            : item.name}
          {isEdit && <>{' '}<RotBadge item={item} onCycle={() => handlers!.onItemRotRutCycle(item.id!)} /></>}
        </div>
        {item.description ? <div className="item-desc">{item.description}</div> : null}
        {componentSpec(item.components)}
      </td>
      {qtyCell}
      {priceCell(item.unitPrice, isEdit ? v => handlers!.onItemChange(item.id!, { unitPrice: v }) : undefined)}
      <td className="num">{formatCurrency(item.total)}</td>
    </tr>
  )
}
