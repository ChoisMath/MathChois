# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on port 3000
npm run build        # Production build
npm run lint         # ESLint check

# Playwright E2E tests (requires dev server running separately)
npx playwright test
npx playwright test tests/navigation.spec.js
npx playwright test --ui
```

> Playwright uses `http://localhost:5173` as base URL. Dev server runs on port 3000, so start both separately when testing.

## Environment Variables

Create `.env.local` in the project root:

```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

## Architecture

**Stack:** React 19 + Vite + Tailwind CSS 4 + React Router 7 + Supabase + Excalidraw

### Authentication Flow

All auth state lives in `src/contexts/AuthContext.jsx` (via `useAuth()`). Login is Google OAuth only — Supabase redirects to `/auth/callback` → `OAuthCallback.jsx` → role check → dashboard. After first login, user picks `teacher` or `student` in `/choose-role`; the role is stored in the `profiles` table.

`src/components/ProtectedRoute.jsx` guards all authenticated routes:
- Not logged in → `/login`
- Logged in, no role → `/choose-role`
- Wrong role → redirect to own dashboard

### Route Structure

```
/auth/callback                              OAuthCallback   (no layout)
/  /login  /choose-role                     MainLayout      (public)

/teacher/dashboard                          DashboardLayout (teacher only)
/teacher/classrooms
/teacher/classrooms/:id
/teacher/classrooms/:classroomId/chapters
/teacher/chapters/:id/edit                  ← image upload (ChapterEditor)

/student/dashboard                          DashboardLayout (student only)
/student/classrooms
/student/classrooms/:id
/student/study/:chapterId/page/:pageId      ← fullscreen, NO layout (StudyViewer)
```

### Layouts

- **`MainLayout`** — Navbar only, for public pages.
- **`DashboardLayout`** — Navbar + sidebar. Sidebar links differ by role (teacher/student).
- **StudyViewer** intentionally outside DashboardLayout for fullscreen drawing experience.

### Data Model (Supabase)

Tables: `profiles`, `classrooms`, `classroom_members`, `chapters`, `pages`, `student_notes`

> Note: table is `pages`, not `chapter_pages`.

Key patterns:
- Students join classrooms via `join_classroom_by_code(code)` RPC (not direct insert)
- Teacher uploads page images to Storage bucket `chapter-pages`; `pages.image_url` stores the public URL
- Student notes saved as Excalidraw JSON in `student_notes.excalidraw_data`, keyed by `(student_id, page_id)`

### StudyViewer (most complex component)

`src/pages/Study/StudyViewer.jsx` — fullscreen, two modes:
1. **View mode**: shows page image
2. **Draw mode**: Excalidraw canvas with the page image embedded as a locked `image` element (`id: '__bg_image__'`). This keeps image and strokes in sync during zoom/pan.

Notes auto-save with 1500ms debounce. Background position is persisted in `excalidraw_data.bgPosition`.

## Detailed Reference Docs

For deep-dive implementation details, see the project-local docs:

- `.claude/memory/architecture.md` — full file tree, route hierarchy, AuthContext internals, per-page business logic
- `.claude/memory/supabase-schema.md` — full SQL for tables, RLS policies, trigger, RPC, Storage RLS
- `.claude/memory/studyviewer-details.md` — DrawingToolbar tools, background image pipeline, save logic, Excalidraw CSS overrides

## Supabase Dashboard Setup (one-time, manual)

The codebase is complete but the app won't work until the Supabase dashboard is configured:
1. Create all 6 tables with RLS enabled
2. Add `profiles` trigger (`on_auth_user_created`)
3. Create `join_classroom_by_code` RPC function
4. Create `chapter-pages` Storage bucket (Public) + Storage RLS policies
5. Enable Google OAuth provider (Authentication → Providers → Google)

See `.claude/memory/supabase-schema.md` for the exact SQL.
