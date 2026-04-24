/**
 * TEAM-konstant — delad mellan agent-dashboarden och chat-modalen.
 * Varje agent har: id, namn, roll, initialer, färgklass, avatar, greeting, description.
 */

export interface TeamAgent {
  id: string
  name: string
  role: string
  initials: string
  color: string
  avatar?: string
  greeting: string
  description?: string
  training?: boolean
}

const AVATAR_BASE_SIGNED = 'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/sign/team-avatars'
const AVATAR_BASE_PUBLIC = 'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/public/team-avatars'
const AVATAR_BASE = AVATAR_BASE_SIGNED

export const TEAM: TeamAgent[] = [
  { id: 'matte',  name: 'Matte',  role: 'Chefsassistent',           initials: 'M',  color: 'bg-primary-700',  avatar: `${AVATAR_BASE}/Matte.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvTWF0dGUucG5nIiwiaWF0IjoxNzczODU1NTkyLCJleHAiOjI2Mzc4NTU1OTJ9.jNhKpwuz1VvDTszvZ7fbczsopGCNM5c0eQHR5qq-0Ak`, greeting: 'Hej! Här är läget för idag ☀️', description: 'Koordinerar teamet och pratar med dig' },
  { id: 'karin',  name: 'Karin',  role: 'Ekonom',                   initials: 'K',  color: 'bg-blue-600',     avatar: `${AVATAR_BASE}/Karin.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvS2FyaW4ucG5nIiwiaWF0IjoxNzczODU1NjE4LCJleHAiOjI2Mzc4NTU2MTh9.bmvCwfi8Rry-5dGsJ1Zyyco--CYT6ZG3gXBPqHRiVdA`, greeting: 'Jag har koll på ekonomin — kollar fakturorna', description: 'Håller koll på fakturor och betalningar' },
  { id: 'hanna',  name: 'Hanna',  role: 'Marknadschef',             initials: 'H',  color: 'bg-purple-600',   avatar: `${AVATAR_BASE_PUBLIC}/Hanna.png`, greeting: 'Dags att nå fler kunder!', description: 'Sköter kampanjer och nya kunder' },
  { id: 'daniel', name: 'Daniel', role: 'Säljare',                  initials: 'D',  color: 'bg-amber-600',    avatar: `${AVATAR_BASE}/Daniel.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvRGFuaWVsLnBuZyIsImlhdCI6MTc3Mzg1NTY0MiwiZXhwIjoyNjM3ODU1NjQyfQ.3NE6iIAL4gje-j0warr4k6PUFqRuf7EocaDo86LZNWE`, greeting: 'Jag följer upp offerten idag', description: 'Följer upp offerter och leads' },
  { id: 'lars',   name: 'Lars',   role: 'Projektledare',            initials: 'L',  color: 'bg-emerald-600',  avatar: `${AVATAR_BASE}/Lars.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvTGFycy5wbmciLCJpYXQiOjE3NzM4NTU2NTUsImV4cCI6MjYzNzg1NTY1NX0.mICMOQvJxG49RDXZXsc_BfKFM-AnNOscyNTL8IxPdqY`, greeting: 'Alla projekt löper på — inga förseningar', description: 'Koordinerar projekt och bokningar' },
  { id: 'lisa',   name: 'Lisa',   role: 'Kundservice & Telefonist', initials: 'Li', color: 'bg-sky-500',      avatar: `${AVATAR_BASE}/Lisa.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV83N2VjM2Y2OS03NThjLTQ4NDQtYTRkMi01OTUxMjE0YzlmYWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0ZWFtLWF2YXRhcnMvTGlzYS5wbmciLCJpYXQiOjE3NzQyNTk4MTYsImV4cCI6MTA0MTQyNTk4MTZ9.ZQag6FV2my_vy7rq1tFPBYK2MuwlmhFeDtU16SLA3Ak`, greeting: 'Hej! Hur kan jag hjälpa dig idag?', description: 'Svarar i telefon och hanterar kundförfrågningar', training: true },
]

export function getAgentById(id: string | null | undefined): TeamAgent | null {
  if (!id) return null
  return TEAM.find(a => a.id === id.toLowerCase()) || null
}
