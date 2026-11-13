/**
 * 단원 불러오기·내보내기 스모크 (Playwright)
 *
 * 준비: 로컬 PostgreSQL, 서버(3001), Vite(3000) 실행 중. 시드는 매 실행 전에 새로 만든다.
 *   cd packages/server && npx tsx --env-file=.env scripts/unit-transfer-e2e-setup.ts > "$SCRATCH/ut.json"
 *   cd packages/client && node e2e/unit-transfer.smoke.mjs "$SCRATCH/ut.json" --api
 *   (시드 다시) node e2e/unit-transfer.smoke.mjs "$SCRATCH/ut.json" --ui [screenshotDir]
 *
 * --api: POST /api/units/copy — 빈 학급 복사, 같은 요청 반복(합침·옮김만), 일부 겹친 학급 합치기, 잘못된 요청 400/404.
 * --ui : [단원 불러오기]·[단원 내보내기] 모달 결과 문구, 필기 챕터 드롭다운이 같은 단원 챕터만, 콘솔 오류 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3000';
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mode = process.argv[3] || '--api';
const shotDir = process.argv[4] || null;
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`); if (!ok) failures++; };
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k]]));
const COUNT_KEYS = ['ok', 'unitsCreated', 'unitsMerged', 'chaptersCreated', 'chaptersMoved', 'videosCreated', 'videosMoved', 'linksUnresolved'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/** API 전용 컨텍스트 — 브라우저 탭의 refresh 와 토큰이 엇갈리지 않게 따로 로그인한다 */
async function apiClient() {
  const ctx = await browser.newContext();
  const res = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: cfg.email, password: cfg.password } });
  if (!res.ok()) throw new Error(`login failed: ${res.status()} ${await res.text()}`);
  const { token } = await res.json();
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: async (u) => (await ctx.request.get(`${BASE}${u}`, { headers })).json(),
    post: (u, data) => ctx.request.post(`${BASE}${u}`, { headers, data }),
  };
}

async function runApi() {
  const api = await apiClient();
  const copy = (unitIds, targetClassroomIds) => api.post('/api/units/copy', { unitIds, targetClassroomIds });
  const state = async (cid) => ({
    units: await api.get(`/api/classrooms/${cid}/units`),
    chapters: await api.get(`/api/classrooms/${cid}/chapters`),
    videos: await api.get(`/api/classrooms/${cid}/videos`),
  });

  // 1. 빈 학급으로 두 단원
  let res = await copy(cfg.sUnits, [cfg.T1]);
  let body = await res.json();
  check('S→T1 200', res.status() === 200, { status: res.status(), body });
  check('S→T1 개수', same(pick(body.results?.[0], COUNT_KEYS),
    { ok: true, unitsCreated: 2, unitsMerged: 0, chaptersCreated: 3, chaptersMoved: 0, videosCreated: 3, videosMoved: 0, linksUnresolved: 1 }), body);
  let t1 = await state(cfg.T1);
  check('T1 단원 2개, 2단원 숨김', t1.units.length === 2 && t1.units.find((u) => u.title === 'UT E2E 2단원')?.isHidden === true, t1.units);
  const t1v1 = t1.videos.find((x) => x.videoId === cfg.videos.v1);
  const t1Seq = t1.chapters.find((c) => c.title === '수열');
  check('T1 V1 필기 챕터 = T1 의 수열', t1v1?.chapterId && t1v1.chapterId === t1Seq?.id, { t1v1, t1Seq });
  check('T1 V1 메모 복사', t1v1?.note === 'V1 메모', t1v1?.note);
  const t1u1 = t1.units.find((u) => u.title === 'UT E2E 1단원');
  check('T1 수열은 1단원, 연결 챕터', t1Seq?.unitId === t1u1?.id && !!t1Seq?.sourceChapterId, t1Seq);

  // 2. 같은 요청 반복 → 합침·옮김만
  res = await copy(cfg.sUnits, [cfg.T1]);
  body = await res.json();
  check('S→T1 반복 개수', same(pick(body.results?.[0], COUNT_KEYS),
    { ok: true, unitsCreated: 0, unitsMerged: 2, chaptersCreated: 0, chaptersMoved: 3, videosCreated: 0, videosMoved: 3, linksUnresolved: 1 }), body);
  t1 = await state(cfg.T1);
  check('T1 개수 그대로(단원 2·챕터 3·영상 3)', t1.units.length === 2 && t1.chapters.length === 3 && t1.videos.length === 3,
    { u: t1.units.length, c: t1.chapters.length, v: t1.videos.length });

  // 3. 일부 겹친 학급에 1단원
  res = await copy([cfg.s1], [cfg.T2]);
  body = await res.json();
  check('S→T2 개수', same(pick(body.results?.[0], COUNT_KEYS),
    { ok: true, unitsCreated: 0, unitsMerged: 1, chaptersCreated: 1, chaptersMoved: 1, videosCreated: 1, videosMoved: 1, linksUnresolved: 1 }), body);
  const t2 = await state(cfg.T2);
  check('T2 V2 메모 기존 유지', t2.videos.find((x) => x.id === cfg.t2v2)?.note === '기존', t2.videos);
  check('T2 수열 챕터가 1단원으로', t2.chapters.find((c) => c.id === cfg.t2Seq)?.unitId === cfg.t2Unit, t2.chapters);
  check('T2 단원 1개', t2.units.length === 1, t2.units);

  // 4. 잘못된 요청
  res = await copy([cfg.s1], [cfg.S]);
  check('대상에 원본 학급 → 400', res.status() === 400, res.status());
  res = await copy([cfg.s1, cfg.t2Unit], [cfg.T1]);
  check('다른 학급 단원 섞음 → 400', res.status() === 400, res.status());
  res = await copy(['00000000-0000-4000-8000-000000000000'], [cfg.T1]);
  check('없는 단원 → 404', res.status() === 404, res.status());
  const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  res = await copy(many, [cfg.T1]);
  body = await res.json();
  check('51개 → 400 한국어 안내', res.status() === 400 && /50개/.test(body.error ?? ''), { status: res.status(), body });
}

async function runUi() {
  const api = await apiClient();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: cfg.email, password: cfg.password } });
  if (!login.ok()) throw new Error(`login failed: ${login.status()}`);
  const page = await ctx.newPage(); // 탭은 refresh 쿠키로 세션을 복원한다
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push(`dialog: ${d.message()}`); d.dismiss(); });
  const shot = (name) => (shotDir ? page.screenshot({ path: path.join(shotDir, `${name}.png`) }) : Promise.resolve());
  const dialog = page.getByRole('dialog');

  // 1. T1 챕터 탭에서 S 의 두 단원 불러오기
  await page.goto(`${BASE}/teacher/classrooms/${cfg.T1}?tab=chapters`);
  await page.getByRole('button', { name: '단원 불러오기' }).click();
  await dialog.waitFor();
  // 학급을 빨리 바꿨을 때 늦게 도착한 이전 학급의 단원 목록이 보이면 안 된다(S 응답을 늦춘 뒤 S → T2)
  const slowS = `**/api/classrooms/${cfg.S}/units`;
  await page.route(slowS, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await dialog.locator('select').selectOption(cfg.S);
  await dialog.locator('select').selectOption(cfg.T2);
  await page.waitForTimeout(2500);
  check('늦게 온 이전 학급 단원 목록 무시', !(await dialog.getByText('UT E2E 2단원').isVisible()), await dialog.innerText());
  await page.unroute(slowS);
  await dialog.locator('select').selectOption(cfg.S);
  await dialog.getByText('UT E2E 2단원').waitFor();
  await dialog.getByLabel('전체 선택').check();
  await dialog.getByRole('button', { name: '불러오기', exact: true }).click();
  const importLine = dialog.getByText(/단원 새로 2/);
  await importLine.waitFor();
  const importText = await importLine.innerText();
  check('불러오기 결과 줄', importText.includes('단원 새로 2') && importText.includes('필기 챕터 연결 못 함 1'), importText);
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  check('배경 클릭으로 안 닫힘', await dialog.isVisible());
  await shot('1-import-result');
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const cards = page.locator('button[aria-label*=" · 챕터 "]');
  await cards.first().waitFor();
  check('T1 단원 카드 2장', (await cards.count()) === 2, await cards.allInnerTexts());

  // 2. S 영상 탭에서 1단원만 T2 로 내보내기 — 학급 목록을 읽는 동안은 '불러오는 중', 복사 중에는 체크 잠금
  await page.goto(`${BASE}/teacher/classrooms/${cfg.S}?tab=videos`);
  const slowOther = '**/api/classrooms/other/**';
  await page.route(slowOther, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.getByRole('button', { name: '단원 내보내기' }).click();
  await dialog.waitFor();
  await page.waitForTimeout(300);
  check('학급 목록 읽는 중 안내', (await dialog.getByText('불러오는 중').count()) > 0
    && (await dialog.getByText('내보낼 수 있는 다른 학급이 없습니다').count()) === 0, await dialog.innerText());
  await dialog.getByLabel('UT E2E 겹친반').waitFor(); // 늦춘 응답이 끝난 뒤에 route 를 푼다
  await page.unroute(slowOther);
  await dialog.getByLabel('UT E2E 1단원').check();
  await dialog.getByLabel('UT E2E 겹친반').check();
  const slowCopy = '**/api/units/copy';
  await page.route(slowCopy, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await dialog.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.waitForTimeout(300);
  check('복사 중에는 체크 잠금', await dialog.getByLabel('UT E2E 겹친반').isDisabled(), null);
  const exportLine = dialog.getByText(/UT E2E 겹친반:/);
  await exportLine.waitFor();
  await page.unroute(slowCopy);
  const exportText = await exportLine.innerText();
  check('내보내기 결과 합침 1', exportText.includes('합침 1'), exportText);
  await shot('2-export-result');
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();

  // 3. T1 1단원 영상 카드의 필기 챕터 선택지 = 그 단원 챕터만
  const t1Units = await api.get(`/api/classrooms/${cfg.T1}/units`);
  const u1 = t1Units.find((u) => u.title === 'UT E2E 1단원');
  await page.goto(`${BASE}/teacher/classrooms/${cfg.T1}?tab=videos&unit=${u1.id}`);
  const card = page.locator('div', { has: page.getByText('UT E2E V1', { exact: true }) })
    .filter({ has: page.locator('select[title^="학생이 2분할"]') }).last();
  const select = card.locator('select[title^="학생이 2분할"]');
  await select.waitFor();
  await page.waitForFunction((el) => el.options.length > 1, await select.elementHandle()); // 챕터 목록은 따로 읽는다
  const options = await select.locator('option').allInnerTexts();
  check('V1 필기 챕터 선택지 = 연결 없음, 수열, 급수', same(options, ['연결 없음', '수열', '급수']), options);
  await shot('3-dropdown');

  check('콘솔 오류 없음', errors.length === 0, errors);
}

try {
  if (mode === '--api') await runApi();
  else if (mode === '--ui') await runUi();
  else throw new Error(`unknown mode ${mode}`);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
}
if (shotDir) console.log(`screenshots: ${shotDir}`);
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
