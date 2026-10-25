/**
 * 학급 단원 API 스모크 (로컬 PostgreSQL + 실행 중인 서버 필요)
 *
 *   npm run seed:test -w @mathchois/server       # 테스트 교사/학생/학급 TEST0001
 *   npm run dev:server                            # 3001 포트
 *   npx tsx --env-file=.env scripts/units-smoke.ts  # (packages/server 에서)
 *
 * Task 3: 챕터·영상 단원 연결(POST/PATCH unitId), POST /api/units/:id/items(성공·전부-아니면-전무), 학생 숨김 필터
 *          (챕터 목록·영상 목록·시청 화면 siblings), 단원 삭제 시 항목 미분류, 챕터 pages[].imageUrl.
 *
 * 검증: 단원 생성(position 0,1) → 빈/긴 이름 400 + 행 미생성 → 학생 생성 403 →
 *       숨김 토글 후 학생/교사 목록 → reorder(역순 200, 일부만 400) → 삭제 204 → 404 → 다른 교사 403.
 */
import { eq, and, like, inArray } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import { profiles, classrooms, classroomMembers, units, chapters, pages, videos, classroomVideos } from '../src/db/schema.js';
import { signAccessToken, hashPassword } from '../src/services/auth.service.js';
import { assignItemsToUnit } from '../src/services/unit.service.js';

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
  // 중간에 실패한 이전 실행의 잔여물 정리
  const staleVideos = db.select({ id: videos.id }).from(videos).where(like(videos.title, 't3 영상 %'));
  await db.delete(classroomVideos).where(inArray(classroomVideos.videoId, staleVideos)); // videoId FK 는 RESTRICT
  await db.delete(videos).where(like(videos.title, 't3 영상 %'));
  await db.delete(chapters).where(and(eq(chapters.classroomId, cls.id), like(chapters.title, 't3 %')));

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
  // 개수: 챕터 1 + 학급영상 1 을 u1 에 넣고 chapterCount/videoCount 가 실제 값(1)인지 확인
  const [chap] = await db.insert(chapters).values({ classroomId: cls.id, title: `units 스모크 ${Date.now()}`, position: 997 }).returning();
  const [vid] = await db.insert(videos).values({ createdBy: teacher.id, title: 'units 스모크 영상', videoUrl: `units-smoke/${Date.now()}.mp4` }).returning();
  const [cv] = await db.insert(classroomVideos).values({ classroomId: cls.id, videoId: vid.id, addedBy: teacher.id }).returning();
  const assigned = await assignItemsToUnit(u1, cls.id, { chapterIds: [chap.id], classroomVideoIds: [cv.id] });
  check('assignItemsToUnit → true', assigned === true, assigned);
  const counted = await api(tT, 'GET', base);
  const row1 = counted.json?.find((u: any) => u.id === u1);
  const row2 = counted.json?.find((u: any) => u.id === u2);
  check('u1 chapterCount === 1 && videoCount === 1', row1?.chapterCount === 1 && row1?.videoCount === 1, row1);
  check('u2 chapterCount === 0 && videoCount === 0', row2?.chapterCount === 0 && row2?.videoCount === 0, row2);

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


  // ─── Task 3: 챕터·영상 단원 연결 / 가져오기 / 학생 숨김 필터 ───
  // 다른 교사의 학급(챕터 1 + 단원 1)
  await db.delete(classrooms).where(eq(classrooms.classCode, 'UNITSO01'));
  const [otherCls] = await db.insert(classrooms).values({ name: '단원 다른 학급', teacherId: other.id, classCode: 'UNITSO01' }).returning();
  const [otherUnit] = await db.insert(units).values({ classroomId: otherCls.id, title: '남의 단원', position: 0 }).returning();
  const [otherChap] = await db.insert(chapters).values({ classroomId: otherCls.id, title: '남의 챕터', position: 0 }).returning();

  const chBase = `/api/classrooms/${cls.id}/chapters`;
  const t3Title = `t3 ${Date.now()}`;
  const ch1 = await api(tT, 'POST', chBase, { title: `${t3Title} a`, unitId: u1 });
  check('POST 챕터 {unitId} → 201, unitId === u1', ch1.status === 201 && ch1.json?.unitId === u1, ch1);
  const badCh = await api(tT, 'POST', chBase, { title: `${t3Title} bad`, unitId: otherUnit.id });
  check('POST 챕터 다른 학급 단원 → 400 이 학급의 단원이 아닙니다', badCh.status === 400 && badCh.json?.error === '이 학급의 단원이 아닙니다', badCh);
  const ch2 = await api(tT, 'POST', chBase, { title: `${t3Title} b` });
  const ch3 = await api(tT, 'POST', chBase, { title: `${t3Title} c` });
  check('unitId 없이 챕터 생성 → unitId null', ch2.status === 201 && ch2.json?.unitId === null && ch3.status === 201, [ch2, ch3]);
  const [c1id, c2id, c3id] = [ch1.json?.id, ch2.json?.id, ch3.json?.id] as string[];
  await db.insert(pages).values({ chapterId: c3id, imageUrl: 'units-smoke/p.png', position: 0 });

  const patchBad = await api(tT, 'PATCH', `/api/chapters/${c2id}`, { unitId: otherUnit.id });
  check('PATCH 챕터 다른 학급 단원 → 400 이 학급의 단원이 아닙니다', patchBad.status === 400 && patchBad.json?.error === '이 학급의 단원이 아닙니다', patchBad);
  const patchOk = await api(tT, 'PATCH', `/api/chapters/${c2id}`, { unitId: u1 });
  check('PATCH 챕터 {unitId: u1} → 200', patchOk.status === 200 && patchOk.json?.unitId === u1, patchOk);
  const patchNull = await api(tT, 'PATCH', `/api/chapters/${c2id}`, { unitId: null });
  check('PATCH 챕터 {unitId: null} → 200, unitId === null', patchNull.status === 200 && patchNull.json?.unitId === null, patchNull);
  const patchTitle = await api(tT, 'PATCH', `/api/chapters/${c2id}`, { title: `${t3Title} b2` });
  check('PATCH 챕터 {title} 만 → 200 (unitId 유지 null)', patchTitle.status === 200 && patchTitle.json?.title === `${t3Title} b2` && patchTitle.json?.unitId === null, patchTitle);
  const patchJunk = await api(tT, 'PATCH', `/api/chapters/${c2id}`, { classroomId: otherCls.id, title: `${t3Title} b3` });
  const afterJunk = await db.select().from(chapters).where(eq(chapters.id, c2id));
  check('PATCH 챕터 classroomId 같은 임의 필드는 무시', patchJunk.status === 200 && afterJunk[0]?.classroomId === cls.id, [patchJunk, afterJunk[0]?.classroomId]);

  // 영상 2개 배정 (라이브러리 영상 → 학급)
  const [vidA] = await db.insert(videos).values({ createdBy: teacher.id, title: 't3 영상 A', videoUrl: `units-smoke/a-${Date.now()}.mp4` }).returning();
  const [vidB] = await db.insert(videos).values({ createdBy: teacher.id, title: 't3 영상 B', videoUrl: `units-smoke/b-${Date.now()}.mp4` }).returning();
  const vBase = `/api/classrooms/${cls.id}/videos`;
  const badCv = await api(tT, 'POST', vBase, { videoId: vidA.id, unitId: otherUnit.id });
  check('POST 영상 다른 학급 단원 → 400 이 학급의 단원이 아닙니다', badCv.status === 400 && badCv.json?.error === '이 학급의 단원이 아닙니다', badCv);
  const cvA = await api(tT, 'POST', vBase, { videoId: vidA.id });
  const cvB = await api(tT, 'POST', vBase, { videoId: vidB.id });
  check('영상 2개 배정 → 201, unitId null', cvA.status === 201 && cvB.status === 201 && cvA.json?.unitId === null, [cvA, cvB]);
  const cv1id: string = cvA.json?.id;
  const cv2id: string = cvB.json?.id;
  const cvPatchBad = await api(tT, 'PATCH', `/api/classroom-videos/${cv2id}`, { unitId: otherUnit.id });
  check('PATCH 영상 다른 학급 단원 → 400', cvPatchBad.status === 400 && cvPatchBad.json?.error === '이 학급의 단원이 아닙니다', cvPatchBad);

  // 가져오기(items)
  const items = await api(tT, 'POST', `/api/units/${u1}/items`, { chapterIds: [c1id, c2id], classroomVideoIds: [cv1id] });
  check('POST items {챕터 2, 영상 1} → 200 { ok: true }', items.status === 200 && items.json?.ok === true, items);
  const chList = await api(tT, 'GET', chBase);
  const vList = await api(tT, 'GET', vBase);
  const chById = (id: string) => chList.json?.find((c: any) => c.id === id);
  const vById = (id: string) => vList.json?.find((v: any) => v.id === id);
  check('목록에서 c1·c2·cv1 unitId === u1', chById(c1id)?.unitId === u1 && chById(c2id)?.unitId === u1 && vById(cv1id)?.unitId === u1, [chById(c1id)?.unitId, chById(c2id)?.unitId, vById(cv1id)?.unitId]);

  const mixed = await api(tT, 'POST', `/api/units/${u1}/items`, { chapterIds: [c3id, otherChap.id] });
  check('POST items 다른 학급 챕터 섞임 → 400 이 학급의 항목이 아닙니다', mixed.status === 400 && mixed.json?.error === '이 학급의 항목이 아닙니다', mixed);
  const [c3row] = await db.select().from(chapters).where(eq(chapters.id, c3id));
  check('실패한 items 뒤 c3 unitId === null (전부-아니면-전무)', c3row?.unitId === null, c3row);
  const itemsOtherTeacher = await api(tO, 'POST', `/api/units/${u1}/items`, { chapterIds: [c3id] });
  check('다른 교사 POST items → 403', itemsOtherTeacher.status === 403, itemsOtherTeacher);
  const itemsStudent = await api(tS, 'POST', `/api/units/${u1}/items`, { chapterIds: [c3id] });
  check('학생 POST items → 403', itemsStudent.status === 403, itemsStudent);
  const itemsMissing = await api(tT, 'POST', `/api/units/00000000-0000-4000-8000-000000000000/items`, { chapterIds: [] });
  check('없는 단원 POST items → 404 단원을 찾을 수 없습니다', itemsMissing.status === 404 && itemsMissing.json?.error === '단원을 찾을 수 없습니다', itemsMissing);
  const itemsBadBody = await api(tT, 'POST', `/api/units/${u1}/items`, { chapterIds: ['nope'] });
  check('POST items uuid 아님 → 400', itemsBadBody.status === 400 && typeof itemsBadBody.json?.error === 'string', itemsBadBody);
  const itemsTooMany = await api(tT, 'POST', `/api/units/${u1}/items`, { chapterIds: Array.from({ length: 201 }, () => c3id) });
  check('POST items 201개 → 400', itemsTooMany.status === 400, itemsTooMany);

  // 페이지 imageUrl 키
  const c3List = (await api(tT, 'GET', chBase)).json?.find((c: any) => c.id === c3id);
  check('챕터 GET pages[0] 에 imageUrl 키 존재', !!c3List?.pages?.[0] && 'imageUrl' in c3List.pages[0] && c3List.pages[0].imageUrl === 'units-smoke/p.png', c3List?.pages);

  // 숨김 필터: u1 숨김
  const hideU1 = await api(tT, 'PATCH', `/api/units/${u1}`, { isHidden: true });
  check('u1 숨김 → 200', hideU1.status === 200 && hideU1.json?.isHidden === true, hideU1);
  const sCh = await api(tS, 'GET', chBase);
  const tCh = await api(tT, 'GET', chBase);
  const ids = (r: any) => (r.json ?? []).map((c: any) => c.id);
  check('학생 GET chapters 에 c1·c2 없음, 미분류 c3 는 있음', sCh.status === 200 && !ids(sCh).includes(c1id) && !ids(sCh).includes(c2id) && ids(sCh).includes(c3id), ids(sCh));
  check('교사 GET chapters 에는 c1·c2 있음', ids(tCh).includes(c1id) && ids(tCh).includes(c2id), ids(tCh));
  const sVid = await api(tS, 'GET', vBase);
  const tVid = await api(tT, 'GET', vBase);
  check('학생 GET videos 에 cv1 없음, 미분류 cv2 는 있음', sVid.status === 200 && !ids(sVid).includes(cv1id) && ids(sVid).includes(cv2id), ids(sVid));
  check('교사 GET videos 에는 cv1 있음', ids(tVid).includes(cv1id), ids(tVid));

  // 시청 화면 detail / siblings
  const sDetail = await api(tS, 'GET', `/api/classroom-videos/${cv1id}`);
  check('학생 GET 숨긴 단원 영상 상세 → 200 (막지 않음)', sDetail.status === 200 && sDetail.json?.id === cv1id, sDetail.status);
  check('학생 detail siblings 에 숨긴 단원(u1) 영상 없음', Array.isArray(sDetail.json?.siblings) && sDetail.json.siblings.every((s: any) => s.unitId !== u1) && !ids({ json: sDetail.json.siblings }).includes(cv2id), sDetail.json?.siblings?.map((s: any) => [s.id, s.unitId]));
  const tDetail = await api(tT, 'GET', `/api/classroom-videos/${cv1id}`);
  check('교사 detail unit.id === u1', tDetail.status === 200 && tDetail.json?.unit?.id === u1 && typeof tDetail.json?.unit?.title === 'string', tDetail.json?.unit);
  check('교사 detail siblings 는 같은 단원(u1)만, cv2(미분류) 제외',
    Array.isArray(tDetail.json?.siblings) && tDetail.json.siblings.length > 0 && tDetail.json.siblings.every((s: any) => s.unitId === u1) && !ids({ json: tDetail.json.siblings }).includes(cv2id),
    tDetail.json?.siblings?.map((s: any) => [s.id, s.unitId]));
  const tDetail2 = await api(tT, 'GET', `/api/classroom-videos/${cv2id}`);
  check('미분류 영상 detail: unit === null, siblings 는 자기 제외 전체', tDetail2.json?.unit === null && tDetail2.json?.siblings?.every((s: any) => s.id !== cv2id) && ids({ json: tDetail2.json?.siblings }).includes(cv1id), tDetail2.json?.siblings?.map((s: any) => s.id));

  // 학생 detail: 숨기지 않은 단원 / 미분류 영상은 정상 siblings
  const sDetail2 = await api(tS, 'GET', `/api/classroom-videos/${cv2id}`);
  check('학생 미분류 영상 siblings 에 숨긴 단원 영상 없음', sDetail2.status === 200 && !ids({ json: sDetail2.json?.siblings }).includes(cv1id), sDetail2.json?.siblings?.map((s: any) => s.id));

  // 삭제
  const del = await api(tT, 'DELETE', `/api/units/${u1}`);
  check('DELETE → 204', del.status === 204, del);
  const [afterC1] = await db.select().from(chapters).where(eq(chapters.id, c1id));
  const [afterC2] = await db.select().from(chapters).where(eq(chapters.id, c2id));
  const [afterCv1] = await db.select().from(classroomVideos).where(eq(classroomVideos.id, cv1id));
  check('DELETE u1 → c1·c2·cv1 unitId === null (항목은 남음)', afterC1?.unitId === null && afterC2?.unitId === null && afterCv1?.unitId === null, [afterC1?.unitId, afterC2?.unitId, afterCv1?.unitId]);
  const gone = await api(tT, 'PATCH', `/api/units/${u1}`, { title: '없음' });
  check('삭제 후 PATCH → 404 단원을 찾을 수 없습니다', gone.status === 404 && gone.json?.error === '단원을 찾을 수 없습니다', gone);

  // 정리
  await db.delete(classrooms).where(eq(classrooms.id, otherCls.id));
  for (const id of [c1id, c2id, c3id]) await db.delete(chapters).where(eq(chapters.id, id));
  for (const id of [cv1id, cv2id]) await db.delete(classroomVideos).where(eq(classroomVideos.id, id));
  await db.delete(videos).where(eq(videos.id, vidA.id));
  await db.delete(videos).where(eq(videos.id, vidB.id));
  await db.delete(classroomVideos).where(eq(classroomVideos.id, cv.id));
  await db.delete(videos).where(eq(videos.id, vid.id));
  await db.delete(chapters).where(eq(chapters.id, chap.id));
  await db.delete(units).where(eq(units.classroomId, cls.id));
  await pgClient.end();
  console.log(failures === 0 ? '\n전부 통과' : `\n실패 ${failures}건`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
