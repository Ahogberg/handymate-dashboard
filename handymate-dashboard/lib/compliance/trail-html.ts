/**
 * Kommunikationsunderlagets utskriftsvy — REN HTML-renderare, ingen I/O.
 *
 * Samma leveransväg som offert-/faktura-PDF:erna: HTML:en skrivs ut till PDF
 * via lib/pdf/render-html-to-pdf.ts (headless Chromium). Print-baren strippas
 * där automatiskt; i HTML-fallbacken (Chromium saknas, t.ex. lokal dev utan
 * CHROME_EXECUTABLE_PATH) fungerar samma sida som utskriftsvänlig flik.
 *
 * Allt användarinnehåll HTML-escapas — meddelandekroppar är rå kundtext och
 * får aldrig kunna bli markup i ett dokument som ska hålla i en tvist.
 */

import {
  TRAIL_CHANNEL_LABELS,
  TRAIL_SOURCE_LABELS,
  groupEntriesByDay,
  stockholmDay,
  stockholmTime,
  type TrailEntry,
} from './communication-trail'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sourceLabel(source: string): string {
  return TRAIL_SOURCE_LABELS[source] || source
}

function directionLabel(direction: TrailEntry['direction']): string {
  if (direction === 'in') return '← från kund'
  if (direction === 'out') return '→ till kund'
  return ''
}

function veckodag(day: string): string {
  // day är redan svensk kalenderdag (YYYY-MM-DD) — T12:00Z undviker att
  // dygnsskarven flyttar veckodagen.
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('sv-SE', {
    weekday: 'long',
    timeZone: 'Europe/Stockholm',
  })
}

export interface TrailHtmlInput {
  businessName: string
  customerName: string
  generatedAtIso: string
  fromIso?: string
  toIso?: string
  entries: TrailEntry[]
  sourcesWithErrors: string[]
  truncatedSources: string[]
}

export function renderTrailHtml(input: TrailHtmlInput): string {
  const period = input.fromIso || input.toIso
    ? `${input.fromIso ? stockholmDay(input.fromIso) : 'början'} – ${input.toIso ? stockholmDay(input.toIso) : 'idag'}`
    : 'Hela historiken'

  const days = groupEntriesByDay(input.entries)

  const dayBlocks = days.map(group => {
    const rows = group.entries.map(e => {
      const riktning = directionLabel(e.direction)
      return `
        <div class="entry">
          <div class="entry-head">
            <span class="time">${escapeHtml(stockholmTime(e.timestamp))}</span>
            <span class="channel channel-${e.channel}">${escapeHtml(TRAIL_CHANNEL_LABELS[e.channel])}</span>
            ${riktning ? `<span class="direction">${escapeHtml(riktning)}</span>` : ''}
            <span class="title">${escapeHtml(e.title)}</span>
          </div>
          ${e.body ? `<div class="body">${escapeHtml(e.body)}</div>` : ''}
        </div>`
    }).join('')
    return `
      <section class="day">
        <h2>${escapeHtml(group.day)} <span class="weekday">${escapeHtml(veckodag(group.day))}</span></h2>
        ${rows}
      </section>`
  }).join('')

  const varningar: string[] = []
  if (input.sourcesWithErrors.length > 0) {
    varningar.push(`Underlaget är ofullständigt: följande källor kunde inte hämtas — ${input.sourcesWithErrors.map(sourceLabel).join(', ')}.`)
  }
  if (input.truncatedSources.length > 0) {
    varningar.push(`Följande källor är avkortade (de äldsta posterna utelämnade): ${input.truncatedSources.map(sourceLabel).join(', ')}.`)
  }

  const genererad = `${stockholmDay(input.generatedAtIso)} ${stockholmTime(input.generatedAtIso)}`

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Kommunikationsunderlag — ${escapeHtml(input.customerName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', -apple-system, Arial, sans-serif; color: #1f2937; font-size: 11px; line-height: 1.5; background: #fff; }
  .page { max-width: 210mm; margin: 0 auto; padding: 16mm 14mm; }
  header { border-bottom: 3px solid #0F766E; padding-bottom: 12px; margin-bottom: 16px; }
  header h1 { font-size: 20px; color: #0F766E; margin-bottom: 6px; }
  .meta-grid { display: flex; flex-wrap: wrap; gap: 4px 32px; color: #4b5563; }
  .meta-grid strong { color: #1f2937; }
  .warning { background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; color: #92400E; }
  .day { margin-bottom: 14px; page-break-inside: avoid; }
  .day h2 { font-size: 13px; color: #0F766E; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 6px; }
  .day h2 .weekday { font-weight: normal; color: #6b7280; font-size: 11px; }
  .entry { margin-bottom: 8px; page-break-inside: avoid; }
  .entry-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
  .time { font-variant-numeric: tabular-nums; color: #6b7280; min-width: 34px; }
  .channel { display: inline-block; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; background: #F0FDFA; color: #0F766E; border: 1px solid #99F6E4; border-radius: 4px; padding: 0 5px; }
  .direction { color: #6b7280; font-size: 10px; }
  .title { font-weight: 600; }
  .body { margin: 2px 0 0 42px; white-space: pre-wrap; word-break: break-word; color: #374151; background: #F9FAFB; border-left: 2px solid #e5e7eb; padding: 4px 8px; border-radius: 0 4px 4px 0; }
  .empty { color: #6b7280; font-style: italic; padding: 16px 0; }
  footer { margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px; color: #6b7280; font-size: 9px; }
  .print-bar { position: sticky; top: 0; background: #0F766E; color: #fff; padding: 10px 14px; display: flex; gap: 10px; justify-content: flex-end; }
  .print-bar button { background: #fff; color: #0F766E; border: none; border-radius: 6px; padding: 6px 14px; font-weight: 600; cursor: pointer; }
  @media print { .print-bar { display: none; } }
</style>
</head>
<body>
<div class="print-bar">
  <button onclick="window.print()">Skriv ut</button>
  <button onclick="window.close()">Stäng</button>
</div>
<div class="page">
  <header>
    <h1>Kommunikationsunderlag</h1>
    <div class="meta-grid">
      <span><strong>Företag:</strong> ${escapeHtml(input.businessName)}</span>
      <span><strong>Kund:</strong> ${escapeHtml(input.customerName)}</span>
      <span><strong>Period:</strong> ${escapeHtml(period)}</span>
      <span><strong>Genererat:</strong> ${escapeHtml(genererad)}</span>
    </div>
  </header>
  ${varningar.map(v => `<div class="warning">${escapeHtml(v)}</div>`).join('')}
  ${dayBlocks || '<p class="empty">Ingen kommunikation registrerad för perioden.</p>'}
  <footer>
    Kronologiskt underlag över registrerad kommunikation mellan ${escapeHtml(input.businessName)} och ${escapeHtml(input.customerName)}.
    Tider anges i svensk tid. Underlaget är en automatisk sammanställning av sparade meddelanden och händelser — ingen text har genererats eller ändrats.
  </footer>
</div>
</body>
</html>`
}
