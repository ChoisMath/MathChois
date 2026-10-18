/**
 * 화이트보드 실시간 협업 스모크 (로컬 PostgreSQL + 실행 중인 서버 필요)
 *
 *   npm run seed:test -w @mathchois/server      # 테스트 교사/학생/클래스
 *   npm run dev:server                           # 3001 포트
 *   npx tsx --env-file=.env scripts/wb-smoke.ts  # (packages/server 에서)
 *
 * 검증: 페이지 뷰 지연 생성 → 학생 2명 같은 보드 동시 편집(상호 수신, version 병합) →
 *       DB 저장 → 잠금 시 학생 거부 → 템플릿 동시 적용 1회만 → 열람 허용 전/후 다른 모둠 학생.
 */
import { eq } from 'drizzle-orm';
import { io as ioClient, type Socket } from 'socket.io-client';
import { db, pgClient } from '../src/config/database.js';
import { profiles, classrooms, classroomMembers, chapters, pages, whiteboardGroups } from '../src/db/schema.js';
import { signAccessToken, hashPassword } from '../src/services/auth.service.js';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3001';
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(token: string, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(BASE, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
function waitFor<T = any>(s: Socket, event: string, pred: (d: any) => boolean = () => true, ms = 3000): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { s.off(event, h); resolve(null); }, ms);
    const h = (d: any) => { if (pred(d)) { clearTimeout(timer); s.off(event, h); resolve(d); } };
    s.on(event, h);
  });
}
const el = (id: string, version: number, versionNonce: number, extra: Record<string, unknown> = {}) => ({
  id, version, versionNonce, type: 'rectangle', x: 10, y: 10, width: 100, height: 50, isDeleted: false,
  updated: Date.now(), ...extra,
});

async function ensureUser(email: string, name: string, role: 'teacher' | 'student') {
  const existing = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db.insert(profiles)
    .values({ email, name, role, authMethod: 'email', passwordHash: await hashPassword('Test1234!'), isAdmin: false })
    .returning();
  return row;
}

async function main() {
  const teacher = await ensureUser('test.teacher@chois.test', '테스트 교사', 'teacher');
  const sA = await ensureUser('test.student@chois.test', '테스트 학생', 'student');
  const sB = await ensureUser('wb.student.b@chois.test', '화이트보드 학생B', 'student');
  const sC = await ensureUser('wb.student.c@chois.test', '화이트보드 학생C', 'student');

  let [cls] = await db.select().from(classrooms).where(eq(classrooms.classCode, 'TEST0001')).limit(1);
  if (!cls) [cls] = await db.insert(classrooms).values({ name: '테스트 클래스', teacherId: teacher.id, classCode: 'TEST0001' }).returning();
  for (const s of [sA, sB, sC]) {
    await db.insert(classroomMembers).values({ classroomId: cls.id, studentId: s.id }).onConflictDoNothing();
  }
  const [chapter] = await db.insert(chapters).values({ classroomId: cls.id, title: `WB 스모크 ${Date.now()}`, position: 999 }).returning();
  const [page] = await db.insert(pages).values({ chapterId: chapter.id, pageType: 'whiteboard', position: 0 }).returning();

  const tT = signAccessToken({ id: teacher.id, role: 'teacher', isAdmin: false });
  const tA = signAccessToken({ id: sA.id, role: 'student', isAdmin: false });
  const tB = signAccessToken({ id: sB.id, role: 'student', isAdmin: false });
  const tC = signAccessToken({ id: sC.id, role: 'student', isAdmin: false });
  const q = `?classroomId=${cls.id}`;

  // 1. 교사 페이지 뷰 → 지연 생성 (기본 모둠 없음 → 1모둠에 전원)
  const v1 = await api(tT, 'GET', `/api/whiteboards/page/${page.id}${q}`);
  check('teacher page view 200', v1.status === 200, v1);
  check('lazy-created one group with all members', v1.json?.groups?.length === 1 && v1.json.groups[0].members.length >= 3, v1.json?.groups);

  // 2. 페이지별 배정: A+B 는 1모둠, C 는 2모둠
  const g1 = v1.json.groups[0];
  const put = await api(tT, 'PUT', `/api/whiteboards/page/${page.id}/groups${q}`, {
    groups: [
      { id: g1.id, name: '1모둠', position: 0, studentIds: [sA.id, sB.id] },
      { name: '2모둠', position: 1, studentIds: [sC.id] },
    ],
  });
  check('replace page groups 200', put.status === 200 && put.json.groups.length === 2, put);
  const boardAB = put.json.groups.find((g: any) => g.name === '1모둠').id;
  const boardC = put.json.groups.find((g: any) => g.name === '2모둠').id;

  const vA = await api(tA, 'GET', `/api/whiteboards/page/${page.id}${q}`);
  check('student A myGroupId', vA.json?.myGroupId === boardAB, vA.json?.myGroupId);
  const other = await api(tT, 'GET', `/api/whiteboards/page/${page.id}?classroomId=00000000-0000-0000-0000-000000000000`);
  check('unrelated classroom → 403', other.status === 403, other.status);

  // 3. 소켓: A, B 같은 보드
  const sockA = await connect(tA);
  const sockB = await connect(tB);
  const initA = waitFor(sockA, 'wb:init');
  sockA.emit('wb:join', { boardId: boardAB });
  const iA: any = await initA;
  check('A wb:init', !!iA && iA.readOnly === false && Array.isArray(iA.elements), iA);
  const initB = waitFor(sockB, 'wb:init');
  sockB.emit('wb:join', { boardId: boardAB });
  const iB: any = await initB;
  check('B wb:init with 2 users', !!iB && iB.users.length === 2, iB?.users);

  // A → 요소 전송, B 수신 (작성자 강제)
  const recvB = waitFor(sockB, 'wb:elements', (d) => d.elements?.some((e: any) => e.id === 'r1'));
  sockA.emit('wb:elements', { boardId: boardAB, elements: [el('r1', 1, 100, { customData: { authorId: 'forged' } })] });
  const rB: any = await recvB;
  check('B receives A element', !!rB, rB);
  check('author forced to A', rB?.elements?.[0]?.customData?.authorId === sA.id, rB?.elements?.[0]?.customData);

  // B → 같은 id 더 높은 version, A 수신; A → 낮은 version 은 무시
  const recvA = waitFor(sockA, 'wb:elements', (d) => d.elements?.some((e: any) => e.id === 'r1' && e.version === 2));
  sockB.emit('wb:elements', { boardId: boardAB, elements: [el('r1', 2, 5, { x: 999 })] });
  const rA: any = await recvA;
  check('A receives B newer version', rA?.elements?.[0]?.x === 999, rA);
  check('author preserved as A after B edit', rA?.elements?.[0]?.customData?.authorId === sA.id, rA?.elements?.[0]?.customData);
  const stale = waitFor(sockB, 'wb:elements', (d) => d.elements?.some((e: any) => e.id === 'r1' && e.version === 1), 800);
  sockA.emit('wb:elements', { boardId: boardAB, elements: [el('r1', 1, 1, { x: 1 })] });
  check('stale version not broadcast', (await stale) === null);

  // 포인터
  const ptr = waitFor(sockB, 'wb:pointer', (d) => d.userId === sA.id);
  sockA.emit('wb:pointer', { boardId: boardAB, x: 1, y: 2, tool: 'pointer', button: 'up' });
  const p: any = await ptr;
  check('pointer relayed with name', !!p && typeof p.name === 'string', p);

  // 바탕색
  const bg = waitFor(sockB, 'wb:background');
  sockA.emit('wb:background', { boardId: boardAB, color: '#fff9db' });
  check('background relayed', (await bg as any)?.color === '#fff9db');

  // 4. 저장 확인 (디바운스 2초)
  await sleep(2800);
  const [row] = await db.select().from(whiteboardGroups).where(eq(whiteboardGroups.id, boardAB)).limit(1);
  const saved = (row.excalidrawData?.elements ?? []) as any[];
  check('scene persisted with merged version', saved.some((e) => e.id === 'r1' && e.version === 2 && e.x === 999), saved);
  check('background persisted', row.backgroundColor === '#fff9db', row.backgroundColor);

  // 5. 잠금 → 학생 거부, 교사 OK
  const lockEv = waitFor(sockA, 'wb:lock', (d) => d.locked === true);
  const lock = await api(tT, 'PATCH', `/api/whiteboards/groups/${boardAB}`, { locked: true });
  check('lock 200', lock.status === 200 && lock.json.locked === true, lock);
  check('lock broadcast', !!(await lockEv));
  const rej = waitFor(sockA, 'wb:rejected', (d) => d.reason === 'locked');
  sockA.emit('wb:elements', { boardId: boardAB, elements: [el('r2', 1, 1)] });
  check('student rejected while locked', !!(await rej));
  const sockT = await connect(tT);
  const initT = waitFor(sockT, 'wb:init');
  sockT.emit('wb:join', { boardId: boardAB });
  check('teacher init not readOnly while locked', (await initT as any)?.readOnly === false);
  const recvFromT = waitFor(sockA, 'wb:elements', (d) => d.elements?.some((e: any) => e.id === 't1'));
  sockT.emit('wb:elements', { boardId: boardAB, elements: [el('t1', 1, 1)] });
  check('teacher can edit while locked', !!(await recvFromT));
  await api(tT, 'PATCH', `/api/whiteboards/groups/${boardAB}`, { locked: false });

  // 6. 열람 허용: C 는 AB 보드 거부 → 허용 후 읽기 전용
  const sockC = await connect(tC);
  const rejC = waitFor(sockC, 'wb:rejected', (d) => d.boardId === boardAB);
  sockC.emit('wb:join', { boardId: boardAB });
  check('C rejected before cross view', !!(await rejC));
  const st = await api(tT, 'PATCH', `/api/whiteboards/page/${page.id}/settings${q}`, { allowCrossGroupView: true });
  check('settings 200', st.status === 200 && st.json.allowCrossGroupView === true, st);
  const initC = waitFor(sockC, 'wb:init');
  sockC.emit('wb:join', { boardId: boardAB });
  const iC: any = await initC;
  check('C read-only after cross view', !!iC && iC.readOnly === true, iC);
  const rejC2 = waitFor(sockC, 'wb:rejected', (d) => d.reason === 'forbidden');
  sockC.emit('wb:elements', { boardId: boardAB, elements: [el('c1', 1, 1)] });
  check('C cannot write', !!(await rejC2));

  // 7. 템플릿 동시 적용 — 빈 보드(C 모둠)에 두 번 동시에 → 1회만
  const tpl = [el('tp1', 1, 1), el('tp2', 1, 1)];
  const [a1, a2] = await Promise.all([
    api(tC, 'POST', `/api/whiteboards/groups/${boardC}/apply-template`, { elements: tpl }),
    api(tT, 'POST', `/api/whiteboards/groups/${boardC}/apply-template`, { elements: tpl }),
  ]);
  check('apply-template exactly once', [a1.json?.applied, a2.json?.applied].filter(Boolean).length === 1, [a1, a2]);
  const a3 = await api(tT, 'POST', `/api/whiteboards/groups/${boardC}/apply-template`, { elements: tpl });
  check('apply-template on non-empty → false', a3.json?.applied === false, a3);

  // 8. 초기화 / 복원
  const reset = await api(tT, 'POST', `/api/whiteboards/groups/${boardAB}/reset`);
  check('reset 200 hasPrevious', reset.status === 200 && reset.json.hasPrevious === true, reset);
  const g = await api(tT, 'GET', `/api/whiteboards/groups/${boardAB}`);
  check('scene empty after reset', g.json?.scene?.elements?.length === 0, g.json?.scene);
  const restore = await api(tT, 'POST', `/api/whiteboards/groups/${boardAB}/restore-previous`);
  check('restore 200', restore.status === 200, restore);
  const g2 = await api(tT, 'GET', `/api/whiteboards/groups/${boardAB}`);
  check('scene restored', (g2.json?.scene?.elements ?? []).some((e: any) => e.id === 'r1'), g2.json?.scene);

  // 9. 학생이 교사 전용 API → 403
  const forb = await api(tA, 'POST', `/api/whiteboards/groups/${boardAB}/reset`);
  check('student reset → 403', forb.status === 403, forb.status);

  for (const s of [sockA, sockB, sockC, sockT]) s.disconnect();
  await db.delete(chapters).where(eq(chapters.id, chapter.id));
  await pgClient.end();
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => { console.error(err); await pgClient.end(); process.exit(1); });
