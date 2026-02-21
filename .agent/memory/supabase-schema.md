# MathChois Supabase 스키마 (Phase 5. 게시판 및 과제 포함)

## 기초 엔티티

### profiles

```sql
id         uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
name       text
email      text
avatar_url text
role       text  -- 'teacher' | 'student' | null
```

### classrooms & classroom_members

```sql
CREATE TABLE classrooms (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text  NOT NULL,
  teacher_id uuid  REFERENCES profiles(id) ON DELETE CASCADE,
  class_code text  UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE classroom_members (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid  REFERENCES classrooms(id) ON DELETE CASCADE,
  student_id   uuid  REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at    timestamptz DEFAULT now(),
  UNIQUE (classroom_id, student_id)
);
```

---

## 일반 학습 (Chapters / Pages)

```sql
CREATE TABLE chapters (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid  REFERENCES classrooms(id) ON DELETE CASCADE,
  title        text  NOT NULL,
  description  text,
  position     int   NOT NULL DEFAULT 0
);

CREATE TABLE pages (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid  REFERENCES chapters(id) ON DELETE CASCADE,
  image_url  text  NOT NULL,
  position   int   NOT NULL DEFAULT 0
);

CREATE TABLE student_notes (
  id               uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid  REFERENCES profiles(id) ON DELETE CASCADE,
  page_id          uuid  REFERENCES pages(id) ON DELETE CASCADE,
  excalidraw_data  jsonb,
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (student_id, page_id)
);

CREATE TABLE teacher_student_comments (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id      uuid REFERENCES auth.users NOT NULL,
  student_id      uuid REFERENCES auth.users NOT NULL,
  page_id         uuid REFERENCES pages(id) ON DELETE CASCADE NOT NULL,
  excalidraw_data jsonb,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(teacher_id, student_id, page_id)
);
```

---

## Phase 5 신규 — 게시판 (Board)

```sql
CREATE TABLE posts (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid REFERENCES auth.users NOT NULL,
  title      text NOT NULL,
  content    text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE post_files (
  id        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id   uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_url  text NOT NULL,
  file_size integer NOT NULL,
  mime_type text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE post_classrooms (
  post_id      uuid REFERENCES posts(id) ON DELETE CASCADE,
  classroom_id uuid REFERENCES classrooms(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, classroom_id)
);
```

---

## Phase 5 신규 — 과제 (Assignment)

```sql
CREATE TABLE assignments (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  classroom_id uuid REFERENCES classrooms(id) ON DELETE CASCADE NOT NULL,
  teacher_id   uuid REFERENCES auth.users NOT NULL,
  title        text NOT NULL,
  description  text DEFAULT '',
  deadline     timestamptz,
  max_score    integer DEFAULT 100,
  position     integer DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE assignment_pages (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid REFERENCES assignments(id) ON DELETE CASCADE NOT NULL,
  image_url     text NOT NULL,
  position      integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE assignment_submissions (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id      uuid REFERENCES assignments(id) ON DELETE CASCADE NOT NULL,
  student_id         uuid REFERENCES auth.users NOT NULL,
  status             text DEFAULT 'draft',  -- 'draft'|'submitted'|'late_submitted'|'rejected'|'graded'
  submitted_at       timestamptz,
  is_late            boolean DEFAULT false,
  score              integer,
  max_score          integer,
  rejection_comment  text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE assignment_notes (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id   uuid REFERENCES assignments(id) ON DELETE CASCADE NOT NULL,
  page_id         uuid REFERENCES assignment_pages(id) ON DELETE CASCADE NOT NULL,
  student_id      uuid REFERENCES auth.users NOT NULL,
  excalidraw_data jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (assignment_id, page_id, student_id)
);

CREATE TABLE assignment_teacher_comments (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id      uuid REFERENCES auth.users NOT NULL,
  student_id      uuid REFERENCES auth.users NOT NULL,
  page_id         uuid REFERENCES assignment_pages(id) ON DELETE CASCADE NOT NULL,
  excalidraw_data jsonb DEFAULT '{}',
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (teacher_id, student_id, page_id)
);
```

## Storage 버킷 설정

- **chapter-pages**: `chapters/` 및 `assignments/` 폴더로 문제지 이미지 업로드 (Public)
- **post-files**: `posts/` 게시판 첨부파일 폴더 (Public)

### Storage RLS 정책

```sql
-- 교사만 업로드
CREATE POLICY "bucket_teacher_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    (bucket_id = 'chapter-pages' OR bucket_id = 'post-files')
    AND auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );

-- 교사만 삭제
CREATE POLICY "bucket_teacher_delete" ON storage.objects
  FOR DELETE USING (
    (bucket_id = 'chapter-pages' OR bucket_id = 'post-files')
    AND auth.role() = 'authenticated'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );

-- 모든 사람 읽기 가능 (Public 버킷)
CREATE POLICY "bucket_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'chapter-pages' OR bucket_id = 'post-files');
```

## Realtime 채널

`student_notes`, `teacher_student_comments`, `assignment_notes`, `assignment_submissions`, `assignment_teacher_comments` 에스퍼 통신을 위한 Realtime Publication 활성화 필요.
