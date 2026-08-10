/**
 * Facit för hur ett godkännande presenteras (2026-08-07).
 *
 * Två invarianter som lätt glider isär när nya ärendetyper läggs till:
 *
 * 1. **Amber används bara när det är sant.** Vänsterkanten betyder att pengar
 *    eller tid går förlorade om ingen tittar. Blir allt gult slutar man läsa
 *    gult — samma sparsamhetsprincip som i offertflödets granskning.
 * 2. **Knapptexten säger vad som faktiskt händer.** "Godkänn & skicka" på ett
 *    ärende som bara skapar ett utkast är en osanning på själva knappen.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/approval-view.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  agentForApproval,
  approveLabel,
  deepLinkFor,
  needsAttention,
  ringUppmaning,
  typeLabel,
  TYPE_LABEL,
} from '../lib/jarvis/approval-view'
import { TEAM } from '../lib/agents/team'

test.describe('AMBER BARA NÄR DET ÄR SANT', () => {
  test('förfallen faktura och betalning bär amber', () => {
    expect(needsAttention({ approval_type: 'invoice_reminder' })).toBe(true)
    expect(needsAttention({ approval_type: 'confirm_payment' })).toBe(true)
  })

  test('en ny lead är en nyhet, inte en varning', () => {
    expect(needsAttention({ approval_type: 'lead_review' })).toBe(false)
  })

  test('en offert är rutin', () => {
    expect(needsAttention({ approval_type: 'create_quote_draft' })).toBe(false)
    expect(needsAttention({ approval_type: 'send_quote' })).toBe(false)
  })

  test('högst en fjärdedel av typerna får bära amber', () => {
    // Trubbig vakt mot att listan sväller. Sväller den ändå är det ett
    // medvetet beslut någon måste ta, inte en glidning.
    const alla = Object.keys(TYPE_LABEL)
    const ambrade = alla.filter(t => needsAttention({ approval_type: t }))
    expect(ambrade.length / alla.length, `Amber på ${ambrade.join(', ')}`).toBeLessThanOrEqual(0.25)
  })

  test('risk_level styr inte amber', () => {
    // Frestande att koppla dit, men det hade gett amber på var tredje kort.
    expect(needsAttention({ approval_type: 'send_sms', risk_level: 'high' })).toBe(false)
  })
})

test.describe('KNAPPEN SÄGER VAD SOM HÄNDER', () => {
  test('offertutkastet SKAPAR, det skickar inte', () => {
    // Exekveraren POST:ar till /api/quotes och returnerar ett quote_id.
    // Något utskick sker aldrig.
    const label = approveLabel('create_quote_draft')
    expect(label).toBe('Skapa offerten')
    expect(label.toLowerCase()).not.toContain('skicka')
  })

  test('det som verkligen skickar får säga skicka', () => {
    expect(approveLabel('send_quote').toLowerCase()).toContain('skicka')
    expect(approveLabel('invoice_reminder').toLowerCase()).toContain('skicka')
    expect(approveLabel('send_sms').toLowerCase()).toContain('skicka')
  })

  test('fakturera_projekt säger skicka OCH beloppet kunden betalar', () => {
    // Kortet bär hela utkastet och Godkänn skickar fakturan (Tur 4 etapp 2).
    // amount_kr sätts till customer_pays när kortet skapas i cronen.
    const label = approveLabel('fakturera_projekt', { amount_kr: 48750 })
    expect(label).toBe(`Godkänn & skicka — ${(48750).toLocaleString('sv-SE')} kr`)
    // Utan belopp lovas ingen påhittad siffra — men verbet står kvar.
    expect(approveLabel('fakturera_projekt', {})).toBe('Godkänn & skicka')
  })

  test('okänd typ faller tillbaka på ett neutralt ord', () => {
    // Bättre att säga för lite än att lova fel.
    expect(approveLabel('nagot_helt_nytt')).toBe('Godkänn')
  })
})

test.describe('agentroutingen', () => {
  test('explicit routing i payloaden går alltid först', () => {
    expect(agentForApproval({ approval_type: 'send_invoice', payload: { routed_agent: 'lisa' } })).toBe('lisa')
  })

  test('okänd routad agent ignoreras — typen får avgöra', () => {
    // Annars hade ett stavfel i payloaden gett ett kort utan avatar.
    expect(agentForApproval({ approval_type: 'send_invoice', payload: { routed_agent: 'finns-inte' } })).toBe('karin')
  })

  test('varje typ i etikettkartan landar på en agent som finns', () => {
    const kanda = new Set(TEAM.map(a => a.id))
    for (const t of Object.keys(TYPE_LABEL)) {
      expect(kanda.has(agentForApproval({ approval_type: t })), `${t} routades till en okänd agent`).toBe(true)
    }
  })

  test('fakturor till Karin, offerter till Daniel, samtal till Lisa', () => {
    expect(agentForApproval({ approval_type: 'invoice_reminder' })).toBe('karin')
    // Även utan routed_agent i payloaden — svenskt "faktur" räcker.
    expect(agentForApproval({ approval_type: 'fakturera_projekt' })).toBe('karin')
    expect(agentForApproval({ approval_type: 'create_quote_draft' })).toBe('daniel')
    expect(agentForApproval({ approval_type: 'send_sms' })).toBe('lisa')
    expect(agentForApproval({ approval_type: 'create_booking' })).toBe('lars')
  })
})

test.describe('etiketten', () => {
  test('varje känd typ har en svensk etikett utan tekniska ord', () => {
    for (const [key, label] of Object.entries(TYPE_LABEL)) {
      expect(label.length, `${key} saknar etikett`).toBeGreaterThan(2)
      expect(/[_]/.test(label), `${key} bär en teknisk etikett: ${label}`).toBe(false)
      expect(/\b(agent|webhook|token|payload|trigger|run)\b/i.test(label), `${key}: ${label}`).toBe(false)
    }
  })

  test('okänd typ visar aldrig sitt tekniska namn', () => {
    // "egenkontroll_nytt_falt" i gränssnittet är obegripligt för en hantverkare.
    expect(typeLabel('nagot_tekniskt_namn')).toBe('Förslag')
  })
})

test.describe('ring-uppmaningen — samtalet rakt ur kortet', () => {
  // Andreas fynd 2026-08-10: "Ring kund om offert" gav Godkänn → Bekräfta →
  // ingenting. Servern kan inte ringa; den enda ärliga primärhandlingen är
  // kundens nummer som tel:-knapp.
  const ringkort = {
    approval_type: 'automation',
    title: 'Ring kund om offert',
    description: 'Offerten har varit obesvarad i 10+ dagar. Vill du ringa kunden?',
    payload: { customer_phone: '070-123 45 67', customer_name: 'Eva Lindqvist' },
  }

  test('med nummer och ring-ord blir det en tel-knapp med förnamnet', () => {
    const ring = ringUppmaning(ringkort)
    expect(ring?.label).toBe('Ring Eva')
    // tel-länken saneras — mellanslag och bindestreck ur numret, + behålls.
    expect(ring?.href).toBe('tel:0701234567')
    expect(ringUppmaning({ ...ringkort, payload: { ...ringkort.payload, customer_phone: '+46701234567' } })?.href)
      .toBe('tel:+46701234567')
  })

  test('utan nummer finns ingen knapp — aldrig en trasig tel-länk', () => {
    expect(ringUppmaning({ ...ringkort, payload: { customer_name: 'Eva' } })).toBeNull()
    expect(ringUppmaning({ ...ringkort, payload: { customer_phone: '   ' } })).toBeNull()
  })

  test('ordgränsen friar fakturering och beställning', () => {
    for (const titel of ['Fakturering klar', 'Ny beställning inkommen', 'Påminnelse skickad']) {
      expect(ringUppmaning({ ...ringkort, title: titel, description: null }), `"${titel}" fick en ringknapp`).toBeNull()
    }
  })

  test('utan namn heter knappen Ring kunden', () => {
    expect(ringUppmaning({ ...ringkort, payload: { customer_phone: '0701234567' } })?.label).toBe('Ring kunden')
  })
})

test.describe('djuplänken', () => {
  test('leder till rätt sida när id:t finns', () => {
    expect(deepLinkFor({ approval_type: 'invoice_reminder', payload: { invoice_id: 'inv_1' } })?.href)
      .toContain('/dashboard/invoices/inv_1')
  })

  test('utan id blir det ingen länk — aldrig en trasig', () => {
    expect(deepLinkFor({ approval_type: 'invoice_reminder', payload: {} })).toBeNull()
    expect(deepLinkFor({ approval_type: 'create_quote_draft', payload: {} })).toBeNull()
    expect(deepLinkFor({ approval_type: 'fakturera_projekt', payload: {} })).toBeNull()
  })

  test('fakturera_projekt länkar till projektet — där underlaget kan ändras', () => {
    const länk = deepLinkFor({ approval_type: 'fakturera_projekt', payload: { project_id: 'p1' } })
    expect(länk?.href).toBe('/dashboard/projects/p1')
    expect(länk?.label).toBe('Läs & ändra →')
  })
})
