# Handymate Platform Audit
**Date:** 2026-02-11
**Scope:** Full codebase — pages, API routes, lib files, integrations, SQL, security

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Dashboard Pages | 36 |
| API Routes | ~135 |
| Lib Files | 24 |
| SQL Migrations | 19 |
| Components | 9+ |
| Integrations | 12 assessed |
| **Overall Score** | **85/100 — Production-ready with caveats** |

### Critical Findings
- **8 critical security issues** (webhook auth, cron auth, DB client pattern)
- **15 high-priority issues** (N+1 queries, input validation, demo data)
- **25 medium issues** (audit logging, pagination, error messages)
- **~40 routes use wrong DB client** (`createClient()` instead of `getServerSupabase()`)
- **No Stripe billing** integration exists
- **No automated tests** found

---

## 1. Feature Inventory

### Pages & UI

| Page | Path | Status | Issues |
|------|------|--------|--------|
| Dashboard Home | `/dashboard` | ✅ | Direct supabase client, silent catch blocks |
| Quote List | `/dashboard/quotes` | ✅ | Silent fetch failure |
| Quote Create (Wizard) | `/dashboard/quotes/new` | ⚠️ | `alert()` dialogs, hardcoded rates (650 kr/h), missing validation |
| Quote Detail | `/dashboard/quotes/[id]` | ✅ | — |
| Quote Edit | `/dashboard/quotes/[id]/edit` | ✅ | Auto-save implemented |
| Invoice List | `/dashboard/invoices` | ✅ | Empty catch blocks, no delete confirmation |
| Invoice Create | `/dashboard/invoices/new` | ✅ | `alert()`, direct supabase, hardcoded rate (500) |
| Invoice Detail | `/dashboard/invoices/[id]` | ✅ | — |
| Customer List | `/dashboard/customers` | ✅ | Direct supabase, `(customer as any)` cast |
| Customer Detail | `/dashboard/customers/[id]` | ✅ | — |
| Customer Import | `/dashboard/customers/import` | ✅ | — |
| Bookings | `/dashboard/bookings` | ✅ | Direct supabase, no delete confirmation |
| Calendar | `/dashboard/calendar` | ✅ | Direct supabase, hardcoded rate (500), no conflict detection |
| AI Inbox | `/dashboard/ai-inbox` | ✅ | Direct supabase, `editForm: any` |
| Call Inbox | `/dashboard/inbox` | ✅ | — |
| Voice Assistant | `/dashboard/assistant` | ✅ | `alert()`, TODO comment, assumes browser APIs |
| Pipeline | `/dashboard/pipeline` | ✅ | — |
| Projects | `/dashboard/projects` | ✅ | — |
| Project Detail | `/dashboard/projects/[id]` | ✅ | — |
| Documents | `/dashboard/documents` | ✅ | — |
| Orders | `/dashboard/orders` | ✅ | Silent catch, no delete confirmation |
| Campaigns | `/dashboard/campaigns` | ✅ | — |
| Automations | `/dashboard/automations` | ✅ | — |
| Settings | `/dashboard/settings` | ⚠️ | Direct supabase, hardcoded SMS pricing |
| Knowledge Base | `/dashboard/settings/knowledge` | ✅ | — |
| Price List | `/dashboard/settings/pricelist` | ✅ | — |
| Team | `/dashboard/team` | ✅ | — |
| Schedule | `/dashboard/schedule` | ✅ | — |
| Time Tracking | `/dashboard/time` | ✅ | — |
| Login | `/login` | ✅ | — |
| Signup (5 steps) | `/signup` | ✅ | Silent `.catch(() => {})` in skip handler |
| Admin Onboard | `/admin/onboard` | ✅ | `alert()`, console.error |
| Public Quote Sign | `/quote/[token]` | ✅ | Excellent canvas signature implementation |

### Components

| Component | Status | Issues |
|-----------|--------|--------|
| Sidebar | ✅ | Supabase realtime subscription may leak on unmount |
| AICopilot | ✅ | Generic error message, no retry |
| OnboardingChecklist | ✅ | `alert()` dialogs, console.error |
| PhotoCapture | ✅ | No max file size validation |
| VoiceRecorder | ✅ | Hardcoded `audio/webm`, no duration limit, no browser check |
| AIQuotePreview | ✅ | — |
| InputSelector | ✅ | — |
| TemplateSelector | ✅ | — |
| ProductSearchModal | ✅ | — |

---

## 2. API Routes Audit

### Authentication Pattern Summary

| Pattern | Count | Secure? |
|---------|-------|---------|
| `getAuthenticatedBusiness` | ~100 | ✅ |
| `getAdminSupabase` / `isAdmin` | 4 | ✅ |
| Public token (portal, quotes) | 5 | ✅ |
| **NO AUTH (Webhooks)** | **5** | **❌** |
| **NO AUTH (Cron)** | **3** | **❌** |

### Database Client Pattern

| Client | Count | Correct? |
|--------|-------|----------|
| `getServerSupabase()` | ~95 | ✅ |
| `createClient(SERVICE_ROLE)` | **~40** | **❌ Wrong** |

Files using wrong pattern include: `voice/*`, `sms/incoming`, `suppliers`, `suggestions/approve`, `recordings`, `time-entry`, `dashboard/stats`, `assistant/command`, and ~30 more.

### Rate Limiting Coverage

| Type | Implemented? |
|------|-------------|
| SMS (10/min, 50/day) | ✅ |
| Email (20/min, 100/day) | ✅ |
| Phone API (5/min) | ✅ |
| AI API (20/min) | ✅ |
| General API | ❌ Missing |
| Brute force (tokens) | ❌ Missing |
| Login attempts | ❌ Missing |

---

## 3. Critical Security Issues

### C1. Webhook Signature Validation Missing
**Severity:** CRITICAL
**Files:** `voice/incoming`, `voice/recording`, `sms/incoming`, `voice/consent`
**Issue:** No HMAC/signature verification from 46elks. Attacker can trigger fake recordings, SMS, calls.
**Fix:** Validate 46elks webhook signatures or IP whitelist.

### C2. Unprotected Cron Endpoints
**Severity:** CRITICAL
**Files:** `cron/check-overdue`, `cron/communication-check`, `cron/sync-calendars`
**Issue:** No auth check — anyone can trigger cron jobs externally.
**Fix:** Validate `Authorization: Bearer ${CRON_SECRET}` header.

### C3. Voice Consent business_id Injection
**Severity:** CRITICAL
**File:** `voice/consent`
**Issue:** Trusts `business_id` from query parameter instead of deriving from call recording.
**Fix:** Look up business_id from the call_recording table.

### C4. ~40 Routes Use Wrong DB Client
**Severity:** CRITICAL
**Issue:** `createClient(SERVICE_ROLE_KEY)` bypasses RLS with no auth context. If any route leaks the key, attacker gets full DB access.
**Fix:** Replace all with `getServerSupabase()`.

### C5. AI Copilot Uses Demo Data
**Severity:** HIGH
**File:** `api/ai-copilot/route.ts`
**Issue:** Hardcoded "Elexperten Stockholm" demo context instead of real business data.
**Fix:** Fetch real business data from DB.

### C6. Onboarding Phone Not Auth-Protected
**Severity:** HIGH
**File:** `api/onboarding/phone`
**Issue:** Trusts `businessId` from request body. Attacker can provision phones for other businesses.
**Fix:** Add `getAuthenticatedBusiness` check.

### C7. No Rate Limiting on Login
**Severity:** HIGH
**File:** `api/auth`
**Issue:** No brute-force protection on login/register endpoints.
**Fix:** Add rate limiting by IP.

### C8. OAuth State Parameter Not Validated
**Severity:** HIGH
**Files:** `fortnox/callback`, `google/callback`
**Issue:** CSRF risk — callback must validate `state` param against stored value.
**Fix:** Store state in httpOnly cookie, verify on callback.

---

## 4. High-Priority Issues

| # | Issue | Files | Impact |
|---|-------|-------|--------|
| H1 | N+1 queries in dashboard stats (7 sequential per-day queries) | `dashboard/stats` | Slow dashboard load |
| H2 | No numeric range validation (negative hours, huge rates) | Multiple POST routes | Data corruption |
| H3 | No CORS headers on public endpoints | Public quote/portal | Potential XSS |
| H4 | Signature data stored unencrypted | `quotes/public/[token]` | Forgery risk |
| H5 | SMS/email rate limit per business, not against plan quota | `quotes/send`, `invoices/send` | Over-quota sending |
| H6 | Pipeline errors silently caught (non-blocking) | `quotes/send` | Deals don't move |
| H7 | No request body size limit | All POST endpoints | Memory exhaustion |
| H8 | Timezone handling inconsistent (local vs UTC) | Multiple routes | Wrong dates |
| H9 | Email templates don't escape HTML entities | `quotes/send`, `invoices/send` | XSS in email clients |
| H10 | Hard DELETE instead of soft delete | Multiple DELETE endpoints | Audit trail lost |
| H11 | No pagination on list endpoints | `quotes`, `invoices`, `projects` | Performance at scale |
| H12 | No transaction handling for multi-insert | `projects` (project + milestones) | Partial data |
| H13 | No idempotency keys on POST | All POST endpoints | Duplicate records |
| H14 | Webhook processing not idempotent | `voice/recording`, `sms/incoming` | Duplicate records |
| H15 | `alert()` dialogs block UI | 5+ pages/components | Poor UX |

---

## 5. Integration Status

| Integration | Status | Lib File | Notes |
|-------------|--------|----------|-------|
| **Supabase** | ✅ Complete | `supabase.ts` | Client + server, rate limiting |
| **Anthropic Claude** | ✅ Complete | `ai.ts`, `ai-quote-generator.ts`, `communication-ai.ts`, `pipeline-ai.ts` | Vision, quotes, comms, pipeline |
| **46elks (Phone/SMS)** | ✅ Complete | `smart-communication.ts` | Webhooks need signature validation |
| **OpenAI Whisper** | ✅ Complete | Direct API in `voice/transcribe` | Transcription |
| **Fortnox** | ✅ Complete | `fortnox.ts` (624 lines) | Full OAuth + customer/invoice sync |
| **Google Calendar** | ✅ Complete | `google-calendar.ts` (286 lines) | Two-way sync with pagination |
| **Resend Email** | ⚠️ Minimal | Direct API calls in send routes | No dedicated lib file |
| **Ahlsell Supplier** | ❌ Stub | `suppliers/ahlsell.ts` | All methods throw "ej konfigurerad" |
| **Dahl/Elektroskandia/Solar** | ❌ Mock only | `suppliers/mock.ts` | Not started |
| **Vapi Voice Agent** | ❌ Not found | — | Zero code references, awaiting 46elks SIP |
| **Stripe** | ❌ Not found | — | Zero code references |

---

## 6. Environment Variables

### Required (Production-Critical)
| Variable | Used In | Status |
|----------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | All DB ops | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Server supabase | ✅ |
| `ANTHROPIC_API_KEY` | All AI features | ✅ |
| `ELKS_API_USER` | SMS & phone | ✅ |
| `ELKS_API_PASSWORD` | SMS & phone | ✅ |
| `OPENAI_API_KEY` | Whisper transcription | ✅ |
| `NEXT_PUBLIC_APP_URL` | Callbacks, links | ✅ |

### Integration-Dependent
| Variable | Used In | Status |
|----------|---------|--------|
| `FORTNOX_CLIENT_ID` | Fortnox OAuth | If using |
| `FORTNOX_CLIENT_SECRET` | Fortnox OAuth | If using |
| `FORTNOX_REDIRECT_URI` | Fortnox OAuth | If using |
| `GOOGLE_CLIENT_ID` | Calendar OAuth | If using |
| `GOOGLE_CLIENT_SECRET` | Calendar OAuth | If using |
| `GOOGLE_REDIRECT_URI` | Calendar OAuth | If using |
| `RESEND_API_KEY` | Email sending | If using |

### Missing (Not Yet Implemented)
| Variable | Feature | Status |
|----------|---------|--------|
| `STRIPE_SECRET_KEY` | Billing | ❌ Not found |
| `STRIPE_PUBLISHABLE_KEY` | Billing | ❌ Not found |
| `CRON_SECRET` | Cron protection | ❌ Not set (referenced in CLAUDE.md) |
| `VAPI_ASSISTANT_ID` | Voice agent | ❌ Not found |

---

## 7. SQL Migrations (19 files)

| File | Purpose | Status |
|------|---------|--------|
| `new_tables.sql` | time_entry, call_recording, ai_suggestion, sms_log | ✅ Idempotent |
| `fortnox_integration.sql` | Fortnox OAuth columns on business_config | ✅ Idempotent |
| `google_calendar.sql` | calendar_connection table, sync columns | ✅ Idempotent |
| `admin_tables.sql` | impersonation_tokens, admin_actions_log | ⚠️ Uses DROP (risky) |
| `business_users.sql` | Team members, roles, permissions | ✅ Idempotent |
| `pipeline.sql` | pipeline_stage, deal, pipeline_activity | ✅ Idempotent |
| `smart_communication.sql` | communication_rule/log/settings + 12 system rules | ✅ Idempotent |
| `automation_center.sql` | automation_settings (30+ toggles), automation_activity | ✅ Idempotent |
| `quote_enhancements.sql` | quote_number, terms, images + template enhancements | ✅ Idempotent |
| `supplier_connections.sql` | supplier_connection, grossist_product, project_material | ✅ Idempotent |
| `schedule_tables.sql` | schedule_entry, time_off_request | ✅ Idempotent |
| `projects.sql` | project, project_milestone, project_change | ✅ Idempotent |
| `fortnox_customers.sql` | Customer sync tracking | ✅ |
| `fortnox_invoices.sql` | Invoice sync tracking | ✅ |
| `rot_rut_documents.sql` | ROT/RUT documentation | ✅ |
| `customer_portal.sql` | Customer portal tables | ✅ |
| `document_templates.sql` | Document template system | ✅ |
| `time_tracking_expansion.sql` | Time entry enhancements | ✅ |
| `job_templates_and_ai_quotes.sql` | Quote template system | ✅ |

---

## 8. Code Quality

### Patterns Found Across Codebase

| Pattern | Occurrences | Action |
|---------|-------------|--------|
| `alert()` dialogs | 5+ pages/components | Replace with toast notifications |
| `console.error` in production | 10+ files | Remove or use proper logging |
| `console.log` debug statements | Several files | Remove |
| Direct client-side supabase queries | 7+ pages | Move to API routes |
| `any` type annotations | 4+ files | Add proper types |
| Hardcoded hourly rates (500-650 kr) | 3 files | Read from business_config |
| Hardcoded VAT (25%) | 1 file | Read from config |
| Silent empty catch blocks | 5+ files | Add error feedback |
| Missing TODO implementations | 1 (assistant reminder) | Complete or remove |

### Missing Cross-Cutting Concerns

| Concern | Status |
|---------|--------|
| Error boundary (React) | ❌ Missing |
| Global error logging (Sentry) | ❌ Missing |
| Request ID correlation | ❌ Missing |
| Audit logging middleware | ❌ Missing |
| Health check endpoint | ❌ Missing |
| OpenAPI/Swagger docs | ❌ Missing |
| Automated tests | ❌ Missing |
| ARIA labels / a11y | ❌ Missing |
| CSP headers | ❌ Missing |

---

## 9. Billing & Payment Status

**Current state:** No billing implementation exists.
- No Stripe integration
- No subscription management
- No usage tracking against plan limits
- No payment UI
- Pricing: Starter 2495, Professional 5995, Business 11995 kr/mån

**Required for launch:**
- Stripe subscription integration
- Usage metering (SMS, calls, AI requests)
- Plan enforcement (volume limits)
- Upgrade/downgrade flow
- Invoice generation for subscriptions

---

## 10. UX Issues

| Issue | Location | Priority |
|-------|----------|----------|
| `alert()` blocks UI thread | 5+ pages | HIGH |
| No toast notification system | Global | HIGH |
| No global error boundary | Global | HIGH |
| No keyboard shortcuts | Global | LOW |
| No drag-and-drop file upload | PhotoCapture | LOW |
| No form auto-save on non-quote pages | Forms | LOW |
| No undo/redo | Global | LOW |
| Canvas signature not keyboard-accessible | Quote sign page | MEDIUM |
| Missing ARIA labels on icon buttons | Global | MEDIUM |

---

## 11. Prioritized Action Plan

### P0 — Fix Before ANY Customer Data (Week 1)

1. [ ] Add auth to cron endpoints (CRON_SECRET header)
2. [ ] Fix voice/consent business_id injection
3. [ ] Replace ~40 `createClient()` calls with `getServerSupabase()`
4. [ ] Add webhook signature validation (46elks)
5. [ ] Fix AI copilot demo data
6. [ ] Add auth to onboarding/phone endpoint
7. [ ] Add login rate limiting

### P1 — Fix Before Pilot Launch (Week 2-3)

8. [ ] Replace all `alert()` with toast system
9. [ ] Move client-side supabase queries to API routes (7+ pages)
10. [ ] Add error boundary component
11. [ ] Set up error logging (Sentry)
12. [ ] Add pagination to list endpoints
13. [ ] Fix N+1 queries in dashboard/stats
14. [ ] Escape HTML in email templates
15. [ ] Add numeric validation on API routes
16. [ ] Implement Stripe billing (Phase 2)
17. [ ] Add CRON_SECRET env var

### P2 — Fix Before Scale (Month 2)

18. [ ] Add soft deletes
19. [ ] Add audit logging middleware
20. [ ] Add request ID correlation
21. [ ] Add idempotency keys
22. [ ] Add health check endpoint
23. [ ] Move to distributed rate limiting (Redis)
24. [ ] Add CSP headers
25. [ ] Add request body size limits
26. [ ] Fix timezone handling inconsistencies

### P3 — Nice to Have

27. [ ] ARIA labels and keyboard navigation
28. [ ] OpenAPI documentation
29. [ ] Automated test suite
30. [ ] Code splitting for large components
31. [ ] List virtualization
32. [ ] Offline mode

---

## 12. Phase 1-7 Sprint Impact Assessment

Based on this audit, here's how the planned phases map to actual needs:

| Phase | Priority | Estimated Effort | Key Blockers |
|-------|----------|-----------------|--------------|
| **1: Production Stability** | CRITICAL | 3-4 days | P0 items must go first |
| **2: Billing (Stripe)** | CRITICAL | 5-7 days | No existing code, full greenfield |
| **3: Onboarding** | HIGH | 2-3 days | Phone endpoint needs auth fix first |
| **4: GDPR & Security** | CRITICAL | 3-4 days | Webhook auth, RLS verification, ~40 route fixes |
| **5: Admin/Backoffice** | MEDIUM | 3-4 days | Admin panel exists, needs metrics |
| **6: Support & Help** | LOW | 2-3 days | Can launch without |
| **7: Pilot Preparation** | HIGH | 1-2 days | Depends on phases 1-4 |

**Recommended reorder:** Phase 4 (Security) should run in parallel with Phase 1 (Stability) since they overlap significantly. Phase 2 (Billing) is the biggest greenfield effort and should start early.
