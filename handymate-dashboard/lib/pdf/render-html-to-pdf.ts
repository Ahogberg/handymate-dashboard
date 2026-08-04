import { stripPrintBar } from '@/lib/document-html'

/**
 * ETAPP 6b (offert-masterplan.md, faktura-sprinten): utbruten ur den
 * lokala renderHtmlToPdf-funktionen i app/api/quotes/pdf/route.ts (fanns
 * där sedan Chromium-PDF-vägen infördes) — IDENTISK logik, nu delad av
 * offert- och faktura-PDF-vägarna (invoices/pdf, invoices/send,
 * invoices/[id]/reminder-pdf). INGEN beteendeförändring för offerten:
 * samma CHROME_EXECUTABLE_PATH-dev-stöd, @sparticuz/chromium-väg för
 * Vercel/Linux, margin 0 (mallarna äger sin egen sidmarginal via CSS, se
 * ETAPP 1d), 'load'-waitUntil, samma felloggning vid misslyckande.
 *
 * Kontraktsval — stripPrintBar() körs HÄR (inne i funktionen), inte hos
 * anroparna: PDF-utskrift ska ALDRIG innehålla print-baren (Stäng/Skriv
 * ut-knapparna är meningslösa i ett huvudlöst Chromium-dokument), så det
 * är säkrare att göra strippningen till en del av kontraktet än att lita
 * på att varje ny anropare kommer ihåg det. Anroparen skickar in den råa
 * mall-HTML:en (med eller utan .print-bar) rakt av.
 *
 * @param html    Rå mall-HTML — kan innehålla .print-bar, strippas här.
 * @param logTag  Prefix i felloggen, t.ex. "quotes/pdf" eller
 *                "invoices/pdf" — gör Vercel-loggarna greppbara per yta.
 * @returns PDF-buffer, eller null om Chromium-rendering misslyckades
 *          (anroparen ansvarar för ev. jsPDF-fallback).
 */
export async function renderHtmlToPdf(html: string, logTag: string): Promise<Buffer | null> {
  try {
    const puppeteer = await import('puppeteer-core')
    let executablePath: string | undefined
    let args: string[] = []

    // Lokal dev (Windows/Mac): peka på en installerad Chrome via env.
    // Vercel/Linux: @sparticuz/chromium packar upp sin egen binär.
    if (process.env.CHROME_EXECUTABLE_PATH) {
      executablePath = process.env.CHROME_EXECUTABLE_PATH
    } else {
      const chromium = (await import('@sparticuz/chromium')).default
      executablePath = await chromium.executablePath()
      args = chromium.args
    }

    const browser = await puppeteer.launch({
      executablePath,
      args: [...args, '--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    })
    try {
      const page = await browser.newPage()
      // ETAPP 1d (offert-masterplan.md): mallarna äger sin egen dokument-
      // marginal via inbyggd CSS-padding (se .page/.header/.body i
      // modern/premium/friendly.ts) — .page renderas redan i fullt A4-mått
      // (210×297mm). Chromium-marginalen måste därför vara 0 på alla sidor;
      // tidigare {top:12mm, bottom:14mm} lades OVANPÅ mallens egen padding
      // och dubbelräknade marginalen, vilket knuffade sidans sista del ut
      // på en nästan tom sida 2. .print-bar (Stäng/Skriv ut) är avsedd för
      // "Visa offert"/"Visa faktura" i en riktig flik, inte för PDF-vägen —
      // strippas explicit ovan (se stripPrintBar-kommentaren i
      // lib/document-html.ts).
      const printHtml = stripPrintBar(html)
      // 'load' väntar in bilder/loggor (mallens externa <img>-resurser);
      // 'networkidle0' finns inte i denna puppeteer-versions setContent-typ.
      await page.setContent(printHtml, { waitUntil: 'load', timeout: 15000 })
      const pdf = await page.pdf({
        format: 'a4',
        printBackground: true,
        margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      })
      return Buffer.from(pdf)
    } finally {
      await browser.close()
    }
  } catch (err) {
    console.error(`[${logTag}] Chromium-rendering misslyckades — faller tillbaka till jsPDF:`, err)
    return null
  }
}
