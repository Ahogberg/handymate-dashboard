/**
 * Förvalda arbetsuppgifter — generella nog att passa de flesta hantverksbranscher
 * (el, VVS, bygg, måleri, mark, tak m.m.).
 *
 * Används i deal- och projekt-vyerna för att snabbt kunna kryssa i flera
 * uppgifter på en gång istället för att skriva varje rad för hand.
 */

export type TaskPresetCategory = 'preparation' | 'sales' | 'execution' | 'completion'

export interface TaskPreset {
  /** Unik nyckel — används bara internt för React keys */
  key: string
  /** Titeln som hamnar på den skapade uppgiften */
  title: string
  /** Vilken fas i jobbet uppgiften hör till */
  category: TaskPresetCategory
  /** Föreslagen prioritet — kan ändras innan skapande */
  priority?: 'low' | 'medium' | 'high'
}

export const TASK_PRESET_CATEGORIES: { key: TaskPresetCategory; label: string }[] = [
  { key: 'preparation', label: 'Förberedelse' },
  { key: 'sales', label: 'Sälj & offert' },
  { key: 'execution', label: 'Genomförande' },
  { key: 'completion', label: 'Avslut' },
]

export const TASK_PRESETS: TaskPreset[] = [
  // ── Förberedelse ─────────────────────────────────────────
  { key: 'confirm_details', title: 'Bekräfta detaljer med kund', category: 'preparation' },
  { key: 'book_site_visit', title: 'Boka platsbesök', category: 'preparation' },
  { key: 'site_visit', title: 'Genomför platsbesök', category: 'preparation' },
  { key: 'measure_inspect', title: 'Mät upp och inspektera', category: 'preparation' },
  { key: 'check_permits', title: 'Kontrollera bygglov / tillstånd', category: 'preparation' },

  // ── Sälj & offert ────────────────────────────────────────
  { key: 'create_quote', title: 'Skapa offert', category: 'sales' },
  { key: 'send_quote', title: 'Skicka offert till kund', category: 'sales' },
  { key: 'follow_up_quote', title: 'Följ upp offert', category: 'sales' },
  { key: 'sign_contract', title: 'Skriv avtal med kund', category: 'sales' },

  // ── Genomförande ─────────────────────────────────────────
  { key: 'order_materials', title: 'Beställ material', category: 'execution' },
  { key: 'schedule_work', title: 'Schemalägg arbete', category: 'execution' },
  { key: 'assign_team', title: 'Tilldela teammedlem(mar)', category: 'execution' },
  { key: 'remind_customer', title: 'Påminn kund inför arbete', category: 'execution' },
  { key: 'start_work', title: 'Påbörja arbete', category: 'execution', priority: 'high' },
  { key: 'take_before_photos', title: 'Ta före-bilder', category: 'execution' },
  { key: 'progress_update', title: 'Skicka uppdatering till kund', category: 'execution' },
  { key: 'safety_check', title: 'Skyddsrond / arbetsmiljökontroll', category: 'execution' },

  // ── Avslut ───────────────────────────────────────────────
  { key: 'take_after_photos', title: 'Ta efter-bilder', category: 'completion' },
  { key: 'final_inspection', title: 'Slutbesiktning med kund', category: 'completion' },
  { key: 'job_report', title: 'Skicka jobbrapport', category: 'completion' },
  { key: 'send_invoice', title: 'Skicka faktura', category: 'completion', priority: 'high' },
  { key: 'request_review', title: 'Be kund om recension', category: 'completion' },
  { key: 'warranty_followup', title: 'Schemalägg garantiuppföljning', category: 'completion', priority: 'low' },
]
