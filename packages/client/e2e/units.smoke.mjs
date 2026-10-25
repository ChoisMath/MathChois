/**
 * 학급 단원 브라우저 스모크 (Chromium, Playwright)
 *
 * 준비: 로컬 PostgreSQL, 서버(3001), Vite(3000) 실행 중.
 *   cd packages/server && npx tsx --env-file=.env scripts/units-e2e-setup.ts > "$SCRATCH/units.json"
 *   cd packages/client && node e2e/units.smoke.mjs "$SCRATCH/units.json" [screenshotDir]
 * Playwright 가 기대하는 Chromium 리비전이 설치돼 있지 않으면 실행 파일을 직접 지정한다:
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node e2e/units.smoke.mjs ...
 *
 * 검증: 학생 — 단원 카드 2장 + `기타 자료`(숨김 단원 이름 없음) → u1 열기(주소 unit=u1, 챕터 2개) → 챕터 열기 →
 *       브라우저 뒤로 가기·뷰어의 나가기 버튼 모두 u1 안 화면 → 영상 탭(tab=videos&unit=u1, 영상 1개).
 *       교사 — 숨김 단원 카드의 `숨김` 배지, 단원 u2 의 유일한 챕터를 u1 로 옮겨도 u2 안 화면에 머물고
 *       `이 단원에 챕터가 없습니다` 가 보임. 콘솔 오류 0개.
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
  const page = await ctx.newPage(); // 브라우저 탭은 refresh 쿠키로 세션을 복원한다
  page.on('pageerror', (e) => errors.push({ email, type: 'pageerror', msg: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ email, type: 'console', msg: m.text() }); });
  return { ctx, page };
}
const shot = (page, name) => (shotDir ? page.screenshot({ path: path.join(shotDir, `${name}.png`) }) : Promise.resolve());
const params = (page) => new URL(page.url()).searchParams;
/** 단원 카드 = aria-label `{이름} · 챕터|영상 N개[ · 숨김]` 인 버튼 */
const unitCards = (page) => page.locator('button[aria-label*=" · 챕터 "], button[aria-label*=" · 영상 "]');
const unitCard = (page, title) => page.getByRole('button', { name: new RegExp(`^${title} · `) });

const { u1, u2, uh } = cfg.units;
const T = cfg.unitTitles;
const C = cfg.chapterTitles;

try {
  // ── 학생 ──
  const S = await session(cfg.student.email);
  const sp = S.page;
  const classUrl = `${BASE}/student/classrooms/${cfg.classroomId}`;
  await sp.goto(classUrl);
  await unitCard(sp, T.u1).waitFor({ timeout: 20000 });
  const labels = await unitCards(sp).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check('student: unit cards u1, u2 + 기타 자료', labels.length === 3
    && labels.some((l) => l.startsWith(`${T.u1} · 챕터 2개`))
    && labels.some((l) => l.startsWith(`${T.u2} · 챕터 1개`))
    && labels.some((l) => l.startsWith('기타 자료 · 챕터')), labels);
  const bodyText = await sp.locator('body').innerText();
  check('student: hidden unit name absent', !bodyText.includes(T.uh) && !bodyText.includes(C.ch), bodyText.slice(0, 300));
  await shot(sp, '01-student-units');

  await unitCard(sp, T.u1).click();
  await sp.getByText(C.c1a, { exact: true }).waitFor({ timeout: 10000 });
  check('student: open u1 → URL unit=u1', params(sp).get('unit') === u1, sp.url());
  check('student: u1 shows 2 chapter cards',
    (await sp.getByText(C.c1a, { exact: true }).count()) === 1 && (await sp.getByText(C.c1b, { exact: true }).count()) === 1
    && (await unitCards(sp).count()) === 0, await sp.locator('body').innerText());
  await shot(sp, '02-student-unit-chapters');

  // 챕터 열기 → 브라우저 뒤로 가기
  await sp.getByText(C.c1a, { exact: true }).click();
  await sp.waitForURL(/\/student\/study\//, { timeout: 15000 });
  await sp.locator('button[title="학급으로 돌아가기"]').waitFor({ timeout: 20000 });
  await sp.goBack();
  await sp.getByText(C.c1a, { exact: true }).waitFor({ timeout: 10000 });
  check('student: viewer → browser back → back inside u1', params(sp).get('unit') === u1 && (await sp.getByText(C.c1b, { exact: true }).count()) === 1, sp.url());

  // 챕터 열기 → 뷰어의 나가기 버튼
  await sp.getByText(C.c1b, { exact: true }).click();
  await sp.waitForURL(/\/student\/study\//, { timeout: 15000 });
  const exitBtn = sp.locator('button[title="학급으로 돌아가기"]');
  await exitBtn.waitFor({ timeout: 20000 });
  await sleep(500); // 챕터 정보(unitId) 가 채워진 뒤
  await exitBtn.click();
  await sp.getByText(C.c1a, { exact: true }).waitFor({ timeout: 10000 });
  const p2 = params(sp);
  check('student: viewer exit button → ?tab=chapters&unit=u1', p2.get('tab') === 'chapters' && p2.get('unit') === u1
    && (await sp.getByText(C.c1b, { exact: true }).count()) === 1, sp.url());

  // 영상 탭 — 단원 유지
  await sp.getByRole('button', { name: /^영상\s*\d*$/ }).click();
  await sp.getByText(cfg.videoTitle, { exact: true }).first().waitFor({ timeout: 10000 });
  const p3 = params(sp);
  check('student: videos tab → tab=videos&unit=u1', p3.get('tab') === 'videos' && p3.get('unit') === u1, sp.url());
  check('student: u1 shows 1 video card', (await sp.getByText(cfg.videoTitle, { exact: true }).count()) === 1
    && (await unitCards(sp).count()) === 0, await sp.locator('body').innerText());
  await shot(sp, '03-student-unit-videos');

  // ── 교사 ──
  const Te = await session(cfg.teacher.email);
  const tp = Te.page;
  await tp.goto(`${BASE}/teacher/classrooms/${cfg.classroomId}`);
  await unitCard(tp, T.uh).waitFor({ timeout: 20000 });
  const hiddenLabel = await unitCard(tp, T.uh).getAttribute('aria-label');
  check('teacher: hidden unit card has 숨김 badge', hiddenLabel.endsWith(' · 숨김')
    && (await unitCard(tp, T.uh).getByText('숨김', { exact: true }).count()) === 1, hiddenLabel);
  check('teacher: visible units have no 숨김 badge', !(await unitCard(tp, T.u1).getAttribute('aria-label')).includes('숨김')
    && !(await unitCard(tp, T.u2).getAttribute('aria-label')).includes('숨김'));
  await shot(tp, '04-teacher-units');

  // Review Focus 5: 단원의 마지막 항목을 다른 단원으로 옮겨도 그 단원 안 화면에 머문다
  await unitCard(tp, T.u2).click();
  await tp.getByText(C.c2, { exact: true }).waitFor({ timeout: 10000 });
  check('teacher: open u2 → URL unit=u2', params(tp).get('unit') === u2, tp.url());
  const unitSelect = tp.locator('select[title="이 항목이 들어갈 단원"]');
  check('teacher: u2 has exactly one chapter card with a unit select', (await unitSelect.count()) === 1, await unitSelect.count());
  const moved = tp.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes(`/api/chapters/${cfg.chapters.c2}`));
  await unitSelect.selectOption(u1);
  check('teacher: PATCH moving the chapter to u1 succeeds', (await moved).ok());
  await tp.getByText('이 단원에 챕터가 없습니다').waitFor({ timeout: 10000 });
  check('teacher: stays inside u2 and shows 이 단원에 챕터가 없습니다', params(tp).get('unit') === u2
    && (await tp.getByText('이 단원에 챕터가 없습니다').count()) === 1, tp.url());
  await shot(tp, '05-teacher-empty-unit');

  await sleep(500);
  check('no console errors', errors.length === 0, errors);
} catch (err) {
  check('smoke ran to completion', false, String(err && err.stack || err));
} finally {
  await browser.close();
}
process.exit(failures ? 1 : 0);
