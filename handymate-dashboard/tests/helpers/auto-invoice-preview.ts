import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'

/**
 * Renderar den RIKTIGA AutoInvoiceButton ur app/dashboard/settings/page.tsx
 * med riktig Tailwind, så att avdragsvaktens skäl (spår 5, 2026-09-18)
 * kan tittas på i 375 px i stället för att bara skannas i källan.
 *
 * `svar` är det rutten svarar med — helpern hittar inte på någon text själv;
 * skälet kommer ur lib/invoices/auto-invoice-avdragsvakt.ts.
 */
export async function autoInvoicePreview(svar: Record<string, unknown>) {
  const modules: Record<string, { code: string; deps: Record<string, string> }> = {}
  const stubs = ['react', 'react/jsx-runtime', 'lucide-react']
  function add(file: string): string {
    file = path.normalize(file)
    if (modules[file]) return file
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText
    const deps: Record<string, string> = {}
    modules[file] = { code, deps }
    for (const m of Array.from(code.matchAll(/require\(["']([^"']+)["']\)/g))) {
      const name = m[1]
      if (stubs.includes(name)) { deps[name] = name; continue }
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name)
      const resolved = [base, base + '.ts', base + '.tsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile())
      if (!resolved) { deps[name] = 'tom' ; continue }
      deps[name] = add(resolved)
    }
    return file
  }
  const entry = add('components/settings/AutoInvoiceButton.tsx')
  const css = (await postcss([tailwind({ ...config, content: Object.keys(modules) })])
    .process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })).css

  const script = `
    const tomModul = { exports: new Proxy(function(){}, { get: () => () => null }) }
    const cache = {
      tom: tomModul,
      react: { exports: React },
      'react/jsx-runtime': { exports: { jsx: (t,p,k)=>React.createElement(t,{...p,key:k}), jsxs: (t,p,k)=>React.createElement(t,{...p,key:k}), Fragment: React.Fragment } },
      // Ikonerna ritas som tomma rutor — de är inte det som ska granskas,
      // och en riktig SVG-import hade dragit in hela lucide-paketet.
      'lucide-react': { exports: new Proxy({}, { get: () => (p) => React.createElement('span', { className: p && p.className }) }) },
    }
    const bundle = ${JSON.stringify({ entry, modules })}
    function load(id){ if(cache[id]) return cache[id].exports; const m={exports:{}}; cache[id]=m
      new Function('require','module','exports',bundle.modules[id].code)(n=>load(bundle.modules[id].deps[n]||'tom'),m,m.exports); return m.exports }
    // Rutten anropas aldrig på riktigt — svaret är fixturen.
    window.fetch = async () => ({ ok: true, json: async () => (${JSON.stringify(svar)}) })
    const h = React.createElement
    const Knapp = load(bundle.entry).AutoInvoiceButton
    ReactDOM.createRoot(document.getElementById('root')).render(
      h('div', null,
        h('h1', { className: 'text-base font-semibold text-slate-900 mb-2' }, 'Auto-fakturering'),
        h(Knapp, { businessId: 'b', autoSend: false, maxAmount: 50000 })))
  `
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}body{background:#f8fafc;font-family:Arial,sans-serif}main{max-width:900px;margin:16px auto;padding:0 16px}</style></head><body><main id="root"></main><script>${safe(fs.readFileSync('node_modules/react/umd/react.development.js', 'utf8'))}</script><script>${safe(fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js', 'utf8'))}</script><script>${safe(script)}</script></body></html>`
}
