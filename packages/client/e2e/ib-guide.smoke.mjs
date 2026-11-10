/**
 * IB교육과정 안내 — 보호 쪽 보기 브라우저 스모크 (Chromium, Playwright)
 *
 * 준비: 로컬 PostgreSQL, 서버(3001), Vite(3000) 실행 중.
 *   cd packages/server && npx tsx --env-file=.env scripts/ib-guide-e2e-setup.ts > "$SCRATCH/ib.json"
 *   cd packages/client && node e2e/ib-guide.smoke.mjs "$SCRATCH/ib.json" [screenshotDir]
 *   cd packages/server && npx tsx --env-file=.env scripts/ib-guide-e2e-setup.ts --cleanup   # 끝나면 정리
 * Playwright 가 기대하는 Chromium 이 없으면 CHROMIUM_PATH 로 실행 파일을 지정한다.
 *
 * 검증(10): 스위치 꺼짐 → 학생에게 IB안내 단추 없음·/ib/ia 는 /student/classrooms 로 → 교사가 스위치 켬 → 학생 목록 카드 2장 →
 *   예시 1 쪽 보기(캔버스 3개, 1 / 3) → 3쪽에서 탭 이동(주석본 3 / 3, 채점 코멘트 1 / 1, 학생 보고서 3 / 3) → 예시 2 의 빈 탭 비활성 →
 *   네트워크(PDF·/api/files/ib-guide 없음, 쪽 응답 no-store, <img>·blob: 없음) → 인쇄 매체에서 캔버스 숨김 →
 *   교사가 스위치를 끈 뒤 아직 안 받은 쪽(다른 탭)을 열면 /student/classrooms 로 → 콘솔 오류 0개.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shotDir = process.argv[3] || null;
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
const responses = [];
// 9단계(스위치를 끈 뒤 쪽 요청)의 403 은 의도한 것 — 브라우저가 남기는 "Failed to load resource ... 403" 만 뺀다
let expect403 = false;

async function session(email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const res = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password: cfg.password } });
  if (!res.ok()) throw new Error(`login failed ${email}: ${res.status()} ${await res.text()}`);
  const page = await ctx.newPage(); // 브라우저 탭은 refresh 쿠키로 세션을 복원한다
  page.on('pageerror', (e) => errors.push({ email, type: 'pageerror', msg: String(e) }));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expect403 && m.text().includes('403') && (m.location()?.url ?? '').includes('/api/ib/ia/')) return;
    errors.push({ email, type: 'console', msg: m.text(), url: m.location()?.url });
  });
  page.on('response', (r) => responses.push({ url: r.url(), status: r.status(), headers: r.headers() }));
  page.on('request', (r) => responses.push({ url: r.url(), request: true }));
  return { ctx, page };
}
const shot = (page, name) => (shotDir ? page.screenshot({ path: path.join(shotDir, `${name}.png`) }) : Promise.resolve());
const pathOf = (page) => new URL(page.url()).pathname;
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
const classUrl = (role) => `${BASE}/${role}/classrooms/${cfg.classroomId}`;
const indicator = (page) => page.getByTestId('ia-page-indicator');
const waitIndicator = (page, text) => page.waitForFunction(
  (t) => document.querySelector('[data-testid="ia-page-indicator"]')?.textContent?.replace(/\s+/g, ' ').trim() === t,
  text, { timeout: 10000 },
).catch(() => {});
const indText = async (page) => (await indicator(page).innerText()).replace(/\s+/g, ' ').trim();
/** n 번째 캔버스가 그려질 때까지(캔버스 폭 > 0) */
const waitDrawn = (page, n) => page.waitForFunction(
  (i) => (document.querySelectorAll('canvas.ia-page-canvas')[i - 1]?.width ?? 0) > 0 && document.querySelector(`.ia-page[data-page="${i}"]`)?.dataset.status === 'drawn',
  n, { timeout: 15000 },
);

async function setSwitch(tp, on) {
  await tp.goto(classUrl('teacher'));
  await tp.getByRole('button', { name: '클래스 코드·표지 색 보기' }).click();
  const toggle = tp.getByRole('switch', { name: '학생에게 IB 안내 열기' });
  await toggle.waitFor({ timeout: 20000 });
  if ((await toggle.getAttribute('aria-checked')) === String(on)) return true;
  const patched = tp.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes(`/api/classrooms/${cfg.classroomId}`));
  await toggle.click();
  const ok = (await patched).ok();
  await settle(tp);
  return ok && (await toggle.getAttribute('aria-checked')) === String(on);
}

try {
  // 1. 스위치가 꺼져 있을 때
  const S = await session(cfg.student.email, { deviceScaleFactor: 2 });
  const sp = S.page;
  await sp.goto(classUrl('student'));
  await sp.locator('h2').first().waitFor({ timeout: 20000 });
  await settle(sp);
  const noBtn = (await sp.getByRole('button', { name: 'IB안내' }).count()) === 0;
  await sp.goto(`${BASE}/ib/ia`);
  await sp.waitForURL(/\/student\/classrooms$/, { timeout: 15000 }).catch(() => {});
  check('1. switch off: no IB안내 button, /ib/ia → /student/classrooms', noBtn && pathOf(sp) === '/student/classrooms', { noBtn, url: sp.url() });

  // 2. 교사가 스위치를 켠다
  const Te = await session(cfg.teacher.email);
  const tp = Te.page;
  check('2. teacher turns on 학생에게 IB 안내 열기', await setSwitch(tp, true));

  // 3. 학생: IB안내 단추 → 목록
  await sp.goto(classUrl('student'));
  const ibBtn = sp.getByRole('button', { name: 'IB안내' });
  await ibBtn.waitFor({ timeout: 20000 });
  await settle(sp);
  await ibBtn.click();
  await sp.waitForURL(/\/ib\/ia$/, { timeout: 15000 });
  const cards = sp.locator('.ib-guide-card');
  await cards.first().waitFor({ timeout: 20000 });
  const card1 = (await cards.nth(0).innerText()).replace(/\s+/g, ' ');
  check('3. IB안내 → /ib/ia with 2 cards; 예시 1 shows 학생 보고서 3쪽 · 주석본 3쪽 · 채점 코멘트 1쪽',
    (await cards.count()) === 2 && ['예시 1', '학생 보고서 3쪽', '주석본 3쪽', '채점 코멘트 1쪽'].every((t) => card1.includes(t)),
    { count: await cards.count(), card1 });

  // 4. 예시 1 열기
  await cards.nth(0).click();
  await sp.waitForURL(/\/ib\/ia\/ex01/, { timeout: 15000 });
  await sp.locator('canvas.ia-page-canvas').first().waitFor({ timeout: 20000 });
  await waitDrawn(sp, 1);
  const canvases = sp.locator('canvas.ia-page-canvas');
  const firstW = await canvases.first().evaluate((c) => c.width);
  await waitIndicator(sp, '1 / 3');
  check('4. 예시 1: 3 canvases, first drawn (width > 0), indicator 1 / 3',
    (await canvases.count()) === 3 && firstW > 0 && (await indText(sp)) === '1 / 3',
    { count: await canvases.count(), firstW, ind: await indText(sp) });
  await sleep(300);
  await shot(sp, '01-viewer-ex01-p1');

  // 5. 3쪽에서 탭 이동
  await sp.locator('.ia-viewer-slot[data-page="3"]').evaluate((el) => {
    const sc = document.querySelector('.ia-viewer-scroll');
    sc.scrollTop = el.offsetTop - sc.offsetTop;
  });
  await waitIndicator(sp, '3 / 3');
  const at3 = await indText(sp);
  await sp.getByRole('tab', { name: '주석본' }).click();
  await waitIndicator(sp, '3 / 3');
  const annUrl = sp.url();
  const ann = await indText(sp);
  await waitDrawn(sp, 3);
  await sleep(300);
  await shot(sp, '02-viewer-annotated-from-p3');
  await sp.getByRole('tab', { name: '채점 코멘트' }).click();
  await waitIndicator(sp, '1 / 1');
  const com = await indText(sp);
  await sp.getByRole('tab', { name: '학생 보고서' }).click();
  await waitIndicator(sp, '3 / 3');
  const stu = await indText(sp);
  check('5. tabs carry the page: 3 / 3 → 주석본 (doc=annotated) 3 / 3 → 채점 코멘트 1 / 1 → 학생 보고서 3 / 3',
    at3 === '3 / 3' && annUrl.includes('doc=annotated') && ann === '3 / 3' && com === '1 / 1' && stu === '3 / 3',
    { at3, annUrl, ann, com, stu });

  // 6. 예시 2: 없는 문서 탭은 비활성
  await sp.getByRole('button', { name: '다음 예시' }).click();
  await sp.waitForURL(/\/ib\/ia\/ex02/, { timeout: 15000 });
  await waitDrawn(sp, 1);
  check('6. 예시 2: 주석본 and 채점 코멘트 tabs are disabled',
    await sp.getByRole('tab', { name: '주석본' }).isDisabled() && await sp.getByRole('tab', { name: '채점 코멘트' }).isDisabled()
      && await sp.getByRole('tab', { name: '학생 보고서' }).isEnabled(),
    null);

  // 폰 폭(390) 화면 — 스크린샷용, 가로 스크롤도 본다
  await sp.goto(`${BASE}/ib/ia/ex01`);
  await sp.setViewportSize({ width: 390, height: 844 });
  await waitDrawn(sp, 1);
  await sleep(300);
  const hScroll = await sp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth
    || (() => { const sc = document.querySelector('.ia-viewer-scroll'); return sc.scrollWidth > sc.clientWidth; })());
  console.log(`  (390px: horizontal scroll = ${hScroll})`);
  await shot(sp, '03-viewer-390');
  await sp.setViewportSize({ width: 1280, height: 800 });

  // 7. 네트워크
  const pageResps = responses.filter((r) => !r.request && /\/api\/ib\/ia\/[^/]+\/[^/]+\/pages\/\d+/.test(r.url));
  const pdfResp = responses.filter((r) => !r.request && (r.headers['content-type'] ?? '').includes('pdf'));
  const filesReq = responses.filter((r) => r.url.includes('/api/files/ib-guide'));
  const badCache = pageResps.filter((r) => r.status === 200 && r.headers['cache-control'] !== 'private, no-store');
  const imgs = await sp.evaluate(() => [...document.images].map((i) => i.src).filter((s) => s.includes('/api/ib/')));
  const blobs = await sp.evaluate(() => performance.getEntries().map((e) => e.name).filter((n) => n.startsWith('blob:')));
  check('7. network: no PDF, no /api/files/ib-guide, page responses private no-store, no <img> of /api/ib/, no blob: URLs',
    pageResps.length > 0 && pdfResp.length === 0 && filesReq.length === 0 && badCache.length === 0 && imgs.length === 0 && blobs.length === 0,
    { pages: pageResps.length, pdfResp, filesReq, badCache, imgs, blobs });

  // 8. 인쇄 매체
  await sp.emulateMedia({ media: 'print' });
  const shownInPrint = await sp.evaluate(() => [...document.querySelectorAll('canvas')].filter((c) => c.getClientRects().length > 0).length);
  const totalCanvas = await sp.locator('canvas').count();
  await sp.emulateMedia({ media: 'screen' });
  check('8. print media hides every canvas', totalCanvas > 0 && shownInPrint === 0, { totalCanvas, shownInPrint });

  // 9. 스위치를 끈 뒤 아직 받지 않은 쪽 → 학급 목록으로
  // (예시 1 학생 보고서 3쪽은 처음에 모두 받으므로, 아직 받지 않은 주석본 쪽을 연다 — 주소는 그대로라 경로 재확인이 아니라 쪽 응답 403 이 보낸다)
  await sp.reload();
  await waitDrawn(sp, 1);
  await settle(sp);
  const switchedOff = await setSwitch(tp, false);
  expect403 = true;
  const denied = sp.waitForResponse((r) => /\/api\/ib\/ia\/ex01\/annotated\/pages\/\d+/.test(r.url()), { timeout: 15000 });
  await sp.getByRole('tab', { name: '주석본' }).click();
  const deniedStatus = (await denied).status();
  await sp.waitForURL(/\/student\/classrooms$/, { timeout: 15000 }).catch(() => {});
  check('9. teacher turns the switch off → not-yet-loaded page answers 403 → /student/classrooms',
    switchedOff && deniedStatus === 403 && pathOf(sp) === '/student/classrooms', { switchedOff, deniedStatus, url: sp.url() });

  await settle(sp);
  await sleep(500);
  check('10. no console errors', errors.length === 0, errors);
} catch (err) {
  check('smoke ran to completion', false, String(err && err.stack || err));
} finally {
  await browser.close();
}
process.exit(failures ? 1 : 0);
