/**
 * Facit för godkännandekortets preview och "Ändra" (2026-08-07).
 *
 * Två saker vaktas hårdast:
 *
 * 1. **Att fakturapåminnelsen visar sin text.** Den låg i
 *    `payload.delivery.messages.sms` men lästes av ingen — hantverkaren ombads
 *    godkänna ett SMS han inte kunde läsa.
 * 2. **Att en ändring inte tömmer delivery-objektet.** Servern gör en shallow
 *    merge, så ett fragment som bara bär den nästlade nyckeln hade raderat
 *    mottagare, nivå och avgifter, och gjort påminnelsen oskickbar.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/approval-preview.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { approvalPreview, isEditable, buildApprovalEdit } from '../lib/jarvis/approval-preview'

/** Formen cronen faktiskt skapar (app/api/cron/send-reminders/route.ts). */
function paminnelse(sms = 'Hej! En vänlig påminnelse om faktura 1042 på 24 300 kr.') {
  return {
    approval_type: 'invoice_reminder',
    payload: {
      invoice_id: 'inv_1',
      autonomy_key: 'invoice_reminder',
      delivery: {
        invoiceId: 'inv_1',
        invoiceNumber: '1042',
        businessId: 'biz_1',
        customerId: 'cust_1',
        businessName: 'Bee El & Bygg',
        customerPhone: '070-1234567',
        customerEmail: 'kund@example.se',
        emailToo: true,
        level: 'friendly',
        currentCount: 0,
        messages: { sms, emailSubject: 'Påminnelse 1042', emailBody: 'Hej!' },
      },
    },
  }
}

test.describe('fakturapåminnelsen — kortet som visade ingenting', () => {
  test('SMS-texten hittas i delivery.messages.sms', () => {
    const p = approvalPreview(paminnelse())
    expect(p.text).toContain('faktura 1042')
    expect(p.source).toBe('delivery_sms')
  })

  test('den går att ändra', () => {
    expect(isEditable(paminnelse())).toBe(true)
  })

  test('utan invoiceId visas ingen text', () => {
    // Utan invoiceId kan deliverInvoiceReminder ändå inte skicka något. Att
    // visa texten hade påstått att den är verksam.
    const a = paminnelse()
    delete (a.payload.delivery as Record<string, unknown>).invoiceId
    expect(approvalPreview(a).text).toBe('')
    expect(isEditable(a)).toBe(false)
  })
})

test.describe('ÄNDRINGEN FÅR INTE TÖMMA DELIVERY — servern gör shallow merge', () => {
  test('hela delivery-objektet byggs om, inte bara den nästlade nyckeln', () => {
    const a = paminnelse()
    const frag = buildApprovalEdit(a, 'Ny text') as Record<string, any>

    // Om fragmentet bara bar { messages: { sms } } hade merge:en raderat allt
    // nedan och deliverInvoiceReminder fallit på !delivery?.invoiceId.
    expect(frag.delivery.invoiceId).toBe('inv_1')
    expect(frag.delivery.customerPhone).toBe('070-1234567')
    expect(frag.delivery.customerEmail).toBe('kund@example.se')
    expect(frag.delivery.level).toBe('friendly')
    expect(frag.delivery.emailToo).toBe(true)
    expect(frag.delivery.currentCount).toBe(0)
  })

  test('bara sms byts — ämnesrad och brödtext står kvar', () => {
    const frag = buildApprovalEdit(paminnelse(), 'Ny text') as Record<string, any>
    expect(frag.delivery.messages.sms).toBe('Ny text')
    expect(frag.delivery.messages.emailSubject).toBe('Påminnelse 1042')
    expect(frag.delivery.messages.emailBody).toBe('Hej!')
  })

  test('originalet muteras inte', () => {
    const a = paminnelse('Original')
    buildApprovalEdit(a, 'Ny text')
    expect((a.payload.delivery as any).messages.sms).toBe('Original')
  })
})

test.describe('de enkla källorna', () => {
  test('message går före sms_text', () => {
    const p = approvalPreview({ approval_type: 'send_sms', payload: { message: 'A', sms_text: 'B' } })
    expect(p.text).toBe('A')
    expect(p.source).toBe('message')
    expect(buildApprovalEdit({ approval_type: 'send_sms', payload: { message: 'A' } }, 'C')).toEqual({ message: 'C' })
  })

  test('sms_text används när message saknas', () => {
    const a = { approval_type: 'send_sms', payload: { sms_text: 'B' } }
    expect(approvalPreview(a).source).toBe('sms_text')
    expect(buildApprovalEdit(a, 'C')).toEqual({ sms_text: 'C' })
  })

  test('tom sträng räknas inte som en text', () => {
    // '' är inte ett meddelande. Utan detta hade en tom previewruta renderats
    // och Ändra-knappen erbjudit att redigera ingenting.
    const a = { approval_type: 'send_sms', payload: { message: '' } }
    expect(approvalPreview(a).source).toBeNull()
    expect(isEditable(a)).toBe(false)
  })

  test('lång text kapas', () => {
    const lang = 'x'.repeat(400)
    expect(approvalPreview({ approval_type: 'send_sms', payload: { message: lang } }).text).toHaveLength(200)
  })
})

test.describe('sammansatta — visas men går inte att ändra', () => {
  test('lead_review visar namn och telefon', () => {
    const a = { approval_type: 'lead_review', payload: { parsed: { name: 'Anna', phone: '070-1' } } }
    expect(approvalPreview(a).text).toBe('Anna · 070-1')
    expect(approvalPreview(a).source).toBe('sammansatt')
  })

  test('en sammansatt text ger ALDRIG en Ändra-knapp', () => {
    // Det finns inget enda fält att skriva tillbaka till. En knapp som sparar
    // fel är värre än ingen knapp.
    const lead = { approval_type: 'lead_review', payload: { parsed: { name: 'Anna' } } }
    const site = { approval_type: 'publish_microsite', payload: { preview: { headline: 'Rubrik' } } }
    expect(isEditable(lead)).toBe(false)
    expect(isEditable(site)).toBe(false)
    expect(buildApprovalEdit(lead, 'X')).toBeNull()
    expect(buildApprovalEdit(site, 'X')).toBeNull()
  })
})

test.describe('inget att visa', () => {
  test('tom payload ger ingen preview och ingen knapp', () => {
    for (const a of [
      { approval_type: 'create_booking', payload: {} },
      { approval_type: 'create_booking', payload: null },
      { approval_type: 'create_booking' },
    ]) {
      expect(approvalPreview(a).text).toBe('')
      expect(approvalPreview(a).source).toBeNull()
      expect(isEditable(a)).toBe(false)
    }
  })
})
