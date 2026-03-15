import { Building2, Briefcase, Phone, Link2, Users, Zap, CheckCircle2, Settings, Smartphone } from 'lucide-react'

// ─── Steps (V2 — bantad till 4 steg) ────────────────────────────────

export const STEPS = [
  { id: 1, label: 'Företag', icon: Building2 },
  { id: 2, label: 'Tjänster', icon: Briefcase },
  { id: 3, label: 'Telefon', icon: Phone },
  { id: 4, label: 'Klart!', icon: CheckCircle2 },
]

// ─── Branches ───────────────────────────────────────────────────────

export const BRANCHES = [
  { value: 'construction', label: 'Bygg', icon: '🏗️' },
  { value: 'electrician', label: 'El', icon: '⚡' },
  { value: 'plumber', label: 'VVS', icon: '🔧' },
  { value: 'painter', label: 'Måleri', icon: '🎨' },
  { value: 'roofing', label: 'Tak', icon: '🏠' },
  { value: 'flooring', label: 'Golvläggning', icon: '🪵' },
  { value: 'carpenter', label: 'Snickeri', icon: '🪚' },
  { value: 'gardening', label: 'Trädgård', icon: '🌿' },
  { value: 'cleaning', label: 'Städ', icon: '🧹' },
  { value: 'moving', label: 'Flytt', icon: '📦' },
  { value: 'hvac', label: 'Ventilation', icon: '🌡️' },
  { value: 'locksmith', label: 'Låssmed', icon: '🔐' },
  { value: 'other', label: 'Övrigt', icon: '🛠️' },
]

export const BRANCH_SERVICES: Record<string, string[]> = {
  construction: ['Nybyggnation', 'Tillbyggnad', 'Renovering', 'Badrum', 'Kök', 'Fasad', 'Grund', 'Betong'],
  electrician: ['Installation', 'Felsökning', 'Elcentral', 'Belysning', 'Elbilsladdare', 'Jordfelsbrytare', 'Solceller', 'Larm'],
  plumber: ['Vattenledning', 'Avlopp', 'Värmepump', 'Golvvärme', 'Badrumsrenovering', 'Köksrenovering', 'Varmvattenberedare'],
  painter: ['Invändig målning', 'Utvändig målning', 'Tapetsering', 'Fasad', 'Spackling', 'Lackering'],
  roofing: ['Takbyte', 'Takläggning', 'Plåttak', 'Tegelpannor', 'Takfönster', 'Takavvattning'],
  flooring: ['Parkettläggning', 'Laminat', 'Kakel & klinker', 'Vinyl/Plastgolv', 'Golvslipning'],
  carpenter: ['Nybyggnation', 'Tillbyggnad', 'Altan/Trädäck', 'Kök', 'Inredning', 'Möbelsnickeri'],
  gardening: ['Trädgårdsskötsel', 'Häckklippning', 'Gräsklippning', 'Trädfällning', 'Stenläggning', 'Plantering'],
  cleaning: ['Hemstädning', 'Kontorsstädning', 'Flyttstädning', 'Storstädning', 'Fönsterputs', 'Trappstädning'],
  moving: ['Flyttjänst', 'Packning', 'Magasinering', 'Kontorsflytt', 'Pianoflytt'],
  hvac: ['Ventilation', 'Värmepump', 'Golvvärme', 'AC-installation', 'Filterbyte', 'Injustering'],
  locksmith: ['Låsbyte', 'Låsöppning', 'Nyckelkopiering', 'Kodlås', 'Säkerhetsdörr', 'Inbrottsskydd'],
  other: ['Konsultation', 'Reparation', 'Installation', 'Service', 'Underhåll'],
}

export const BRANCH_HOURLY_RATE: Record<string, number> = {
  construction: 500, electrician: 550, plumber: 550, painter: 450, roofing: 500,
  flooring: 500, carpenter: 500, gardening: 400, cleaning: 350, moving: 450,
  hvac: 550, locksmith: 600, other: 450,
}

export const ROT_BRANCHES = ['construction', 'electrician', 'plumber', 'painter', 'roofing', 'flooring', 'carpenter', 'hvac', 'locksmith']
export const RUT_BRANCHES = ['cleaning', 'gardening', 'moving']

// ─── Days & Time ────────────────────────────────────────────────────

export const DAYS = [
  { key: 'monday', label: 'Måndag', short: 'Mån' },
  { key: 'tuesday', label: 'Tisdag', short: 'Tis' },
  { key: 'wednesday', label: 'Onsdag', short: 'Ons' },
  { key: 'thursday', label: 'Torsdag', short: 'Tor' },
  { key: 'friday', label: 'Fredag', short: 'Fre' },
  { key: 'saturday', label: 'Lördag', short: 'Lör' },
  { key: 'sunday', label: 'Söndag', short: 'Sön' },
]

export const TIME_OPTIONS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00',
]

export const DEFAULT_WORKING_HOURS: Record<string, { active: boolean; start: string; end: string }> = {
  monday: { active: true, start: '08:00', end: '17:00' },
  tuesday: { active: true, start: '08:00', end: '17:00' },
  wednesday: { active: true, start: '08:00', end: '17:00' },
  thursday: { active: true, start: '08:00', end: '17:00' },
  friday: { active: true, start: '08:00', end: '17:00' },
  saturday: { active: false, start: '09:00', end: '14:00' },
  sunday: { active: false, start: '10:00', end: '14:00' },
}

// ─── Lead Platforms ─────────────────────────────────────────────────

export const LEAD_PLATFORMS = [
  { id: 'offerta', label: 'Offerta', url: 'offerta.se' },
  { id: 'servicefinder', label: 'ServiceFinder', url: 'servicefinder.se' },
  { id: 'byggahus', label: 'Byggahus.se', url: 'byggahus.se' },
  { id: 'website', label: 'Min hemsida', url: '' },
  { id: 'phone_wom', label: 'Telefon/mun-till-mun', url: '' },
  { id: 'other', label: 'Annat', url: '' },
]

// ─── Forwarding Instructions ────────────────────────────────────────

export const FORWARDING_INSTRUCTIONS: Record<string, { name: string; activate: string; deactivate: string }> = {
  telia: { name: 'Telia', activate: '**21*{nummer}#', deactivate: '##21#' },
  tele2: { name: 'Tele2', activate: '**21*{nummer}#', deactivate: '##21#' },
  tre: { name: 'Tre/3', activate: '**21*{nummer}#', deactivate: '##21#' },
  telenor: { name: 'Telenor', activate: '**21*{nummer}#', deactivate: '##21#' },
}

// ─── Call Modes ─────────────────────────────────────────────────────

export const CALL_MODES = [
  { value: 'human_first', label: 'Ring dig först, sedan AI', description: 'Handymate ringer dig. Om du inte svarar tar AI-assistenten över.' },
  { value: 'ai_always', label: 'AI svarar alltid', description: 'AI-assistenten hanterar alla samtal och bokar åt dig.' },
  { value: 'ai_after_hours', label: 'AI utanför öppettider', description: 'Du svarar under öppettider, AI tar över utanför.' },
]
