# Phase 1 — what was built & how to ship it

## What's in this folder

Your full website with the opportunity intake system added (Phase 1 of the Build Plan). New since your repo:

- `/submit-opportunity` page — branching multi-step form (trading business / property portfolio), brand-native, mobile-first, with eligibility-gated confirmation screens (thank-you + reference, or the Instagram/Skool community redirect)
- Site refactor — `App.tsx` split into `pages/Home`, `components/Header`, `components/Footer`, with `react-router-dom`. "Sell to Us" added to the nav, a "Selling a Business or Property Portfolio?" section on the homepage, and footer/final-CTA links
- `src/lib/intake.ts` + `src/lib/supabase.ts` — form logic, eligibility gate (mirrors the server), submission + file upload
- `supabase/migrations/20260612120000_intake_schema.sql` — full database schema: `submissions`, `documents`, `scores` tables, `OI-2026-NNNN` reference trigger, RLS (anonymous users can only submit via locked-down RPCs, never read), private storage bucket
- New deps: `react-router-dom`, `@supabase/supabase-js`

Build verified: `tsc --noEmit` and `vite build` both pass; eligibility gate unit-tested.

## To ship

1. **Replace your repo contents** with this folder (or copy the changed files in), then:
   ```bash
   npm install --legacy-peer-deps   # vite 8 / plugin-react peer conflict in your existing setup
   npm run dev                      # check locally
   git add -A && git commit -m "Add opportunity intake system (Phase 1)" && git push
   ```
2. **Supabase** — once the project exists (waiting on your plan upgrade), the migration gets applied and you'll have a URL + anon key.
3. **Netlify env vars** — Site settings → Environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (Until these are set, the form shows a friendly "temporarily unavailable" error on submit.)

## Placeholders to fill before launch

- `SKOOL_URL` in `src/lib/intake.ts` — your real Skool link (Instagram is already set to @officially.invested)
- Privacy policy link for the consent text, if you have one

## Still to come (Phases 2–4)

Scoring Edge Function (Claude + Companies House), Resend emails 1–5, admin dashboard at `/admin/pipeline`, inbound email re-scoring loop.
