# GEMINI.md

This file provides guidance to Gemini when working with code in this repository.

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

# Phase 5: 게시판(Board) & 과제(Assignment) Router
/teacher/board                              ← TeacherBoard
/teacher/board/new                          ← BoardPostEditor
/teacher/board/:postId/edit                 ← BoardPostEditor
/teacher/classrooms/:classroomId/assignments/:assignmentId/edit                ← AssignmentEditor
/teacher/classrooms/:classroomId/assignments/:assignmentId/monitor             ← AssignmentMonitor
/teacher/classrooms/:classroomId/assignments/:assignmentId/monitor/:studentId  ← AssignmentWorkViewer (fullscreen)

/student/dashboard                          DashboardLayout (student only)
/student/classrooms
/student/classrooms/:id

# Study Views (Fullscreen, DashboardLayout 제외)
/student/study/:chapterId/page/:pageId          ← StudyViewer
/student/assignments/:assignmentId/page/:pageId ← Phase 5 과제 풀이 (AssignmentStudyViewer)
```

### Layouts

- **`MainLayout`** — Navbar only, for public pages.
- **`DashboardLayout`** — Navbar + sidebar. Sidebar links differ by role (teacher/student).
- **StudyViewer / AssignmentStudyViewer** intentionally outside DashboardLayout for fullscreen drawing experience.

### Data Model (Supabase)

Key patterns:

- Students join classrooms via `join_classroom_by_code(code)` RPC (not direct insert)
- Teacher uploads page images to Storage bucket `chapter-pages`; `pages.image_url` stores the public URL.
- Phase 5: `post-files` bucket for board attachments, and `chapter-pages` reused for assignment pages (`assignments/...`).
- Student notes saved as Excalidraw JSON in `student_notes.excalidraw_data` or `assignment_notes.excalidraw_data`.

## Detailed Reference Docs

For deep-dive implementation details, see the project-local docs in the `.agent` folder:

- `.agent/memory/architecture.md` — full file tree, route hierarchy, AuthContext internals, per-page business logic including Phase 5 features
- `.agent/memory/supabase-schema.md` — full SQL for all tables including assignments & boards, RLS policies, trigger, RPC, Storage RLS
- `.agent/memory/studyviewer-details.md` — DrawingToolbar tools, background image pipeline, save logic, Excalidraw CSS overrides
