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
| `packages/server` | `@mathchois/server` | Fastify 5 + Drizzle ORM 0.45 + PostgreSQL (`postgres` driver) + Socket.IO 4 + JWT/Google OAuth + nodemailer. `tsx` (dev) / `tsc` (build). |
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

Claude Code tooling: project MCP servers (`playwright`, `chrome-devtools`) live in `.mcp.json`
and start through `.claude/mcp/launch.mjs` (cross-platform; adds headless/Chromium flags in cloud
sessions). Cloud sessions run `.claude/hooks/session-start.sh` (npm install + Chromium env).
Project skills are committed under `.claude/skills/`. Details in `.claude/PROJECT_MAP.md`.

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
# FRAME_ANCESTORS (optional) — extra origins allowed to frame HTML tool pages (space-separated)
```

Production domain is **`https://class.chois.pro`** (moved from `class.chois.ai.kr`). The
HTML-tool `frame-ancestors` CSP is built in `routes/storage.ts` from that origin + `APP_URL`
+ `FRAME_ANCESTORS`; if the domain changes again, update `APP_ORIGIN` there or set the env var.

Client env (Vite `VITE_*`, build-time): `VITE_TOOLS_ORIGIN` — the separate origin used
to serve HTML tool pages (see Annotation pages note below).

## Architecture

### Auth

Google OAuth + email/password (bcrypt). JWT access/refresh tokens, role `teacher` |
`student` (+ `isAdmin`). Server middleware: `middleware/auth.ts` (JWT),
`middleware/roleGuard.ts` (`requireRole`). Client auth state in
`src/contexts/AuthContext.jsx`; `src/components/ProtectedRoute.jsx` guards routes
(not logged in → `/`; wrong role → own dashboard).

**Roles are decided by the server, never chosen by the user.** Only emails on the admin-managed
`allowed_teachers` list are teachers; every other signup (Google or email) is a student. Admins are
always teachers (teacher + admin). `services/access.service.ts` `applyAccessRules` re-evaluates this on every
login and token refresh (rules in `@mathchois/shared` `auth/access.ts` `resolveRole`), so removing a
teacher from the list takes effect within 15 minutes. Teachers can pre-register student emails per
classroom (`classroom_invites`); when that email signs in as a student it is moved into
`classroom_members` without a class code. Admin UI: AdminPanel [교사 등록] tab; teacher UI: classroom
[학생] tab. Spec: `docs/superpowers/specs/2026-10-28-teacher-allowlist-and-student-preregistration-design.md`.

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

Beyond annotation, the teacher sidebar also has shared libraries: **문제은행** (`problems`),
**시각화자료** (standalone HTML tools, `visualizations`) and **영상자료** (uploaded videos,
`videos` + per-classroom `classroom_videos` with threaded `video_comments`; see
`docs/superpowers/specs/2026-10-17-video-library-design.md`). Library videos can carry per-language
subtitles (`video_subtitles`; .srt/.vtt normalized to WebVTT by the shared parser in
`shared/src/subtitles/`, drawn by `VideoPlayer` as its own overlay; see
`docs/superpowers/specs/2026-10-22-video-subtitles-design.md`).
A classroom's [챕터] and [영상] tabs (ClassroomDetail) can group its chapters and videos into teacher-made **units** (단원, shown like
YouTube playlists): `units` table, `chapters.unit_id`/`classroom_videos.unit_id` (NULL = unassigned), address
`?tab=…&unit=<id|none>`, hide-from-students only affects lists (detail URLs stay open), UI in `components/units/`
(see `docs/superpowers/specs/2026-10-25-classroom-units-design.md`).

- **⑥ Whiteboard (모둠 공유 보드)** — a `pages.page_type = 'whiteboard'` page gives every
  classroom group its own shared Excalidraw board (`whiteboard_groups`, keyed by page + classroom +
  group). Unlike ①–⑤ it syncs **per element** through `socket/handlers/whiteboard.ts` (room
  `wb:{boardId}`, server-authoritative in-memory scene, merge rules in `shared/src/whiteboard/merge.ts`).
  Client: `components/whiteboard/WhiteboardCanvas.jsx`, student `pages/Whiteboard/StudentWhiteboardViewer.jsx`,
  teacher `pages/Whiteboard/TeacherWhiteboardPage.jsx` (grid / single + settings). Templates (34) in
  `lib/whiteboardTemplates.js`. Spec: `docs/superpowers/specs/2026-10-18-whiteboard-design.md`.
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

Tables: `profiles`, `allowed_teachers` (teacher allowlist), `classrooms`, `classroom_members`, `classroom_invites`
(pre-registered student emails), `chapters`, `pages`
(`imageUrl`/`videoUrl`/**`htmlUrl`**/`pageType`/`whiteboardTemplate`/position), the 5 annotation tables above,
`classroom_groups`/`classroom_group_members` (default groups), `whiteboard_page_settings`/
`whiteboard_groups`/`whiteboard_group_members` (shared boards),
`posts`/`post_files`/`post_classrooms` (board), `assignments`/`assignment_pages`/
`assignment_submissions`/`assignment_submission_files`, `videos`/`classroom_videos`/`video_comments`/
`video_subtitles` (video library), `units` (classroom units; `chapters.unit_id`, `classroom_videos.unit_id`). Migrations via Drizzle Kit;
additionally `db/startupMigrate.ts` runs idempotent DDL on boot (e.g. ensures the
`pages.html_url` column).
`classrooms.color` — one of six named colors (coral/mustard/sage/sky/lavender/rose); backfilled at boot by
`startupMigrate`; rules in `@mathchois/shared` `classroom/color.ts`.

## Gotchas / non-obvious patterns

- **HTML tool pages are served from a separate origin** (`VITE_TOOLS_ORIGIN`, see
  `lib/toolUrl.js`). A same-origin `sandbox` iframe becomes an opaque (`'null'`) origin,
  which breaks the tool's internal `postMessage` / blob workers. The server sets
  `Content-Security-Policy: frame-ancestors` (app origin only) on `text/html` responses
  and strips helmet's `X-Frame-Options` via `reply.raw.removeHeader` (plain
  `reply.removeHeader` does not work on the raw response). See `routes/storage.ts`.
- **Whiteboard sync is element-level, not document-level.** Never save a whole-scene
  snapshot from a client for `whiteboard_groups`; apply remote elements with
  `updateScene({ captureUpdate: CaptureUpdateAction.NEVER })` so they stay out of local undo.
  Template application goes through `POST /api/whiteboards/groups/:gid/apply-template`, which
  only succeeds on an empty board (the server never imports Excalidraw). The server keeps board
  scenes in memory → single-instance deployment assumption.
- **Classroom detail tabs** (`pages/Classrooms/ClassroomDetail.jsx`): board, student list and dashboard are
  ledger-style tables (`components/classrooms/classroomTabs.css`, `.ledger`); the group settings card is a
  drag board (`components/whiteboard/GroupAssignmentPanel.jsx`, dnd-kit chips → desks, 모둠 수 input resizes the
  desks via `lib/groupAssign.js` `resizeGroups`). The teacher dashboard is 보기(챕터별·영상별·학생별) × 대상
  (`?view=`, `?unit=` shared with the chapter/video tabs, `?student=`); pure calculations live in
  `lib/dashboardViews.js`. [학생] tab row-end [AI 풀이 초기화] calls
  `POST /api/coaching/classrooms/:cid/students/:sid/reset` (resets quota for every page of the classroom, keeps
  attempt records). Spec: `docs/superpowers/specs/2026-10-28-classroom-tabs-tables-groups-dashboard-design.md`.
- **Icon-only buttons** use `components/common/IconButton.jsx` (`label` → `title` + `aria-label`, 44px hit area,
  variants ghost/primary/danger/danger-solid). Icon dictionary and keep-text rules:
  `docs/superpowers/specs/2026-10-20-icon-buttons-design.md`. `DrawingToolbar` keeps its own buttons.
- **Pen/eraser input** is custom-handled: `hooks/useExcalidrawTouch.js`,
  `hooks/useScribbleErase.js` (S-Pen barrel button, scribble-to-erase, palm rejection).
- File storage uses `VOLUME_PATH`; buckets: `chapter-pages`, `chapter-tools` (HTML only),
  `visualizations` (HTML only), `whiteboard-files` (raster images ≤ 2MB, students allowed), `videos` (teacher-only, uploaded through the streaming route
  `POST /api/videos/upload`, not `/api/files/upload` which buffers whole files in memory),
  `submission-files`, post attachments. Served via `/api/files/*` as a stream with HTTP Range
  support (required for `<video>` seeking).

## Detailed reference

- **`.claude/PROJECT_MAP.md`** — full folder structure, route table (client + server),
  data model, dependencies. Keep this current after structural changes.
