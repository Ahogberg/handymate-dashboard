/**
 * Facit för Pass B — utgångna kort syns, kortdiet (2026-09-04).
 *
 * Bakgrund: docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt
 * "2. Arbetet försvinner — korten går ut i tysthet" och
 * "4. Teamet pratar för mycket, i för många röster".
 * Plan: tasks/plan-autopilot-B-utgang.md.
 *
 * Källskanning, ingen browser — kommentarer strippas innan mönster söks så
 * en dokumentationskommentar aldrig ger en falsk träff.
 *
 * Körs: npx playwright test tests/autopilot-utgang.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

/** Strippar // och /* *\/ -kommentarer (inte innehållet i strängar/mallsträngar). */
function utanKommentarer(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const maintenance = read('app/api/cron/maintenance/route.ts')
const maintenanceRen = utanKommentarer(maintenance)
const activityRoute = read('app/api/automations/activity/route.ts')
const kortGarUt = fs.existsSync(path.join(ROOT, 'app/api/cron/kort-gar-ut/route.ts'))
  ? read('app/api/cron/kort-gar-ut/route.ts')
  : ''
const kortGarUtRen = utanKommentarer(kortGarUt)
const kortkanal = read('lib/approvals/kortkanal.ts')
const kortkanalRen = utanKommentarer(kortkanal)
const skapaKort = read('lib/approvals/skapa-kort.ts')
const skapaKortRen = utanKommentarer(skapaKort)
const vercelJson = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }

test.describe('Del 1 — maintenance: utgångna kort lämnar spår', () => {
  test('selectar business_id, approval_type och title vid expiry, inte bara id', () => {
    const idx = maintenanceRen.indexOf(".update({ status: 'expired' })")
    expect(idx, 'expire-update-satsen hittades inte').toBeGreaterThan(-1)
    const block = maintenanceRen.slice(idx, idx + 400)
    expect(block).toContain(".select('id, business_id, approval_type, title')")
  })

  test('grupperar per business_id och skriver EN automation_activity-rad per konto', () => {
    expect(maintenanceRen).toMatch(/new Map(<[^>]*>)?\(\)/)
    expect(maintenanceRen).toContain("from('automation_activity')")
    expect(maintenanceRen).toContain("automation_type: 'kort_utgangna'")
    expect(maintenanceRen).toContain("action: 'expired'")
  })

  test('beskrivningen räknar upp titlar (max 3) och "och N till"', () => {
    expect(maintenanceRen).toMatch(/slice\(0,\s*MAX_TITLAR\)/)
    expect(maintenanceRen).toMatch(/och \$\{rest\} till/)
  })

  test('metadata bär approval_ids och approval_types', () => {
    const idx = maintenanceRen.indexOf("automation_type: 'kort_utgangna'")
    const block = maintenanceRen.slice(idx, idx + 600)
    expect(block).toContain('metadata:')
    expect(block).toContain('approval_ids')
    expect(block).toContain('approval_types')
  })

  test('status är ett giltigt värde för automation_activity (inte "auto")', () => {
    // sql/automation_center.sql: CHECK (status IN ('success','failed','skipped'))
    // — 'auto' finns inte i schemat, avvikelse från plan-utkastet (se rapport).
    const idx = maintenanceRen.indexOf("automation_type: 'kort_utgangna'")
    const block = maintenanceRen.slice(idx, idx + 600)
    expect(block).toMatch(/status:\s*'(success|failed|skipped)'/)
    expect(block).not.toMatch(/status:\s*'auto'/)
  })

  test('raden matchar fälten activity-rutten faktiskt läser/filtrerar på', () => {
    // app/api/automations/activity/route.ts läser hela raden (select('*'))
    // och exponerar automation_type/action/description/status/created_at —
    // ingen kolumn i vår insert får sakna motsvarighet där.
    expect(activityRoute).toContain("from('automation_activity')")
    expect(activityRoute).toContain('automation_type')
    expect(activityRoute).toContain('a.action')
    expect(activityRoute).toContain('a.description')
    expect(activityRoute).toContain('a.status')
  })
})

test.describe('Del 4 — team_intro-kort som aldrig stängdes', () => {
  test('maintenance sätter status till approved (inte expired) efter 7 dagar', () => {
    const idx = maintenanceRen.indexOf("approval_type', 'team_intro'")
    expect(idx, 'team_intro-regeln hittades inte i maintenance').toBeGreaterThan(-1)
    const block = maintenanceRen.slice(Math.max(0, idx - 400), idx + 100)
    expect(block).toContain("status: 'approved'")
    expect(block).toContain("resolved_by: 'system'")
    expect(block).not.toMatch(/status:\s*'expired'[\s\S]{0,50}team_intro/)
  })

  test('villkoret filtrerar på pending + created_at äldre än 7 dagar', () => {
    const idx = maintenanceRen.indexOf("approval_type', 'team_intro'")
    const block = maintenanceRen.slice(idx, idx + 300)
    expect(block).toContain("status', 'pending'")
    expect(block).toMatch(/lt\('created_at'/)
    expect(maintenanceRen).toMatch(/7 \* 24 \* 60 \* 60 \* 1000/)
  })

  test('team_intro-regeln körs i ett eget try/catch (kraschar aldrig hela svepet)', () => {
    const idx = maintenanceRen.indexOf("approval_type', 'team_intro'")
    const fore = maintenanceRen.slice(Math.max(0, idx - 600), idx)
    expect(fore).toContain('try {')
  })
})

test.describe('Del 2 — cron/kort-gar-ut', () => {
  test('rutten finns', () => {
    expect(kortGarUt, 'app/api/cron/kort-gar-ut/route.ts saknas').not.toBe('')
  })

  test('verifierar cron-hemligheten', () => {
    expect(kortGarUtRen).toContain("from '@/lib/cron/verify-secret'")
    expect(kortGarUtRen).toContain('verifyCronSecret(request)')
  })

  test('fönstret är 24–48 timmar framåt på pending-kort', () => {
    expect(kortGarUtRen).toContain("eq('status', 'pending')")
    expect(kortGarUtRen).toMatch(/24 \* 3600_?000/)
    expect(kortGarUtRen).toMatch(/48 \* 3600_?000/)
    expect(kortGarUtRen).toMatch(/gte\('expires_at'/)
    expect(kortGarUtRen).toMatch(/lt\('expires_at'/)
  })

  test('EN sendInternalPush per konto (grupperat, inte per kort)', () => {
    expect(kortGarUtRen).toContain("from '@/lib/notifications/push-internal'")
    expect(kortGarUtRen).toContain('sendInternalPush(')
    // Grupperingen sker i en Map per business_id INNAN sändningsloopen.
    const mapIdx = kortGarUtRen.indexOf('new Map')
    const sendIdx = kortGarUtRen.indexOf('sendInternalPush(')
    expect(mapIdx).toBeGreaterThan(-1)
    expect(mapIdx).toBeLessThan(sendIdx)
    // Sändningen ligger i en for-loop över kontona (perKonto), inte i loopen
    // som byggde listan av utgående kort.
    expect(kortGarUtRen).toMatch(/for \(const \[businessId, antal\] of Array\.from\(perKonto\)\)/)
  })

  test('dedupe-nyckeln innehåller "kort_gar_ut", business_id och datum', () => {
    expect(kortGarUtRen).toContain("from '@/lib/notifications/push-dispatch-log'")
    expect(kortGarUtRen).toContain('nyligenSkickad(')
    expect(kortGarUtRen).toContain('bokforPush(')
    expect(kortGarUtRen).toMatch(/`kort_gar_ut:\$\{businessId\}:\$\{datum\}`/)
  })

  test('"ingen mottagare" bokförs inte (samma regel som sendApprovalPush/push-morgon)', () => {
    const idx = kortGarUtRen.indexOf('bokforPush(')
    const fore = kortGarUtRen.slice(0, idx)
    expect(fore).toMatch(/if \(!ingenMottagare\)/)
  })
})

test.describe('Del 2 — vercel.json', () => {
  test('finns exakt en cron-rad för kort-gar-ut', () => {
    const rader = vercelJson.crons.filter(c => c.path === '/api/cron/kort-gar-ut')
    expect(rader).toHaveLength(1)
  })

  test('schemat är en giltig engångs-per-dag-rad (Hobby-plan-säker)', () => {
    const rad = vercelJson.crons.find(c => c.path === '/api/cron/kort-gar-ut')
    expect(rad, 'cron-raden saknas i vercel.json').toBeTruthy()
    expect(rad!.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/)
  })

  test('kolliderar inte med någon befintlig schemarad', () => {
    const scheman = vercelJson.crons.map(c => c.schedule)
    const varSchema = vercelJson.crons.find(c => c.path === '/api/cron/kort-gar-ut')!.schedule
    const kollisioner = scheman.filter(s => s === varSchema)
    expect(kollisioner, `schemat ${varSchema} krockar med en annan rutt`).toHaveLength(1)
  })
})

test.describe('Del 2 — cron-auth-taket och route-auth-inventeringen', () => {
  test('tests/cron-auth.spec.ts räknar med den nya rutten (+1)', () => {
    const cronAuth = read('tests/cron-auth.spec.ts')
    expect(cronAuth).toContain('toHaveLength(46)')
    expect(cronAuth).toContain('toHaveLength(45)')
  })

  test('facit-route-auth-inventory har höjt eller behållit taket för utan-standardgrind', () => {
    const inv = read('tests/facit-route-auth-inventory.spec.ts')
    expect(inv).toMatch(/toBeLessThanOrEqual\(14[4-9]\)/)
  })
})

test.describe('Del 3 — kortkanal.ts', () => {
  test('de fyra typerna är digest, allt annat implicit kort', () => {
    expect(kortkanalRen).toMatch(/agent_observation:\s*'digest'/)
    expect(kortkanalRen).toMatch(/dispatch_suggestion:\s*'digest'/)
    expect(kortkanalRen).toMatch(/monthly_review:\s*'digest'/)
    expect(kortkanalRen).toMatch(/checklist_forslag:\s*'digest'/)
  })

  test('kanalFor är en ren funktion — ingen I/O, ingen Supabase-import', () => {
    expect(kortkanalRen).not.toMatch(/from '@\/lib\/supabase'/)
    expect(kortkanalRen).not.toMatch(/\.from\('/)
    expect(kortkanalRen).not.toMatch(/fetch\(/)
    expect(kortkanalRen).toMatch(/export function kanalFor/)
  })

  test('kanalFor: enhetstest på faktisk logik', async () => {
    const mod = await import('../lib/approvals/kortkanal')
    expect(mod.kanalFor('agent_observation')).toBe('digest')
    expect(mod.kanalFor('dispatch_suggestion')).toBe('digest')
    expect(mod.kanalFor('monthly_review')).toBe('digest')
    expect(mod.kanalFor('checklist_forslag')).toBe('digest')
    expect(mod.kanalFor('karin_deadline')).toBe('kort')
    expect(mod.kanalFor('four_eyes_quote')).toBe('kort')
    expect(mod.kanalFor('nagot_okant_helt_paIntat')).toBe('kort')
  })
})

test.describe('Del 3 — skapa-kort.ts grenar på kanalFor', () => {
  test('importerar kanalFor och grenar FÖRE pending_approvals-inserten', () => {
    expect(skapaKortRen).toContain("from '@/lib/approvals/kortkanal'")
    const grenIdx = skapaKortRen.indexOf("kanalFor(kort.approval_type) === 'digest'")
    const insertIdx = skapaKortRen.indexOf(".from('pending_approvals')\n    .insert(")
    expect(grenIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(-1)
    expect(grenIdx).toBeLessThan(insertIdx)
  })

  test('digest-grenen skriver automation_activity och returnerar kanal: digest', () => {
    const fnIdx = skapaKortRen.indexOf('async function skrivDigestrad')
    expect(fnIdx, 'skrivDigestrad hittades inte').toBeGreaterThan(-1)
    const fn = skapaKortRen.slice(fnIdx)
    expect(fn).toContain("from('automation_activity')")
    expect(fn).toContain("kanal: 'digest'")
  })

  test('digest-grenen pushar ALDRIG — ingen sendApprovalPush i den grenen', () => {
    const fnIdx = skapaKortRen.indexOf('async function skrivDigestrad')
    const fn = skapaKortRen.slice(fnIdx)
    expect(fn).not.toMatch(/sendApprovalPush\(/)
  })

  test('den vanliga (kort-)grenen är orörd: insert före push, return { id } kvar', () => {
    const insertIdx = skapaKortRen.indexOf(".from('pending_approvals')\n    .insert(")
    const pushIdx = skapaKortRen.indexOf('sendApprovalPush(')
    const returnIdx = skapaKortRen.indexOf('return { id }')
    expect(insertIdx).toBeLessThan(pushIdx)
    expect(pushIdx).toBeLessThan(returnIdx)
  })
})

test.describe('Del 3 — de fyra skapande call-sites använder skapaKort', () => {
  const filer = [
    'lib/agents/shared/save-and-push.ts',
    'app/api/cron/monthly-review/route.ts',
    'lib/dispatch.ts',
    'lib/egenkontroll/suggest-checklist.ts',
  ]

  for (const rel of filer) {
    test(`${rel} importerar och anropar skapaKort`, () => {
      const src = read(rel)
      expect(src, `${rel} importerar inte skapaKort`).toMatch(
        /import\s*\{\s*skapaKort\s*\}\s*from\s*'@\/lib\/approvals\/skapa-kort'/,
      )
      expect(src, `${rel} anropar inte skapaKort(`).toContain('skapaKort(')
    })
  }

  test('lib/dispatch.ts: dispatch_suggestion-inserten går via skapaKort, ingen rå insert kvar för den typen', () => {
    const src = utanKommentarer(read('lib/dispatch.ts'))
    expect(src).not.toMatch(/\.from\('pending_approvals'\)\s*\.insert\(\s*\{\s*id:\s*approvalId/)
    const kortIdx = src.indexOf('skapaKort(supabase, {')
    const typIdx = src.indexOf("approval_type: 'dispatch_suggestion'")
    expect(kortIdx).toBeGreaterThan(-1)
    expect(typIdx).toBeGreaterThan(kortIdx)
  })

  test('lib/egenkontroll/suggest-checklist.ts: checklist_forslag-inserten går via skapaKort', () => {
    const src = utanKommentarer(read('lib/egenkontroll/suggest-checklist.ts'))
    const kortIdx = src.indexOf('skapaKort(supabase, {')
    const typIdx = src.indexOf("approval_type: 'checklist_forslag'")
    expect(kortIdx).toBeGreaterThan(-1)
    expect(typIdx).toBeGreaterThan(kortIdx)
  })

  test('lib/dispatch.ts och suggest-checklist.ts anropar brusgrind FÖRE skapaKort (oförändrad ordning)', () => {
    const dispatch = utanKommentarer(read('lib/dispatch.ts'))
    const grindD = dispatch.indexOf("brusgrind(supabase, params.businessId, 'dispatch_suggestion')")
    const kortD = dispatch.indexOf('skapaKort(supabase, {')
    expect(grindD).toBeGreaterThan(-1)
    expect(kortD).toBeGreaterThan(grindD)

    const checklist = utanKommentarer(read('lib/egenkontroll/suggest-checklist.ts'))
    const grindC = checklist.indexOf("brusgrind(supabase, businessId, 'checklist_forslag')")
    const kortC = checklist.indexOf('skapaKort(supabase, {')
    expect(grindC).toBeGreaterThan(-1)
    expect(kortC).toBeGreaterThan(grindC)
  })

  test('app/api/cron/monthly-review/route.ts: SMS-utskicket finns kvar (kortet var dubbelt, rapporten är kvar)', () => {
    const src = read('app/api/cron/monthly-review/route.ts')
    expect(src).toContain('sendSmsViaElks')
    expect(src).toContain('buildMonthlyReviewSms')
    expect(src).toContain('skapaKort(')
  })

  test('lib/agents/shared/save-and-push.ts: business_knowledge länkas bara när kortet inte är digest', () => {
    const src = utanKommentarer(read('lib/agents/shared/save-and-push.ts'))
    expect(src).toMatch(/kort\?\.\s*id\s*&&\s*knowledgeId\s*&&\s*kort\.kanal\s*!==\s*'digest'/)
  })
})
