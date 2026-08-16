import { createHash } from 'node:crypto'
import type { BusinessScenarioResult, ProjectMarginWatchRequest } from './scenario-contract'

/** Stabil dedupe-nyckel för exakt request + exakt beräknat scenario. */
export function buildProjectMarginFingerprint(
  request: ProjectMarginWatchRequest,
  result: BusinessScenarioResult,
): string {
  const metricSnapshot = result.metrics
    .map(metric => [metric.key, metric.baseline, metric.scenario])
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
  const source = JSON.stringify({ version: result.version, request, metricSnapshot })
  const hash = createHash('sha256')
  hash.update(source)
  return `btw_v1_${hash.digest('hex')}`
}
