/**
 * FACIT — Etapp Z: privata storage-buckets (sql/v151_private_buckets.sql).
 *
 * customer-documents och project-files blir privata — inga anon/authenticated-
 * policies kvar på storage.objects. All läsning måste gå via kortlivade
 * signerade URL:er (service-role), aldrig en publik URL byggd av
 * getPublicUrl(). Signerade URL:er får ALDRIG sparas i databasen — bara
 * storage-path, signerat vid läsning.
 *
 * Tre delar:
 *  1. Rena enhetstester för extractStoragePath (lib/storage-signing.ts).
 *  2. Källskanning: ingen fil i app/ eller lib/ anropar getPublicUrl mot
 *     customer-documents eller project-files. Skanningen är PER FIL, inte
 *     ett globalt förbud mot ordet — en fil som bara rör business-assets
 *     eller quote-images (avsiktligt fortsatt publika/oberörda buckets)
 *     ska INTE flaggas. Se "sanity"-testerna längst ner som bevisar att
 *     skannern faktiskt kan skilja de två fallen åt.
 *  3. Regressionslås på specifika filer: uppladdningsvägarna lagrar path
 *     (aldrig getPublicUrl, aldrig ensureBucket({public:true}) för de två
 *     privata buckets), och de tre webbläsarsidorna har ingen kvarvarande
 *     direkt .storage.-användning mot dem.
 *
 * BEGRÄNSNING (dokumenterad, inte en glömska): "ingen signerad URL sparas i
 * DB" kan inte bevisas perfekt statiskt utan full AST-dataflödesanalys. Vi
 * låser i stället de konkreta write-vägarna (uppladdning + inbound-mejl)
 * till att ALDRIG anropa createSignedUrl/signStorageUrl/signAttachmentList
 * — de skriver bara paths de redan känner till lokalt. Signeringshelpern
 * används bara i läsvägarna, som är separat testade här.
 *
 * Körs: npx playwright test tests/storage-signing.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { extractStoragePath } from '../lib/storage-signing'

const ROOT = path.resolve(__dirname, '..')
const source = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const PRIVATE_BUCKETS = ['customer-documents', 'project-files']

function walkTsFiles(startDirs: string[]): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue
        walk(relative)
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(relative)
      }
    }
  }
  startDirs.forEach(walk)
  return files
}

// ─────────────────────────────────────────────────────────────────────────
// 1. extractStoragePath — rena facit
// ─────────────────────────────────────────────────────────────────────────

test.describe('extractStoragePath', () => {
  test('publik URL → path', () => {
    const url =
      'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/public/customer-documents/biz_1/cust_1/1699999999_faktura.pdf'
    expect(extractStoragePath(url, 'customer-documents')).toBe('biz_1/cust_1/1699999999_faktura.pdf')
  })

  test('redan en path → oförändrad', () => {
    const p = 'biz_1/cust_1/1699999999_faktura.pdf'
    expect(extractStoragePath(p, 'customer-documents')).toBe(p)
  })

  test('fel bucket i URL:en → null', () => {
    const url =
      'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/public/project-files/biz_1/proj_1/ritning.pdf'
    expect(extractStoragePath(url, 'customer-documents')).toBeNull()
  })

  test('signerad legacy-URL läks tillbaka till path (bara för läkning, ingen ny kod ska producera såna)', () => {
    const url =
      'https://pktaqedooyzgvzwipslu.supabase.co/storage/v1/object/sign/customer-documents/biz_1/cust_1/foto.jpg?token=abc123'
    expect(extractStoragePath(url, 'customer-documents')).toBe('biz_1/cust_1/foto.jpg')
  })

  test('null/undefined/tom sträng → null', () => {
    expect(extractStoragePath(null, 'customer-documents')).toBeNull()
    expect(extractStoragePath(undefined, 'customer-documents')).toBeNull()
    expect(extractStoragePath('', 'customer-documents')).toBeNull()
    expect(extractStoragePath('   ', 'customer-documents')).toBeNull()
  })

  test('URL utan igenkännbart storage-mönster → null', () => {
    expect(extractStoragePath('https://example.com/random.pdf', 'customer-documents')).toBeNull()
  })

  test('path med svenska tecken URL-avkodas', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/public/customer-documents/biz_1/cust_1/1699999999_offert%20f%C3%B6r%20k%C3%B6k.pdf'
    expect(extractStoragePath(url, 'customer-documents')).toBe('biz_1/cust_1/1699999999_offert för kök.pdf')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2. Källskanning — ingen getPublicUrl mot de två privata buckets
// ─────────────────────────────────────────────────────────────────────────

test.describe('källskanning — getPublicUrl mot privata buckets', () => {
  test('ingen fil i app/ eller lib/ anropar getPublicUrl OCH refererar customer-documents/project-files', () => {
    const offenders: string[] = []
    for (const file of walkTsFiles(['app', 'lib'])) {
      const body = source(file)
      if (!body.includes('getPublicUrl(')) continue
      for (const bucket of PRIVATE_BUCKETS) {
        if (body.includes(`'${bucket}'`) || body.includes(`"${bucket}"`)) {
          offenders.push(`${file} (getPublicUrl + '${bucket}')`)
        }
      }
    }
    expect(
      offenders,
      'Filer som bygger en publik URL mot en bucket som är privat sedan v151. ' +
        'Läsning ska gå via createSignedUrl (lib/storage-signing.ts), skrivning ska spara path.',
    ).toEqual([])
  })

  test('SANITY: business-assets (logotyper) flaggas INTE — avsiktligt fortsatt publik', () => {
    const body = source('app/api/business/logo/route.ts')
    expect(body).toContain('getPublicUrl')
    expect(body).toContain("'business-assets'")
    // Skannerns egen logik: den letar efter PRIVATE_BUCKETS-strängarna, som
    // inte finns i den här filen — den ska alltså passera obemärkt.
    for (const bucket of PRIVATE_BUCKETS) {
      expect(body).not.toContain(`'${bucket}'`)
    }
  })

  test('SANITY: quote-images (Matte/AI-bildanalys) flaggas INTE — oberörd bucket, medvetet utanför denna etapp', () => {
    for (const file of ['app/api/matte/upload-image/route.ts', 'app/api/quotes/upload-image/route.ts']) {
      const body = source(file)
      expect(body).toContain('getPublicUrl')
      expect(body).toContain("'quote-images'")
      for (const bucket of PRIVATE_BUCKETS) {
        expect(body).not.toContain(`'${bucket}'`)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3. Regressionslås — specifika vägar
// ─────────────────────────────────────────────────────────────────────────

const UPLOAD_ROUTES_STORING_PATH = [
  'app/api/customers/[id]/documents/upload/route.ts',
  'app/api/projects/[id]/documents/route.ts',
  'app/api/deals/[id]/documents/upload/route.ts',
  'app/api/quotes/attachments/upload/route.ts',
]

test.describe('regression — uppladdningsvägar lagrar path, aldrig getPublicUrl', () => {
  for (const route of UPLOAD_ROUTES_STORING_PATH) {
    test(`${route} anropar inte getPublicUrl`, () => {
      const body = source(route)
      expect(body).not.toContain('getPublicUrl')
    })
  }

  test('ensureBucket för customer-documents/project-files begär alltid public:false', () => {
    const files = [
      'app/api/customers/[id]/documents/upload/route.ts',
      'app/api/projects/[id]/documents/route.ts',
      'app/api/deals/[id]/documents/upload/route.ts',
      'app/api/quotes/attachments/upload/route.ts',
    ]
    for (const file of files) {
      const body = source(file)
      const call = body.match(/ensureBucket\([^)]*\)/)
      expect(call, `${file}: hittar inget ensureBucket-anrop`).toBeTruthy()
      expect(
        call![0],
        `${file}: ensureBucket måste begära public:false — annars synkas bucketen tyst tillbaka till publik ` +
          '(se lib/storage.ts "Bucket finns — synka public-flaggan om den driftat").',
      ).toContain('public: false')
    }
  })

  test('inbound-mejlens bilagearkivering (gmail/postmark) sparar path, inte publik URL', () => {
    for (const file of ['lib/gmail-attachments.ts', 'lib/email/postmark-attachments.ts']) {
      const body = source(file)
      expect(body).not.toContain('getPublicUrl')
    }
  })
})

test.describe('regression — webbläsarsidorna har ingen direkt storage-uppladdning kvar', () => {
  const pages = [
    'app/dashboard/quotes/new/page.tsx',
    'app/dashboard/quotes/[id]/edit/page.tsx',
    'app/dashboard/pipeline/page.tsx',
  ]

  for (const file of pages) {
    test(`${file} använder inte .storage. längre (uppladdning flyttad server-side)`, () => {
      const body = source(file)
      expect(body).not.toContain('.storage.')
    })
  }
})

test.describe('regression — signeringshelpern används bara i läsvägar, inte i skrivvägar', () => {
  test('uppladdningsvägarna anropar aldrig createSignedUrl/signAttachmentList (persisterar aldrig en signerad länk)', () => {
    for (const file of UPLOAD_ROUTES_STORING_PATH) {
      const body = source(file)
      expect(body).not.toContain('createSignedUrl')
      expect(body).not.toContain('signAttachmentList')
    }
  })

  // projects/documents/route.ts POST är undantaget ovan: den anropar
  // signStorageUrl EN gång, men bara för att ge egenkontroll-agentens
  // AI-bildanalys en hämtningsbar URL i samma request (fire-and-forget,
  // inget som väntas in). Den signerade länken skrivs ALDRIG till DB —
  // project_document.file_path sätts till `filePath` (den lokala variabeln,
  // inte den signerade strängen) FÖRE signeringsanropet ens görs.
  test('projects/documents POST: den enda signStorageUrl-användningen är efter DB-insert, aldrig i insert-payloaden', () => {
    const body = source('app/api/projects/[id]/documents/route.ts')
    const insertMatch = body.match(/\.from\('project_document'\)\s*\.insert\(\{/)
    const insertIndex = insertMatch ? (insertMatch.index ?? -1) : -1
    const signIndex = body.indexOf('signStorageUrl(')
    expect(insertIndex, 'hittar inte project_document-insert').toBeGreaterThanOrEqual(0)
    expect(signIndex, 'hittar inte signStorageUrl-anropet').toBeGreaterThanOrEqual(0)
    expect(signIndex, 'signStorageUrl måste ske EFTER insert — annars kan resultatet av den läcka in i payloaden').toBeGreaterThan(insertIndex)
    // Insert-payloaden själv innehåller bara den lokala `filePath`-variabeln.
    const insertBlock = body.slice(insertIndex, body.indexOf('.select()', insertIndex))
    expect(insertBlock).toContain('order_id: projectId')
    expect(insertBlock).toContain('project_id: projectId')
    expect(insertBlock).toContain('file_name: file.name')
    expect(insertBlock).toContain('file_url: filePath')
    expect(insertBlock).toContain('file_path: filePath')
    expect(insertBlock).not.toContain('signStorageUrl')
    expect(insertBlock).not.toContain('signedForAnalysis')
  })

  test('offertens läsvägar (dashboard + publik/portal) signerar bilagor vid läsning', () => {
    const single = source('app/api/quotes/route.ts')
    expect(single).toContain('signAttachmentList')

    const publicRoute = source('app/api/quotes/public/[token]/route.ts')
    expect(publicRoute).toContain('signAttachmentList')
  })
})
