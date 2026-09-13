export const CUSTOMER_INTAKE_CHANNELS = [
  { id: 'phone', label: 'Telefon' }, { id: 'email', label: 'E-post' },
  { id: 'website', label: 'Hemsida eller formulär' }, { id: 'other', label: 'Annat / vet inte' },
] as const
export type CustomerIntakeChannel = typeof CUSTOMER_INTAKE_CHANNELS[number]['id']
export type CustomerMailProvider = 'gmail' | 'microsoft' | 'other'
export function intakeNextStep(channel: CustomerIntakeChannel | undefined): string {
  if (channel === 'phone') return 'Börja med numret och samtalsprovet nedan. SMS och mottagna samtal kontrolleras var för sig.'
  if (channel === 'email') return 'Börja med en mottagaradress och ett provmejl. Vidarebefordran ger inte åtkomst till gamla mejl eller rätt att skicka som din adress.'
  if (channel === 'website') return 'Koppla ditt befintliga formulär via e-post eller konfigurera webbwidgeten i Inställningar efter onboardingen. Ett inskickat prov ska nå rätt kundärende.'
  return 'Du kan välja senare. Ange hur själva förfrågan kommer fram, även om kunden hittade dig genom en rekommendation eller sociala medier.'
}
