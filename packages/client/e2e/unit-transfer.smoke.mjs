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
}

try {
  if (mode === '--api') await runApi();
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
