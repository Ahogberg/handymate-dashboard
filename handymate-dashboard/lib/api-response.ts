import { NextResponse } from 'next/server'

export function apiSuccess(data: any, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiError(message: string, status = 500, details?: any) {
  const body: any = { error: message }
  if (process.env.NODE_ENV === 'development' && details) {
    body.details = details instanceof Error ? details.message : details
  }
  return NextResponse.json(body, { status })
}

export function apiUnauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function apiBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}
