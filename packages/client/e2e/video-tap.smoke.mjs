/**
 * 영상 플레이어 터치 조작 창 스모크 (Playwright, 터치 문맥)
 *
 * 준비: 로컬 PostgreSQL, 서버(3001), Vite(3000) 실행 중, ffmpeg.
 *   cd packages/server && npx tsx --env-file=.env scripts/video-tap-e2e-setup.ts > "$SCRATCH/vt.json"
 *   cd packages/client && node e2e/video-tap.smoke.mjs "$SCRATCH/vt.json" [screenshotDir]
 *
 * 검증: 탭 → 조작 창(가운데 버튼 + 아래 바)이 뜨고 재생은 그대로 / 다시 탭 → 닫힘(호환 mouse 이벤트로 다시 열리지 않음) /
 *       가운데 일시정지 → 정지, 3초 뒤 정지 중에도 닫힘 / 두 번 탭 → 이동 / 꾹 누르기 알약은 위쪽, 설명 줄 없음 / 콘솔 오류 0.
 * 스펙: docs/superpowers/specs/2026-11-13-video-tap-controls-design.md
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

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const errors = [];

try {
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 800 } });
  const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: cfg.email, password: cfg.password } });
  if (!login.ok()) throw new Error(`login failed: ${login.status()}`);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = (name) => (shotDir ? page.screenshot({ path: path.join(shotDir, `${name}.png`) }) : Promise.resolve());

  await page.goto(`${BASE}/teacher/classrooms/${cfg.classroomId}/videos/${cfg.cvId}`);
  const video = page.locator('video').first();
  await video.waitFor();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
  const box = await video.boundingBox();
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const rightQ = { x: box.x + box.width * 0.8, y: box.y + box.height / 2 };
  const empty = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.3 }; // 버튼이 없는 빈 자리

  const state = () => page.evaluate(() => {
    const v = document.querySelector('video');
    const bar = document.querySelector('input[aria-label="재생 위치"]')?.closest('.bottom-0');
    return { paused: v.paused, time: v.currentTime, barShown: !!bar && bar.className.includes('opacity-100') };
  });
  const centerGroup = page.locator('[role="group"][aria-label="재생 조작"]');
  const tap = (p) => page.touchscreen.tap(p.x, p.y);
  const waitHidden = async (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (!(await state()).barShown) return true; await sleep(100); }
    return false;
  };

  await page.evaluate(() => document.querySelector('video').play());
  await page.waitForFunction(() => !document.querySelector('video').paused);
  check('재생 시작 후 창이 저절로 닫힘', await waitHidden(5000), await state());

  // 1. 탭 → 창 열림, 재생 그대로
  await tap(center);
  await sleep(150);
  let s = await state();
  check('탭 → 아래 바 표시', s.barShown, s);
  check('탭 → 가운데 버튼 묶음(일시정지·뒤로·앞으로)', (await centerGroup.locator('button').count()) === 3
    && (await centerGroup.locator('button[aria-label="일시정지"]').count()) === 1, await centerGroup.count());
  check('탭 → 재생은 그대로', !s.paused, s);
  await shot('1-controls-open');

  // 2. 빈 자리를 다시 탭 → 닫힘, 잠시 뒤에도 닫힘 유지 (가운데는 이제 재생 버튼 자리)
  await sleep(400);
  await tap(empty);
  await sleep(150);
  s = await state();
  check('다시 탭 → 창 닫힘', !s.barShown && (await centerGroup.count()) === 0, s);
  await sleep(600);
  s = await state();
  check('닫힘 유지(호환 mouse 이벤트로 다시 안 열림)', !s.barShown, s);
  check('다시 탭 → 재생은 그대로', !s.paused, s);

  // 3. 가운데 일시정지 → 정지, 정지 중에도 3초 뒤 닫힘
  await sleep(400);
  await tap(center);
  await sleep(150);
  const pauseBtn = centerGroup.locator('button[aria-label="일시정지"]');
  const pb = await pauseBtn.boundingBox();
  await tap({ x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 });
  await sleep(200);
  s = await state();
  check('가운데 일시정지 → 정지', s.paused, s);
  check('정지 직후 창 보임', s.barShown, s);
  await sleep(3500);
  s = await state();
  check('정지 중에도 3초 뒤 창 닫힘', !s.barShown, s);

  // 4. 두 번 탭(오른쪽) → 앞으로 이동
  const before = (await state()).time;
  await tap(rightQ);
  await sleep(150);
  await tap(rightQ);
  await sleep(500);
  const after = (await state()).time;
  check('두 번 탭 → 약 +10초', Math.abs(after - before - 10) <= 1.5, { before, after });

  // 5. 꾹 누르기 → 2배속 알약이 위쪽, 설명 줄 없음
  await page.evaluate(() => document.querySelector('video').play());
  await sleep(300);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rightQ.x, y: rightQ.y }] });
  await sleep(900);
  const pill = page.getByText('2배속', { exact: true });
  const pillBox = await pill.boundingBox().catch(() => null);
  const hint = await page.getByText('누르고 있는 동안').count();
  await shot('2-hold');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('2배속 알약이 영상 위쪽 25% 안', !!pillBox && pillBox.y - box.y < box.height * 0.25, { pillBox, box });
  check('설명 줄 없음', hint === 0, hint);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  check('콘솔 오류 없음', errors.length === 0, errors);
  await browser.close();
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
