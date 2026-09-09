import { IntakeError, intakeInput, type IntakeInput } from './durable-intake'

/** Keep every submitted field in the immutable receipt, before any entity writes. */
export function portalIntakeInput(body: unknown, sourceId: string): IntakeInput {
  const base = intakeInput(body, sourceId)
  const b = body as Record<string, unknown>
  const text = (key: string, max: number): string | null => {
    const value = b[key]
    if (value == null || value === '') return null
    if (typeof value !== 'string' || value.length > max) throw new IntakeError('Kontrollera uppdragsinformationen.', 400)
    return value.trim() || null
  }
  const service = text('service', 200), description = text('description', 8000)
  const address = text('address', 1000), date = text('desired_date', 100)
  const category = text('category', 100)
  const rawValue = b.estimated_value
  const value = rawValue == null || rawValue === '' ? null : Number(rawValue)
  if (value !== null && (typeof rawValue !== 'number' && typeof rawValue !== 'string' || !Number.isInteger(value) || value < 0 || value > 2147483647)) {
    throw new IntakeError('Ange ett giltigt uppskattat värde i hela kronor.', 400)
  }
  const result = { ...base, message: [service && `Tjänst: ${service}`, description,
    date && `Önskat datum: ${date}`, address && `Adress: ${address}`].filter(Boolean).join('\n') || null,
    category, estimated_value: value, address_line: address }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 19000) throw new IntakeError('Uppdragsinformationen är för lång. Förkorta beskrivningen.', 400)
  return result
}
