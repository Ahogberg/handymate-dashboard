export type ExportAccount = {
  id: string; company_name: string; org_number: string | null; website: string | null
  industry: string | null; city: string | null; owner_email: string | null
  status: string; contact_state: string; total_score: number; source: string
  next_action: string | null; next_action_at: string | null; updated_at: string
}
export const CRM_COLUMNS: (keyof ExportAccount)[] = ['id', 'company_name', 'org_number', 'website', 'industry', 'city', 'owner_email', 'status', 'contact_state', 'total_score', 'source', 'next_action', 'next_action_at', 'updated_at']
/** Stable account ID is the external CRM's upsert key. Neutralize spreadsheet formulas. */
export function crmExport(rows: ExportAccount[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? '')
    const safe = /^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }
  return '\uFEFF' + [CRM_COLUMNS.join(','), ...rows.map(row => CRM_COLUMNS.map(key => cell(row[key])).join(','))].join('\r\n')
}
