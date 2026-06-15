/**
 * Kund-import — delad kärnlogik.
 *
 * Extraherad ur app/dashboard/customers/import/page.tsx (verbatim beteende) så
 * både dashboard-importen och den konversationella onboardingens fas D kan
 * dela samma parse/validering/dedup/insert. Rena funktioner + en
 * supabase-driven import (klient- eller server-side, samma auth-kontext).
 *
 * (Dashboard-sidan refaktoreras att använda denna i en separat, försiktig
 * commit — denna lib introducerar inget beteende-skifte i sig.)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ColumnMapping {
  name: number | null
  phone_number: number | null
  email: number | null
  address: number | null
}

export interface ParsedRow {
  name: string
  phone_number: string
  email: string
  address: string
  isDuplicate?: boolean
}

export interface ImportResult {
  success: number
  failed: number
  errors: string[]
  importedIds: string[]
}

/** CSV-parse med auto-detekterad avgränsare (komma/semikolon/tab) + citat-stöd. */
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  const firstLine = lines[0]
  let delimiter = ','
  if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';'
  if (firstLine.includes('\t') && !firstLine.includes(',') && !firstLine.includes(';')) delimiter = '\t'

  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') inQuotes = !inQuotes
      else if (char === delimiter && !inQuotes) { result.push(current.trim()); current = '' }
      else current += char
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  const rows = lines.slice(1).map(parseRow).filter(row => row.some(cell => cell))
  return { headers, rows }
}

/** Auto-mappa kolumn-index från svenska/engelska rubriker. */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { name: null, phone_number: null, email: null, address: null }
  headers.forEach((header, index) => {
    const h = header.toLowerCase()
    if (h.includes('namn') || h.includes('name') || h.includes('kund')) mapping.name = index
    if (h.includes('telefon') || h.includes('phone') || h.includes('mobil') || h.includes('tel')) mapping.phone_number = index
    if (h.includes('mail') || h.includes('e-post') || h.includes('epost')) mapping.email = index
    if (h.includes('adress') || h.includes('address') || h.includes('gata') || h.includes('street')) mapping.address = index
  })
  return mapping
}

/** Normalisera svenskt telefonnummer → +46-format. */
export function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('0')) cleaned = '+46' + cleaned.slice(1)
  if (!cleaned.startsWith('+')) cleaned = '+46' + cleaned
  return cleaned
}

export function validatePhoneNumber(phone: string): boolean {
  return /^\+46\d{7,10}$/.test(formatPhoneNumber(phone))
}

/** Mappa råa rader → ParsedRow[], normalisera telefon, filtrera ogiltiga. */
export function prepareRows(rows: string[][], mapping: ColumnMapping): ParsedRow[] {
  if (mapping.phone_number === null) return []
  return rows
    .map(row => ({
      name: mapping.name !== null ? row[mapping.name] || '' : '',
      phone_number: formatPhoneNumber(row[mapping.phone_number!] || ''),
      email: mapping.email !== null ? row[mapping.email] || '' : '',
      address: mapping.address !== null ? row[mapping.address] || '' : '',
    }))
    .filter(row => row.phone_number && validatePhoneNumber(row.phone_number))
}

/** Markera vilka rader som redan finns (dedup på phone_number per business). */
export async function flagDuplicates(
  supabase: SupabaseClient,
  businessId: string,
  rows: ParsedRow[],
): Promise<{ rows: ParsedRow[]; duplicateCount: number }> {
  if (rows.length === 0) return { rows, duplicateCount: 0 }
  const phones = rows.map(r => r.phone_number)
  const { data: existing } = await supabase
    .from('customer')
    .select('phone_number')
    .eq('business_id', businessId)
    .in('phone_number', phones)
  const existingPhones = new Set((existing || []).map((c: { phone_number: string }) => c.phone_number))
  const withDup = rows.map(r => ({ ...r, isDuplicate: existingPhones.has(r.phone_number) }))
  return { rows: withDup, duplicateCount: withDup.filter(r => r.isDuplicate).length }
}

/**
 * Importera kunder: uppdaterar befintlig (matchad på phone_number) eller
 * skapar ny. Verbatim beteende från dashboard-importen.
 */
export async function importCustomers(
  supabase: SupabaseClient,
  businessId: string,
  rows: ParsedRow[],
  opts: { skipDuplicates?: boolean } = {},
): Promise<ImportResult> {
  const result: ImportResult = { success: 0, failed: 0, errors: [], importedIds: [] }
  const toImport = opts.skipDuplicates ? rows.filter(r => !r.isDuplicate) : rows

  for (const row of toImport) {
    try {
      const { data: existing } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('business_id', businessId)
        .eq('phone_number', row.phone_number)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('customer')
          .update({
            name: row.name || undefined,
            email: row.email || undefined,
            address_line: row.address || undefined,
          })
          .eq('customer_id', existing.customer_id)
        result.importedIds.push(existing.customer_id)
        result.success++
      } else {
        const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)
        const { error } = await supabase.from('customer').insert({
          customer_id: customerId,
          business_id: businessId,
          name: row.name || 'Okänd',
          phone_number: row.phone_number,
          email: row.email || null,
          address_line: row.address || null,
          created_at: new Date().toISOString(),
        })
        if (error) {
          result.failed++
          result.errors.push(`${row.name || row.phone_number}: ${error.message}`)
        } else {
          result.importedIds.push(customerId)
          result.success++
        }
      }
    } catch (err: any) {
      result.failed++
      result.errors.push(`${row.name || row.phone_number}: ${err.message}`)
    }
  }
  return result
}
