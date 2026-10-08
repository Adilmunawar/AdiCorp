# AdiCorp HR

AdiCorp HR is a multi-tenant HR platform (HRMS SaaS). It has a staff workspace for owners, HR and Finance, a self-service portal for employees, and a public careers site for each company.

It is built with Vite, React 18, TypeScript, shadcn/ui, Tailwind CSS and TanStack Query, on Supabase (Postgres 15 with row-level security, Auth, Storage, Realtime and Edge Functions). Every business rule and permission check runs in the database, so the browser cannot get around them.

---

## Modules

| Module | Staff area | Employee portal |
| --- | --- | --- |
| **Platform** (`src/modules/platform`) | Dashboards for each role, reports, the activity timeline, users and access (owner), company and workspace settings, my account, two-step verification | – |
| **People** (`people`) | Employee directory and profiles, add, edit and import, departments, document tracking with expiry dates, profile update requests, onboarding and offboarding checklists, assets and hand-overs | My documents, My equipment |
| **Policies & letters** (`policies`) | Versioned policies with e-signature, signer tracking and reminders; HR letters with reference numbers, reply-by dates and PDF output | Sign policies (signing gate), Letters from HR |
| **Time** (`time`) | Daily summary, monthly register, live time-clock feed and devices, hours report, correction requests, calendar (holidays, off days, extra working days, Saturday rules), month lock | My attendance, My hours, correction requests |
| **Leave & overtime** (`leave`) | Leave requests, calendar, balances and leave types; overtime hours (HR side, hours only) | Leave, Overtime claims |
| **Payroll** (`payroll`) | Payroll sheet (prepare, finalise, pay), payslip editor, salaries with history, tax slabs and pay structure, overtime pricing, HR-to-Finance pay updates, pay reports | My pay, My payslips |
| **Courses & expenses** (`expenses`) | HR approval of employee requests; Finance payments, receipts, subscriptions and renewals | Courses & expenses |
| **Engagement** (`engagement`) | Announcements (company-wide or for one department), polls, complaints (with an anonymous option), one message thread per employee, celebrations, notifications inbox, web push | Messages, Announcements, Polls, Complaints, Celebrations, push devices |
| **Careers** (`careers`) | Job postings, applicant board and table, ratings, notes, hiring an applicant as an employee | Open roles; public `/careers/:slug` site and application form |
| **Portal** (`portal`) | – | Home dashboard, notifications, my profile (change requests), account and sessions |

## Roles

| Role | Who | Access |
| --- | --- | --- |
| `owner` | The person who created the company | Everything, including users and access, the two-step verification policy, full backups and unlocking months |
| `hr` | People team | People, time, leave, approvals, engagement, policies, letters, assets and careers. **Never sees money:** no salaries, payslips, overtime amounts, or expense payments and receipts |
| `finance` | Finance team | Payroll, salaries, tax and pay rules, overtime pricing, expense and course payments, and finance reports. Read-only view of the employees it needs for pay |
| Employee | Every employee | The employee portal only. Signs in with CNIC and password, using a token session |

The sidebar, routes and search palette are filtered by role (`src/modules/registry.ts`). The database applies the same rules: HR gets an error or empty results from any money table or RPC, whatever the browser sends.

## Architecture

```
src/
  App.tsx                 router: public routes, staff shell (role-guarded), portal shell
  modules/
    types.ts              ModuleManifest contract (routes, nav, portal routes/nav, search, commands)
    registry.ts           registers every module; builds the sidebar, home page and palette per role
    <module>/manifest.tsx  lazy-loaded pages, nav items with live badges, portal pages
  components/
    kit/                  shared UI: PageHeader, StatTile, SectionCard, DataTable, FilterBar, StatusBadge,
                          EmptyState, ConfirmButton, RowActions, MonthPicker, Money, CSV and PDF export
    shell/                staff shell: sidebar, top bar, Ctrl+K palette, notifications, error boundary
    portal-shell/         employee portal shell (sidebar on laptops, tab bar on phones)
  context/                AuthContext (staff session, profile, company, role), EmployeeAuthContext (portal token)
  lib/portal.ts           portalRpc / portalUpload / portalSignedUrl helpers for token-based portal calls
supabase/
  migrations/             schema, RLS and RPCs (timestamped, idempotent)
  functions/              Edge Functions: admin-users, portal-files, careers-apply, push-send
public/sw.js              service worker for web push (staff app and portal)
```

- **Modules are self-contained.** Each module owns its folder, its migration files, its query keys (`[moduleId, companyId, …]`) and its manifest. The shell and the registry only need the manifest.
- **Data access** goes through SECURITY DEFINER RPCs that check the caller's role and company, return explicit column lists, write an activity entry and send the right notifications. Tables can be read directly only where RLS allows.
- **Shared working-day rule.** `public.working_dates(company, from, to, employee)` is the one definition of a working day. Attendance, leave, payroll and reports all use it, and the Settings page writes to it.
- **UX conventions.** Loading skeletons, empty states, sonner toasts and confirm dialogs for destructive actions. Every screen fits a 375px phone without horizontal scrolling, and tables scroll inside their card. The sidebar shrinks its rows to fit laptop screens, and switches to accordion groups when the screen is too short.

## Security model

- **Tenancy.** Every business table has a `company_id` that cascades when the company is deleted, has RLS enabled, and allows exactly one SELECT policy, using `(select public.auth_company_id())`. Foreign keys and the main filter columns are indexed.
- **Role helpers.** `auth_company_id()`, `auth_role()`, `auth_is_owner()`, `auth_is_hr()`, `auth_is_finance()` and `auth_is_staff()`. All are SECURITY DEFINER and STABLE, with `search_path = ''`.
- **Functions.** Every SECURITY DEFINER function sets `search_path = ''` and schema-qualifies everything. EXECUTE is revoked from `PUBLIC` and `anon` and granted only to the roles that need it. Internal `_helpers` are revoked from every client role.
- **Money isolation.** Pay lives in `salary_history`, `payslips`, `payroll_settings` and `expense_payments`, and only Finance and the owner can read them. Activity entries named `payroll.*` are hidden from HR.
- **Employee portal.**
  - Passwords are bcrypt hashes and login attempts are throttled.
  - Sessions are random tokens. Only their SHA-256 hash is stored (`employee_sessions`), and they expire and can be revoked.
  - Every `portal_*` RPC takes the token as its first argument and works out the employee and company from the token alone. It never trusts an id sent by the client.
- **Files.** Storage buckets are private except avatars. Every path starts with `<company_id>/`. Staff open files through signed URLs that last 5 minutes; employees go through the `portal-files` Edge Function.
- **Staff accounts.** Only the owner can manage staff accounts, through the `admin-users` Edge Function, which checks the caller's JWT and role on the server. Users can update only their own name and avatar (enforced by column grants). The owner can require two-step verification (TOTP) for all staff, and the database checks it as well.
- **HTTP headers.** `vercel.json` ships a strict Content Security Policy, HSTS, frame denial and other hardening headers.

## Running locally

Requirements: Node 20+ and npm.

```sh
npm install
cp .env.example .env    # or create .env with the three variables below
npm run dev
```

| Variable | Meaning |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key. It is public by design; RLS protects the data |
| `VITE_SUPABASE_PROJECT_ID` | Project ref |
| `VITE_APP_URL` / `VITE_PUBLIC_APP_URL` | Optional. Public origin used in auth redirects and careers links |

Quality gates (run before every deploy):

```sh
npx tsc --noEmit -p tsconfig.app.json   # types
npx eslint src                          # lint (0 errors)
npx vite build                          # production bundle
```

## Database and deployment

1. **Migrations.** Apply every file in `supabase/migrations/` in timestamp order, either with `supabase db push` or one at a time through the Supabase SQL editor or MCP. The `20261007…` series must be applied in this order:
   - `100000`–`100600` foundation: roles, helpers, departments, salary history, notifications, portal auth, RLS rebuild, storage, constraints
   - `110000`–`110400` people
   - `120000`–`120100` policies and letters
   - `130000`–`130300` time
   - `140000`–`140400` leave and overtime
   - `150000`–`150400` payroll
   - `160000` portal
   - `170000`–`170200` expenses
   - `180000`–`180300` engagement and web push (turns on `pg_net` and `pg_cron` when they are available)
   - `190000`–`190200` careers
   - `200000`–`200300` platform

   All files are idempotent and keep existing rows valid. After applying them, run the Supabase security advisor and regenerate the types (`supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts`).
2. **Edge Functions.** Deploy all four:
   ```sh
   supabase functions deploy admin-users portal-files careers-apply push-send
   ```
   `push-send` verifies its own shared secret, which is generated inside the database and never stored in a file.
3. **Frontend.** Deploy to Vercel (or any static host that rewrites every path to `index.html`). Build command `npm run build`, output `dist`. Set the environment variables listed above.

`supabase/manual/` holds one-off maintenance scripts. They are never run automatically.
