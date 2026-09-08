import {readFileSync} from 'fs'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'
export async function followupPreview(){
 const files=['lib/followup/presentation.ts','components/quotes/ScheduledFollowup.tsx']
 const css=(await postcss([tailwind({...config,content:files})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css
 const chunks=files.map(f=>`load(${JSON.stringify('@/'+f.replace(/\.tsx?$/,''))},${JSON.stringify(ts.transpileModule(readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText)});`).join('\n')
 const safe=(s:string)=>s.replace(/<\/script/gi,'<\\/script')
 return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{padding:16px;font-family:Arial;background:white}main{max-width:720px;margin:auto}</style></head><body><main id="root"></main><script>${safe(readFileSync('node_modules/react/umd/react.production.min.js','utf8'))}</script><script>${safe(readFileSync('node_modules/react-dom/umd/react-dom.production.min.js','utf8'))}</script><script>const modules={react:React};function load(id,code){const exports={};new Function('require','exports',code)(n=>modules[n],exports);modules[id]=exports;} ${safe(chunks)} ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(modules['@/components/quotes/ScheduledFollowup'].ScheduledFollowup,{quoteId:'q'}));</script></body></html>`
}
