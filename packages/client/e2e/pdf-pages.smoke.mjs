/**
 * PDF 페이지 브라우저 스모크 (Chromium, Playwright)
 *
 * 준비: 로컬 PostgreSQL, 서버(3001), Vite(3000) 실행 중(`npm run dev`).
 *   cd packages/server && npx tsx --env-file=.env scripts/pdf-e2e-setup.ts > /tmp/pdf.json
 *   cd packages/client && LANG=C.UTF-8 node e2e/pdf-pages.smoke.mjs /tmp/pdf.json [screenshotDir]
 * 정리(파일 + 챕터 + 학급, 사용자는 남김):
 *   cd packages/server && npx tsx --env-file=.env scripts/pdf-e2e-setup.ts --cleanup <chapterId>
 *
 * LANG=C.UTF-8 필수: 로케일이 없으면 Playwright `setInputFiles` 가 한글 경로(`교재 테스트.pdf`)에서
 * change 이벤트 없이 조용히 실패한다. 저장소 경로는 기본 `packages/server/local-storage`
 * (서버 VOLUME_PATH 가 다르면 E2E_VOLUME_PATH 로 지정). Chromium 실행 파일: CHROMIUM_PATH 또는 PW_CHROMIUM_EXECUTABLE
 * (클라우드 세션은 session-start 훅이 설정), 둘 다 없으면 Playwright 기본 브라우저.
 *
 * 검증: 교사 PDF 등록(2쪽 → 페이지 2행, 같은 pdfUrl, pdfPage 1·2) → 편집기 썸네일(pdf.js 래스터) →
 *       학생 1쪽 레이어 픽셀 · 휠 줌 재렌더 · 사각형 필기 저장(bgPosition) → 2쪽 가로 종이 →
 *       문서 로드 실패 카드 · 다시 시도 → 교사 페이지 삭제(공유 파일 보호 → 마지막 쪽 삭제 시 파일 제거) →
 *       콘솔/페이지 오류 없음.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3000';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', '교재 테스트.pdf');
const VOLUME = process.env.E2E_VOLUME_PATH || path.resolve(HERE, '../../server/local-storage');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shotDir = process.argv[3] || null;
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || process.env.PW_CHROMIUM_EXECUTABLE || undefined });
const errors = [];

async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const res = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password: cfg.password } });
  if (!res.ok()) throw new Error(`login failed ${email}: ${res.status()} ${await res.text()}`);
  const { token } = await res.json();
  ctx.token = token; // REST 호출용 (브라우저 탭은 refresh 쿠키로 세션 복원)
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push({ email, type: 'pageerror', msg: String(e), at: e.stack?.split('\n').slice(1, 4).join(' | ') }));
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ email, type: 'console', msg: m.text() }); });
  return { ctx, page };
}
const api = async (ctx, method, url, data) => {
  const res = await ctx.request.fetch(`${BASE}${url}`, { method, data, headers: { authorization: `Bearer ${ctx.token}` } });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status(), json };
};
const shot = (page, name) => (shotDir ? page.screenshot({ path: path.join(shotDir, `${name}.png`) }) : Promise.resolve());

/** pdfUrl(`/api/files/<bucket>/<path>`) → 디스크 경로 */
const diskPathOf = (url) => path.join(VOLUME, decodeURIComponent(url).replace(/^\/api\/files\//, ''));

/**
 * 보이는 PDF 레이어 상태: 캔버스 width 속성, 캔버스 중앙 50×50 영역의 흰색이 아닌 픽셀 수, 종이(흰 div) 크기.
 * 캔버스가 숨겨져 있으면(렌더 전·실패) ok=false.
 */
const layerInfo = (page) => page.evaluate(() => {
  const c = document.querySelector('[data-testid="pdf-layer-canvas"]');
  if (!c || c.style.display === 'none' || !c.width || !c.height) return { ok: false };
  const size = Math.min(50, c.width, c.height);
  const x0 = Math.floor((c.width - size) / 2);
  const y0 = Math.floor((c.height - size) / 2);
  const d = c.getContext('2d').getImageData(x0, y0, size, size).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) ink++;
  const paper = c.parentElement.querySelector('div.bg-white')?.getBoundingClientRect();
  return {
    ok: true, width: c.width, height: c.height, ink,
    paper: paper ? { x: paper.left, y: paper.top, w: Math.round(paper.width), h: Math.round(paper.height) } : null,
  };
});
/** 레이어가 그려질 때까지(잉크가 보일 때까지) 최대 20초 대기 — `accept` 로 추가 조건 */
async function waitLayer(page, accept = () => true) {
  let info = { ok: false };
  for (let i = 0; i < 40; i++) {
    info = await layerInfo(page);
    if (info.ok && info.ink > 0 && accept(info)) break;
    await sleep(500);
  }
  return info;
}

/** 필기 툴바(DrawingToolbar)의 사각형으로 하나 그리기. x ≥ 300: 좌측 패널을 피한다 */
async function drawRect(page, x1, y1, x2, y2) {
  const canvas = page.locator('.excalidraw canvas.interactive').first();
  await canvas.waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('button[title="도형 (사각형 / 원 / 삼각형)"]').click();
  await page.locator('button[title="사각형"]').click();
  await sleep(300);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
}

try {
  const T = await session(cfg.teacher.email);
  const S = await session(cfg.student.email);
  const studyUrl = (pageId) => `${BASE}/student/study/${cfg.chapterId}/page/${pageId}`;

  // 1. 교사: 편집기에서 PDF 등록 → 쪽수만큼 페이지 행
  await T.page.goto(`${BASE}/teacher/chapters/${cfg.chapterId}/edit`);
  const fileInput = T.page.locator('input[type=file]');
  await fileInput.waitFor({ state: 'attached', timeout: 20000 });
  await fileInput.setInputFiles(FIXTURE);
  const items = T.page.locator('[aria-label="페이지 삭제"]').locator('xpath=..'); // SortablePageItem 루트
  await T.page.waitForFunction(() => document.querySelectorAll('[aria-label="페이지 삭제"]').length === 2, null, { timeout: 30000 })
    .catch(() => {});
  check('editor shows 2 page items after PDF upload', (await items.count()) === 2, await items.count());
  const rows = (await api(T.ctx, 'GET', `/api/chapters/${cfg.chapterId}/pages`)).json ?? [];
  const [p1, p2] = rows;
  const pdfUrl = p1?.pdfUrl ?? '';
  check('GET pages → exactly 2 rows', rows.length === 2, rows.length);
  check('both rows share one pdfUrl under /api/files/chapter-pdfs/',
    rows.length === 2 && pdfUrl.startsWith('/api/files/chapter-pdfs/') && p2.pdfUrl === pdfUrl, rows.map((r) => r.pdfUrl));
  check('pdfPage 1 and 2, imageUrl null', p1?.pdfPage === 1 && p2?.pdfPage === 2 && p1?.imageUrl == null && p2?.imageUrl == null,
    rows.map((r) => ({ pdfPage: r.pdfPage, imageUrl: r.imageUrl })));
  check('pdfUrl keeps the Hangul file name', decodeURIComponent(pdfUrl).endsWith('교재 테스트.pdf'), pdfUrl);
  check('PDF file stored on disk', !!pdfUrl && fs.existsSync(diskPathOf(pdfUrl)), diskPathOf(pdfUrl));

  // 2. 편집기 페이지 목록 썸네일 = pdf.js 래스터(JPEG data URL)
  const thumbsReady = await T.page.waitForFunction(() => {
    const its = [...document.querySelectorAll('[aria-label="페이지 삭제"]')].map((b) => b.parentElement);
    return its.length === 2 && its.every((it) => it.querySelector('img')?.src.startsWith('data:image/jpeg'));
  }, null, { timeout: 10000 }).then(() => true, () => false);
  check('editor thumbnails are pdf.js JPEG rasters', thumbsReady,
    await items.evaluateAll((its) => its.map((it) => it.querySelector('img')?.src.slice(0, 30) ?? null)));
  await shot(T.page, '01-teacher-editor');

  // 3. 학생 1쪽: 레이어 픽셀 → 휠 줌 재렌더 → 사각형 필기 저장
  await S.page.goto(studyUrl(p1.id));
  await S.page.locator('.excalidraw').waitFor({ timeout: 20000 });
  let info = await waitLayer(S.page);
  check('page 1: layer canvas visible', info.ok, info);
  check('page 1: centre 50×50 has ink', info.ok && info.ink > 0, info);
  const widthBefore = info.width;
  if (info.paper) await S.page.mouse.move(info.paper.x + info.paper.w / 2, info.paper.y + info.paper.h / 2);
  await S.page.keyboard.down('Control');
  for (let i = 0; i < 3; i++) { await S.page.mouse.wheel(0, -100); await sleep(60); }
  await S.page.keyboard.up('Control');
  await sleep(500); // 뷰포트 정착(VIEWPORT_SETTLE_MS) + 렌더
  info = await waitLayer(S.page, (x) => x.width > widthBefore);
  check('page 1: canvas width grows after 3-step wheel zoom', info.ok && info.width > widthBefore, { before: widthBefore, after: info.width });
  await S.page.locator('button[title="필기 모드로 전환"]').click();
  await sleep(500);
  await drawRect(S.page, 450, 300, 600, 380);
  await sleep(3000); // 1500ms 디바운스 저장
  const note = (await api(S.ctx, 'GET', `/api/notes/student/${p1.id}`)).json?.excalidrawData;
  const els = (note?.elements ?? []).filter((e) => !e.isDeleted);
  check('student note saved: 1 rectangle + bgPosition',
    els.length === 1 && els[0].type === 'rectangle' && note?.bgPosition != null,
    { elements: els.map((e) => e.type), bgPosition: note?.bgPosition });
  await shot(S.page, '02-student-page1');

  // 4. 학생 2쪽(가로): 다음 페이지 → 가로 종이 + 잉크
  await S.page.locator('button[title="다음 페이지"]:visible').first().click();
  info = await waitLayer(S.page, (x) => x.paper && x.paper.w > x.paper.h);
  check('page 2: layer visible with ink', info.ok && info.ink > 0, info);
  check('page 2: paper is landscape', !!info.paper && info.paper.w > info.paper.h, info.paper);
  await shot(S.page, '03-student-page2');

  // 5. 문서 로드 실패 → 안내 카드 · 다시 시도 (Excalidraw 위에서 눌려야 한다)
  const isPdf = (u) => decodeURIComponent(u.pathname) === pdfUrl;
  await S.page.route(isPdf, (route) => route.fulfill({ status: 500, body: 'e2e: forced failure' }));
  await S.page.goto(studyUrl(p1.id));
  const errorShown = await S.page.getByText('PDF를 불러오지 못했습니다').waitFor({ timeout: 20000 }).then(() => true, () => false);
  check('failed PDF shows the error card', errorShown);
  const retryBtn = S.page.getByRole('button', { name: '다시 시도' });
  const clickable = await retryBtn.click({ trial: true, timeout: 5000 }).then(() => true, () => false);
  check('retry button is clickable (not covered by Excalidraw)', clickable);
  await shot(S.page, '04-student-error-card');
  await S.page.unroute(isPdf);
  if (clickable) await retryBtn.click();
  info = await waitLayer(S.page);
  check('retry renders the layer', info.ok && info.ink > 0, info);
  check('error card gone after retry', (await S.page.getByText('PDF를 불러오지 못했습니다').count()) === 0);

  // 6. 교사 페이지 삭제: 1쪽 삭제 → 공유 파일 유지, 2쪽 삭제 → 파일 제거
  const deletePageAt = async (index) => {
    T.page.once('dialog', (d) => d.accept());
    const before = await items.count();
    await items.nth(index).hover();
    await T.page.locator('[aria-label="페이지 삭제"]').nth(index).click();
    await T.page.waitForFunction((n) => document.querySelectorAll('[aria-label="페이지 삭제"]').length === n, before - 1, { timeout: 10000 })
      .catch(() => {});
    await sleep(500);
  };
  await deletePageAt(0);
  let left = (await api(T.ctx, 'GET', `/api/chapters/${cfg.chapterId}/pages`)).json ?? [];
  check('delete page 1 → only page 2 left', left.length === 1 && left[0].id === p2.id, left.map((r) => r.id));
  check('shared PDF file kept on disk', fs.existsSync(diskPathOf(pdfUrl)), diskPathOf(pdfUrl));
  await S.page.goto(studyUrl(p2.id));
  info = await waitLayer(S.page, (x) => x.paper && x.paper.w > x.paper.h);
  check('page 2 still opens for the student', info.ok && info.ink > 0, info);
  await deletePageAt(0);
  left = (await api(T.ctx, 'GET', `/api/chapters/${cfg.chapterId}/pages`)).json ?? [];
  check('delete page 2 → no pages left', left.length === 0, left.length);
  check('PDF file removed after last page deleted', !fs.existsSync(diskPathOf(pdfUrl)), diskPathOf(pdfUrl));
  await shot(T.page, '05-teacher-editor-empty');

  // 7. 콘솔/페이지 오류 (5단계의 강제 500 은 "Failed to load resource" 로 걸러진다)
  const realErrors = errors.filter((e) => !/favicon|manifest|sw\.js|Service Worker|DevTools|net::ERR_|Failed to load resource/i.test(e.msg));
  check('no page/console errors', realErrors.length === 0, realErrors.slice(0, 5));

  await Promise.all([T.ctx.close(), S.ctx.close()]);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
