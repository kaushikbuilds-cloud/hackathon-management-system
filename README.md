# Hackathon Management System

A web app for running **one hackathon** from registration through event day. It has four parts:

- **Public registration form**: teams register without an account.
- **Admin Portal**: event setup, form builder, teams, ID cards, attendance, officials, support, announcements, reports and audit logs.
- **Official Portal**: QR and manual check-in, team lookup, and assigned support requests. PDF generation and corrections are available only when an admin grants them.
- **Team Portal**: each member signs in to their own account to see team details, announcements, the schedule and support requests.

Stack: **Next.js 16 (App Router) + TypeScript + Tailwind CSS 4**, **Supabase** (Postgres, Auth, Storage), server-side PDFs with **pdf-lib** (embedded Inter fonts, vector QR codes).

---

## Contents

1. [Features → PRD mapping](#features--prd-mapping)
2. [Architecture](#architecture)
3. [Security model](#security-model)
4. [Local setup](#local-setup)
5. [Environment variables](#environment-variables)
6. [Database: migrations & seed](#database-migrations--seed)
7. [Testing](#testing)
8. [Deployment (Vercel + Supabase)](#deployment-vercel--supabase)
9. [Event-day operations](#event-day-operations)
10. [Known limitations & future work](#known-limitations--future-work)

---

## Features → PRD mapping

| PRD section | Where it lives |
| --- | --- |
| 4.1 Auth & accounts | `/login`, `/forgot-password`, `/change-password`, `/auth/*`, `src/lib/auth.ts`, `src/lib/accounts.ts` |
| 4.2 Event setup | `/staff/event` |
| 4.3 Form builder & public form | `/staff/forms`, `/register/[slug]` |
| 4.4 Team-name uniqueness | `teams_name_key_unique` (generated `name_key` column) + `register_team()` |
| 4.5 Team / Participant IDs | sequences + triggers (`TEAM-2026-0001`, `PRT-2026-0001`), immutable |
| 4.6 Team management | `/staff/teams` (one row per team, expandable), `/staff/teams/[id]` |
| 4.7 ID card template | `/staff/id-cards` (versioned templates, sample preview) |
| 4.8 Per-team PDF | `/staff/teams/[id]/id-cards`, `POST /api/teams/[id]/id-cards` |
| 4.9 QR verification | `verify_qr()`; QR encodes `APP_URL/verify/<opaque token>` |
| 4.10 Attendance | `/staff/attendance` (camera scanner + manual), `check_in()`, `undo_check_in()` |
| 4.11 Team Portal | `/portal/*` |
| 4.12 Help & support | `/portal/support/*`, `/staff/support/*` |
| 4.13 Announcements & schedule | `/staff/announcements`, `/portal/schedule`, public schedule on `/` |
| 4.14 Reports | `/staff` dashboard, `/staff/reports`, `GET /api/reports/[kind]` (CSV) |
| 4.15 Audit logs | `/staff/audit` (row triggers + explicit events) |

### Registration and teams
- The form builder sets the team-size limits, which member fields are collected or required, custom questions (text, long text, dropdown), an open/close window, and optional approval. Forms can be previewed, published, unpublished and closed.
- Submissions are validated twice: in the browser/server action with zod, then again inside the database.
- `register_team()` inserts the team, its members and the submission record in **one transaction**. It is **idempotent**: each form render gets an idempotency key, so a retry or double-click returns the original team.
- Team names are **unique within the event after normalisation** (trim, collapse whitespace, ignore case). A unique index in the database enforces this. When two submissions with the same name arrive at once, one succeeds and the other gets "A team with this name is already registered".
- Each email can belong to only one team per event (unique `(hackathon_id, email_key)`).
- If validation fails, the form keeps everything the applicant typed and shows errors next to each field. Rejected attempts are stored so admins can review them.

### ID cards and PDFs
- Cards are single-sided and portrait. Sizes: CR80 badge, A6, or 4×6 in. Pages are either the card size or A4 with crop marks.
- The card shows the event branding, the participant's name, a photo (or initials), their role, Participant ID, team name and Team ID, college and department, event date and venue, and a QR code.
- **One PDF per team, one page per member.** Fonts are embedded. The QR codes are vector graphics. The filename is `<NormalizedTeamName>_<TeamID>_ID_Cards.pdf`.
- Before generating, the preview screen shows the team, member count, page count, template version, last generation (who and when), and warnings for missing data. It offers **Preview PDF** (rendered in memory, not stored) and **Generate & Download PDF** (stored privately and served through a short-lived signed URL).
- Every generation is recorded in `id_card_jobs` (template version, member and page counts, who generated it, file path, status). If generation fails, the job and team are marked **Failed** and it can be retried.
- A team's PDF becomes **Outdated** automatically when anything printed on its cards changes: member or team data, event branding, dates or venue, or a new template version.
- **No passwords are ever printed on cards.** The QR code holds only an opaque 256-bit token.

---

## Architecture

```
src/
  app/                 Next.js routes (public, /staff, /portal, /api)
  components/          UI kit (ui.tsx), status badges, shells, shared views
  lib/
    domain/            Pure logic: normalisation, IDs, validation, support workflow, CSV, templates
    pdf/id-cards.ts    Card renderer (pdf-lib + fontkit + qrcode)
    id-cards.ts        Loads team data via RLS, renders, stores, records jobs
    auth.ts            Session/profile loading, role and permission guards
    accounts.ts        Account provisioning (temporary passwords, invites, deactivation)
    supabase/          Server clients (user-scoped + service role) and session refresh
  proxy.ts             Refreshes the Supabase session; redirects anonymous users from protected areas
supabase/
  migrations/          Schema, functions/triggers/RPCs, RLS & grants, storage buckets
  seed.sql             Development data (event, form, template, schedule, 4 demo teams)
  templates/           Invite and recovery email templates (token-hash links)
  tests/               Supabase stand-in used only by the DB integration tests
tests/
  unit/                Vitest: domain logic and PDF generation
  db/                  Vitest: migrations, RLS, concurrency and workflows on real Postgres
  e2e/                 Playwright: full user journeys, axe accessibility checks, mobile
assets/fonts/          Inter (SIL OFL) embedded into PDFs
```

How the pieces work together:

- **Business rules that matter for correctness live in Postgres**: uniqueness, ID generation, immutability, duplicate check-in prevention, support status transitions, PDF-outdated tracking and audit triggers. The app cannot bypass them by mistake.
- **Pages and server actions use the user-scoped Supabase client**, so RLS applies to every read and write. The service-role client is used only after an explicit server-side permission check. That covers registration (the RPC is service-role-only, called after rate limiting), account provisioning, storage and PDF job bookkeeping. It passes the real actor in an `x-actor-id` header so audit triggers still record who did it.
- Private files (PDFs, photos, attachments) are only ever handed out through signed URLs that last 5 minutes by default.

---

## Security model

| Role | Can |
| --- | --- |
| **Super Admin** | Everything, including creating and removing administrators and changing roles. |
| **Admin** | Event, forms, teams, credentials, templates, PDFs, attendance corrections, support assignment, announcements, reports, audit logs, and managing **officials**. Cannot change other admins. |
| **Official** | View teams and participants, verify QR codes, check people in, and handle support requests assigned to them. Optional per-official permissions: **edit registrations**, **generate PDFs**, **correct attendance**, **see and assign all support**. |
| **Team leader / member** | Their own team's data, announcements, the schedule, and their team's support requests. Nothing else (enforced by RLS). |
| **Public** | Event page, published registration form, public schedule. |

How this is enforced:

- **Authorisation is checked on the server and again in the database.** Pages and actions call `requireAdmin` / `requirePermission` / `requireParticipant`, and every table has RLS policies. Helper functions (`is_admin()`, `has_permission()`, `my_team_id()`) check that the profile is active.
- **Credentials**: every person has their own Supabase Auth account. There is no shared team password (the PRD's preferred option). Admins can either:
  - send an **activation email** (Supabase invite → `/auth/confirm` → choose a password), or
  - issue a **temporary password**. It is shown **once**, never stored or logged, must be changed at first sign-in, and expires after `TEMP_PASSWORD_TTL_HOURS`.

  Both actions are recorded in `credential_events` and the audit log. Deactivating an account also bans the auth user, so its existing sessions stop refreshing.
- **Roles live in `app_metadata`**, which only the service role can write, and are mirrored to `profiles`. The `role` column can't be updated through the client API, and a guard trigger blocks privilege escalation even if grants are widened by mistake.
- **Rate limits** are stored in Postgres, so they work across serverless instances:
  - registration: 10 per hour per IP
  - sign-in: 10 per 15 minutes per IP + email
  - password reset: 5 per hour
  - support requests: 20 per hour per user

  Supabase Auth applies its own limits on top.
- **Input handling**:
  - zod validation on the server and database check constraints.
  - Search terms are sanitised before they reach PostgREST filters.
  - Uploads are checked by size **and magic bytes** (PNG, JPEG, PDF, plain text only).
  - CSV exports escape cells that could be read as spreadsheet formulas.
  - Redirects after sign-in only go to same-site paths.
- **Headers**: `X-Frame-Options: DENY`, `nosniff`, HSTS, a strict referrer policy, and a `Permissions-Policy` that allows the camera only on this origin (for the scanner).
- **Audit log**: row triggers on teams, participants, attendance, support, profiles, permissions, templates, forms, event settings and announcements. Explicit entries cover sign-ins (including failures, with a hashed email), password changes and resets, PDF generation and failures, and CSV exports. Passwords and QR tokens are never written to it.

---

## Local setup

Prerequisites: Node.js ≥ 20.9, the [Supabase CLI](https://supabase.com/docs/guides/cli), and Docker.

```bash
npm install
supabase start                       # starts Postgres/Auth/Storage locally, applies migrations + seed.sql
cp .env.example .env.local           # then paste the API URL, anon key and service_role key printed by `supabase start`
npm run seed:users                   # creates demo super admin / admin / official / participant logins (prints passwords)
npm run dev                          # http://localhost:3000
```

- Emails sent locally (invites, password resets) show up in Inbucket at http://localhost:54324.
- `supabase db reset` rebuilds the database from the migrations and seed.
- The seed opens the demo form **BuildFest 2026** at `/register/buildfest-2026`. Its window runs from 1 Sep to 10 Nov 2026 in the seed; change it under *Form Builder*.

**Using a hosted Supabase project instead:**

1. Run `supabase link --project-ref <ref>`, then `supabase db push` to apply the migrations.
2. Run `supabase/seed.sql` from the SQL editor, or insert one row into `hackathons` for a clean start.
3. Configure Auth as described in [Deployment](#deployment-vercel--supabase).

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✔ | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✔ | Public anon key (safe in the browser; RLS protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✔ | **Server-only.** Bypasses RLS. Never expose it or prefix it with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_APP_URL` | ✔ in prod | Public base URL. It is encoded in the QR codes on cards and used in email links. |
| `TEMP_PASSWORD_TTL_HOURS` | – | Temporary password lifetime (default 72) |
| `SIGNED_URL_TTL_SECONDS` | – | Signed download URL lifetime (default 300) |
| `AUTO_INVITE_ON_REGISTRATION` | – | `true` emails every new member an activation link (needs SMTP) |
| `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD` | – | Used only by `npm run seed:users` |
| `TEST_DATABASE_URL` | – | Postgres URL for `npm run test:db` (a throwaway server; each run creates and drops its own database) |
| `E2E_*` | – | Playwright settings (see [Testing](#testing)) |

No secrets are committed. `.env*` files are git-ignored, except `.env.example`.

---

## Database: migrations & seed

| File | Contents |
| --- | --- |
| `20260924000001_schema.sql` | Enums, tables, constraints, indexes, sequences |
| `20260924000002_functions.sql` | Authorisation helpers, audit/ID/outdated/support triggers, auth-user sync, and the RPCs `register_team`, `verify_qr`, `check_in`, `undo_check_in`, `publish_id_card_template`, `set_team_leader`, `rotate_qr_token`, `check_rate_limit`, plus the `team_overview` and `participant_overview` views |
| `20260924000003_rls.sql` | RLS on every table, least-privilege grants (column-level where relevant) |
| `20260924000004_storage.sql` | Private buckets `id-cards`, `participant-photos`, `support-attachments`; public `branding` |

Data model: `hackathons` (single row) → `registration_forms` → `registration_submissions`; `teams` → `participants`. Around those sit `profiles`, `official_permissions`, `credential_events`, `id_card_templates`, `id_card_jobs`, `attendance`, `support_requests`, `support_messages`, `support_status_history`, `notifications`, `announcements`, `event_schedule`, `audit_logs` and `rate_limits`.

`supabase/seed.sql` is **development data only**. It creates teams through `register_team()`, so the IDs are generated exactly as they would be in production.

---

## Testing

```bash
npm run lint && npm run typecheck
npm test                     # unit tests (no services needed)
TEST_DATABASE_URL=postgres://postgres@localhost:54322/postgres npm run test:db   # DB integration
npm run test:e2e             # Playwright end-to-end (needs a running app + Supabase)
```

- **Unit tests (54)** cover:
  - name normalisation and PDF filenames
  - ID formatting and QR token parsing
  - registration validation: sizes, leader count, email and phone format, required fields, custom questions
  - support status transitions
  - CSV escaping, temporary password strength, time zones, upload sniffing
  - PDF generation: page count equals member count, portrait size for every card format, embedded fonts, missing-data errors, corrupt photos, long and non-Latin names
- **DB integration tests (42)** apply the real migrations to Postgres and cover:
  - atomic registration and unique, immutable IDs
  - duplicate-name variants, **concurrent same-name submissions**, **idempotent retries (sequential and concurrent)**
  - one team per email, closed forms, the rejected-submission log, PDF-outdated triggers
  - RLS for anonymous users, members, leaders, officials (with and without permissions), admins and super admins; deactivated accounts
  - auth metadata sync (mimicking GoTrue's insert-then-update), audit attribution, no QR tokens in the audit log
  - **concurrent check-ins**, QR states, scan ≠ check-in, undo with reason and permission
  - support visibility, assignment, transitions and notifications, internal notes; rate limiting

  With the Supabase CLI running, the local DB URL is `postgres://postgres:postgres@127.0.0.1:54322/postgres`. The tests create and drop their own database.
- **End-to-end tests (12)** walk through registration, duplicate rejection with preserved input, the team row, expanded members and details, issuing a temporary password, generating and downloading the team PDF (the page count and filename are checked), an official's check-in with duplicates blocked, the leader's forced password change and team isolation, a support request, admin assignment and response, and the team seeing the update. They also run **axe** WCAG A/AA checks and a horizontal-overflow check on desktop and a mobile viewport.

  Before running them:

  ```bash
  npm run seed:users   # note the admin/official passwords
  E2E_BASE_URL=http://localhost:3000 E2E_ADMIN_PASSWORD=... E2E_OFFICIAL_PASSWORD=... npm run test:e2e
  ```

  Sign-in is rate-limited (10 per 15 minutes per IP + email). If you run the suite repeatedly, clear it with `truncate public.rate_limits;` on your **local** database.

Other handy commands:
- `npm run pdf:sample -- cr80 card out.pdf` renders a sample team PDF without a database.
- `/api/id-cards/sample` renders the active template with fake people.

---

## Deployment (Vercel + Supabase)

1. **Supabase project**
   - Apply the migrations with `supabase db push`.
   - Insert the `hackathons` row, or run `seed.sql` on a staging project only.
2. **Auth settings** (Dashboard → Authentication)
   - Site URL = your app URL.
   - Redirect URLs: `https://<app>/auth/confirm` and `https://<app>/auth/callback`.
   - **Disable public sign-ups.** Accounts are created by admins.
   - Minimum password length ≥ 10.
   - Configure **SMTP** so invites and password resets are delivered.
   - Paste `supabase/templates/invite.html` and `recovery.html` into the *Invite user* and *Reset password* templates. They use token-hash links to `/auth/confirm`.
3. **Create the first super admin**
   - Dashboard → Authentication → Add user.
   - Then run in the SQL editor:
     ```sql
     update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"super_admin"}' where email = 'you@org.edu';
     ```
     A trigger syncs the new role to `profiles`.
4. **Vercel**
   - Import the repo and set the environment variables above. `NEXT_PUBLIC_APP_URL` must be the production URL **before you print cards**, because it is encoded in every QR code.
   - The PDF routes run on the Node.js runtime (`maxDuration` 60 s). Fonts are bundled via `outputFileTracingIncludes`.
5. **Smoke test**: `GET /api/health`, sign in, generate one team PDF and scan it with the attendance scanner.

---

## Event-day operations

- **Before the event**
  1. Publish the final template.
  2. Use *ID Card Generation → Generate pending PDFs*.
  3. Download each team's PDF and print it at **100 % scale** (no "fit to page").
  4. Fix any Outdated or Failed teams first.
- **Officials**: open *Attendance* on a phone. HTTPS is needed for camera access. Tap *Start camera*, scan, check the name and team shown, then **Confirm check-in**. Scanning alone records nothing. If the camera isn't available, use manual search or a handheld scanner in the code field.
- **Lost or compromised card**: on the team page, use *Revoke QR* (scans then show "revoked"), or *Issue new QR*, then regenerate and reprint that team's PDF.
- **Mistaken check-in**: someone with the *correct attendance* permission uses *Undo* and must give a reason. The original record is kept with its correction history.
- **Exports**: *Reports* has CSVs for teams, participants, attendance, team attendance, support, submissions and the audit log.

---

## Known limitations & future work

- **One team per participant per event** is always enforced. The PRD's "unless explicitly allowed" toggle is not implemented.
- **Notifications are in-app only.** Emails go out only for invites and password resets via Supabase SMTP. Push and SMS are not implemented, and neither is Supabase Realtime: pages refresh on navigation or after actions.
- **Google Sheets sync is not implemented** (the PRD lists it as optional). CSV exports are provided instead.
- **Photos** are uploaded by staff on the team page. The public form doesn't collect them.
- **PDFs are generated synchronously per team.** That's fine for the 20-member team cap. Bulk generation runs team by team from the browser; a queue or background worker would be the next step for very large events.
- **Print-sheet layout** (several cards per A4 sheet) is left as the PRD's optional enhancement. Pages are one card each, either card-sized or on A4 with crop marks.
- **Font coverage**: the embedded Inter font covers Latin, Greek and Cyrillic. Characters outside it are replaced with `?` on cards; the web UI is unaffected. Add a Noto font to `assets/fonts` if you need other scripts.
- The rate limiter **fails open** if its database call errors, so a database hiccup doesn't lock everyone out. Supabase Auth's own limits still apply.
