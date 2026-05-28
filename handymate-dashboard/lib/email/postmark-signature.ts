/**
 * lib/email/postmark-signature.ts (2026-05-28).
 *
 * Postmark Inbound stödjer inte HMAC-signering — istället skyddas
 * webhook-URL:n med HTTP Basic Auth. I Postmark-konsolen anges
 * webhook-URL som `https://USER:PASS@app.handymate.se/api/email/inbound`,
 * och Postmark POSTar med `Authorization: Basic <base64(USER:PASS)>`.
 *
 * Vi verifierar den header:n här. Misslyckas → 401, ingen lead skapas.
 *
 * Env-variabler (sätts i Vercel):
 *   POSTMARK_INBOUND_USERNAME — fri text, ex. "handymate-inbound"
 *   POSTMARK_INBOUND_PASSWORD — slumpmässigt 32+ tecken
 *
 * Utan dessa returnerar verifyPostmarkBasicAuth false → vägen är död
 * i prod om env saknas (säkert default).
 */

import type { NextRequest } from 'next/server'

export interface BasicAuthCredentials {
  username: string
  password: string
}

/**
 * Verifierar Basic Auth-header mot env-konfigurerad user/pass.
 * Returnerar true endast vid exakt match + båda env-variablerna satta.
 */
export function verifyPostmarkBasicAuth(request: NextRequest): boolean {
  const expectedUser = process.env.POSTMARK_INBOUND_USERNAME
  const expectedPass = process.env.POSTMARK_INBOUND_PASSWORD

  if (!expectedUser || !expectedPass) {
    console.error('[postmark-signature] POSTMARK_INBOUND_USERNAME/PASSWORD ej satta — alla anrop avvisas')
    return false
  }

  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) return false

  const encoded = authHeader.slice(6).trim()
  let decoded: string
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf-8')
  } catch {
    return false
  }

  const colonIdx = decoded.indexOf(':')
  if (colonIdx === -1) return false

  const user = decoded.slice(0, colonIdx)
  const pass = decoded.slice(colonIdx + 1)

  // Constant-time compare för att undvika timing-attacker
  return constantTimeEquals(user, expectedUser) && constantTimeEquals(pass, expectedPass)
}

/**
 * Konstant-tids-jämförelse. Misslyckas om längderna skiljer; annars
 * XOR-loop över alla bytes. Förhindrar att en angripare läcker
 * sekret-längd genom timing-skillnader.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
