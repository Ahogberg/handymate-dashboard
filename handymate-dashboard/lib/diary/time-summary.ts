import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Registrerad tid per datum för ett projekt (Etapp D3, 2026-09-02).
 *
 * Dagbokens `hours_worked` är hantverkarens EGEN uppskattning skriven i
 * fält — den registrerade tiden i `time_entry` (start/stopp eller manuellt
 * loggad) är en annan sanning. DiaryEntryCard visar båda sida vid sida i
 * stället för att låtsas att de alltid stämmer överens.
 *
 * `time_entry`: business_id, work_date, duration_minutes (sql/new_tables.sql)
 * + project_id (ALTER i sql/projects.sql).
 */
export async function sumTimeEntryHoursByDate(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
  dates: string[],
): Promise<Record<string, number>> {
  const uniqueDates = Array.from(new Set(dates.filter(Boolean)))
  if (uniqueDates.length === 0) return {}

  const { data, error } = await supabase
    .from('time_entry')
    .select('work_date, duration_minutes')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .in('work_date', uniqueDates)

  if (error || !Array.isArray(data)) return {}

  const totals: Record<string, number> = {}
  for (const row of data as Array<{ work_date: string; duration_minutes: number | null }>) {
    const minutes = typeof row.duration_minutes === 'number' ? row.duration_minutes : 0
    totals[row.work_date] = (totals[row.work_date] ?? 0) + minutes
  }

  const hours: Record<string, number> = {}
  for (const [date, minutes] of Object.entries(totals)) {
    hours[date] = Math.round((minutes / 60) * 100) / 100
  }
  return hours
}
