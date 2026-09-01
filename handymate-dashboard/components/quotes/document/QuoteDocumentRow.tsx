/** @jsxImportSource react */
import { EditableText, EditableNumber, EditableSelect } from '@/components/quotes/editable/EditableFields'
import { UNIT_OPTIONS } from '@/components/quotes/ItemRow'
import { formatCurrency } from '@/lib/document-html'
import { priceState, priceLabel } from '@/lib/products/pricing-state'
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
  /** ETAPP 3 (offert-masterplan.md): se types.ts QuoteDocumentMobileProps.
      När satt (+ onTap) stängs radens inline-fält AV och hela raden blir
      tappbar istället — dagens 30px-inputs klarar inte 44px-kravet i
      A4-skala på en mobilskärm. */
  sheetMode?: boolean
  /** Bara satt när sheetMode är på OCH raden har ett id — se QuoteDocument.tsx. */
  onTap?: () => void
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

/** Klickbar ROT/RUT-badge — ENDAST edit-läge (se filkommentaren ovan).
    onCycle utelämnad (sheetMode, ETAPP 3) → badgen visas men reagerar inte
    på tryck; hela raden är tappbar istället (se onTap på tr-elementen).
    Punkt 5 (offert-feedback 2026-08-04): "ROT/RUT —" för tom avdragstyp lästes
    som en död platshållare, inte en klickbar kontroll — badgen ÄNDRAS aldrig
    tyst till "ROT/RUT —" utan visar nu "+ROT?" (dämpad) så det är tydligt att
    ett klick FÖRESLÅR nästa steg i cykeln (null→rot→rut→null), inte bara
    rapporterar ett tomt läge. */
function RotBadge({ item, onCycle }: { item: QuoteTemplateItem; onCycle?: () => void }) {
  const type = item.rotRutType ?? (item.isRotEligible ? 'rot' : item.isRutEligible ? 'rut' : null)
  const isGron = type === 'gron_solceller' || type === 'gron_lagring' || type === 'gron_laddpunkt'
  const isEmpty = type === null && !isGron
  const label = type === 'rot' ? 'ROT' : type === 'rut' ? 'RUT' : isGron ? 'Grön teknik' : '+ROT?'
  return (
    <span
      className={`rot-badge${isGron ? ' gron' : ''}${isEmpty ? ' empty' : ''}`}
      onClick={onCycle}
      style={onCycle ? undefined : { cursor: 'default' }}
      title={!onCycle
        ? undefined
        : isGron
          ? 'Grön teknik väljs i radlistan — klicka för att byta till ROT'
          : 'Klicka för att växla ROT/RUT för raden'}
    >
      {label}
    </span>
  )
}

/** Ta bort-knappen — fungerar OFÖRÄNDRAT i både desktop-inline-läget och
    sheetMode (ETAPP 3, punkt 2): stopPropagation krävs i sheetMode så ett
    tryck på × inte OCKSÅ bubblar upp till radens onTap och öppnar sheeten. */
function DeleteButton({ id, handlers }: { id: string | undefined; handlers?: QuoteDocumentHandlers }) {
  // ETAPP C3: gatas på sin EGEN handler. I sektionsgranskningen får bara den
  // fokuserade sektionen redigeras — utan den här kontrollen hade ×-knappen
  // renderats även när onItemRemove inte skickats med, och ett tryck hade
  // kraschat i stället för att vara overkställt.
  const onRemove = handlers?.onItemRemove
  if (!id || !onRemove) return null
  return (
    <span className="row-action">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onRemove(id) }}
        title="Ta bort rad"
      >
        ×
      </button>
    </span>
  )
}

export function QuoteDocumentRow({ item, mode, showQty, showPrice, colCount, handlers, sheetMode, onTap }: QuoteDocumentRowProps) {
  const isEdit = mode === 'edit' && !!handlers && !!item.id
  // ETAPP 3: i sheetMode stängs inline-fälten av (för små för touch i
  // A4-skala) — hela raden blir tappbar istället (öppnar RowEditSheet via
  // onTap). Delete-knappen är undantaget (se DeleteButton-kommentaren).
  const tapMode = isEdit && !!sheetMode && !!onTap
  // ETAPP C3: fältredigering kräver att onItemChange FAKTISKT skickats med.
  // Sektionsgranskningen skickar ett partiellt handlers-objekt, och utan den
  // här kontrollen hade fälten sett redigerbara ut i en sektion som inte är i
  // fokus — ett löfte gränssnittet inte kan hålla.
  const canEditFields = !!handlers?.onItemChange
  const fieldsEditable = isEdit && !tapMode && canEditFields
  const itemType = item.itemType || 'item'
  // Non-null-assertion nedan är säker: varje användning ligger bakom
  // fieldsEditable, som just kontrollerat att handlern finns.
  const patch = (id: string, p: Parameters<NonNullable<QuoteDocumentHandlers['onItemChange']>>[1]) =>
    handlers!.onItemChange!(id, p)

  // Dold rad (v90): kunden ska inte se den — men priset ingår i summan, så
  // beräkningarna rör den aldrig. I edit-läge visas den ghostad med en
  // markering, annars vet hantverkaren inte vad kunden faktiskt får se.
  if (item.isHidden && mode !== 'edit') return null

  const rowTapProps = tapMode ? { onClick: onTap, className: 'row-tap' } : {}
  const hiddenRowClass = item.isHidden ? 'row-hidden' : undefined

  const qtyCell = showQty ? (
    <td className="num">
      {fieldsEditable ? (
        <>
          <EditableNumber
            value={item.quantity}
            onChange={v => patch(item.id!, { quantity: v })}
            width={50}
            format={formatNumber}
          />{' '}
          <EditableSelect
            value={item.unit}
            onChange={v => patch(item.id!, { unit: v })}
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
        {fieldsEditable && onEdit ? (
          <EditableNumber value={displayValue} onChange={onEdit} width={80} format={formatCurrency} />
        ) : (
          formatCurrency(displayValue)
        )}
      </td>
    ) : null

  // Fas C (offertskaparen-design-polish): 'item'/'option'-radernas summa-
  // cell ska ALDRIG visa "0 kr" för en artikel som aldrig prissatts — det
  // är omöjligt att skilja från en artikel som medvetet kostar 0 kr.
  // priceState/priceLabel är SAMMA rena funktioner AddRowSheet.tsx redan
  // använder för produktbankens prislösa artiklar (lib/products/pricing-
  // state.ts) — ingen ny logik, bara samma regel applicerad på offertraden.
  //
  // Gated på isEdit: "Sätt pris" är en intern uppmaning till hantverkaren,
  // aldrig något en kund ska se i static/PDF-läget — där renderas alltid
  // formatCurrency(total) precis som förut, oavsett pris.
  const isPriceless = (unitPrice: number) => isEdit && priceState(unitPrice) === 'osatt'
  // priceless beräknas EN gång per rad av anroparen (isPriceless(item.unitPrice))
  // och skickas in hit — annars räknas priceState() ut två gånger per rad
  // (en för klassen, en för cellen).
  const sumCell = (priceless: boolean, unitPrice: number, total: number, unit: string) =>
    priceless
      ? <td className="num"><span className="price-missing-pill">{priceLabel(unitPrice, unit)}</span></td>
      : <td className="num">{formatCurrency(total)}</td>

  // ── Rubrik ────────────────────────────────────────────────────
  if (itemType === 'heading') {
    return (
      <tr {...rowTapProps} className={['row-heading', rowTapProps.className, hiddenRowClass].filter(Boolean).join(' ') || undefined}>
        <td colSpan={colCount}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            {fieldsEditable
              ? <EditableText value={item.name} onChange={v => patch(item.id!, { name: v })} placeholder="Rubriktext" />
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
      <tr {...rowTapProps} className={['row-text', rowTapProps.className, hiddenRowClass].filter(Boolean).join(' ') || undefined}>
        <td colSpan={colCount}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            {fieldsEditable
              ? <EditableText value={item.name} onChange={v => patch(item.id!, { name: v })} placeholder="Fritext…" />
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
      <tr {...rowTapProps} className={['row-subtotal', rowTapProps.className, hiddenRowClass].filter(Boolean).join(' ') || undefined}>
        <td colSpan={colCount - 1}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
            {fieldsEditable
              ? <EditableText value={item.name || 'Delsumma'} onChange={v => patch(item.id!, { name: v })} placeholder="Delsumma" />
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
      <tr {...rowTapProps} className={['row-discount', isEdit ? 'row-hover' : '', rowTapProps.className, hiddenRowClass].filter(Boolean).join(' ') || undefined}>
        <td style={isEdit ? { position: 'relative' } : undefined}>
          <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
          <div className="item-name">
            {fieldsEditable
              ? <EditableText value={item.name || 'Rabatt'} onChange={v => patch(item.id!, { name: v })} placeholder="Rabatt" />
              : (item.name || 'Rabatt')}
          </div>
        </td>
        {showQty ? <td className="num">{formatNumber(item.quantity)} {item.unit}</td> : null}
        {priceCell(Math.abs(item.unitPrice), fieldsEditable ? v => patch(item.id!, { unitPrice: v }) : undefined)}
        <td className="num">−{formatCurrency(Math.abs(item.total))}</td>
      </tr>
    )
  }

  // ── Tillval ───────────────────────────────────────────────────
  if (itemType === 'option') {
    const box = item.optionSelected ? '☑' : '☐'
    const priceless = isPriceless(item.unitPrice)
    const pricelessClass = priceless ? 'row-priceless' : undefined
    return (
      <tr {...rowTapProps} className={[`row-option${item.optionSelected ? '' : ' unselected'}`, isEdit ? 'row-hover' : '', pricelessClass, rowTapProps.className, hiddenRowClass].filter(Boolean).join(' ') || undefined}>
        <td style={isEdit ? { position: 'relative' } : undefined}>
          <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
          <div className="item-name">
            <span className="opt-box" title={item.optionSelected ? 'Ikryssat av kunden' : 'Ej ikryssat'}>{box}</span>{' '}
            {fieldsEditable
              ? <EditableText value={item.name} onChange={v => patch(item.id!, { name: v })} placeholder="Tillval" />
              : item.name}{' '}
            <span className="opt-badge">Tillval</span>
            {isEdit && (
              <label className="opt-toggle" style={tapMode ? { opacity: 0.65 } : undefined}>
                <input
                  type="checkbox"
                  checked={item.optionSelected ?? false}
                  disabled={tapMode}
                  onChange={e => handlers!.onOptionDefaultToggle!(item.id!, e.target.checked)}
                  style={{ width: 12, height: 12 }}
                />
                Förvald
              </label>
            )}
            {isEdit && <>{' '}<RotBadge item={item} onCycle={fieldsEditable ? () => handlers!.onItemRotRutCycle!(item.id!) : undefined} /></>}
            {item.isHidden && <>{' '}<span className="hidden-badge" title="Raden syns inte för kunden — priset ingår ändå i summan">Dold</span></>}
          </div>
          {item.description ? <div className="item-desc">{item.description}</div> : null}
          {componentSpec(item.components)}
        </td>
        {qtyCell}
        {priceCell(item.unitPrice, fieldsEditable ? v => patch(item.id!, { unitPrice: v }) : undefined)}
        {sumCell(priceless, item.unitPrice, item.total, item.unit)}
      </tr>
    )
  }

  // ── Vanlig rad ('item') ──────────────────────────────────────
  const priceless = isPriceless(item.unitPrice)
  const pricelessClass = priceless ? 'row-priceless' : undefined
  return (
    <tr {...rowTapProps} className={[isEdit ? 'row-hover' : '', pricelessClass, rowTapProps.className, hiddenRowClass].filter(Boolean).join(' ') || undefined}>
      <td style={isEdit ? { position: 'relative' } : undefined}>
        <DeleteButton id={item.id} handlers={isEdit ? handlers : undefined} />
        <div className="item-name">
          {fieldsEditable
            ? <EditableText value={item.name} onChange={v => patch(item.id!, { name: v })} placeholder="Rubrik" />
            : item.name}
          {isEdit && <>{' '}<RotBadge item={item} onCycle={fieldsEditable ? () => handlers!.onItemRotRutCycle!(item.id!) : undefined} /></>}
          {item.isHidden && <>{' '}<span className="hidden-badge" title="Raden syns inte för kunden — priset ingår ändå i summan">Dold</span></>}
        </div>
        {item.description ? <div className="item-desc">{item.description}</div> : null}
        {/* ETAPP 6a (offert-masterplan.md, faktura-sprinten): performed_by_name
            (multi-employee-parity-planet) renderas diskret under raden —
            docType-agnostiskt fält (alltid undefined för offertrader idag,
            eftersom offertens data-builder aldrig sätter det). */}
        {item.performedByName ? <div className="item-performed-by">Utfört av {item.performedByName}</div> : null}
        {/* Kvittoprincipen Fall 3 — gated på isEdit som EXTRA säkerhetslager
            utöver att fältet aldrig ens finns i kundens dokument-data (se
            typkommentaren i lib/quote-templates/types.ts). */}
        {isEdit && item.aiUncertain ? (
          <div className="item-ai-uncertain">
            <span className="pill">Osäker</span>
            {item.aiNote ? <span className="note">{item.aiNote}</span> : null}
          </div>
        ) : null}
        {componentSpec(item.components)}
      </td>
      {qtyCell}
      {priceCell(item.unitPrice, fieldsEditable ? v => patch(item.id!, { unitPrice: v }) : undefined)}
      {sumCell(priceless, item.unitPrice, item.total, item.unit)}
    </tr>
  )
}
