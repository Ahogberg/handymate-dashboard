import { readFileSync } from 'fs'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'

/** Real React components and CSS. Only API responses and the editor host are fixtures. */
export async function productionPreview() {
  const files = ['lib/followup/presentation.ts', 'components/quotes/ScheduledFollowup.tsx', 'lib/onboarding/work-sample.ts', 'lib/quotes/visit-rule.ts', 'lib/jarvis/brain-overview.ts',
    'components/onboarding/WorkSampleStart.tsx', 'components/onboarding/WorkSampleResume.tsx',
    'components/quotes/VisitRuleEditor.tsx', 'components/quotes/QuoteHandoff.tsx', 'components/jarvis/home/BrainOverview.tsx']
  const css = (await postcss([tailwind({ ...config, content: files })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })).css
  const loads = files.map(file => `load(${JSON.stringify('@/' + file.replace(/\.tsx?$/, ''))}, ${JSON.stringify(ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, jsx:ts.JsxEmit.React, esModuleInterop:true } }).outputText)});`).join('\n')
  const script = `
    const modules = { react: React };
    modules['@/components/agents/AgentAvatar'] = { AgentAvatar: () => React.createElement('span', { 'aria-hidden': true }, 'D') };
    let missionFixture={loading:true,error:null,mission:null,handover:null};
    modules['@/lib/mission/MissionProvider'] = { useMission: () => missionFixture };
    function load(id, code) { const exports = {}; new Function('require','exports',code)(name => {
      if (name.startsWith('.')) { const parts=id.split('/'); parts.pop(); for (const p of name.split('/')) { if(p==='..') parts.pop(); else if(p!=='.') parts.push(p); } name=parts.join('/'); }
      if (!(name in modules)) throw Error('Missing '+name); return modules[name];
    }, exports); modules[id]=exports; }
    ${loads}
    const h=React.createElement;
    function Host() {
      const [view,setView]=React.useState('start'), [business,setBusiness]=React.useState('firm-a'), [job,setJob]=React.useState('dorrar'), [description,setDescription]=React.useState('Kunden står för dörrarna.'), [applied,setApplied]=React.useState(null), [receipt,setReceipt]=React.useState(''), [home,setHome]=React.useState({handled:undefined,needsYou:undefined,moneyCases:undefined});
      window.fixture={setView,setBusiness,setJob,setDescription,settleHomeEmpty:()=>{missionFixture={loading:false,error:null,mission:null,handover:null};setHome({handled:0,needsYou:0,moneyCases:0});}};
      return h(React.Fragment,null,
        h('nav',{'aria-label':'Testvyer',className:'flex gap-3 mb-4'},...['start','resume','regel','handoff','home'].map(v=>h('button',{key:v,onClick:()=>setView(v),className:'min-h-[44px] underline'},v))),
        view==='start'?h('div',{className:'ob-card-wrap'},h(modules['@/components/onboarding/WorkSampleStart'].WorkSampleStart,{key:business,businessId:business,onContinue:async(source,sample)=>{
          const r=await fetch('/fixture/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,sample})}); if(!r.ok) throw Error('Kunde inte spara. Din text finns kvar.'); setReceipt('Sparat på servern');
        }})):null,
        view==='resume'?h(modules['@/components/onboarding/WorkSampleResume'].WorkSampleResume,{key:business,businessId:business,hasContent:true,onApply:s=>{setApplied(s);setDescription(s.description)},onSource:setDescription}):null,
        view==='regel'?h(modules['@/components/quotes/VisitRuleEditor'].VisitRuleEditor,{key:business+job,jobType:job,description,onApply:setDescription}):null,
        view==='handoff'?h(modules['@/components/quotes/QuoteHandoff'].QuoteHandoff,{quoteId:'q',revision:'sent',businessId:business}):null,
        view==='home'?h(modules['@/components/jarvis/home/BrainOverview'].BrainOverview,home):null,
        h('output',{'data-testid':'description'},description),h('output',{'data-testid':'applied'},JSON.stringify(applied)),h('p',{role:'status'},receipt));
    }
    ReactDOM.createRoot(document.getElementById('root')).render(h(Host));`
  const safe = (s:string)=>s.replace(/<\/script/gi,'<\\/script')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}\n${readFileSync('app/onboarding/onboarding.css','utf8')}\nbody{background:#f8fafc;font-family:Arial,sans-serif}main{max-width:1000px;margin:24px auto;padding:0 16px}.ob-screen{min-height:0;height:auto}.ob-body{overflow:visible}output{display:block;overflow-wrap:anywhere}</style></head><body><main><div id="root"></div></main><script>${safe(readFileSync('node_modules/react/umd/react.production.min.js','utf8'))}</script><script>${safe(readFileSync('node_modules/react-dom/umd/react-dom.production.min.js','utf8'))}</script><script>${safe(script)}</script></body></html>`
}
