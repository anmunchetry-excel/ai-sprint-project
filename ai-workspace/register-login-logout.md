Date created: September 1, 2026
Date last modified: September 2, 2026

# User Registration, Login, and Logout - Technical PRD

## Overview/Problem

This application lets multiple teachers collaborate on a shared test bank of multiple-choice
questions. Today there is no concept of a "user" anywhere in the system — no way to tell one
teacher's work apart from another's, and no way to control who can access the app at all. Every
other feature (starting with the MCQ test bank itself) depends on knowing who is making a
request, so a user identity foundation has to exist before anything collaborative can be built.

---

## Hypothesis

We believe that introducing a `users` table plus register, login, and logout endpoints backed by
a dedicated user service will give every future feature (starting with the MCQ test bank) a
reliable way to identify a teacher, without yet taking on the cost of session management or a
frontend.

---

## Scope

### In Scope

- A `users` database table, added via a D1 migration, storing: id, email, username, first name,
  last name, and a hashed password. Both `email` and `username` are unique.
- Password hashing before any password value reaches the database. Plaintext passwords are never
  stored, logged, or returned by any part of the system.
- A user service (`src/lib/services/user-service.ts`) that centralizes all reads and writes to the
  `users` table and provides create, read (by id, email, or username), update, delete, and list
  operations, plus credential verification.
- `POST /api/auth/register` — creates a new user via the user service.
- `POST /api/auth/login` — verifies credentials via the user service.
- `POST /api/auth/logout` — a stateless success response (see Assumptions below).
- One minimal placeholder page at `/dashboard` that reserves the spot where the MCQ test bank
  will live. No MCQ logic, no auth gating — just a heading and a short "coming soon" message.
- A Vitest test suite covering every phase below, written test-first (red) and made to pass
  (green) as each phase is implemented — see Testing Strategy.

### Out of Scope

Not being built now, but expected to be picked up in a later phase:

- Register / login / logout **UI** — forms, client-side validation, error display. This phase is
  backend-only aside from the one placeholder page above.
- Session or token management of any kind — cookies, JWTs, refresh tokens, or any other mechanism
  for remembering that a user is logged in between requests.
- Password reset / "forgot password" flow.
- Email verification.
- Role-based permissions (e.g., distinguishing an admin from a regular teacher).
- Rate limiting or brute-force protection on login attempts.
- All MCQ / test-bank functionality (authoring questions, banks, sharing, collaboration) — this
  is the very next build after this one.
- Automated UI/component tests (e.g., React Testing Library) for the Phase 5 placeholder page —
  it has no logic yet, so manual verification is enough for now.

### Cut

Nothing was cut during planning. Scope was defined narrowly from the outset by explicit product
direction: build the user data model and the three auth endpoints, and defer sessions, UI, and
MCQ features to later phases rather than trimming them down mid-planning. Social login was
likewise never in scope for this phase, so it's listed above as deferred, not cut.

### Assumptions & Interpretation Notes

A few points in the original request were ambiguous and required a judgment call. Flagging them
here so they're easy to correct:

- **"Users are listed/updated/deleted"** is interpreted as a capability of the **service layer**,
  not additional HTTP endpoints. `listUsers`, `updateUser`, and `deleteUser` exist on
  `user-service.ts` for future use (e.g., an admin phase) but only register, login, and logout are
  wired to a route in this phase.
- **Logout has nothing to invalidate yet.** Since this phase explicitly excludes sessions/tokens,
  `POST /api/auth/logout` is a stateless endpoint that returns success immediately. This gives the
  future frontend a stable route to call now; real invalidation logic gets added when session
  management ships.
- **Route Handlers, not Server Actions.** This project's default convention
  (`.cursor/rules/nextjs.mdc`) prefers Server Actions for form submissions and reserves Route
  Handlers for cases needing "an HTTP endpoint for an external consumer." There is no form yet in
  this phase — the frontend is deferred — and these endpoints need to be independently callable
  (curl/Postman, and eventually the frontend phase), so they're built as Route Handlers under
  `src/app/api/auth/`.
- **Column is named `password_hash`, not `password`**, to make it unambiguous at the schema level
  that plaintext is never stored there.
- **`username` is a new unique identity field, added alongside `email`**, per a later instruction.
  It is not (yet) used as a login identifier — login below still uses email + password, since
  that wasn't asked to change. Wiring username into login as an alternative identifier would be a
  small, separate follow-up if wanted.
- **"Task-driven development"** is read as **test-driven development (TDD)** — the rest of the
  request describes the classic red/green cycle explicitly (tests fail first, then pass as the
  feature is built), so that's clearly the intent despite the phrasing.

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Notes:

- `email` and `username` both carry a `UNIQUE` constraint — this is the real source of truth for
  "no duplicate accounts," not an application-level check. The application must normalize both to
  lowercase before every insert and query, since SQLite's default comparison is case-sensitive.
- `username` follows the same case-insensitive handling as `email`: normalized to lowercase before
  storage and lookup. Format validation (length, allowed characters) happens in the Zod schema.
- `password_hash` stores a self-describing encoded string (see Password Hashing below), never a
  raw password.
- `updated_at` has no trigger. The service layer is responsible for setting it explicitly on every
  update.
- All access to this table must go through `user-service.ts`. Nothing else should call `env.DB`
  for user data.

### Password Hashing

Passwords are hashed with **PBKDF2 via the Workers-native Web Crypto API** (`crypto.subtle`) —
SHA-256, a random 16-byte salt per user, 100,000 iterations. This was chosen over `bcryptjs` and
Argon2id-via-WASM because it needs zero new dependencies and is guaranteed to run within Cloudflare
Workers' CPU-time limits. The trade-off: Cloudflare currently caps PBKDF2 at 100,000 iterations in
production, below the 600,000 OWASP recommends for PBKDF2-SHA-256 today. The iteration count is
embedded in the stored value so it can be raised later without invalidating existing rows:

```
pbkdf2$<iterations>$<saltHex>$<hashHex>
```

### API Endpoints

#### POST /api/auth/register

**Request Body:**
```json
{
  "email": "teacher@example.com",
  "username": "adalovelace",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "password": "at-least-8-characters"
}
```

**Response:**
- Success (201):
  ```json
  { "user": { "id": "...", "email": "teacher@example.com", "username": "adalovelace", "firstName": "Ada", "lastName": "Lovelace", "createdAt": "..." } }
  ```
- Error (400): validation failure (bad email format, invalid username format, password under 8
  characters, missing name)
- Error (409): email or username already registered — response includes which field conflicted,
  e.g. `{ "error": { "message": "Email already registered", "field": "email" } }`
- Error (500): unexpected server/database error

#### POST /api/auth/login

**Request Body:**
```json
{
  "email": "teacher@example.com",
  "password": "at-least-8-characters"
}
```

**Response:**
- Success (200):
  ```json
  { "user": { "id": "...", "email": "teacher@example.com", "username": "adalovelace", "firstName": "Ada", "lastName": "Lovelace" } }
  ```
- Error (400): validation failure (missing email or password)
- Error (401): invalid email or password — intentionally generic, does not reveal which field was
  wrong or whether the email exists, to avoid user enumeration
- Error (500): unexpected server/database error

Note: login is by **email** only in this phase. `username` is stored and returned but not yet
accepted as an alternative login identifier — see Assumptions above.

#### POST /api/auth/logout

**Request Body:** none

**Response:**
- Success (200): `{ "success": true }`
- This is a stateless no-op in this phase — see Assumptions above. There is no failure case yet
  because there is no session state to fail to clear.

### User Interface Requirements

#### Placeholder Dashboard Page (`/dashboard`)

- Server component, no client interactivity, no data fetching.
- Displays a heading and one line of copy indicating the MCQ test bank is coming soon.
- No authentication gating — there is no session mechanism yet to gate with.
- No links to or from this page are required yet; it exists solely to reserve the route.

---

## Testing Strategy (Test-Driven Development)

**Workflow**: every phase below follows red → green. Before writing any implementation code for a
phase, write its tests first and run them to confirm they fail — and confirm they fail for the
right reason (missing code), not a typo in the test itself. Only implement once the failing tests
exist. A phase is not done until both its tests pass **and** its Acceptance Criteria are checked.

**Framework**: [Vitest](https://vitest.dev), per explicit instruction. Test files are colocated
with the code they test as `*.test.ts` (e.g. `src/lib/password.ts` → `src/lib/password.test.ts`) —
Vitest's default discovery pattern, so no extra config is needed to find them.

**Two tiers of tests**:

1. **Plain unit tests** — pure logic with no Cloudflare bindings: `src/lib/password.ts` and
   `src/lib/schemas/auth.ts`. These run under Vitest's default Node environment with no special
   setup.
2. **Workers-runtime tests** — anything touching D1 (the `users` table schema, `user-service.ts`,
   the route handlers). These run through Cloudflare's official Workers Vitest integration —
   `@cloudflare/vitest-plugin` (the current package name; older docs and examples call it
   `@cloudflare/vitest-pool-workers`) — which executes tests inside the real Workers runtime
   (workerd) against a local D1 instance with this project's actual migrations applied via
   `readD1Migrations()` / `applyD1Migrations()`. This exercises the real schema, including the
   `UNIQUE` constraints, instead of a hand-rolled mock that could quietly drift from reality.

**Design change this requires**: `user-service.ts` functions must accept the D1 binding as a
parameter (e.g. `createUser(db: D1Database, input)`) rather than calling `getCloudflareContext()`
internally. Only the route handlers call `getCloudflareContext()` — once each — and pass `env.DB`
down into the service. This is what makes the service trivially testable: a test can hand it the
real local D1 instance from the Workers pool, or a fake, without needing any request context. See
the updated code samples under Technical Implementation Details.

**New dev dependencies**: `vitest`, `@cloudflare/vitest-plugin`. Two separate Vitest config files
now exist because the two tiers need different Vite plugins (`test.projects` was considered and
rejected as unnecessary complexity — see Phase 1 notes): `vitest.config.mts` (plain, Node
environment) and `vitest.workers.config.mts` (Workers pool). `package.json` scripts:
`"test"` (runs both tiers in sequence), `"test:unit"` / `"test:watch"` (plain tier), and
`"test:workers"` / `"test:workers:watch"` (Workers-pool tier).

**Known risk — confirmed and resolved in Phase 1**: pointing `cloudflareTest()`'s
`wrangler.configPath` at this project's real `wrangler.jsonc` does fail, exactly as anticipated —
it tries to auto-load `main` (`.open-next/worker.js`), which only exists after an OpenNext build
and isn't present under plain `npm run test`. The newer `main: false` option (documented on
Cloudflare's site) that's meant to suppress this isn't in the installed `1.1.3` release yet (its
`WorkersPoolOptionsSchema` only accepts `main: z.string().optional()` — confirmed by reading the
installed package's source). **Resolution**: don't set `wrangler.configPath` at all for tests that
only need bindings, not the real worker. Declare the D1 binding directly via `miniflare.d1Databases`
in `vitest.workers.config.mts` instead (see Phase 1). This sidesteps `main` entirely and is
expected to be the right pattern for Phase 3 (user service) and Phase 4 (endpoints) too, since
those also test exported functions directly rather than the deployed worker's `fetch` handler.

---

## Implementation Phases

### Phase 0: Testing Infrastructure Setup - COMPLETED

**Objective**: Stand up Vitest so every phase below can follow red-green TDD.

**Tasks**:
1. Add `vitest` as a dev dependency
2. Add `vitest.config.mts` using Vitest's default Node environment
3. Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json` scripts
4. Write one throwaway smoke test (e.g. `expect(1 + 1).toBe(2)`) to confirm the runner works, then
   delete it

**Deliverables**:
- `vitest.config.mts`
- Updated `package.json` scripts
- No leftover smoke test

**What was actually built**: exactly the above, plus one adjustment — the config file is
`vitest.config.mts`, not `.ts`. It also pre-configures the `@/` → `./src` path alias (mirroring
`tsconfig.json`) since later phases' tests will need it and it costs nothing to add now. `npm run
lint` and `npm run build` were both re-verified after these changes and still pass. `npm run test`
currently exits 1 with "No test files found" — expected and correct until Phase 1/2 add real
tests; not a failure.

### Phase 1: Database Setup - COMPLETED

**Objective**: Provision Cloudflare D1 and create the `users` table.

**Tests (write first)**:
- A schema test (via the Workers pool — see Testing Strategy) that, once migrations are applied,
  asserts:
  - the `users` table exists with the expected columns
  - inserting a valid row succeeds and `id`/`created_at`/`updated_at` are populated
  - inserting a second row with a duplicate `email` is rejected
  - inserting a second row with a duplicate `username` is rejected
- This test is red from the start for infrastructure reasons (no binding, no migration yet) and
  should stay red until every task below is done — both kinds of failure are valid "red."

**Tasks** (make the tests above pass):
1. Create the database: `npx wrangler d1 create ai-sprint-project-db`
2. Add the returned `d1_databases` block to `wrangler.jsonc` with binding name `DB`
3. Run `npm run cf-typegen` to regenerate `cloudflare-env.d.ts`
4. Add `@cloudflare/vitest-plugin` as a dev dependency and extend `vitest.config.mts` with the
   Workers pool, pointed at `wrangler.jsonc`
5. Add a test setup file (`test/apply-migrations.ts`) that reads `migrations/` via
   `readD1Migrations()` and applies it via `applyD1Migrations()` before tests run
6. Create the migration: `npx wrangler d1 migrations create DB create_users_table`
7. Write the `CREATE TABLE users (...)` statement (above) into the generated migration file
8. Apply it locally only: `npx wrangler d1 migrations apply DB --local`

**Deliverables**:
- `wrangler.jsonc` updated with the `DB` binding
- `migrations/0001_create_users_table.sql`
- Regenerated `cloudflare-env.d.ts` (generated file — do not hand-edit)
- `vitest.config.mts` extended with the Workers pool; `test/apply-migrations.ts`

**What was actually built**: the database, binding, `cf-typegen`, and migration (tasks 1–3, 6–8)
went exactly to plan. Tasks 4–5 changed shape:

- Before writing any of this, a project skill (`.cursor/skills/testing/SKILL.md`) surfaced that
  explicitly says to check with the user before introducing `@cloudflare/vitest-plugin`, since it
  changes how the whole suite runs (its default recommendation is mocking `env.DB` instead). This
  was raised; the user explicitly chose to proceed with the real Workers runtime anyway.
- `vitest.config.mts` was **not** extended with the Workers pool — a **separate** file,
  `vitest.workers.config.mts`, was created instead, because `cloudflareTest()` is a Vite plugin and
  the plain-Node tier (Phase 2's future `password.test.ts`) has no reason to pay for a workerd
  runtime. `package.json`'s `"test"` script now runs both tiers in sequence: `"test:unit"` (plain,
  now scoped to `src/**/*.test.ts` with `passWithNoTests: true` so it doesn't fail before Phase 2
  exists) then `"test:workers"` (the new config, scoped to `test/**/*.test.ts`).
- `wrangler.configPath` was **not** used, contrary to the original plan — see the "Known risk"
  update in Testing Strategy above for why (it tries to load `.open-next/worker.js` as `main`,
  which doesn't exist under plain `npm run test`). The Workers-pool config instead declares the D1
  binding directly: `miniflare: { d1Databases: { DB: "ai-sprint-project-test-db" }, compatibilityDate: "2026-07-01", compatibilityFlags: ["nodejs_compat"] }`.
  This gives each test run its own fresh, isolated D1 (migrations applied by
  `test/apply-migrations.ts` on every run), fully independent of the "real" local dev D1 that
  `npm run dev` / `npm run preview` use.
- `env` from `cloudflare:test` is typed as `Cloudflare.Env` — the same global interface
  `cloudflare-env.d.ts` (generated by `cf-typegen`) declares — so `env.DB` is correctly typed as
  `D1Database` for free. The one addition needed was a test-only binding, `TEST_MIGRATIONS`
  (carries the migrations array from config into the setup file), which doesn't exist in the real
  app. That's declared via module augmentation in `test/env.d.ts` rather than by hand-editing the
  generated `cloudflare-env.d.ts`.
- Test files (`test/**/*.test.ts`) import the ambient `cloudflare:test` module, which `next
  build`'s typecheck can't resolve — it type-checks every `.ts` file matched by `tsconfig.json`,
  including tests, and failed with `Cannot find module 'cloudflare:test'` the first time this was
  tried. Fixed by excluding `test/` and `**/*.test.ts` from the root `tsconfig.json` and adding a
  sibling `tsconfig.vitest.json` (extends the root config, adds `@cloudflare/vitest-plugin/types`)
  purely for editor support of test files. See Troubleshooting Guide for the full chain of errors
  hit while wiring this up.
- `npm run lint`, `npm run build`, and `npm run test` (both tiers) were all re-verified green after
  every change described above, not just at the end.

### Phase 2: Password Hashing Utility - COMPLETED

**Objective**: A small, dependency-free module for hashing and verifying passwords.

**Tests (write first)**, in `src/lib/password.test.ts` (plain unit tests, no bindings needed):
- `hashPassword` returns a string in the `pbkdf2$iterations$salt$hash` format
- `verifyPassword` resolves `true` for the correct password against its own hash
- `verifyPassword` resolves `false` for an incorrect password
- Two hashes of the same password differ (random salt per call)
- `verifyPassword` resolves `false` for a malformed/unrecognized stored value, rather than throwing

**Tasks** (make the tests above pass):
1. Create `src/lib/password.ts` exporting `hashPassword(plainPassword)` and
   `verifyPassword(plainPassword, storedHash)`
2. Implement using `crypto.subtle` PBKDF2 (SHA-256, 100,000 iterations, random 16-byte salt)
3. Encode/decode the `pbkdf2$<iterations>$<saltHex>$<hashHex>` format described above
4. Use a constant-time comparison when checking the derived hash against the stored one

**Deliverables**:
- `src/lib/password.ts`
- `src/lib/password.test.ts`, all green

**What was actually built**: exactly the above. Tests were written first and confirmed red
(`Cannot find module './password'`), then `src/lib/password.ts` was added. One test bug surfaced
during green: the format regex used unescaped `$` (regex end-anchor) instead of `\$` (literal
delimiter) — fixed in the test, not the implementation. One build-time TypeScript error also
surfaced: `next build`'s stricter check rejected passing a `Uint8Array` directly as the PBKDF2
`salt` in `deriveBits()` (`Uint8Array<ArrayBufferLike>` vs `BufferSource`); fixed by wrapping with
`new Uint8Array(salt)` at the call site. Constant-time comparison is a hand-rolled XOR loop (no
`node:crypto` import), so the module stays dependency-free and works the same in Node unit tests
and the Workers runtime. `npm run test` (5 unit + 4 workers), `npm run lint`, and `npm run build`
all pass.

### Phase 3: User Service - COMPLETED

**Objective**: One module that owns all reads and writes to the `users` table.

**Tests (write first)**, in `src/lib/services/user-service.test.ts` (Workers pool, real local D1
from Phase 1, migrations already applied):
- `createUser` stores a hashed password — the raw password never appears in the stored row
- `createUser` rejects a duplicate `email` with a typed, identifiable error
- `createUser` rejects a duplicate `username` with a typed, identifiable error
- `getUserByEmail` and `getUserByUsername` find the row `createUser` just made, case-insensitively
- `verifyCredentials` returns the user for correct credentials
- `verifyCredentials` returns `null` for a wrong password, and for an unknown email
- No method that returns a "public" user shape includes `password_hash`

**Tasks** (make the tests above pass):
1. Create `src/lib/services/user-service.ts`
2. Implement `createUser`, `getUserById`, `getUserByEmail`, `getUserByUsername`, `updateUser`,
   `deleteUser`, `listUsers`, and `verifyCredentials` — each taking `db: D1Database` as its first
   parameter (see Testing Strategy) rather than calling `getCloudflareContext()` itself
3. Normalize email and username to lowercase on every read and write
4. Ensure every method that returns a "public" user shape omits `password_hash`
5. Translate the D1 `UNIQUE constraint failed` error into a typed error the register endpoint can
   map to 409, identifying whether `email` or `username` caused the conflict

**Deliverables**:
- `src/lib/services/user-service.ts`
- `src/lib/services/user-service.test.ts`, all green

**What was actually built**: exactly the above. Tests were written first and confirmed red
(`Cannot find module './user-service'`), then `user-service.ts` was added. Two test-harness
adjustments were needed beyond the original plan:

- **Workers config scope**: `vitest.workers.config.mts` was extended to include
  `src/lib/services/**/*.test.ts` (with the `@/` alias added to that config), and
  `vitest.config.mts` was updated to *exclude* that same glob from the plain unit tier — otherwise
  `npm run test:unit` tried to run D1 tests under Node and failed on `cloudflare:test`.
- **Test isolation**: an initial `afterEach(() => reset())` approach wiped the D1 schema after the
  first test (`no such table: users`). Replaced with per-test unique `email`/`username` values via
  a `createTestInput()` helper — simpler than re-applying migrations after every `reset()`.

`UserAlreadyExistsError` (with a `field: "email" | "username"` property) is thrown when D1 reports a
`UNIQUE` constraint failure; the message is parsed to identify which column conflicted. All eight
service methods from the task list are implemented. `npm run test` (5 unit + 11 workers), `npm run
lint`, and `npm run build` all pass.

### Phase 4: Auth Endpoints - PLANNED

**Objective**: Expose register, login, and logout over HTTP.

**Tests (write first)**, in `src/app/api/auth/*/route.test.ts` (Workers pool; call the exported
`POST` functions directly with constructed `Request` objects):
- register: 201 + public user on valid input; 400 on invalid email, invalid username format, or a
  password under 8 characters; 409 on a duplicate email; 409 on a duplicate username
- login: 200 + public user on correct credentials; 401 on a wrong password; 401 on an unknown
  email; 400 on missing fields
- logout: 200 + `{ "success": true }` on any call

**Tasks** (make the tests above pass):
1. Create `src/lib/schemas/auth.ts` with Zod schemas `registerSchema` and `loginSchema`
2. Create `src/app/api/auth/register/route.ts`
3. Create `src/app/api/auth/login/route.ts`
4. Create `src/app/api/auth/logout/route.ts`

**Deliverables**:
- Three route handlers, each validating input with Zod before calling the user service
- Matching `route.test.ts` files, all green

### Phase 5: MCQ Placeholder Page - PLANNED

**Objective**: Reserve the landing spot for the next build.

**Tests**: none automated. The page has no logic — a heading and a line of static copy — so an
automated test would only add a dependency (e.g. React Testing Library) for very little value.
Verified manually via the Acceptance Criteria below instead. Revisit if this page grows logic.

**Tasks**:
1. Create `src/app/dashboard/page.tsx` with a heading and "coming soon" copy

**Deliverables**:
- `src/app/dashboard/page.tsx`

---

## Technical Implementation Details

**Note**: Phases 0–3 are implemented (testing infrastructure, D1/`users` table, password hashing,
and user service). Phases 4–5 below are still the planned approach and should be updated to reflect
what was actually built as each phase completes.

### Key Files

- `vitest.config.mts` - plain-Node Vitest config (unit tier); scoped to `src/**/*.test.ts`,
  excluding `src/lib/services/**/*.test.ts` (D1 tests run in the workers tier instead)
- `vitest.workers.config.mts` - Workers-pool Vitest config (D1 tier); scoped to `test/**/*.test.ts`
  and `src/lib/services/**/*.test.ts`; declares the `DB` binding directly via
  `miniflare.d1Databases` rather than reading `wrangler.jsonc`
- `test/apply-migrations.ts` - test setup file that applies `migrations/` to the test D1 before
  tests run, via `readD1Migrations()` / `applyD1Migrations()`
- `test/env.d.ts` - **(built in Phase 1)** module augmentation adding the test-only
  `TEST_MIGRATIONS` binding to `Cloudflare.Env`, scoped to the test tsconfig only
- `tsconfig.vitest.json` - **(built in Phase 1)** separate tsconfig for editor support of test
  files (adds `@cloudflare/vitest-plugin/types`); keeps `cloudflare:test` imports out of the main
  app's `tsconfig.json` so `next build` never tries to type-check them
- `wrangler.jsonc` - has the `d1_databases` binding named `DB` (done in Phase 1)
- `migrations/0001_create_users_table.sql` - creates the `users` table (done in Phase 1)
- `test/users-table.test.ts` - Phase 1's schema tests (4 tests, all green)
- `src/lib/password.ts` / `src/lib/password.test.ts` - PBKDF2 hashing/verification via Web Crypto,
  no dependencies (done in Phase 2; 5 unit tests, all green)
- `src/lib/services/user-service.ts` / `user-service.test.ts` - the only module allowed to query
  `users`; CRUD + credential verification, takes `db: D1Database` as a parameter (done in Phase 3;
  7 workers tests, all green)
- `src/lib/schemas/auth.ts` - Zod request schemas shared by the route handlers
- `src/app/api/auth/register/route.ts` (+ `route.test.ts`) - POST handler for registration
- `src/app/api/auth/login/route.ts` (+ `route.test.ts`) - POST handler for login
- `src/app/api/auth/logout/route.ts` (+ `route.test.ts`) - POST handler, stateless
- `src/app/dashboard/page.tsx` - placeholder landing page for the MCQ test bank

### Implementation Patterns

Request validation (`src/lib/schemas/auth.ts`):

```typescript
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z0-9_-]+$/),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
```

Password hashing (`src/lib/password.ts`):

```typescript
const ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iterations, saltHex, hashHex] = stored.split("$");
  if (algo !== "pbkdf2") return false;
  const derived = await derive(password, fromHex(saltHex), Number(iterations));
  return timingSafeEqual(derived, fromHex(hashHex));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}
```

A matching test, written before the implementation above existed (`src/lib/password.test.ts`):

```typescript
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the correct password against its own hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
```

D1 access (`src/lib/services/user-service.ts`), following `.cursor/rules/d1.mdc` — takes `db` as a
parameter instead of fetching it, so tests can supply their own:

```typescript
export async function getUserByEmail(db: D1Database, email: string) {
  const result = await db
    .prepare("SELECT * FROM users WHERE email = ?1")
    .bind(email.toLowerCase())
    .all();
  return result.results[0] ?? null;
}
```

Route handler (`src/app/api/auth/register/route.ts`) — the only place that calls
`getCloudflareContext()`:

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { registerSchema } from "@/lib/schemas/auth";
import { createUser, EmailAlreadyExistsError } from "@/lib/services/user-service";

export async function POST(req: Request) {
  const parsed = registerSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: { message: "Invalid input", issues: parsed.error.issues } }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });

  try {
    const user = await createUser(env.DB, parsed.data);
    return Response.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof EmailAlreadyExistsError) {
      return Response.json(
        { error: { message: `${err.field} already registered`, field: err.field } },
        { status: 409 }
      );
    }
    return Response.json({ error: { message: "Something went wrong" } }, { status: 500 });
  }
}
```

### Important Notes

- Never log a password or a `password_hash` value, even at debug level.
- Every `users` query must use numbered placeholders (`?1`, `?2`, ...) and read
  `result.results[0]` rather than `.first()`, per `.cursor/rules/d1.mdc`.
- Email and username are normalized to lowercase in the service layer, not the database — the
  `UNIQUE` constraints only work correctly if every write goes through `user-service.ts`.
- The register endpoint must handle the D1 unique-constraint error as the authoritative duplicate
  check for both `email` and `username`, not just pre-flight lookups (race condition otherwise).
- `user-service.ts` takes `db: D1Database` as an explicit parameter on every function instead of
  calling `getCloudflareContext()` itself — that call happens exactly once, in each route handler.
  This is what makes the service testable without a request context.

---

## Acceptance Criteria

- [ ] `POST /api/auth/register` creates a user with a hashed password and returns the public user
      fields (no password or hash) on success
- [ ] Registering with an email that already exists returns 409 and does not create a duplicate row
- [ ] Registering with a username that already exists returns 409 and does not create a duplicate
      row
- [ ] Registering with invalid input (bad email format, invalid username format, password under 8
      characters, missing first/last name) returns 400 with field-level detail
- [ ] `POST /api/auth/login` with correct credentials returns the public user fields
- [ ] `POST /api/auth/login` with a wrong password or unknown email returns 401 with a generic
      error message that does not reveal which part was wrong
- [ ] `POST /api/auth/logout` returns a success response
- [ ] Passwords are never stored, logged, or returned in plaintext anywhere in the system
- [x] The `users` migration applies cleanly with `npx wrangler d1 migrations apply DB --local`
- [x] Duplicate emails and duplicate usernames are both impossible at the database level, not just
      checked in application code
- [ ] All three route handlers validate input with a Zod schema before touching the database
- [ ] `/dashboard` renders a placeholder page with no console errors
- [ ] Every phase above has a Vitest test file that was written and observed failing (red) before
      that phase's implementation existed, and passing (green) after
- [ ] `npm run test` passes with zero failures before this PRD is marked complete
- [ ] The D1-backed tests (schema, user service, endpoints) run against a real local D1 instance
      with this project's actual migrations applied, not a hand-rolled mock

---

## Success Metrics

This phase has no end users yet, so metrics are engineering checks rather than product outcomes:

| Metric | Target | How Measured |
|--------|--------|---------------|
| Acceptance criteria pass rate | 100% | Manually verify each checkbox above before marking this PRD complete |
| Test suite result | 0 failures | `npm run test` exit code 0 |
| Plaintext passwords at rest | 0 | Inspect `users.password_hash` via `wrangler d1 execute ... --local`; every value matches the `pbkdf2$...` format |
| Duplicate emails in `users` | 0 | `SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1` returns no rows |
| Duplicate usernames in `users` | 0 | `SELECT username, COUNT(*) FROM users GROUP BY username HAVING COUNT(*) > 1` returns no rows |
| Local migration apply | Exit code 0 | `npx wrangler d1 migrations apply DB --local` |

---

## Dependencies

### External Dependencies

- **Cloudflare D1** - primary datastore for the `users` table. Not yet provisioned in this
  project; provisioning it is Phase 1 of this PRD.

### Internal Dependencies

- None. This is the first backend feature in the project.

### New npm Dependencies

- **`zod`** - request validation in the route handlers. This is already the documented
  convention for this project (`.cursor/rules/nextjs.mdc`: "Validate all Server Action and route
  handler input with a Zod schema before use"); it just isn't installed yet. No password-hashing
  library is needed — PBKDF2 comes from the Workers-native Web Crypto API.
- **`vitest`** (dev) - test runner, per explicit instruction. Powers the red/green TDD loop for
  every phase in this PRD.
- **`@cloudflare/vitest-plugin`** (dev, installed in Phase 1, currently `^1.1.3`) - Cloudflare's
  official Workers Vitest integration, used for the D1-backed tests (schema, user service,
  endpoints) so they run against a real local D1 instance instead of a mock. Introducing it was
  explicitly flagged to the user first, per `.cursor/skills/testing/SKILL.md`; the user confirmed
  proceeding with the real runtime over the skill's default (mocking). See Testing Strategy for
  how it's configured to avoid conflicting with `@opennextjs/cloudflare`'s build output.

### Environment Variables

- None required. PBKDF2 needs no secret key, only the plaintext password and a per-user random
  salt stored alongside the hash.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: D1 is not configured anywhere in this project yet.
  **Mitigation**: Phase 1 provisions it from scratch following `.cursor/rules/d1.mdc` exactly
  (create → bind → `cf-typegen` → migrate). Migrations are only ever applied with `--local`, per
  `AGENTS.md`.
- **Risk**: Cloudflare caps PBKDF2 at 100,000 iterations in production, below current OWASP
  guidance.
  **Mitigation**: Accepted trade-off for this phase. The iteration count is embedded in the stored
  hash, so it can be increased later and existing rows still verify correctly (and can be
  re-hashed opportunistically on next login).
- **Risk**: Two simultaneous registrations with the same email could both pass an
  application-level existence check before either row is written.
  **Mitigation**: The database `UNIQUE` constraint is the real guard. The service must catch the
  constraint-violation error from D1 and map it to 409, not rely solely on a prior `SELECT`.
- **Risk**: Without any session or token, the future frontend has no way to know a user stays
  authenticated after login.
  **Mitigation**: Deliberately out of scope here and called out explicitly so it's a known,
  visible gap rather than a surprise — closed by the session-management phase that follows this
  one.
- **Risk (confirmed in Phase 1)**: `@cloudflare/vitest-plugin`'s workerd-based test pool clashes
  with `@opennextjs/cloudflare`'s build output specifically when pointed at the real
  `wrangler.jsonc` — it tries to auto-load `main` (`.open-next/worker.js`), which only exists
  after an OpenNext build.
  **Mitigation applied**: don't read bindings from `wrangler.jsonc` for tests that only need the
  `DB` binding, not the deployed worker. Declare bindings directly via `miniflare.d1Databases` in
  `vitest.workers.config.mts` instead. No fallback to a hand-rolled fake was needed — the real
  integration works, just not the way originally planned. See Testing Strategy and Phase 1 for
  the details, and the Troubleshooting Guide for the exact errors this produced.

### User Experience Risks

- **Risk**: The generic "invalid email or password" message on login is correct security practice
  but can read as unhelpful once a UI exists.
  **Mitigation**: Defer copy/UX refinement to the frontend phase; the API contract should stay
  generic even after a UI is built on top of it.

---

## Troubleshooting Guide

### Vitest config warnings about `configLoader: 'native'`
**Problem**: `npm run test` printed a warning about ESM syntax being loaded as CommonJS, and after
fixing that, a second warning about `__dirname` being unsupported.
**Cause**: `package.json` has no `"type": "module"`, so a plain `vitest.config.ts` using `import`
gets loaded as CommonJS by Vite's newer native config loader; and `__dirname` is a CommonJS
global that doesn't exist in an ESM file.
**Solution**: Named the file `vitest.config.mts` (forces ESM regardless of `package.json`,
matching how this repo already handles `postcss.config.mjs` / `eslint.config.mjs`), and used
`import.meta.dirname` instead of `__dirname` to build the `@/` alias path. `npm run test` now runs
with no warnings.
**Code Reference**: `vitest.config.mts:1-11`

### `cloudflareTest()` tries to load `.open-next/worker.js` and fails
**Problem**: `npm run test:workers` failed immediately with `Cannot find module
'...\.open-next\worker.js'`, even though the test only touches D1.
**Cause**: `vitest.workers.config.mts` originally pointed `wrangler: { configPath: "./wrangler.jsonc" }`
at the real app config. `cloudflareTest()` auto-loads whatever that config's `main` field points
to as the Worker entry-point (needed for `SELF`/Durable Object testing) — but `main` is
`.open-next/worker.js`, a build artifact that doesn't exist under plain `npm run test`.
**Attempted fix that didn't work**: Cloudflare's current docs mention a `main: false` option to
suppress this. The installed version, `@cloudflare/vitest-plugin@1.1.3`, doesn't have it yet —
its `WorkersPoolOptionsSchema` only accepts `main: z.string().optional()` (confirmed by reading
`node_modules/@cloudflare/vitest-plugin/dist/pool/index.mjs` directly), so passing `main: false`
throws `Unexpected options ... Invalid input: expected string, received boolean`.
**Solution**: Don't use `wrangler.configPath` for this test file at all. Declare the binding
directly under `miniflare` instead:
```typescript
miniflare: {
  compatibilityDate: "2026-07-01",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "ai-sprint-project-test-db" },
  bindings: { TEST_MIGRATIONS: migrations },
}
```
**Code Reference**: `vitest.workers.config.mts:1-20`

### Test files break `next build`'s typecheck
**Problem**: After the Workers-pool tests were passing, `npm run build` failed at "Running
TypeScript" with `Cannot find module 'cloudflare:test' or its corresponding type declarations`,
pointing at `test/apply-migrations.ts`.
**Cause**: `tsconfig.json`'s `include` is `**/*.ts` — broad enough to cover test files too — so
`next build`'s typecheck was compiling `test/*.ts` files alongside the app, and nothing in that
tsconfig knows about the `cloudflare:test` ambient module.
**Solution**: Excluded `test` and `**/*.test.ts` from the root `tsconfig.json`, and added a
separate `tsconfig.vitest.json` (extends the root config, adds `"@cloudflare/vitest-plugin/types"`
to `types`) purely so the editor still type-checks test files correctly. `next build` never sees
`tsconfig.vitest.json`, so it's unaffected by anything test-only.
**Code Reference**: `tsconfig.json:36-40`, `tsconfig.vitest.json:1-14`

### `env.DB` typed as `any` after adding `tsconfig.vitest.json`
**Problem**: Once test files had their own tsconfig, `tsc -p tsconfig.vitest.json` passed but with
a new error: `Parameter 'row' implicitly has an 'any' type` on a `.map()` callback reading
`result.results`, even though `.all<{ name: string }>()` was called with an explicit generic.
**Cause**: `cloudflare:test`'s `env` export is typed as `Cloudflare.Env` — the same global
namespace `cloudflare-env.d.ts` (generated by `cf-typegen`) augments with the real `DB` binding.
`tsconfig.vitest.json`'s `compilerOptions.types` **replaced** the base config's `types` array
instead of merging with it (`extends` does not merge array-valued `compilerOptions` fields), so
`cloudflare-env.d.ts` was silently dropped from the test program and `Cloudflare.Env` had nothing
augmenting it.
**Solution**: Added `cloudflare-env.d.ts` to `tsconfig.vitest.json`'s own `include` array so it's
part of that program too, alongside `@cloudflare/vitest-plugin/types`.
**Code Reference**: `tsconfig.vitest.json:7-13`

### `TEST_MIGRATIONS` binding not recognized by TypeScript
**Problem**: After the fix above, one error remained: `Property 'TEST_MIGRATIONS' does not exist
on type 'Env'` in `test/apply-migrations.ts`.
**Cause**: `TEST_MIGRATIONS` is a synthetic binding that exists only inside the Workers-pool test
config (`miniflare.bindings`) — it's not part of the real app, so `cf-typegen` never generates a
type for it.
**Solution**: Added `test/env.d.ts`, a small ambient declaration file that augments the global
`Cloudflare.Env` interface with `TEST_MIGRATIONS: D1Migration[]` via `declare global { namespace
Cloudflare { ... } }`. It's picked up automatically by `tsconfig.vitest.json`'s
`test/**/*.ts` include glob and never reaches the app's tsconfig.
**Code Reference**: `test/env.d.ts:1-13`

### `deriveBits()` salt parameter fails `next build` typecheck
**Problem**: `npm run build` failed with `Type 'Uint8Array<ArrayBufferLike>' is not assignable to
type 'BufferSource'` on the `salt` field passed to `crypto.subtle.deriveBits()` in
`src/lib/password.ts`.
**Cause**: Vitest's Node environment accepted the `Uint8Array` parameter without complaint, but
`next build`'s TypeScript pass uses stricter DOM/lib typings where `Uint8Array`'s generic buffer
type doesn't satisfy `BufferSource`.
**Solution**: Wrap the salt at the call site: `salt: new Uint8Array(salt)` inside the `deriveBits`
options object. Behavior is unchanged; the copy satisfies the type checker.
**Code Reference**: `src/lib/password.ts:37-40`

### `reset()` between tests wipes the D1 schema
**Problem**: After the first user-service test passed, every subsequent test failed with
`no such table: users`.
**Cause**: `afterEach(() => reset())` from `cloudflare:test` clears all attached bindings more
aggressively than just deleting rows — the `users` table created by `applyD1Migrations()` in the
setup file was gone after the first `reset()`.
**Solution**: Dropped `reset()` entirely. Each test now generates unique `email`/`username` values
via a `createTestInput()` helper so tests don't collide, without needing to re-apply migrations
between cases.
**Code Reference**: `src/lib/services/user-service.test.ts:11-32`

### D1-backed service tests picked up by the unit tier
**Problem**: `npm run test:unit` failed on `src/lib/services/user-service.test.ts` with
`Cannot find package 'cloudflare:test'`.
**Cause**: `vitest.config.mts` includes all of `src/**/*.test.ts`, but service tests need the
Workers pool (for `env.DB` and `cloudflare:test`).
**Solution**: Exclude `src/lib/services/**/*.test.ts` from `vitest.config.mts` and include the same
glob in `vitest.workers.config.mts` instead. Also added the `@/` path alias to the workers config
so the service module can import `@/lib/password`.
**Code Reference**: `vitest.config.mts:10-14`, `vitest.workers.config.mts:1-28`

---

### PowerShell `Select-Object` silently drops output for some commands
**Problem**: `Get-ChildItem "node_modules/@cloudflare" | Select-Object Name` printed nothing, even
though the directory clearly exists and `Test-Path` confirmed it.
**Cause**: Unclear — possibly a formatting/width issue with how this environment's shell tool
captures PowerShell's table-formatted output for `Select-Object`.
**Solution**: Use `Get-ChildItem <path> -Name` (plain string output) instead of piping through
`Select-Object` when listing directory contents in this environment.

---

## Notes for AI Agents

**Instructions for AI**: When working with this PRD:
1. Start by reading the Problem and Hypothesis to understand intent
2. Use Scope (In/Out/Cut) to determine boundaries — do not build out-of-scope items
3. Update phase status markers as work progresses
4. Add implementation details under "Technical Implementation Details" as code is written
5. Mark acceptance criteria as complete when features work
6. Add troubleshooting entries when bugs are found and fixed
7. Keep all sections current - remove outdated information
8. Use code references format: `filepath:line-number` when citing code

**Specific to this PRD**:
- Follow TDD strictly: for each phase, write and run its tests first, confirm they fail for the
  right reason, then implement until green. Do not write implementation code before its test
  exists.
- Run `npm run test` before checking off any Acceptance Criteria or marking a phase COMPLETED.
- Do not add session, cookie, or token logic even if it feels like a natural next step — that
  belongs to a future PRD.
- Do not build MCQ/test-bank functionality beyond the single placeholder page in Phase 5.
- All `users` table access must go through `src/lib/services/user-service.ts`. Never call
  `env.DB` for user data from a route handler or component directly.
- Never apply a migration with `--remote`.

---

## Current Status

**Last Updated**: September 2, 2026
**Current Phase**: Phase 3 complete (User Service); Phase 4 (Auth Endpoints) not started
**Status**: IN PROGRESS
**Next Steps**: Awaiting review of Phase 3 before starting Phase 4 — implement the three auth route
handlers test-first, using Zod validation and the user service from this phase.
