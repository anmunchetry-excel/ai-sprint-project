Date created: September 7, 2026
Date last modified: September 8, 2026

# Multiple-Choice Question CRUD - Technical PRD

## Overview/Problem

The previous phase gave this application a user identity foundation — teachers can register, log
in, and log out — but the thing they logged in *for* does not exist yet. `/dashboard` is a
placeholder that says "MCQ Test Bank — Coming soon." There is nowhere to author a question, no
storage for one, and no way to see what has already been written. Until teachers can create, edit,
and delete multiple-choice questions, the shared test bank that motivates the whole project is an
empty promise.

---

## Hypothesis

We believe that a three-table MCQ data model (question, choices, attempts) behind a dedicated MCQ
service, exposed through REST endpoints and a shadcn/ui table-and-form interface, will let a
teacher author and maintain a bank of multiple-choice questions end to end — and will produce the
attempt records that any future reporting or grading feature depends on.

---

## Scope

### In Scope

- **Three D1 tables**, added in one migration: `mcqs`, `mcq_choices`, and `mcq_attempts`.
  - `mcqs` — id, name, question, created_by_user_id, created_at, updated_at.
  - `mcq_choices` — id, mcq_id (FK), choice_text, is_correct, position. Between 2 and 6 rows per
    question.
  - `mcq_attempts` — id, mcq_id (FK), choice_id (FK), user_id (FK), is_correct, created_at.
- **An MCQ service** (`src/lib/services/mcq-service.ts`) that owns every read and write to all
  three tables. Route handlers never touch `env.DB` for MCQ data directly. Same shape as
  `user-service.ts`: every function takes `db: D1Database` as its first parameter.
- **Zod schemas** (`src/lib/schemas/mcq.ts`) shared by the API and the browser forms.
- **REST endpoints**:
  - `GET /api/mcqs` — list all questions
  - `POST /api/mcqs` — create a question with its choices
  - `GET /api/mcqs/[id]` — one question with its choices
  - `PUT /api/mcqs/[id]` — update a question and replace its choices
  - `DELETE /api/mcqs/[id]` — delete a question and (by cascade) its choices and attempts
  - `POST /api/mcqs/[id]/attempts` — record one attempt against a question
- **A browser client module** (`src/lib/mcq-client.ts`) wrapping those endpoints, mirroring the
  existing `auth-client.ts` pattern.
- **A current-user helper** (`src/lib/current-user.ts`) that persists the logged-in user in
  `localStorage` after register/login and clears it on logout, so the UI has a `userId` to send.
  This is a UX convenience, not authentication — see Assumptions.
- **`/dashboard` becomes the question list**: a shadcn `Table` of all questions (name, question
  excerpt, choice count, created date) plus a "New question" button. Each row has an actions column
  rendered as a vertical-ellipsis (`MoreVertical`) trigger opening a dropdown with **Edit**,
  **Preview**, and **Delete**.
- **`/dashboard/mcqs/new` and `/dashboard/mcqs/[id]/edit`** — one shared editor component for both
  create and edit. Name field, question field, a repeating list of choices starting at two rows and
  expandable to six, a single-select control marking the one correct choice, and **Save** /
  **Cancel** buttons.
- **`/dashboard/mcqs/[id]/preview`** — the question rendered as a learner would see it. Selecting a
  choice and submitting posts an attempt and shows whether it was correct.
- **A welcoming home page at `/`** replacing the Next.js starter content, with clear **Login** and
  **Register** links.
- **A personalized dashboard greeting** displaying `Welcome, <username>` from the current user
  stored by the Phase 6 helper.
- **A continuously reviewed bugfix/feature phase** after the core MCQ build. New small defects and
  refinements are added to its dated backlog, implemented one iteration at a time, and independently
  approved, committed, and pushed.
- **Four new shadcn/ui components** added via the CLI: `dropdown-menu`, `textarea`, `radio-group`,
  and `alert-dialog` (delete confirmation). These are source files copied into the repo, not npm
  packages.
- **A Vitest suite covering every phase below**, written test-first (red) and made to pass (green),
  reusing the two-tier setup already in the repo.

### Out of Scope

Not being built now, but plausible follow-ups:

- **Authentication and authorization.** There is still no session. Any user can edit or delete any
  question. The server does not verify that the `userId` in a request body is the caller. This is
  the single largest known gap and it is deliberate — see Risks.
- **Attempt reporting.** `mcq_attempts` rows are written and readable through the service layer,
  but there is no results page, score summary, per-question analytics, or attempt history UI.
- **Question banks, tagging, categories, or search/filter/pagination** on the list page. The table
  renders every question, unsorted beyond `created_at`.
- **Rich text, images, LaTeX, or code blocks** in question or choice bodies. Plain text only.
- **Multiple correct answers.** Exactly one choice is correct per question (confirmed by product
  direction).
- **Choice reordering by drag-and-drop.** Choices are ordered by their position in the form; rows
  can be added and removed but not dragged.
- **Soft delete / undo.** Delete is permanent, guarded only by a confirmation dialog.
- **Optimistic concurrency.** Two teachers editing the same question simultaneously: last write
  wins, silently.
- **AI-assisted question generation.** Not in this build.

### Cut

- **Server Actions for the editor form.** `.cursor/rules/nextjs.mdc` prefers Server Actions, but
  the auth phase already established REST route handlers + client `fetch` as this project's
  pattern, and the brief explicitly asks for "the endpoints, the routes." Mixing both would leave
  two ways to do the same thing. Cut in favour of consistency; revisit if the form logic grows.
- **A separate `GET /api/mcqs/[id]/attempts` endpoint.** Following the precedent set by
  `listUsers` in the auth PRD: `listAttemptsForMcq` exists on the service for the future reporting
  phase, but is not wired to a route, because nothing consumes it yet.
- **Storing a text snapshot of the selected choice on each attempt.** Would make attempt history
  survive a later rewording of a choice. Cut as premature — the update strategy below already
  preserves choice IDs, and there is no reporting UI yet that would expose the discrepancy.
- **A dedicated "answer key" view.** Preview already reveals correctness after submission.

### Assumptions & Interpretation Notes

Points that required a judgment call, flagged so they are easy to correct:

- **`created_by_user_id` comes from the client.** Confirmed by product direction. On successful
  register or login the UI stores the returned user in `localStorage`; MCQ pages read it and send
  `userId` in the request body. The column is a real foreign key to `users(id)`, so the database
  rejects a nonexistent user — but the server has no way to confirm the caller *is* that user.
  When session management ships, the endpoints should read the user from the session and stop
  accepting `userId` from the body. This is called out again under Risks because it is genuinely
  unsafe, not merely incomplete.
- **"Description" is renamed to "question."** Per the correction at the end of the brief, `mcqs`
  has `name` (a short label for the list view) and `question` (the actual prompt shown to a
  learner). There is no separate description column.
- **Exactly one choice is correct.** Confirmed by product direction. Enforced in the Zod schema via
  a refinement, not by a database constraint — SQLite cannot express "exactly one row in this group
  has `is_correct = 1`" without a trigger, and the service is the only writer.
- **Preview is where attempts come from.** Confirmed by product direction. The Preview action opens
  a page that renders the question like a learner sees it; submitting a choice writes an
  `mcq_attempts` row. Without this, the attempts table would have no producer in this build.
- **The server computes `is_correct` on an attempt.** The request body carries only `choiceId` and
  `userId`. The service looks up the choice and derives correctness. A client claim about
  correctness is never trusted or stored.
- **Two choice rows are rendered by default, six is the hard cap.** The brief's "by default we'll
  have two choices that will display on screen but the user can create up to let's say six." Two is
  also the enforced minimum — a one-choice question is not a multiple-choice question.
- **Editing replaces choices by position, not by wholesale delete-and-reinsert.** Existing choice
  rows are updated in place for positions that still exist, new rows are inserted for added
  positions, and rows beyond the new length are deleted. This keeps choice IDs stable so
  `mcq_attempts` rows referencing them survive an edit. A naive delete-all-then-reinsert would
  cascade-delete the entire attempt history of a question every time a teacher fixed a typo.
- **Delete cascades.** Deleting a question deletes its choices and its attempts, via
  `ON DELETE CASCADE`. D1 enforces foreign keys by default.
- **`/dashboard` is repurposed rather than a new route being added.** The auth PRD reserved it for
  exactly this, and register/login already redirect there.
- **Still no route protection.** Visiting `/dashboard` without logging in works. The MCQ pages
  redirect to `/login` when no user is found in `localStorage`, but this is a client-side courtesy
  that anyone can bypass — not a security boundary.
- **Test-driven development**, per explicit instruction. Every phase writes its tests first,
  observes them fail for the right reason, then implements to green.
- **Cloudflare deployment is manual.** Per `AGENTS.md`, agents do not run `npm run deploy`. The
  developer deploys after each phase and applies remote migrations themselves.

---

## Technical Requirements

### Database Schema

One migration, `migrations/0002_create_mcq_tables.sql`:

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL REFERENCES mcqs(id) ON DELETE CASCADE,
  choice_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (mcq_id, position)
);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL REFERENCES mcqs(id) ON DELETE CASCADE,
  choice_id TEXT NOT NULL REFERENCES mcq_choices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mcqs_created_by_user_id ON mcqs(created_by_user_id);
CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices(mcq_id);
CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts(mcq_id);
CREATE INDEX idx_mcq_attempts_user_id ON mcq_attempts(user_id);
```

Notes:

- `position` is 0-based and drives display order. The `UNIQUE (mcq_id, position)` constraint stops
  two choices from claiming the same slot. Note that this makes the update strategy order-sensitive
  — see Important Notes for the shrink-then-write ordering that avoids a transient collision.
- SQLite has no boolean type. `is_correct` is an `INTEGER` constrained to `0` or `1`; the service
  converts to and from JavaScript `boolean` so no other layer deals with the encoding.
- "Exactly one correct choice" is **not** a database constraint. It is enforced by
  `mcqChoicesSchema`'s refinement, and the service is the only writer to these tables.
- `mcq_attempts.is_correct` is denormalized on purpose: it captures whether the attempt was correct
  *at the time it was made*, so a later edit to the answer key does not silently rewrite history.
- Every FK is `ON DELETE CASCADE`. Deleting a user removes their questions, those questions'
  choices, and every attempt against them.
- `updated_at` has no trigger, matching `users`. The service sets it explicitly.
- All access goes through `mcq-service.ts`. Nothing else calls `env.DB` for MCQ data.

### Validation Rules

Defined once in `src/lib/schemas/mcq.ts` and used by both the route handlers and the browser forms:

| Field | Rule |
|---|---|
| `name` | trimmed, 1–200 characters |
| `question` | trimmed, 1–2000 characters |
| `choices` | array of 2–6 entries |
| `choices[].text` | trimmed, 1–500 characters |
| `choices[].isCorrect` | boolean; **exactly one** entry in the array must be `true` |
| `userId` | non-empty string |
| `choiceId` (attempt) | non-empty string |

### API Endpoints

#### GET /api/mcqs

**Request Body:** none

**Response:**
- Success (200):
  ```json
  {
    "mcqs": [
      {
        "id": "...",
        "name": "Photosynthesis basics",
        "question": "Which gas do plants absorb during photosynthesis?",
        "createdByUserId": "...",
        "choiceCount": 4,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
  ```
- Error (500): unexpected server/database error

Returns an empty array, not a 404, when no questions exist. Choices are not included — the list
view only needs the count.

#### POST /api/mcqs

**Request Body:**
```json
{
  "name": "Photosynthesis basics",
  "question": "Which gas do plants absorb during photosynthesis?",
  "userId": "...",
  "choices": [
    { "text": "Carbon dioxide", "isCorrect": true },
    { "text": "Oxygen", "isCorrect": false }
  ]
}
```

**Response:**
- Success (201): `{ "mcq": { ...full question with its choices... } }`
- Error (400): validation failure — fewer than 2 or more than 6 choices, zero or multiple correct
  choices, empty name/question/choice text
- Error (404): `userId` does not match a row in `users`
- Error (500): unexpected server/database error

#### GET /api/mcqs/[id]

**Request Body:** none

**Response:**
- Success (200):
  ```json
  {
    "mcq": {
      "id": "...",
      "name": "Photosynthesis basics",
      "question": "Which gas do plants absorb during photosynthesis?",
      "createdByUserId": "...",
      "createdAt": "...",
      "updatedAt": "...",
      "choices": [
        { "id": "...", "text": "Carbon dioxide", "isCorrect": true, "position": 0 },
        { "id": "...", "text": "Oxygen", "isCorrect": false, "position": 1 }
      ]
    }
  }
  ```
- Error (404): no question with that id
- Error (500): unexpected server/database error

Choices are always returned ordered by `position` ascending.

#### PUT /api/mcqs/[id]

**Request Body:** same shape as `POST /api/mcqs`, minus `userId` (authorship does not change on
edit).

**Response:**
- Success (200): `{ "mcq": { ...updated question with its choices... } }`
- Error (400): validation failure (same rules as create)
- Error (404): no question with that id
- Error (500): unexpected server/database error

The full choice set is sent on every update — this is a replace, not a patch.

#### DELETE /api/mcqs/[id]

**Request Body:** none

**Response:**
- Success (200): `{ "success": true }`
- Error (404): no question with that id
- Error (500): unexpected server/database error

Cascades to `mcq_choices` and `mcq_attempts`.

#### POST /api/mcqs/[id]/attempts

**Request Body:**
```json
{
  "userId": "...",
  "choiceId": "..."
}
```

**Response:**
- Success (201):
  ```json
  {
    "attempt": {
      "id": "...",
      "mcqId": "...",
      "choiceId": "...",
      "userId": "...",
      "isCorrect": true,
      "createdAt": "..."
    }
  }
  ```
- Error (400): missing `userId` or `choiceId`, **or** `choiceId` belongs to a different question
- Error (404): no question with that id, or `userId`/`choiceId` does not exist
- Error (500): unexpected server/database error

`isCorrect` is derived server-side from the stored choice. The client cannot set it.

### Manual cURL Verification (Phases 4–5)

Run these in PowerShell while `npm run dev` is serving `http://localhost:3000`. Use `curl.exe`
explicitly because `curl` may be a PowerShell alias. The setup creates a disposable user and two
questions, then captures their ids for the remaining requests.

```powershell
$BaseUrl = "http://localhost:3000"
$Suffix = [guid]::NewGuid().ToString("N").Substring(0, 12)

# Setup: register a disposable user and capture its id (expected 201).
$RegisterBody = @{
  email = "curl-$Suffix@example.com"
  username = "curl-$Suffix"
  firstName = "Curl"
  lastName = "Tester"
  password = "at-least-8-characters"
} | ConvertTo-Json -Compress
$Registered = $RegisterBody | curl.exe -sS -X POST "$BaseUrl/api/auth/register" `
  -H "Content-Type: application/json" --data-binary "@-" | ConvertFrom-Json
$UserId = $Registered.user.id

# POST /api/mcqs — create success (expected 201) and capture question/choice ids.
$CreateBody = @{
  name = "cURL photosynthesis question"
  question = "Which gas do plants absorb?"
  userId = $UserId
  choices = @(
    @{ text = "Carbon dioxide"; isCorrect = $true },
    @{ text = "Oxygen"; isCorrect = $false }
  )
} | ConvertTo-Json -Depth 5 -Compress
$Created = $CreateBody | curl.exe -sS -X POST "$BaseUrl/api/mcqs" `
  -H "Content-Type: application/json" --data-binary "@-" | ConvertFrom-Json
$McqId = $Created.mcq.id
$CorrectChoiceId = ($Created.mcq.choices | Where-Object isCorrect).id
$IncorrectChoiceId = ($Created.mcq.choices | Where-Object { -not $_.isCorrect }).id
$Created | ConvertTo-Json -Depth 6

# Create a second question for the mismatched-choice test (expected 201).
$SecondCreateBody = @{
  name = "cURL second question"
  question = "Which option is correct?"
  userId = $UserId
  choices = @(
    @{ text = "First"; isCorrect = $true },
    @{ text = "Second"; isCorrect = $false }
  )
} | ConvertTo-Json -Depth 5 -Compress
$Second = $SecondCreateBody | curl.exe -sS -X POST "$BaseUrl/api/mcqs" `
  -H "Content-Type: application/json" --data-binary "@-" | ConvertFrom-Json
$SecondMcqId = $Second.mcq.id
$SecondChoiceId = $Second.mcq.choices[0].id
```

Phase 4 CRUD endpoints:

```powershell
# GET /api/mcqs — list success (expected 200).
curl.exe -i -sS "$BaseUrl/api/mcqs"

# GET /api/mcqs/[id] — read success and not found (expected 200, then 404).
curl.exe -i -sS "$BaseUrl/api/mcqs/$McqId"
curl.exe -i -sS "$BaseUrl/api/mcqs/missing-mcq"

# PUT /api/mcqs/[id] — update success (expected 200).
$UpdateBody = @{
  name = "Updated cURL question"
  question = "Which gas is absorbed by plants?"
  choices = @(
    @{ text = "Carbon dioxide"; isCorrect = $true },
    @{ text = "Oxygen"; isCorrect = $false },
    @{ text = "Nitrogen"; isCorrect = $false }
  )
} | ConvertTo-Json -Depth 5 -Compress
$Updated = $UpdateBody | curl.exe -sS -X PUT "$BaseUrl/api/mcqs/$McqId" `
  -H "Content-Type: application/json" --data-binary "@-" | ConvertFrom-Json
$CorrectChoiceId = ($Updated.mcq.choices | Where-Object isCorrect).id
$IncorrectChoiceId = ($Updated.mcq.choices | Where-Object { -not $_.isCorrect })[0].id
$Updated | ConvertTo-Json -Depth 6

# POST validation failure: one choice (expected 400).
$InvalidCreateBody = @{
  name = "Invalid question"
  question = "Only one choice?"
  userId = $UserId
  choices = @(@{ text = "Only"; isCorrect = $true })
} | ConvertTo-Json -Depth 5 -Compress
$InvalidCreateBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs" `
  -H "Content-Type: application/json" --data-binary "@-"

# POST unknown creator (expected 404).
$MissingUserBody = @{
  name = "Missing creator"
  question = "Should this fail?"
  userId = "missing-user"
  choices = @(
    @{ text = "Yes"; isCorrect = $true },
    @{ text = "No"; isCorrect = $false }
  )
} | ConvertTo-Json -Depth 5 -Compress
$MissingUserBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs" `
  -H "Content-Type: application/json" --data-binary "@-"

# PUT validation failure and unknown question (expected 400, then 404).
$InvalidUpdateBody = @{
  name = "Invalid update"
  question = "Still one choice?"
  choices = @(@{ text = "Only"; isCorrect = $true })
} | ConvertTo-Json -Depth 5 -Compress
$InvalidUpdateBody | curl.exe -i -sS -X PUT "$BaseUrl/api/mcqs/$McqId" `
  -H "Content-Type: application/json" --data-binary "@-"
$UpdateBody | curl.exe -i -sS -X PUT "$BaseUrl/api/mcqs/missing-mcq" `
  -H "Content-Type: application/json" --data-binary "@-"
```

Phase 5 attempt endpoint:

```powershell
# Correct and incorrect submissions (both expected 201).
$CorrectAttemptBody = @{
  userId = $UserId
  choiceId = $CorrectChoiceId
} | ConvertTo-Json -Compress
$IncorrectAttemptBody = @{
  userId = $UserId
  choiceId = $IncorrectChoiceId
} | ConvertTo-Json -Compress
$CorrectAttemptBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/$McqId/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"
$IncorrectAttemptBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/$McqId/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"

# Client-supplied isCorrect is ignored; stored result remains true (expected 201).
$TamperedAttemptBody = @{
  userId = $UserId
  choiceId = $CorrectChoiceId
  isCorrect = $false
} | ConvertTo-Json -Compress
$TamperedAttemptBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/$McqId/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"

# Missing choiceId (expected 400).
$MissingChoiceFieldBody = @{ userId = $UserId } | ConvertTo-Json -Compress
$MissingChoiceFieldBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/$McqId/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"

# Choice from a different question (expected 400).
$WrongQuestionChoiceBody = @{
  userId = $UserId
  choiceId = $SecondChoiceId
} | ConvertTo-Json -Compress
$WrongQuestionChoiceBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/$McqId/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"

# Unknown question, user, and choice (each expected 404).
$CorrectAttemptBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/missing-mcq/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"
$MissingAttemptUserBody = @{
  userId = "missing-user"
  choiceId = $CorrectChoiceId
} | ConvertTo-Json -Compress
$MissingAttemptUserBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/$McqId/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"
$MissingChoiceBody = @{
  userId = $UserId
  choiceId = "missing-choice"
} | ConvertTo-Json -Compress
$MissingChoiceBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/$McqId/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"

# Re-run this twice; each response must have a different attempt id (both expected 201).
$CorrectAttemptBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/$McqId/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"
$CorrectAttemptBody | curl.exe -i -sS -X POST "$BaseUrl/api/mcqs/$McqId/attempts" `
  -H "Content-Type: application/json" --data-binary "@-"

# DELETE /api/mcqs/[id] — cleanup success, then not found (expected 200, 200, then 404).
curl.exe -i -sS -X DELETE "$BaseUrl/api/mcqs/$McqId"
curl.exe -i -sS -X DELETE "$BaseUrl/api/mcqs/$SecondMcqId"
curl.exe -i -sS -X DELETE "$BaseUrl/api/mcqs/missing-mcq"
```

### User Interface Requirements

The MCQ screens under `/dashboard` are client components (`'use client'`) — they read the current
user from `localStorage` and call the API with `fetch`, neither of which works during a server
render. The public home page can remain a Server Component because it only renders static content
and links.

#### Welcome Home Page (`/`)

- Replaces the unchanged Next.js starter page and starter logos/links.
- Displays a welcoming heading for the MCQ test-bank application and a short explanation of what
  teachers can do.
- Provides two prominent navigation actions: **Login** → `/login` and **Register** → `/register`.
- Uses Next.js `Link` plus existing shadcn `Button`/`Card` components and semantic Tailwind tokens.
- Remains public and requires no current-user state.

#### Question List (`/dashboard`)

Replaces the current placeholder. Keeps the existing `LogoutButton` in the header.

- Displays `Welcome, <username>` in the dashboard header using the user returned by
  `getCurrentUser()`. If the stored user is absent or malformed, follow the existing redirect to
  `/login`; do not render an invented username.
- Loads `GET /api/mcqs` on mount; shows a loading state, then the table.
- **shadcn `Table`** with columns: **Name**, **Question** (truncated to one line), **Choices**
  (count), **Created**, and a right-aligned **Actions** column.
- **Actions column**: a ghost icon `Button` showing Lucide's `MoreVertical` (three vertical
  ellipses), opening a `DropdownMenu` with three items:
  - **Edit** → navigates to `/dashboard/mcqs/[id]/edit`
  - **Preview** → navigates to `/dashboard/mcqs/[id]/preview`
  - **Delete** → opens an `AlertDialog` confirmation; on confirm, calls
    `DELETE /api/mcqs/[id]` and removes the row from the table without a full reload. Styled with
    the destructive token.
- **"New question" `Button`** above the table, navigating to `/dashboard/mcqs/new`.
- **Empty state**: when the list is empty, show a short line of copy and the same "New question"
  button instead of an empty table body.
- **Error state**: a single inline message if the list request fails; no stack traces.
- Redirects to `/login` if no current user is stored.

#### Question Editor (`/dashboard/mcqs/new` and `/dashboard/mcqs/[id]/edit`)

One shared `McqForm` component, given an optional existing question.

- Fields, laid out with the existing `Field` primitives:
  - **Name** — `Input`, required.
  - **Question** — `Textarea`, required.
  - **Choices** — a repeating list. Two empty rows on the new-question page; the stored choices on
    the edit page. Each row is a `RadioGroup` item (marking it the correct answer) plus an `Input`
    for the choice text plus a remove button.
- **"Add choice" button** appends a row; disabled at six. Remove buttons are hidden when only two
  rows remain. Removing the row currently marked correct clears the selection.
- **Client-side validation** before submit, using the same Zod schema as the API. Field-level
  messages render through `FieldError`. The "exactly one correct choice" failure renders as a
  form-level message above the choice list, since it belongs to no single field.
- **Save** — `POST /api/mcqs` on the new page, `PUT /api/mcqs/[id]` on the edit page. On success,
  navigate back to `/dashboard`. Disabled while the request is in flight.
- **Cancel** — navigates back to `/dashboard` without saving. No confirmation prompt.
- **On 400**: render field errors from `error.issues`. **On 404** (edit): show "This question no
  longer exists." **On 500**: a generic "Something went wrong."
- The edit page shows a not-found message with a link back to `/dashboard` if the initial
  `GET /api/mcqs/[id]` returns 404.

#### Question Preview (`/dashboard/mcqs/[id]/preview`)

- Loads `GET /api/mcqs/[id]` and renders the question text with its choices as a `RadioGroup` —
  correctness is **not** revealed before submission.
- **Submit** posts to `POST /api/mcqs/[id]/attempts` with the current user's id and the selected
  choice id. Disabled until a choice is selected.
- After submission, show whether the answer was correct using the API's `isCorrect`, and reveal
  which choice was the correct one.
- **"Try again"** resets the selection and allows another attempt — each submission writes a new
  row, so repeated attempts are recorded, not overwritten.
- **Back to questions** link returns to `/dashboard`.

---

## Testing Strategy (Test-Driven Development)

**Workflow**: unchanged from the auth PRD. For each phase, write the tests first, run them,
confirm they fail for the right reason (missing module, missing table — not a typo in the test),
then implement until green. A phase is not done until its tests pass *and* its acceptance criteria
are checked.

**Framework**: Vitest, using the two-tier setup already in the repo. No new test infrastructure is
needed for this feature — the existing config globs already cover where the new files go:

| Tier | Config | Covers (existing globs) | New files this feature adds |
|---|---|---|---|
| Plain Node unit | `vitest.config.mts` | `src/**/*.test.ts`, excluding services and API routes | `src/lib/schemas/mcq.test.ts`, `src/lib/mcq-client.test.ts`, `src/lib/current-user.test.ts` |
| Workers pool (real local D1) | `vitest.workers.config.mts` | `test/**/*.test.ts`, `src/lib/services/**/*.test.ts`, `src/app/api/**/*.test.ts` | `test/mcq-tables.test.ts`, `src/lib/services/mcq-service.test.ts`, `src/app/api/mcqs/**/route.test.ts` |

**No new dev dependencies.** `vitest` and `@cloudflare/vitest-plugin` are already installed and
configured; `readD1Migrations()` picks up `0002_create_mcq_tables.sql` automatically because it
reads the whole `migrations/` directory.

**Test isolation**: follow the pattern established in `user-service.test.ts` — do not call
`reset()` from `cloudflare:test`, because it wipes the schema that `apply-migrations.ts` set up.
Instead, each test creates its own fixtures. MCQ tests additionally need a **user** to satisfy the
`created_by_user_id` foreign key, so a `createTestUser()` helper (inserting a row with a unique
email and username) is a prerequisite in every D1-backed MCQ test file.

**Manual UI verification**: the three pages are verified by hand against their acceptance criteria,
consistent with how `/register`, `/login`, and `/dashboard` were handled. React Testing Library is
not being added unless the user explicitly approves it (per `AGENTS.md`). The logic worth testing
in the UI layer — request building, response parsing, status-code mapping — lives in
`mcq-client.ts` and is unit-tested with `globalThis.fetch` mocked.

### Deployment (manual, per phase)

Agents do not run `npm run deploy`. After each phase's tests pass and the phase is reviewed, the
**developer** deploys and applies remote migrations.

| Phase | What the developer deploys manually |
|---|---|
| 1 | `0002_create_mcq_tables.sql` applied to remote D1 (`--remote`), then a Workers deploy |
| 2 | MCQ Zod schemas (code refresh only) |
| 3 | MCQ service layer (code refresh only) |
| 4 | MCQ CRUD API routes |
| 5 | Attempts API route |
| 6 | Client modules + auth pages persisting the current user |
| 7 | `/dashboard` question list |
| 8 | Question editor pages |
| 9 | Question preview page |

Agents apply migrations with `--local` only. `npm run preview` is the local Workers check before
any deploy; `npm run dev` runs on Node and does not prove Workers-runtime behaviour.

---

## Implementation Phases

### Phase 1: Database Schema - COMPLETED

**Objective**: Create the three MCQ tables.

**Tests (write first)**, in `test/mcq-tables.test.ts` (Workers pool):
- All three tables exist with the expected columns
- Inserting an `mcqs` row populates `id`, `created_at`, and `updated_at`
- Inserting an `mcqs` row with a `created_by_user_id` that is not in `users` is rejected
- Inserting an `mcq_choices` row with an unknown `mcq_id` is rejected
- Two choices for the same `mcq_id` with the same `position` are rejected
- `is_correct` rejects a value other than 0 or 1
- Deleting an `mcqs` row cascades: its choices and attempts are gone

**Tasks**:
1. `npx wrangler d1 migrations create DB create_mcq_tables`
2. Write the three `CREATE TABLE` statements and four indexes (above) into the generated file
3. Apply locally: `npx wrangler d1 migrations apply DB --local`

**Deliverables**:
- `migrations/0002_create_mcq_tables.sql`
- `test/mcq-tables.test.ts`, all green

**What was actually built**: exactly the planned three tables and four indexes. The seven schema
tests were written first and confirmed red: all seven failed because `mcqs`, `mcq_choices`, and
`mcq_attempts` did not exist, while the existing 22 Workers tests remained green. Migration
`0002_create_mcq_tables.sql` was then created with Wrangler, filled with the schema above, and
applied to local D1 only; Wrangler reported all eight SQL commands successful. The tests also
assert the exact four application-index names in `sqlite_master`, in addition to the planned
column, constraint, foreign-key, and cascade behaviours. Green verification: 29 Workers tests and
the full 45-test suite pass. `npm run lint` and `npm run build` also pass. No dependency or test
configuration change was needed.

### Phase 2: Validation Schemas - COMPLETED

**Objective**: One module defining what a valid question and a valid attempt look like.

**Tests (write first)**, in `src/lib/schemas/mcq.test.ts` (plain unit):
- A well-formed question with two choices parses
- Six choices parse; seven are rejected
- One choice is rejected
- Zero correct choices is rejected, with an identifiable error
- Two correct choices are rejected
- Empty or whitespace-only `name`, `question`, or choice text is rejected
- `name` over 200 and `question` over 2000 characters are rejected
- `attemptSchema` rejects a missing `userId` or `choiceId`

**Tasks**:
1. Create `src/lib/schemas/mcq.ts` exporting `mcqChoiceSchema`, `createMcqSchema`,
   `updateMcqSchema`, and `attemptSchema`, plus their inferred types
2. Implement the "exactly one correct choice" rule as a `.refine()` on the choices array, with a
   message the UI can display as a form-level error

**Deliverables**:
- `src/lib/schemas/mcq.ts`
- `src/lib/schemas/mcq.test.ts`, all green

**What was actually built**: the four planned schemas plus the reusable exported
`mcqChoicesSchema` and inferred `McqChoiceInput`, `CreateMcqInput`, `UpdateMcqInput`, and
`AttemptInput` types. Seventeen tests were written first and confirmed red because `./mcq` did not
exist, while the existing 16 unit tests remained green. The tests cover the planned boundaries and
also verify trimming, a required create-only `userId`, whitespace-only attempt ids, and that update
input is valid without a user id. The exact-one refinement produces the identifiable
`\"Exactly one choice must be marked correct\"` issue at path `choices`, ready for the future form's
form-level error. Green verification: 33 unit tests, 29 Workers tests, and the full 62-test suite
pass; `npm run lint` is warning-free and `npm run build` passes. No dependency or configuration
change was needed.

### Phase 3: MCQ Service - COMPLETED

**Objective**: The one module that reads and writes all three MCQ tables.

**Tests (write first)**, in `src/lib/services/mcq-service.test.ts` (Workers pool, real local D1):
- `createMcq` stores the question and all its choices with sequential positions from 0
- `createMcq` for a nonexistent user throws a typed, identifiable error
- `getMcqById` returns the question with choices ordered by `position`
- `getMcqById` returns `null` for an unknown id
- `listMcqs` returns every question with an accurate `choiceCount`, and an empty array when none exist
- `updateMcq` changes name, question, and choice text, and bumps `updated_at`
- `updateMcq` growing from 2 to 4 choices inserts the new rows
- `updateMcq` shrinking from 4 to 2 choices deletes the trailing rows
- **`updateMcq` preserves the ids of choices at positions that still exist**, so an existing attempt
  row survives the edit
- `updateMcq` returns `null` for an unknown id
- `deleteMcq` removes the question, its choices, and its attempts; returns `false` for an unknown id
- `recordAttempt` stores `is_correct = 1` when the chosen choice is the correct one, `0` otherwise
- `recordAttempt` rejects a `choiceId` belonging to a different question
- `listAttemptsForMcq` returns attempts newest-first

**Tasks**:
1. Create `src/lib/services/mcq-service.ts` — every function takes `db: D1Database` first
2. Implement `createMcq`, `getMcqById`, `listMcqs`, `updateMcq`, `deleteMcq`, `recordAttempt`, and
   `listAttemptsForMcq`
3. Convert `is_correct` between SQLite `0`/`1` and JavaScript `boolean` at this boundary, and map
   snake_case rows to camelCase objects — no other layer sees the raw row shape
4. Use `db.batch()` for multi-statement writes (create and update) so a question is never persisted
   with a partial choice set
5. Translate the foreign-key violation from an unknown `created_by_user_id` into a typed
   `McqUserNotFoundError` the route can map to 404
6. Add `listAttemptsForMcq` for the future reporting phase, unwired to any route

**Deliverables**:
- `src/lib/services/mcq-service.ts`
- `src/lib/services/mcq-service.test.ts`, all green

**What was actually built**: all seven planned service functions, with explicit `db` parameters,
prepared statements, `db.batch()` for atomic question/choice writes, row-shape conversion at the
service boundary, and position-preserving updates. Fifteen Workers-runtime tests were written first
and confirmed red because `./mcq-service` did not exist, while the existing 29 Workers tests
remained green. The service exposes the planned `McqUserNotFoundError` plus typed
`McqNotFoundError`, `McqChoiceNotFoundError`, and `ChoiceNotForMcqError` for the Phase 4–5 routes.
Tests verify 2→4 growth, 4→2 shrink, stable retained choice ids, surviving attempt history,
server-derived integer/boolean correctness, cascading delete, and deterministic newest-first
attempt ordering. Green verification: 33 unit tests, 44 Workers tests, and the full 77-test suite
pass; `npm run lint` and `npm run build` both pass. No dependency or configuration change was
needed.

### Phase 4: MCQ CRUD Endpoints - COMPLETED

**Objective**: Expose list, create, read, update, and delete over HTTP.

**Tests (write first)**, in `src/app/api/mcqs/route.test.ts` and
`src/app/api/mcqs/[id]/route.test.ts` (Workers pool; call the exported handlers directly with
constructed `Request` objects, mocking `getCloudflareContext()` as the auth route tests do):
- `GET /api/mcqs`: 200 with an empty array when none exist; 200 listing created questions
- `POST /api/mcqs`: 201 with the question and its choices; 400 for one choice; 400 for seven
  choices; 400 for zero correct; 400 for two correct; 400 for an empty name; 404 for an unknown
  `userId`
- `GET /api/mcqs/[id]`: 200 with choices in position order; 404 for an unknown id
- `PUT /api/mcqs/[id]`: 200 with updated content; 400 for invalid input; 404 for an unknown id
- `DELETE /api/mcqs/[id]`: 200 `{ success: true }`; 404 for an unknown id; the question is gone
  afterwards

**Tasks**:
1. Create `src/app/api/mcqs/route.ts` — `GET` and `POST`
2. Create `src/app/api/mcqs/[id]/route.ts` — `GET`, `PUT`, and `DELETE`
3. Validate every request body with the Phase 2 schemas before touching the database
4. Call `getCloudflareContext()` exactly once per handler and pass `env.DB` into the service

**Deliverables**:
- Two route files and their colocated `route.test.ts` files, all green

**What was actually built**: the two planned route modules exposing all five CRUD handlers. Sixteen
Workers-runtime tests were written first across the collection and dynamic-id routes and confirmed
red because both `route.ts` modules were absent, while all existing 44 Workers tests remained
green. Every body is parsed and validated before obtaining the D1 binding, every handler obtains
the Cloudflare context once, and every database operation delegates to `mcq-service.ts`. In
addition to the planned status-code cases, malformed JSON returns a controlled 400 rather than
escaping as an unhandled exception. Green verification: 33 unit tests, 60 Workers tests, and the
full 93-test suite pass; `npm run lint` and `npm run build` both pass. The production build lists
`/api/mcqs` and `/api/mcqs/[id]` as dynamic routes. No dependency or configuration change was
needed.

### Phase 5: Attempts Endpoint - COMPLETED

**Objective**: Record an attempt against a question.

**Tests (write first)**, in `src/app/api/mcqs/[id]/attempts/route.test.ts` (Workers pool):
- 201 with `isCorrect: true` when the correct choice is submitted
- 201 with `isCorrect: false` when an incorrect choice is submitted
- An `isCorrect` value sent in the request body is ignored — the stored value is derived from the
  choice, not the client
- 400 when `choiceId` belongs to a different question
- 400 when `userId` or `choiceId` is missing
- 404 for an unknown question id
- 404 for an unknown `userId`
- Two submissions produce two rows, not one overwritten row

**Tasks**:
1. Create `src/app/api/mcqs/[id]/attempts/route.ts` — `POST`
2. Validate with `attemptSchema`, then delegate to `recordAttempt`

**Deliverables**:
- `src/app/api/mcqs/[id]/attempts/route.ts` + `route.test.ts`, all green

**What was actually built**: the planned `POST` handler with request validation before D1 access,
one Cloudflare-context lookup, and service-error mapping to 400/404/500 responses. Ten
Workers-runtime tests were written first and confirmed red because the attempts route module did
not exist, while the existing 60 Workers tests remained green. In addition to the planned cases,
an unknown `choiceId` is explicitly tested as 404 and malformed JSON returns 400. A live
PowerShell `curl.exe` smoke test then exercised register → create MCQ → submit a tampered
`isCorrect: false` claim against the correct choice → delete MCQ; the server derived
`isCorrect: true` and cleanup succeeded. Copy-pasteable cURL tests for every Phase 4–5 endpoint and
its main error cases are recorded under Manual cURL Verification. Green verification: 33 unit
tests, 70 Workers tests, and the full 103-test suite pass; `npm run lint` and `npm run build` both
pass. The production build lists `/api/mcqs/[id]/attempts` as a dynamic route. No dependency or
configuration change was needed.

### Phase 6: Browser Client and Current-User Helper - COMPLETED

**Objective**: Give the UI layer typed functions to call the API, and a user id to send.

**Tests (write first)**:

`src/lib/current-user.test.ts` (plain unit; `localStorage` stubbed):
- `setCurrentUser` then `getCurrentUser` round-trips the user
- `getCurrentUser` returns `null` when nothing is stored
- `getCurrentUser` returns `null` (and does not throw) when the stored value is malformed JSON
- `clearCurrentUser` removes it

`src/lib/mcq-client.test.ts` (plain unit; `globalThis.fetch` mocked):
- `listMcqs` returns the parsed array on 200
- `createMcq` returns the question on 201, and validates client-side before calling `fetch`
- `createMcq` maps a 400 to a validation result carrying `issues`
- `getMcq` maps a 404 to a not-found result
- `updateMcq` returns the updated question on 200
- `deleteMcq` returns success on 200 and a not-found result on 404
- `submitAttempt` returns the attempt on 201
- Every function maps a 500 to a generic server-error result without leaking the response body

**Tasks**:
1. Create `src/lib/current-user.ts` — `getCurrentUser()`, `setCurrentUser(user)`,
   `clearCurrentUser()`, backed by `localStorage` under a single namespaced key. Guard every access
   in a `try`/`catch` and a `typeof window` check so it is safe to import anywhere
2. Create `src/lib/mcq-client.ts` — `listMcqs`, `getMcq`, `createMcq`, `updateMcq`, `deleteMcq`,
   `submitAttempt`. Return typed `{ ok: true | false }` result objects, matching `auth-client.ts`;
   do not throw
3. Update `src/components/login-form.tsx` and `src/components/signup-form.tsx` to call
   `setCurrentUser` with the returned user before redirecting
4. Update `src/components/logout-button.tsx` to call `clearCurrentUser` before redirecting

**Deliverables**:
- `src/lib/current-user.ts` + `current-user.test.ts`
- `src/lib/mcq-client.ts` + `mcq-client.test.ts`
- Three updated auth components

**What was actually built**: both planned browser modules and all three auth-component updates.
Twenty unit tests were written first and confirmed red because `current-user.ts` and
`mcq-client.ts` did not exist, while all existing 33 unit tests remained green. The current-user
helper is SSR-safe, catches unavailable storage, and performs a runtime shape check rather than
blindly trusting parsed JSON. The MCQ client validates create/update/attempt inputs before fetch,
returns typed discriminated results, URL-encodes ids, handles network/unreadable responses, and
hides server details behind a generic message. Login and registration persist the returned user
before redirecting; successful logout clears it. Green verification: 53 unit tests, 70 Workers
tests, and the full 123-test suite pass; `npm run lint` and `npm run build` both pass. No dependency
or test-configuration change was needed.

### Phase 7: Question List Page - COMPLETED

**Objective**: Turn `/dashboard` into the question table.

**Tests**: no new automated tests. Every piece of logic on this page (fetching, deleting, parsing
responses) is already covered by `mcq-client.test.ts` from Phase 6; what remains is rendering and
navigation, verified manually below.

**Tasks**:
1. Add the shadcn components this page needs:
   `npx shadcn@latest add @shadcn/dropdown-menu @shadcn/alert-dialog`
2. Create `src/components/mcq-table.tsx` — client component: loads the list, renders the `Table`,
   owns the actions `DropdownMenu` and the delete `AlertDialog`
3. Rewrite `src/app/dashboard/page.tsx` to render `McqTable` plus the "New question" button,
   keeping the existing `LogoutButton` header
4. Add loading, empty, and error states
5. Redirect to `/login` when `getCurrentUser()` returns `null`

**Deliverables**:
- `src/components/mcq-table.tsx`
- Updated `src/app/dashboard/page.tsx`
- `src/components/ui/dropdown-menu.tsx`, `src/components/ui/alert-dialog.tsx` (generated)

**Manual verification**:
- [x] The table lists every question with the correct choice count
- [x] The ellipsis button opens a dropdown with Edit, Preview, and Delete
- [x] Delete asks for confirmation, then removes the row without a page reload
- [x] Cancelling the confirmation deletes nothing
- [x] The empty state renders when the bank is empty
- [x] No console errors

**What was actually built**: `McqTable` checks the stored user,
loads and renders question summaries, provides Edit/Preview/Delete actions, confirms permanent
deletion, removes a deleted row without reloading, and handles loading, error, and empty states.
The dashboard shell now includes its heading, New question action, logout, and the table. The
shadcn CLI generated `dropdown-menu` and `alert-dialog`; after explicit user approval, their
generated `cn` imports were adapted to the project's existing `@/lib/utils` helper and the
existing button component was preserved, so no dependency remained. The planned automated suite
still has 123 passing tests, lint and build pass, and the server-rendered dashboard shell was
smoke-tested over HTTP. The user then verified the seeded row, choice count, action dropdown,
cancel flow, confirmed deletion, empty state, and browser console with no reported errors.

### Phase 8: Question Editor Pages - COMPLETED

**Objective**: Create and edit questions in the browser.

**Tests**: no new automated tests, for the same reason as Phase 7 — `createMcq`/`updateMcq`
behaviour and every validation rule are already covered by `mcq-client.test.ts` and
`mcq.test.ts`. Verified manually below.

**Tasks**:
1. Add the shadcn components this page needs:
   `npx shadcn@latest add @shadcn/textarea @shadcn/radio-group`
2. Create `src/components/mcq-form.tsx` — the shared create/edit client component: name field,
   question field, dynamic choice rows (min 2, max 6), single-select correct-answer control,
   client-side Zod validation, Save and Cancel
3. Create `src/app/dashboard/mcqs/new/page.tsx` rendering `McqForm` with no initial question
4. Create `src/app/dashboard/mcqs/[id]/edit/page.tsx` — loads the question, renders `McqForm`
   pre-filled, shows a not-found message on 404
5. Navigate back to `/dashboard` on save or cancel

**Deliverables**:
- `src/components/mcq-form.tsx`
- `src/app/dashboard/mcqs/new/page.tsx`
- `src/app/dashboard/mcqs/[id]/edit/page.tsx`
- `src/components/ui/textarea.tsx`, `src/components/ui/radio-group.tsx` (generated)

**Manual verification**:
- [x] The new-question page opens with exactly two empty choice rows
- [x] "Add choice" works up to six and is then disabled
- [x] Removing rows works down to two and is then unavailable
- [x] Saving with no correct choice selected shows a form-level error and makes no network call
- [x] Saving a valid question returns to `/dashboard` with the new row visible
- [x] Editing loads existing values, and saving persists the changes
- [x] Cancel discards changes

**What was actually built**: the shared `McqForm` supports
create and edit modes, 2–6 dynamic choices, one correct-answer radio selection, field/form errors,
client-side schema validation through `mcq-client`, authenticated-user attribution, and
save/cancel navigation. The create route renders two empty choices, while the edit route loads the
question, shows loading/error states, and pre-fills the form. The shadcn textarea and radio-group
components were generated using the Phase 7 compatibility decision: reuse `@/lib/utils` and remove
the generator's duplicate `cn` package, leaving package files unchanged. Per plan, no new tests
were added; all 123 existing tests, lint, and build pass. The production build includes the static
new route and dynamic edit route, and both route shells passed HTTP smoke checks. The user then
verified choice minimum/maximum controls, no-correct-answer validation without a network request,
create, prefilled edit, persisted changes, cancel-without-save, and no browser console errors.

### Phase 9: Question Preview Page - COMPLETED

**Objective**: Answer a question as a learner and record the attempt.

**Tests**: no new automated tests — `submitAttempt` is covered in Phase 6 and the server-side
correctness rule in Phase 5. Verified manually below.

**Tasks**:
1. Create `src/app/dashboard/mcqs/[id]/preview/page.tsx` — loads the question, renders it with a
   `RadioGroup` of choices, hides correctness until submission
2. Submit posts an attempt and displays the result, revealing the correct choice
3. Add "Try again" (resets selection, allows another recorded attempt) and a link back to
   `/dashboard`

**Deliverables**:
- `src/app/dashboard/mcqs/[id]/preview/page.tsx`

**Manual verification**:
- [x] Choices render in the authored order with no correctness hint before submitting
- [x] Submit is disabled until a choice is selected
- [x] A correct answer reports correct; an incorrect answer reports incorrect and reveals the right one
- [x] Each submission adds a row to `mcq_attempts`
  (`npx wrangler d1 execute DB --local --command "SELECT * FROM mcq_attempts"`)
- [x] Deleting the question afterwards also removes its attempt rows

**What was actually built**: the preview route
loads the selected question, redirects when no current user is stored, preserves authored choice
order, disables submission until a choice is selected, and hides all correctness indicators before
submission. It records attempts through `submitAttempt`, displays correct/incorrect feedback,
highlights the stored correct answer, marks an incorrect selected answer, supports repeated
attempts through Try again, and links back to the dashboard. Per plan, no new tests were added; all
123 existing tests and lint pass. The production build passes and lists the preview route as
dynamic, and its server-rendered shell passed an HTTP smoke check. The user verified hidden
correctness, disabled submission, incorrect and correct feedback, correct-answer highlighting, Try
again, and no browser console errors. Wrangler 4.128.0 then confirmed two distinct local-D1 attempt
rows (one correct and one incorrect); after the user deleted the question through the dashboard,
the same query returned `attempt_count: 0`, confirming the foreign-key cascade.

### Phase 10: Continuous Bugfix and Feature Development - IN PROGRESS

**Objective**: Provide a permanent, continuously reviewed phase for small defects, usability
improvements, and incremental features discovered while exercising the completed application.

**Initial backlog**:
1. Replace the Next.js starter home page with a welcome page containing Login and Register links.
2. Display `Welcome, <username>` in the dashboard header using the Phase 6 current-user helper.
3. Redirect successful logout to the home page instead of the login page.

#### September 8, 2026 — Welcome Home Page (COMPLETE)

**Expected behaviour**: `/` presents the MCQ Test Bank as the product entry point instead of
showing create-next-app content. It has prominent Login and Register links, uses the existing
design-system primitives, remains responsive, and stays statically generated.

**Acceptance criteria**:
- [x] The page introduces the MCQ Test Bank and its authoring/preview purpose
- [x] Login navigates to `/login`; Register navigates to `/register`
- [x] No Next.js logos, starter instructions, or external starter links remain
- [x] The layout works at mobile and desktop widths with no browser console errors
- [x] `npm run test`, `npm run lint`, and `npm run build` pass

**Test approach**: presentation-only change; no component-test framework is installed. Verify
link destinations and responsive rendering manually, verify the rendered HTML over HTTP, and
confirm static generation in the production build.

**What was actually built**: the server-rendered home page now
uses the existing Button and Card primitives for a responsive product header, introduction, Login
and Register calls to action, and concise authoring/preview feature cards. All starter images,
instructions, and external links were removed. The rendered HTML smoke check found the `/login`
and `/register` destinations and no starter content. All 123 tests and lint pass; the production
build passes and confirms `/` remains statically generated. The user reviewed the implementation
and confirmed it is correct.

#### September 8, 2026 — Dashboard Username Greeting (COMPLETE)

**Expected behaviour**: after successful login or registration, `/dashboard` displays
`Welcome, <username>` using the validated user stored by the Phase 6 current-user helper. Missing
or malformed storage must not display stale identity and must redirect to `/login`. The MCQ Test
Bank heading is centered, while the large welcome message is aligned to the left. The New question
action belongs in the dashboard content above the table, not in the header.

**Acceptance criteria**:
- [x] The dashboard header displays the exact stored username as `Welcome, <username>`
- [x] The MCQ Test Bank heading is centered and the large welcome message is left-aligned
- [x] The header contains logout but not New question; New question appears above the table
- [x] Both login and registration flows produce the greeting
- [x] Missing or malformed current-user storage redirects to `/login` without showing stale identity
- [x] The existing question table, New question action, and logout remain functional
- [x] `npm run test`, `npm run lint`, and `npm run build` pass

**Test approach**: reuse the unit-tested `getCurrentUser()` storage boundary. No component-test
framework is installed, so manually verify login, registration, malformed/cleared storage,
responsive rendering, and the browser console.

**What was actually built**: a new client-side
`DashboardHeader` reads the username through `useSyncExternalStore`, using `null` for the server
snapshot so no identity is rendered before browser storage is validated. A side-effect-only
redirect sends missing or malformed storage to `/login`; valid storage renders
`Welcome, <username>` while preserving existing dashboard actions. The first implementation
used synchronous state inside an effect and failed the React 19 lint rule; replacing it with the
external-store snapshot resolved the issue.
The first browser review requested a layout correction: keep the product heading centered but
move the prominent welcome message to the left. It also exposed a Base UI accessibility warning:
Buttons rendered as Next.js links still had `nativeButton=true`. The layout was corrected and every
link-rendered Button was changed to `nativeButton={false}` so Base UI expects anchor semantics on
the home, dashboard, empty, edit-error, and preview screens. After these corrections, all 123
tests, lint, and the production build pass. A subsequent review moved New question out of the
header and into the content area above the table. The user approved the final left/center/right
header alignment, relocated action, and console-warning fix.

#### September 8, 2026 — Logout Returns Home (PENDING)

**Expected behaviour**: after the logout API succeeds, local current-user storage is cleared and
the browser navigates to `/`, where the user can choose Login or Register. Failed logout requests
remain on the dashboard and continue to show the existing error.

**Acceptance criteria**:
- Successful logout clears `ai-sprint:current-user`
- Successful logout navigates to `/`, not `/login`
- The welcome home page renders after logout
- Failed logout retains the current error behaviour
- `npm run test`, `npm run lint`, and `npm run build` pass

**Test approach**: update the existing logout component navigation after the successful
`logoutUser()` result. Manually verify dashboard → logout → home navigation and confirm the cleared
storage redirects a direct `/dashboard` visit to `/login`.

**Continuous review protocol**:
1. Keep a dated backlog under this phase. Add each newly reported bug or feature before changing
   implementation code, including expected behaviour and acceptance criteria.
2. Work on one backlog item at a time. For logic or regressions, write and observe a failing test
   first. For presentation-only changes where no component-test framework exists, document the
   manual verification instead of adding a hollow test or an unapproved dependency.
3. Run `npm run test`, `npm run lint`, and `npm run build` for every iteration.
4. Record what was actually built, verification results, and any troubleshooting notes in this
   phase after every iteration.
5. Stop for user review and approval after every iteration. Commit and push only the approved files
   to the current branch using a phase-numbered message such as
   `fix(phase-10): correct <behaviour>` or `feat(phase-10): add <capability>`.
6. Keep this phase **IN PROGRESS** while its backlog has active items. Mark an individual dated
   backlog entry complete without closing the phase permanently; future entries may reopen active
   work.

**Tests for the initial backlog**:
- Home page: no new automated component test. It is static presentation and navigation; verify the
  two link destinations manually and verify static generation through `npm run build`.
- Dashboard greeting: reuse the tested `getCurrentUser()` boundary from Phase 6. Manually verify
  the visible username after both login and registration, plus redirect behaviour when storage is
  absent or malformed.
- Logout destination: reuse the tested logout API client and manually verify that a successful
  logout clears current-user storage and lands on `/`.

**Deliverables for the initial backlog**:
- Updated `src/app/page.tsx`
- Updated dashboard header component/page from Phase 7
- Updated `src/components/logout-button.tsx`
- Updated acceptance criteria and dated review notes in this phase

**Manual verification for the initial backlog**:
- `/` contains no Next.js starter content and visibly offers Login and Register actions
- Login opens `/login`; Register opens `/register`
- After login or registration, `/dashboard` displays the exact stored username in
  `Welcome, <username>`
- Clearing or corrupting current-user storage does not display stale identity and redirects to
  `/login`
- Successful logout lands on `/` and a subsequent direct `/dashboard` visit redirects to `/login`
- No console errors at `/` or `/dashboard`

---

## Technical Implementation Details

**Note**: Phases 1–9 are implemented. Fill in "What was actually built" under each later phase as
it lands, matching how `register-login-logout_prd.md` records deviations from plan.

### Key Files

New:

- `migrations/0002_create_mcq_tables.sql` - the three MCQ tables and their indexes (Phase 1)
- `test/mcq-tables.test.ts` - schema, foreign key, and cascade tests (Phase 1)
- `src/lib/schemas/mcq.ts` (+ `.test.ts`) - Zod schemas shared by API and forms (Phase 2)
- `src/lib/services/mcq-service.ts` (+ `.test.ts`) - the only module allowed to query the MCQ
  tables; takes `db: D1Database` as its first parameter (Phase 3)
- `src/app/api/mcqs/route.ts` (+ `route.test.ts`) - `GET` list, `POST` create (Phase 4)
- `src/app/api/mcqs/[id]/route.ts` (+ `route.test.ts`) - `GET`, `PUT`, `DELETE` one (Phase 4)
- `src/app/api/mcqs/[id]/attempts/route.ts` (+ `route.test.ts`) - `POST` an attempt (Phase 5)
- `src/lib/current-user.ts` (+ `.test.ts`) - `localStorage`-backed current user (Phase 6)
- `src/lib/mcq-client.ts` (+ `.test.ts`) - browser fetch wrappers (Phase 6)
- `src/components/mcq-table.tsx` - the question list, actions dropdown, delete dialog (Phase 7)
- `src/components/mcq-form.tsx` - shared create/edit form (Phase 8)
- `src/app/dashboard/mcqs/new/page.tsx` - create page (Phase 8)
- `src/app/dashboard/mcqs/[id]/edit/page.tsx` - edit page (Phase 8)
- `src/app/dashboard/mcqs/[id]/preview/page.tsx` - preview and attempt page (Phase 9)
- `src/components/ui/dropdown-menu.tsx`, `alert-dialog.tsx` (Phase 7), `textarea.tsx`,
  `radio-group.tsx` (Phase 8) - generated by the shadcn CLI; do not hand-edit

Modified:

- `src/app/dashboard/page.tsx` - placeholder replaced by the question list (Phase 7)
- `src/components/login-form.tsx`, `signup-form.tsx` - persist the user on success (Phase 6)
- `src/components/logout-button.tsx` - clear the stored user (Phase 6)

Unchanged but relevant:

- `vitest.config.mts` / `vitest.workers.config.mts` - existing globs already cover every new test
  file; **no config change should be needed**. If one turns out to be, record why here.

### Implementation Patterns

Validation (`src/lib/schemas/mcq.ts`) — the refinement is what enforces a single correct answer:

```typescript
export const mcqChoiceSchema = z.object({
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean(),
});

export const mcqChoicesSchema = z
  .array(mcqChoiceSchema)
  .min(2, "A question needs at least 2 choices")
  .max(6, "A question can have at most 6 choices")
  .refine((choices) => choices.filter((c) => c.isCorrect).length === 1, {
    message: "Exactly one choice must be marked correct",
  });

export const createMcqSchema = z.object({
  name: z.string().trim().min(1).max(200),
  question: z.string().trim().min(1).max(2000),
  userId: z.string().min(1),
  choices: mcqChoicesSchema,
});
```

Service (`src/lib/services/mcq-service.ts`) — `db` is a parameter, and `is_correct` is converted at
this boundary so nothing above it deals with SQLite's integer booleans:

```typescript
export async function createMcq(db: D1Database, input: CreateMcqInput): Promise<Mcq> {
  const id = crypto.randomUUID();

  const statements = [
    db
      .prepare("INSERT INTO mcqs (id, name, question, created_by_user_id) VALUES (?1, ?2, ?3, ?4)")
      .bind(id, input.name.trim(), input.question.trim(), input.userId),
    ...input.choices.map((choice, position) =>
      db
        .prepare(
          "INSERT INTO mcq_choices (mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4)"
        )
        .bind(id, choice.text.trim(), choice.isCorrect ? 1 : 0, position)
    ),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    rethrowAsMcqUserNotFoundError(error);
  }

  const mcq = await getMcqById(db, id);
  if (!mcq) throw new Error("Failed to create question");
  return mcq;
}
```

The update strategy that keeps choice ids — and therefore attempt history — intact:

```typescript
// Existing rows are reused position-by-position instead of being deleted and reinserted.
// Trailing rows are removed *before* the writes so a shrink-then-grow never collides with
// the UNIQUE (mcq_id, position) constraint.
const existing = await getChoiceRows(db, mcqId); // ordered by position

const statements = [
  db.prepare("DELETE FROM mcq_choices WHERE mcq_id = ?1 AND position >= ?2")
    .bind(mcqId, input.choices.length),
  ...input.choices.map((choice, position) => {
    const row = existing[position];
    return row
      ? db.prepare(
          "UPDATE mcq_choices SET choice_text = ?1, is_correct = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3"
        ).bind(choice.text.trim(), choice.isCorrect ? 1 : 0, row.id)
      : db.prepare(
          "INSERT INTO mcq_choices (mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4)"
        ).bind(mcqId, choice.text.trim(), choice.isCorrect ? 1 : 0, position);
  }),
  db.prepare("UPDATE mcqs SET name = ?1, question = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3")
    .bind(input.name.trim(), input.question.trim(), mcqId),
];

await db.batch(statements);
```

Attempt correctness is read from the database, never from the request:

```typescript
export async function recordAttempt(
  db: D1Database,
  mcqId: string,
  input: { userId: string; choiceId: string }
): Promise<Attempt> {
  const result = await db
    .prepare("SELECT * FROM mcq_choices WHERE id = ?1 AND mcq_id = ?2")
    .bind(input.choiceId, mcqId)
    .all<ChoiceRow>();

  const choice = result.results[0];
  if (!choice) throw new ChoiceNotForMcqError();

  const isCorrect = choice.is_correct === 1;
  // ...insert the attempt with the derived isCorrect, then return it
}
```

A dynamic route handler (`src/app/api/mcqs/[id]/route.ts`) — note that route params are a promise
in Next.js 16:

```typescript
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { env } = await getCloudflareContext({ async: true });

  const deleted = await deleteMcq(env.DB, id);
  if (!deleted) {
    return Response.json({ error: { message: "Question not found" } }, { status: 404 });
  }

  return Response.json({ success: true });
}
```

The current-user helper — defensive because `localStorage` is unavailable during SSR and can hold
anything:

```typescript
const STORAGE_KEY = "ai-sprint:current-user";

export function getCurrentUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}
```

### Important Notes

- **Every MCQ query goes through `mcq-service.ts`.** No route handler, page, or component calls
  `env.DB` for MCQ data.
- **Numbered placeholders only** (`?1`, `?2`, …) and read `result.results[0]` rather than
  `.first()`, per `.cursor/rules/d1.mdc`.
- **`db.batch()` is how multi-statement writes stay atomic** in D1. Creating or updating a question
  must never leave a question row with the wrong number of choices.
- **Order matters in the update batch.** Delete the trailing positions *first*. Writing new rows
  before removing old ones can transiently violate `UNIQUE (mcq_id, position)` even though the end
  state is valid.
- **Never trust `isCorrect` from a request body on an attempt.** Derive it from the stored choice.
  A test in Phase 5 asserts this specifically.
- **The `userId` in a request body is unverified.** Treat it as a data field, not an identity claim,
  until sessions exist. Do not add authorization checks on top of it that imply otherwise — a check
  that can be bypassed by editing a JSON body is worse than a documented gap.
- **`is_correct` is `0`/`1` in the database and `boolean` everywhere above the service.** Convert in
  exactly one place.
- **Do not hand-edit files in `src/components/ui/`.** They are generated by the shadcn CLI; adjust
  through props and Tailwind classes with `cn()` instead, per `.cursor/rules/shadcn.mdc`.
- **Add shadcn components with the `@shadcn/` namespace** (`npx shadcn@latest add @shadcn/select`).
  A bare name silently does nothing. If a component produces no files it does not exist for the
  Base UI base — find the equivalent rather than assuming the command failed.
- **Never apply a migration with `--remote`.**

---

## Acceptance Criteria

Database and service:

- [x] `0002_create_mcq_tables.sql` applies cleanly with `npx wrangler d1 migrations apply DB --local`
- [x] All three tables exist with the columns, foreign keys, and indexes specified above
- [x] A question cannot be created with a `created_by_user_id` that is not in `users`
- [x] Deleting a question removes its choices and its attempts
- [x] Two choices on the same question cannot share a `position`
- [x] Editing a question's text preserves the ids of choices at positions that still exist, so
      existing attempt rows survive
- [x] All MCQ database access goes through `src/lib/services/mcq-service.ts`

API:

- [x] `GET /api/mcqs` returns every question with an accurate choice count, and an empty array when
      the bank is empty
- [x] `POST /api/mcqs` creates a question with 2–6 choices and returns it with its choices
- [x] Creating or updating with fewer than 2, more than 6, zero-correct, or multiple-correct choices
      returns 400 with field-level detail
- [x] `GET /api/mcqs/[id]` returns the question with choices in position order; 404 for an unknown id
- [x] `PUT /api/mcqs/[id]` replaces name, question, and the full choice set
- [x] `DELETE /api/mcqs/[id]` returns success and the question is gone; 404 for an unknown id
- [x] `POST /api/mcqs/[id]/attempts` records an attempt with server-derived correctness
- [x] An `isCorrect` value supplied in an attempt request body is ignored
- [x] Submitting a `choiceId` from a different question returns 400
- [x] Every route handler validates its body with a Zod schema before touching the database

User interface:

- [ ] `/` renders a welcoming MCQ test-bank page with working Login and Register links
- [ ] `/` no longer displays Next.js starter logos, instructions, or external starter links
- [ ] `/dashboard` displays `Welcome, <username>` using the stored current user
- [ ] Missing or malformed current-user storage never displays stale identity and redirects to
      `/login`
- [x] `/dashboard` lists all questions in a shadcn `Table` with name, question, choice count, and
      created date
- [x] Each row has a vertical-ellipsis actions button opening a dropdown with Edit, Preview, and
      Delete
- [x] Delete asks for confirmation and removes the row from the table on success
- [x] A "New question" button navigates to `/dashboard/mcqs/new`
- [x] The new-question page starts with two choice rows, allows adding up to six, and allows
      removing back down to two
- [x] Exactly one choice can be marked correct; saving without one shows an error and makes no
      network call
- [x] Save persists and returns to `/dashboard`; Cancel returns without saving
- [x] The edit page pre-fills existing values and persists changes
- [x] Preview renders the question without revealing the answer, records an attempt on submit, and
      then shows whether it was correct
- [x] The empty state renders when no questions exist
- [x] No console errors on any of the four screens

Process:

- [x] Every phase with automated tests had them written and observed failing (red) before its
      implementation existed, and passing (green) after
- [x] `npm run test` passes with zero failures
- [x] `npm run lint` and `npm run build` both pass
- [x] The D1-backed tests run against a real local D1 with this project's actual migrations applied

---

## Success Metrics

This feature still has no external users, so the metrics are engineering checks plus the first
real usage signals the attempts table makes possible.

| Metric | Target | How Measured |
|--------|--------|---------------|
| Acceptance criteria pass rate | 100% | Verify each checkbox above before marking this PRD complete |
| Test suite result | 0 failures | `npm run test` exit code 0 |
| Lint and build | Both clean | `npm run lint` and `npm run build` exit code 0 |
| Local migration apply | Exit code 0 | `npx wrangler d1 migrations apply DB --local` |
| Questions with an invalid choice count | 0 | `SELECT mcq_id, COUNT(*) c FROM mcq_choices GROUP BY mcq_id HAVING c < 2 OR c > 6` returns no rows |
| Questions without exactly one correct choice | 0 | `SELECT mcq_id, SUM(is_correct) s FROM mcq_choices GROUP BY mcq_id HAVING s != 1` returns no rows |
| Orphaned choices or attempts | 0 | Left-join each child table to its parent and count nulls |
| End-to-end authoring time | Under 2 minutes for a 4-choice question | Time a manual run from clicking "New question" to seeing the row in the table |
| Attempts recorded during manual verification | At least 1 correct and 1 incorrect | `SELECT is_correct, COUNT(*) FROM mcq_attempts GROUP BY is_correct` |

---

## Dependencies

### External Dependencies

- **Cloudflare D1** - already provisioned as binding `DB` in `wrangler.jsonc` (auth phase, Phase 1).
  This feature adds tables to the same database; no new binding, and no `cf-typegen` run needed.

### Internal Dependencies

- **`users` table** - `mcqs.created_by_user_id` and `mcq_attempts.user_id` are foreign keys to it.
  MCQ tests must create a user before creating a question.
- **`src/lib/auth-client.ts`** - Phase 6 extends the register and login flows to persist the
  returned user, and logout to clear it.
- **`src/app/dashboard/page.tsx`** - the placeholder from the auth PRD's Phase 6 is replaced here.
- **Existing Vitest setup** - `vitest.config.mts`, `vitest.workers.config.mts`,
  `test/apply-migrations.ts`, and `test/env.d.ts` are reused unchanged.

### New npm Dependencies

**None.** `zod`, `vitest`, `@cloudflare/vitest-plugin`, `lucide-react`, and `@base-ui/react` are all
already installed. The four shadcn components added in Phases 7 and 8 are source files copied into
`src/components/ui/` by the CLI — they are not packages, and they build on the `@base-ui/react`
already in `package.json`.

If a needed component turns out not to exist for the Base UI base, raise it before reaching for a
third-party package, per `AGENTS.md`.

### Environment Variables

None.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `userId` arrives from the client and is unverified, so anyone can create, edit, delete,
  or attempt questions as any user by editing a request body.
  **Mitigation**: Accepted for this phase by explicit product direction, and documented in three
  places so it cannot be forgotten. The foreign key guarantees the id at least belongs to a real
  user. The endpoints are structured so that when sessions ship, `userId` is dropped from the body
  and read from the session instead — a change confined to the route handlers. **Do not treat this
  application as safe to expose to untrusted users until that lands.**
- **Risk**: Editing a question could destroy its attempt history, if choices were replaced by
  deleting and reinserting rows (attempts cascade from `choice_id`).
  **Mitigation**: The update strategy reuses existing choice rows by position, so ids survive. A
  Phase 3 test asserts specifically that an attempt row is still present after an edit.
- **Risk**: `UNIQUE (mcq_id, position)` can be violated transiently during an update even when the
  final state is valid, depending on statement order within the batch.
  **Mitigation**: Deletes for trailing positions come first in the batch. Phase 3 tests both the
  grow and the shrink case.
- **Risk**: "Exactly one correct choice" is enforced only in application code, so a bad write
  through some future path could produce a question with no correct answer.
  **Mitigation**: The service is the sole writer, and a Success Metrics query detects violations.
  If a second writer ever appears, add a database trigger.
- **Risk**: Foreign key errors from D1 surface as generic `Error` messages, and parsing them by
  string — as `user-service.ts` already does for unique constraints — is brittle.
  **Mitigation**: Isolate the parsing in one helper in the service, covered by its own test, so a
  wording change in D1 breaks a test rather than production behaviour.
- **Risk**: `dropdown-menu`, `alert-dialog`, `radio-group`, or `textarea` may not exist in the
  `base-nova` Base UI registry, and the CLI fails silently by generating no files.
  **Mitigation**: Verify files actually appear under `src/components/ui/` after each `add` command
  before building on them. Fallbacks: the installed `dialog` covers delete confirmation, and native
  radio inputs styled with theme tokens cover single-select. Record whatever happens in the
  Troubleshooting Guide.
- **Risk**: `localStorage` is unavailable during server rendering, so a careless import crashes the
  page.
  **Mitigation**: `current-user.ts` guards on `typeof window` and wraps every access in
  `try`/`catch`; the pages that use it are client components.

### User Experience Risks

- **Risk**: A teacher fills in a long question, hits Save, and loses everything to a validation
  error or a failed request.
  **Mitigation**: Validate client-side before the network call, keep all form state on failure, and
  never navigate away except on success.
- **Risk**: Delete is permanent and one dropdown item away from Edit.
  **Mitigation**: An `AlertDialog` confirmation naming the question, with the destructive action
  styled distinctly. Undo is explicitly out of scope.
- **Risk**: "Preview" reads as read-only, but it records an attempt against the teacher's own
  account — which will skew any future analytics.
  **Mitigation**: Word the page so it is clear a response is being recorded. If this becomes a real
  problem for reporting, add a `is_preview` flag to `mcq_attempts` in a later phase rather than
  silently discarding the row.
- **Risk**: The list grows past what one unpaginated table can comfortably show.
  **Mitigation**: Accepted for now — a shared bank is small at this stage. Pagination, search, and
  filtering are listed as out of scope so the gap is visible rather than surprising.

---

## Troubleshooting Guide

### Corrupt generated dev route types break the production build
**Problem**: The first `npm run build` compiled the application but failed during TypeScript with
`Unexpected keyword or identifier` in `.next/dev/types/routes.d.ts`. Removing that file exposed a
second malformed generated import in `.next/dev/types/validator.ts`.
**Cause**: Stale generated files under `.next/dev/types/` were corrupt. The root TypeScript config
includes `.next/dev/types/**/*.ts`, so the production build type-checked those stale development
artifacts even though Phase 1 did not change any application TypeScript.
**Solution**: Delete the generated files in `.next/dev/types/` (`routes.d.ts`, `validator.ts`, and
`cache-life.d.ts`) rather than editing them, then rerun `npm run build`. Next regenerated its
production types and the build passed. No source file needed a change.
**Code Reference**: `tsconfig.json:39-40`

### PowerShell corrupts JSON passed to `curl.exe --data-raw`
**Problem**: The first live endpoint smoke test returned invalid-JSON and validation errors even
though `ConvertTo-Json` printed a valid request body.
**Cause**: Passing a PowerShell string variable directly as `--data-raw $Body` caused native
argument processing to remove the JSON quotes before `curl.exe` sent it. The first generated
username also exceeded the API's 30-character limit because it used a full GUID.
**Solution**: Pipe the JSON string to cURL's standard input and use `--data-binary "@-"`. Limit the
GUID suffix to 12 characters. The corrected register → create → attempt → delete smoke test passed.
All commands under Manual cURL Verification use this working pattern.
**Code Reference**: `ai-workspace/mcq-crud_prd.md:357`

### Production build cannot unlink a generated route directory on Windows
**Problem**: After stopping the development server, `npm run build` failed with `EPERM: operation
not permitted, unlink` first for `.next/server/app/api/mcqs/[id]/attempts` and later for
`.next/server/app/dashboard/mcqs`.
**Cause**: Windows/OneDrive retained a lock on the generated route directory. Deleting only the
generated files inside it was insufficient because Next still needed to remove the directory
itself while cleaning `.next`.
**Solution**: Stop the dev-server process tree, remove the exact locked generated directory, and
rerun the build. Both retries completed successfully; restart `npm run dev` afterwards. No source
file needed a change.
**Code Reference**: `.next/server/app/` (generated; not committed)

### Current shadcn registry adds an incompatible duplicate `cn` dependency
**Problem**: Generating `dropdown-menu` and `alert-dialog` added the npm package `cn`, generated
imports from `"cn"` instead of this project's `@/lib/utils`, and prompted to overwrite the existing
shared `button.tsx` despite non-interactive flags.
**Cause**: The current remote `base-nova` registry differs from the component generation style used
to initialize this repository.
**Solution**: With explicit user approval, keep the generated shadcn components, change only their
`cn` imports to `@/lib/utils`, answer **no** to the button overwrite, remove the accidental `cn`
dependency, and regenerate `package-lock.json` with `npm install`. The package files returned to
their original state, so Phase 7 adds no dependency.
**Code Reference**: `src/components/ui/dropdown-menu.tsx:5`,
`src/components/ui/alert-dialog.tsx:6`

Two things from the auth phase are worth knowing before starting, because they will bite again:

- **Do not call `reset()` from `cloudflare:test` between tests.** It wipes the schema applied by
  `test/apply-migrations.ts`, and every test after the first fails with `no such table`. Use unique
  fixture data per test instead.
- **Test files are excluded from the root `tsconfig.json`** so `next build` never tries to
  type-check `cloudflare:test` imports. New test files under `test/` or matching `*.test.ts` are
  already covered; a test file placed somewhere else may break the build.

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
- Follow TDD strictly. For each phase, write its tests first, run them, confirm they fail for the
  right reason, then implement until green. Do not write implementation code before its test exists.
- Run `npm run test`, `npm run lint`, and `npm run build` before checking off any acceptance
  criterion or marking a phase COMPLETED. Report the actual result, not an inspection.
- Record what was *actually* built at the end of each phase, including deviations from the plan.
  `register-login-logout_prd.md` is the model for how much detail is useful.
- All MCQ table access goes through `src/lib/services/mcq-service.ts`. Never query `env.DB` for MCQ
  data from a route handler, page, or component.
- Do not add session, cookie, or token logic. It is out of scope here even though the unverified
  `userId` makes it tempting. It belongs to its own PRD.
- Do not add reporting, analytics, or an attempts UI beyond the preview page in Phase 9.
- Maintain Phase 10 as the continuously reviewed bugfix/feature backlog. Add dated entries before
  implementation, complete them one at a time, and use phase-numbered commit messages.
- After every phase that creates or changes endpoints, add and provide copy-pasteable `curl.exe`
  commands for every endpoint and its main success/error cases.
- Ask before adding any npm dependency. This feature is planned to need none.
- Never apply a migration with `--remote`. Deployment is developer-driven per phase.

---

## Current Status

**Last Updated**: September 8, 2026
**Current Phase**: Phase 10 - Continuous Bugfix and Feature Development
**Status**: Phases 1–9 COMPLETE; Phase 10 IN PROGRESS (home page and greeting complete; logout pending)
**Next Steps**: Commit and push the approved dashboard greeting iteration, then implement the
separately tracked logout-to-home backlog item.
