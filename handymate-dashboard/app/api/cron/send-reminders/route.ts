import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { generateOCR } from '@/lib/ocr'

/**
 * Automatisk påminnelselogik:
 * Dag 3: Vänlig påminnelse (SMS)
 * Dag 7: Andra påminnelse (SMS + email)
 * Dag 14: Tredje påminnelse (SMS + email, allvarligare ton)
 * Dag 30: Sista påminnelse / inkassovarning (SMS + email)
 */

const REMINDER_SCHEDULE = [
  { day: 3, level: 'friendly' },
  { day: 7, level: 'firm' },
  { day: 14, level: 'formal' },
  { day: 30, level: 'final' },
] as const

type ReminderLevel = typeof REMINDER_SCHEDULE[number]['level']

interface OverdueInvoice {
  invoice_id: string
  invoice_number: string
  due_date: string
  business_id: string
  customer_id: string
  total: number
  customer_pays: number | null
  rot_rut_type: string | null
  reminder_count: number
  last_reminder_at: string | null
  next_reminder_at: string | null
  customer?: { name: string; phone_number: string; email: string | null } | null
}

function getReminderMessage(level: ReminderLevel, vars: {
  invoiceNumber: string
  amount: string
  dueDate: string
  ocr: string
  businessName: string
  daysOverdue: number
  bankgiro: string
}): { sms: string; emailSubject: string; emailBody: string } {
  const { invoiceNumber, amount, dueDate, ocr, businessName, daysOverdue, bankgiro } = vars

  switch (level) {
    case 'friendly':
      return {
        sms: `Hej! Faktura ${invoiceNumber} på ${amount} kr förföll ${dueDate}. Kanske missades? Betala via bankgiro ${bankgiro}, OCR: ${ocr}. //${businessName}`,
        emailSubject: `Påminnelse: Faktura ${invoiceNumber}`,
        emailBody: `
          <p>Hej!</p>
          <p>Vi vill vänligen påminna om att faktura <strong>${invoiceNumber}</strong> på <strong>${amount} kr</strong> förföll den ${dueDate}.</p>
          <p>Om betalningen redan är skickad, bortse från detta meddelande.</p>
          <p><strong>Betalningsinformation:</strong><br>Bankgiro: ${bankgiro}<br>OCR: ${ocr}</p>
          <p>Vänliga hälsningar,<br>${businessName}</p>
        `,
      }
    case 'firm':
      return {
        sms: `Påminnelse 2: Faktura ${invoiceNumber} på ${amount} kr är nu ${daysOverdue} dagar försenad. Vänligen betala snarast. Bankgiro ${bankgiro}, OCR: ${ocr}. //${businessName}`,
        emailSubject: `Andra påminnelse: Faktura ${invoiceNumber} förfallen`,
        emailBody: `
          <p>Hej,</p>
          <p>Vi har ännu inte fått betalning för faktura <strong>${invoiceNumber}</strong> på <strong>${amount} kr</strong> som förföll den ${dueDate} (${daysOverdue} dagar sedan).</p>
          <p>Vänligen betala snarast möjligt för att undvika påminnelseavgift.</p>
          <p><strong>Betalningsinformation:</strong><br>Bankgiro: ${bankgiro}<br>OCR: ${ocr}</p>
          <p>Med vänlig hälsning,<br>${businessName}</p>
        `,
      }
    case 'formal':
      return {
        sms: `Viktig påminnelse: Faktura ${invoiceNumber}, ${amount} kr, är ${daysOverdue} dagar försenad. Dröjsmålsränta kan tillkomma. Betala till bankgiro ${bankgiro}, OCR: ${ocr}. //${businessName}`,
        emailSubject: `Tredje påminnelse: Faktura ${invoiceNumber} - ${daysOverdue} dagar försenad`,
        emailBody: `
          <p>Hej,</p>
          <p>Trots tidigare påminnelser har vi inte fått betalning för faktura <strong>${invoiceNumber}</strong> på <strong>${amount} kr</strong>.</p>
          <p>Fakturan förföll den ${dueDate}, vilket innebär att betalningen nu är <strong>${daysOverdue} dagar försenad</strong>.</p>
          <p>Dröjsmålsränta enligt räntelagen kan komma att debiteras. Vänligen kontakta oss om det finns frågor kring fakturan.</p>
          <p><strong>Betalningsinformation:</strong><br>Bankgiro: ${bankgiro}<br>OCR: ${ocr}</p>
          <p>Med vänlig hälsning,<br>${businessName}</p>
        `,
      }
    case 'final':
      return {
        sms: `SISTA PÅMINNELSE: Faktura ${invoiceNumber}, ${amount} kr, ${daysOverdue} dagar försenad. Ärendet kan överlämnas till inkasso om betalning uteblir. Bankgiro ${bankgiro}, OCR: ${ocr}. //${businessName}`,
        emailSubject: `Sista påminnelse: Faktura ${invoiceNumber} - risk för inkasso`,
        emailBody: `
          <p>Hej,</p>
          <p>Detta är en sista påminnelse gällande faktura <strong>${invoiceNumber}</strong> på <strong>${amount} kr</strong> som förföll den ${dueDate}.</p>
          <p>Betalningen är nu <strong>${daysOverdue} dagar försenad</strong>. Om betalning inte sker inom 10 dagar kan ärendet komma att överlämnas till inkassobolag.</p>
          <p>Kontakta oss omgående om du har frågor eller önskar en betalningsplan.</p>
          <p><strong>Betalningsinformation:</strong><br>Bankgiro: ${bankgiro}<br>OCR: ${ocr}</p>
          <p>Med vänlig hälsning,<br>${businessName}</p>
        `,
      }
  }
}

/**
 * GET/POST - Automatisk påminnelseutskick
 * Körs av Vercel Cron dagligen
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return sendAutoReminders()
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return sendAutoReminders()
}

async function sendAutoReminders() {
  try {
    const supabase = getServerSupabase()
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Hämta alla förfallna fakturor som kan få påminnelse
    const { data: overdueInvoices, error } = await supabase
      .from('invoice')
      .select(`
        invoice_id, invoice_number, due_date, business_id, customer_id,
        total, customer_pays, rot_rut_type, reminder_count,
        last_reminder_at, next_reminder_at,
        customer:customer_id (name, phone_number, email)
      `)
      .in('status', ['sent', 'overdue'])
      .lt('due_date', todayStr)
      .or(`next_reminder_at.is.null,next_reminder_at.lte.${today.toISOString()}`)

    if (error) throw error
    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({ success: true, reminders_sent: 0, message: 'Inga påminnelser att skicka' })
    }

    let remindersSent = 0
    const results: Array<{ invoice_id: string; invoice_number: string; level: string; success: boolean }> = []

    for (const inv of overdueInvoices as unknown as OverdueInvoice[]) {
      const dueDate = new Date(inv.due_date)
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

      // Bestäm vilken påminnelsenivå
      const currentCount = inv.reminder_count || 0
      const scheduleEntry = REMINDER_SCHEDULE[currentCount]

      if (!scheduleEntry) continue // Alla påminnelser skickade
      if (daysOverdue < scheduleEntry.day) continue // Inte dags för nästa påminnelse ännu

      // Hämta företagsinfo
      const { data: config } = await supabase
        .from('business_config')
        .select('business_name, display_name, bankgiro, phone_number')
        .eq('business_id', inv.business_id)
        .single()

      const businessName = config?.display_name || config?.business_name || 'Företaget'
      const bankgiro = config?.bankgiro || ''
      const amountToPay = inv.rot_rut_type ? inv.customer_pays : inv.total
      const ocrNumber = generateOCR(inv.invoice_number || '')

      const messages = getReminderMessage(scheduleEntry.level, {
        invoiceNumber: inv.invoice_number,
        amount: amountToPay?.toLocaleString('sv-SE') || '0',
        dueDate: dueDate.toLocaleDateString('sv-SE'),
        ocr: ocrNumber,
        businessName,
        daysOverdue,
        bankgiro,
      })

      let smsSent = false
      let emailSent = false

      // Skicka SMS
      if (inv.customer?.phone_number && process.env.ELKS_API_USER) {
        try {
          const smsResponse = await fetch('https://api.46elks.com/a1/sms', {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${process.env.ELKS_API_USER}:${process.env.ELKS_API_PASSWORD}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              from: businessName.substring(0, 11),
              to: inv.customer.phone_number,
              message: messages.sms,
            }).toString(),
          })
          smsSent = smsResponse.ok
        } catch (err) {
          console.error(`SMS error for ${inv.invoice_number}:`, err)
        }
      }

      // Skicka email (från dag 7+)
      if (scheduleEntry.level !== 'friendly' && inv.customer?.email && process.env.RESEND_API_KEY) {
        try {
          const { Resend } = await import('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)
          await resend.emails.send({
            from: `${businessName} <faktura@${process.env.RESEND_DOMAIN || 'handymate.se'}>`,
            to: inv.customer.email,
            subject: messages.emailSubject,
            html: `
              <div style="font-family: 'Segoe UI', system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
                ${messages.emailBody}
              </div>
            `,
          })
          emailSent = true
        } catch (err) {
          console.error(`Email error for ${inv.invoice_number}:`, err)
        }
      }

      if (smsSent || emailSent) {
        // Beräkna nästa påminnelsetid
        const nextSchedule = REMINDER_SCHEDULE[currentCount + 1]
        const nextReminderAt = nextSchedule
          ? new Date(dueDate.getTime() + nextSchedule.day * 24 * 60 * 60 * 1000).toISOString()
          : null

        await supabase
          .from('invoice')
          .update({
            status: 'overdue',
            reminder_count: currentCount + 1,
            last_reminder_at: today.toISOString(),
            next_reminder_at: nextReminderAt,
            reminder_sent_at: today.toISOString(),
          })
          .eq('invoice_id', inv.invoice_id)

        // Logga SMS
        if (smsSent) {
          await supabase.from('sms_log').insert({
            business_id: inv.business_id,
            customer_id: inv.customer_id,
            direction: 'outgoing',
            phone_number: inv.customer?.phone_number,
            message: messages.sms,
            message_type: 'invoice_reminder',
            related_id: inv.invoice_id,
            status: 'sent',
          }).catch(() => {})
        }

        // Logga aktivitet
        await supabase.from('activity').insert({
          business_id: inv.business_id,
          customer_id: inv.customer_id,
          activity_type: 'auto_reminder_sent',
          description: `Automatisk påminnelse ${currentCount + 1} skickad för faktura ${inv.invoice_number}${smsSent ? ' (SMS)' : ''}${emailSent ? ' (email)' : ''}`,
          metadata: { invoice_id: inv.invoice_id, level: scheduleEntry.level, reminder_count: currentCount + 1 },
        }).catch(() => {})

        remindersSent++
        results.push({ invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, level: scheduleEntry.level, success: true })
      } else {
        results.push({ invoice_id: inv.invoice_id, invoice_number: inv.invoice_number, level: scheduleEntry.level, success: false })
      }
    }

    return NextResponse.json({
      success: true,
      reminders_sent: remindersSent,
      results,
    })
  } catch (error: any) {
    console.error('Auto reminder error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
