import type { SupabaseClient } from '@supabase/supabase-js'
import type { MissionHandover } from '@/lib/mission/handover'
import { followupEnabled } from './service'
import { followupLabels,followupReasons } from './presentation'
export async function attachMissionFollowups(db:SupabaseClient,businessId:string,missionId:string,handover:MissionHandover):Promise<MissionHandover>{
 if(!followupEnabled())return handover
 const [rows,runner]=await Promise.all([
  db.from('agent_followup').select('id,quote_id,due_at,state,reason,approval_id').eq('business_id',businessId).eq('mission_id',missionId).order('created_at',{ascending:false}).limit(51),
  db.from('agent_followup_runner').select('enabled,last_tick_at').eq('singleton',true).single(),
 ])
 if(rows.error||runner.error||!Array.isArray(rows.data)||rows.data.length>50)throw Error('Uppdragets planerade uppföljningar kunde inte kontrolleras.')
 const healthy=runner.data?.enabled===true&&Date.parse(runner.data.last_tick_at)>Date.now()-300000
 const active=rows.data.filter(x=>['scheduled','prepared'].includes(x.state))
 const followups=rows.data.map(x=>({id:x.id,quoteId:x.quote_id,dueAt:x.due_at,state:x.state,label:followupLabels[x.state]||'Behöver kontrolleras',detail:followupReasons[x.reason||'']||'Kontrollen görs från den planerade tiden.'}))
 if(handover.state==='recorded'&&active.length)return {...handover,followups,headline:healthy?'Teamet har nästa steg planerat':'Nästa körning behöver kontrolleras',nextStep:healthy?'Daniel förbereder offertuppföljningarna vid de sparade tiderna. Du granskar innan SMS skickas.':'Planerna finns sparade, men körarens senaste kontroll är för gammal. Räkna inte med utförd uppföljning.',state:healthy?'recorded':'needs_attention'}
 return {...handover,followups}
}
