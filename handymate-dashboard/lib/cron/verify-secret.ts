import { timingSafeEqual } from 'crypto'

type HeaderRequest = {
  headers: Pick<Headers, 'get'>
}

function secretsMatch(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate)
  const expectedBytes = Buffer.from(expected)
  return candidateBytes.length === expectedBytes.length
    && timingSafeEqual(candidateBytes, expectedBytes)
}

/**
 * Gemensamt fail-closed auth-kontrakt för cron-rutter.
 *
 * Accepterar Vercels `Authorization: Bearer ...` och den interna legacy-
 * headern `x-cron-secret`. Saknad/blank serverhemlighet nekar alltid, även
 * om klienten skickar den tidigare gissningsbara strängen `Bearer undefined`.
 */
export function verifyCronSecret(
  request: HeaderRequest,
  configuredSecret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!configuredSecret || configuredSecret.trim() === '') {
    console.warn('[cron-auth] denied: CRON_SECRET is not configured')
    return false
  }

  const authorization = request.headers.get('authorization')
  const bearer = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null
  const legacyHeader = request.headers.get('x-cron-secret')

  const allowed = [bearer, legacyHeader].some(candidate =>
    candidate != null && secretsMatch(candidate, configuredSecret),
  )

  if (!allowed) {
    console.warn('[cron-auth] denied: invalid or missing credential')
  }

  return allowed
}
