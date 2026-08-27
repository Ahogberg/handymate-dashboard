/**
 * Browserlöst facit för Vunnen → skapa projekt → initial tilldelning.
 *
 * Kör: npx playwright test tests/won-project-assignment.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test('Grattis-modalen erbjuder en frivillig aktiv teammedlem', () => {
  const source = read('app/dashboard/pipeline/components/WonModal.tsx')
  expect(source).toContain('Tilldela projektet')
  expect(source).toContain('value={wonAssigneeId}')
  expect(source).toContain('teamMembers.map')
  expect(source).toContain('<option value="">Ingen ännu</option>')
  expect(source).toContain('Förifylls från affärens ansvarige')
})

test('affärens aktive ansvarige förifylls och skickas med projektskapandet', () => {
  const source = read('app/dashboard/pipeline/page.tsx')
  expect(source).toContain("const [wonAssigneeId, setWonAssigneeId] = useState('')")
  expect(source).toContain('teamMembers.some(member => member.id === dealBeingMoved.assigned_to)')
  expect(source).toContain('body.assigned_business_user_id = wonAssigneeId')
  expect(source).toContain('setWonAssigneeId(\'\')')
})

test('servern tenant- och rollvaliderar personen före första projektskrivningen', () => {
  const source = read('app/api/projects/route.ts')
  const postStart = source.indexOf('export async function POST')
  const putStart = source.indexOf('export async function PUT', postStart)
  const post = source.slice(postStart, putStart)
  const validation = post.indexOf(".from('business_users')")
  const firstProjectInsert = post.indexOf('.insert(projectData)')

  expect(validation).toBeGreaterThan(-1)
  expect(firstProjectInsert).toBeGreaterThan(validation)
  expect(post.slice(0, firstProjectInsert)).toContain("hasPermission(assigningUser, 'see_all_projects')")
  expect(post.slice(validation, validation + 500)).toContain(".eq('business_id', businessId)")
  expect(post.slice(validation, validation + 500)).toContain(".eq('is_active', true)")
})

test('initial assignment använder projektets riktiga teamrelation och är retry-idempotent', () => {
  const source = read('app/api/projects/route.ts')
  const start = source.indexOf('const assignInitialUser')
  const block = source.slice(start, start + 1800)
  expect(block).toContain("from('project_assignment')")
  expect(block).toContain(".eq('business_id', businessId)")
  expect(block).toContain(".eq('project_id', projectId)")
  expect(block).toContain(".eq('business_user_id', initialAssigneeId)")
  expect(block).toContain('assigned_by: assigningUser.id')
  // Ny rad + båda idempotensvägarna (befintlig offert och race-vinnare).
  expect(source.match(/assignInitialUser\(/g)?.length).toBeGreaterThanOrEqual(3)
})

test('projektet påstås inte vara tilldelat om assignment-skrivningen felar', () => {
  const route = read('app/api/projects/route.ts')
  const page = read('app/dashboard/pipeline/page.tsx')
  expect(route).toContain('assignment_error')
  expect(route).toContain('Projektet skapades, men personen kunde inte tilldelas')
  expect(page).toContain('if (data.assignment_error)')
  expect(page).toContain('Lägg till personen på projektsidan')
})
