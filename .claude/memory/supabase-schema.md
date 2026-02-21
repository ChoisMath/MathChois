# MathChois Supabase 스키마 및 설정

> 코드는 완성되어 있으나 Supabase 대시보드에서 아래 항목들을 수동으로 설정해야 앱이 동작합니다.

---

## 테이블 스키마

### profiles
```sql
id         uuid  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
name       text
email      text
avatar_url text
role       text  -- 'teacher' | 'student' | null
```
- Google OAuth 가입 시 `auth.users` trigger로 자동 생성
- `updateRole(role)` 호출 시 role 컬럼 업데이트

### classrooms
```sql
id         uuid  PRIMARY KEY DEFAULT gen_random_uuid()
name       text  NOT NULL
teacher_id uuid  REFERENCES profiles(id) ON DELETE CASCADE
class_code text  UNIQUE NOT NULL  -- 6자리 대문자+숫자 (I,O,0,1 제외)
created_at timestamptz DEFAULT now()
```

### classroom_members
```sql
id           uuid  PRIMARY KEY DEFAULT gen_random_uuid()
classroom_id uuid  REFERENCES classrooms(id) ON DELETE CASCADE
student_id   uuid  REFERENCES profiles(id) ON DELETE CASCADE
joined_at    timestamptz DEFAULT now()
UNIQUE (classroom_id, student_id)
```

### chapters
```sql
id           uuid  PRIMARY KEY DEFAULT gen_random_uuid()
classroom_id uuid  REFERENCES classrooms(id) ON DELETE CASCADE
title        text  NOT NULL
description  text
position     int   NOT NULL DEFAULT 0
```

### pages
```sql
-- 주의: 테이블명은 'pages' (chapter_pages 아님!)
id         uuid  PRIMARY KEY DEFAULT gen_random_uuid()
chapter_id uuid  REFERENCES chapters(id) ON DELETE CASCADE
image_url  text  NOT NULL  -- Storage public URL
position   int   NOT NULL DEFAULT 0
```

### student_notes
```sql
id               uuid  PRIMARY KEY DEFAULT gen_random_uuid()
student_id       uuid  REFERENCES profiles(id) ON DELETE CASCADE
page_id          uuid  REFERENCES pages(id) ON DELETE CASCADE
excalidraw_data  jsonb  -- { elements: [...], bgPosition: {x, y, width, height} }
updated_at       timestamptz DEFAULT now()
UNIQUE (student_id, page_id)  -- upsert onConflict 사용
```

### teacher_notes (Phase 4 — 수동 설정 필요)
교사가 수업 전체 대상으로 작성하는 필기 (class-wide). 학생은 모달로 열람.
```sql
CREATE TABLE teacher_notes (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id      uuid REFERENCES auth.users NOT NULL,
  page_id         uuid REFERENCES pages(id) ON DELETE CASCADE NOT NULL,
  excalidraw_data jsonb,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(teacher_id, page_id)
);
ALTER TABLE teacher_notes ENABLE ROW LEVEL SECURITY;
```

### teacher_student_comments (Phase 4 — 수동 설정 필요)
교사가 특정 학생 필기에 남기는 개인 코멘트. 학생 StudyViewer에서 자동 로드 + Realtime 표시.
```sql
CREATE TABLE teacher_student_comments (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id      uuid REFERENCES auth.users NOT NULL,
  student_id      uuid REFERENCES auth.users NOT NULL,
  page_id         uuid REFERENCES pages(id) ON DELETE CASCADE NOT NULL,
  excalidraw_data jsonb,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(teacher_id, student_id, page_id)
);
ALTER TABLE teacher_student_comments ENABLE ROW LEVEL SECURITY;
```

---

## RLS 정책 (Row Level Security)

### profiles
```sql
-- 본인만 읽기/수정
SELECT: auth.uid() = id
UPDATE: auth.uid() = id

-- 교사가 학생 프로필 조회 가능 (ClassroomDetail 멤버 목록용)
SELECT: EXISTS (
  SELECT 1 FROM classroom_members cm
  JOIN classrooms c ON c.id = cm.classroom_id
  WHERE cm.student_id = profiles.id AND c.teacher_id = auth.uid()
)
```

### classrooms
```sql
-- 교사: 자신의 classroom CRUD
SELECT: teacher_id = auth.uid()
INSERT: auth.uid() IS NOT NULL AND role = 'teacher'  -- profiles.role 확인
UPDATE: teacher_id = auth.uid()
DELETE: teacher_id = auth.uid()

-- 학생: 참여한 classroom만 조회
SELECT: EXISTS (
  SELECT 1 FROM classroom_members
  WHERE classroom_id = classrooms.id AND student_id = auth.uid()
)
```

### classroom_members
```sql
-- 교사: 자신의 classroom 멤버 조회
SELECT: EXISTS (
  SELECT 1 FROM classrooms WHERE id = classroom_id AND teacher_id = auth.uid()
)
-- 학생: 본인 멤버십 조회/탈퇴
SELECT: student_id = auth.uid()
DELETE: student_id = auth.uid()
-- INSERT는 join_classroom_by_code RPC에서만 허용 (SECURITY DEFINER)
```

### chapters
```sql
-- 교사: 자신의 classroom 챕터 CRUD
SELECT/INSERT/UPDATE/DELETE: EXISTS (
  SELECT 1 FROM classrooms WHERE id = classroom_id AND teacher_id = auth.uid()
)
-- 학생: 참여한 classroom 챕터 조회
SELECT: EXISTS (
  SELECT 1 FROM classroom_members cm
  JOIN classrooms c ON c.id = classroom_id
  WHERE cm.student_id = auth.uid() AND c.id = chapters.classroom_id
)
```

### pages
```sql
-- 교사: 챕터 소유자 CRUD
SELECT/INSERT/UPDATE/DELETE: EXISTS (
  SELECT 1 FROM chapters ch
  JOIN classrooms c ON c.id = ch.classroom_id
  WHERE ch.id = chapter_id AND c.teacher_id = auth.uid()
)
-- 학생: 참여한 classroom 페이지 조회
SELECT: EXISTS (
  SELECT 1 FROM chapters ch
  JOIN classroom_members cm ON cm.classroom_id = ch.classroom_id
  WHERE ch.id = pages.chapter_id AND cm.student_id = auth.uid()
)
```

### student_notes
```sql
-- 본인 노트만 CRUD
SELECT/INSERT/UPDATE/DELETE: student_id = auth.uid()

-- 교사: 자신의 classroom 학생 노트 조회 (Phase 4 모니터링용)
CREATE POLICY "student_notes_teacher_read" ON student_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pages p
      JOIN chapters ch ON ch.id = p.chapter_id
      JOIN classrooms c ON c.id = ch.classroom_id
      WHERE p.id = student_notes.page_id AND c.teacher_id = auth.uid()
    )
  );
```

### teacher_notes (Phase 4)
```sql
-- 교사: 본인 노트 전체 CRUD
CREATE POLICY "teacher_notes_teacher_all" ON teacher_notes
  FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

-- 학생: 참여한 classroom 페이지의 교사 노트 조회
CREATE POLICY "teacher_notes_student_read" ON teacher_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pages p
      JOIN chapters ch ON ch.id = p.chapter_id
      JOIN classroom_members cm ON cm.classroom_id = ch.classroom_id
      WHERE p.id = teacher_notes.page_id AND cm.student_id = auth.uid()
    )
  );
```

### teacher_student_comments (Phase 4)
```sql
-- 교사: 본인이 작성한 코멘트 전체 CRUD
CREATE POLICY "tsc_teacher_all" ON teacher_student_comments
  FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

-- 학생: 자신을 대상으로 한 코멘트 조회
CREATE POLICY "tsc_student_read" ON teacher_student_comments
  FOR SELECT USING (student_id = auth.uid());
```

---

## Trigger (profiles 자동 생성)

```sql
-- auth.users에 새 유저 생성 시 profiles row 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

---

## RPC 함수

### join_classroom_by_code
```sql
CREATE OR REPLACE FUNCTION join_classroom_by_code(code text)
RETURNS void AS $$
DECLARE
  v_classroom_id uuid;
BEGIN
  SELECT id INTO v_classroom_id
  FROM classrooms
  WHERE class_code = upper(code);

  IF v_classroom_id IS NULL THEN
    RAISE EXCEPTION 'Classroom not found';
  END IF;

  INSERT INTO classroom_members (classroom_id, student_id)
  VALUES (v_classroom_id, auth.uid())
  ON CONFLICT (classroom_id, student_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Storage 설정

### 버킷: chapter-pages
- **공개 여부:** Public (이미지 URL 직접 접근 가능)
- **업로드 경로:** `chapters/{chapterId}/{timestamp}.{ext}`
- **삭제 경로 추출 로직 (Editor.jsx):**
  ```js
  const url = new URL(page.image_url);
  const marker = '/object/public/chapter-pages/';
  const storagePath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
  supabase.storage.from('chapter-pages').remove([storagePath]);
  ```

### Storage RLS 정책 (chapter-pages 버킷)
```sql
-- 교사만 업로드/삭제 가능
INSERT: auth.role() = 'authenticated' AND EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'
)
DELETE: auth.role() = 'authenticated' AND EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'
)
-- 모든 사람 읽기 가능 (Public 버킷)
SELECT: true
```

---

## Google OAuth 설정

1. Supabase 대시보드 → Authentication → Providers → Google → 활성화
2. Google Cloud Console → OAuth 2.0 클라이언트 ID 생성
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Supabase에 Client ID + Client Secret 입력
4. 코드에서 사용 (AuthContext.jsx):
   ```js
   supabase.auth.signInWithOAuth({
     provider: 'google',
     options: { redirectTo: `${window.location.origin}/auth/callback` }
   })
   ```

---

## Realtime 설정 (Phase 4)

Supabase SQL Editor에서 실행:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE student_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE teacher_student_comments;
```

- `student_notes`: ChapterMonitor(교사)가 학생 필기를 실시간 수신, StudentWorkViewer도 사용
- `teacher_student_comments`: StudyViewer(학생)가 교사 코멘트를 실시간 수신

---

## 주의사항

- **profile retry 로직**: trigger가 비동기이므로 INSERT 직후 profile이 없을 수 있음. AuthContext에서 3회 retry (500ms 간격)로 대응
- **테이블명 주의**: `pages` (chapter_pages 아님!)
- `classroom_members` INSERT는 직접 불가, 반드시 `join_classroom_by_code` RPC를 통해서만 가능
