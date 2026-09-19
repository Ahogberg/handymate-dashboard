import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'

/**
 * Renderar den RIKTIGA app/admin/kom-ikapp/page.tsx — inte en skiss. Samma
 * mönster som intake-flow-preview.ts. `fetch` stubbas med ett svar som
 * speglar mätningen 2026-09-18, så bilden visar det Andreas faktiskt får se.
 */
export async function komIkappPreview() {
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
      if (!resolved) throw Error('Unexpected dependency: ' + name)
      deps[name] = add(resolved)
    }
    return file
  }

  const entry = add('app/admin/kom-ikapp/page.tsx')
  const css = (await postcss([tailwind({ ...config, content: Object.keys(modules) })])
    .process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })).css

  // Mätt läge 2026-09-18 efter v256-backfillen.
  const svar = {
    dry_run: true, foretag_kontrollerade: 29, foretag_utan_jobbtyper: 18,
    jobbtyper_utan_upplagg: 17, nya_upplagg: 0, omkopplade: 0, misslyckade: 0,
    resultat: [
      { business_id: 'elexperten_sthlm', business_name: 'Elexperten Stockholm AB', branch: 'elektriker', jobbtyper: 8,
        jobbtyper_utan_upplagg: ['Belysning', 'Elbilsladdare', 'Elcentral', 'Elinstallation', 'Felsökning', 'Jordfelsbrytare', 'Säkringsbyte', 'Uttag och strömbrytare'] },
      { business_id: 'biz_21wswuhrbhy', business_name: 'Bee Service AB', branch: 'elektriker', jobbtyper: 14,
        jobbtyper_utan_upplagg: ['Bygg & Snickeri', 'Elektirker', 'K4-Elektriska AB', 'Måla Fasad', 'Måleri', 'Plattor', 'Puts/ Murare', 'Totalentreprenör'] },
      { business_id: 'biz_al7pjuu5smi', business_name: 'Nordström El AB', branch: 'elektriker', jobbtyper: 7,
        jobbtyper_utan_upplagg: ['Installation'] },
      { business_id: 'biz_0lovw5vcwzqn', business_name: 'Svensson Bygg AB', branch: 'bygg', jobbtyper: 4, jobbtyper_utan_upplagg: [] },
    ],
  }

  const script = `
    const cache={
      react:{exports:React},
      'react/jsx-runtime':{exports:{jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k}),Fragment:React.Fragment}},
      'lucide-react':{exports:new Proxy({},{get:()=>(p)=>React.createElement('span',{'aria-hidden':'true',className:(p&&p.className)||''},'')})}
    };
    window.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve(${JSON.stringify(svar)})});
    const bundle=${JSON.stringify({ entry, modules })};
    function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('require','module','exports',bundle.modules[id].code)(n=>load(bundle.modules[id].deps[n]),m,m.exports);return m.exports}
    const Sida=load(bundle.entry).default;
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Sida));
  `
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}body{background:#f8fafc;font-family:Arial,sans-serif}button{touch-action:manipulation}</style></head><body><div id="root"></div><script>${safe(fs.readFileSync('node_modules/react/umd/react.development.js', 'utf8'))}</script><script>${safe(fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js', 'utf8'))}</script><script>${safe(script)}</script></body></html>`
}
