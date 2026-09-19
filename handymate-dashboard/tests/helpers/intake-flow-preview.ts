import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'

/**
 * Renderar den RIKTIGA components/quotes/IntakeQuestionFlow.tsx med dess
 * riktiga beroende lib/quotes/intake-questions.ts — inte en kopia och inte en
 * skiss. Poängen är att kunna titta på frågeflödet i 375 px utan att gå via
 * ett Vercel-bygge (2026-09-18: preview-bygget faller och åtkomsten till
 * loggen saknas, så den här vägen är tills vidare den enda som visar ytan).
 *
 * Stubbade: react, jsx-runtime, lucide-react (ikoner, rena SVG:er utan
 * betydelse för layouten) och useAudioRecording (mikrofonen finns inte i en
 * huvudlös webbläsare). Allt annat kompileras ur repot som det står.
 */
export async function intakeFlowPreview(
  mode: 'start' | 'ifyllt' = 'start'
) {
  const modules: Record<string, { code: string; deps: Record<string, string> }> = {}
  const stubs = ['react', 'react/jsx-runtime', 'lucide-react', '@/hooks/useAudioRecording']
  function add(file: string): string {
    file = path.normalize(file)
    if (modules[file]) return file
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText
    const deps: Record<string, string> = {}
    modules[file] = { code, deps }
    for (const m of Array.from(code.matchAll(/require\(["']([^"']+)["']\)/g))) {
      const name = m[1]
      if (stubs.includes(name)) {
        deps[name] = name
        continue
      }
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name)
      const resolved = [base, base + '.ts', base + '.tsx'].find(
        p => fs.existsSync(p) && fs.statSync(p).isFile()
      )
      if (!resolved) throw Error('Unexpected dependency: ' + name)
      deps[name] = add(resolved)
    }
    return file
  }

  const entry = add('components/quotes/IntakeQuestionFlow.tsx')
  const css = (
    await postcss([tailwind({ ...config, content: Object.keys(modules) })]).process(
      '@tailwind base; @tailwind components; @tailwind utilities;',
      { from: undefined }
    )
  ).css

  // Ett badrumsupplägg med två m²-rader som betyder olika saker — precis det
  // fall som avslöjade att enhetsmatchning var fel: golvytan hamnade på både
  // golv och vägg. Raderna bär id:n, och frågorna pekar på dem.
  const fragor = [
    { id: 'q_golv', label: 'Hur många kvadratmeter golv?', kind: 'number', unit: 'm²', targets: ['r_klinker', 'r_tatskikt'] },
    { id: 'q_vagg', label: 'Hur många kvadratmeter vägg?', kind: 'number', unit: 'm²', targets: ['r_kakel'] },
    { id: 'q_golvvarme', label: 'Ska golvvärme ingå?', kind: 'yesno', targets: ['r_golvvarme'] },
    { id: 'q_ytskikt', label: 'Vilket ytskikt vill kunden ha?', kind: 'choice',
      choices: [{ label: 'Kakel 20x20', productId: 'p_kakel' }, { label: 'Klinker 30x30', productId: 'p_klinker' }, { label: 'Vet ej än' }] },
    { id: 'q_ovrigt', label: 'Något mer vi bör veta?', kind: 'text', targets: [] },
  ]
  const targets = [
    { id: 'r_klinker', description: 'Klinker golv', unit: 'm²', kind: 'quantity' },
    { id: 'r_tatskikt', description: 'Tätskikt', unit: 'm²', kind: 'quantity' },
    { id: 'r_kakel', description: 'Kakel vägg', unit: 'm²', kind: 'quantity' },
    { id: 'r_golvvarme', description: 'Golvvärme', unit: 'st', kind: 'option' },
  ]
  const svar = mode === 'ifyllt' ? { q_golv: 6.5, q_vagg: 21, q_golvvarme: true, q_ytskikt: 'Klinker 30x30' } : {}

  const script = `
    const cache={
      react:{exports:React},
      'react/jsx-runtime':{exports:{jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k}),Fragment:React.Fragment}},
      'lucide-react':{exports:new Proxy({},{get:()=>(p)=>React.createElement('span',{'aria-hidden':'true',className:(p&&p.className)||''},'')})},
      '@/hooks/useAudioRecording':{exports:{useAudioRecording:()=>({recording:false,blob:null,start:()=>{},stop:()=>{},error:null})}}
    };
    const bundle=${JSON.stringify({ entry, modules })};
    function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('require','module','exports',bundle.modules[id].code)(n=>load(bundle.modules[id].deps[n]),m,m.exports);return m.exports}
    const h=React.createElement;
    function Host(){
      const Flow=load(bundle.entry).IntakeQuestionFlow;
      return h(Flow,{
        jobTypeName:'Renovera badrum',
        questions:${JSON.stringify(fragor)},
        targets:${JSON.stringify(targets)},
        initialAnswers:${JSON.stringify(svar)},
        busy:false,
        onSubmit:(a)=>{window.submitted=a},
        onSkip:()=>{window.skipped=true},
        onBack:()=>{window.backed=true}
      });
    }
    ReactDOM.createRoot(document.getElementById('root')).render(h(Host));
  `
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}body{background:#f8fafc;font-family:Arial,sans-serif}button{touch-action:manipulation}</style></head><body><div id="root"></div><script>${safe(fs.readFileSync('node_modules/react/umd/react.development.js', 'utf8'))}</script><script>${safe(fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js', 'utf8'))}</script><script>${safe(script)}</script></body></html>`
}
