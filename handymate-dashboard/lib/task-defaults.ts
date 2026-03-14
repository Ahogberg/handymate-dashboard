/**
 * Förinställda arbetsuppgifter (delmoment) för hantverksprojekt.
 * Visas som klickbara chips i MilestoneModal.
 */

export interface DefaultTask {
  name: string
  category: string
}

export const TASK_CATEGORIES: Record<string, string> = {
  förberedelse: 'Förberedelse',
  rivning: 'Rivning',
  installation: 'Installation',
  yttre: 'Yttre arbeten',
  avslut: 'Avslut',
}

export const DEFAULT_TASKS: DefaultTask[] = [
  // Förberedelse
  { name: 'Besiktning och inmätning', category: 'förberedelse' },
  { name: 'Materialbeställning', category: 'förberedelse' },
  { name: 'Ritningar och planering', category: 'förberedelse' },

  // Rivning
  { name: 'Rivning och bortforsling', category: 'rivning' },
  { name: 'Asbestsanering', category: 'rivning' },

  // Installation
  { name: 'Elinstallation', category: 'installation' },
  { name: 'VVS-installation', category: 'installation' },
  { name: 'Golvläggning', category: 'installation' },
  { name: 'Plattsättning', category: 'installation' },
  { name: 'Målning och tapetsering', category: 'installation' },
  { name: 'Tätskikt och membran', category: 'installation' },
  { name: 'Isolering', category: 'installation' },
  { name: 'Ventilation', category: 'installation' },

  // Yttre arbeten
  { name: 'Takarbeten', category: 'yttre' },
  { name: 'Fasadarbeten', category: 'yttre' },
  { name: 'Markarbeten', category: 'yttre' },
  { name: 'Fönster och dörrar', category: 'yttre' },

  // Avslut
  { name: 'Slutbesiktning', category: 'avslut' },
  { name: 'Städning efter arbete', category: 'avslut' },
  { name: 'Dokumentationsfoto', category: 'avslut' },
]
