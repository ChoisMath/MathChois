# HTML 인터랙티브 도구 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 업로드한 claude 제작 인터랙티브 HTML 도구(.html)를 챕터의 새 페이지 콘텐츠 타입으로 학생에게 제공한다.

**Architecture:** `pages` 테이블에 `htmlUrl` 컬럼 추가(이미지/영상과 동일하게 채워진 필드로 타입 추론). HTML은 Railway Volume `chapter-tools` 버킷에 저장하고 기존 `/api/files/*` 라우트로 서빙하되, `text/html` 응답에만 `Content-Security-Policy: sandbox` 헤더를 강제해 opaque origin으로 격리. 학생/교사 화면은 `<iframe sandbox>`로 렌더(필기 없음).

**Tech Stack:** Fastify 5 + Drizzle ORM (server), React 19 + Vite (client), `@mathchois/shared` 타입, Railway Volume 스토리지.

**검증 방식 주의:** 이 프로젝트에는 server 유닛 테스트 러너가 없다(Playwright E2E만 존재, 현재 outdated). 따라서 각 태스크는 **타입체크/빌드 + 런타임 수동 검증**으로 확인한다. 새 테스트 프레임워크를 도입하지 않는다(YAGNI, 기존 관행 준수).

---

## File Structure

**서버:**
- `packages/server/src/db/schema.ts` — `pages`에 `htmlUrl` 컬럼 (수정)
- `packages/server/src/services/storage.service.ts` — `.html` MIME 추가 (수정)
- `packages/server/src/routes/storage.ts` — HTML 서빙 시 CSP sandbox 헤더, `chapter-tools` 업로드 MIME 검증 (수정)
- `packages/server/src/services/page.service.ts` — `createPage`/`createPages`에 `htmlUrl` (수정)
- `packages/server/src/routes/pages.ts` — 페이지 생성 Body에 `htmlUrl` (수정)

**공유 타입:**
- `packages/shared/src/types/models.ts` — `Page` 인터페이스에 `htmlUrl` (수정)

**클라이언트:**
- `packages/client/src/pages/Chapters/Editor.jsx` — HTML 업로드 버튼/핸들러, 미리보기 iframe (수정)
- `packages/client/src/components/common/SortablePageItem.jsx` — HTML 썸네일 아이콘 (수정)
- `packages/client/src/pages/Study/StudyViewer.jsx` — htmlUrl 렌더 분기, 썸네일, 필기 가드 (수정)

---

## Task 1: DB 스키마 + 공유 타입에 htmlUrl 추가

**Files:**
- Modify: `packages/server/src/db/schema.ts:60-68`
- Modify: `packages/shared/src/types/models.ts:29-35`

- [ ] **Step 1: schema.ts pages 테이블에 htmlUrl 컬럼 추가**

`packages/server/src/db/schema.ts`의 `pages` 정의를 다음으로 변경:

```ts
export const pages = pgTable('pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  chapterId: uuid('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  imageUrl: text('image_url'),
  videoUrl: text('video_url'),
  htmlUrl: text('html_url'),
  position: integer('position').notNull().default(0),
}, (t) => [
  index('idx_pages_chapter').on(t.chapterId),
]);
```

- [ ] **Step 2: shared Page 인터페이스에 htmlUrl 추가**

`packages/shared/src/types/models.ts` line 29의 `Page` 인터페이스를 변경:

```ts
export interface Page {
  id: string;
  chapterId: string;
  imageUrl: string | null;
  videoUrl: string | null;
  htmlUrl: string | null;
  position: number;
}
```

> line 108 부근의 다른 page-형 타입(과제 페이지)은 **수정하지 않는다** (이번 범위 아님).

- [ ] **Step 3: shared 빌드 + DB 컬럼 생성**

Run:
```bash
npm run build -w @mathchois/shared
npm run db:push -w @mathchois/server
```
Expected: shared 빌드 성공. drizzle-kit이 `html_url` 컬럼 추가를 감지하고 적용(`+ html_url`). 데이터 손실 경고 없음(nullable 컬럼 추가).

> drizzle-kit push는 대화형일 수 있다. 컬럼 추가만이므로 안전. 프롬프트가 뜨면 컬럼 생성을 승인.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/db/schema.ts packages/shared/src/types/models.ts
git commit -m "feat(db): add htmlUrl column to pages for HTML tool pages"
```

---

## Task 2: 서버 — HTML MIME 타입 + 서빙 CSP sandbox + 업로드 검증

**Files:**
- Modify: `packages/server/src/services/storage.service.ts:109-129`
- Modify: `packages/server/src/routes/storage.ts`

- [ ] **Step 1: getMimeType에 .html 추가**

`packages/server/src/services/storage.service.ts`의 `types` 맵에 추가(`.txt` 줄 아래):

```ts
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
```

- [ ] **Step 2: storage.ts 상단에 도구 버킷 상수 추가**

`packages/server/src/routes/storage.ts`의 `STUDENT_ALLOWED_BUCKETS` 정의 아래에 추가:

```ts
// HTML 도구 전용 버킷 (text/html 만 허용)
const HTML_TOOL_BUCKET = 'chapter-tools';
```

- [ ] **Step 3: 단일 업로드 핸들러에 chapter-tools MIME 검증 추가**

`POST /api/files/upload` 핸들러에서, 학생 MIME 검증 블록(`if (request.user.role === 'student' && !STUDENT_ALLOWED_MIMES...`) **아래**에 추가:

```ts
      // chapter-tools 버킷은 HTML 파일만 허용
      if (bucket === HTML_TOOL_BUCKET && file.mimetype !== 'text/html') {
        return reply.status(400).send({ error: 'HTML 도구 버킷에는 .html 파일만 업로드할 수 있습니다.' });
      }
```

- [ ] **Step 4: 서빙 핸들러에 HTML sandbox CSP 추가**

`GET /api/files/*` 핸들러에서 `reply.header('Cache-Control', ...)` 줄 **아래**에 추가:

```ts
    // text/html 은 opaque origin 으로 격리 (업로드된 도구의 stored-XSS 방지)
    if (result.mimeType === 'text/html') {
      reply.header(
        'Content-Security-Policy',
        'sandbox allow-scripts allow-popups allow-forms allow-modals',
      );
      reply.header('X-Content-Type-Options', 'nosniff');
    }
```

- [ ] **Step 5: 서버 타입체크/빌드**

Run: `npm run build -w @mathchois/server`
Expected: 타입 에러 없이 빌드 성공.

- [ ] **Step 6: 런타임 검증 (서버 단독)**

`npm run dev -w @mathchois/server`로 서버를 띄운 뒤, 임의의 `.html`을 Volume `chapter-tools/test/` 아래에 두고 브라우저로 `http://localhost:3001/api/files/chapter-tools/test/<파일명>.html` 접속.
Expected: HTML이 렌더되고, DevTools Network 탭에서 응답 헤더에 `content-security-policy: sandbox allow-scripts ...`와 `x-content-type-options: nosniff` 확인.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/services/storage.service.ts packages/server/src/routes/storage.ts
git commit -m "feat(server): serve HTML tools with sandbox CSP and restrict chapter-tools bucket to HTML"
```

---

## Task 3: 서버 — 페이지 생성에 htmlUrl 지원

**Files:**
- Modify: `packages/server/src/services/page.service.ts:31-71`
- Modify: `packages/server/src/routes/pages.ts:26-59`

- [ ] **Step 1: page.service.ts createPage에 htmlUrl 추가**

`createPage`의 인자 타입과 insert values에 `htmlUrl` 추가:

```ts
export async function createPage(data: {
  chapterId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  htmlUrl?: string | null;
  position?: number;
}) {
  let position = data.position;
  if (position === undefined) {
    const maxRows = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${pages.position}), -1)` })
      .from(pages)
      .where(eq(pages.chapterId, data.chapterId));
    position = (maxRows[0]?.maxPos ?? -1) + 1;
  }

  const [created] = await db
    .insert(pages)
    .values({
      chapterId: data.chapterId,
      imageUrl: data.imageUrl ?? null,
      videoUrl: data.videoUrl ?? null,
      htmlUrl: data.htmlUrl ?? null,
      position,
    })
    .returning();
  return created;
}
```

- [ ] **Step 2: page.service.ts createPages에 htmlUrl 추가**

`createPages`의 인자 타입과 values 매핑에 `htmlUrl` 추가:

```ts
export async function createPages(items: {
  chapterId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  htmlUrl?: string | null;
  position: number;
}[]) {
  if (items.length === 0) return [];
  return db
    .insert(pages)
    .values(items.map((it) => ({
      chapterId: it.chapterId,
      imageUrl: it.imageUrl ?? null,
      videoUrl: it.videoUrl ?? null,
      htmlUrl: it.htmlUrl ?? null,
      position: it.position,
    })))
    .returning();
}
```

- [ ] **Step 3: pages.ts 라우트 Body 타입 + 검증 + 전달에 htmlUrl 추가**

`POST /api/chapters/:chapterId/pages` 핸들러를 다음과 같이 수정:

Body 타입 제네릭:
```ts
    Body: { imageUrl?: string; videoUrl?: string; htmlUrl?: string; position?: number } | { pages: { imageUrl?: string; videoUrl?: string; htmlUrl?: string; position: number }[] };
```

배치 삽입 매핑:
```ts
    if (Array.isArray(body.pages)) {
      const items = (body.pages as { imageUrl?: string; videoUrl?: string; htmlUrl?: string; position: number }[]).map((pg) => ({
        chapterId,
        imageUrl: pg.imageUrl ?? null,
        videoUrl: pg.videoUrl ?? null,
        htmlUrl: pg.htmlUrl ?? null,
        position: pg.position,
      }));
      const created = await createPages(items);
      return reply.status(201).send(created);
    }
```

단일 삽입:
```ts
    const { imageUrl, videoUrl, htmlUrl, position } = body as { imageUrl?: string; videoUrl?: string; htmlUrl?: string; position?: number };
    if (!imageUrl && !videoUrl && !htmlUrl) {
      return reply.status(400).send({ error: 'imageUrl, videoUrl, or htmlUrl is required' });
    }
    const page = await createPage({ chapterId, imageUrl, videoUrl, htmlUrl, position });
    return reply.status(201).send(page);
```

- [ ] **Step 4: 서버 빌드**

Run: `npm run build -w @mathchois/server`
Expected: 타입 에러 없이 빌드 성공.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/page.service.ts packages/server/src/routes/pages.ts
git commit -m "feat(server): accept htmlUrl when creating pages"
```

---

## Task 4: 클라이언트 — Editor에 HTML 도구 업로드

**Files:**
- Modify: `packages/client/src/pages/Chapters/Editor.jsx`

- [ ] **Step 1: import에 아이콘 추가**

line 3 import에 `FileCode2` 추가:

```jsx
import { ArrowLeft, Plus, Trash2, Loader, Upload, Save, X, Video, Play, FileCode2 } from 'lucide-react';
```

- [ ] **Step 2: htmlInputRef 추가**

`fileInputRef`가 선언된 곳 근처(컴포넌트 상단 ref 선언부)에 추가:

```jsx
  const htmlInputRef = useRef(null);
```

> `fileInputRef`의 정확한 선언 위치는 `useRef(null)` 패턴을 grep해서 그 옆에 둔다.

- [ ] **Step 3: handleUploadHtml 핸들러 추가**

`handleUpload` 함수(line 127-173) **아래**에 추가:

```jsx
  const handleUploadHtml = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: 1 });

    const basePosition = pages.length > 0 ? Math.max(...pages.map((p) => p.position)) + 1 : 0;
    let newPage = null;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadResult = await api.upload(
        `/api/files/upload?bucket=chapter-tools&directory=chapters/${id}`,
        formData
      );

      newPage = await api.post(`/api/chapters/${id}/pages`, {
        htmlUrl: uploadResult.url,
        position: basePosition,
      });
    } catch (err) {
      console.error(`HTML 업로드 실패 (${file.name}):`, err.message);
    }

    e.target.value = '';
    setUploading(false);
    setUploadProgress({ done: 0, total: 0 });

    invalidatePagesCache(id);
    await fetchData();
    if (newPage) setSelectedPage(newPage);
  };
```

- [ ] **Step 4: 툴바에 HTML 업로드 input + 버튼 추가**

line 362-369의 YouTube 버튼 **아래**(같은 `<>` 프래그먼트 안)에 추가:

```jsx
              <input
                ref={htmlInputRef}
                type="file"
                accept=".html,text/html"
                onChange={handleUploadHtml}
                className="hidden"
              />
              <button
                onClick={() => htmlInputRef.current?.click()}
                disabled={uploading}
                title="HTML 도구 페이지 추가"
                className="inline-flex items-center justify-center p-2 border border-transparent rounded-md shadow-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                <FileCode2 className="h-5 w-5" />
              </button>
```

- [ ] **Step 5: 선택 페이지 미리보기에 htmlUrl 분기 추가**

line 416-432의 미리보기 삼항을 다음으로 변경(htmlUrl 우선):

```jsx
          {selectedPage ? (
            selectedPage.htmlUrl ? (
              <iframe
                src={selectedPage.htmlUrl}
                sandbox="allow-scripts allow-popups allow-forms allow-modals"
                className="w-full h-full rounded bg-white"
                title="HTML 도구 미리보기"
              />
            ) : selectedPage.videoUrl ? (
              <div className="w-full h-full flex items-center justify-center bg-black rounded">
                <iframe
                  src={getYouTubeEmbedUrl(extractYouTubeId(selectedPage.videoUrl))}
                  className="w-full h-full rounded"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <img
                src={selectedPage.imageUrl}
                alt="선택된 페이지"
                className="w-full h-auto block shadow-sm bg-white"
              />
            )
          ) : (
```

- [ ] **Step 6: 빈 상태 안내 문구 갱신 (line 435-436)**

```jsx
              <p className="text-lg">페이지를 추가하세요</p>
              <p className="text-sm mt-1">이미지, YouTube 영상, HTML 도구를 추가할 수 있습니다</p>
```

- [ ] **Step 7: 클라이언트 lint + 빌드**

Run: `npm run lint -w @mathchois/client && npm run build -w @mathchois/client`
Expected: lint 통과, 빌드 성공.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/pages/Chapters/Editor.jsx
git commit -m "feat(client): upload and preview HTML tool pages in chapter editor"
```

---

## Task 5: 클라이언트 — 썸네일 아이콘 + StudyViewer 렌더/가드

**Files:**
- Modify: `packages/client/src/components/common/SortablePageItem.jsx`
- Modify: `packages/client/src/pages/Study/StudyViewer.jsx`

- [ ] **Step 1: SortablePageItem에 HTML 분기 추가**

`packages/client/src/components/common/SortablePageItem.jsx` import(line 4)에 `FileCode2` 추가:

```jsx
import { Trash2, GripVertical, Play, FileCode2 } from 'lucide-react';
```

line 43-67의 `videoId ? (...) : (<img .../>)` 삼항을 다음으로 변경(htmlUrl 우선):

```jsx
      {page.htmlUrl ? (
        <div className="relative flex items-center justify-center bg-emerald-50 aspect-video">
          <FileCode2 className="h-8 w-8 text-emerald-600" />
          <span className="absolute bottom-1 inset-x-0 text-center text-[10px] text-emerald-700 font-medium">HTML 도구</span>
        </div>
      ) : videoId ? (
        <div className="relative">
          <img
            src={getYouTubeThumbnail(videoId)}
            alt={`영상 ${index + 1}`}
            className="w-full h-auto object-cover bg-gray-900"
            loading="lazy"
            draggable={false}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-red-600 rounded-full p-1.5">
              <Play className="h-4 w-4 text-white fill-white" />
            </div>
          </div>
        </div>
      ) : (
        <img
          src={page.imageUrl}
          alt={`페이지 ${index + 1}`}
          className="w-full h-auto object-contain bg-white"
          loading="lazy"
          draggable={false}
        />
      )}
```

- [ ] **Step 2: StudyViewer 교사 미리보기 썸네일 (line 269)**

`packages/client/src/pages/Study/StudyViewer.jsx` line 269의 `{pg.videoUrl ? (` 삼항 앞에 htmlUrl 분기를 추가한다. 해당 블록(269-278 부근)을 다음 형태로 변경:

```jsx
                    {pg.htmlUrl ? (
                      <div className="w-full aspect-video flex items-center justify-center bg-emerald-50 text-emerald-600 text-xs font-medium">HTML</div>
                    ) : pg.videoUrl ? (
                      <img src={getYouTubeThumbnail(extractYouTubeId(pg.videoUrl))} alt={`영상 ${idx + 1}`} className="w-full h-auto object-cover bg-gray-900" loading="lazy" decoding="async" />
                    ) : (
                      <img src={pg.imageUrl} alt={`p.${idx + 1}`} className="w-full h-auto object-contain bg-white" loading="lazy" decoding="async" />
                    )}
```

> 원본의 정확한 닫는 괄호 구조에 맞춰 삼항만 중첩한다. img 속성은 원본 그대로 유지.

- [ ] **Step 3: StudyViewer 교사 미리보기 본문 렌더 (line 289)**

line 289의 `{currentPage?.videoUrl ? (` 를 `{currentPage?.htmlUrl ? (` 분기로 감싼다:

```jsx
          {currentPage?.htmlUrl ? (
            <div className="flex-1 flex items-center justify-center bg-white">
              <iframe
                src={currentPage.htmlUrl}
                sandbox="allow-scripts allow-popups allow-forms allow-modals"
                className="w-full h-full"
                title="HTML 도구"
              />
            </div>
          ) : currentPage?.videoUrl ? (
            <div className="flex-1 flex items-center justify-center bg-black">
              <iframe
                src={getYouTubeEmbedUrl(extractYouTubeId(currentPage.videoUrl))}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
```

> 기존 `) : (` ~ Excalidraw `</div>)` 닫힘 구조는 그대로 둔다. 위 블록은 기존 video 삼항을 htmlUrl이 앞서는 중첩 삼항으로 바꾼 것.

- [ ] **Step 4: StudyViewer 학생 뷰 썸네일 (line 1000)**

line 1000의 `{pg.videoUrl ? (` 삼항도 Step 2와 동일 패턴으로 htmlUrl 분기를 앞에 추가:

```jsx
                  {pg.htmlUrl ? (
                    <div className="w-full aspect-video flex items-center justify-center bg-emerald-50 text-emerald-600 text-xs font-medium">HTML</div>
                  ) : pg.videoUrl ? (
                    <img src={getYouTubeThumbnail(extractYouTubeId(pg.videoUrl))} alt={`영상 ${idx + 1}`} className="w-full h-auto object-cover bg-gray-900" loading="lazy" decoding="async" />
                  ) : (
                    <img src={pg.imageUrl} alt={`페이지 ${idx + 1}`} className="w-full h-auto object-contain bg-white" loading="lazy" decoding="async" />
                  )}
```

- [ ] **Step 5: StudyViewer 학생 뷰 본문 렌더 (line 1021)**

line 1021의 `{currentPage?.videoUrl ? (` 를 htmlUrl 우선 중첩 삼항으로 변경:

```jsx
        {currentPage?.htmlUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <iframe
              src={currentPage.htmlUrl}
              sandbox="allow-scripts allow-popups allow-forms allow-modals"
              className="w-full h-full"
              title="HTML 도구"
            />
          </div>
        ) : currentPage?.videoUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-black">
            <iframe
              src={getYouTubeEmbedUrl(extractYouTubeId(currentPage.videoUrl))}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
```

> 기존 `) : (` ~ Excalidraw 컨테이너 닫힘은 그대로 둔다.

- [ ] **Step 6: 필기/툴바 가드에 htmlUrl 제외 추가 (line 859, 867, 922, 965)**

네 곳의 `!currentPage?.videoUrl` 조건을 `!currentPage?.videoUrl && !currentPage?.htmlUrl` 로 변경한다. 각 줄:

- line 859: `{drawMode && !currentPage?.videoUrl && !currentPage?.htmlUrl && (`
- line 867: `{currentPage && noteElements && !currentPage?.videoUrl && !currentPage?.htmlUrl && (`
- line 922: `{drawMode && !currentPage?.videoUrl && !currentPage?.htmlUrl && (`
- line 965: `{drawMode && !toolbarCollapsed && !currentPage?.videoUrl && !currentPage?.htmlUrl && (`

> 결과: HTML 도구 페이지에서는 그리기 모드 토글/툴바/필기 다운로드 UI가 모두 숨겨진다.

- [ ] **Step 7: 클라이언트 lint + 빌드**

Run: `npm run lint -w @mathchois/client && npm run build -w @mathchois/client`
Expected: lint 통과, 빌드 성공.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/components/common/SortablePageItem.jsx packages/client/src/pages/Study/StudyViewer.jsx
git commit -m "feat(client): render HTML tool pages in study viewer and thumbnails"
```

---

## Task 6: 통합 런타임 검증

**Files:** 없음 (수동 E2E 검증)

- [ ] **Step 1: 전체 빌드**

Run: `npm run build`
Expected: shared → client → server 모두 빌드 성공.

- [ ] **Step 2: dev 서버 기동**

Run: `npm run dev`
Expected: server(3001) + client(3000) 동시 기동.

- [ ] **Step 3: 교사 시나리오**

교사 계정 로그인 → 챕터 Editor 진입 → 초록 `FileCode2` 버튼 클릭 → claude로 만든 `.html` 선택.
Expected: 업로드 후 사이드바에 "HTML 도구" 썸네일 생성, 메인 미리보기에 iframe으로 도구 렌더, 슬라이더/함수 입력 조작 동작.

- [ ] **Step 4: 학생 시나리오**

학생 계정으로 해당 챕터 학습 진입 → 도구 페이지로 이동(PageNavOverlay 좌우 tap 또는 썸네일).
Expected: iframe 전체 화면 렌더, 조작 동작. 그리기 툴바/필기 모드 토글이 보이지 않음. 이미지↔도구↔영상 페이지 전환 정상.

- [ ] **Step 5: 보안 검증**

도구 페이지의 `htmlUrl`(예: `/api/files/chapter-tools/...`)을 새 탭에서 직접 열고 DevTools 확인.
Expected: 응답 헤더 `content-security-policy: sandbox allow-scripts allow-popups allow-forms allow-modals` + `x-content-type-options: nosniff`. 콘솔에서 `document.cookie`/`localStorage` 접근이 opaque origin으로 차단됨(SecurityError 또는 빈 값).

- [ ] **Step 6: CDN 도구 + self-contained 도구 둘 다 확인**

CDN(`<script src="https://...">`)을 쓰는 도구 1개와 인라인 단일 파일 도구 1개를 각각 업로드해 모두 정상 동작하는지 확인.
Expected: 둘 다 렌더·조작 정상(sandbox는 외부 스크립트 로드를 막지 않음).

- [ ] **Step 7: 메모리/맵 갱신 후 마무리 커밋(필요 시)**

작업 메모리(`MEMORY.md`)에 HTML 도구 페이지 기능 추가 기록. 배포 시 `npx drizzle-kit push` 필요 명시.

```bash
git add -A
git commit -m "docs: record HTML tool page feature and deploy note"
```

---

## Self-Review 결과

- **Spec coverage:** 데이터 모델(Task 1), 저장·서빙 보안(Task 2), 페이지 생성(Task 3), 교사 업로드(Task 4), 학생 렌더+가드+썸네일(Task 5), 통합·보안 검증(Task 6) — 스펙 전 섹션 커버.
- **Placeholder scan:** 모든 코드 단계에 실제 코드 포함. "TBD" 없음.
- **Type consistency:** `htmlUrl` 명칭이 schema(`html_url`/`htmlUrl`), shared `Page.htmlUrl`, service 인자, 라우트 Body, 클라이언트 `page.htmlUrl`/`currentPage.htmlUrl` 전반에서 일관.
- **배포 주의:** 운영 배포 시 `npm run db:push -w @mathchois/server`(= `npx drizzle-kit push`)로 `html_url` 컬럼 생성 필요.
