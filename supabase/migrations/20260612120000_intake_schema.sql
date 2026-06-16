-- Officially Invested — Opportunity Intake schema
-- Spec §7. Three tables + enums + reference trigger + RLS + RPCs + storage bucket.

-- ===== Enums =====
create type public.submission_type as enum ('business', 'property');
create type public.submitter_role as enum ('owner', 'broker', 'other');
create type public.yes_no_maybe as enum ('yes', 'no', 'maybe');
create type public.submission_status as enum ('new', 'reviewing', 'shortlisted', 'passed', 'ineligible');
create type public.document_source as enum ('form-upload', 'email-reply');
create type public.score_tier as enum ('A', 'B', 'C', 'Reject');

-- ===== submissions =====
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  reference text unique,
  created_at timestamptz not null default now(),
  type public.submission_type not null,

  -- contact
  submitter_name text not null,
  email text not null,
  phone text not null,
  submitter_role public.submitter_role not null,
  role_in_business text,
  ownership_stake_pct numeric,
  firm_name text,
  owner_name text,
  owner_contact text,
  heard_via text,

  -- business path
  business_name text,
  companies_house_number text,
  website text,
  sector text,
  year_established int,
  region text,
  employees int,
  description text,
  revenue numeric,
  net_profit numeric,
  revenue_trend text,
  recurring_pct numeric,
  customer_concentration boolean,
  handover_willing boolean,
  handover_period text,

  -- property path
  is_spv boolean,
  spv_name text,
  selling_100pct boolean,
  portfolio_value numeric,
  property_type text,
  num_units int,
  locations text,
  gross_rent numeric,
  net_income numeric,
  gross_yield numeric,
  void_rate numeric,
  outstanding_debt numeric,
  ltv numeric,

  -- deal expectations (shared)
  asking_price numeric,
  day_one_cash_need numeric,
  open_to_deferred public.yes_no_maybe,
  reason_for_sale text,

  -- misc
  links text,
  notes text,
  marketing_optin boolean not null default false,
  consent boolean not null default false,

  status public.submission_status not null default 'new',
  admin_notes text
);

create index submissions_status_idx on public.submissions (status);
create index submissions_created_idx on public.submissions (created_at desc);
create index submissions_email_idx on public.submissions (email);

-- ===== reference generator: OI-YYYY-NNNN =====
create sequence public.submission_ref_seq;

create or replace function public.set_submission_reference()
returns trigger
language plpgsql
as $$
begin
  if new.reference is null then
    new.reference := 'OI-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.submission_ref_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger submissions_set_reference
  before insert on public.submissions
  for each row execute function public.set_submission_reference();

-- ===== documents =====
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text,
  source public.document_source not null default 'form-upload',
  uploaded_at timestamptz not null default now()
);

create index documents_submission_idx on public.documents (submission_id);

-- ===== scores (append-only history) =====
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  meets_criteria boolean not null,
  fit_score int check (fit_score between 0 and 100),
  tier public.score_tier,
  summary text,
  rationale text,
  red_flags jsonb default '[]'::jsonb,
  missing_documents jsonb default '[]'::jsonb,
  data_completeness_pct int check (data_completeness_pct between 0 and 100),
  suggested_action text,
  companies_house jsonb,
  model text,
  scored_at timestamptz not null default now()
);

create index scores_submission_idx on public.scores (submission_id, scored_at desc);

-- ===== RLS: deny-by-default for anon; authenticated (admin) full read + status updates =====
alter table public.submissions enable row level security;
alter table public.documents enable row level security;
alter table public.scores enable row level security;

create policy "admin read submissions" on public.submissions
  for select to authenticated using (true);
create policy "admin update submissions" on public.submissions
  for update to authenticated using (true) with check (true);
create policy "admin read documents" on public.documents
  for select to authenticated using (true);
create policy "admin read scores" on public.scores
  for select to authenticated using (true);

-- ===== Public-facing RPCs (security definer, so anon never touches tables directly) =====

-- Submit: validates the basics, inserts, returns id + reference + eligibility.
create or replace function public.submit_opportunity(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ref text;
  v_type public.submission_type;
  v_eligible boolean;
begin
  if coalesce((payload->>'consent')::boolean, false) is distinct from true then
    raise exception 'Consent is required';
  end if;
  if coalesce(payload->>'submitter_name', '') = '' or coalesce(payload->>'email', '') = '' or coalesce(payload->>'phone', '') = '' then
    raise exception 'Name, email and phone are required';
  end if;

  v_type := (payload->>'type')::public.submission_type;

  insert into public.submissions (
    type, submitter_name, email, phone, submitter_role, role_in_business,
    ownership_stake_pct, firm_name, owner_name, owner_contact, heard_via,
    business_name, companies_house_number, website, sector, year_established,
    region, employees, description, revenue, net_profit, revenue_trend,
    recurring_pct, customer_concentration, handover_willing, handover_period,
    is_spv, spv_name, selling_100pct, portfolio_value, property_type, num_units,
    locations, gross_rent, net_income, gross_yield, void_rate, outstanding_debt, ltv,
    asking_price, day_one_cash_need, open_to_deferred, reason_for_sale,
    links, notes, marketing_optin, consent
  ) values (
    v_type,
    payload->>'submitter_name', payload->>'email', payload->>'phone',
    (payload->>'submitter_role')::public.submitter_role,
    payload->>'role_in_business',
    nullif(payload->>'ownership_stake_pct', '')::numeric,
    payload->>'firm_name', payload->>'owner_name', payload->>'owner_contact', payload->>'heard_via',
    payload->>'business_name', payload->>'companies_house_number', payload->>'website',
    payload->>'sector', nullif(payload->>'year_established', '')::int,
    payload->>'region', nullif(payload->>'employees', '')::int, payload->>'description',
    nullif(payload->>'revenue', '')::numeric, nullif(payload->>'net_profit', '')::numeric,
    payload->>'revenue_trend', nullif(payload->>'recurring_pct', '')::numeric,
    nullif(payload->>'customer_concentration', '')::boolean,
    nullif(payload->>'handover_willing', '')::boolean, payload->>'handover_period',
    nullif(payload->>'is_spv', '')::boolean, payload->>'spv_name',
    nullif(payload->>'selling_100pct', '')::boolean,
    nullif(payload->>'portfolio_value', '')::numeric, payload->>'property_type',
    nullif(payload->>'num_units', '')::int, payload->>'locations',
    nullif(payload->>'gross_rent', '')::numeric, nullif(payload->>'net_income', '')::numeric,
    nullif(payload->>'gross_yield', '')::numeric, nullif(payload->>'void_rate', '')::numeric,
    nullif(payload->>'outstanding_debt', '')::numeric, nullif(payload->>'ltv', '')::numeric,
    nullif(payload->>'asking_price', '')::numeric, nullif(payload->>'day_one_cash_need', '')::numeric,
    nullif(payload->>'open_to_deferred', '')::public.yes_no_maybe,
    payload->>'reason_for_sale', payload->>'links', payload->>'notes',
    coalesce((payload->>'marketing_optin')::boolean, false), true
  )
  returning id, reference into v_id, v_ref;

  -- authoritative eligibility gate (spec §8 stage 1)
  if v_type = 'business' then
    v_eligible := coalesce(nullif(payload->>'revenue', '')::numeric, 0) >= 1000000
              and coalesce(nullif(payload->>'net_profit', '')::numeric, 0) >= 200000;
  else
    v_eligible := coalesce(nullif(payload->>'portfolio_value', '')::numeric, 0) >= 1000000
              and coalesce(nullif(payload->>'is_spv', '')::boolean, false);
  end if;

  if not v_eligible then
    update public.submissions set status = 'ineligible' where id = v_id;
  end if;

  return jsonb_build_object('id', v_id, 'reference', v_ref, 'eligible', v_eligible);
end;
$$;

-- Register an uploaded document against a submission.
create or replace function public.add_document(
  p_submission_id uuid,
  p_file_path text,
  p_file_name text,
  p_file_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.submissions where id = p_submission_id) then
    raise exception 'Unknown submission';
  end if;
  insert into public.documents (submission_id, file_path, file_name, file_type, source)
  values (p_submission_id, p_file_path, p_file_name, p_file_type, 'form-upload');
end;
$$;

revoke all on function public.submit_opportunity(jsonb) from public;
revoke all on function public.add_document(uuid, text, text, text) from public;
grant execute on function public.submit_opportunity(jsonb) to anon;
grant execute on function public.add_document(uuid, text, text, text) to anon;
grant execute on function public.submit_opportunity(jsonb) to authenticated;
grant execute on function public.add_document(uuid, text, text, text) to authenticated;

-- ===== Storage: private bucket for uploads =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submission-documents', 'submission-documents', false, 10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
);

create policy "anon can upload submission docs" on storage.objects
  for insert to anon
  with check (bucket_id = 'submission-documents');

create policy "admin can read submission docs" on storage.objects
  for select to authenticated
  using (bucket_id = 'submission-documents');
