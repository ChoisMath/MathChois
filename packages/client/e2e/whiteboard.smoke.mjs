/**
 * 화이트보드 브라우저 스모크 (Chromium, Playwright)
 *
 * 준비: 로컬 PostgreSQL, 서버(3001), Vite(3000) 실행 중.
 *   cd packages/server && npx tsx --env-file=.env scripts/wb-e2e-setup.ts > /tmp/wb.json
 *   cd packages/client && node e2e/whiteboard.smoke.mjs /tmp/wb.json [screenshotDir]
 *
 * 검증: 교사 격자(모둠 타일 2개) → 학생 A 진입 시 SWOT 자동 적용(1회) → A 사각형 그리기 → 서버에 A 작성자로 저장 →
 *       B 화면에도 요소 수신 → 교사 단일 모드 → 잠금 → A 화면 배지 → 콘솔 오류 없음.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3000';
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shotDir = process.argv[3] || null;
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];

async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const res = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password: cfg.password } });
  if (!res.ok()) throw new Error(`login failed ${email}: ${res.status()} ${await res.text()}`);
  const { token } = await res.json();
  ctx.token = token; // REST 호출용 (브라우저 탭은 refresh 쿠키로 세션 복원)
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push({ email, type: 'pageerror', msg: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ email, type: 'console', msg: m.text() }); });
  return { ctx, page };
}
const api = async (ctx, method, url, data) => {
  const res = await ctx.request.fetch(`${BASE}${url}`, { method, data, headers: { authorization: `Bearer ${ctx.token}` } });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status(), json };
};
const shot = (page, name) => (shotDir ? page.screenshot({ path: path.join(shotDir, `${name}.png`) }) : Promise.resolve());

/** 캔버스에 사각형 하나 그리기 (툴바 버튼 → 드래그). x ≥ 300: 좌측 도형 속성 패널을 피한다 */
async function drawRect(page, x1, y1, x2, y2) {
  const canvas = page.locator('.excalidraw canvas.interactive').first();
  await canvas.waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="toolbar-rectangle"]').click({ force: true });
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
  const A = await session(cfg.studentA.email);
  const B = await session(cfg.studentB.email);
  const q = `?classroomId=${cfg.classroomId}`;

  // 1. 교사 격자
  await T.page.goto(`${BASE}/teacher/classrooms/${cfg.classroomId}/chapters/${cfg.chapterId}/whiteboard/${cfg.pageId}`);
  await T.page.getByText('개 모둠').waitFor({ timeout: 20000 });
  const tiles = T.page.locator('button:has(canvas)');
  await sleep(1500);
  check('teacher grid shows 2 tiles', (await tiles.count()) === 2, await tiles.count());
  await shot(T.page, '01-teacher-grid');

  const view = (await api(T.ctx, 'GET', `/api/whiteboards/page/${cfg.pageId}${q}`)).json;
  const boardAB = view.groups.find((g) => g.name === '1모둠');
  check('page view groups copied from classroom defaults', !!boardAB && boardAB.members.length === 2, view.groups);

  // 2. 학생 A 진입 → SWOT 자동 적용
  await A.page.goto(`${BASE}/student/study/${cfg.chapterId}/page/${cfg.pageId}`);
  await A.page.locator('.excalidraw').waitFor({ timeout: 20000 });
  await sleep(3500);
  let b = (await api(T.ctx, 'GET', `/api/whiteboards/groups/${boardAB.id}`)).json;
  const tplCount = b.scene.elements.filter((e) => e.customData?.template === 'swot').length;
  check('SWOT template applied once on first open', tplCount > 0, tplCount);
  await shot(A.page, '02-studentA-template');

  // 3. B 진입 (동시에 열려도 템플릿 중복 없음)
  await B.page.goto(`${BASE}/student/study/${cfg.chapterId}/page/${cfg.pageId}`);
  await B.page.locator('.excalidraw').waitFor({ timeout: 20000 });
  await sleep(2500);
  b = (await api(T.ctx, 'GET', `/api/whiteboards/groups/${boardAB.id}`)).json;
  check('no duplicate template after B opens', b.scene.elements.filter((e) => e.customData?.template === 'swot').length === tplCount);
  check('presence shows 3 users (teacher grid + A + B)', b.users.length === 3, b.users);

  // 4. A 가 사각형 그리기 → 서버 저장 (작성자 A)
  await drawRect(A.page, 350, 200, 550, 320);
  await sleep(3500);
  b = (await api(T.ctx, 'GET', `/api/whiteboards/groups/${boardAB.id}`)).json;
  const rectA = b.scene.elements.find((e) => e.type === 'rectangle' && e.customData?.authorId === cfg.studentA.id && !e.customData?.template);
  check('A rectangle saved with author A', !!rectA, b.scene.elements.map((e) => [e.type, e.customData]));

  // 5. B 가 그리기 → 작성자 B, 요소 수 증가
  await drawRect(B.page, 700, 300, 900, 420);
  await sleep(3500);
  b = (await api(T.ctx, 'GET', `/api/whiteboards/groups/${boardAB.id}`)).json;
  const rectB = b.scene.elements.find((e) => e.type === 'rectangle' && e.customData?.authorId === cfg.studentB.id && !e.customData?.template);
  check('B rectangle saved with author B', !!rectB);
  const onB = await B.page.evaluate((id) => (window.__wbApi?.getSceneElements() ?? []).some((e) => e.id === id), rectA?.id ?? '');
  check("A's rectangle visible on B's canvas", onB);
  const onA = await A.page.evaluate((id) => (window.__wbApi?.getSceneElements() ?? []).some((e) => e.id === id), rectB?.id ?? '');
  check("B's rectangle visible on A's canvas", onA);
  await shot(A.page, '03-studentA-after-both');
  await shot(B.page, '04-studentB-after-both');

  // A 화면에 B 요소가 있는지: A 가 전체선택(ctrl+a) 하면 선택 수 — 대신 DOM 접근이 어려우므로 서버 상태로 갈음하고 스크린샷 확인

  // 6. 교사 단일 모드 (타일 클릭)
  await tiles.first().click();
  await T.page.locator('.excalidraw').waitFor({ timeout: 20000 });
  await sleep(2500);
  check('teacher single mode has group select', await T.page.locator('select[aria-label="모둠 선택"]').count() === 1);
  await shot(T.page, '05-teacher-single');

  // 7. 잠금 → A 배지
  const lock = await api(T.ctx, 'PATCH', `/api/whiteboards/groups/${boardAB.id}`, { locked: true });
  check('lock via API', lock.status === 200);
  await A.page.getByText('편집 잠금').waitFor({ timeout: 8000 }).then(() => check('A shows lock badge', true)).catch(() => check('A shows lock badge', false));
  await shot(A.page, '06-studentA-locked');
  await api(T.ctx, 'PATCH', `/api/whiteboards/groups/${boardAB.id}`, { locked: false });
  await A.page.getByText('편집 잠금').waitFor({ state: 'detached', timeout: 8000 }).then(() => check('A lock badge cleared', true)).catch(() => check('A lock badge cleared', false));

  // 8. 두 번째 페이지(기본 템플릿 없음) → 학생 템플릿 선택 오버레이
  await A.page.goto(`${BASE}/student/study/${cfg.chapterId}/page/${cfg.page2Id}`);
  await A.page.getByText('템플릿으로 시작하거나').waitFor({ timeout: 20000 }).then(() => check('start template picker shown', true)).catch(() => check('start template picker shown', false));
  await shot(A.page, '07-studentA-picker');
  await A.page.getByTitle('T차트').click();
  await sleep(3000);
  const v2 = (await api(T.ctx, 'GET', `/api/whiteboards/page/${cfg.page2Id}${q}`)).json;
  const g2 = v2.groups.find((g) => g.name === '1모둠');
  const b2 = (await api(T.ctx, 'GET', `/api/whiteboards/groups/${g2.id}`)).json;
  check('picked template applied on page 2', b2.scene.elements.some((e) => e.customData?.template === 't-chart'), b2.scene.elements.length);
  await shot(A.page, '08-studentA-tchart');

  // 9. 교사 격자로 복귀 → 1모둠 타일이 실제로 그려졌는지 (흰색이 아닌 픽셀 존재)
  await T.page.goto(`${BASE}/teacher/classrooms/${cfg.classroomId}/chapters/${cfg.chapterId}/whiteboard/${cfg.pageId}`);
  await T.page.getByTitle('전체 모둠 보기').waitFor({ timeout: 20000 });
  await T.page.getByTitle('전체 모둠 보기').click(); // 단일 모드가 localStorage 에 남아 있을 수 있음
  await T.page.getByText('개 모둠').waitFor({ timeout: 20000 });
  await sleep(4000);
  const inked = await T.page.locator('button:has(canvas)').first().locator('canvas').evaluate((c) => {
    const ctx = c.getContext('2d');
    if (!c.width || !c.height) return -1;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 200 && d[i + 3] > 0) n++;
    return n;
  });
  check('teacher tile rendered with ink', inked > 50, inked);
  await shot(T.page, '09-teacher-grid-after');

  // 10. 콘솔/페이지 오류
  const realErrors = errors.filter((e) => !/favicon|manifest|sw\.js|Service Worker|DevTools|net::ERR_|Failed to load resource/i.test(e.msg));
  check('no page/console errors', realErrors.length === 0, realErrors.slice(0, 5));

  await Promise.all([T.ctx.close(), A.ctx.close(), B.ctx.close()]);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
