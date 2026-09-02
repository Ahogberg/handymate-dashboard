/**
 * Delade typer för kundportalen.
 * Extraherade från page.tsx vid komponent-splitten — INGEN logik-ändring.
 */

import type { Attribution } from '@/lib/branding/attribution'

export interface WorkingHoursDay {
  active: boolean
  start: string
  end: string
}

export interface PortalData {
  customer: { name: string; email: string; phone: string; customerId: string }
  business: {
    name: string
    contactName: string
    email: string
    phone: string
    googleReviewUrl?: string | null
    // Utökade fält för Claude Design redesign
    accentColor?: string | null
    logoUrl?: string | null
    address?: string | null
    orgNumber?: string | null
    fSkatt?: boolean
    workingHours?: Record<string, WorkingHoursDay> | null
    swish?: string | null
    bankgiro?: string | null
  }
  unreadMessages: number
  /** "Skickat via Handymate"-stämpeln (lib/branding/attribution.ts) — laddad
      en gång i /api/portal/[token]; saknas den visas texten utan länk. */
  attribution?: Attribution | null
}

/**
 * Aggregated activity event för Home-feed.
 * Genereras av /api/portal/[token]/activity från flera källtabeller.
 */
export interface PortalActivity {
  id: string
  type: 'photo_uploaded' | 'quote_signed' | 'quote_sent' | 'message_received'
       | 'invoice_paid' | 'invoice_sent' | 'stage_completed'
  title: string
  sub: string
  // Lucide-icon-namn
  icon: 'Image' | 'FileSignature' | 'MessageCircle' | 'Receipt' | 'CheckCircle'
  // Tailwind-färgklass-tokens (string-värden i hex)
  color: string
  bg: string
  created_at: string
  link?: { route: string }
}

export interface PortalAtaSummor {
  delsumma: number
  moms: number
  totalt: number
  rotTyp: 'rot' | 'rut' | null
  rotArbetskostnadExMoms: number
  rotAvdrag: number
  attBetala: number
}

export interface PortalAta {
  change_id: string
  ata_number: number
  change_type: string
  description: string
  items: Array<{ name: string; quantity: number; unit: string; unit_price: number }>
  total: number
  /** Momssats fryst vid skapandet (v195) */
  vat_rate: number
  /** Delsumma/moms/totalt/ROT — räknade av backend (lib/ata/totals.ts) */
  summor: PortalAtaSummor
  /** Svensk kundetikett (lib/ata/labels.ts) — aldrig rå status i UI:t */
  status_label: string
  /** ÄTA-dokumentet som PDF — bara efter utskick */
  pdf_url: string | null
  status: string
  sign_token: string | null
  sent_at: string | null
  signed_at: string | null
  signed_by_name: string | null
  created_at: string
}

export interface TrackerStage {
  stage: string
  label: string
  completed_at: string | null
  completed_by: string | null
  note: string | null
}

export interface ProjectPhoto {
  id: string
  url: string
  caption: string | null
  type: string
  uploaded_at: string
}

export interface Project {
  project_id: string
  /** Ärendenumret (P-1042) — så kunden refererar till jobbet. */
  project_number?: string | null
  name: string
  status: string
  description: string
  progress: number
  created_at: string
  updated_at: string
  milestones: Array<{ name: string; status: string; sort_order: number }>
  latestLog: { description: string; created_at: string } | null
  nextVisit: { title: string; start_time: string; end_time: string } | null
  atas: PortalAta[]
  tracker_stages?: TrackerStage[]
  photos?: ProjectPhoto[]
}

export interface Quote {
  quote_id: string
  title: string
  status: string
  total: number
  customer_pays: number
  rot_rut_type: string | null
  rot_rut_deduction: number
  valid_until: string
  created_at: string
  sent_at: string | null
  accepted_at: string | null
  sign_token: string | null
}

export interface Invoice {
  invoice_id: string
  invoice_number: string
  invoice_type?: string
  status: string
  items?: any[]
  subtotal?: number
  vat_rate?: number
  vat_amount?: number
  total: number
  rot_rut_type: string | null
  rot_rut_deduction?: number | null
  customer_pays?: number | null
  invoice_date?: string
  due_date: string
  paid_at: string | null
  created_at: string
  ocr_number?: string
  our_reference?: string | null
  your_reference?: string | null
  is_credit_note?: boolean
  reminder_count?: number
  introduction_text?: string | null
  conclusion_text?: string | null
}

export interface PaymentInfo {
  bankgiro: string | null
  plusgiro: string | null
  swish: string | null
  bank_account: string | null
  penalty_interest: number
  reminder_fee: number
}

export interface BusinessInfo {
  name: string
  org_number: string
  f_skatt: boolean
}

export interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  message: string
  read_at: string | null
  created_at: string
}

/**
 * Aktivt serviceavtal — Motor 2, Etapp 2 (portal-avtalsvyn). Pris INKL.
 * moms (portalen är kundvänd, se lib/agreements/pricing.ts). v1: ingen
 * kund-självservice, bara insyn — se tasks/motor2-serviceavtal-spec.md.
 */
export interface PortalAgreement {
  agreement_id: string
  title: string
  interval_months: number
  next_visit_at: string | null
  price_incl_vat: number
}

export type Tab = 'projects' | 'quotes' | 'invoices' | 'messages' | 'review' | 'changes' | 'reports'

export interface FieldReport {
  id: string
  report_number: string | null
  title: string
  work_performed: string | null
  materials_used: string | null
  status: string
  signature_token: string | null
  signed_at: string | null
  signed_by: string | null
  created_at: string
  project_id: string | null
}

// ── Fastighetspasset steg 1 (2026-08-27) ───────────────────────────────

/** Ett publicerat jobbpass i portalen — vyn är samma allowlist-DTO som den publika sidan. */
export interface PortalJobbpassSummary {
  project_id: string
  project_name: string
  completed_at: string | null
  published_at: string | null
  view: import('@/lib/jobbpass/jobbpass').JobbpassCustomerView
}

/** Kundens fil i dokumentfliken — signerad URL, aldrig en rå storage-sökväg. */
export interface PortalDocument {
  id: string
  source: 'customer' | 'project' | 'generated'
  name: string
  category: string | null
  project_id: string | null
  project_name: string | null
  uploaded_at: string | null
  url: string
  mime_type: string | null
}

/** Fältrapport i portalen — samma rader som /api/portal/[token]/reports svarar med. */
export interface PortalReport {
  id: string
  report_number: string | null
  title: string | null
  work_performed: string | null
  materials_used: string | null
  status: string | null
  signed_at: string | null
  signed_by: string | null
  created_at: string
  project_id: string | null
}

/** Min bostad (Fastighetspasset steg 3): bekräftad installation ur /api/portal/[token]/installations. */
export interface PortalInstallation {
  installation_id: string
  project_id: string | null
  name: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  placement: string | null
  installed_at: string | null
  service_interval_months: number | null
  service_interval_source: 'product_info' | 'craftsman' | null
  service_source_label: string | null
  next_service_at: string | null
  care_instructions: string | null
  site_address_line: string | null
  site_postal_code: string | null
  site_city: string | null
}
