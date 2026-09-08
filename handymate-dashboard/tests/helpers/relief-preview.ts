import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'

export async function reliefPreview(mode: 'intake' | 'report' | 'mission' | 'day' = 'intake') {
  const modules: Record<string, {code: string; deps: Record<string,string>}> = {}
  const stubs = ['react','react/jsx-runtime','next/navigation','@/lib/JobbuddyContext','@/lib/BusinessContext','@/lib/CurrentUserContext']
  function add(file: string): string {
    file=path.normalize(file)
    if(modules[file])return file
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText
    const deps: Record<string,string>={};modules[file]={code,deps}
    for(const m of Array.from(code.matchAll(/require\(["']([^"']+)["']\)/g))){
      const name=m[1];if(stubs.includes(name)){deps[name]=name;continue}
      const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name)
      const resolved=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())
      if(!resolved)throw Error('Unexpected dependency: '+name)
      deps[name]=add(resolved)
    }
    return file
  }
  const entry=add(mode==='day'?'components/relief/MyDayCard.tsx':mode==='intake'?'components/relief/ReliefStart.tsx':mode==='report'?'components/day-close/DayClose.tsx':'lib/mission/MissionProvider.tsx')
  if(mode==='mission')add('components/mission/MissionHandoverCard.tsx')
  const css=(await postcss([tailwind({...config,content:Object.keys(modules)})]).process('@tailwind base; @tailwind components; @tailwind utilities;',{from:undefined})).css
  const script=`
    window.businessId='b';window.actor={id:'u',user_id:'auth-u',business_id:'b'};
    const cache={react:{exports:React},'react/jsx-runtime':{exports:{jsx:(t,p,k)=>React.createElement(t,{...p,key:k}),jsxs:(t,p,k)=>React.createElement(t,{...p,key:k}),Fragment:React.Fragment}},'next/navigation':{exports:{useRouter:()=>({push:url=>{window.navigated=url}})}},
      '@/lib/JobbuddyContext':{exports:{useJobbuddy:()=>({setPendingPrompt:v=>{window.prefilled=v},setActiveTab:()=>{},setIsOpen:()=>{}})}},
      '@/lib/BusinessContext':{exports:{useBusiness:()=>({business_id:window.businessId})}},
      '@/lib/CurrentUserContext':{exports:{useCurrentUser:()=>({user:window.actor})}}};
    const bundle=${JSON.stringify({entry,modules})};
    function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;new Function('require','module','exports',bundle.modules[id].code)(n=>load(bundle.modules[id].deps[n]),m,m.exports);return m.exports}
    const h=React.createElement;
    function MissionView(){const m=load(bundle.entry).useMission();return h('div',null,
      m.loading?h('p',{role:'status'},'Laddar uppdrag…'):null,
      m.error?h('div',{role:'alert'},m.error,h('button',{onClick:m.refresh},'Försök igen')):null,
      m.handover?h(load('components/mission/MissionHandoverCard.tsx').MissionHandoverCard,{handover:m.handover}):null,
      !m.loading&&!m.error&&!m.mission?h('p',null,'Inget aktivt uppdrag'):null);}
    function Host(){const [version,setVersion]=React.useState(0);window.switchActor=(id)=>{window.actor={...window.actor,id};setVersion(v=>v+1)};
      return ${mode==='day'?"h(load(bundle.entry).MyDayCard)":mode==='mission'?"h(load(bundle.entry).MissionProvider,null,h(MissionView))":mode==='report'?"h(load(bundle.entry).default,{projectId:'p',projectName:'Köket',initiallyOpen:true})":"h(load(bundle.entry).ReliefStart,{businessId:'b',userId:'auth-u',canQuote:true})"};}
    ReactDOM.createRoot(document.getElementById('root')).render(h(React.StrictMode,null,h(Host)));
  `
  const safe=(s:string)=>s.replace(/<\/script/gi,'<\\/script')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}body{background:#f8fafc;font-family:Arial,sans-serif}main{max-width:900px;margin:24px auto;padding:0 16px}button{touch-action:manipulation}</style></head><body><main id="root"></main><script>${safe(fs.readFileSync('node_modules/react/umd/react.development.js','utf8'))}</script><script>${safe(fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js','utf8'))}</script><script>${safe(script)}</script></body></html>`
}
