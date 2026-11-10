import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveTokenUpload } from './tokenUpload.service.js';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const allowAll = () => true;

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'tok-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function allFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await allFiles(p)));
    else out.push(p);
  }
  return out;
}

describe('saveTokenUpload', () => {
  it('저장하고 임시 파일을 남기지 않는다', async () => {
    const buf = Buffer.from('hello world');
    const r = await saveTokenUpload({
      root, rel: 'a/b.txt', stream: Readable.from([buf]), expectedSha: sha(buf), maxBytes: 1000, isAllowed: allowAll,
    });
    expect(r).toEqual({ ok: true, path: 'a/b.txt', size: buf.length });
    expect(await readFile(path.join(root, 'a/b.txt'))).toEqual(buf);
    expect((await allFiles(root)).filter((f) => f.endsWith('.part'))).toEqual([]);
  });

  it('허용 목록 밖 경로는 400, 아무것도 쓰지 않는다', async () => {
    const buf = Buffer.from('x');
    const r = await saveTokenUpload({
      root, rel: 'a.txt', stream: Readable.from([buf]), expectedSha: sha(buf), maxBytes: 1000, isAllowed: () => false,
    });
    expect(r).toEqual({ ok: false, status: 400, error: 'path not allowed' });
    expect(await allFiles(root)).toEqual([]);
  });

  it('루트 밖으로 해석되는 경로는 400', async () => {
    const buf = Buffer.from('x');
    const r = await saveTokenUpload({
      root, rel: '../x', stream: Readable.from([buf]), expectedSha: sha(buf), maxBytes: 1000, isAllowed: allowAll,
    });
    expect(r).toEqual({ ok: false, status: 400, error: 'path not allowed' });
  });

  it('sha 불일치는 422, 목적지·임시 파일 없음', async () => {
    const r = await saveTokenUpload({
      root, rel: 'a.txt', stream: Readable.from([Buffer.from('x')]), expectedSha: 'a'.repeat(64), maxBytes: 1000, isAllowed: allowAll,
    });
    expect(r).toEqual({ ok: false, status: 422, error: 'sha256 mismatch' });
    expect(await allFiles(root)).toEqual([]);
  });

  it('한도 초과는 413, 목적지 없음', async () => {
    const buf = Buffer.alloc(50, 1);
    const r = await saveTokenUpload({
      root, rel: 'a.bin', stream: Readable.from([buf]), expectedSha: sha(buf), maxBytes: 10, isAllowed: allowAll,
    });
    expect(r).toEqual({ ok: false, status: 413, error: 'too large' });
    expect(await allFiles(root)).toEqual([]);
  });

  it('validate 가 오류를 주면 422 이고 기존 파일은 그대로', async () => {
    await mkdir(path.join(root, 'm'), { recursive: true });
    await writeFile(path.join(root, 'm/ia.json'), 'old');
    const buf = Buffer.from('new');
    const r = await saveTokenUpload({
      root, rel: 'm/ia.json', stream: Readable.from([buf]), expectedSha: sha(buf), maxBytes: 1000, isAllowed: allowAll,
      validate: async () => ['bad one', 'bad two', 'bad three', 'bad four'],
    });
    // 이유를 앞의 3개까지 붙여 올리는 쪽(ib:push·ai:push)이 422 의 원인을 볼 수 있게 한다.
    expect(r).toEqual({ ok: false, status: 422, error: 'invalid manifest: bad one; bad two; bad three' });
    expect(await readFile(path.join(root, 'm/ia.json'), 'utf8')).toBe('old');
    expect((await allFiles(root)).filter((f) => f.endsWith('.part'))).toEqual([]);
  });

  it('validate 는 sha 확인 뒤 임시 파일 경로로 호출된다', async () => {
    const buf = Buffer.from('data');
    let seen = '';
    const r = await saveTokenUpload({
      root, rel: 'a.txt', stream: Readable.from([buf]), expectedSha: sha(buf), maxBytes: 1000, isAllowed: allowAll,
      validate: async (rel, tmp) => { seen = `${rel}|${await readFile(tmp, 'utf8')}`; return []; },
    });
    expect(r.ok).toBe(true);
    expect(seen).toBe('a.txt|data');
  });

  it('sha 형식이 틀리면 400', async () => {
    const r = await saveTokenUpload({
      root, rel: 'a.txt', stream: Readable.from([Buffer.from('x')]), expectedSha: 'nothex', maxBytes: 1000, isAllowed: allowAll,
    });
    expect(r).toEqual({ ok: false, status: 400, error: 'missing sha' });
    expect(await allFiles(root)).toEqual([]);
  });
});
