/**
 * IB교육과정 안내 API 스모크 (로컬 PostgreSQL + 실행 중인 서버 필요). 첫 실패에서 exit 1.
 *
 *   npx tsx --env-file=.env scripts/ib-guide-e2e-setup.ts > "$SCRATCH/ib.json"   # (packages/server 에서)
 *   npm run dev:server                                                         # 3001 포트
 *   npx tsx --env-file=.env scripts/ib-guide-api-smoke.ts "$SCRATCH/ib.json"
 *   npx tsx --env-file=.env scripts/ib-guide-e2e-setup.ts --cleanup
 *
 * 계정은 실제 로그인 API(이메일·비밀번호)로 토큰을 받는다. .env 에서 VOLUME_PATH(디스크 원본 비교)와
 * IB_MEDIA_UPLOAD_TOKEN(토큰 업로드)을 읽는다. 업로드 검사로 올린 ex03 파일은 끝에 지운다(우리가 올린 바이트일 때만).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import sharp from 'sharp';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3001';
const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error('사용법: npx tsx --env-file=.env scripts/ib-guide-api-smoke.ts <fixture.json>');
  process.exit(2);
}
const VOLUME_PATH = process.env.VOLUME_PATH;
const UPLOAD_TOKEN = process.env.IB_MEDIA_UPLOAD_TOKEN;
if (!VOLUME_PATH || !UPLOAD_TOKEN) {
  console.error('.env 에 VOLUME_PATH 와 IB_MEDIA_UPLOAD_TOKEN 이 있어야 합니다');
  process.exit(2);
}
const ROOT = path.resolve(VOLUME_PATH, 'ib-guide');

type Fixture = {
  teacher: { email: string }; student: { email: string }; outsider: { email: string };
  password: string; classroomId: string; classCode: string;
};

let group = '';
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? '✓' : '✗'} ${group} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) process.exit(1);
}

type Res = { status: number; headers: Headers; json: any; bytes: Buffer };

async function call(method: string, url: string, init: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...init.headers };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let body: BodyInit | undefined = init.raw;
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const res = await fetch(BASE + url, { method, headers, body });
  const bytes = Buffer.from(await res.arrayBuffer());
  let json: any = null;
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    try { json = JSON.parse(bytes.toString('utf8')); } catch { /* 빈 본문 */ }
  }
  return { status: res.status, headers: res.headers, json, bytes };
}

/** 경로를 정규화하지 않고 그대로 보낸다(fetch 는 `..`·`%2e%2e` 를 접어 버린다). */
function rawGet(rawPath: string): Promise<number> {
  const u = new URL(BASE);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: u.hostname, port: u.port, method: 'GET', path: rawPath }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

async function login(email: string, password: string): Promise<string> {
  const r = await call('POST', '/api/auth/login', { body: { email, password } });
  if (r.status !== 200 || typeof r.json?.token !== 'string') {
    console.error(`로그인 실패: ${email}`, r.status, r.json);
    process.exit(1);
  }
  return r.json.token;
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
const page = (exId: string, doc: string, n: string) => `/api/ib/ia/${exId}/${doc}/pages/${n}`;

function upload(rel: string, buf: Buffer, sha: string, token = UPLOAD_TOKEN) {
  return call('PUT', `/api/ib/media?path=${encodeURIComponent(rel)}`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'x-content-sha256': sha },
    raw: new Uint8Array(buf),
  });
}

async function main() {
  const fx = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
  const tT = await login(fx.teacher.email, fx.password);
  const tS = await login(fx.student.email, fx.password);
  const tO = await login(fx.outsider.email, fx.password);
  const firstPage = page('ex01', 'student', '1');

  group = '[1 토큰 없음]';
  {
    const list = await call('GET', '/api/ib/ia');
    check('GET /api/ib/ia → 401', list.status === 401, list.status);
    const p = await call('GET', firstPage);
    check('페이지 → 401', p.status === 401, p.status);
  }

  group = '[2 학생·스위치 꺼짐]';
  {
    const a = await call('GET', '/api/ib/access', { token: tS });
    check('/api/ib/access → { allowed: false }', a.status === 200 && a.json?.allowed === false, a.json);
    const list = await call('GET', '/api/ib/ia', { token: tS });
    check('목록 → 403', list.status === 403, list.status);
    const p = await call('GET', firstPage, { token: tS });
    check('페이지 → 403', p.status === 403, p.status);
  }

  group = '[3 교사가 스위치 켬]';
  {
    const r = await call('PATCH', `/api/classrooms/${fx.classroomId}`, { token: tT, body: { ibGuideEnabled: true } });
    check('PATCH → 200, ibGuideEnabled: true', r.status === 200 && r.json?.ibGuideEnabled === true, r.json);
    const bad = await call('PATCH', `/api/classrooms/${fx.classroomId}`, { token: tT, body: { ibGuideEnabled: 'yes' } });
    check('boolean 아님 → 400 ibGuideEnabled must be boolean',
      bad.status === 400 && bad.json?.error === 'ibGuideEnabled must be boolean', bad.json);
  }

  group = '[4 학생 목록]';
  {
    const a = await call('GET', '/api/ib/access', { token: tS });
    check('/api/ib/access → { allowed: true }', a.status === 200 && a.json?.allowed === true, a.json);
    const list = await call('GET', '/api/ib/ia', { token: tS });
    const ex = list.json?.examples ?? [];
    check('목록 200, ex01·ex02 순서', list.status === 200 && ex.map((e: any) => e.id).join(',') === 'ex01,ex02', list.json);
    check('ex01 쪽수 student 3 · annotated 3 · comments 1',
      ex[0]?.docs?.student?.pages === 3 && ex[0]?.docs?.annotated?.pages === 3 && ex[0]?.docs?.comments?.pages === 1, ex[0]);
    check('ex02 쪽수 student 2 뿐', ex[1]?.docs?.student?.pages === 2 && Object.keys(ex[1]?.docs ?? {}).length === 1, ex[1]);
    check('files 키 없음', !('files' in (list.json ?? {})) && ex.every((e: any) => !('files' in e)), list.json);
  }

  group = '[5 워터마크 페이지]';
  {
    const s = await call('GET', firstPage, { token: tS });
    check('학생 ex01/student/1 → 200', s.status === 200, s.status);
    check('content-type: image/webp', s.headers.get('content-type') === 'image/webp', s.headers.get('content-type'));
    check('cache-control: private, no-store', s.headers.get('cache-control') === 'private, no-store', s.headers.get('cache-control'));
    check('content-disposition: inline', s.headers.get('content-disposition') === 'inline', s.headers.get('content-disposition'));
    const meta = await sharp(s.bytes).metadata();
    check('디코드 크기 1600×2263', meta.format === 'webp' && meta.width === 1600 && meta.height === 2263, meta);
    const onDisk = await readFile(path.join(ROOT, 'ia/ex01/student/001.webp'));
    check('디스크 원본과 바이트가 다름', !s.bytes.equals(onDisk));
    const t = await call('GET', firstPage, { token: tT });
    check('교사 응답 200 · 학생 응답과 바이트가 다름(사용자별 워터마크)', t.status === 200 && !t.bytes.equals(s.bytes), t.status);
  }

  group = '[6 없는 페이지]';
  for (const [exId, doc, n] of [
    ['ex01', 'student', '4'], ['ex02', 'annotated', '1'], ['ex99', 'student', '1'],
    ['ex01', 'other', '1'], ['ex01', 'student', '0'], ['ex01', 'student', '1.webp'],
  ]) {
    const r = await call('GET', page(exId, doc, n), { token: tS });
    check(`${exId}/${doc}/${n} → 404`, r.status === 404, r.status);
  }

  group = '[7 일반 파일 경로]';
  for (const url of ['/api/files/ib-guide/ia/ex01/student/001.webp', '/api/files/ib-guide/manifest/ia.json']) {
    const r = await call('GET', url, { token: tT });
    check(`${url} → 404`, r.status === 404, r.status);
  }
  for (const raw of ['/api/files/x/../ib-guide/manifest/ia.json', '/api/files/chapter-pages/%2e%2e/ib-guide/manifest/ia.json']) {
    const status = await rawGet(raw);
    check(`${raw} (정규화 없이) → 404`, status === 404, status);
  }

  group = '[8 일반 업로드·삭제]';
  {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('x')], { type: 'image/webp' }), 'x.webp');
    const up = await call('POST', '/api/files/upload?bucket=ib-guide&directory=ia', { token: tT, raw: form });
    check('교사 POST /api/files/upload bucket=ib-guide → 403', up.status === 403, up.status);
    const del = await call('DELETE', '/api/files/ib-guide/ia/ex01/student/001.webp', { token: tT });
    check('교사 DELETE ib-guide 파일 → 403', del.status === 403, del.status);
    check('파일은 그대로 있음', existsSync(path.join(ROOT, 'ia/ex01/student/001.webp')));
  }

  group = '[9 학급 없는 학생]';
  {
    const list = await call('GET', '/api/ib/ia', { token: tO });
    check('목록 → 403', list.status === 403, list.status);
    const p = await call('GET', firstPage, { token: tO });
    check('페이지 → 403', p.status === 403, p.status);
  }

  group = '[10 토큰 업로드]';
  const uploadedRel = 'ia/ex03/student/001.webp';
  const uploaded = await sharp({ create: { width: 1600, height: 2263, channels: 3, background: '#ffffff' } }).webp({ quality: 80 }).toBuffer();
  try {
    const wrong = await upload(uploadedRel, uploaded, sha256(uploaded), 'x'.repeat(64));
    check('틀린 토큰 → 401', wrong.status === 401, wrong.status);
    const ok = await upload(uploadedRel, uploaded, sha256(uploaded));
    check(`${uploadedRel} 올바른 sha → 200`, ok.status === 200 && ok.json?.ok === true && ok.json?.size === uploaded.length, ok.json);
    const badSha = await upload('ia/ex03/student/002.webp', uploaded, 'f'.repeat(64));
    check('틀린 sha → 422', badSha.status === 422, badSha.json);
    check('틀린 sha 파일은 남지 않음', !existsSync(path.join(ROOT, 'ia/ex03/student/002.webp')));
    const traversal = await upload('../x', uploaded, sha256(uploaded));
    check('path=../x → 400', traversal.status === 400, traversal.json);

    const before = await call('GET', '/api/ib/media/manifest', { headers: { authorization: `Bearer ${UPLOAD_TOKEN}` } });
    check('GET /api/ib/media/manifest → 200, no-store',
      before.status === 200 && before.headers.get('cache-control') === 'no-store' && before.json?.version === 1, before.status);
    const next = structuredClone(before.json);
    next.examples.push({ id: 'ex04', no: 4, title: 'missing', note: '', docs: { student: { pages: 1 } } });
    next.files['ia/ex04/student/001.webp'] = { sha256: 'a'.repeat(64), size: 10 };
    const nextBuf = Buffer.from(JSON.stringify(next));
    const rejected = await upload('manifest/ia.json', nextBuf, sha256(nextBuf));
    check('올리지 않은 페이지를 적은 manifest → 422', rejected.status === 422, rejected.json);
    const after = await call('GET', '/api/ib/media/manifest', { headers: { authorization: `Bearer ${UPLOAD_TOKEN}` } });
    check('이전 manifest 가 그대로 나감', after.status === 200 && JSON.stringify(after.json) === JSON.stringify(before.json), after.json);
  } finally {
    // 우리가 올린 바이트일 때만 지우고, 빈 폴더(ex03/student, ex03)를 정리한다.
    const abs = path.join(ROOT, uploadedRel);
    if (existsSync(abs) && (await readFile(abs)).equals(uploaded)) {
      await rm(abs);
      for (const d of [path.dirname(abs), path.dirname(path.dirname(abs))]) {
        if (!(await readdir(d)).length) await rmdir(d);
      }
    }
  }

  group = '[11 스위치 끔]';
  {
    const r = await call('PATCH', `/api/classrooms/${fx.classroomId}`, { token: tT, body: { ibGuideEnabled: false } });
    check('PATCH ibGuideEnabled: false → 200', r.status === 200 && r.json?.ibGuideEnabled === false, r.json);
    const p = await call('GET', firstPage, { token: tS });
    check('학생의 바로 다음 페이지 요청 → 403', p.status === 403, p.status);
  }

  console.log('모든 검사 통과');
}

main().catch((err) => { console.error(err); process.exit(1); });
