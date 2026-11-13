// 토큰 업로드 API(서버)와 이전 스크립트가 같이 쓰는 순수 검사들. 브라우저 번들에도 들어가므로 node: 모듈을 쓰지 않는다.
import { isAiHubFile } from './paths.js';

/**
 * `Authorization: Bearer <token>` 이 기대 토큰과 같은지 — 길이를 먼저 비교하고, 같으면
 * 전체 길이에 걸쳐 문자 코드를 XOR 누적한다(중간에 빠져나가지 않음). 기대 토큰이 비어 있으면 항상 false.
 */
export function tokenMatches(header: string | undefined, expected: string | undefined): boolean {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const given = header.slice('Bearer '.length);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const SHA256 = /^[0-9a-f]{64}$/;
const ENTRY_KEYS = ['sha256', 'size', 'updatedAt'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isEntry(v: unknown): boolean {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v).sort();
  if (keys.length !== ENTRY_KEYS.length || keys.some((k, i) => k !== ENTRY_KEYS[i])) return false;
  return Number.isInteger(v.size) && (v.size as number) >= 0
    && typeof v.sha256 === 'string' && SHA256.test(v.sha256)
    && typeof v.updatedAt === 'string' && v.updatedAt.length > 0;
}

/** manifest JSON(`Manifest` 모양) 검사 — 문제 목록을 돌려준다(빈 배열이면 통과). */
export function validateManifest(json: unknown): string[] {
  if (!isPlainObject(json)) return ['manifest: not an object'];
  const errors: string[] = [];
  for (const [rel, entry] of Object.entries(json)) {
    if (!isAiHubFile(rel)) errors.push(`${rel}: path not allowed`);
    else if (!isEntry(entry)) errors.push(`${rel}: bad entry`);
  }
  return errors;
}
