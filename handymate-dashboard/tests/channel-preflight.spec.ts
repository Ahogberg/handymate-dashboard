import { test, expect } from '@playwright/test'
import { assessSmsBalance, preflightChannel, clearChannelCache, gateChannel, gateApprovalChannels, channelState } from '../lib/channels/preflight'
import { checkedApprovalInsert } from '../lib/channels/approval-insert'
import { c5Modules } from './helpers/c5-module'
const originalFetch = global.fetch
const originalEnv = { ...process.env }
test.afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv }; clearChannelCache() })
function db(rows: Record<string, any[]> = {}) {
 const calls: any[] = [], writes: any[] = []
 return { calls, writes, rpc: async (name: string, args: unknown) => { calls.push({name,args}); return {error:null} }, from(table:string) {
  const filters: any[] = [];let inserted: any
  const q: any = { eq(k:string,v:any){filters.push([k,v]);return q}, select(){return q}, single(){return q}, maybeSingle(){return q},
   insert(row:any){inserted=row;return q},
   then(resolve:any){calls.push({table,filters});if(inserted)writes.push(inserted);return Promise.resolve(resolve({data:inserted ? {id:'saved'} : (rows[table] || []).filter(r=>filters.every(([k,v])=>r[k]===v)),error:null}))} }
  return q
 } } as any
}
test('SMS uses raw balance, current multipart estimate and refuses unknown currency',()=>{
 expect(assessSmsBalance({ok:true,raw:0,kr:0,currency:'SEK'})).toMatchObject({ok:false,reason:'saldo'})
 expect(assessSmsBalance({ok:true,raw:5200,kr:.52,currency:'SEK'}).ok).toBe(true)
 expect(assessSmsBalance({ok:true,raw:5200,kr:.52,currency:'SEK'},2).ok).toBe(false)
 expect(assessSmsBalance({ok:true,raw:100000,kr:10,currency:'EUR'}).reason).toBe('kontrollfel')
 expect(assessSmsBalance({ok:false,reason:'46elks-nycklar saknas'}).reason).toBe('konfiguration')
})
test('balance cache coalesces concurrent calls; credentials rotate it and no send occurs',async()=>{
 process.env.ELKS_API_USER='u';process.env.ELKS_API_PASSWORD='p';let requests=0
 global.fetch=async()=>{requests++;return new Response(JSON.stringify({balance:0,currency:'SEK'}))}
 const s=db();await Promise.all(Array.from({length:6},()=>gateChannel(s,'a','sms')))
 expect(requests).toBe(1);expect(s.calls.every((c:any)=>c.name==='record_channel_notice')).toBe(true)
 process.env.ELKS_API_PASSWORD='new';await preflightChannel(s,'a','sms');expect(requests).toBe(2)
})
test('Resend checks exact verified sending domain; API presence alone is insufficient',async()=>{
 process.env.RESEND_API_KEY='send';process.env.RESEND_PREFLIGHT_API_KEY='read';let calls=0
 global.fetch=async(_url,opts)=>{calls++;expect((opts?.headers as any).Authorization).toBe('Bearer read');return new Response(JSON.stringify({has_more:false,data:[{name:'handymate.se',status:'verified',capabilities:{sending:'enabled'}},{name:'other.se',status:'pending'}]}))}
 expect((await preflightChannel(db(),'a','email')).ok).toBe(true)
 expect((await preflightChannel(db(),'a','email',{fromAddress:'x@other.se'})).ok).toBe(false)
 expect(calls).toBe(1)
 clearChannelCache();global.fetch=async()=>new Response('',{status:403})
 expect((await preflightChannel(db(),'a','email')).reason).toBe('kontrollfel')
})
test('push targets tenant AND recipient; another member cannot make the channel ready',async()=>{
 delete process.env.VAPID_PRIVATE_KEY
 const s=db({push_tokens:[{business_id:'a',user_id:'other',token:'ExpoPushToken[x]'},{business_id:'b',user_id:'owner',token:'ExpoPushToken[y]'}]})
 expect((await preflightChannel(s,'a','push',{targetUserId:'owner'})).ok).toBe(false)
 expect((await preflightChannel(s,'a','push',{targetUserId:'other'})).ok).toBe(true)
 expect(s.calls.filter((c:any)=>c.table).every((c:any)=>c.filters.some(([k,v]:any)=>k==='business_id'&&v==='a'))).toBe(true)
})
test('creation blocks the send card and persists the same notice shown by status; internal notice is allowed',async()=>{
 delete process.env.ELKS_API_USER
 const s=db()
 const result=await checkedApprovalInsert(s,{business_id:'a',approval_type:'send_sms',payload:{},title:'sms'}).select('id').single()
 expect(result.channelSkipped).toBe(true);expect(s.writes).toHaveLength(0)
 expect(s.calls[0].args.p_message).toBe(channelState('sms','konfiguration').message)
 const internal=await checkedApprovalInsert(s,{business_id:'a',approval_type:'checklist_forslag',title:'checklist'})
 expect(internal.data.id).toBe('saved');expect(s.writes).toHaveLength(1)
})
test('invoice reminder follows its actual channels, including an email-only customer',async()=>{
 process.env.RESEND_API_KEY='key';delete process.env.ELKS_API_USER
 global.fetch=async()=>new Response(JSON.stringify({data:[{name:'handymate.se',status:'verified'}]}))
 expect(await gateApprovalChannels(db(),'a','invoice_reminder',{delivery:{emailToo:true,customerEmail:'a@b.se'}})).toBeNull()
 expect(await gateApprovalChannels(db(),'a','invoice_reminder',{delivery:{emailToo:true,customerEmail:'a@b.se',customerPhone:'0701234567'}})).toMatchObject({channel:'sms',ok:false})
})
test('actual automation handler maps a blocked send to skipped in result, execution log and stats',async()=>{
 process.env.CHANNEL_PREFLIGHT_ENABLED='true'
 const logs:any[]=[],stats:any[]=[]
 const rule={id:'r',business_id:'a',name:'Reminder',is_active:true,is_system:true,action_type:'send_sms',action_config:{template:'Hello'},trigger_type:'event',trigger_config:{},requires_approval:false,respects_work_hours:false,respects_night_mode:false,run_count:0}
 const s:any={from(table:string){let value:any;const q:any={select(){return q},eq(){return q},single(){return q},maybeSingle(){return q},insert(v:any){value=v;return q},update(v:any){value=v;return q},then(r:any){if(table==='v3_automation_logs')logs.push(value);if(table==='v3_automation_rules'&&value)stats.push(value);return r({data:table==='v3_automation_rules'?rule:table==='business_config'?{business_name:'Test'}:null,error:null})}};return q}}
 const load=c5Modules({'@/lib/sms-send':{sendSmsViaElks:async()=>({success:false,channelSkipped:true,channelReason:'saldo',error:'Pausat'})},'@/lib/autonomy/earned-autonomy':{deriveAutonomyKey:()=>null},'@/lib/mandates/mission-mandate':{},'@/lib/mandates/resolve':{},'@/lib/followup/service':{}})
 const result=await load('lib/automation-engine.ts').executeRule(s,'r',{phone:'0701234567'})
 expect(result.status).toBe('skipped');expect(logs[0].status).toBe('skipped');expect(logs[0].result.reason).toBe('saldo');expect(stats[0].last_run_status).toBe('skipped')
})

test('real home banner renders plain-language channel state and disappears after recovery',async()=>{
 const React=require('react'),{act}=require('react-dom/test-utils'),{createRoot}=require('react-dom/client'),{JSDOM}=require('jsdom'),ts=require('typescript'),fs=require('fs')
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'}),g=globalThis as any
 const previous={window:g.window,document:g.document,navigator:g.navigator,IS_REACT_ACT_ENVIRONMENT:g.IS_REACT_ACT_ENVIRONMENT}
 g.window=dom.window;g.document=dom.window.document;Object.defineProperty(g,'navigator',{value:dom.window.navigator,configurable:true});g.IS_REACT_ACT_ENVIRONMENT=true
 let broken=true
 global.fetch=async()=>new Response(JSON.stringify({channels:[channelState('sms',broken?'saldo':undefined)],morning:null}))
 const module={exports:{} as any};const deps:any={'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{__esModule:true,default:({children,...props}:any)=>React.createElement('a',props,children)},'@/lib/BusinessContext':{useBusiness:()=>({business_id:'a'})},'@/lib/CurrentUserContext':{useCurrentUser:()=>({user:{id:'u'},isOwnerOrAdmin:true})}}
 const code=ts.transpileModule(fs.readFileSync('components/dashboard/ChannelBanner.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
 new Function('require','module','exports',code)((n:string)=>deps[n]||require(n),module,module.exports)
 const root=createRoot(dom.window.document.getElementById('root'))
 try{
  await act(async()=>{root.render(React.createElement(module.exports.default))})
  expect(dom.window.document.body.textContent).toContain('Handymates SMS-saldo')
  expect(dom.window.document.body.textContent).not.toContain('API')
  broken=false;await act(async()=>{dom.window.dispatchEvent(new dom.window.Event('focus'))})
  expect(dom.window.document.querySelector('aside')).toBeNull()
 }finally{await act(async()=>root.unmount());dom.window.close();g.window=previous.window;g.document=previous.document;Object.defineProperty(g,'navigator',{value:previous.navigator,configurable:true});g.IS_REACT_ACT_ENVIRONMENT=previous.IS_REACT_ACT_ENVIRONMENT}
})
