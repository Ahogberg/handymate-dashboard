import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'

/**
 * Renderar den RIKTIGA startskärmen — QuickIntake med den RIKTIGA
 * QuoteJobTypeStart inuti, precis som QuoteBuilder monterar dem.
 *
 * `fetch` stubbas med Nordström El AB:s faktiska läge EFTER v256-backfillen
 * och kom-ikapp: sju jobbtyper, och upplägg kopplade till dem. Poängen är att
 * bilden ska visa det Andreas faktiskt möter, inte en hittepå-firma.
 */
export async function startskarmPreview(valdJobbtyp: string | null = null) {
  const modules: Record<string, { code: string; deps: Record<string, string> }> = {}
  const stubs = ['react', 'react/jsx-runtime', 'lucide-react', '@/hooks/useAudioRecording']
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

  const intake = add('app/dashboard/quotes/new/components/quick/QuickIntake.tsx')
  const remsa = add('components/onboarding/QuoteJobTypeStart.tsx')
  const css = (await postcss([tailwind({ ...config, content: Object.keys(modules) })])
    .process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })).css

  // Nordström El AB, mätt 2026-09-19.
  const rad = (i: number, d: string, u: string, p: string | null) =>
    ({ index: i, quantity: 1, itemType: 'item', description: d, unit: u, linkedProductId: p })
  const setup = {
    linkingAvailable: true,
    jobTypes: [
      { id: '1', slug: 'allmant_arbete', name: 'Allmänt arbete' },
      { id: '2', slug: 'byta_elcentral', name: 'Byta elcentral' },
      { id: '3', slug: 'elbesiktning', name: 'Elbesiktning' },
      { id: '4', slug: 'installera_belysning', name: 'Installera belysning' },
      { id: '5', slug: 'installera_laddbox', name: 'Installera laddbox' },
      { id: '6', slug: 'installation', name: 'Installation' },
    ],
    templates: [
      { id: 't1', name: 'Enkel offert', category: 'Allmänt', jobTypeSlug: 'allmant_arbete', isDefault: true, updatedAt: null,
        items: [rad(0, 'Arbetskostnad', 'tim', 'p1'), rad(1, 'Material', 'st', 'p2'), rad(2, 'Servicebil/framkörning', 'st', 'p3')] },
      { id: 't2', name: 'Byte av elcentral', category: 'El', jobTypeSlug: 'byta_elcentral', isDefault: true, updatedAt: null,
        items: [rad(0, 'Elcentral', 'st', 'p4'), rad(1, 'Arbetskostnad', 'tim', 'p1')] },
      { id: 't3', name: 'Laddbox för elbil', category: 'El', jobTypeSlug: 'installera_laddbox', isDefault: true, updatedAt: null,
        items: [rad(0, 'Laddbox', 'st', 'p5'), rad(1, 'Arbetskostnad', 'tim', 'p1')] },
    ],
    products: [
      { id: 'p1', name: 'Arbetskostnad', unit: 'tim', salesPrice: 695 },
      { id: 'p2', name: 'Material', unit: 'st', salesPrice: 3000 },
      { id: 'p3', name: 'Servicebil/framkörning', unit: 'st', salesPrice: 450 },
      { id: 'p4', name: 'Elcentral', unit: 'st', salesPrice: 4200 },
      { id: 'p5', name: 'Laddbox', unit: 'st', salesPrice: 8900 },
    ],
  }

  const script = `
    const cache={
      react:{exports:React},
      'react/jsx-runtime':{exports:{jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k}),Fragment:React.Fragment}},
      'lucide-react':{exports:new Proxy({},{get:()=>(p)=>React.createElement('span',{'aria-hidden':'true',className:(p&&p.className)||''},'')})},
      '@/hooks/useAudioRecording':{exports:{useAudioRecording:()=>({state:'idle',blob:null,durationLabel:'0:00',start:()=>{},stop:()=>{},reset:()=>{}})}}
    };
    window.fetch=(u)=>Promise.resolve({ok:true,json:()=>Promise.resolve(${JSON.stringify(setup)})});
    const bundle=${JSON.stringify({ intake, remsa, modules })};
    function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('require','module','exports',bundle.modules[id].code)(n=>load(bundle.modules[id].deps[n]),m,m.exports);return m.exports}
    const h=React.createElement;
    function Host(){
      const QuickIntake=load(bundle.intake).QuickIntake;
      const Remsa=load(bundle.remsa).QuoteJobTypeStart;
      const [text,setText]=React.useState('');
      const remsa=h(Remsa,{jobType:${JSON.stringify(valdJobbtyp)},inherited:false,initialIntent:null,automatic:false,
        onSelectJobType:()=>{},onApply:async()=>{},onApplyOvrig:async()=>{}});
      return h(QuickIntake,{jobTypeStart:remsa,customers:[{customer_id:'c1',name:'Karin Andersson'}],
        selectedCustomer:'',onSelectCustomer:()=>{},value:text,onChange:setText,photos:[],onPhotoFile:()=>{},
        onRemovePhoto:()=>{},maxPhotos:9,onBuild:()=>{},onClose:()=>{},onBuildYourself:()=>{},building:false,hasContent:false});
    }
    ReactDOM.createRoot(document.getElementById('root')).render(h(Host));
  `
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}body{background:#f8fafc;font-family:Arial,sans-serif}button{touch-action:manipulation}</style></head><body><div id="root"></div><script>${safe(fs.readFileSync('node_modules/react/umd/react.development.js', 'utf8'))}</script><script>${safe(fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js', 'utf8'))}</script><script>${safe(script)}</script></body></html>`
}
