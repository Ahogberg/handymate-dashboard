import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'

// Force-dynamic så Vercel Edge inte cachar respons. Token-baserade publika
// routes är cache-känsliga (samma URL = samma key) och nyligen ändrade rader
// kan missas. Safe default oavsett om cache faktiskt är boven i nuvarande
// debug-session.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    // Hämta ALLA projekt för kunden — inkl. completed/cancelled. Kunden ska
    // ha full insyn i sin historik, och ÄTA kan skickas i efterhand på
    // completed-projekt (slutbesiktning, garanti, post-completion-tillägg).
    // Aliasar progress_percent → progress eftersom frontend (PortalHome m.fl.)
    // läser p.progress. Tidigare select:ade routen `progress` direkt vilket
    // inte finns på project-tabellen → PostgREST returnerade 42703 → routen
    // sväljde error tyst (data=null → []). Anti-pattern fixad nedan.
    const { data: rawProjects, error: projectsError } = await supabase
      .from('project')
      .select('project_id, project_number, name, status, description, progress:progress_percent, created_at, updated_at, completed_at')
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

    /**
     * ═══ SEX FRÅGOR TOTALT — INTE SEX PER PROJEKT (P2-5, 2026-08-09) ═══
     *
     * Barndatan hämtades i en Promise.all PER projekt: en kund med åtta
     * projekt kostade ~49 queries per portalbesök. Nu batchas varje tabell
     * med .in('project_id', ids) en gång och grupperas i minnet. Svarets
     * form är oförändrad — frontend märker bara att det går fortare.
     *
     * Aliasen är bevarade från tidigare lagningar: schedule_entry har
     * start_datetime/end_datetime (aldrig start_time) — gav 42703 och en
     * tom sektion en gång i tiden.
     *
     * project_log-fyndet (2026-08-31, Work Report V1-granskningen): den
     * ursprungliga tabelldesignen (sql/rot_rut_documents.sql) hette
     * project_id/work_description — men den LEVANDE tabellen döptes om till
     * order_id/work_performed (verifierat i app/api/projects/[id]/logs/
     * route.ts, som skriver mot just de namnen) utan att denna fråga
     * följde med. Selecten bad om kolumner som inte finns
     * (project_id, work_description) → PostgREST 42703 → fångas tyst av
     * felloggningen nedan → latestLog blev ALLTID null, tyst, för varje
     * portalbesök. Ingen kunddata läckte — frågan gav bara aldrig ett svar.
     *
     * Fixen aliasar till de RIKTIGA kolumnerna. Notera valet: work_performed
     * ("vad utfördes") är byggdagbokens avsedda kundnarrativ — motsvarar
     * ursprungets work_description. Den levande kolumnen `description`
     * (skrivs av notes-fältet i formuläret, se logs/route.ts rad 97) är
     * INTERNA anteckningar, inte det kundvända fältet — att alisera dit
     * hade varit den faktiska läckan. log_report_%-spärren (Work Report V1)
     * skyddar mot de NYA interna raderna oavsett.
     */
    const ids = (projects || []).map((p: any) => p.project_id)
    const [milestonesRes, logsRes, scheduleRes, ataRes, stagesRes, photosRes, invoiceRes] = ids.length === 0
      ? [null, null, null, null, null, null, null] as any[]
      : await Promise.all([
          supabase
            .from('project_milestone')
            .select('project_id, name, status, sort_order')
            .in('project_id', ids)
            .eq('business_id', customer.business_id)
            .order('sort_order', { ascending: true }),
          supabase
            .from('project_log')
            .select('project_id:order_id, description:work_performed, created_at')
            // Explicit internal-report boundary; never rely on a legacy column
            // mismatch to keep the employee's report out of the customer portal.
            .not('id', 'like', 'log_report_%')
            .eq('business_id', customer.business_id)
            .in('order_id', ids)
            .order('created_at', { ascending: false }),
          supabase
            .from('schedule_entry')
            .select('project_id, title, start_time:start_datetime, end_time:end_datetime')
            .in('project_id', ids)
            .gte('start_datetime', new Date().toISOString())
            .order('start_datetime', { ascending: true }),
          supabase
            .from('project_change')
            .select('project_id, change_id, ata_number, change_type, description, items, total, status, sign_token, signed_at, signed_by_name, created_at')
            .in('project_id', ids)
            .eq('business_id', customer.business_id)
            .in('status', ['sent', 'signed', 'approved'])
            .order('ata_number', { ascending: true }),
          supabase
            .from('project_stages')
            .select('project_id, stage, label, completed_at, completed_by, note')
            .in('project_id', ids)
            .order('created_at', { ascending: true }),
          supabase
            .from('project_photos')
            .select('project_id, id, url, caption, type, uploaded_at')
            .in('project_id', ids)
            .order('uploaded_at', { ascending: false }),
          // Fakturafakta för det härledda driftläget (P1-2) — portalen kan
          // därmed lämna sin egen, tredje stegrepresentation i egen takt.
          supabase
            .from('invoice')
            .select('project_id, status')
            .in('project_id', ids)
            .eq('business_id', customer.business_id),
        ])

    // Ett verkligt fel ska inte förbli tyst: en misslyckad hämtning gav
    // förut en tom lista utan spår.
    for (const [namn, res] of Object.entries({ milestones: milestonesRes, log: logsRes, schedule: scheduleRes, ata: ataRes, stages: stagesRes, photos: photosRes })) {
      if (res?.error) console.error(`[portal/projects] ${namn}-hämtning misslyckades:`, res.error.message)
    }

    const per = <T extends { project_id: string }>(rows: T[] | null | undefined) => {
      const map = new Map<string, T[]>()
      for (const r of rows || []) {
        const lista = map.get(r.project_id) || []
        lista.push(r)
        map.set(r.project_id, lista)
      }
      return map
    }
    const milestonesPer = per(milestonesRes?.data)
    const logsPer = per(logsRes?.data)
    const schedulePer = per(scheduleRes?.data)
    const ataPer = per(ataRes?.data)
    const stagesPer = per(stagesRes?.data)
    const photosPer = per(photosRes?.data)
    const invoicesPer = per(invoiceRes?.data)

    const { deriveProjectLifecycle } = await import('@/lib/projects/derive-lifecycle')

    const enriched = (projects || []).map((p: any) => ({
      ...p,
      milestones: (milestonesPer.get(p.project_id) || []).map(({ project_id: _p, ...m }: any) => m),
      latestLog: (logsPer.get(p.project_id) || [])[0] || null,
      nextVisit: (schedulePer.get(p.project_id) || [])[0] || null,
      atas: (ataPer.get(p.project_id) || []).map((a: any) => ({
        ...a,
        // Only expose sign_token for ÄTAs that need signing
        sign_token: a.status === 'sent' ? a.sign_token : null,
      })),
      tracker_stages: (stagesPer.get(p.project_id) || []).map(({ project_id: _p, ...s }: any) => s),
      photos: (photosPer.get(p.project_id) || []).slice(0, 12),
      // Samma driftläge som hantverkarens lista — en sanning, två läsare.
      lifecycle: deriveProjectLifecycle({
        status: p.status,
        completed_at: p.completed_at,
        invoices: (invoicesPer.get(p.project_id) || []).map((i: any) => ({ status: i.status ?? null })),
      }),
    }))

    return NextResponse.json({ projects: enriched })
  } catch (error: any) {
    console.error('Portal projects error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
