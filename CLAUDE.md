# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Source of truth for structure is `.claude/PROJECT_MAP.md`. Read it first.

## Overview

**MathChois (ChoisClass)** — a math teaching platform. Teachers and students annotate
chapter/assignment pages (image / video / HTML tool backgrounds) with Excalidraw to
exchange notes, comments, and assignment work.

The core of the app is **5 annotation pages** (see the table below).

## Stack

**npm workspaces monorepo** (`mathchois`, root `type: module`, Node >= 22):

| Package | Name | Stack |
|---|---|---|
| `packages/server` | `@mathchois/server` | Fastify 5 + Drizzle ORM 0.44 + PostgreSQL (`postgres` driver) + Socket.IO 4 + JWT/Google OAuth + nodemailer. `tsx` (dev) / `tsc` (build). |
| `packages/client` | `@mathchois/client` | React 19 + Vite 7 + Tailwind 4 + React Router 7 + Excalidraw 0.18 + dnd-kit + jspdf + socket.io-client. PWA. |
| `packages/shared` | `@mathchois/shared` | Shared TS types (exported from source, not a build artifact). |

Deploy: **Railway** (`packages/server/Dockerfile`, healthcheck `/api/health`). In
production the server serves `client/dist` statically with SPA fallback.

`legacy_rails/` is an old Ruby on Rails app — **unused, do not read or modify**.

## Commands

```bash
npm run dev          # Run server (3001) + client (3000) together via concurrently
npm run dev:server   # Server only — tsx watch, port 3001
npm run dev:client   # Client only — Vite, port 3000
npm run build        # Build shared → client → server
npm run start        # Production: node dist/index.js (server serves client/dist)
npm run lint         # ESLint (client)

# DB (run inside packages/server)
npm run db:push -w @mathchois/server      # Push Drizzle schema to DB
npm run db:generate -w @mathchois/server  # Generate migration
npm run db:migrate -w @mathchois/server   # Apply migrations
npm run db:studio -w @mathchois/server    # Drizzle Studio
```

The Vite dev server (port 3000) proxies `/api` and `/socket.io` to the backend on
port 3001 — start both. E2E tests use Playwright (`@playwright/test`) in `packages/client`.

## Environment Variables

Server env lives in **`packages/server/.env`** (validated by `src/config/env.ts` with zod):

```
DATABASE_URL=postgres://...        # PostgreSQL (Railway)
JWT_SECRET=...                     # >= 16 chars
JWT_REFRESH_SECRET=...             # >= 16 chars
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
VOLUME_PATH=./local-storage        # file storage root (Railway Volume in prod)
PORT=3001
NODE_ENV=development
# SMTP (optional — password-reset email): SMTP_HOST/PORT/USER/PASS/FROM, APP_URL
```

Client env (Vite `VITE_*`, build-time): `VITE_TOOLS_ORIGIN` — the separate origin used
to serve HTML tool pages (see Annotation pages note below).

## Architecture

### Auth

Google OAuth + email/password (bcrypt). JWT access/refresh tokens, role `teacher` |
`student` (+ `isAdmin`). Server middleware: `middleware/auth.ts` (JWT),
`middleware/roleGuard.ts` (`requireRole`). Client auth state in
`src/contexts/AuthContext.jsx`; `src/components/ProtectedRoute.jsx` guards routes
(not logged in → `/`; no role → `/choose-role`; wrong role → own dashboard).

### Core feature: the 5 annotation pages

All store Excalidraw JSON (`excalidraw_data`), auto-save with 1500ms debounce, and
sync in real time over Socket.IO.

| # | Type | Client | Server route (PUT/GET) | Table |
|---|---|---|---|---|
| ① | Student notes | `pages/Study/StudyViewer.jsx` | `/api/notes/student/:pageId` | `student_notes` |
| ② | Teacher notes | `pages/Study/TeacherStudyViewer.jsx` | `/api/notes/teacher/:pageId` | `teacher_notes` |
| ③ | Teacher comment on a student | `pages/Monitor/StudentWorkViewer.jsx` (student views in StudyViewer via `/api/comments/:pageId/for-student`) | `/api/comments/:pageId/:studentId` | `teacher_student_comments` |
| ④ | Student assignment notes | `pages/Assignment/AssignmentStudyViewer.jsx` | `/api/assignment-notes/:assignmentId/:pageId` | `assignment_notes` |
| ⑤ | Teacher assignment comment | `pages/Assignment/AssignmentWorkViewer.jsx` (student views in AssignmentStudyViewer) | `/api/assignment-comments/:pageId/:studentId` | `assignment_teacher_comments` |

- Server handlers: notes ①②④ → `routes/notes.ts`; comments ③⑤ → `routes/comments.ts`.
  DB logic concentrated in `services/note.service.ts`.
- Socket handlers: `socket/handlers/notes.ts` (①②), `comments.ts` (③), `assignments.ts` (④⑤).
- For ③ and ⑤ the teacher's **write** screen (WorkViewer) and the student's **read**
  screen (StudyViewer) are separate components sharing the same table.

### Layouts & fullscreen viewers

- `MainLayout` — Navbar only (public pages).
- `DashboardLayout` — Navbar + role-specific sidebar (authenticated).
- All viewers (StudyViewer / TeacherStudyViewer / StudentWorkViewer / Assignment*) are
  intentionally **outside** DashboardLayout for a fullscreen drawing/S-Pen experience.

### Data model (Drizzle: `packages/server/src/db/schema.ts`)

Tables: `profiles`, `classrooms`, `classroom_members`, `chapters`, `pages`
(`imageUrl`/`videoUrl`/**`htmlUrl`**/position), the 5 annotation tables above,
`posts`/`post_files`/`post_classrooms` (board), `assignments`/`assignment_pages`/
`assignment_submissions`/`assignment_submission_files`. Migrations via Drizzle Kit;
additionally `db/startupMigrate.ts` runs idempotent DDL on boot (e.g. ensures the
`pages.html_url` column).

## Gotchas / non-obvious patterns

- **HTML tool pages are served from a separate origin** (`VITE_TOOLS_ORIGIN`, see
  `lib/toolUrl.js`). A same-origin `sandbox` iframe becomes an opaque (`'null'`) origin,
  which breaks the tool's internal `postMessage` / blob workers. The server sets
  `Content-Security-Policy: frame-ancestors` (app origin only) on `text/html` responses
  and strips helmet's `X-Frame-Options` via `reply.raw.removeHeader` (plain
  `reply.removeHeader` does not work on the raw response). See `routes/storage.ts`.
- **Pen/eraser input** is custom-handled: `hooks/useExcalidrawTouch.js`,
  `hooks/useScribbleErase.js` (S-Pen barrel button, scribble-to-erase, palm rejection).
- File storage uses `VOLUME_PATH`; buckets: `chapter-pages`, `chapter-tools` (HTML only),
  `submission-files`, post attachments. Served via `/api/files/*`.

## Detailed reference

- **`.claude/PROJECT_MAP.md`** — full folder structure, route table (client + server),
  data model, dependencies. Keep this current after structural changes.
