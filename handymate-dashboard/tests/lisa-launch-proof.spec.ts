/**
 * Lisa — lanseringskontraktet. Det här är det browserlösa facitet för den
 * kedja vi faktiskt säljer vid lansering. Det ersätter inte det skarpa
 * 46elks-provet i docs/launch/LISA_SHARP_PROOF.md.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('Lisa: inkommande samtal → affärsrad → snabb återkoppling', () => {
  test('webhooken verifierar 46elks och löser tenant från det ringda numret', () => {
    const s = read('app/api/voice/incoming/route.ts')
    expect(s).toContain('verifyElksSignature')
    expect(s).toContain(".eq('assigned_phone_number', to)")
    expect(s).not.toContain(".eq('business_id', params.get('business_id'))")
  })

  test('en ny uppringare går genom samma kund/lead/deal-kärna som övriga leads', () => {
    const s = read('app/api/voice/incoming/route.ts')
    expect(s).toContain('createLeadAndDeal')
    expect(s).toContain("source: 'vapi_call'")
    expect(s).toContain('customerId = gp.customerId')
  })

  test('onboardingens verkliga ringtest kräver ett riktigt tilldelat nummer', () => {
    const arm = read('app/api/onboarding/test-call/arm/route.ts')
    expect(arm).toContain('assigned_phone_number')
    expect(arm).toContain('process.env.ELKS_API_USER')
    expect(arm).toContain("reason: 'no_number'")
  })

  test('ringtestet redovisar verkligt SMS-resultat och id:n — aldrig förskriven framgång', () => {
    const incoming = read('app/api/voice/incoming/route.ts')
    const status = read('app/api/onboarding/test-call/status/route.ts')
    expect(incoming).toContain('sms_sent: smsResult.success === true')
    expect(incoming).toContain("sms_error: smsResult.success ? null :")
    for (const field of ['called_at', 'sms_sent', 'sms_error', 'lead_id']) {
      expect(status).toContain(field)
    }
  })
})

test.describe('Lisa: fortsatt kunddialog efter det missade samtalet', () => {
  test('inkommande SMS verifieras, lagras tenant-säkert och triggar agenten', () => {
    const s = read('app/api/sms/incoming/route.ts')
    expect(s).toContain('verifyElksSignature')
    expect(s).toContain(".eq('assigned_phone_number', to)")
    expect(s).toContain("triggerAgentFireAndForget(")
    expect(s).toContain("'incoming_sms'")
    expect(s).toContain(".from('sms_conversation')")
    expect(s).toContain(".eq('business_id', business.business_id)")
  })

  test('ett tvetydigt telefonnummer får aldrig gissa tenant', () => {
    const s = read('app/api/sms/incoming/route.ts')
    expect(s).toContain('företag.length > 1')
    expect(s).toContain('avstår i stället för att gissa tenant')
    expect(s).toContain('handled: false')
  })

  test('all utgående återkoppling passerar samma STOPP-, kvot- och Bränslegrind', () => {
    const s = read('lib/sms-send.ts')
    expect(s).toContain('gateCustomerSms')
    expect(s).toContain('checkSmsAllowance')
    expect(s).toContain('checkFuelGate')
    expect(s).toContain("fetch('https://api.46elks.com/a1/sms'")
  })
})

test.describe('marknadsföringsgränsen är uttrycklig', () => {
  test('produktspråket lovar inte en komplett live-röstagent före den finns', () => {
    const s = read('docs/marketing/product-language.md')
    expect(s).toContain('Säg inte att Lisa för en fri AI-konversation')
    expect(s).toContain('fortsätter dialogen via SMS')
  })
})
