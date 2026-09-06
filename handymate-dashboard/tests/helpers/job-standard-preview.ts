import { existsSync, readFileSync } from 'fs'
import path from 'path'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'

/** Real React components, real CSS and icons. Only the surrounding shell is a fixture. */
export async function jobStandardPreview() {
  const sources: Record<string, string> = {}, styles = new Set<string>()
  function add(file: string) {
    const id = '@/' + file.replace(/\.tsx?$/, '')
    if (sources[id]) return
    const compiled = ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, jsx:ts.JsxEmit.React, esModuleInterop:true } }).outputText
    sources[id] = compiled
    for (const match of Array.from(compiled.matchAll(/require\("([^"]+)"\)/g))) {
      const dep = match[1]
      if (dep === 'react' || dep === 'lucide-react') continue
      const relative = dep.startsWith('@/') ? dep.slice(2) : dep.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file),dep)) : ''
      if (!relative) throw Error('Unmapped browser dependency: '+dep)
      if (relative.endsWith('.css')) { styles.add(relative); continue }
      const target = [relative+'.ts', relative+'.tsx', relative+'/index.ts'].find(existsSync)
      if (!target) throw Error('Missing dependency: '+relative)
      add(target)
    }
  }
  add('app/onboarding/components/Step3HowYouWork.tsx')
  add('components/onboarding/JobTypeQuoteSetup.tsx')
  add('lib/onboarding/save-progress.ts')
  add('components/onboarding/SaveJobStandardFromQuote.tsx')
  const css = (await postcss([tailwind({ ...config, content: Object.keys(sources).map(k=>({ raw:sources[k], extension:'tsx' })) })]).process('@tailwind base; @tailwind components; @tailwind utilities;',{from:undefined})).css
  const script = `const sources=${JSON.stringify(sources)}, cache={react:React,'lucide-react':LucideReact};
    function load(id) { if (id.endsWith('.css')) return {}; if(cache[id]) return cache[id]; if(!sources[id]) throw Error('Missing '+id);
      const exports={}; cache[id]=exports; new Function('require','exports',sources[id])(name=>{
        if(name.startsWith('.')) { const p=id.split('/');p.pop(); for(const s of name.split('/')) { if(s==='..')p.pop();else if(s!=='.')p.push(s); } name=p.join('/'); }
        return load(name);
      },exports);return exports;
    }
    function Host(){const h=React.createElement;const [view,setView]=React.useState('jobs');const [data,setData]=React.useState({trade:'electrician',specialties:[],days:[true,true,true,true,true,false,false],pricingModel:'one_standard_rate',standardHourlyRate:950});const [error,setError]=React.useState('');
      window.preview={setView,setData};
      return h(React.Fragment,null,h('nav',{className:'flex gap-4 py-3 text-teal-800'},...['jobs','standards','reuse'].map(v=>h('button',{key:v,onClick:()=>setView(v)},v==='jobs'?'Jobbval':v==='standards'?'Standardrader':'Återanvänd offert'))),error&&h('p',{role:'alert'},error),
        view==='jobs'?h('div',{className:'ob-screen',style:{height:'auto',minHeight:0}},h(load('@/app/onboarding/components/Step3HowYouWork').default,{data,setData,onBack:()=>{},onNext:async()=>{setError('');try{await load('@/lib/onboarding/save-progress').persistOnboardingProgress({config:{specialties:data.specialties}});setView('standards');}catch(err){setError(err.message);}}})):
        view==='standards'?h(load('@/components/onboarding/JobTypeQuoteSetup').JobTypeQuoteSetup,{syncOnboarding:true,initialJobTypes:data.specialties.map(load('@/lib/job-types').slugifyJobType)}):
        h(load('@/components/onboarding/SaveJobStandardFromQuote').SaveJobStandardFromQuote,{jobType:'installera_laddbox',items:[{id:'q1',item_type:'item',description:'Arbetstid i offerten',quantity:4,unit:'tim',linked_product_id:'work'},{id:'q2',item_type:'item',description:'Kundunik fritext',quantity:1,unit:'st'}]}));}
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Host));`
  const safe = (s:string)=>s.replace(/<\/script/gi,'<\\/script')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Handymate · jobb och offertstandard</title><style>${css}\n${readFileSync('app/onboarding/onboarding.css','utf8')}\n${Array.from(styles).map(f=>readFileSync(f,'utf8')).join('\n')}\nbody{background:#f5f8f7;font-family:Arial,sans-serif}main{max-width:850px;margin:24px auto;padding:0 16px}.ob-body{overflow:visible}.ob-screen{overflow:visible}</style></head><body><main><p style="color:#64748b;font-size:12px">Granskning · exempeldata · inga utskick</p><div id="root"><h1>Dina jobb blir grunden till nästa offert</h1><p>Välj jobbtyp, lägg till standardrader och granska offertens början.</p></div></main>
    <script>${safe(readFileSync('node_modules/react/umd/react.production.min.js','utf8'))}</script><script>${safe(readFileSync('node_modules/react-dom/umd/react-dom.production.min.js','utf8'))}</script><script>window.react=React;</script><script>${safe(readFileSync('node_modules/lucide-react/dist/umd/lucide-react.min.js','utf8'))}</script><script>${safe(script)}</script></body></html>`
}
