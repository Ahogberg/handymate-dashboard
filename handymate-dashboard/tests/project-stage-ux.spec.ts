import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

test.describe('Projektsteg — verksamhetsöversikt och projektheader', () => {
  test('den delade stripen använder åtta riktiga ikoner och ett hoverkort', () => {
    const source = read('components/projects/ProjectStageStrip.tsx')

    expect(source).toContain('data-project-stage-strip')
    expect(source).toContain('projectStageTooltip')
    expect(source).toContain('role="tooltip"')
    expect(source).toContain('showStageNames')

    const iconIds = Array.from(source.matchAll(/'ps-0[1-8]':/g), match => match[0])
    expect(iconIds).toHaveLength(8)
  })

  test('direktbytet kräver lokal bekräftelse före den befintliga stage-routen', () => {
    const source = read('components/pipeline/unified/FlowPipeline.tsx')
    const confirmation = source.indexOf('Bekräfta byte av projektsteg')
    const endpoint = source.indexOf('/advance-stage`')
    const confirmedAction = source.indexOf('onClick={changeProjectStage}')

    expect(confirmation).toBeGreaterThan(-1)
    expect(endpoint).toBeGreaterThan(-1)
    expect(confirmedAction).toBeGreaterThan(confirmation)
    expect(source).toContain("body: JSON.stringify({ to_stage_id: pendingStage.id })")
    expect(source).toContain('if (!response.ok)')
    expect(source).toContain('onStageChanged(project.id, nextStageId)')
    expect(source).not.toContain('setExpanded(prev => !prev)')
  })

  test('öppna projekt är en separat och tydlig primär handling', () => {
    const source = read('components/pipeline/unified/FlowPipeline.tsx')

    expect(source).toContain('className={styles.openProjectButton}')
    expect(source).toContain('Öppna projekt <ArrowRight')
    expect(source).not.toContain('Öppna projekt →')
  })

  test('parenten uppdaterar både deal-kopplade och fristående projekt direkt', () => {
    const source = read('app/dashboard/pipeline/page.tsx')

    expect(source).toContain('onProjectStageChanged={(projectId, stageId) =>')
    expect(source).toContain('setDeals(current => current.map')
    expect(source).toContain('setOrphanProjects(current => current.map')
    expect(source).toContain('current_workflow_stage_id: stageId')
  })

  test('projektsidan återanvänder stripen som header utan dubblerad trestegsstepper', () => {
    const source = read('app/dashboard/projects/[id]/page.tsx')

    // 2026-08-26 (Statusbandet, Claude Design-handoffen godkänd av Andreas):
    // 8-stegsheadern ersattes av statusbandets 3-stegs stepper; de åtta
    // stegen nås via "Visa alla 8 steg" som öppnar samma stegmodal.
    expect(source).toContain('<ProjectStatusBand')
    expect(source).toContain('onShowAllStages={() => setStageModalOpen(true)}')
    expect(source).not.toContain('Projektets flöde')
    const band = read('components/projects/ProjectStatusBand.tsx')
    expect(band).toContain('Visa alla 8 steg')
    expect(band, 'stepperns tre steg ur samma stageBucket').toContain("{ key: 'planering', label: 'Planering' }")
  })
})
