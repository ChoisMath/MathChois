/**
 * 학급 상세 탭 브라우저 스모크 (Chromium, Playwright) — 게시판 표, 모둠 드래그 보드(포인터·키보드·모둠 수), 접히는 학생 표 +
 * AI 풀이 초기화, 대시보드 세 보기와 주소 보정, 폰 폭.
 *
 * 준비: 로컬 PostgreSQL, 서버(3001), Vite(3000) 실행 중.
 *   cd packages/server && npx tsx --env-file=.env scripts/units-e2e-setup.ts > "$SCRATCH/units.json"
 *   cd packages/server && npx tsx --env-file=.env scripts/classroom-tabs-e2e-setup.ts "$SCRATCH/units.json" > "$SCRATCH/tabs.json"
 *   cd packages/client && node e2e/classroom-tabs.smoke.mjs "$SCRATCH/shots" "$SCRATCH/units.json"
 * Playwright 가 기대하는 Chromium 리비전이 없으면 CHROMIUM_PATH=/opt/pw-browsers/chromium 처럼 실행 파일을 지정한다.
 * 모둠 저장 상태는 시작할 때 비우므로 여러 번 실행해도 된다.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire('/home/user/MathChois/packages/client/package.json')('@playwright/test');
const BASE = 'http://127.0.0.1:3000';
const PW = 'Test1234!';
const shotDir = process.argv[2];
const u = JSON.parse(readFileSync(process.argv[3], 'utf8'));
let fails = 0; const errors = [];
const check = (name, ok, detail) => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' — ' + JSON.stringify(detail)}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function session(email, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const res = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password: PW } });
  if (!res.ok()) throw new Error(`login failed ${email}: ${res.status()}`);
  const { token } = await res.json();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push({ email, type: 'pageerror', msg: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ email, type: 'console', msg: m.text() }); });
  return { ctx, page, token };
}
const shot = (page, name) => page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true });
const cid = u.classroomId;
const T = 'test.teacher@chois.test';

/* 칩을 포인터로 끌어 방에 놓기(PointerSensor distance 6 → 여러 단계로 움직인다) */
async function dragChip(page, chipName, deskLabel) {
  const chip = page.getByRole('button', { name: chipName, exact: true });
  const desk = page.getByRole('region', { name: deskLabel });
  // 화면 아래 20% 에 걸치면 dnd-kit 이 자동 스크롤해 방이 포인터 밑에서 빠져나간다 → 방을 화면 가운데로
  await desk.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(100);
  const a = await chip.boundingBox(); const b = await desk.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(a.x + a.width / 2 + ((b.x + b.width / 2) - (a.x + a.width / 2)) * i / 12,
      a.y + a.height / 2 + ((b.y + b.height - 24) - (a.y + a.height / 2)) * i / 12);
  }
  await page.mouse.up();
}

// ── ① 게시판 표
{
  const { page, ctx } = await session(T);
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=board`);
  const table = page.locator('table.ledger');
  await table.waitFor();
  const headers = await table.locator('thead th').allTextContents();
  check('게시판 표 헤더: 제목·첨부·게시일', headers[0] === '제목' && headers[1] === '첨부' && headers[2] === '게시일', headers);
  const rows = table.locator('tbody tr.row-btn');
  check('글 3개 이상 한 줄씩', (await rows.count()) >= 3, await rows.count());
  const first = rows.first();
  check('첨부 수 2', (await first.locator('td').nth(1).textContent()).trim().startsWith('2'), await first.locator('td').nth(1).textContent());
  check('게시일 YYYY.MM.DD', /\d{4}\.\d{2}\.\d{2}/.test(await first.locator('td').nth(2).innerText()), await first.locator('td').nth(2).innerText());
  await shot(page, 'board-table');
  // 수정 버튼은 펼침을 토글하지 않음
  await first.getByRole('button', { name: '수정' }).hover();
  const navPromise = page.waitForURL(/\/teacher\/board\/.*\/edit/, { timeout: 5000 }).then(() => true).catch(() => false);
  await first.getByRole('button', { name: '수정' }).click();
  check('수정 버튼 → 편집 화면으로 이동', await navPromise, page.url());
  await page.goBack();
  await table.waitFor();
  check('돌아와도 펼쳐진 글 없음', (await page.locator('tr.ledger-detail').count()) === 0);
  // 제목 클릭 → 펼침
  await rows.first().getByRole('button', { name: /중간고사/ }).click();
  const detail = page.locator('tr.ledger-detail').first();
  await detail.waitFor();
  check('펼치면 내용·첨부 보임', (await detail.textContent()).includes('첨부파일') && (await detail.getByRole('link', { name: /자료1\.pdf/ }).count()) === 1);
  check('본문 링크 자동 연결', await detail.getByRole('link', { name: 'https://class.chois.pro' }).isVisible());
  await shot(page, 'board-table-open');
  await rows.first().click();
  await detail.waitFor({ state: 'detached' });
  check('행 클릭으로 닫힘', true);
  await ctx.close();
}

// ── ②③ 학생 탭: 모둠 보드 + 학생 표
{
  const { page, ctx, token } = await session(T);
  // 이전 실행이 저장한 모둠을 비운다(멱등)
  await ctx.request.put(`${BASE}/api/classrooms/${cid}/groups`, { headers: { Authorization: `Bearer ${token}` }, data: { groups: [] } });
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=students`);
  await page.getByRole('heading', { name: '모둠 설정' }).waitFor();
  // 모둠 수 3
  const count = page.getByLabel('모둠 수');
  await count.fill('3');
  await page.getByRole('region', { name: '3모둠' }).waitFor();
  check('모둠 수 3 → 방 3개', (await page.locator('section.desk').count()) === 3, await page.locator('section.desk').count());
  const trayBefore = await page.getByRole('region', { name: '미배정' }).locator('.chip-btn').count();
  check('미배정 트레이에 칩', trayBefore >= 4, trayBefore);
  await shot(page, 'students-board-before');
  // 드래그: 이서연 → 1모둠
  await dragChip(page, '이서연', '1모둠');
  check('드래그로 1모둠에 들어감', await page.getByRole('region', { name: '1모둠' }).getByRole('button', { name: '이서연', exact: true }).isVisible());
  // 키보드: 박지호 → Space, ArrowDown(트레이에서 아래 방으로), Space
  const chip = page.getByRole('region', { name: '미배정' }).getByRole('button', { name: '박지호', exact: true });
  await chip.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const moved = (await page.locator('section.desk').getByRole('button', { name: '박지호', exact: true }).count()) === 1;
  check('키보드(Space→↓→Space)로 방에 들어감', moved);
  await shot(page, 'students-board-after-drag');
  // 저장 → 새로고침 후 유지
  await page.getByRole('button', { name: '저장' }).click();
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole('region', { name: '1모둠' }).waitFor();
  check('저장 후 새로고침에도 1모둠에 이서연', await page.getByRole('region', { name: '1모둠' }).getByRole('button', { name: '이서연', exact: true }).isVisible());
  // 모둠 수 줄이기: 학생이 있는 방이 잘리면 입력을 마칠 때까지 미룬다("12" 치는 도중 "1" 보호)
  await page.getByLabel('모둠 수').fill('1');
  await page.waitForTimeout(150);
  check('모둠 수 "1" 입력 중에는 아직 방 3개', (await page.locator('section.desk').count()) === 3, await page.locator('section.desk').count());
  await page.getByLabel('모둠 수').press('Enter');
  await page.waitForTimeout(150);
  check('Enter 로 확정 → 방 1개', (await page.locator('section.desk').count()) === 1);
  const inTray = await page.getByRole('region', { name: '미배정' }).locator('.chip-btn').count();
  const inDesks = await page.locator('section.desk .chip-btn').count();
  check('잘린 방 학생은 미배정으로(칩 총수 보존)', inTray + inDesks === trayBefore && inDesks <= trayBefore, { inTray, inDesks, trayBefore });
  await page.getByLabel('모둠 수').fill('3');

  // 학생 표
  const fold = page.getByRole('button', { name: /학생 \d+명/ });
  await fold.waitFor();
  const stable = page.locator('#students-table table.ledger');
  const sh = await stable.locator('thead th').allTextContents();
  check('학생 표 헤더: 이름·아이디·참여일·초기화', sh[0] === '이름' && sh[1] === '아이디' && sh[2] === '참여일' && sh[4] === '초기화', sh);
  await shot(page, 'students-table');
  await fold.click();
  check('접으면 표 사라짐', (await stable.count()) === 0);
  await page.reload();
  await page.getByRole('button', { name: /학생 \d+명/ }).waitFor();
  check('새로고침 후에도 접힘 유지', (await page.locator('#students-table').count()) === 0);
  await page.getByRole('button', { name: /학생 \d+명/ }).click();
  await stable.waitFor();
  // 초기화
  page.once('dialog', (d) => { check('확인 문구', d.message().includes('AI 풀이 횟수를 모두 초기화할까요'), d.message()); d.accept(); });
  await page.getByRole('button', { name: '이서연 AI 풀이 초기화' }).click();
  const status = page.locator('td[role="status"]');
  await status.waitFor();
  check('초기화됨 · 페이지 N개', /초기화됨 · 페이지 \d+개/.test(await status.textContent()), await status.textContent());
  await shot(page, 'students-table-reset');
  await ctx.close();
}

// ── ④ 대시보드
{
  const { page, ctx } = await session(T);
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=dashboard`);
  const view = page.locator('select[aria-label="보기"]');
  await view.waitFor();
  check('기본 보기 챕터별·단원 전체', (await view.inputValue()) === 'chapters' && (await page.locator('select[aria-label="단원"]').inputValue()) === '');
  check('챕터별 표: 반 전체 행', await page.locator('tfoot th', { hasText: '반 전체' }).isVisible());
  await shot(page, 'dashboard-chapters-all');
  await page.locator('select[aria-label="단원"]').selectOption(u.units.u1);
  await page.waitForURL(/unit=/);
  const cols = await page.locator('thead th.matrix-col .matrix-col-title').allTextContents();
  check('단원1 선택 → 챕터 2개 열', cols.length === 2 && cols.every((c) => c.includes('챕터 1-')), cols);
  check('주소에 unit', page.url().includes(`unit=${u.units.u1}`), page.url());
  await shot(page, 'dashboard-chapters-unit1');
  await view.selectOption('videos');
  await page.waitForURL(/view=videos/);
  await page.waitForFunction(() => document.querySelectorAll('thead th.matrix-col').length === 1, null, { timeout: 5000 }).catch(() => {});
  check('영상별: 영상 열 1개', (await page.locator('thead th.matrix-col').count()) === 1);
  check('영상별: 시청률 % 보임', await page.locator('tbody .meter-text', { hasText: /\d+%/ }).first().isVisible());
  check('영상별: 단원 선택 유지', (await page.locator('select[aria-label="단원"]').inputValue()) === u.units.u1);
  await shot(page, 'dashboard-videos-unit1');
  await view.selectOption('students');
  await page.waitForURL(/view=students/);
  const stuSel = page.locator('select[aria-label="학생"]');
  const gotStudent = await page.waitForURL(/student=/, { timeout: 5000 }).then(() => true).catch(() => false);
  check('학생별: 학생 드롭다운 + 첫 학생 자동 선택(주소에 student=)', await stuSel.isVisible() && gotStudent, page.url());
  check('학생별: 요약 칸 3개', (await page.locator('.tile').count()) === 3);
  const seedStudent = await stuSel.locator('option', { hasText: '이서연' }).getAttribute('value');
  await stuSel.selectOption(seedStudent);
  await page.waitForURL(new RegExp(`student=${seedStudent}`));
  const heading = page.getByRole('heading', { name: '이서연' });
  await heading.waitFor({ timeout: 5000 }).catch(() => {});
  check('이서연 보고서 제목', await heading.isVisible());
  check('단원별 묶음 제목', await page.locator('.report-unit-title', { hasText: '단원1' }).isVisible());
  check('영상 줄 시청률', await page.locator('.report-row', { hasText: '영상' }).locator('.meter-text').first().isVisible());
  check('코칭 기록 링크', await page.getByRole('link', { name: '코칭 기록 보기' }).isVisible());
  await shot(page, 'dashboard-student');
  // 잘못된 주소값 바로잡기
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=dashboard&view=chapters&unit=00000000-0000-4000-8000-00000000dead`);
  await page.locator('select[aria-label="보기"]').waitFor();
  await page.waitForTimeout(300);
  check('삭제된 단원 → 주소에서 unit 제거', !page.url().includes('unit='), page.url());
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=dashboard&view=students&student=00000000-0000-4000-8000-00000000dead`);
  await page.locator('select[aria-label="학생"]').waitFor();
  await page.waitForTimeout(300);
  check('탈퇴 학생 → 첫 학생으로', page.url().includes('student=') && !page.url().includes('dead'), page.url());
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=dashboard&view=bogus`);
  await page.locator('select[aria-label="보기"]').waitFor();
  await page.waitForTimeout(300);
  check('잘못된 view → chapters', page.url().includes('view=chapters'), page.url());
  // 대시보드 선택값은 다른 탭 주소에 남지 않는다
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=dashboard&view=students`);
  await page.locator('select[aria-label="학생"]').waitFor();
  await page.waitForURL(/student=/);
  await page.getByRole('button', { name: '챕터' }).click();
  await page.waitForURL(/tab=chapters/);
  check('챕터 탭으로 가면 view·student 가 주소에서 빠짐', !page.url().includes('view=') && !page.url().includes('student='), page.url());
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=dashboard`);
  await page.locator('select[aria-label="보기"]').waitFor();
  await page.waitForTimeout(300);
  check('첫 방문에는 주소를 고쳐 쓰지 않음(view 없음)', !page.url().includes('view='), page.url());
  // 영상 탭에서 고른 단원이 대시보드로 이어짐
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=videos&unit=${u.units.u1}`);
  await page.getByRole('button', { name: '대시보드' }).click();
  await page.locator('select[aria-label="단원"]').waitFor();
  check('영상 탭의 단원이 대시보드에 그대로', (await page.locator('select[aria-label="단원"]').inputValue()) === u.units.u1);
  await ctx.close();
}

// ── 폰 폭
{
  const { page, ctx } = await session(T, { width: 390, height: 844 });
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=board`);
  await page.locator('table.ledger').waitFor();
  const d = await page.locator('tbody tr.row-btn').first().locator('td').nth(2).innerText();
  check('폰: 게시일 MM.DD', /^\d{2}\.\d{2}$/.test(d.trim()), d);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('폰: 게시판 가로 스크롤 없음', sw);
  await shot(page, 'm-board');
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=students`);
  await page.getByRole('button', { name: /학생 \d+명/ }).waitFor();
  await page.getByRole('button', { name: /학생 \d+명/ }).click().catch(() => {});
  if ((await page.locator('#students-table').count()) === 0) await page.getByRole('button', { name: /학생 \d+명/ }).click();
  await page.locator('#students-table').waitFor();
  check('폰: 아이디 열 숨김', !(await page.locator('#students-table thead th', { hasText: '아이디' }).isVisible()));
  await shot(page, 'm-students');
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=dashboard&view=students`);
  await page.locator('.tile').first().waitFor();
  await shot(page, 'm-dashboard-student');
  await page.goto(`${BASE}/teacher/classrooms/${cid}?tab=dashboard`);
  await page.locator('table.matrix').waitFor();
  await shot(page, 'm-dashboard-chapters');
  await ctx.close();
}

await browser.close();
const relevant = errors.filter((e) => !/favicon|manifest|404/.test(e.msg));
console.log(`\nconsole/page errors: ${relevant.length}`);
relevant.slice(0, 8).forEach((e) => console.log('  ', e.type, e.msg.slice(0, 200)));
console.log(fails === 0 ? 'ALL UI CHECKS PASSED' : `${fails} UI CHECK(S) FAILED`);
process.exit(fails || relevant.length ? 1 : 0);
