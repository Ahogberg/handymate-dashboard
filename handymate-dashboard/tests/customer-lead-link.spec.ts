import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test.describe('kund → lead/deal behåller kundrelationen', () => {
  test('kundprompten skickar både kund-id och namn till pipeline-prefillen', () => {
    const source = read('app/dashboard/customers/components/DealPromptModal.tsx')
    expect(source).toContain('customer_id=${customerId}')
    expect(source).toContain('customer_name=${encodeURIComponent(customerName)}')
  })

  test('pipeline konsumerar prefill en gång och sätter synligt namn tillsammans med id', () => {
    const source = read('app/dashboard/pipeline/page.tsx')
    expect(source).toContain('const newDealPrefillHandled = useRef(false)')
    expect(source).toContain('newDealPrefillHandled.current = true')
    expect(source).toContain('customer_id: custId')
    expect(source).toContain('setCustomerSearch(custName)')
    expect(source).toContain('customer_id: newDealForm.customer_id || null')
  })

  test('vald kund kan bara lossas explicit — skrivning i fältet rensar inte länken', () => {
    const source = read('app/dashboard/pipeline/components/NewDealModal.tsx')
    expect(source).toContain('readOnly={Boolean(newDealForm.customer_id)}')
    expect(source).toContain("setNewDealForm(prev => ({ ...prev, customer_id: '' })); setCustomerSearch('')")
  })

  test('servern normaliserar kontraktet och tenantvaliderar kunden före deal-insert', () => {
    const source = read('app/api/pipeline/deals/route.ts')
    const post = source.slice(source.indexOf('export async function POST'))
    const validation = post.indexOf(".from('customer')")
    const dealWrite = post.indexOf(".from('deal')", validation)
    const insert = post.indexOf('.insert({', dealWrite)

    expect(post).toContain('body.customer_id || body.customerId || null')
    expect(post).toContain(".eq('business_id', business.business_id)")
    expect(post).toContain(".eq('customer_id', customerId)")
    expect(validation).toBeGreaterThan(-1)
    expect(dealWrite).toBeGreaterThan(validation)
    expect(insert).toBeGreaterThan(validation)
    expect(post).toContain('customer_id: customerId || null')
  })

  test('ett projekt som skapas från deal ärver dealens kund', () => {
    const source = read('app/api/projects/route.ts')
    expect(source).toContain(".select('id, deal_number, title, customer_id, description, value, job_type')")
    expect(source).toContain('projectData.customer_id = projectData.customer_id || deal.customer_id || null')
  })
})
