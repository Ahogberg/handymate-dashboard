import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildAgentPushEnvelopeV1 } from '../lib/notifications/agent-push'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('P1-6 — versionsmärkt mobilmål', () => {
  test('bygger ett diskret ÄTA-mål utan kunddata eller belopp', () => {
    const envelope = buildAgentPushEnvelopeV1('ata_signed_notification', {
      change_id: 'chg_123',
      project_id: 'proj_456',
      signed_at: '2026-09-01T08:00:00.000Z',
      signed_by_name: 'Känsligt namn',
      total: 12500,
    })

    expect(envelope).toEqual({
      schema: 'agent_push_v1',
      notification_id: 'ata_signed_notification:chg_123',
      notification_class: 'important_happened',
      agent_id: 'matte',
      target_kind: 'project',
      target_id: 'proj_456',
      issued_at: '2026-09-01T08:00:00.000Z',
      expires_at: '2026-10-01T08:00:00.000Z',
      privacy: 'discrete',
    })
    expect(JSON.stringify(envelope)).not.toContain('Känsligt namn')
    expect(JSON.stringify(envelope)).not.toContain('12500')
  })

  test('okänd typ och osäkra mål nekas', () => {
    expect(buildAgentPushEnvelopeV1('review_request', { project_id: 'proj_1', change_id: 'chg_1' })).toBeNull()
    expect(buildAgentPushEnvelopeV1('ata_signed_notification', {
      project_id: '../admin',
      change_id: 'chg_1',
    })).toBeNull()
  })

  test('pushkedjan vidarebefordrar bara data som separat Expo-payload', () => {
    const route = read('app/api/push/send/route.ts')
    const approvalPush = read('lib/notifications/approval-push.ts')
    expect(route).toContain('...(isRecord(data) ? data : {})')
    expect(route.indexOf('...(isRecord(data) ? data : {})')).toBeLessThan(route.indexOf("url: url || '/dashboard'"))
    expect(approvalPush).toContain('buildAgentPushEnvelopeV1(approval.approval_type, payload)')
    expect(approvalPush).toContain('data: agentPushEnvelope')
  })
})
