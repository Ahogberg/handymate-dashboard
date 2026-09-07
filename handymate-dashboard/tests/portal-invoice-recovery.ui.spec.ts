import { test, expect } from '@playwright/test'
import { readFileSync, mkdirSync } from 'fs'
import ts from 'typescript'

// Riktig portal-komponent; dokumentmotor och betalningswidget är isolerade.
// Alla nätverksanrop fångas lokalt: inga kunddata, betalningar eller utskick.
test.use({ storageState: { cookies: [], origins: [] }, launchOptions: process.env.HANDYMATE_TEST_CHROMIUM ? { executablePath: process.env.HANDYMATE_TEST_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {} })

function preview() {
  const component = readFileSync('app/portal/[token]/components/PortalInvoiceDetail.tsx', 'utf8')
  const code = ts.transpileModule(component, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script')
  const boot = `
    const modules = {
      react: React,
      'lucide-react': { ArrowLeft:()=>null, Clock:()=>null, Download:()=>null, Loader2:()=>React.createElement('span', {role:'status'}, 'Laddar dokument') },
      '@/components/quotes/document/QuoteDocument': { default:()=>React.createElement('p',null,'Dokumentmotor') },
      '@/components/quotes/document/DocumentScaler': { DocumentScaler:({children})=>children },
      './PortalSwishBlock': { default:()=>null },
      '../helpers': { formatCurrency:n=>String(n)+' kr', formatDate:s=>s },
      '@/lib/invoices/status': { isCustomerSettled:s=>s==='paid' }
    };
    const exports={}; new Function('require','exports', ${JSON.stringify(code)})(id=>{if(!modules[id])throw Error(id);return modules[id]},exports);
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(exports.default,{
      invoice:{invoice_id:'invoice-fixture',invoice_number:'TEST-1',total:1250,customer_pays:1250,status:'sent',due_date:'2026-09-30'},
      paymentInfo:{},token:'fixture-only',onBack:()=>{}
    }));`
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync('app/portal/[token]/portal.css','utf8')}body{margin:0;font-family:Arial,sans-serif}#root{max-width:480px;margin:auto}*{box-sizing:border-box}</style></head><body><div id="root"></div><script>${safe(readFileSync('node_modules/react/umd/react.production.min.js','utf8'))}</script><script>${safe(readFileSync('node_modules/react-dom/umd/react-dom.production.min.js','utf8'))}</script><script>${safe(boot)}</script></body></html>`
}

for (const width of [375, 1280]) {
  test(`fakturaläsfel ger nästa steg och återförsök utan mutation ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    let reads = 0
    const writes: string[] = [], errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', async route => {
      if (route.request().method() !== 'GET') writes.push(route.request().url())
      if (route.request().url() === 'http://invoice-review.test/') return route.fulfill({ contentType:'text/html', body:preview() })
      if (route.request().url().endsWith('/api/portal/fixture-only/invoices/invoice-fixture')) {
        reads++
        // HTTP-fel, ofullständigt modern-dokument, sedan lyckat dokument.
        return route.fulfill({ status:reads===1?503:200, contentType:'application/json', body:JSON.stringify(reads===2 ? {template_style:'modern',template_data:null} : {template_style:'premium',document_html:'<p>Faktura TEST-1</p>'}) })
      }
      return route.abort()
    })
    await page.goto('http://invoice-review.test/')
    await expect(page.getByRole('alert')).toContainText('Fakturadokumentet kunde inte visas')
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByRole('link', {name:'Öppna PDF'})).toHaveAttribute('href','/api/invoices/pdf?invoiceId=invoice-fixture&format=pdf')
    mkdirSync('test-results', { recursive:true })
    await page.screenshot({ path:`test-results/portal-invoice-error-${width}.png`, fullPage:true })
    await page.getByRole('button',{name:'Försök igen'}).click()
    await expect.poll(()=>reads).toBe(2)
    await expect(page.getByRole('alert')).toBeVisible()
    await page.getByRole('button',{name:'Försök igen'}).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.frameLocator('iframe').getByText('Faktura TEST-1')).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(reads).toBe(3)
    expect(errors).toEqual([])
    expect(writes).toEqual([])
  })
}
