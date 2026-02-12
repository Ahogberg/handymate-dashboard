import { getServerSupabase } from '@/lib/supabase'

// ============================================
// Types
// ============================================

export interface TemplateVariable {
  key: string
  label: string
  source: 'auto' | 'input'
  auto_type?: 'business' | 'customer' | 'project' | 'system'
  input_type?: 'text' | 'textarea' | 'date' | 'checkbox' | 'select'
  options?: string[]
  default?: string
}

export interface TemplateSection {
  type: 'header' | 'field_row' | 'section' | 'notice' | 'checklist' | 'signatures'
  text?: string
  title?: string
  style?: string
  fields?: Array<{
    label: string
    variable: string
    type?: string
  }>
  items?: Array<{
    text: string
    variable: string
  }>
  labels?: string[]
}

export interface DocumentTemplate {
  id: string
  business_id: string | null
  category_id: string
  name: string
  description: string
  content: TemplateSection[]
  variables: TemplateVariable[]
  branch: string | null
  is_system: boolean
  is_active: boolean
  version: number
  created_at: string
  updated_at: string
  category?: {
    id: string
    name: string
    slug: string
    icon: string
  }
}

export interface GeneratedDocument {
  id: string
  business_id: string
  template_id: string
  project_id: string | null
  customer_id: string | null
  title: string
  content: TemplateSection[]
  variables_data: Record<string, any>
  status: 'draft' | 'completed' | 'signed'
  signed_at: string | null
  signed_by_name: string | null
  signature_data: string | null
  customer_signature: string | null
  customer_signed_name: string | null
  customer_signed_at: string | null
  notes: string | null
  pdf_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  template?: DocumentTemplate
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
    address_line: string
  }
  project?: {
    project_id: string
    name: string
  }
}

// ============================================
// Auto-resolve variables from context
// ============================================

interface ResolveContext {
  business?: Record<string, any>
  customer?: Record<string, any>
  project?: Record<string, any>
}

export function resolveAutoVariables(
  variables: TemplateVariable[],
  context: ResolveContext
): Record<string, string> {
  const resolved: Record<string, string> = {}

  for (const v of variables) {
    if (v.source === 'auto') {
      const value = getAutoValue(v, context)
      if (value) resolved[v.key] = value
    }
    // Set defaults for input variables
    if (v.source === 'input' && v.default) {
      resolved[v.key] = v.default
    }
  }

  return resolved
}

function getAutoValue(variable: TemplateVariable, ctx: ResolveContext): string {
  switch (variable.auto_type) {
    case 'business':
      return resolveBusinessField(variable.key, ctx.business) || ''
    case 'customer':
      return resolveCustomerField(variable.key, ctx.customer) || ''
    case 'project':
      return resolveProjectField(variable.key, ctx.project) || ''
    case 'system':
      return resolveSystemField(variable.key) || ''
    default:
      return ''
  }
}

function resolveBusinessField(key: string, business?: Record<string, any>): string {
  if (!business) return ''
  const map: Record<string, string> = {
    business_name: business.business_name || '',
    business_org_number: business.org_number || '',
    business_contact: business.contact_name || '',
    business_phone: business.phone_number || business.contact_phone || '',
    business_email: business.contact_email || '',
    installer_name: business.contact_name || '',
    el_authorization: business.el_authorization || '',
  }
  return map[key] || ''
}

function resolveCustomerField(key: string, customer?: Record<string, any>): string {
  if (!customer) return ''
  const map: Record<string, string> = {
    customer_name: customer.name || '',
    customer_address: customer.address_line || customer.address || '',
    customer_phone: customer.phone_number || '',
    customer_email: customer.email || '',
    property_designation: customer.property_designation || customer.fastighetsbeteckning || '',
    personnummer: customer.personal_number || '',
  }
  return map[key] || ''
}

function resolveProjectField(key: string, project?: Record<string, any>): string {
  if (!project) return ''
  const map: Record<string, string> = {
    project_name: project.name || project.title || '',
    project_address: project.address || '',
  }
  return map[key] || ''
}

function resolveSystemField(key: string): string {
  const now = new Date()
  const map: Record<string, string> = {
    date: now.toLocaleDateString('sv-SE'),
    order_number: `AO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    certificate_number: `CERT-${now.getFullYear()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    protocol_number: `PROT-${now.getFullYear()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    document_number: `DOK-${now.getFullYear()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
  }
  return map[key] || ''
}

// ============================================
// Fill template content with variable values
// ============================================

export function fillTemplateContent(
  content: TemplateSection[],
  variableValues: Record<string, any>
): TemplateSection[] {
  return content.map(section => {
    const filled = { ...section }

    if (filled.fields) {
      filled.fields = filled.fields.map(field => ({
        ...field,
        value: variableValues[field.variable] ?? '',
      }))
    }

    if (filled.items) {
      filled.items = filled.items.map(item => ({
        ...item,
        checked: variableValues[item.variable] ?? false,
      }))
    }

    return filled
  })
}

// ============================================
// Render document to HTML for PDF generation
// ============================================

export function renderDocumentHTML(
  doc: {
    title: string
    content: TemplateSection[]
    variables_data: Record<string, any>
    signed_by_name?: string | null
    signed_at?: string | null
    signature_data?: string | null
    customer_signed_name?: string | null
    customer_signed_at?: string | null
    customer_signature?: string | null
  },
  business?: Record<string, any>
): string {
  const filledContent = fillTemplateContent(doc.content, doc.variables_data)

  const sectionsHTML = filledContent.map(section => {
    switch (section.type) {
      case 'header':
        return `<div class="doc-header"><h1>${section.text || doc.title}</h1></div>`

      case 'notice':
        return `<div class="doc-notice ${section.style || 'info'}">${section.text}</div>`

      case 'field_row':
        return `<div class="field-row">${(section.fields || []).map(f =>
          `<div class="field-col"><span class="field-label">${f.label}</span><span class="field-value">${(f as any).value || ''}</span></div>`
        ).join('')}</div>`

      case 'section':
        return `<div class="doc-section">
          <h2>${section.title}</h2>
          <div class="section-fields">${(section.fields || []).map(f => {
            const val = (f as any).value
            if (f.type === 'checkbox') {
              return `<div class="field-check"><span class="checkbox ${val ? 'checked' : ''}">${val ? '&#10003;' : ''}</span><span>${f.label}</span></div>`
            }
            if (f.type === 'textarea') {
              return `<div class="field-full"><span class="field-label">${f.label}</span><div class="field-textarea">${val || ''}</div></div>`
            }
            return `<div class="field-inline"><span class="field-label">${f.label}:</span><span class="field-value">${val || ''}</span></div>`
          }).join('')}</div>
        </div>`

      case 'checklist':
        return `<div class="doc-section">
          <h2>${section.title}</h2>
          <div class="checklist">${(section.items || []).map(item => {
            const checked = (item as any).checked
            return `<div class="check-item"><span class="checkbox ${checked ? 'checked' : ''}">${checked ? '&#10003;' : ''}</span><span>${item.text}</span></div>`
          }).join('')}</div>
        </div>`

      case 'signatures': {
        const labels = section.labels || []
        const signaturesData: string[] = []
        // First signature = business/document creator
        if (doc.signature_data && doc.signed_by_name) {
          signaturesData.push(`<div class="sig-box">
            <img src="${doc.signature_data}" class="sig-img" />
            <div class="sig-name">${doc.signed_by_name}</div>
            <div class="sig-date">${doc.signed_at ? new Date(doc.signed_at).toLocaleDateString('sv-SE') : ''}</div>
            <div class="sig-label">${labels[0] || ''}</div>
          </div>`)
        } else {
          signaturesData.push(`<div class="sig-box"><div class="sig-line"></div><div class="sig-label">${labels[0] || ''}</div></div>`)
        }
        // Second signature = customer
        if (labels.length > 1) {
          if (doc.customer_signature && doc.customer_signed_name) {
            signaturesData.push(`<div class="sig-box">
              <img src="${doc.customer_signature}" class="sig-img" />
              <div class="sig-name">${doc.customer_signed_name}</div>
              <div class="sig-date">${doc.customer_signed_at ? new Date(doc.customer_signed_at).toLocaleDateString('sv-SE') : ''}</div>
              <div class="sig-label">${labels[1]}</div>
            </div>`)
          } else {
            signaturesData.push(`<div class="sig-box"><div class="sig-line"></div><div class="sig-label">${labels[1]}</div></div>`)
          }
        }
        // Additional signatures
        for (let i = 2; i < labels.length; i++) {
          signaturesData.push(`<div class="sig-box"><div class="sig-line"></div><div class="sig-label">${labels[i]}</div></div>`)
        }
        return `<div class="signatures">${signaturesData.join('')}</div>`
      }

      default:
        return ''
    }
  }).join('\n')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
    .page { max-width: 210mm; margin: 0 auto; padding: 20mm 15mm; }
    .doc-header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #7c3aed; }
    .doc-header h1 { font-size: 22pt; color: #7c3aed; font-weight: 700; letter-spacing: 1px; }
    .doc-notice { padding: 10px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 10pt; }
    .doc-notice.info { background: #ede9fe; border-left: 4px solid #7c3aed; color: #5b21b6; }
    .field-row { display: flex; gap: 24px; margin-bottom: 16px; }
    .field-col { flex: 1; }
    .field-label { display: block; font-size: 9pt; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .field-value { display: block; font-size: 11pt; font-weight: 500; padding: 4px 0; border-bottom: 1px solid #e5e5e5; min-height: 24px; }
    .doc-section { margin-bottom: 20px; }
    .doc-section h2 { font-size: 12pt; color: #7c3aed; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .section-fields { display: flex; flex-wrap: wrap; gap: 8px 24px; }
    .field-inline { flex: 0 0 calc(50% - 12px); display: flex; gap: 8px; padding: 4px 0; }
    .field-inline .field-label { flex-shrink: 0; font-size: 10pt; color: #666; }
    .field-inline .field-value { font-weight: 500; }
    .field-full { flex: 0 0 100%; padding: 4px 0; }
    .field-full .field-label { margin-bottom: 4px; }
    .field-textarea { padding: 8px; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 4px; min-height: 40px; white-space: pre-wrap; }
    .field-check { display: flex; align-items: center; gap: 8px; flex: 0 0 calc(50% - 12px); padding: 4px 0; }
    .checkbox { width: 18px; height: 18px; border: 2px solid #7c3aed; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
    .checkbox.checked { background: #7c3aed; color: white; }
    .checklist { display: flex; flex-wrap: wrap; gap: 8px; }
    .check-item { display: flex; align-items: center; gap: 8px; flex: 0 0 calc(50% - 4px); padding: 6px 0; }
    .signatures { display: flex; gap: 40px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; }
    .sig-box { flex: 1; text-align: center; }
    .sig-line { border-bottom: 1px solid #1a1a1a; margin-bottom: 8px; height: 60px; }
    .sig-img { max-height: 60px; max-width: 200px; margin-bottom: 4px; }
    .sig-name { font-weight: 600; font-size: 10pt; }
    .sig-date { font-size: 9pt; color: #666; }
    .sig-label { font-size: 9pt; color: #999; margin-top: 4px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 8pt; color: #999; }
  </style>
</head>
<body>
  <div class="page">
    ${sectionsHTML}
    ${business ? `<div class="footer">
      ${business.business_name || ''} | Org.nr: ${business.org_number || ''} | ${business.contact_email || ''} | ${business.phone_number || ''}
    </div>` : ''}
  </div>
</body>
</html>`
}

// ============================================
// Fetch context for variable resolution
// ============================================

export async function fetchResolveContext(
  businessId: string,
  customerId?: string | null,
  projectId?: string | null
): Promise<ResolveContext> {
  const supabase = getServerSupabase()
  const context: ResolveContext = {}

  // Business
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, org_number, contact_name, contact_email, phone_number')
    .eq('business_id', businessId)
    .single()
  if (business) context.business = business

  // Customer
  if (customerId) {
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number, email, address_line, personal_number, property_designation')
      .eq('customer_id', customerId)
      .single()
    if (customer) context.customer = customer
  }

  // Project
  if (projectId) {
    const { data: project } = await supabase
      .from('project')
      .select('project_id, name, address')
      .eq('project_id', projectId)
      .single()
    if (project) context.project = project
  }

  return context
}

// ============================================
// Generate document number
// ============================================

export async function generateDocumentNumber(businessId: string): Promise<string> {
  const supabase = getServerSupabase()
  const year = new Date().getFullYear()

  const { count } = await supabase
    .from('generated_document')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', `${year}-01-01`)

  const num = (count || 0) + 1
  return `DOK-${year}-${String(num).padStart(4, '0')}`
}
