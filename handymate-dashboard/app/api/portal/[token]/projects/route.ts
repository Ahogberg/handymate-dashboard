import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

// Force-dynamic så Vercel Edge inte cachar respons. Token-baserade publika
// routes är cache-känsliga (samma URL = samma key) och nyligen ändrade rader
// kan missas. Safe default oavsett om cache faktiskt är boven i nuvarande
// debug-session.
export const dynamic = 'force-dynamic'

async function getCustomerFromToken(token: string) {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('customer')
    .select('customer_id, business_id, portal_enabled')
    .eq('portal_token', token)
    .single()
  if (error) {
    console.error('[portal/projects] customer lookup error:', error)
  }
  if (!data || !data.portal_enabled) return null
  return data
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const customer = await getCustomerFromToken(params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const supabase = getServerSupabase()

    // Hämta ALLA projekt för kunden — inkl. completed/cancelled. Kunden ska
    // ha full insyn i sin historik, och ÄTA kan skickas i efterhand på
    // completed-projekt (slutbesiktning, garanti, post-completion-tillägg).
    // Aliasar progress_percent → progress eftersom frontend (PortalHome m.fl.)
    // läser p.progress. Tidigare select:ade routen `progress` direkt vilket
    // inte finns på project-tabellen → PostgREST returnerade 42703 → routen
    // sväljde error tyst (data=null → []). Anti-pattern fixad nedan.
    const { data: rawProjects, error: projectsError } = await supabase
      .from('project')
      .select('project_id, name, status, description, progress:progress_percent, created_at, updated_at, completed_at')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .order('created_at', { ascending: false })

    if (projectsError) {
      // Detaljerna stannar i loggen. Rutten är öppen för vem som helst med en
      // portallänk, och `message`/`code`/`details`/`hint` från PostgREST
      // beskriver tabeller, kolumner och policyer — samma sorts inre detaljer
      // som inte ska nå kunden.
      console.error('[portal/projects] query error:', projectsError)
      return NextResponse.json({ error: 'Kunde inte hämta projekten just nu' }, { status: 500 })
    }

    // Sortering: aktiva projekt först (planning/active/in_progress/etc),
    // sen completed (senaste completed_at först), cancelled sist av allt.
    // Inom samma status-rank behålls created_at-ordningen från Supabase.
    const projects = (rawProjects || []).sort((a: any, b: any) => {
      const rank = (s: string) => {
        if (s === 'cancelled') return 2
        if (s === 'completed') return 1
        return 0
      }
      const ra = rank(a.status)
      const rb = rank(b.status)
      if (ra !== rb) return ra - rb
      if (ra === 1 && a.completed_at && b.completed_at) {
        return new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
      }
      return 0
    })

    // For each project, get milestones, latest log, stages, and photos
    const enriched = await Promise.all((projects || []).map(async (p: any) => {
      const [milestonesRes, logsRes, scheduleRes, ataRes, stagesRes, photosRes] = await Promise.all([
        supabase
          .from('project_milestone')
          .select('name, status, sort_order')
          .eq('project_id', p.project_id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('project_log')
          // `description:work_description` — ALIAS. Byggdagboken har
          // `work_description`/`notes`, aldrig `description`
          // (sql/rot_rut_documents.sql:64). Frågan gav 42703, så kundens
          // portal har aldrig visat senaste dagboksanteckningen.
          .select('description:work_description, created_at')
          .eq('project_id', p.project_id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('schedule_entry')
          // Kolumnerna heter `start_datetime`/`end_datetime`
          // (sql/schedule_tables.sql:8). Frågan bad om `start_time`/`end_time`
          // — 42703 — så kundportalen har aldrig visat nästa besök.
          // Aliasen behåller formen `nextVisit` skickas ut i; filter och
          // sortering måste däremot använda de riktiga namnen.
          .select('title, start_time:start_datetime, end_time:end_datetime')
          .eq('project_id', p.project_id)
          .gte('start_datetime', new Date().toISOString())
          .order('start_datetime', { ascending: true })
          .limit(1),
        supabase
          .from('project_change')
          .select('change_id, ata_number, change_type, description, items, total, status, sign_token, signed_at, signed_by_name, created_at')
          .eq('project_id', p.project_id)
          .in('status', ['sent', 'signed', 'approved'])
          .order('ata_number', { ascending: true }),
        supabase
          .from('project_stages')
          .select('stage, label, completed_at, completed_by, note')
          .eq('project_id', p.project_id)
          .order('created_at', { ascending: true }),
        supabase
          .from('project_photos')
          .select('id, url, caption, type, uploaded_at')
          .eq('project_id', p.project_id)
          .order('uploaded_at', { ascending: false })
          .limit(12),
      ])

      // Felsökningen från TD-22:s ÄTA-jakt är borttagen (2026-08-07). Den
      // loggade hela ÄTA-listan per projekt vid VARJE kundvisning och körde
      // dessutom en extra count-fråga per projekt bara för att jämföra
      // radantal — en N+1 på en kundvänd route, kvar långt efter att jakten
      // var över.
      //
      // Ett verkligt fel ska däremot inte förbli tyst: en misslyckad
      // ÄTA-hämtning gav förut en tom lista utan spår.
      if (ataRes.error) {
        console.error('[portal/projects] ÄTA-hämtning misslyckades:', ataRes.error.message, {
          project_id: p.project_id,
        })
      }

      return {
        ...p,
        milestones: milestonesRes.data || [],
        latestLog: logsRes.data?.[0] || null,
        nextVisit: scheduleRes.data?.[0] || null,
        atas: (ataRes.data || []).map((a: any) => ({
          ...a,
          // Only expose sign_token for ÄTAs that need signing
          sign_token: a.status === 'sent' ? a.sign_token : null,
        })),
        tracker_stages: stagesRes.data || [],
        photos: photosRes.data || [],
      }
    }))

    return NextResponse.json({ projects: enriched })
  } catch (error: any) {
    console.error('Portal projects error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
