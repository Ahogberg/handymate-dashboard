/**
 * Karins påminnelsekort — EN byggare, två anropare (2026-08-27).
 *
 * Flyttat verbatim ur app/api/cron/send-reminders/route.ts (nivåschema,
 * SMS/e-posttexter, dröjsmålsränta, config-mappning, stegkomposition och
 * själva kortet) så att onboardingens första verifierade handling
 * (app/api/onboarding/first-action/route.ts) kan skapa EXAKT samma kort
 * som morgoncronen: samma payload-nycklar (invoice_id, autonomy_key,
 * amount_kr, customer_name, invoice_number, days_overdue, delivery), samma
 * dedup (pending + payload.invoice_id), samma exekvering
 * (app/api/approvals/[id]/route.ts, casen för invoice_reminder) och samma
 * kvitto (lib/approvals/value-receipt.ts).
 *
 * Cronen behåller det som är cronens: tidsvakterna (auto_reminder_days,
 * max_auto_reminders), mandat- och autonomigrinden, direktleveransen,
 * push och första-händelse-SMS:et. Den här filen skickar aldrig något.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateOCR } from '@/lib/ocr'
import { buildSmsSuffix } from '@/lib/sms-reply-number'
import type { ReminderDeliveryInput } from '@/lib/invoice-reminder-send'
import { extractFirstName } from '@/lib/customers/namn'
import {
  emailHeading, emailParagraph, statusBand, amountBlock, paymentBlock, summaryTable, signature,
  escapeEmailText, formatDag, type StatusTone, type SummaryRow,
} from '@/lib/email-templates'

export const DEFAULT_SCHEDULE = [
  { level: 'friendly', emailToo: false },
  { level: 'firm', emailToo: true },
  { level: 'formal', emailToo: true },
  { level: 'final', emailToo: true },
] as const

export type ReminderLevel = 'friendly' | 'firm' | 'formal' | 'final'

export interface ReminderConfig {
  auto_reminder_enabled: boolean
  auto_reminder_days: number
  reminder_fee: number
  penalty_interest: number
  late_fee_percent: number
  max_auto_reminders: number
  reminder_sms_template: string | null
  business_name: string
  display_name: string | null
  bankgiro: string
  swish_number: string | null
  phone_number: string | null
  assigned_phone_number: string | null
}

export function getReminderMessage(level: ReminderLevel, vars: {
  invoiceNumber: string
  amount: string
  dueDate: string
  ocr: string
  businessName: string
  daysOverdue: number
  bankgiro: string
  reminderFee: number
  interestAmount: number
  customTemplate?: string | null
  assignedPhoneNumber?: string | null
  swishNumber?: string | null
  amountRaw?: number
  /** Kundens namn → förnamn i mailets tilltal (SMS:et är oförändrat). */
  customerName?: string | null
  /** Företagets telefon → signatur + "ring oss på" i den formella påminnelsen. */
  phone?: string | null
}): { sms: string; emailSubject: string; emailBody: string } {
  const { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount } = vars
  const suffix = buildSmsSuffix(businessName, vars.assignedPhoneNumber)
  const emailVars = {
    invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount,
    swishNumber: vars.swishNumber, amountRaw: vars.amountRaw, customerName: vars.customerName, phone: vars.phone,
  }

  // Bygg Swish-betalningslänk om numret finns
  const swishNote = vars.swishNumber && vars.amountRaw
    ? ` Swish: ${vars.swishNumber} (${amount} kr, ange "${invoiceNumber}").`
    : ''

  // Använd custom SMS-mall om den finns
  if (vars.customTemplate) {
    const sms = vars.customTemplate
      .replace(/\{invoice_number\}/g, invoiceNumber)
      .replace(/\{amount\}/g, amount)
      .replace(/\{due_date\}/g, dueDate)
      .replace(/\{ocr\}/g, ocr)
      .replace(/\{business_name\}/g, businessName)
      .replace(/\{days_overdue\}/g, String(daysOverdue))
      .replace(/\{bankgiro\}/g, bankgiro)
      .replace(/\{late_fee_percent\}/g, String(reminderFee))
    return {
      sms: sms + '\n' + suffix,
      ...generateEmailContent(level, emailVars),
    }
  }

  const feeNote = reminderFee > 0 && level !== 'friendly'
    ? ` Påminnelseavgift ${reminderFee} kr tillkommer.`
    : ''
  const interestNote = interestAmount > 0 && (level === 'formal' || level === 'final')
    ? ` Dröjsmålsränta: ${Math.round(interestAmount)} kr.`
    : ''
  const payInfo = bankgiro ? `Bankgiro ${bankgiro}, OCR: ${ocr}.` : `OCR: ${ocr}.`

  switch (level) {
    case 'friendly':
      return {
        sms: `Hej! Faktura ${invoiceNumber} på ${amount} kr förföll ${dueDate}. Kanske missades?${swishNote} ${payInfo}\n${suffix}`,
        ...generateEmailContent(level, emailVars),
      }
    case 'firm':
      return {
        sms: `Påminnelse 2: Faktura ${invoiceNumber} på ${amount} kr är ${daysOverdue} dagar försenad.${feeNote}${swishNote} ${payInfo}\n${suffix}`,
        ...generateEmailContent(level, emailVars),
      }
    case 'formal':
      return {
        sms: `Viktig påminnelse: Faktura ${invoiceNumber}, ${amount} kr, ${daysOverdue} dagar försenad.${feeNote}${interestNote}${swishNote} ${payInfo}\n${suffix}`,
        ...generateEmailContent(level, emailVars),
      }
    case 'final':
      return {
        sms: `SISTA PÅMINNELSE: Faktura ${invoiceNumber}, ${amount} kr, ${daysOverdue} dagar försenad. Ärendet kan överlämnas till inkasso.${feeNote}${interestNote}${swishNote} ${payInfo}\n${suffix}`,
        ...generateEmailContent(level, emailVars),
      }
  }
}

/**
 * Varumärkeslagret 2026-09-07: emailBody är nu ett INNEHÅLLSFRAGMENT
 * (byggstenar ur lib/email-templates.ts), inte ett komplett dokument.
 * Leveranspunkten (lib/invoice-reminder-send.ts) lägger på företagets
 * masterlayout — logotyp, accentfärg, sidfot med stämpel — via emailLayout().
 * Fragmentet lagras i godkännandekortets payload (delivery.messages) och
 * förhandsvisas där; kort skapade före detta datum bär det gamla hela
 * dokumentet, se arRedanHeltMejl i invoice-reminder-send.
 */
export function generateEmailContent(level: ReminderLevel, vars: {
  invoiceNumber: string; amount: string; dueDate: string; ocr: string
  businessName: string; daysOverdue: number; bankgiro: string
  reminderFee: number; interestAmount: number; swishNumber?: string | null
  amountRaw?: number; customerName?: string | null; phone?: string | null
}): { emailSubject: string; emailBody: string } {
  const { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro, reminderFee, interestAmount } = vars
  const nr = escapeEmailText(invoiceNumber)
  const firma = escapeEmailText(businessName)
  const forfoll = formatDag(dueDate)
  const belopp = `${amount} kr`
  const first = escapeEmailText(extractFirstName(vars.customerName))
  const kontakt = vars.phone ? `ring oss på ${escapeEmailText(vars.phone)}` : 'hör av dig till oss'

  // Designens fyra tonlägen (Kundmail-mastern, mail 5): vänlig → bestämd →
  // formell → sista. Ämne, band, rubrik och brödtext skärps steg för steg;
  // beloppsblocket och betalvägarna är desamma i alla fyra.
  const subjectMap: Record<ReminderLevel, string> = {
    friendly: `Kanske missades? Faktura ${invoiceNumber} från ${businessName}`,
    firm: `Påminnelse: faktura ${invoiceNumber} är förfallen`,
    formal: `Betalningspåminnelse — faktura ${invoiceNumber}, ${belopp}`,
    final: `Sista påminnelsen — faktura ${invoiceNumber}`,
  }
  const bandMap: Record<ReminderLevel, string> = {
    friendly: 'Påminnelse',
    firm: `Påminnelse 2 · förfallen ${forfoll}`,
    formal: 'Betalningspåminnelse 3',
    final: 'Sista påminnelsen',
  }
  const titleMap: Record<ReminderLevel, string> = {
    friendly: 'Kanske missades?',
    firm: 'Fakturan är förfallen',
    formal: 'Betalningspåminnelse',
    final: 'Sista påminnelsen',
  }
  const bodyMap: Record<ReminderLevel, string> = {
    friendly: `${first ? `Hej ${first}!` : 'Hej!'} Vi ser att fakturan ${nr} inte har kommit in ännu. Det är lätt att ett mail försvinner i flödet, så här kommer betalningsuppgifterna igen. Har du redan betalat kan du bortse från det här.`,
    firm: `${first ? `Hej ${first}.` : 'Hej.'} Fakturan ${nr} på ${belopp} förföll ${forfoll} och vi har ännu inte fått betalningen. Betala gärna så snart du kan. Om något är oklart med fakturan, hör av dig så löser vi det.`,
    formal: `Vår faktura ${nr} med förfallodatum ${forfoll} är fortfarande obetald. Vi ber dig betala beloppet ${belopp} omgående. Har du frågor om fakturan eller behöver dela upp betalningen, ${kontakt}.`,
    final: `Trots tidigare påminnelser är fakturan ${nr} på ${belopp} fortfarande obetald. Betalas inte fakturan lämnas ärendet vidare till inkasso. Vill du undvika det, betala nu eller kontakta oss omgående.`,
  }
  const toneMap: Record<ReminderLevel, StatusTone> = {
    friendly: 'neutral', firm: 'warning', formal: 'strong', final: 'danger',
  }
  const closingMap: Record<ReminderLevel, string> = {
    friendly: 'Vänliga hälsningar', firm: 'Vänliga hälsningar', formal: 'Med vänlig hälsning', final: 'Med vänlig hälsning',
  }

  // Avgift och ränta när företaget har dem konfigurerade — tillkommer utöver
  // fakturabeloppet (Swish-länken bär fakturabeloppet, aldrig summan).
  const harAvgift = reminderFee > 0 && level !== 'friendly'
  const harRanta = interestAmount > 0 && (level === 'formal' || level === 'final')
  const rows: SummaryRow[] = []
  if (harAvgift || harRanta) {
    rows.push({ label: 'Fakturabelopp', value: belopp })
    if (harAvgift) rows.push({ label: 'Påminnelseavgift (tillkommer)', value: `${reminderFee} kr` })
    if (harRanta) rows.push({ label: 'Dröjsmålsränta (tillkommer)', value: `${Math.round(interestAmount)} kr` })
  }

  return {
    emailSubject: subjectMap[level],
    emailBody: `
      ${statusBand(bandMap[level], toneMap[level])}
      ${emailHeading(titleMap[level])}
      ${emailParagraph(bodyMap[level])}
      ${amountBlock({ label: 'Att betala', amount: belopp, sub: `Faktura ${nr} · förföll ${forfoll}` })}
      ${paymentBlock({
        swishNumber: vars.swishNumber,
        amount: vars.amountRaw || 0,
        message: invoiceNumber,
        bankgiro,
        ocr,
        inline: true,
      })}
      ${rows.length ? summaryTable(rows) : ''}
      ${signature(firma, undefined, { closing: closingMap[level], phone: vars.phone ? escapeEmailText(vars.phone) : undefined })}
    `,
  }
}

/**
 * Beräkna dröjsmålsränta (enkel ränta, årsränta / 365 * dagar)
 */
export function calculateInterest(amount: number, annualRate: number, daysOverdue: number): number {
  if (annualRate <= 0 || daysOverdue <= 0 || amount <= 0) return 0
  return (amount * (annualRate / 100) * daysOverdue) / 365
}

// ── Config, stegkomposition och kortet (delas av cron + första handlingen) ──

export async function loadReminderConfig(supabase: SupabaseClient, businessId: string): Promise<ReminderConfig> {
  const { data: cfg } = await supabase
    .from('business_config')
    .select('auto_reminder_enabled, auto_reminder_days, reminder_fee, penalty_interest, late_fee_percent, max_auto_reminders, reminder_sms_template, business_name, display_name, bankgiro, swish_number, phone_number, assigned_phone_number')
    .eq('business_id', businessId)
    .single()
  return {
    auto_reminder_enabled: cfg?.auto_reminder_enabled ?? false,
    auto_reminder_days: cfg?.auto_reminder_days || 7,
    reminder_fee: cfg?.reminder_fee ?? 60,
    penalty_interest: cfg?.penalty_interest || cfg?.late_fee_percent || 8,
    late_fee_percent: cfg?.late_fee_percent || 8,
    max_auto_reminders: cfg?.max_auto_reminders || 3,
    reminder_sms_template: cfg?.reminder_sms_template || null,
    business_name: cfg?.display_name || cfg?.business_name || 'Företaget',
    display_name: cfg?.display_name || null,
    bankgiro: cfg?.bankgiro || '',
    swish_number: cfg?.swish_number || null,
    phone_number: cfg?.phone_number || null,
    assigned_phone_number: cfg?.assigned_phone_number || null,
  }
}

export interface ReminderInvoiceRow {
  invoice_id: string
  invoice_number: string
  ocr_number?: string | null
  due_date: string
  business_id: string
  customer_id?: string | null
  total?: number | null
  customer_pays?: number | null
  rot_rut_type?: string | null
  reminder_count?: number | null
}

export interface ReminderCustomer {
  name?: string | null
  phone_number?: string | null
  email?: string | null
}

export interface ReminderStep {
  currentCount: number
  nextCount: number
  daysOverdue: number
  /** Dagar efter förfall för steg 0..3 (auto_reminder_days × 1/2/4/8). */
  reminderDays: number[]
  /** Dagar som krävs för NÄSTA steg — undefined när schemat är slut. Cronens tidsvakt. */
  requiredDays: number | undefined
  level: ReminderLevel
  emailToo: boolean
  amountToPay: number
  interestAmount: number
  nextReminderAt: string | null
  messages: ReturnType<typeof getReminderMessage>
  deliveryInput: ReminderDeliveryInput
}

/**
 * Komponerar påminnelsesteget för en faktura — identiskt med cronens
 * beräkning, utan cronens tidsvakter (de bor kvar i cronen; den första
 * handlingen är ett mänskligt godkänt engångskort och lyder inte
 * auto_reminder_days).
 */
export function composeReminderStep(params: {
  inv: ReminderInvoiceRow
  customer: ReminderCustomer | null | undefined
  cfg: ReminderConfig
  today: Date
}): ReminderStep {
  const { inv, customer, cfg, today } = params
  const currentCount = inv.reminder_count || 0
  const dueDate = new Date(inv.due_date)
  const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
  const firstDay = cfg.auto_reminder_days
  const reminderDays = [firstDay, firstDay * 2, firstDay * 4, firstDay * 8]
  const requiredDays = reminderDays[currentCount]
  const scheduleEntry = DEFAULT_SCHEDULE[Math.min(currentCount, DEFAULT_SCHEDULE.length - 1)]
  const level = scheduleEntry.level
  const businessName = cfg.business_name
  const bankgiro = cfg.bankgiro
  const amountToPay = (inv.rot_rut_type ? inv.customer_pays : inv.total) || 0
  const ocrNumber = inv.ocr_number || generateOCR(inv.invoice_number || '')
  const interestAmount = calculateInterest(amountToPay, cfg.penalty_interest, daysOverdue)
  const messages = getReminderMessage(level, {
    invoiceNumber: inv.invoice_number,
    amount: amountToPay.toLocaleString('sv-SE') || '0',
    dueDate: dueDate.toLocaleDateString('sv-SE'),
    ocr: ocrNumber,
    businessName,
    daysOverdue,
    bankgiro,
    reminderFee: cfg.reminder_fee,
    interestAmount,
    customTemplate: cfg.reminder_sms_template,
    assignedPhoneNumber: cfg.assigned_phone_number,
    swishNumber: cfg.swish_number,
    amountRaw: amountToPay,
    customerName: customer?.name ?? null,
    phone: cfg.phone_number,
  })
  const nextCount = currentCount + 1
  const nextDays = reminderDays[nextCount]
  const nextReminderAt = nextDays && nextCount < cfg.max_auto_reminders
    ? new Date(dueDate.getTime() + nextDays * 24 * 60 * 60 * 1000).toISOString()
    : null
  const deliveryInput: ReminderDeliveryInput = {
    invoiceId: inv.invoice_id,
    invoiceNumber: inv.invoice_number,
    businessId: inv.business_id,
    customerId: inv.customer_id ?? null,
    businessName,
    customerPhone: customer?.phone_number ?? null,
    customerEmail: customer?.email ?? null,
    emailToo: scheduleEntry.emailToo,
    messages,
    level,
    currentCount,
    nextReminderAt,
    reminderFee: cfg.reminder_fee,
    interestAmount,
    penaltyInterest: cfg.penalty_interest,
    daysOverdue,
  }
  return {
    currentCount, nextCount, daysOverdue, reminderDays, requiredDays, level,
    emailToo: scheduleEntry.emailToo, amountToPay, interestAmount, nextReminderAt, messages, deliveryInput,
  }
}

export type CreateReminderCardResult = { id: string } | { duplicate: true } | { error: string }

/**
 * Skapar godkännandekortet (status pending) — dedup mot öppet pending-kort
 * för samma faktura via payload.invoice_id, precis som cronen alltid gjort.
 * Skickar inget, pushar inget: anroparen bestämmer det.
 */
export async function createInvoiceReminderCard(
  supabase: SupabaseClient,
  params: {
    businessId: string
    inv: ReminderInvoiceRow
    customer: ReminderCustomer | null | undefined
    step: ReminderStep
    capExceeded?: boolean
    extraPayload?: Record<string, unknown>
  },
): Promise<CreateReminderCardResult> {
  const { businessId, inv, customer, step, capExceeded = false, extraPayload } = params
  const { count: existingApproval, error: dedupErr } = await supabase
    .from('pending_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('approval_type', 'invoice_reminder')
    .eq('status', 'pending')
    .contains('payload', { invoice_id: inv.invoice_id })
  if (dedupErr) return { error: dedupErr.message }
  if ((existingApproval ?? 0) > 0) return { duplicate: true }

  const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const amountLabel = step.amountToPay.toLocaleString('sv-SE')
  const { error: apprErr } = await supabase.from('pending_approvals').insert({
    id: approvalId,
    business_id: businessId,
    approval_type: 'invoice_reminder',
    title: `Skicka påminnelse för faktura ${inv.invoice_number}`,
    description: `Faktura ${inv.invoice_number} på ${amountLabel} kr är ${step.daysOverdue} dagar försenad. Godkänn för att skicka påminnelse ${step.nextCount} till kunden.${capExceeded ? ` Karin sköter vanligtvis dessa själv, men beloppet avviker (${amountLabel} kr).` : ''}`,
    // invoice_id på toppnivå → dedup-guarden ovan matchar via .contains.
    // autonomy_key → streak-räkning (förtjänad autonomi). delivery → allt
    // deliverInvoiceReminder behöver vid godkännande. Belopp/kund/nummer på
    // toppnivå för kortets kontextrad och knapp (innehållskontraktet).
    payload: {
      invoice_id: inv.invoice_id,
      autonomy_key: 'invoice_reminder',
      amount_kr: step.amountToPay,
      customer_name: customer?.name ?? null,
      invoice_number: inv.invoice_number,
      days_overdue: step.daysOverdue,
      delivery: step.deliveryInput,
      // Owner Absence V1: taggar ENDAST kort som stoppades av beloppstaket.
      ...(capExceeded ? { cap_exceeded: true } : {}),
      ...(extraPayload ?? {}),
    },
    status: 'pending',
    risk_level: 'medium',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (apprErr) return { error: apprErr.message }
  return { id: approvalId }
}
