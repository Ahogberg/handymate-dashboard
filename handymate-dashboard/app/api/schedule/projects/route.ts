import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { readAll } from '@/lib/schedule/read-all'
import { plannedTeamHours, planningBudget } from '@/lib/schedule/planning'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
 try {
  const business=await getAuthenticatedBusiness(request)
  if(!business) return NextResponse.json({error:'Unauthorized'},{status:401})
  const user=await getCurrentUser(request,business.business_id)
  if(!user) return NextResponse.json({error:'Behörighet saknas'},{status:403})
  const db=getServerSupabase(), bid=business.business_id
  let allowed: string[]|null=null
  if(!hasPermission(user,'see_all_projects')) {
   allowed=(await readAll(()=>db.from('project_assignment').select('id, project_id').eq('business_id',bid).eq('business_user_id',user.id).order('id'))).map(x=>x.project_id)
   if(!allowed.length) return NextResponse.json({projects:[]})
  }
  const projects=await readAll(()=>{
   let q=db.from('project').select('project_id, name, budget_hours').eq('business_id',bid).in('status',['active','planning','paused']).order('project_id')
   return allowed ? q.in('project_id',allowed) : q
  })
  if(!projects.length) return NextResponse.json({projects:[]})
  const ids=projects.map(p=>p.project_id)
  const [times,entries]=await Promise.all([
   readAll(()=>db.from('time_entry').select('time_entry_id, project_id, duration_minutes').eq('business_id',bid).in('project_id',ids).order('time_entry_id')),
   readAll(()=>db.from('schedule_entry').select('id, project_id, business_user_id, start_datetime, end_datetime, all_day, status').eq('business_id',bid).in('project_id',ids).neq('status','cancelled').order('id'))
  ])
  return NextResponse.json({projects:projects.map(p=>({...p,...planningBudget(p.budget_hours,times.filter(t=>t.project_id===p.project_id).reduce((n,t)=>n+Math.max(0,Number(t.duration_minutes)||0),0)),planned_hours:plannedTeamHours(entries.filter(e=>e.project_id===p.project_id)),scheduled_member_ids:Array.from(new Set(entries.filter(e=>e.project_id===p.project_id && e.status==='scheduled').map(e=>e.business_user_id)))}))})
 } catch(error) { console.error('Planning projects failed',error); return NextResponse.json({error:'Kunde inte hämta timunderlaget. Försök igen.'},{status:503}) }
}
