// 북마클릿 수집본 찾기 — `ai:oppadu`·`ai:remake-upgrade` 가 함께 쓴다.
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** ~/Downloads 에서 가장 최근 수집본 — 이름의 날짜 내림차순, 같은 날이면 Chrome 이 붙인 ` (n)` 이 큰 것. */
export async function latestDownload(kind: 'motion' | 'slide'): Promise<string | null> {
  const dir = path.join(os.homedir(), 'Downloads');
  if (!existsSync(dir)) return null;
  const pattern = new RegExp(`^oppadu-${kind}-(\\d{4}-\\d{2}-\\d{2})(?: \\((\\d+)\\))?\\.json$`);
  const found = (await readdir(dir))
    .map((name) => ({ name, m: pattern.exec(name) }))
    .filter((x): x is { name: string; m: RegExpExecArray } => x.m !== null)
    .map(({ name, m }) => ({ name, date: m[1] as string, n: Number(m[2] ?? 0) }))
    .sort((a, b) => (a.date === b.date ? b.n - a.n : a.date < b.date ? 1 : -1));
  return found.length ? path.join(dir, found[0]!.name) : null;
}
