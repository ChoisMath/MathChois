/**
 * 학급 단원 API 스모크 (로컬 PostgreSQL + 실행 중인 서버 필요)
 *
 *   npm run seed:test -w @mathchois/server       # 테스트 교사/학생/학급 TEST0001
 *   npm run dev:server                            # 3001 포트
 *   npx tsx --env-file=.env scripts/units-smoke.ts  # (packages/server 에서)
 *
 * 검증: 단원 생성(position 0,1) → 빈/긴 이름 400 + 행 미생성 → 학생 생성 403 →
 *       숨김 토글 후 학생/교사 목록 → reorder(역순 200, 일부만 400) → 삭제 204 → 404 → 다른 교사 403.
 */
import { eq } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import { profiles, classrooms, classroomMembers, units } from '../src/db/schema.js';
import { signAccessToken, hashPassword } from '../src/services/auth.service.js';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3001';
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

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
  const student = await ensureUser('test.student@chois.test', '테스트 학생', 'student');
  const other = await ensureUser('units.other@chois.test', '단원 다른 교사', 'teacher');

  let [cls] = await db.select().from(classrooms).where(eq(classrooms.classCode, 'TEST0001')).limit(1);
  if (!cls) [cls] = await db.insert(classrooms).values({ name: '테스트 클래스', teacherId: teacher.id, classCode: 'TEST0001' }).returning();
  await db.insert(classroomMembers).values({ classroomId: cls.id, studentId: student.id }).onConflictDoNothing();
  await db.delete(units).where(eq(units.classroomId, cls.id));

  const tT = signAccessToken({ id: teacher.id, role: 'teacher', isAdmin: false });
  const tS = signAccessToken({ id: student.id, role: 'student', isAdmin: false });
  const tO = signAccessToken({ id: other.id, role: 'teacher', isAdmin: false });
  const base = `/api/classrooms/${cls.id}/units`;

  // 생성 + position
  const c1 = await api(tT, 'POST', base, { title: '1단원 다항식' });
  check('교사 POST → 201', c1.status === 201, c1);
  check('첫 단원 position === 0', c1.json?.position === 0, c1.json);
  const c2 = await api(tT, 'POST', base, { title: '2단원 방정식', description: '  설명  ' });
  check('두 번째 단원 position === 1', c2.status === 201 && c2.json?.position === 1, c2);
  check('설명 trim', c2.json?.description === '설명', c2.json);
  const u1: string = c1.json?.id;
  const u2: string = c2.json?.id;

  // 검증 실패 → 400, 행 미생성
  const blank = await api(tT, 'POST', base, { title: '   ' });
  check('공백 이름 → 400 단원 이름을 입력하세요', blank.status === 400 && blank.json?.error === '단원 이름을 입력하세요', blank);
  const longName = await api(tT, 'POST', base, { title: '가'.repeat(101) });
  check('101자 이름 → 400', longName.status === 400 && typeof longName.json?.error === 'string', longName);
  const afterBad = await api(tT, 'GET', base);
  check('실패한 생성 뒤 단원 개수 2', Array.isArray(afterBad.json) && afterBad.json.length === 2, afterBad.json);

  // 권한
  const sPost = await api(tS, 'POST', base, { title: '학생 단원' });
  check('학생 POST → 403', sPost.status === 403, sPost);

  // 숨김 + 목록
  const hide = await api(tT, 'PATCH', `/api/units/${u2}`, { isHidden: true });
  check('PATCH isHidden → 200', hide.status === 200 && hide.json?.isHidden === true, hide);
  const sList = await api(tS, 'GET', base);
  check('학생 GET → 1개(숨김 제외)', sList.status === 200 && sList.json?.length === 1, sList.json);
  const tList = await api(tT, 'GET', base);
  check('교사 GET → 2개', tList.status === 200 && tList.json?.length === 2, tList.json);
  check('원소에 chapterCount·videoCount 숫자',
    Array.isArray(tList.json) && tList.json.every((u: any) => typeof u.chapterCount === 'number' && typeof u.videoCount === 'number'),
    tList.json);

  // reorder
  const rev = await api(tT, 'PUT', `${base}/reorder`, { ids: [u2, u1] });
  check('PUT reorder 역순 → 200', rev.status === 200, rev);
  const afterRev = await api(tT, 'GET', base);
  check('GET 순서 반대', !!u1 && !!u2 && afterRev.json?.[0]?.id === u2 && afterRev.json?.[1]?.id === u1, afterRev.json);
  const partial = await api(tT, 'PUT', `${base}/reorder`, { ids: [u1] });
  check('reorder ids 1개만 → 400', partial.status === 400, partial);

  // 다른 교사
  const otherPatch = await api(tO, 'PATCH', `/api/units/${u1}`, { title: '탈취' });
  check('다른 교사 PATCH → 403', otherPatch.status === 403, otherPatch);

  // 삭제
  const del = await api(tT, 'DELETE', `/api/units/${u1}`);
  check('DELETE → 204', del.status === 204, del);
  const gone = await api(tT, 'PATCH', `/api/units/${u1}`, { title: '없음' });
  check('삭제 후 PATCH → 404 단원을 찾을 수 없습니다', gone.status === 404 && gone.json?.error === '단원을 찾을 수 없습니다', gone);

  // 정리
  await db.delete(units).where(eq(units.classroomId, cls.id));
  await pgClient.end();
  console.log(failures === 0 ? '\n전부 통과' : `\n실패 ${failures}건`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
