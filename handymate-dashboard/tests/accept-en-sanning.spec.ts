import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { standardDatabase } from './helpers/job-standard-db'
import { OPEN_QUOTE_STATUSES, WON_QUOTE_STATUSES } from '../lib/quotes/statuses'
import { acceptanceOriginDate, acceptanceOriginLabel } from '../lib/quotes/lifecycle'
import * as dokumentHtml from '../lib/document-html'
import * as mejlMallar from '../lib/email-templates'

/**
 * EN SANNING FÖR "OFFERT ACCEPTERAD" (2026-09-18).
 *
 * Tre vägar sätter `quotes.status='accepted'` — kundens signering, portalens
 * knapp och hantverkarens egen registrering. Före det här passet hade var och
 * en sin EGEN uppsättning eftersteg, och de hade redan drivit isär:
 *  · `handleProjectEvent` saknades helt i kundportalen
 *  · den interna vägen fyrade `quote_accepted`, de två andra `quote_signed`
 *  · den interna vägens bekräftelse-SMS påstod en signatur som aldrig fanns
 *  · den interna vägen skrev `accepted_manually` — en kolumn som ALDRIG
 *    funnits i prod — och föll ned i en reservgren som tappade `accepted_at`
 *
 * Facit nedan kör den VERKLIGA finalizern mot en riktig PostgreSQL med
 * journalens riktiga trigger och plpgsql-funktioner. Inget är hånat bort utom
 * de yttre effekterna, som räknas i stället för att skickas.
 */

const JOURNAL_SQL = readFileSync('sql/v2_quote_acceptance_completion.sql', 'utf8')
const JOURNAL_STEG_SQL = readFileSync('sql/v264_acceptance_journal_alla_steg.sql', 'utf8')

/** Varje eftersteg finalizern journalför. Namnen är journalens kolumnprefix. */
const ALLA_STEG = ['margin', 'project', 'deal', 'project_event', 'communication', 'notify', 'events', 'autopilot', 'email'] as const

async function riggen(options: { utanJournal?: boolean } = {}) {
  const database = await standardDatabase()
  // Journalens SQL återkallar rättigheter från anon/authenticated — rollerna
  // måste finnas för att filen ska kunna köras precis som i prod.
  await database.pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;`)
  await database.pg.exec(`
    CREATE TABLE quotes (quote_id text PRIMARY KEY, business_id text NOT NULL, status text,
      quote_number text, title text, total numeric, customer_id text, lead_id text,
      accepted_at timestamptz, accepted_via text, accepted_by text,
      signed_at timestamptz, signed_by_name text, expected_margin_snapshot jsonb);
    CREATE TABLE customer (customer_id text PRIMARY KEY, business_id text, name text,
      phone_number text, email text, portal_token text, portal_enabled boolean);
    CREATE TABLE customer_activity (activity_id text, business_id text, customer_id text,
      activity_type text, title text, description text, created_by text);
    CREATE TABLE pipeline_stage (id text PRIMARY KEY, business_id text, is_won boolean);
    ALTER TABLE deal ADD COLUMN quote_id text; ALTER TABLE deal ADD COLUMN stage_id text;
    INSERT INTO pipeline_stage VALUES ('won-1', 'a', true);
    INSERT INTO quotes (quote_id, business_id, status, quote_number, title, total, customer_id)
      VALUES ('q', 'a', 'sent', 'OF-1', 'Badrum', 42000, 'c');
    INSERT INTO customer VALUES ('c', 'a', 'Eva Kund', '0701234567', NULL, 'tok', true);
    INSERT INTO deal (id, business_id, quote_id) VALUES ('d1', 'a', 'q');
  `)
  if (!options.utanJournal) {
    await database.pg.exec(JOURNAL_SQL)
    await database.pg.exec(JOURNAL_STEG_SQL)
  }

  const effekter: string[] = []
  const utskick: { kanal: string; text: string }[] = []
  const events: string[] = []
  const mocks: Record<string, any> = {
    'next/server': { NextResponse },
    '@/lib/supabase': { getServerSupabase: () => database.db },
    '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'a' }) },
    '@/lib/permissions': {
      getCurrentUser: async () => ({ role: 'owner', name: 'Anna Snickare', email: 'anna@firman.se' }),
      hasPermission: () => true,
    },
    '@/lib/quotes/statuses': { OPEN_QUOTE_STATUSES, WON_QUOTE_STATUSES },
    '@/lib/quotes/margin-snapshot': { captureExpectedMarginSnapshot: async () => { effekter.push('margin') } },
    '@/lib/projects/create-from-quote': { createProjectFromQuote: async () => { effekter.push('project'); return { success: true, project_id: 'p1' } } },
    '@/lib/pipeline': { moveDeal: async () => { effekter.push('deal'); await database.pg.query("UPDATE deal SET stage_id='won-1'") } },
    '@/lib/project-ai-engine': { handleProjectEvent: async () => { effekter.push('project_event') } },
    '@/lib/smart-communication': { triggerEventCommunication: async (p: any) => { effekter.push('communication'); events.push(`kommunikation:${p.event}`) } },
    '@/lib/notifications': { notifyQuoteSigned: async () => { effekter.push('notify') } },
    '@/lib/notifications/approval-push': { sendApprovalPush: async () => { effekter.push('push') } },
    '@/lib/automation-engine': { fireEvent: async (_db: unknown, namn: string) => { effekter.push('events'); events.push(namn) } },
    '@/lib/autopilot/trigger': { triggerAutopilot: async () => { effekter.push('autopilot') } },
    '@/lib/quote-confirmation-email': {
      sendQuoteSignedConfirmation: async (_b: string, _q: string, source: string) => {
        effekter.push('email')
        utskick.push({ kanal: 'bekräftelse', text: source })
        return { success: true }
      },
    },
    '@/lib/demo/demo-quote': { arDemoOffertForetag: () => false },
  }

  const ladda = (fil: string) => {
    const code = ts.transpileModule(readFileSync(fil, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const api: any = {}
    new Function('require', 'exports', code)((id: string) => {
      if (id === '@/lib/quotes/finalize-accepted') return ladda('lib/quotes/finalize-accepted.ts')
      if (!(id in mocks)) throw Error(`Oväntat beroende: ${id}`)
      return mocks[id]
    }, api)
    return api
  }

  const finalizer = ladda('lib/quotes/finalize-accepted.ts')
  const acceptRutt = ladda('app/api/quotes/accept/route.ts')
  const portalRutt = ladda('app/api/portal/route.ts')

  return {
    ...database, effekter, utskick, events,
    finalisera: (input: any) => finalizer.finalizeAcceptedQuote(database.db, input),
    internAccept: () => acceptRutt.POST(new NextRequest('https://test/api/quotes/accept', {
      method: 'POST', body: JSON.stringify({ quoteId: 'q' }),
    })),
    portalAccept: () => portalRutt.POST(new NextRequest('https://test/api/portal', {
      method: 'POST', body: JSON.stringify({ token: 'tok', action: 'accept_quote', quote_id: 'q' }),
    })),
    journal: async () => (await database.pg.query('SELECT * FROM quote_acceptance_completion')).rows as any[],
    accepteradOffert: async () => (await database.pg.query('SELECT status, accepted_via, accepted_by, accepted_at FROM quotes WHERE quote_id=$1', ['q'])).rows[0] as any,
  }
}

/** Tar en accept in i status utan att gå via en rutt (för finalizern ensam). */
async function flippa(h: Awaited<ReturnType<typeof riggen>>, via: string, av: string | null = null) {
  await h.pg.query("UPDATE quotes SET status='accepted', accepted_at=now(), accepted_via=$1, accepted_by=$2 WHERE quote_id='q'", [via, av])
}

test.describe('alla tre vägar kör exakt samma eftersteg', () => {
  for (const source of ['signering', 'kundportal', 'internt']) {
    test(`${source}: varje steg körs och får en kvittens i journalen`, async () => {
      const h = await riggen()
      try {
        await flippa(h, source === 'signering' ? 'signering' : source === 'kundportal' ? 'kundportal' : 'internt')
        await h.finalisera({ businessId: 'a', quoteId: 'q', source })
        for (const steg of ALLA_STEG) {
          expect(h.effekter, `${source}: steget ${steg} kördes inte`).toContain(steg)
        }
        const rad = (await h.journal())[0]
        expect(rad, 'journalraden saknas').toBeTruthy()
        for (const steg of ALLA_STEG) {
          expect(rad[`${steg}_state`], `${source}: ${steg} saknar kvittens`).toBe('done')
        }
      } finally { await h.close() }
    })
  }

  test('de tre vägarna kör IDENTISK uppsättning steg', async () => {
    const körningar: string[][] = []
    for (const source of ['signering', 'kundportal', 'internt']) {
      const h = await riggen()
      try {
        await flippa(h, source)
        await h.finalisera({ businessId: 'a', quoteId: 'q', source })
        // Uppsättningen steg, inte antalet anrop: signeringen fyrar två event
        // (quote_accepted + quote_signed) inom ETT journalfört steg, och
        // push-notisen om en signatur finns bara där en signatur finns.
        körningar.push(Array.from(new Set(h.effekter.filter(e => e !== "push"))).sort())
      } finally { await h.close() }
    }
    expect(körningar[1], 'kundportalen kör inte samma steg som signeringen').toEqual(körningar[0])
    expect(körningar[2], 'den interna vägen kör inte samma steg som signeringen').toEqual(körningar[0])
  })

  test('kundportalen kör projekt-AI:n — den saknades helt före 2026-09-18', async () => {
    const h = await riggen()
    try {
      expect((await h.portalAccept()).status).toBe(200)
      expect(h.effekter, 'handleProjectEvent kördes inte i portalvägen').toContain('project_event')
      expect((await h.journal())[0].project_event_state).toBe('done')
    } finally { await h.close() }
  })
})

test.describe('journalen är grinden', () => {
  test('en accept utan journalrad ger INGA sidoeffekter', async () => {
    // Journalen FINNS — funktionerna, triggern, allt. Raden är borta. Det är
    // det verkliga felläget: `claim_quote_acceptance_step` kastar
    // `acceptance_journal_missing` och varje steg avbryts vid claim.
    const h = await riggen()
    try {
      await flippa(h, 'internt')
      await h.pg.query('DELETE FROM quote_acceptance_completion')
      await h.finalisera({ businessId: 'a', quoteId: 'q', source: 'internt' })
      expect(h.effekter, 'ett steg körde utan journalrad — halv accept är möjlig igen').toEqual([])
      expect(h.utskick).toEqual([])
      expect(await h.journal(), 'finalizern skapade en journalrad den inte äger').toEqual([])
    } finally { await h.close() }
  })

  test('en accept utan migrationen ger INGA sidoeffekter', async () => {
    const h = await riggen({ utanJournal: true })
    try {
      await h.pg.query("UPDATE quotes SET status='accepted', accepted_via='internt' WHERE quote_id='q'")
      await h.finalisera({ businessId: 'a', quoteId: 'q', source: 'internt' })
      expect(h.effekter, 'ett steg körde utan journal — halv accept är möjlig igen').toEqual([])
      expect(h.utskick).toEqual([])
    } finally { await h.close() }
  })

  test('dubbelanrop ger ETT projekt, EN bekräftelse och EN affärsflytt', async () => {
    const h = await riggen()
    try {
      await flippa(h, 'kundportal')
      await h.finalisera({ businessId: 'a', quoteId: 'q', source: 'kundportal' })
      await h.finalisera({ businessId: 'a', quoteId: 'q', source: 'kundportal' })
      expect(h.effekter.filter(e => e === 'project')).toHaveLength(1)
      expect(h.effekter.filter(e => e === 'email')).toHaveLength(1)
      expect(h.effekter.filter(e => e === 'deal')).toHaveLength(1)
      expect(h.utskick).toHaveLength(1)
    } finally { await h.close() }
  })

  test('återhämtningen spelar bara upp projekt och affär — aldrig ett nytt utskick', async () => {
    const h = await riggen()
    try {
      await flippa(h, 'internt')
      await h.finalisera({ businessId: 'a', quoteId: 'q', source: 'internt', recoveryOnly: true })
      expect(h.effekter.sort()).toEqual(['deal', 'project'])
      const rad = (await h.journal())[0]
      expect(rad.email_state, 'återhämtningen skickade en bekräftelse').toBe('pending')
      expect(rad.events_state, 'återhämtningen fyrade om automationens event').toBe('pending')
    } finally { await h.close() }
  })
})

test.describe('provenance — vem registrerade accepten', () => {
  test('intern accept skriver internt + användaren + accepted_at', async () => {
    const h = await riggen()
    try {
      expect((await h.internAccept()).status).toBe(200)
      const q = await h.accepteradOffert()
      expect(q).toMatchObject({ status: 'accepted', accepted_via: 'internt', accepted_by: 'Anna Snickare' })
      expect(q.accepted_at).not.toBeNull()
    } finally { await h.close() }
  })

  test('portal-accept skriver kundportal och ALDRIG en användare', async () => {
    const h = await riggen()
    try {
      expect((await h.portalAccept()).status).toBe(200)
      const q = await h.accepteradOffert()
      expect(q).toMatchObject({ status: 'accepted', accepted_via: 'kundportal' })
      expect(q.accepted_by, 'portalens accept tillskrevs en hantverkare').toBeNull()
    } finally { await h.close() }
  })

  test('signeringsvägen skriver signering i sin egen rutt', () => {
    const src = readFileSync('app/api/quotes/public/[token]/route.ts', 'utf8')
    expect(src).toContain("accepted_via: 'signering'")
  })

  test('databasen accepterar bara de tre orden', async () => {
    const h = await riggen()
    try {
      await h.pg.exec(`ALTER TABLE quotes ADD CONSTRAINT quotes_accepted_via_check
        CHECK (accepted_via IS NULL OR accepted_via IN ('signering','kundportal','internt'));`)
      await expect(h.pg.query("UPDATE quotes SET accepted_via='manuellt' WHERE quote_id='q'")).rejects.toThrow()
    } finally { await h.close() }
  })

  test('accepted_manually återinförs inte — accepted_via ersätter idén', () => {
    for (const f of ['app/api/quotes/accept/route.ts', 'app/api/portal/route.ts', 'app/api/quotes/public/[token]/route.ts']) {
      expect(readFileSync(f, 'utf8'), `${f} skriver accepted_manually`).not.toMatch(/accepted_manually\s*[:=]/)
    }
  })
})

/**
 * Bekräftelsemodulen körs på riktigt: ETT utskick per accept, mejl när kunden
 * har adress och SMS annars, med källmedveten text. Källskanningarna längre
 * ned låser formuleringarna; det här kör dem.
 */
async function bekraftelseRiggen(kund: { email?: string | null; phone_number?: string | null }) {
  const mejl: any[] = []
  const sms: any[] = []
  const rader: Record<string, any> = {
    v3_automation_settings: { quote_signed_email_enabled: true },
    quotes: { quote_id: 'q', quote_number: 'OF-1', title: 'Badrum', total: 42000, status: 'accepted', customer_id: 'c' },
    customer: { name: 'Eva Kund', email: null, phone_number: null, portal_token: 'tok', portal_enabled: true, ...kund },
    project: null,
  }
  const db: any = { from: (tabell: string) => {
    const q: any = {
      select: () => q, eq: () => q, maybeSingle: async () => ({ data: rader[tabell] ?? null, error: null }),
      single: async () => ({ data: rader[tabell] ?? null, error: null }),
      insert: async () => ({ error: null }),
    }
    return q
  } }
  const mocks: Record<string, any> = {
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/email': { sendEmail: async (p: any) => { mejl.push(p); return { success: true } } },
    '@/lib/sms-send': { sendSmsViaElks: async (p: any) => { sms.push(p); return { success: true } } },
    '@/lib/branding/get-branding': { loadBranding: async () => ({ businessName: 'Firman', accentColor: '#0F766E', fSkattRegistered: true, attribution: {} }) },
    '@/lib/document-html': dokumentHtml,
    '@/lib/email-templates': mejlMallar,
  }
  const code = ts.transpileModule(readFileSync('lib/quote-confirmation-email.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const api: any = {}
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in mocks)) throw Error(`Oväntat beroende: ${id}`)
    return mocks[id]
  }, api)
  return { skicka: (source: string) => api.sendQuoteSignedConfirmation('a', 'q', source), mejl, sms }
}

test.describe('bekräftelsen går ut EN gång, i rätt kanal', () => {
  for (const source of ['signering', 'kundportal', 'internt']) {
    test(`${source}: kund med e-post får ETT mejl och inget SMS`, async () => {
      const h = await bekraftelseRiggen({ email: 'eva@example.se', phone_number: '0701234567' })
      expect(await h.skicka(source)).toMatchObject({ success: true })
      expect(h.mejl).toHaveLength(1)
      expect(h.sms, 'kunden fick både mejl och SMS för samma accept').toHaveLength(0)
    })

    test(`${source}: kund utan e-post får ETT SMS och inget mejl`, async () => {
      const h = await bekraftelseRiggen({ email: null, phone_number: '0701234567' })
      expect(await h.skicka(source)).toMatchObject({ success: true })
      expect(h.sms).toHaveLength(1)
      expect(h.mejl).toHaveLength(0)
      expect(h.sms[0].to).toBe('0701234567')
    })
  }

  test('kund utan både e-post och telefon: inget utskick, men inget fel', async () => {
    const h = await bekraftelseRiggen({ email: null, phone_number: null })
    expect(await h.skicka('internt')).toMatchObject({ success: true, skipped: true })
    expect(h.mejl).toHaveLength(0)
    expect(h.sms).toHaveLength(0)
  })

  test('varken mejl eller SMS påstår en signatur för portal eller internt', async () => {
    for (const source of ['kundportal', 'internt']) {
      const post = await bekraftelseRiggen({ email: 'eva@example.se' })
      expect(await post.skicka(source)).toMatchObject({ success: true })
      expect(`${post.mejl[0].subject} ${post.mejl[0].html}`, `${source}: mejlet påstår en signatur`)
        .not.toMatch(/signatur|signerad/i)

      const telefon = await bekraftelseRiggen({ email: null, phone_number: '0701234567' })
      expect(await telefon.skicka(source)).toMatchObject({ success: true })
      expect(telefon.sms[0].message, `${source}: SMS:et påstår en signatur`).not.toMatch(/signatur|signerad/i)
    }
  })

  test('signeringsvägen får — och bara den — tala om signaturen', async () => {
    const post = await bekraftelseRiggen({ email: 'eva@example.se' })
    await post.skicka('signering')
    expect(post.mejl[0].html).toMatch(/signerad/i)
    const telefon = await bekraftelseRiggen({ email: null, phone_number: '0701234567' })
    await telefon.skicka('signering')
    expect(telefon.sms[0].message).toMatch(/signatur/i)
  })
})

test.describe('bekräftelsen påstår aldrig en signatur som inte finns', () => {
  const src = readFileSync('lib/quote-confirmation-email.ts', 'utf8')

  test('bara signeringsvägens text nämner en signatur', () => {
    const block = src.slice(src.indexOf('BEKRAFTELSENS_ORD'), src.indexOf('export async function sendQuoteSignedConfirmation'))
    const portal = block.slice(block.indexOf('kundportal:'), block.indexOf('internt:'))
    const internt = block.slice(block.indexOf('internt:'))
    expect(block.slice(block.indexOf('signering:'), block.indexOf('kundportal:'))).toMatch(/signatur|signerad/)
    expect(portal, 'portaltexten påstår en signatur').not.toMatch(/signatur|signerad/)
    expect(internt, 'den interna textens påstår en signatur').not.toMatch(/signatur|signerad/)
  })

  test('den gamla SMS-lögnen finns inte kvar någonstans', () => {
    for (const f of ['app/api/quotes/accept/route.ts', 'lib/quote-confirmation-email.ts', 'lib/quotes/finalize-accepted.ts']) {
      // Bara i kod och texter — historiken får nämna lögnen i en kommentar.
      const utanKommentarer = readFileSync(f, 'utf8').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')
      expect(utanKommentarer, f).not.toContain('mottagit din signatur')
    }
  })

  test('utskicket går genom strypunkten och läser kvittensen', () => {
    expect(src).toContain('sendSmsViaElks({')
    expect(src).toMatch(/r\.success \?/)
    expect(src, 'mejlet går inte genom e-postkärnan').toContain('await sendEmail({')
  })

  test('finalizern skickar med källan till bekräftelsen', () => {
    expect(readFileSync('lib/quotes/finalize-accepted.ts', 'utf8'))
      .toContain('sendQuoteSignedConfirmation(input.businessId, input.quoteId, input.source)')
  })
})

test.describe('eventen', () => {
  test('quote_accepted fyras på ALLA tre vägar', async () => {
    for (const source of ['signering', 'kundportal', 'internt']) {
      const h = await riggen()
      try {
        await flippa(h, source)
        await h.finalisera({ businessId: 'a', quoteId: 'q', source })
        expect(h.events, `${source} fyrade inte quote_accepted`).toContain('quote_accepted')
      } finally { await h.close() }
    }
  })

  test('quote_signed fyras BARA där en signatur finns', async () => {
    for (const source of ['signering', 'kundportal', 'internt']) {
      const h = await riggen()
      try {
        await flippa(h, source)
        await h.finalisera({ businessId: 'a', quoteId: 'q', source })
        if (source === 'signering') expect(h.events).toContain('quote_signed')
        else expect(h.events, `${source} påstod en signatur i automationsmotorn`).not.toContain('quote_signed')
      } finally { await h.close() }
    }
  })

  test('kommunikationens event är källmedvetet', async () => {
    for (const [source, väntat] of [['signering', 'quote_signed'], ['kundportal', 'quote_accepted'], ['internt', 'quote_accepted']]) {
      const h = await riggen()
      try {
        await flippa(h, source)
        await h.finalisera({ businessId: 'a', quoteId: 'q', source })
        expect(h.events, `${source}: fel kommunikationsevent`).toContain(`kommunikation:${väntat}`)
      } finally { await h.close() }
    }
  })
})

test.describe('rutterna äger bara auth och statusflippen', () => {
  const RUTTER = [
    'app/api/quotes/accept/route.ts',
    'app/api/portal/route.ts',
    'app/api/quotes/public/[token]/route.ts',
  ]
  // Efterstegen får inte ligga kvar som inline-kopior i någon rutt. Exakt det
  // mönstret lät vägarna drifta isär i första taget.
  const FORBJUDET = [
    'captureExpectedMarginSnapshot',
    'notifyQuoteSigned',
    'triggerAutopilot',
    'handleProjectEvent',
    'createProjectFromQuote',
    'moveDeal',
  ]

  for (const rutt of RUTTER) {
    test(`${rutt} har inga inline-kopior av efterstegen`, () => {
      const src = readFileSync(rutt, 'utf8')
      for (const namn of FORBJUDET) {
        expect(src, `${rutt} har kvar en egen kopia av ${namn}`).not.toContain(namn)
      }
      expect(src, `${rutt} anropar inte finalizern`).toContain('finalizeAcceptedQuote(supabase, {')
    })
  }

  test('varje rutt skickar sin egen källa', () => {
    expect(readFileSync(RUTTER[0], 'utf8')).toContain("source: 'internt'")
    expect(readFileSync(RUTTER[1], 'utf8')).toContain("source: 'kundportal'")
    expect(readFileSync(RUTTER[2], 'utf8')).toContain("source: 'signering'")
  })

  test('ingen rutt fyrar egna offertevent längre', () => {
    for (const rutt of [RUTTER[0], RUTTER[2]]) {
      const src = readFileSync(rutt, 'utf8')
      expect(src, `${rutt} fyrar fortfarande egna quote-event`).not.toMatch(/fireEvent\([^,]+,\s*'quote_(signed|accepted)'/)
    }
  })
})


test.describe('gränssnittet redovisar ursprunget', () => {
  test('en intern accept tillskrivs hantverkaren, inte kunden', () => {
    const etikett = acceptanceOriginLabel({ accepted_at: '2026-09-18T10:00:00Z', accepted_via: 'internt', accepted_by: 'Anna Snickare' })
    expect(etikett).toBe('Registrerad som accepterad av Anna Snickare')
    expect(etikett).not.toMatch(/signerad/i)
  })

  test('portalens accept påstår ingen signatur', () => {
    const etikett = acceptanceOriginLabel({ accepted_at: '2026-09-18T10:00:00Z', accepted_via: 'kundportal' })
    expect(etikett).toBe('Accepterad av kunden i kundportalen')
    expect(etikett).not.toMatch(/signerad/i)
  })

  test('signeringen säger signerad av kunden, med signatären', () => {
    expect(acceptanceOriginLabel({ signed_at: '2026-09-18T10:00:00Z', signed_by_name: 'Eva Kund', accepted_via: 'signering' }))
      .toBe('Signerad av kunden (Eva Kund)')
  })

  test('en offert utan markör påstår ingenting om vem', () => {
    expect(acceptanceOriginLabel({ accepted_at: '2026-01-01T00:00:00Z' })).toBe('Accepterad')
    expect(acceptanceOriginLabel({})).toBeNull()
  })

  test('datumet följer den väg etiketten beskriver', () => {
    expect(acceptanceOriginDate({ accepted_via: 'internt', accepted_at: 'A', signed_at: 'B' })).toBe('A')
    expect(acceptanceOriginDate({ accepted_via: 'signering', accepted_at: 'A', signed_at: 'B' })).toBe('B')
  })

  test('båda vyerna läser samma etikett — ingen egen formulering', () => {
    for (const f of [
      'app/dashboard/quotes/[id]/components/QuoteStatusTimeline.tsx',
      'components/pipeline/DealTimeline.tsx',
    ]) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${f} bygger egen text i stället för att använda lifecycle`).toContain('acceptanceOriginLabel')
      expect(src, `${f} har kvar den gamla lögnen`).not.toContain('Offert signerad av kund')
    }
  })
})
