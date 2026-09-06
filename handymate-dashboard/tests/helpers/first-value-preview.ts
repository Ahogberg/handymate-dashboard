import { readFileSync } from 'fs'
import ts from 'typescript'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config'
import { deriveKomIgangTasks } from '../../lib/onboarding/kom-igang-tasks'

/** Kör de riktiga presentationskomponenterna med tydligt märkt exempeldata.
 * Externa API:er, agentnamn och dokument i skissen är fixtures. */
export async function firstValuePreview() {
  const files = [
    'app/dashboard/quotes/_shared/useQuoteSectionNavigation.ts',
    'lib/BusinessContext.tsx', 'lib/JobbuddyContext.tsx',
    'lib/onboarding/first-focus.ts', 'lib/onboarding/first-mission-handoff.ts',
    'lib/onboarding/first-assignment-options.ts', 'lib/onboarding/kom-igang-tasks.ts',
    'app/onboarding/components/FirstAssignmentFinal.tsx',
    'components/onboarding/FirstQuoteGuide.tsx', 'components/jarvis/KomIgangRail.tsx',
    'components/jarvis/FirstMissionHandoff.tsx',
  ]
  const css = (await postcss([tailwind({ ...config, content: files })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })).css
  const loads = files.map(file => {
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText
    return `load(${JSON.stringify('@/' + file.replace(/\.tsx?$/, ''))}, ${JSON.stringify(source)});`
  }).join('\n')
  const previewTasks = deriveKomIgangTasks({ firstFocus:'fler_jobb', ring_test:false, karin_has_invoice_data:false, has_quote:false, has_mission:false, customer_count:0, segmented_customer_count:0, pwa:false, pending_real_cards:0 })
  const script = `
    if (location.protocol === 'file:') window.fetch = async () => ({ ok: true, json: async () => ({ tasks: ${JSON.stringify(previewTasks)} }) });
    const modules = { react: React };
    function load(id, code) {
      const exports = {}; new Function('require','exports',code)(name => {
        if (name.startsWith('.')) { const parts = id.split('/'); parts.pop(); for (const part of name.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); } name = parts.join('/'); }
        if (!(name in modules)) throw Error('Missing module '+name); return modules[name];
      }, exports); modules[id] = exports;
    }
    modules['lucide-react'] = new Proxy({}, { get: () => props => React.createElement('span', { 'aria-hidden': true, style: { width: props.size || 16, display:'inline-block' } }, '•') });
    modules['next/link'] = { __esModule: true, default: props => React.createElement('a', props, props.children) };
    modules['@/lib/agents/team'] = { getAgentById: id => ({ name: id, avatar: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="#ccfbf1"/><text x="12" y="26" fill="#115e59">'+id[0].toUpperCase()+'</text></svg>') }) };
    modules['@/components/agents/AgentAvatar'] = { AgentAvatar: () => React.createElement('span', { 'aria-hidden': true }, 'M') };
    ${loads}
    function Host() {
      const [view, setView] = React.useState('start');
      const [tenant, setTenant] = React.useState('firm-a');
      const [customer, setCustomer] = React.useState(false);
      const [target, setTarget] = React.useState('');
      const navigate = modules['@/app/dashboard/quotes/_shared/useQuoteSectionNavigation'].useQuoteSectionNavigation(React.useCallback(() => {}, []));
      const business = { business_id: tenant, business_name: 'Anderssons El', created_at: new Date().toISOString() };
      window.preview = { setView, setTenant };
      const h = React.createElement;
      return h(modules['@/lib/BusinessContext'].BusinessContext.Provider, { value: business },
        h(modules['@/lib/JobbuddyContext'].JobbuddyProvider, { key: tenant },
          h('nav', { className: 'flex flex-wrap gap-3 mb-5', 'aria-label': 'Skissvyer' },
            ...['start','offert','hem'].map(v => h('button', { className:'min-h-[44px] text-teal-800 underline', key:v, onClick:()=>setView(v) }, v))),
          view === 'start' ? h('div', { className:'ob-card-wrap' }, h('div', { className:'ob-screen', style:{ padding:20, height:'auto', minHeight:0, flex:1, overflowY:'auto' } }, h(modules['@/app/onboarding/components/FirstAssignmentFinal'].FirstAssignmentFinal, {
            data: { businessId: tenant, firstFocus:'fler_jobb', firstQuoteSelection: { jobTypeSlug:'service', templateId:'service' } },
            unpaidCount:0, openDealsCount:0, onFirstQuote:()=>setView('offert'), onFinish:()=>setView('hem') }), h('button', { className:'ob-cta ghost' }, 'Visa mig runt först'))) :
          view === 'offert' ? h('div', null,
            h(modules['@/components/onboarding/FirstQuoteGuide'].FirstQuoteGuide, { companyName:business.business_name, hasCustomer:customer,
              onCustomer:()=>document.getElementById('customer').focus(), onSection:section=>{ setTarget(section); navigate(section); } }),
            h('div', { className:'rounded-xl border border-slate-200 bg-white p-5' },
              h('h2', { className:'text-xl font-semibold mb-3' }, 'Exempeloffert · Servicebesök'),
              h('label', null, 'Kund ', h('select', { id:'customer', onChange:e=>setCustomer(Boolean(e.target.value)), value:customer?'a':'' }, h('option', { value:'' }, 'Välj kund'), h('option', { value:'a' }, 'Exempelkund'))),
              h('p', { className:'my-4' }, 'Offertdokumentet här är förenklat exempelunderlag.'),
              h('output', { 'data-section': target }, target))) : h(React.Fragment, null,
                h(modules['@/components/jarvis/KomIgangRail'].KomIgangRail),
                h(modules['@/components/jarvis/FirstMissionHandoff'].default), h(Chat)))
      );
    }
    function Chat() {
      const chat = modules['@/lib/JobbuddyContext'].useJobbuddy();
      return chat.isOpen ? React.createElement('section', { className:'rounded-xl bg-white border border-teal-200 p-4 mt-4' },
        React.createElement('label', null, 'Fråga till Matte', React.createElement('textarea', { className:'block w-full border rounded p-2 mt-2', value:chat.pendingPrompt || '', onChange:e=>chat.setPendingPrompt(e.target.value) })),
        React.createElement('p', { className:'text-sm mt-3' }, 'Skiss: inget skickas till AI.'), React.createElement('button', { onClick:()=>chat.setIsOpen(false) }, 'Stäng Matte')) : null;
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Host));
  `
  const safeScript = (text: string) => text.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Handymate – första nyttan</title><style>${css}\n${readFileSync('app/onboarding/onboarding.css','utf8')}\nbody{background:#f8fafc;font-family:Arial,sans-serif}main{max-width:760px;margin:24px auto;padding:0 16px}</style></head><body><main><p style="color:#64748b;font-size:12px">Granskningsskiss · exempeldata · inga utskick</p><div id="root"></div></main><script>${safeScript(readFileSync('node_modules/react/umd/react.production.min.js','utf8'))}</script><script>${safeScript(readFileSync('node_modules/react-dom/umd/react-dom.production.min.js','utf8'))}</script><script>${safeScript(script)}</script></body></html>`
}
