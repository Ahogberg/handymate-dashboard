export const CUSTOMER_INTAKE_CHANNELS = [
  { id: 'phone', label: 'Telefon' }, { id: 'sms', label: 'SMS' }, { id: 'email', label: 'E-post' },
  { id: 'website', label: 'Hemsida eller formulär' }, { id: 'other', label: 'Annat / vet inte' },
] as const
export type CustomerIntakeChannel = typeof CUSTOMER_INTAKE_CHANNELS[number]['id']
export type CustomerMailProvider = 'gmail' | 'microsoft' | 'other'
export function intakeNextStep(channel: CustomerIntakeChannel | undefined): string {
  if (channel === 'phone') return 'Börja med numret och samtalsprovet nedan. SMS och mottagna samtal kontrolleras var för sig.'
  if (channel === 'sms') return 'Samtalsvidarekoppling flyttar inte SMS. Skicka ett separat prov-SMS till Handymate-numret och kontrollera mottagning och kundärende.'
  if (channel === 'email') return 'Börja med en mottagaradress och ett provmejl. Vidarebefordran ger inte åtkomst till gamla mejl eller rätt att skicka som din adress.'
  if (channel === 'website') return 'Koppla ditt befintliga formulär via e-post eller konfigurera webbwidgeten i Inställningar efter onboardingen. Ett inskickat prov ska nå rätt kundärende.'
  return 'Du kan välja senare. Ange hur själva förfrågan kommer fram, även om kunden hittade dig genom en rekommendation eller sociala medier.'
}

/** Older sessions have only a primary channel. An explicit empty list means opt-out. */
export function selectedIntakeChannels(data: { customerIntakeChannels?: unknown; primaryLeadChannel?: unknown }): CustomerIntakeChannel[] {
  const raw = Array.isArray(data.customerIntakeChannels) ? data.customerIntakeChannels : [data.primaryLeadChannel]
  return Array.from(new Set(raw.filter((id): id is CustomerIntakeChannel => CUSTOMER_INTAKE_CHANNELS.some(c => c.id === id))))
}

export function toggleIntakeChannel(data: { customerIntakeChannels?: unknown; primaryLeadChannel?: CustomerIntakeChannel }, channel: CustomerIntakeChannel) {
  const current = selectedIntakeChannels(data)
  const customerIntakeChannels = current.includes(channel) ? current.filter(c => c !== channel) : [...current, channel]
  return { customerIntakeChannels, primaryLeadChannel: customerIntakeChannels.includes(data.primaryLeadChannel!) ? data.primaryLeadChannel : customerIntakeChannels[0] }
}

/** All selected paths must have evidence; SMS/other remain open until supported. */
export function allSelectedIntakeVerified(selected: CustomerIntakeChannel[], evidence: ReadonlyArray<{ channel: string; state: string }>): boolean {
  return selected.length > 0 && selected.every(id => evidence.some(c => c.channel === (id === 'website' ? 'web' : id) && c.state === 'lead_verified'))
}
