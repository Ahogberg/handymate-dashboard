import { readFileSync } from 'fs'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'

/** Riktig React-komponent, isolerad transport och kontext. Inga utskick. */
export async function planningStartPreview() {
  const file = 'components/onboarding/PlanningStart.tsx'
  const css = (await postcss([tailwind({ ...config, content: [file] })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })).css
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText
  const script = `
    const h = React.createElement;
    const Business = React.createContext(null), User = React.createContext(null);
    const modules = { react: React,
      'next/link': { __esModule:true, default:props=>h('a',props,props.children) },
      '@/lib/BusinessContext': { useBusiness:()=>React.useContext(Business) },
      '@/lib/CurrentUserContext': { useCurrentUser:()=>React.useContext(User) },
      '@/components/agents/AgentAvatar': { AgentAvatar:()=>h('span',{'aria-hidden':true},'M') }
    };
    const exports = {};
    new Function('require','exports',${JSON.stringify(code)})(name=>{if(!modules[name])throw Error(name);return modules[name]},exports);
    function Host(){
      const [step,setStep]=React.useState('team'),[tenant,setTenant]=React.useState('firm-a'),[owner,setOwner]=React.useState(true),[week,setWeek]=React.useState('');
      window.preview={setStep,setTenant,setOwner};
      return h(Business.Provider,{value:{business_id:tenant,created_at:new Date().toISOString()}},h(User.Provider,{value:{isOwnerOrAdmin:owner}},
        h(exports.PlanningStart,{step,visibleWeekStart:week,onShowWeek:setWeek})));
    }
    ReactDOM.createRoot(document.getElementById('root')).render(h(Host));
  `
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{font-family:Arial;background:#f8fafc;padding:16px}main{max-width:700px;margin:auto}</style><main><div id="root"></div></main><script>${safe(readFileSync('node_modules/react/umd/react.production.min.js','utf8'))}</script><script>${safe(readFileSync('node_modules/react-dom/umd/react-dom.production.min.js','utf8'))}</script><script>${safe(script)}</script></html>`
}
