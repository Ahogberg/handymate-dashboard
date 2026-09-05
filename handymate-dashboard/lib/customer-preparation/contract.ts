export const TEMPLATES = {
  charging: {
    label: 'Underlag för laddbox',
    intro: 'Beskriv platsen inför offert eller besök. Öppna inga kåpor eller elcentraler. Bilder ersätter inte installatörens bedömning.',
    questions: [
      { id: 'location', label: 'Var vill du placera laddboxen?', required: true },
      { id: 'route', label: 'Beskriv sträckan från elcentralen till platsen. Skriv gärna om något är okänt.', required: true },
      { id: 'wishes', label: 'Vilken bil och vilka önskemål har du?', required: false },
    ],
    photos: 'Du kan bifoga bilder på platsen, kabelsträckan och elcentralens utsida. Öppna ingenting.',
  },
  start: {
    label: 'Förberedelser inför jobbstart',
    intro: 'Dina svar hjälper företaget att förbereda arbetet. Företaget granskar svaren och bekräftar eventuella ändringar separat.',
    questions: [
      { id: 'access', label: 'Hur får vi tillträde? Ange kontaktperson, men skriv inga larm- eller nyckelkoder.', required: true },
      { id: 'choices', label: 'Vilka material, kulörer eller produkter har du valt? Skriv vad som återstår att välja.', required: true },
      { id: 'ready', label: 'Är arbetsplatsen tillgänglig och förberedd? Beskriv vad som återstår eller behöver stämmas av.', required: true },
    ],
    photos: 'Bifoga gärna bilder som förtydligar dina val eller arbetsplatsen.',
  },
} as const
export type TemplateKey = keyof typeof TEMPLATES
export type Answers = Record<string, string>
export type PreparationStatus = 'open' | 'submitted' | 'reviewed' | 'cancelled'
export const STATUS_LABELS: Record<PreparationStatus, string> = {
  open: 'Väntar på svar', submitted: 'Svar att granska', reviewed: 'Granskat', cancelled: 'Återkallad',
}
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export function isTemplate(value: unknown): value is TemplateKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TEMPLATES, value)
}
export function validateAnswers(template: TemplateKey, raw: unknown): Answers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Kontrollera dina svar.')
  const value = raw as Record<string, unknown>
  if (Object.keys(value).some(key => !TEMPLATES[template].questions.some(q => q.id === key))) throw new Error('Okänd fråga.')
  const answers: Answers = {}
  for (const question of TEMPLATES[template].questions) {
    const answer = value[question.id] ?? ''
    if (typeof answer !== 'string' || answer.length > 1500) throw new Error('Varje svar får vara högst 1 500 tecken.')
    if (question.required && !answer.trim()) throw new Error(`Besvara: ${question.label}`)
    answers[question.id] = answer.trim()
  }
  return answers
}
export function imageExtension(bytes: Uint8Array, type: string): string | null {
  if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg'
  if (type === 'image/png' && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return 'png'
  if (type === 'image/webp' && String.fromCharCode(...Array.from(bytes.slice(0,4))) === 'RIFF' && String.fromCharCode(...Array.from(bytes.slice(8,12))) === 'WEBP') return 'webp'
  return null
}
export function isExpired(expires: string, now = Date.now()): boolean {
  const date = Date.parse(expires)
  return !Number.isFinite(date) || date <= now
}
export interface Preparation {
  id: string
  template: TemplateKey
  context: string
  due_date: string | null
  status: PreparationStatus
  answers: Answers
  images: string[]
  image_urls?: string[]
  created_at: string
  submitted_at: string | null
  expires_at: string
  token?: string
}
