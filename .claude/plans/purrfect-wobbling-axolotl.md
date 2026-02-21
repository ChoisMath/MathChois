# Option A 배포: Supabase Cloud + Railway

## Context
Phase 1 코드가 완성되었고, Supabase Cloud를 백엔드로, Railway를 프론트엔드 호스팅으로 사용하여 배포한다.

## 구현 작업 목록

### 1. Railway 배포용 정적 파일 서버 설정

**문제**: Railway는 `npm start`로 프로세스를 실행한다. Vite는 빌드 결과물(`dist/`)을 정적 파일로 출력하므로, 이를 서빙할 경량 HTTP 서버가 필요하다.
**또한**: react-router-dom의 클라이언트 라우팅 때문에 모든 경로가 `index.html`로 fallback되어야 한다.

**작업:**

**(a)** `serve` 패키지 설치 (`npm install serve`)

**(b)** `package.json` 수정:
```json
{
  "scripts": {
    "start": "serve dist -s -l tcp://0.0.0.0:$PORT",
    "build": "vite build",
    ...
  }
}
```
- `-s` (single): SPA 모드 — 404를 `index.html`로 리다이렉트
- `-l tcp://0.0.0.0:$PORT`: Railway가 주입하는 `PORT` 환경변수 사용

**(c)** `package.json`의 `"name"` 필드를 `"mathchois"`로 변경

### 2. Supabase SQL 스크립트 파일 생성

Supabase 대시보드의 SQL Editor에서 실행할 통합 스크립트를 `supabase/seed.sql`에 정리한다.

내용:
- 테이블 생성 (profiles, classrooms, classroom_members, chapters, pages, annotations)
- `handle_new_user()` 트리거
- `join_classroom_by_code()` RPC 함수
- RLS 정책 전체

### 3. Supabase 대시보드 설정 가이드 (README or 주석)

사용자가 수동으로 해야 할 작업:
1. https://supabase.com 에서 프로젝트 생성
2. SQL Editor에서 `supabase/seed.sql` 실행
3. Authentication > Providers > Google 활성화 + Client ID/Secret 입력
4. Google Cloud Console에서 Redirect URI 추가: `https://<project-ref>.supabase.co/auth/v1/callback`
5. Project Settings에서 URL + anon key 복사

### 4. Railway 배포 절차

1. Railway 프로젝트 생성
2. GitHub 레포 연결
3. 환경변수 설정 (Build-time):
   - `VITE_SUPABASE_URL` = Supabase 프로젝트 URL
   - `VITE_SUPABASE_ANON_KEY` = Supabase anon key
4. Railway가 자동으로 `npm install` → `npm run build` → `npm start` 실행

## 파일 변경 목록

| 파일 | 작업 | 설명 |
|------|------|------|
| `package.json` | 수정 | name 변경, start 스크립트 변경, serve 추가 |
| `supabase/seed.sql` | 신규 | 테이블 + 트리거 + RPC + RLS 통합 SQL |

## 검증
1. `npm run build && npx serve dist -s` 로컬 실행 → SPA 라우팅 확인
2. Railway 배포 후 도메인 접속 → Google 로그인 흐름 동작 확인
