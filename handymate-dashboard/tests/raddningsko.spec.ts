/**
 * Facit: Räddningskön + lanseringsbevis (docs/launch/
 * FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md §3 och §5, tasks/plan-raddningsko.md).
 *
 * Browserlös: rena enhetstester av lib/raddning/signaler.ts + källskanningar
 * av cronen, admin-rutterna och lib/launch/readiness.ts. Ingen session,
 * inga nätanrop, inga hemligheter.
 *
 * Körs: npx playwright test tests/raddningsko.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  bedomOnboarding,
  bedomKanal,
  bedomAktivering,
  bedomOffert,
  bedomUppdrag,
  bedomIntegration,
  bedomHandlingar,
  bedomKort,
  bedomFalskFramgang,
} from '../lib/raddning/signaler'
import type { ChannelHealth } from '../lib/onboarding/channel-health'
import { hamtaLanseringsbevis, MANUAL_LAUNCH_PROOFS } from '../lib/launch/readiness'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const TIMME = 3_600_000
const NOW = new Date('2026-09-02T12:00:00.000Z')
const isoTimmarSedan = (h: number) => new Date(NOW.getTime() - h * TIMME).toISOString()
const isoTimmarFramat = (h: number) => new Date(NOW.getTime() + h * TIMME).toISOString()

function channelHealth(state: ChannelHealth['state']): ChannelHealth {
  return { channel: 'phone', state, label: '', detail: '', next_action: null, evidence_at: null, proof: null }
}

test.describe('bedomOnboarding', () => {
  test('klar onboarding ger aldrig fynd', () => {
    expect(bedomOnboarding(
      { business_id: 'b1', created_at: isoTimmarSedan(200), onboarding_completed_at: isoTimmarSedan(1) },
      null,
      NOW,
    )).toBeNull()
  })

  test('under 24 h sedan senaste stämpel ger inget fynd', () => {
    expect(bedomOnboarding(
      { business_id: 'b1', created_at: isoTimmarSedan(23.9), onboarding_completed_at: null },
      null,
      NOW,
    )).toBeNull()
  })

  test('exakt 24 h ⇒ medel', () => {
    const fynd = bedomOnboarding(
      { business_id: 'b1', created_at: isoTimmarSedan(24), onboarding_completed_at: null },
      null,
      NOW,
    )
    expect(fynd).toMatchObject({ signal: 'onboarding_stannat', severity: 'medel' })
  })

  test('exakt 72 h ⇒ hög, och etiketten hämtas ur senaste _funnel-steget', () => {
    const funnel = { v: 1, reached: { '1': isoTimmarSedan(90), '3': isoTimmarSedan(72) } }
    const fynd = bedomOnboarding(
      { business_id: 'b1', created_at: isoTimmarSedan(200), onboarding_completed_at: null },
      funnel,
      NOW,
    )
    expect(fynd).toMatchObject({ signal: 'onboarding_stannat', severity: 'hog' })
    expect(fynd?.summary).toContain('steg 3')
    expect(fynd?.evidence.steg).toBe(3)
  })
})

test.describe('bedomKanal', () => {
  test('klar 48 h (gränsen) ger inget fynd', () => {
    expect(bedomKanal('b1', [channelHealth('not_enabled')], 48)).toBeNull()
  })

  test('klar > 48 h och ingen kanal verifierad ⇒ hög', () => {
    const fynd = bedomKanal('b1', [channelHealth('enabled_unverified'), channelHealth('not_enabled')], 49)
    expect(fynd).toMatchObject({ signal: 'ingen_verifierad_kanal', severity: 'hog' })
  })

  test('en verifierad kanal räcker för att inget fynd skapas', () => {
    expect(bedomKanal('b1', [channelHealth('channel_verified')], 100)).toBeNull()
  })
})

test.describe('bedomAktivering', () => {
  test('klar 72 h (gränsen) ger inget fynd', () => {
    expect(bedomAktivering('b1', { firstApprovalH: null }, 72)).toBeNull()
  })

  test('klar > 72 h och inget godkänt kort ⇒ medel', () => {
    const fynd = bedomAktivering('b1', { firstApprovalH: null }, 73)
    expect(fynd).toMatchObject({ signal: 'ingen_aktivering', severity: 'medel' })
  })

  test('ett godkänt kort ger inget fynd', () => {
    expect(bedomAktivering('b1', { firstApprovalH: 10 }, 200)).toBeNull()
  })
})

test.describe('bedomOffert', () => {
  test('klar exakt 7 dygn ger inget fynd', () => {
    expect(bedomOffert('b1', 0, 7 * 24)).toBeNull()
  })

  test('klar > 7 dygn och 0 skickade ⇒ medel', () => {
    const fynd = bedomOffert('b1', 0, 7 * 24 + 1)
    expect(fynd).toMatchObject({ signal: 'ingen_offert', severity: 'medel' })
  })

  test('en skickad offert ger inget fynd', () => {
    expect(bedomOffert('b1', 1, 1000)).toBeNull()
  })
})

test.describe('bedomUppdrag', () => {
  test('klar exakt 3 dygn ger inget fynd', () => {
    expect(bedomUppdrag('b1', 0, 3 * 24)).toBeNull()
  })

  test('klar > 3 dygn och 0 uppdrag ⇒ låg', () => {
    const fynd = bedomUppdrag('b1', 0, 3 * 24 + 1)
    expect(fynd).toMatchObject({ signal: 'inget_uppdrag', severity: 'lag' })
  })

  test('ett uppdrag ger inget fynd', () => {
    expect(bedomUppdrag('b1', 1, 1000)).toBeNull()
  })
})

test.describe('bedomIntegration', () => {
  test('inte ansluten ger aldrig fynd, oavsett synkfel', () => {
    expect(bedomIntegration('b1', { fortnoxConnected: false, tokenExpiresAt: isoTimmarSedan(1), synkfel25h: 5 }, NOW)).toBeNull()
  })

  test('ansluten, giltig token, inga synkfel ⇒ inget fynd', () => {
    expect(bedomIntegration('b1', { fortnoxConnected: true, tokenExpiresAt: isoTimmarFramat(10), synkfel25h: 0 }, NOW)).toBeNull()
  })

  test('ansluten och token utgången ⇒ hög', () => {
    const fynd = bedomIntegration('b1', { fortnoxConnected: true, tokenExpiresAt: isoTimmarSedan(1), synkfel25h: 0 }, NOW)
    expect(fynd).toMatchObject({ signal: 'integration_bruten', severity: 'hog' })
  })

  test('ansluten, giltig token, men synkfel > 0 ⇒ hög', () => {
    const fynd = bedomIntegration('b1', { fortnoxConnected: true, tokenExpiresAt: isoTimmarFramat(10), synkfel25h: 1 }, NOW)
    expect(fynd).toMatchObject({ signal: 'integration_bruten', severity: 'hog' })
  })
})

test.describe('bedomHandlingar', () => {
  test('0 misslyckade ger inget fynd', () => {
    expect(bedomHandlingar('b1', 0)).toBeNull()
  })

  test('1 misslyckad ⇒ medel', () => {
    expect(bedomHandlingar('b1', 1)).toMatchObject({ signal: 'misslyckad_handling', severity: 'medel' })
  })

  test('2 misslyckade ⇒ fortfarande medel', () => {
    expect(bedomHandlingar('b1', 2)).toMatchObject({ severity: 'medel' })
  })

  test('≥ 3 misslyckade ⇒ hög', () => {
    expect(bedomHandlingar('b1', 3)).toMatchObject({ signal: 'misslyckad_handling', severity: 'hog' })
  })
})

test.describe('bedomKort', () => {
  test('inga fastnade kort ger inget fynd', () => {
    expect(bedomKort('b1', [{ id: 'k1', created_at: isoTimmarSedan(1), expires_at: null }], NOW)).toBeNull()
  })

  test('pending exakt 48 h utan snar utgång är inte fastnat', () => {
    expect(bedomKort('b1', [{ id: 'k1', created_at: isoTimmarSedan(48), expires_at: isoTimmarFramat(1) }], NOW)).toBeNull()
  })

  test('pending > 48 h och går ut inom 24 h ⇒ fastnat (låg, 1 kort)', () => {
    const fynd = bedomKort('b1', [{ id: 'k1', created_at: isoTimmarSedan(49), expires_at: isoTimmarFramat(23) }], NOW)
    expect(fynd).toMatchObject({ signal: 'fastnat_kort', severity: 'lag' })
    expect(fynd?.evidence.antal).toBe(1)
  })

  test('pending > 5 dygn är fastnat oavsett expires_at', () => {
    const fynd = bedomKort('b1', [{ id: 'k1', created_at: isoTimmarSedan(5 * 24 + 1), expires_at: null }], NOW)
    expect(fynd).toMatchObject({ signal: 'fastnat_kort', severity: 'lag' })
  })

  test('≥ 3 fastnade kort ⇒ medel', () => {
    const rader = [1, 2, 3].map(n => ({ id: `k${n}`, created_at: isoTimmarSedan(200), expires_at: null }))
    const fynd = bedomKort('b1', rader, NOW)
    expect(fynd).toMatchObject({ signal: 'fastnat_kort', severity: 'medel' })
    expect(fynd?.evidence.antal).toBe(3)
  })
})

test.describe('bedomFalskFramgang', () => {
  test('lyckat kvittokort utan extraherbara artefakter ⇒ hög', () => {
    const fynd = bedomFalskFramgang('b1', [
      { id: 'k1', approval_type: 'review_auto_invoice', execution_result: { outcome: 'success' } },
    ])
    expect(fynd).toMatchObject({ signal: 'falsk_framgang', severity: 'hog' })
    expect(fynd?.evidence.kort_id).toEqual(['k1'])
  })

  test('lyckat kvittokort MED artefakt ger inget fynd', () => {
    const fynd = bedomFalskFramgang('b1', [
      { id: 'k1', approval_type: 'review_auto_invoice', execution_result: { outcome: 'success', invoice_id: 'inv_1' } },
    ])
    expect(fynd).toBeNull()
  })

  test('typ utanför RECEIPT_APPROVAL_TYPES ger inget fynd, även utan artefakt', () => {
    const fynd = bedomFalskFramgang('b1', [
      { id: 'k1', approval_type: 'send_quote', execution_result: { outcome: 'success' } },
    ])
    expect(fynd).toBeNull()
  })

  test('outcome skild från success ger inget fynd', () => {
    const fynd = bedomFalskFramgang('b1', [
      { id: 'k1', approval_type: 'review_auto_invoice', execution_result: { outcome: 'failed' } },
    ])
    expect(fynd).toBeNull()
  })
})

test.describe('cronrutten /api/cron/raddningsko', () => {
  const route = read('app/api/cron/raddningsko/route.ts')

  test('dubbelgrind: cron-hemlighet ELLER plattformsadmin (samma mönster som credit-watch)', () => {
    expect(route).toContain("from '@/lib/cron/verify-secret'")
    expect(route).toContain('verifyCronSecret(request)')
    expect(route).toContain('isAdmin(request)')
    expect(route).toContain("export const dynamic = 'force-dynamic'")
  })

  test('demokontot exkluderas ur kandidatlistan', () => {
    expect(route).toContain('DEMO_BUSINESS_ID')
    expect(route).toContain('demoBusinessId')
  })

  test('testnamn filtreras bort med samma mönster som funnel.ts', () => {
    expect(route).toContain('arTestNamn')
    expect(route).toMatch(/\^test\\b\|\^asdasd\$/)
  })

  test('upsert-idiomet: öppna/pågående ärenden matchas på (business_id, signal)', () => {
    expect(route).toContain("in('status', ['oppet', 'pagaende'])")
    expect(route).toContain('last_seen_at')
  })

  test('signaler som försvunnit stängs med resolved_by system, men manuell_fix_kravdes rörs aldrig', () => {
    expect(route).toContain("resolved_by: 'system'")
    expect(route).toContain("status: 'last'")
    expect(route).toContain('manuell_fix_kravdes')
    expect(route).toContain("nyckel.endsWith(':manuell_fix_kravdes')")
  })

  test('digest skickas bara när något är öppet — tyst när kön är rent', () => {
    expect(route).toContain('sendEmail')
    expect(route).toMatch(/lista\.length > 0/)
  })

  test('fail-soft: saknad raddningsarende-tabell svarar { skipped: \'schema\' }', () => {
    expect(route).toContain('arSchemaSaknas')
    expect(route).toContain("skipped: 'schema'")
  })

  test('vercel.json schemalägger räddningskön efter driftlarmet', () => {
    const vercel = JSON.parse(read('vercel.json'))
    const cron = vercel.crons.find((c: any) => c.path === '/api/cron/raddningsko')
    expect(cron).toBeTruthy()
    expect(cron.schedule).toBe('25 5 * * *')
  })

  test('tests/cron-auth.spec.ts räknar med den nya rutten', () => {
    const spec = read('tests/cron-auth.spec.ts')
    expect(spec).toContain('toHaveLength(44)')
    expect(spec).toContain('toHaveLength(43)')
  })
})

test.describe('admin-rutterna', () => {
  test('GET /api/admin/raddningsko är adminspärrad', () => {
    const route = read('app/api/admin/raddningsko/route.ts')
    expect(route).toContain('isAdmin(request)')
    expect(route).toContain("in('status', ['oppet', 'pagaende'])")
  })

  test('POST /api/admin/raddningsko/[id] är adminspärrad och loggar', () => {
    const route = read('app/api/admin/raddningsko/[id]/route.ts')
    expect(route).toContain('isAdmin(request)')
    expect(route).toContain('logAdminAction(')
    for (const action of ["'ta'", "'los'", "'avfarda'"]) {
      expect(route).toContain(action)
    }
  })

  test('POST /api/admin/raddningsko/manuell-fix är adminspärrad och loggar', () => {
    const route = read('app/api/admin/raddningsko/manuell-fix/route.ts')
    expect(route).toContain('isAdmin(request)')
    expect(route).toContain('logAdminAction(')
    expect(route).toContain("signal: 'manuell_fix_kravdes'")
  })

  test("'rescue'-fliken finns i app/admin/page.tsx", () => {
    const page = read('app/admin/page.tsx')
    expect(page).toContain("'rescue'")
    expect(page).toContain('RaddningskoTab')
  })

  test('RaddningskoTab har åtgärdsknapparna och lanseringsbevis-sektionen', () => {
    const tab = read('app/admin/components/RaddningskoTab.tsx')
    expect(tab).toContain('Tar det')
    expect(tab).toContain('Löst')
    expect(tab).toContain('Avfärda')
    expect(tab).toContain('Lanseringsbevis (Grind B)')
    expect(tab).toContain('Bokför manuell fix')
  })
})

test.describe('lanseringsbevis', () => {
  test('hamtaLanseringsbevis är fail-soft: saknad tabell ger MANUAL_LAUNCH_PROOFS oförändrad', async () => {
    const trasigSupabase: any = {
      from() {
        return {
          select() {
            return {
              is() {
                return {
                  order: async () => ({ data: null, error: { code: '42P01', message: 'relation does not exist' } }),
                }
              },
            }
          },
        }
      },
    }
    const resultat = await hamtaLanseringsbevis(trasigSupabase)
    expect(resultat).toEqual(MANUAL_LAUNCH_PROOFS)
    expect(resultat.every(p => p.status === 'manual')).toBe(true)
  })

  test('hamtaLanseringsbevis ger pass för en station med ett icke-återkallat bevis', async () => {
    const bevisRad = {
      station: 'proof_stripe',
      evidence: 'Köp #1234 → webhook → aktiv → återbetalning OK',
      evidence_url: null,
      proven_at: '2026-09-02T10:00:00.000Z',
      proven_by: 'andreas@handymate.se',
    }
    const okSupabase: any = {
      from() {
        return {
          select() {
            return {
              is() {
                return {
                  order: async () => ({ data: [bevisRad], error: null }),
                }
              },
            }
          },
        }
      },
    }
    const resultat = await hamtaLanseringsbevis(okSupabase)
    const stripe = resultat.find(p => p.key === 'proof_stripe')
    expect(stripe).toMatchObject({ status: 'pass', proven_by: 'andreas@handymate.se' })
    const ovriga = resultat.filter(p => p.key !== 'proof_stripe')
    expect(ovriga.every(p => p.status === 'manual')).toBe(true)
  })

  test('/api/admin/launch-readiness hämtar manual_proofs via hamtaLanseringsbevis', () => {
    const route = read('app/api/admin/launch-readiness/route.ts')
    expect(route).toContain('hamtaLanseringsbevis')
    expect(route).toContain('manual_proofs: manualProofs')
  })

  test('POST/DELETE /api/admin/launch-readiness/bevis är adminspärrad och loggar', () => {
    const route = read('app/api/admin/launch-readiness/bevis/route.ts')
    expect(route).toContain('isAdmin(request)')
    expect(route).toContain('logAdminAction(')
    expect(route).toContain("revoked_at: new Date().toISOString()")
  })
})

test.describe('schema', () => {
  test('sql/v203_raddningsko_och_lanseringsbevis.sql finns', () => {
    expect(fs.existsSync(path.join(ROOT, 'sql', 'v203_raddningsko_och_lanseringsbevis.sql'))).toBe(true)
  })

  test('schema-audit känner till båda nya tabellerna, icke-kritiskt', () => {
    const audit = read('app/api/debug/schema-audit/route.ts')
    expect(audit).toContain("{ table: 'raddningsarende'")
    expect(audit).toContain("{ table: 'lanseringsbevis'")
    const raddningsRad = audit.split('\n').find(l => l.includes("table: 'raddningsarende'"))
    const bevisRad = audit.split('\n').find(l => l.includes("table: 'lanseringsbevis'"))
    expect(raddningsRad).toContain('critical: false')
    expect(bevisRad).toContain('critical: false')
  })
})

test('facit-namnet ligger sist i package.json test:contracts och i contracts.yml', () => {
  const pkg = JSON.parse(read('package.json'))
  const contractsScript = pkg.scripts['test:contracts'] as string
  expect(contractsScript.trim().endsWith('tests/raddningsko.spec.ts --no-deps --project=chromium --reporter=line')).toBe(true)

  const workflow = read('../.github/workflows/contracts.yml')
  const lines = workflow.split('\n').map(l => l.trim()).filter(l => l.startsWith('tests/'))
  expect(lines.at(-1)).toBe('tests/raddningsko.spec.ts')
})
