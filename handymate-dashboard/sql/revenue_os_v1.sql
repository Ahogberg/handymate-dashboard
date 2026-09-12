-- Handymate Revenue OS v1
-- Internal/admin-only GTM operating system.
-- Access is intentionally through service-role-backed /api/admin/revenue endpoints.

create extension if not exists pgcrypto;

create table if not exists revenue_accounts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  org_number text,
  website text,
  industry text,
  employee_count integer,
  city text,
  owner_email text,
  source text not null default 'manual',
  source_url text,

  icp_score integer not null default 0 check (icp_score between 0 and 25),
  pain_score integer not null default 0 check (pain_score between 0 and 20),
  timing_score integer not null default 0 check (timing_score between 0 and 20),
  growth_score integer not null default 0 check (growth_score between 0 and 15),
  warmth_score integer not null default 0 check (warmth_score between 0 and 10),
  ability_to_pay_score integer not null default 0 check (ability_to_pay_score between 0 and 10),
  total_score integer generated always as (
    icp_score + pain_score + timing_score + growth_score + warmth_score + ability_to_pay_score
  ) stored,

  why_now text,
  pain_hypothesis text,
  personalization_hook text,
  recommended_channel text,
  recommended_cta text,

  status text not null default 'identified' check (status in (
    'identified','contacted','conversation','audit_booked','demo','proposal',
    'verbal_commit','won','lost','nurture'
  )),
  lost_reason text check (lost_reason is null or lost_reason in (
    'no_pain','not_now','price','implementation_risk','wrong_person','already_solved',
    'fortnox_dependency','ai_trust','competitor','no_response','other'
  )),
  next_action text,
  next_action_at timestamptz,
  last_contact_at timestamptz,
  notes text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists revenue_accounts_org_number_uidx
  on revenue_accounts (org_number) where org_number is not null;
create index if not exists revenue_accounts_queue_idx
  on revenue_accounts (status, next_action_at, total_score desc);
create index if not exists revenue_accounts_owner_idx
  on revenue_accounts (owner_email, status);

create table if not exists revenue_signals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references revenue_accounts(id) on delete cascade,
  signal_type text not null,
  title text not null,
  detail text,
  strength integer not null default 1 check (strength between 1 and 5),
  source text,
  source_url text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists revenue_signals_account_idx
  on revenue_signals (account_id, observed_at desc);
create index if not exists revenue_signals_recent_idx
  on revenue_signals (observed_at desc, strength desc);

create table if not exists revenue_activities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references revenue_accounts(id) on delete cascade,
  activity_type text not null check (activity_type in (
    'call','email','linkedin','sms','referral','meeting','audit','demo','proposal','note'
  )),
  outcome text,
  summary text,
  seller_email text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists revenue_activities_account_idx
  on revenue_activities (account_id, occurred_at desc);
create index if not exists revenue_activities_seller_idx
  on revenue_activities (seller_email, occurred_at desc);

create table if not exists revenue_opportunities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references revenue_accounts(id) on delete cascade,
  plan text,
  billing_preference text check (billing_preference is null or billing_preference in ('monthly','annual','unknown')),
  expected_arr_sek numeric(14,2),
  stage text not null default 'identified' check (stage in (
    'identified','contacted','conversation','audit_booked','demo','proposal',
    'verbal_commit','won','lost','nurture'
  )),
  probability integer check (probability is null or probability between 0 and 100),
  owner_email text,
  next_step text,
  next_step_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists revenue_opportunities_stage_idx
  on revenue_opportunities (stage, next_step_at);
create index if not exists revenue_opportunities_owner_idx
  on revenue_opportunities (owner_email, stage);

-- Internal tables: browser clients get no direct access. Service-role admin API bypasses RLS.
alter table revenue_accounts enable row level security;
alter table revenue_signals enable row level security;
alter table revenue_activities enable row level security;
alter table revenue_opportunities enable row level security;

comment on table revenue_accounts is 'Internal Handymate Revenue OS accounts. Admin/service-role only.';
comment on table revenue_signals is 'Source-backed buying/timing signals for Revenue OS accounts.';
comment on table revenue_activities is 'Seller activity/outcome log for Revenue OS.';
comment on table revenue_opportunities is 'Commercial opportunity records for Revenue OS.';
