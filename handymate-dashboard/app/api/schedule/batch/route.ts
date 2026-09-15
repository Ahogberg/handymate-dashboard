import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { notifyScheduleAssignment } from '@/lib/notifications/schedule-push'
import { svDayRange, svDateStr } from '@/lib/dates'
import { readAll } from '@/lib/schedule/read-all'
import { parsePlanningBatch, planningSlots, intervalsOverlap, type PlanningBatch } from '@/lib/schedule/planning'
export const dynamic='force-dynamic'
export async function POST(request: NextRequest) {
 try {
  const business=await getAuthenticatedBusiness(request)
  if(!business) return NextResponse.json({error:'Unauthorized'},{status:401})
  const bid=business.business_id, user=await getCurrentUser(request,bid)
  if(!user) return NextResponse.json({error:'Behörighet saknas'},{status:403})
  let b: PlanningBatch, body: any
  try { body=await request.json(); b=parsePlanningBatch(body) } catch { return NextResponse.json({error:'Kontrollera titel, personer, datum och tider.'},{status:400}) }
  const all=hasPermission(user,'see_all_projects')
  if(!all && b.business_user_ids.some(id=>id!==user.id)) return NextResponse.json({error:'Du får bara planera egna pass.'},{status:403})
  const db=getServerSupabase()
  const {data:members,error:me}=await db.from('business_users').select('id, name').eq('business_id',bid).eq('is_active',true).in('id',b.business_user_ids)
  if(me) throw me
  if(members?.length!==b.business_user_ids.length) return NextResponse.json({error:'Personen är inte tillgänglig.'},{status:404})
  if(b.project_id) {
   const {data:p,error:pe}=await db.from('project').select('project_id').eq('business_id',bid).eq('project_id',b.project_id).in('status',['active','planning','paused']).maybeSingle()
   if(pe) throw pe
   if(!p) return NextResponse.json({error:'Jobbet är inte tillgängligt.'},{status:404})
   if(!all) {
    const {data:a,error:ae}=await db.from('project_assignment').select('id').eq('business_id',bid).eq('project_id',b.project_id).eq('business_user_id',user.id).limit(1)
    if(ae) throw ae
    if(!a?.length) return NextResponse.json({error:'Jobbet är inte tillgängligt.'},{status:404})
   }
  }
  const key=createHash('sha256').update(`${bid}:${user.id}:${b.request_id}`).digest('hex')
  const rows=planningSlots(b).map((slot,i)=>({...slot,id:`sch_batch_${key}_${i}`,business_id:bid,project_id:b.project_id,title:b.title,description:b.description,all_day:b.all_day,type:b.type,color:b.color,status:'scheduled',created_by:user.id}))
  const previous=()=>readAll(()=>db.from('schedule_entry').select('*').eq('business_id',bid).like('id',`sch_batch_${key}_%`).order('id'))
  const replay=(old:any[])=> {
   const same=old.length===rows.length && rows.every(row=>{const match=old.find(x=>x.id===row.id); return match && Object.entries(row).every(([k,v])=> k.endsWith('_datetime') ? Date.parse(match[k])===Date.parse(String(v)) : match[k]===v)})
   return same ? NextResponse.json({entries:old,replayed:true}) : NextResponse.json({error:'Planeringen har ändrats. Ladda om innan du skapar nya pass.'},{status:409})
  }
  const old=await previous()
  if(old.length) return replay(old)
  const range=svDayRange(b.dates[0],b.dates[b.dates.length-1])
  const [entries,bookings,absences]=await Promise.all([
   readAll(()=>db.from('schedule_entry').select('*').eq('business_id',bid).in('business_user_id',b.business_user_ids).neq('status','cancelled').lt('start_datetime',range.toExclusive).gt('end_datetime',range.from).order('id')),
   readAll(()=>db.from('booking').select('booking_id, assigned_user_id, scheduled_start, scheduled_end, status').eq('business_id',bid).in('assigned_user_id',b.business_user_ids).neq('status','cancelled').lt('scheduled_start',range.toExclusive).or(`scheduled_end.gt.${range.from},scheduled_end.is.null`).order('booking_id')),
   readAll(()=>db.from('time_off_request').select('id, business_user_id, start_date, end_date').eq('business_id',bid).in('business_user_id',b.business_user_ids).eq('status','approved').lte('start_date',b.dates[b.dates.length-1]).gte('end_date',b.dates[0]).order('id'))
  ])
  const candidates=[...entries,...bookings.map(x=>({...x,business_user_id:x.assigned_user_id,start_datetime:x.scheduled_start,end_datetime:x.scheduled_end || svDayRange(svDateStr(new Date(x.scheduled_start)),svDateStr(new Date(x.scheduled_start))).toExclusive})),...absences.map(x=>({...x,start_datetime:svDayRange(x.start_date,x.end_date).from,end_datetime:svDayRange(x.start_date,x.end_date).toExclusive}))]
  const conflicts=candidates.filter(x=>rows.some(r=>r.business_user_id===x.business_user_id && intervalsOverlap(r.start_datetime,r.end_datetime,x.start_datetime,x.end_datetime))).map(x=>({business_user_id:x.business_user_id,member_name:members.find(m=>m.id===x.business_user_id)?.name,start_datetime:x.start_datetime,end_datetime:x.end_datetime}))
  if(conflicts.length && body.allow_conflicts!==true) return NextResponse.json({code:'schedule_conflicts',error:'Valda pass överlappar befintlig planering eller frånvaro.',conflicts},{status:409})
  const {data:created,error}=await db.from('schedule_entry').insert(rows).select('*')
  if(error?.code==='23505') return replay(await previous())
  if(error) throw error
  if(!created || created.length!==rows.length) throw new Error('Incomplete insert result')
  for(const id of b.business_user_ids) if(id!==user.id) void notifyScheduleAssignment({businessId:bid,businessUserId:id,title:`${b.title} (${b.dates.length} pass)`,startDatetime:rows[0].start_datetime}).catch(console.error)
  return NextResponse.json({entries:created,conflicts,replayed:false})
 } catch(error) { console.error('Planning batch failed',error); return NextResponse.json({error:'Sparningen kunde inte bekräftas. Kontrollera samma sparning igen.'},{status:503}) }
}
