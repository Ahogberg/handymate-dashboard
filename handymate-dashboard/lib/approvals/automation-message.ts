export function interpolateApprovalTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, key) => {
    const value = context[key]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : match
  })
}
export function automationSmsText(config: Record<string, any>, context: Record<string, unknown>, businessName: string): string {
  return interpolateApprovalTemplate(config.template || '', context).replace(/\{\{business_name\}\}/g, () => businessName)
}
