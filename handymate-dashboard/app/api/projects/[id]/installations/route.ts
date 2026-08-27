import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import {
  listInstallationsForProject,
  ensureMaterialDrafts,
  loadProjectSite,
  installationRelevance,
  createManualInstallation,
  updateInstallation,
  deleteInstallation,
} from '@/lib/installation/installation'

export const dynamic = 'force-dynamic'

/**
 * /api/projects/[id]/installations — installationsregistret för ett projekt
 * (Fastighetspasset steg 2, sql/v174_installation.sql).
 *
 * Samma auth som materialrutten (getAuthenticatedBusiness): den som står
 * hos kunden med serienumret i handen ska kunna skriva in det. Kundvyn
 * påverkas ändå bara av rader som bekräftats (status 'confirmed').
 *
 * GET synkar materialutkast (idempotent, bara 'draft' — grind 1) och svarar
 * med raderna, platsögonblicksbilden och relevansen. Ingen 500 döljs som en
 * tom lista.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = getServerSupabase()

    const ctx = await loadProjectSite(supabase, business.business_id, params.id)
    if (!ctx) return NextResponse.json({ error: 'Projektet hittades inte' }, { status: 404 })

    const sync = await ensureMaterialDrafts(supabase, business.business_id, params.id)
    if (sync.error) {
      console.error('[projects/installations] utkast-sync:', sync.error)
      return NextResponse.json({ error: 'Kunde inte läsa materialet just nu' }, { status: 500 })
    }
    const { rows, error } = await listInstallationsForProject(supabase, business.business_id, params.id)
    if (error) {
      console.error('[projects/installations] list:', error)
      return NextResponse.json({ error: 'Kunde inte läsa installationerna just nu' }, { status: 500 })
    }
    const relevance = installationRelevance({ name: ctx.projectName, description: ctx.description, materialCount: sync.materialCount })
    return NextResponse.json({
      installations: rows,
      site: ctx.site,
      customer_id: ctx.customerId,
      project_name: ctx.projectName,
      relevance,
      drafts_created: sync.created,
    })
  } catch (error) {
    console.error('[projects/installations] GET oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const supabase = getServerSupabase()
    const result = await createManualInstallation(supabase, business.business_id, params.id, body)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ installation: result.row })
  } catch (error) {
    console.error('[projects/installations] POST oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const installationId = typeof body.installation_id === 'string' ? body.installation_id : ''
    if (!installationId) return NextResponse.json({ error: 'installation_id saknas' }, { status: 400 })
    const supabase = getServerSupabase()
    // Tenant + projekt-scope: raden måste tillhöra projektet i URL:en.
    const { data: owned } = await supabase
      .from('installation')
      .select('installation_id')
      .eq('business_id', business.business_id)
      .eq('project_id', params.id)
      .eq('installation_id', installationId)
      .maybeSingle()
    if (!owned) return NextResponse.json({ error: 'Installationen hittades inte' }, { status: 404 })
    const { installation_id: _omit, ...patch } = body
    void _omit
    const result = await updateInstallation(supabase, business.business_id, installationId, patch)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ installation: result.row })
  } catch (error) {
    console.error('[projects/installations] PATCH oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const installationId = new URL(request.url).searchParams.get('installation_id') || ''
    if (!installationId) return NextResponse.json({ error: 'installation_id saknas' }, { status: 400 })
    const supabase = getServerSupabase()
    const { data: owned } = await supabase
      .from('installation')
      .select('installation_id')
      .eq('business_id', business.business_id)
      .eq('project_id', params.id)
      .eq('installation_id', installationId)
      .maybeSingle()
    if (!owned) return NextResponse.json({ error: 'Installationen hittades inte' }, { status: 404 })
    const result = await deleteInstallation(supabase, business.business_id, installationId)
    if (!result.ok) return NextResponse.json({ error: 'Kunde inte ta bort installationen' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[projects/installations] DELETE oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
