import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Facit för bulkarbetet i Revenue OS (Andreas 2026-09-17: "man borde kunna
// bulktilldela leads … sen behöver vi också kunna på ett enkelt sätt rensa i
// vår leadskatalog, exempelvis de som ligger där just nu vill jag inte ens ha
// inne").
//
// En knapp som raderar många rader eller delar ut många leads måste tåla att
// missbrukas av misstag. Testerna håller fem saker:
//  1. rensningen är avgränsad — fyra hinder som aldrig raderas,
//  2. bulktilldelningen skriver INTE ett generiskt underlag,
//  3. båda är säljledaråtgärder med tak och idempotens,
//  4. rutten lägger bulkvägarna före enstycksvägen och skickar avtalsversionen,
//  5. ytan markerar bara det som syns, frågar före radering och redovisar
//     varje företag den INTE rörde.

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
/** Bort med kommentarer — annars räknas ett exempel i filhuvudet som kod. */
const utanKommentarer = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--[^\n]*$/gm, '')

const HINDER = ['partnerlead', 'kontaktsparr', 'historik', 'kontaktperson']

test.describe('v257 — rensningen av de orörda Platsbanken-importerna', () => {
  const sql = read('sql/v257_rensa_leadskatalogen.sql')
  const kod = utanKommentarer(sql)

  test('raderingen är avgränsad på alla fyra villkoren', () => {
    const del = kod.slice(kod.indexOf('DELETE FROM public.revenue_accounts'))
    expect(del).toContain("a.source = 'Platsbanken'")
    expect(del).toContain("a.status = 'identified'")
    expect(del).toContain("a.contact_state = 'active'")
    expect(del).toContain('revenue_partner_leads l WHERE l.account_id = a.id')
    expect(del).toContain('revenue_activities v WHERE v.account_id = a.id')
    expect(del).toContain('revenue_contacts c WHERE c.account_id = a.id')
  })

  test('ingen radering utan WHERE, ingen TRUNCATE, ingen DROP', () => {
    const satser = kod.match(/\b(DELETE FROM|TRUNCATE|DROP)\b[^;]*/gi) || []
    expect(satser.length).toBe(1)
    expect(String(satser[0]).toUpperCase()).toContain('WHERE')
    expect(kod.toUpperCase()).not.toContain('TRUNCATE')
    expect(kod.toUpperCase()).not.toContain('DROP TABLE')
  })

  test('filen räknar före och efter — en radering utan verifiering är ett rykte', () => {
    expect(kod).toContain('konton_fore')
    expect(kod).toContain('konton_efter')
  })
})

test.describe('v258 — rensa flera ur katalogen', () => {
  const sql = read('sql/v258_revenue_rensa_och_bulktilldela.sql')
  const fn = sql.slice(
    sql.indexOf('create or replace function public.revenue_discard_accounts'),
    sql.indexOf('create or replace function public.revenue_assign_partner_bulk'),
  )

  test('fyra hinder, och ingen av dem raderas', () => {
    for (const h of HINDER) expect(fn, `hindret ${h} saknas`).toContain(`'${h}'`)
    // Bara raderna UTAN hinder raderas. Skulle villkoret bli sant för alla
    // hade knappen tagit partnerhistorik och kontaktspärrar med sig.
    expect(fn).toContain('where id in (select id from valda where hinder is null)')
  })

  test('kontaktspärren avgörs på contact_state, inte på en gissning', () => {
    expect(fn).toContain("a.contact_state <> 'active' then 'kontaktsparr'")
  })

  test('säljledargrind, tak och idempotens', () => {
    expect(fn).toContain('if not p_manager then')
    expect(fn).toMatch(/array_length\(p_ids,1\) > 200/)
    expect(fn).toContain('from public.revenue_commands where request_id=p_request')
    expect(fn).toContain("prior.command<>'discard'")
    // Det som behölls rapporteras tillbaka — en tyst bulk döljer halva svaret.
    expect(fn).toContain("'behallna'")
    expect(fn).toContain("'borttagna'")
  })

  test('security invoker och bara service_role', () => {
    expect(fn).toContain('security invoker')
    expect(fn).not.toContain('security definer')
    expect(sql).toContain('revoke all on function public.revenue_discard_accounts(uuid,text,boolean,uuid,uuid[]) from public,anon,authenticated')
    expect(sql).toContain('grant execute on function public.revenue_discard_accounts(uuid,text,boolean,uuid,uuid[]) to service_role')
  })
})

test.describe('v258 — bulktilldelning av partnerleads', () => {
  const sql = read('sql/v258_revenue_rensa_och_bulktilldela.sql')
  const fn = sql.slice(sql.indexOf('create or replace function public.revenue_assign_partner_bulk'))

  test('underlaget byggs ur företagets EGEN research, aldrig ur en mall', () => {
    const underlag = fn.slice(fn.indexOf('underlag := concat_ws'), fn.indexOf('begin\n      perform'))
    for (const falt of ['a.why_now', 'a.pain_hypothesis', 'a.personalization_hook', 'a.recommended_cta']) {
      expect(underlag, `${falt} saknas i underlaget`).toContain(falt)
    }
    // Ingen literal text i underlaget — då hade alla partners fått samma ord.
    expect(underlag).not.toMatch(/'[A-ZÅÄÖa-zåäö][^']{12,}'/)
    // Saknas researchen får företaget inget underlag alls.
    expect(fn).toContain("hinder := 'ingen_research'")
  })

  test('kontakten måste vara nåbar — samma krav som enstycksvägen', () => {
    expect(fn).toContain("nullif(c.email,'') is not null or nullif(c.phone,'') is not null")
    expect(fn).toContain("hinder := 'ingen_kontakt'")
  })

  test('tilldelningen delegeras — ingen andra väg in i revenue_partner_leads', () => {
    expect(fn).toContain('perform public.revenue_partner_lead_command(')
    // Bulken får inte skriva raden själv.
    expect(fn).not.toMatch(/insert into public\.revenue_partner_leads/i)
  })

  test('ett nekat företag tar inte med sig de andra, och skälet sväljs inte', () => {
    expect(fn).toContain('exception when others then')
    expect(fn).toContain('SQLERRM')
    expect(fn).toContain("'hinder', 'nekades'")
  })

  test('egen begäran per företag — en delvis lyckad bulk kan köras om', () => {
    expect(fn).toContain("md5(p_request::text || ':' || konto::text)::uuid")
  })

  test('partnern måste vara aktiv med gällande avtal, och taket är 50', () => {
    expect(fn).toContain("where id=p_partner and status='active' and agreement_version=p_agreement")
    expect(fn).toMatch(/array_length\(p_ids,1\) > 50/)
    expect(fn).toContain('if not p_manager then')
  })
})

test.describe('Rutten — bulkvägarna', () => {
  const src = read('app/api/admin/revenue/route.ts')

  test('bulkgrenarna ligger FÖRE enstycksvägens account_id', () => {
    const iDiscard = src.indexOf("if (type === 'discard')")
    const iBulk = src.indexOf("if (type === 'assign_bulk')")
    const iEnstyck = src.indexOf('const accountId = id(body.account_id)')
    expect(iDiscard).toBeGreaterThan(-1)
    expect(iBulk).toBeGreaterThan(-1)
    // Annars hade de fallit på att det inte finns något account_id i bodyn.
    expect(iDiscard).toBeLessThan(iEnstyck)
    expect(iBulk).toBeLessThan(iEnstyck)
  })

  test('båda kräver säljledare och skickar med begärans id', () => {
    for (const gren of ['discard', 'assign_bulk']) {
      // Grenens EGET block: fram till dess egen return. Slutade blocket
      // längre bort spändes det över båda grenarna, och då räckte den ena
      // grindens existens för att dölja att den andra tagits bort.
      const start = src.indexOf(`if (type === '${gren}')`)
      expect(start, `grenen ${gren} saknas`).toBeGreaterThan(-1)
      const slut = src.indexOf('return NextResponse.json(data)', start)
      expect(slut, `grenen ${gren} returnerar inget svar`).toBeGreaterThan(-1)
      const block = src.slice(start, slut)
      // Bara grenens egen rubrik får förekomma; en andra betyder att
      // blocket spänner över nästa gren och lånar dess grind.
      expect(
        (block.match(/if \(type === '/g) || []).length,
        `${gren} spänner över mer än sin egen gren`,
      ).toBe(1)
      expect(block, `${gren} saknar säljledargrind`).toContain('if (!ctx.manager)')
      expect(block, `${gren} skickar inte p_manager: true`).toContain('p_manager: true')
      expect(block, `${gren} skickar inte begärans id`).toContain('p_request: requestId')
    }
  })

  test('id-listan valideras som uuid och har tak', () => {
    expect(src).toContain('ids(body.ids, 200)')
    expect(src).toContain('ids(body.ids, 50)')
    const fn = src.slice(src.indexOf('function ids('), src.indexOf('function date('))
    expect(fn).toContain('id(v)')
    // Dubbletter i listan ska inte räknas två gånger mot taket.
    expect(fn).toContain('new Set(')
  })

  test('bulktilldelningen skickar gällande avtalsversion', () => {
    expect(src).toContain('p_agreement: AGREEMENT_VERSION')
    expect(src).toContain("from '@/lib/partners/agreement'")
  })

  test('partnerlistan erbjuder bara partners som RPC:n också accepterar', () => {
    const block = src.slice(src.indexOf("let partners:"), src.indexOf('return NextResponse.json(\n      {\n        ...data'))
    expect(block).toContain("from('partners')")
    expect(block).toContain(".eq('status', 'active')")
    expect(block).toContain(".eq('agreement_version', AGREEMENT_VERSION)")
    // Bara säljledare får se den; en säljare fördelar inte leads.
    expect(block).toContain('if (ctx.manager)')
  })
})

test.describe('Ytan — urvalet är det man ser', () => {
  const src = read('app/admin/revenue/page.tsx')

  test('urvalet töms när sidan eller sökningen byts', () => {
    // Leta framåt från tömningen: reload-hooken slutar också på
    // "}, [q, offset])" och ligger tidigare i filen.
    const iTom = src.indexOf('setValda(new Set())')
    expect(iTom, 'urvalet töms aldrig').toBeGreaterThan(-1)
    const effekt = src.slice(iTom, src.indexOf('})', iTom) + 20)
    expect(effekt).toContain('setBulkSvar(null)')
    expect(effekt).toContain('[q, offset]')
  })

  test('"markera sidan" markerar bara de synliga raderna', () => {
    expect(src).toContain('new Set(synliga.map((a) => a.id))')
    // Aldrig hela träffmängden — den ligger inte på skärmen.
    expect(src).not.toContain('new Set(data.accounts.map')
  })

  test('radering frågar först och nämner antalet', () => {
    const fn = src.slice(src.indexOf('async function taBortValda'), src.indexOf('async function tilldelaValda'))
    expect(fn).toContain('window.confirm')
    expect(fn).toMatch(/Ta bort \$\{antal\} företag/)
    expect(fn).toContain('if (!antal) return')
  })

  test('varje företag som inte rördes redovisas med sitt skäl', () => {
    expect(src).toContain('lämnades kvar —')
    expect(src).toContain('hoppades över —')
    for (const h of [...HINDER, 'ingen_kontakt', 'ingen_research', 'redan_tilldelad', 'sparrad', 'ej_oppen']) {
      expect(src, `hindret ${h} saknar svensk text i ytan`).toContain(`${h}:`)
    }
    // Ett okänt hinder får inte bli en tom rad.
    expect(src).toContain('HINDER[rad.hinder] || rad.hinder')
  })

  test('tilldela kräver både urval och vald partner', () => {
    expect(src).toContain('disabled={busy || !valda.size || !bulkPartner}')
    expect(src).toContain('if (!valda.size || !bulkPartner) return')
  })
})
