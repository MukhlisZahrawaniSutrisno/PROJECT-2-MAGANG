# Whose Job Is It Anyway? — implementation, 2026-10-07

Build the approved internal PIC finder with Next.js, TypeScript, Tailwind and Supabase.
User authorized implementation and parallel delegation. Empty non-Git workspace: work in place.
No external account creation or deployment. Search-first Indonesian UI, navy sidebar #151c31,
lavender search #ebe7ff, purple #7258df, background #f7f8fc, ink #24304c, green #15976c.
Live: invite-only sessions; protected user roles; secure RPCs; no service-role key.
Development without credentials: labeled isolated localStorage demo.
Production without credentials: fail closed unless DEMO_MODE=true.

1. Core agent: lib/search.ts, lib/seed.ts, lib/demo-store.ts, lib/validation.ts, tests/core.test.ts.
2. Database agent: supabase/migrations/001_initial.sql, supabase/seed.sql, tests/database.test.ts.
   RPCs app_bootstrap(), search_problems(p_query text, p_request_id uuid), admin_mutate(p_command jsonb).
3. Admin agent: components/admin-panel.tsx, components/admin.css. data, section, onCommand props.
4. Lead: shared types, public UI, API/auth, config, integration, docs and browser QA.

Agents share lib/types.ts contracts and edit distinct files. Verification: core search/routing,
short queries/typos, interval boundaries, snapshots, unmatched grouping/reopening, validation;
database migration execution, constraints, auth, privacy, transactions/idempotency; browser
search/filters/detail/CRUD/persistence, mobile and keyboard. Run unit/database tests, typecheck,
production build and Playwright. Errors cannot become successful saves or false unmatched results.

## Verification record — 2026-10-07

- npm test: 25 passed, zero failures (8 core, 1 config, 15 database subtests + database suite).
- npm run typecheck: passed.
- npm run build: production build passed, including resource pages and API routes.
- npm run test:e2e: 16 desktop/mobile checks passed, zero failures.
- Production HTTP: unconfigured bootstrap 503; demo resource without opt-in 404;
  cross-origin admin mutation 403.
- Independent review integrated: account-deletion log preservation and NULL-safe retry,
  resolved unmatched reopening, direct RPC type validation, inactive referenced PIC,
  proper form labels, mobile inert navigation, production demo-resource guard.
- Live Supabase Auth/SMTP and remote deployment not exercised: project credentials absent.

Screenshots: docs/screenshots/desktop.png and docs/screenshots/mobile.png.
A production-built local demo runs with explicit DEMO_MODE=true; this does not configure live auth.
