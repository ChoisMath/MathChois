/**
 * AI활용 허브 브라우저 스모크 (Chromium, Playwright)
 *
 * 준비: 로컬 PostgreSQL, 서버(3001), Vite(3000) 실행 중.
 *   cd packages/server && npx tsx --env-file=.env scripts/ai-hub-e2e-setup.ts > "$SCRATCH/aihub.json"
 *   cd packages/client && node e2e/ai-hub.smoke.mjs "$SCRATCH/aihub.json" [screenshotDir]
 *   cd packages/server && npx tsx --env-file=.env scripts/ai-hub-e2e-setup.ts --cleanup   # 끝나면 정리
 * Playwright 가 기대하는 Chromium 리비전이 설치돼 있지 않으면 실행 파일을 직접 지정한다:
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node e2e/ai-hub.smoke.mjs ...
 * 브랜드 iframe 은 앱 origin 에서만 frame 되므로 `localhost:3000` 으로 연다(127.0.0.1 은 frame-ancestors 에 없다).
 *
 * 검증: 스위치가 꺼진 학급의 학생은 /ai → /student/classrooms 로 돌아간다 → 교사가 학급 상세 `#` 패널의 스위치를 켜면
 *       학생 학급 헤더에 `AI활용` 단추가 생기고 → /ai/motion 카드 1장 → 상세에서 영문 복사 단추 활성 → /ai/slide 빈 상태 →
 *       /ai/brand iframe 이 로드된다. 교사는 /ai/motion/01-pixel/edit 에서 `세부 설정` 이 있고 값을 입력하면 글자 수가 바뀐다.
 *       콘솔 오류 0개.
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
const pathOf = (page) => new URL(page.url()).pathname;
/** 학급 상세가 목록을 다 받은 뒤에 주소를 바꾼다 — 받는 중에 새로 불러오면 `Failed to fetch` 콘솔 오류가 스모크 탓으로 섞인다 */
const settle = (page) => page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

const classUrl = (role) => `${BASE}/${role}/classrooms/${cfg.classroomId}`;

try {
  // ── 학생: 스위치가 꺼져 있을 때 ──
  const S = await session(cfg.student.email);
  const sp = S.page;
  await sp.goto(classUrl('student'));
  await sp.locator('h2').first().waitFor({ timeout: 20000 });
  await settle(sp);
  check('student: no AI활용 button while the switch is off', (await sp.getByRole('button', { name: 'AI활용' }).count()) === 0);
  await sp.goto(`${BASE}/ai`);
  await sp.waitForURL(/\/student\/classrooms$/, { timeout: 15000 });
  check('student: /ai with the switch off → back to /student/classrooms', pathOf(sp) === '/student/classrooms', sp.url());

  // ── 교사: 학급 상세의 스위치 켜기 ──
  const Te = await session(cfg.teacher.email);
  const tp = Te.page;
  await tp.goto(classUrl('teacher'));
  await tp.getByRole('button', { name: '클래스 코드·표지 색 보기' }).click();
  const toggle = tp.getByRole('switch', { name: '학생에게 AI활용 열기' });
  await toggle.waitFor({ timeout: 20000 });
  check('teacher: AI활용 switch starts off', (await toggle.getAttribute('aria-checked')) === 'false');
  const patched = tp.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes(`/api/classrooms/${cfg.classroomId}`));
  await toggle.click();
  check('teacher: PATCH turning the switch on succeeds', (await patched).ok());
  check('teacher: AI활용 switch is on', (await toggle.getAttribute('aria-checked')) === 'true');
  check('teacher: header has the AI활용 button', (await tp.getByRole('button', { name: 'AI활용' }).count()) === 1);
  await settle(tp);
  await shot(tp, '01-teacher-switch-on');

  // ── 학생: 단추 → 모션 갤러리 ──
  await sp.goto(classUrl('student'));
  const aiBtn = sp.getByRole('button', { name: 'AI활용' });
  await aiBtn.waitFor({ timeout: 20000 });
  check('student: AI활용 button appears once the switch is on', (await aiBtn.count()) === 1);
  await settle(sp);
  await aiBtn.click();
  await sp.waitForURL(/\/ai\/motion$/, { timeout: 15000 });
  check('student: AI활용 button → /ai/motion', pathOf(sp) === '/ai/motion', sp.url());
  const cards = sp.getByTestId('motion-card');
  await cards.first().waitFor({ timeout: 20000 });
  check('student: /ai/motion shows exactly 1 card', (await cards.count()) === 1, await cards.count());
  await shot(sp, '02-student-motion');

  await cards.first().click();
  await sp.waitForURL(new RegExp(`/ai/motion/${cfg.motionId}$`), { timeout: 15000 });
  const copyEn = sp.getByTestId('copy-prompt-en');
  await copyEn.waitFor({ timeout: 20000 });
  check('student: detail copy-prompt-en is enabled', await copyEn.isEnabled());
  check('student: detail copy-prompt-ko is enabled', await sp.getByTestId('copy-prompt-ko').isEnabled());
  check('student: no edit link for students', (await sp.getByRole('link', { name: '빈칸 편집·장면표' }).count()) === 0);
  await shot(sp, '03-student-motion-detail');

  // ── 학생: 슬라이드(빈 상태)·브랜드 ──
  await sp.getByRole('link', { name: '슬라이드', exact: true }).click();
  await sp.waitForURL(/\/ai\/slide$/, { timeout: 15000 });
  const slideEmpty = sp.getByTestId('slide-empty');
  await slideEmpty.waitFor({ timeout: 20000 });
  check('student: /ai/slide shows the empty-state text', (await slideEmpty.innerText()).includes('예시 슬라이드를 준비하고 있어요'), await slideEmpty.innerText());
  await shot(sp, '04-student-slide-empty');

  await sp.getByRole('link', { name: '브랜드', exact: true }).click();
  await sp.waitForURL(/\/ai\/brand$/, { timeout: 15000 });
  const heading = sp.frameLocator('[data-testid="brand-frame"]').locator('#brand-e2e');
  await heading.waitFor({ timeout: 20000 });
  check('student: /ai/brand iframe loads the lookbook', (await heading.innerText()) === cfg.brandHeading, await heading.innerText());
  await shot(sp, '05-student-brand');

  // ── 교사: 편집기 ──
  await tp.goto(`${BASE}/ai/motion/${cfg.motionId}/edit`);
  const more = tp.getByTestId('rows-more');
  await more.waitFor({ timeout: 20000 });
  check('teacher: editor has the 세부 설정 fold for the old-style template', (await more.getByText('세부 설정').count()) === 1);
  const len = tp.getByTestId('prompt-len');
  const before = await len.innerText();
  await tp.locator('#ai-f-0').fill('AI허브 스모크 채널 이름 길게 입력');
  await tp.waitForFunction(
    ([sel, prev]) => document.querySelector(sel)?.textContent !== prev,
    ['[data-testid="prompt-len"]', before],
    { timeout: 10000 },
  ).catch(() => {});
  const after = await len.innerText();
  check('teacher: typing a value changes the prompt length', before !== after, { before, after });
  check('teacher: the typed value appears in the prompt preview',
    (await tp.getByTestId('prompt-preview').innerText()).includes('AI허브 스모크 채널 이름 길게 입력'));
  await shot(tp, '06-teacher-editor');

  await sleep(500);
  check('no console errors', errors.length === 0, errors);
} catch (err) {
  check('smoke ran to completion', false, String(err && err.stack || err));
} finally {
  await browser.close();
}
process.exit(failures ? 1 : 0);
