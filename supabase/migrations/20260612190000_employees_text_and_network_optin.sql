-- Applied live on 2026-06-12. employees becomes a range label ('2–9' etc.);
-- network_optin records seller consent to share with the vetted buyer network.
-- The submit_opportunity function was re-created accordingly (see live DB /
-- Supabase dashboard for current definition).

alter table public.submissions alter column employees type text using employees::text;
alter table public.submissions add column network_optin boolean not null default false;
