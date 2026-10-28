/**
 * 학급 상세 탭 REST 스모크 — 대시보드 응답 확장(units·videos·videoCells·email) + 학생 단위 AI 풀이 리셋(200·403·403·403·페이지 0개).
 * 준비: 서버(3001) 실행 중, JWT_SECRET 환경 변수(다른 교사 토큰 서명용), units-e2e-setup → classroom-tabs-e2e-setup 완료.
 *
 *   cd packages/server
 *   JWT_SECRET=... node scripts/classroom-tabs-smoke.mjs "$SCRATCH/units.json" "$SCRATCH/tabs.json"
 */
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
const u = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const seed = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const BASE = 'http://127.0.0.1:3001';
let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra); } };
const call = async (method, path, token, body) => {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch { /* no body */ }
  return { status: r.status, json };
};
const login = async (email) => {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Test1234!' }) });
  const j = await r.json(); if (!j.token) throw new Error('login failed ' + email + ' ' + JSON.stringify(j)); return j.token;
};

const teacher = await login(u.teacher.email);
const cid = u.classroomId;

console.log('대시보드 응답');
const d = await call('GET', `/api/dashboard/classrooms/${cid}`, teacher);
ok(d.status === 200, 'GET dashboard 200', d.status);
const data = d.json;
ok(Array.isArray(data.units) && data.units.length === 3, 'units 3개(숨김 포함)', JSON.stringify(data.units?.map(x=>x.title)));
ok(Array.isArray(data.videos) && data.videos.length === 1 && data.videos[0].durationSec === 300 && data.videos[0].unitId === u.units.u1, 'videos 1개, durationSec 300, unitId=u1');
ok(data.chapters.every((c) => 'unitId' in c && typeof c.position === 'number'), 'chapters 에 unitId·position');
ok(data.chapters.find((c) => c.id === u.chapters.cn)?.unitId === null, '미분류 챕터 unitId null');
ok(data.students.length >= 4, '학생 4명 이상(이전 스모크의 사전 등록 학생 포함)', data.students.length);
const s1 = data.students.find((s) => s.studentId === u.student.id);
ok(s1?.email === u.student.email && 'avatarUrl' in s1, '학생 email·avatarUrl');
ok(s1?.videoCells?.[u.classroomVideoId]?.completed === true && s1.videoCells[u.classroomVideoId].maxPositionSec === 295, 'videoCells 완료 295초', JSON.stringify(s1?.videoCells));
const s4 = data.students.find((s) => s.studentId === seed.students[3].id);
ok(s4 && Object.keys(s4.videoCells).length === 0, '기록 없는 학생 videoCells 비어 있음');
ok(typeof data.summary.avgAccuracy === 'number' && typeof data.summary.chapterCount === 'number', '기존 summary 필드 유지');
ok(s1 && Object.values(s1.cells).some((c) => c.notedPages > 0), '필기 셀 있음');

console.log('학생 단위 AI 풀이 초기화');
const sid = seed.students[1].id;
const before = await call('GET', `/api/coaching/classrooms/${cid}/students/${sid}/pages/${data.chapters[0].id}/attempts`, teacher); // 존재 확인용(페이지 id 아님 → 그냥 상태만)
const r1 = await call('POST', `/api/coaching/classrooms/${cid}/students/${sid}/reset`, teacher, {});
ok(r1.status === 200 && r1.json.resetPages === seed.pages, `200 resetPages=${seed.pages}`, JSON.stringify(r1.json));
// 리셋 뒤 사용 횟수 0
const pageRow = await call('GET', `/api/classrooms/${cid}/chapters`, teacher);
const r1b = await call('POST', `/api/coaching/classrooms/${cid}/students/${sid}/reset`, teacher, {});
ok(r1b.status === 200 && r1b.json.resetPages === seed.pages, '두 번째 리셋도 200(upsert)');

// 다른 교사 403
const other = jwt.sign({ sub: '00000000-0000-4000-8000-000000000001', role: 'teacher', email: 'other@x.com' }, process.env.JWT_SECRET, { expiresIn: '5m' });
const r2 = await call('POST', `/api/coaching/classrooms/${cid}/students/${sid}/reset`, other, {});
ok(r2.status === 403, '다른 교사 403', r2.status);
// 구성원 아닌 학생 403
const r3 = await call('POST', `/api/coaching/classrooms/${cid}/students/00000000-0000-4000-8000-000000000002/reset`, teacher, {});
ok(r3.status === 403, '구성원 아닌 학생 403', r3.status);
// 학생 토큰 403
const stu = await login(u.student.email);
const r4 = await call('POST', `/api/coaching/classrooms/${cid}/students/${sid}/reset`, stu, {});
ok(r4.status === 403, '학생 토큰 403', r4.status);
// 페이지 0개 학급
const c0 = await call('POST', `/api/classrooms`, teacher, { name: 'DASH E2E 빈 학급' });
ok(c0.status === 201 || c0.status === 200, '빈 학급 생성', c0.status);
const code = c0.json.classCode;
const j = await call('POST', `/api/classrooms/join`, stu, { code });
ok(j.status < 300, '학생이 빈 학급 참여', j.status + ' ' + JSON.stringify(j.json));
const r5 = await call('POST', `/api/coaching/classrooms/${c0.json.id}/students/${u.student.id}/reset`, teacher, {});
ok(r5.status === 200 && r5.json.resetPages === 0, '페이지 0개 → resetPages 0', JSON.stringify(r5.json));
const d0 = await call('GET', `/api/dashboard/classrooms/${c0.json.id}`, teacher);
ok(d0.status === 200 && d0.json.videos.length === 0 && d0.json.units.length === 0, '빈 학급 대시보드 빈 배열');
await call('DELETE', `/api/classrooms/${c0.json.id}`, teacher);

console.log('게시판');
const p = await call('GET', `/api/classrooms/${cid}/posts`, teacher);
ok(p.status === 200 && p.json.filter((x) => x.title.startsWith('DASH E2E')).length === 3, '게시글 3개');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
