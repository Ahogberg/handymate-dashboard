/**
 * Kundinflödets sanningsmodell.
 *
 * Modellen är medvetet ren och liten: en inställningsflagga kan bara säga
 * "aktiverad". Först ett faktiskt kanalbevis får flytta nivån vidare, och
 * starkaste nivån kräver att både lead- och affärsraden har verifierats.
 * Det gör att onboarding/Kom igång kan guida utan att lova mer än databasen
 * bevisar.
 */

export type InflowChannel = 'phone' | 'email' | 'web'

export type ChannelHealthState =
  | 'not_enabled'
  | 'enabled_unverified'
  | 'channel_verified'
  | 'lead_verified'

export type ChannelProof =
  | 'call_received'
  | 'email_received'
  | 'widget_loaded'
  | 'widget_conversation'
  | 'web_form_received'

export interface ChannelHealthSignals {
  enabled: boolean
  channel_verified_at?: string | null
  channel_proof?: ChannelProof | null
  lead_exists?: boolean
  deal_exists?: boolean
  lead_verified_at?: string | null
}

export interface ChannelHealth {
  channel: InflowChannel
  state: ChannelHealthState
  label: string
  detail: string
  next_action: string | null
  evidence_at: string | null
  proof: ChannelProof | null
}

const COPY: Record<InflowChannel, Record<ChannelHealthState, Omit<ChannelHealth, 'channel' | 'state' | 'evidence_at' | 'proof'>>> = {
  phone: {
    not_enabled: {
      label: 'Telefonen är inte aktiverad',
      detail: 'Lisa kan inte ta emot ett provsamtal ännu.',
      next_action: 'Aktivera företagets Handymate-nummer.',
    },
    enabled_unverified: {
      label: 'Telefonen är aktiverad men oprövad',
      detail: 'Numret finns, men inget provsamtal har nått Handymate ännu.',
      next_action: 'Ring ett provsamtal och kontrollera att det tas emot.',
    },
    channel_verified: {
      label: 'Provsamtal mottaget',
      detail: 'Samtalet nådde Handymate. Hela vägen till lead och affär är ännu inte bevisad.',
      next_action: 'Slutför provsamtalet så att en riktig lead och affär skapas.',
    },
    lead_verified: {
      label: 'Lead och affär verifierade',
      detail: 'Provsamtalet har skapat både en lead och en affär.',
      next_action: null,
    },
  },
  email: {
    not_enabled: {
      label: 'E-postinflödet är inte aktiverat',
      detail: 'Ingen aktiv inkommande adress är kopplad till företaget.',
      next_action: 'Aktivera inkommande e-post och vidarebefordra ett provmejl.',
    },
    enabled_unverified: {
      label: 'E-postinflödet är aktiverat men oprövat',
      detail: 'Adressen finns, men inget mejl har nått Handymate ännu.',
      next_action: 'Vidarebefordra ett riktigt provmejl till Handymate-adressen.',
    },
    channel_verified: {
      label: 'Provmejl mottaget',
      detail: 'Mejlet nådde Handymate. En lead och affär är ännu inte verifierade tillsammans.',
      next_action: 'Granska provförfrågan och låt den gå vidare till en affär.',
    },
    lead_verified: {
      label: 'Lead och affär verifierade',
      detail: 'E-postinflödet har skapat både en lead och en affär.',
      next_action: null,
    },
  },
  web: {
    not_enabled: {
      label: 'Webbinflödet är inte aktiverat',
      detail: 'Varken hemsidewidgeten eller Handymate-sidan tar emot förfrågningar.',
      next_action: 'Aktivera widgeten eller publicera företagets Handymate-sida.',
    },
    enabled_unverified: {
      label: 'Webbinflödet är aktiverat men oprövat',
      detail: 'En webbkanal är aktiverad, men Handymate har ännu inget mottagningsbevis.',
      next_action: 'Öppna den installerade widgeten eller skicka en provförfrågan.',
    },
    channel_verified: {
      label: 'Webbkanalen är verifierad',
      detail: 'Handymate har sett webbkanalen, men en lead och affär är ännu inte verifierade tillsammans.',
      next_action: 'Skicka en provförfrågan hela vägen genom formuläret.',
    },
    lead_verified: {
      label: 'Lead och affär verifierade',
      detail: 'Webbinflödet har skapat både en lead och en affär.',
      next_action: null,
    },
  },
}

/**
 * Härled en kanalstatus. Ordningen är en sanningsgrind:
 *
 * 1. avstängd vinner alltid över historiska bevis,
 * 2. starkaste nivån kräver både verifierad lead och verifierad affär,
 * 3. kanalbevis betyder bara att transporten/installationen nåtts,
 * 4. en ensam aktiveringsflagga stannar på oprövad.
 */
export function deriveChannelHealth(
  channel: InflowChannel,
  signals: ChannelHealthSignals,
): ChannelHealth {
  let state: ChannelHealthState

  if (!signals.enabled) {
    state = 'not_enabled'
  } else if (signals.lead_exists === true && signals.deal_exists === true) {
    state = 'lead_verified'
  } else if (signals.channel_verified_at) {
    state = 'channel_verified'
  } else {
    state = 'enabled_unverified'
  }

  const copy = COPY[channel][state]
  return {
    channel,
    state,
    ...copy,
    evidence_at: state === 'lead_verified'
      ? signals.lead_verified_at || signals.channel_verified_at || null
      : state === 'channel_verified'
        ? signals.channel_verified_at || null
        : null,
    proof: state === 'channel_verified' || state === 'lead_verified'
      ? signals.channel_proof || null
      : null,
  }
}

export function hasVerifiedCustomerInflow(channels: ChannelHealth[]): boolean {
  return channels.some(channel => channel.state === 'lead_verified')
}

