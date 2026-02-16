# Handymate Pilot Launch Checklist
**Date:** 2026-02-11

## Pre-Launch (Before First Pilot Customer)

### Infrastructure
- [ ] All SQL migrations executed in production Supabase
- [ ] Environment variables set in Vercel:
  - [ ] `STRIPE_SECRET_KEY`
  - [ ] `STRIPE_PUBLISHABLE_KEY`
  - [ ] `STRIPE_WEBHOOK_SECRET`
  - [ ] `CRON_SECRET`
  - [ ] `RESEND_API_KEY`
  - [ ] All existing vars verified
- [ ] Stripe webhook endpoint configured: `https://handymate.se/api/billing/webhook`
- [ ] Stripe products/prices created matching plan_ids (starter, professional, business)
- [ ] Vercel cron jobs configured with CRON_SECRET header
- [ ] Domain SSL verified
- [ ] Health check passing: `GET /api/health`

### Security
- [x] Cron endpoints protected with CRON_SECRET
- [x] Voice consent business_id injection fixed
- [x] ~40 API routes migrated to getServerSupabase()
- [x] Security headers middleware active
- [x] GDPR data export/deletion APIs
- [x] Cookie consent banner
- [x] Privacy policy page
- [ ] RLS policies verified in Supabase dashboard
- [ ] Stripe webhook signature validation working

### Billing
- [x] Stripe checkout flow implemented
- [x] Subscription lifecycle webhook handling
- [x] Usage tracking (SMS, calls, AI)
- [x] Billing settings page with plan comparison
- [ ] Test full checkout flow end-to-end
- [ ] Test plan upgrade/downgrade
- [ ] Test failed payment handling
- [ ] Set up Stripe test mode for pilot

### Features
- [x] Quote CRUD with auto-save
- [x] Professional PDF template
- [x] E-signing flow
- [x] Invoice creation and sending
- [x] Pipeline/CRM
- [x] AI inbox + call analysis
- [x] Google Calendar sync
- [x] Fortnox integration
- [x] Team management + permissions
- [x] Onboarding checklist + welcome modal
- [x] Help center
- [x] Admin metrics dashboard

### Monitoring
- [x] Health check endpoint (/api/health)
- [x] Error boundary in React
- [x] Toast notifications instead of alert()
- [ ] Set up Sentry for error tracking (recommended)
- [ ] Set up uptime monitoring (e.g., UptimeRobot)

## Pilot Onboarding (Per Customer)

1. [ ] Create pilot account via /admin/onboard
2. [ ] Verify phone number provisioned via 46elks
3. [ ] Confirm call forwarding works
4. [ ] Send welcome email with login credentials
5. [ ] Schedule 15-min onboarding call
6. [ ] Verify first test call goes through
7. [ ] Confirm AI inbox shows suggestions

## Feedback Collection

- [ ] Set up weekly check-in (15 min)
- [ ] Create shared feedback channel (email or Slack)
- [ ] Track: feature requests, bugs, confusion points
- [ ] NPS survey after 2 weeks

## Kill Switch

If critical issues arise during pilot:
1. **Pause phone forwarding**: Update 46elks to forward directly to customer's number
2. **Disable AI**: Set automation_settings AI toggles to false
3. **Billing pause**: Pause subscription in Stripe dashboard
4. **Full rollback**: Restore from Supabase backup

## Post-Pilot Review

After 30 days:
- [ ] Analyze usage metrics from admin dashboard
- [ ] Review feedback and prioritize fixes
- [ ] Decide: expand pilot, iterate, or pivot
- [ ] Plan next batch of features based on feedback
