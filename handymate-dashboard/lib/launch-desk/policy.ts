import type {
  GtmAccount,
  GtmActivityChannel,
  GtmChannel,
  GtmContactBasis,
  GtmLegalForm,
} from './types'

export interface ChannelPolicy {
  allowed: GtmChannel[]
  needsManualReview: boolean
  explanation: string
}

const WARM_BASES: GtmContactBasis[] = ['warm_intro', 'inbound', 'customer_referral']

/**
 * Konservativ kanalgrind för Handymates egen prospektering.
 *
 * Det här är ett internt riskkontrakt, inte juridisk rådgivning. Okänd eller
 * fysisk bolagsform failar stängt för kall e-post. SMS finns överhuvudtaget
 * inte som kanal i Launch Desk V1.
 */
export function channelPolicy(input: {
  legalForm: GtmLegalForm
  contactBasis: GtmContactBasis
  suppressed?: boolean
}): ChannelPolicy {
  if (input.suppressed) {
    return { allowed: [], needsManualReview: false, explanation: 'Kontakten är spärrad.' }
  }

  if (WARM_BASES.includes(input.contactBasis)) {
    return {
      allowed: ['warm_intro', 'phone', 'linkedin', 'email', 'letter', 'video'],
      needsManualReview: false,
      explanation: 'Kontakten bygger på en varm introduktion, inkommande kontakt eller kundreferens.',
    }
  }

  if (input.legalForm === 'limited_company') {
    const emailAllowed = input.contactBasis === 'public_business_contact'
      || input.contactBasis === 'public_professional_role'
    return {
      allowed: emailAllowed
        ? ['phone', 'linkedin', 'email', 'letter', 'video']
        : ['phone', 'linkedin', 'letter', 'video'],
      needsManualReview: input.contactBasis === 'unknown',
      explanation: emailAllowed
        ? 'Aktiebolag med offentligt professionellt kontaktunderlag.'
        : 'Aktiebolag, men kontaktkällan behöver bedömas innan e-post används.',
    }
  }

  if (input.legalForm === 'sole_trader' || input.legalForm === 'unknown') {
    return {
      allowed: [],
      needsManualReview: true,
      explanation: 'Enskild eller okänd bolagsform är stängd för kall kontakt i V1. Använd bara en dokumenterad varm eller inkommande kontaktgrund.',
    }
  }

  return {
    allowed: [],
    needsManualReview: true,
    explanation: 'Oklassad juridisk person är stängd för kall kontakt i V1.',
  }
}

export function canUseChannel(
  account: Pick<GtmAccount, 'legal_form' | 'contact_basis' | 'status'>,
  channel: GtmActivityChannel,
): boolean {
  if (channel === 'meeting' || channel === 'demo' || channel === 'other') {
    return account.status !== 'suppressed'
  }
  return channelPolicy({
    legalForm: account.legal_form,
    contactBasis: account.contact_basis,
    suppressed: account.status === 'suppressed',
  }).allowed.includes(channel)
}

export function suggestedChannelIsEligible(
  legalForm: GtmLegalForm,
  contactBasis: GtmContactBasis,
  channel: GtmChannel,
): boolean {
  if (channel === 'none') return true
  return channelPolicy({ legalForm, contactBasis }).allowed.includes(channel)
}

export function recommendChannel(input: {
  legalForm: GtmLegalForm
  contactBasis: GtmContactBasis
  hasPhone: boolean
  hasEmail: boolean
  hasLinkedin: boolean
}): GtmChannel {
  const policy = channelPolicy({ legalForm: input.legalForm, contactBasis: input.contactBasis })
  if (policy.needsManualReview) return 'none'
  if (policy.allowed.includes('warm_intro')) return 'warm_intro'
  if (input.hasPhone && policy.allowed.includes('phone')) return 'phone'
  if (input.hasEmail && policy.allowed.includes('email')) return 'email'
  if (input.hasLinkedin && policy.allowed.includes('linkedin')) return 'linkedin'
  return policy.allowed.includes('letter') ? 'letter' : 'none'
}
