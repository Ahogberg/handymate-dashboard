/**
 * Facit för skapandeuppladdningar + inbyggd filvisning (2026-08-27).
 * Browserlöst: rena formatfacit och källkontrakt mot de konkreta vägarna.
 */
import { expect, test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { filePreviewKind, safePreviewContentType } from '../lib/documents/file-preview'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test.describe('förhandsvisning — passiva format inline, aktiva format download', () => {
  test('PDF, rasterbild, text, ljud och video kan visas', () => {
    expect(filePreviewKind('ritning.pdf', 'application/pdf')).toBe('pdf')
    expect(filePreviewKind('foto.jpg', 'image/jpeg')).toBe('image')
    expect(filePreviewKind('anteckning.txt', 'text/plain')).toBe('text')
    expect(filePreviewKind('samtal.mp3', 'audio/mpeg')).toBe('audio')
    expect(filePreviewKind('jobb.mp4', 'video/mp4')).toBe('video')
  })

  test('HTML, SVG och Office bäddas aldrig in på appens origin', () => {
    expect(filePreviewKind('attack.html', 'text/html')).toBe('unsupported')
    expect(filePreviewKind('attack.svg', 'image/svg+xml')).toBe('unsupported')
    expect(filePreviewKind('avtal.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('unsupported')
    expect(safePreviewContentType('attack.html', 'text/html')).toBeNull()
  })

  test('spoofat MIME räcker inte för att göra en farlig fil inline', () => {
    expect(filePreviewKind('attack.html', 'image/png')).toBe('unsupported')
    expect(filePreviewKind('attack.svg', 'image/png')).toBe('unsupported')
  })

  test('stream-strypunkten sätter attachment + nosniff när formatet inte är säkert', () => {
    const stream = read('lib/storage/stream-inline.ts')
    expect(stream).toContain("requestedDisposition === 'inline' && previewContentType ? 'inline' : 'attachment'")
    expect(stream).toContain("'X-Content-Type-Options': 'nosniff'")
  })
})

test.describe('affärsdokument — riktig affärskoppling', () => {
  test('v173 gör customer_id nullable och inför deal_id med FK + ägarkrav', () => {
    const sql = read('sql/v173_deal_documents.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS deal_id TEXT')
    expect(sql).toContain('ALTER COLUMN customer_id DROP NOT NULL')
    expect(sql).toContain('FOREIGN KEY (deal_id) REFERENCES public.deal(id) ON DELETE CASCADE')
    expect(sql).toContain('customer_id IS NOT NULL OR deal_id IS NOT NULL OR lead_id IS NOT NULL')
  })

  test('uppladdningsrutten verifierar affären och skriver deal_id — aldrig deal-id i customer_id', () => {
    const route = read('app/api/deals/[id]/documents/upload/route.ts')
    const ownership = route.indexOf(".eq('business_id', business.business_id)")
    const upload = route.indexOf('.upload(filePath')
    expect(ownership).toBeGreaterThan(-1)
    expect(upload).toBeGreaterThan(ownership)
    expect(route).toContain('customer_id: deal.customer_id || null')
    expect(route).toContain('deal_id: dealId')
    expect(route).not.toContain('customer_id: deal?.customer_id || dealId')
  })

  test('ny affär laddar alltid upp via affärsrutten, även utan kund', () => {
    const page = read('app/dashboard/pipeline/page.tsx')
    expect(page).toContain('`/api/deals/${createdDeal.id}/documents/upload`')
    expect(page).not.toContain('if (newDealFiles.length > 0 && createdDeal.customer_id)')
    expect(page).toContain('upload.failures[0].message')
  })

  test('affärslistan och filrutten tenantfiltrerar på både business och deal', () => {
    for (const routePath of [
      'app/api/deals/[id]/documents/route.ts',
      'app/api/deals/[id]/documents/[docId]/route.ts',
    ]) {
      const route = read(routePath)
      expect(route).toContain('getAuthenticatedBusiness(request)')
      expect(route).toContain(".eq('business_id', business.business_id)")
      expect(route).toContain(".eq('deal_id', dealId)")
      expect(route).toContain("export const dynamic = 'force-dynamic'")
    }
  })
})

test.describe('projektskapande — uppladdningsfel försvinner inte', () => {
  test('projektdokument dual-writar produktionens legacykolumner och kanoniska kolumner', () => {
    const route = read('app/api/projects/[id]/documents/route.ts')
    const insert = route.slice(
      route.indexOf(".from('project_document')\n      .insert({"),
      route.indexOf('.select()', route.indexOf(".from('project_document')\n      .insert({")),
    )
    expect(insert).toContain('order_id: projectId')
    expect(insert).toContain('project_id: projectId')
    expect(insert).toContain('file_name: file.name')
    expect(insert).toContain('name: file.name')
    expect(insert).toContain('file_url: filePath')
    expect(insert).toContain('file_path: filePath')
  })

  test('felade File-objekt behålls och retry skapar inte ett andra projekt', () => {
    const page = read('app/dashboard/projects/page.tsx')
    const retryGuard = page.indexOf('if (createdProjectForFiles)')
    const createRequest = page.indexOf("fetch('/api/projects'", retryGuard)
    const guardEnd = page.indexOf("if (!newProject.name.trim())", retryGuard)
    expect(retryGuard).toBeGreaterThan(-1)
    expect(guardEnd).toBeGreaterThan(retryGuard)
    expect(createRequest === -1 || createRequest > guardEnd).toBe(true)
    expect(page).toContain('setPendingFiles(upload.failures.map(failure => failure.file))')
    expect(page).toContain('Försök ladda upp igen')
    expect(page).not.toContain('catch { /* continue with next file */ }')
  })
})

test.describe('en gemensam förhandsvisningsyta', () => {
  test('providern är globalt monterad i dashboarden', () => {
    const layout = read('app/dashboard/layout.tsx')
    expect(layout).toContain("import { FilePreviewProvider }")
    expect(layout).toContain('<FilePreviewProvider>')
  })

  test('kund, projekt, affär och dokumentarkiv öppnar modalens inline-rutt', () => {
    for (const file of [
      'app/dashboard/customers/[id]/page.tsx',
      'app/dashboard/projects/[id]/page.tsx',
      'app/dashboard/pipeline/components/DealModal.tsx',
      'app/dashboard/documents/page.tsx',
    ]) {
      const source = read(file)
      expect(source, file).toContain('openFilePreview')
      expect(source, file).toContain('view=inline')
      expect(source, file).toContain('view=download')
    }
  })
})
