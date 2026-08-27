/**
 * Facit: Fastighetspasset steg 1 — jobbpasset når kunden i portalen (2026-08-27).
 *
 * Bakgrund: Jobbpasset (v154) publicerades till en token som ägaren fick
 * lämna över för hand; portalen hade noll referenser till det, dokument-
 * fliken visade bara offerter/fakturor trots tre dokumenttabeller, och
 * fältrapport-rutten anropades av ingen.
 *
 *   npx playwright test tests/facit-fastighetspass.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test.describe('en rendering, två ytor', () => {
  test('publika sidan och portalen renderar samma JobbpassView', () => {
    expect(kod('app/jobbpass/[token]/page.tsx')).toContain("import { JobbpassView } from '@/components/jobbpass/JobbpassView'")
    expect(kod('app/jobbpass/[token]/page.tsx')).toContain('<JobbpassView pass={pass} />')
    expect(kod('app/portal/[token]/components/PortalJobbpass.tsx')).toContain('<JobbpassView pass={pass.view} />')
    // Ingen kvarvarande egen kortrendering i den publika sidan
    expect(kod('app/jobbpass/[token]/page.tsx')).not.toContain('function Card(')
  })

  test('en sammansättning: publika rutten och portal-rutten går båda genom assembleJobbpassView', () => {
    expect(kod('app/api/jobbpass/public/[token]/route.ts')).toContain('await assembleJobbpassView(supabase, jobbpass)')
    expect(kod('app/api/portal/[token]/jobbpass/route.ts')).toContain('await assembleJobbpassView(supabase, entry.row)')
    const lib = kod('lib/jobbpass/jobbpass.ts')
    expect(lib).toContain('export async function assembleJobbpassView(')
    expect(lib).toContain('export async function listPublishedJobbpassForCustomer(')
    expect(lib).toContain(".eq('status', 'published')")
  })
})

test.describe('portalen', () => {
  const page = kod('app/portal/[token]/page.tsx')

  test('jobbpassen hämtas, Ditt hem på startsidan, passvyn som sub-route, djuplänk ?tab=jobbpass&project=', () => {
    expect(page).toContain("fetch(`/api/portal/${token}/jobbpass`)")
    expect(page).toContain("if (t === 'jobbpass') return { tab: 'project' as BottomTab, sub: 'jobbpass' as SubRoute }")
    expect(page).toContain("new URLSearchParams(window.location.search).get('project')")
    expect(page).toContain('<PortalJobbpass pass={pass}')
    expect(page).toContain('passes={passes}')
    expect(kod('app/portal/[token]/components/PortalHome.tsx')).toContain("<h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Ditt hem</h3>")
  })

  test('projektdetaljen visar passet och fältrapporterna — rutten /reports har äntligen en anropare', () => {
    expect(page).toContain("fetch(`/api/portal/${token}/reports`)")
    expect(page).toContain('jobbpassAvailable={passes.some(x => x.project_id === selectedProjectData.project_id)}')
    const detail = kod('app/portal/[token]/components/PortalProjectDetail.tsx')
    expect(detail).toContain('Jobbpasset — vad som gjordes hos dig')
    expect(detail).toContain('>Fältrapporter</h3>')
  })

  test('dokumentfliken läser de tre dokumenttabellerna med signerade URL:er och error-koll', () => {
    const route = kod('app/api/portal/[token]/documents/route.ts')
    for (const t of ["from('customer_document')", "from('project_document')", "from('generated_document')"]) expect(route).toContain(t)
    expect(route).toContain('signStorageUrl(supabase, CUSTOMER_BUCKET')
    expect(route).toContain('signStorageUrl(supabase, PROJECT_BUCKET')
    expect(route).toContain('if (res.error) console.error')
    expect(page).toContain("fetch(`/api/portal/${token}/documents`)")
    const list = kod('app/portal/[token]/components/PortalDocumentsList.tsx')
    expect(list).toContain("{ id: 'files' as FilterId,    label: 'Filer'")
    expect(list).not.toContain('tills customer_documents-tabell finns')
  })
})

test.describe('garanti nämns inte (Andreas 2026-08-27: varierar per bransch, lovas aldrig generiskt)', () => {
  test('ingen garantisektion i passet, förhandsvisningen, portalens copy eller mejlet', () => {
    expect(kod('lib/jobbpass/jobbpass.ts')).not.toMatch(/warranty|garanti/i)
    expect(kod('components/jobbpass/JobbpassView.tsx')).not.toMatch(/garanti/i)
    expect(kod('app/dashboard/projects/[id]/jobbpass/page.tsx')).not.toMatch(/garanti/i)
    expect(kod('app/portal/[token]/components/PortalHome.tsx')).not.toMatch(/garanti/i)
    expect(kod('app/portal/[token]/components/PortalProjectDetail.tsx')).not.toMatch(/garanti/i)
    expect(kod('lib/portal/notification-emails.ts')).not.toMatch(/garanti/i)
  })
})

test.describe('publicering och utskick är två handlingar (sanningsgrind 5)', () => {
  test('publiceringen skickar inget själv — inget mejl, inget SMS', () => {
    const publish = kod('app/api/projects/[id]/jobbpass/publish/route.ts')
    expect(publish).not.toContain('sendPortalNotification')
    expect(publish).not.toMatch(/sendSms|46elks|elks/i)
    const lib = kod('lib/jobbpass/jobbpass.ts')
    expect(lib).toContain('justPublished: true')
    expect(lib).toContain("return { ok: true, row: current, justPublished: false }")
  })

  test('utskicket är en egen ägarhandling genom portalens befintliga utskicksgrind, aldrig SMS', () => {
    const notify = kod('app/api/projects/[id]/jobbpass/notify/route.ts')
    expect(notify).toContain("export const dynamic = 'force-dynamic'")
    expect(notify).toContain('getAuthenticatedBusiness(request)')
    expect(notify).toContain('isOwnerOrAdmin(currentUser)')
    expect(notify).toContain("sendPortalNotification(business.business_id, project.customer_id, 'jobbpass_published'")
    expect(notify).toContain("pass.status !== 'published'")
    expect(notify).not.toMatch(/sendSms|46elks|elks/i)
    // Ärliga svenska svar för varje utfall — "skickat" betyder skickat
    expect(notify).toContain("result.skipped === 'dedup'")
    expect(notify).toContain("result.skipped === 'no_email'")
    expect(notify).toContain("result.skipped === 'no_portal'")
    expect(notify).not.toMatch(/Not enough|Unauthorized'\s*\}\s*,\s*\{\s*status:\s*4(00|03)/)
    const owner = kod('app/dashboard/projects/[id]/jobbpass/page.tsx')
    expect(owner).toContain('/jobbpass/notify`, { method: \'POST\' }')
    expect(owner).toContain('Meddela kunden via mejl')
    const mail = kod('lib/portal/notification-emails.ts')
    expect(mail).toContain("| 'jobbpass_published'")
    expect(mail).toContain("case 'jobbpass_published': return ctx?.project_id ? `?tab=jobbpass&project=${ctx.project_id}` : '?tab=project'")
  })

  test('?tab=photos pekar inte längre på en flik som inte finns', () => {
    const mail = kod('lib/portal/notification-emails.ts')
    expect(mail).not.toContain("return '?tab=photos'")
    expect(mail).toContain("case 'photos_added': return '?tab=project'")
  })
})
