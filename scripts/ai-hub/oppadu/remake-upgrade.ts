// npm run ai:remake-upgrade — 변형본(chois) 모션 틀을 오빠두 새 판(v2: 방식·로고·사운드·렌더링·길이·화면·화면 글자 옵션)의 구성으로 올린다.
//   [-- --motion <파일>]  북마클릿 모션 수집본(생략하면 ~/Downloads 의 가장 최근 oppadu-motion-YYYY-MM-DD.json)
//   [--dry-run]           보고서만 찍고 아무것도 쓰지 않음
// 입력: 수집본(오빠두 옛 틀 full.items[id].prompt/.ko + 새 틀 .v2.en/.ko) · .media-out/prompts/motion.json(ai:pull 이 받은 변형본 틀)
// 출력: .media-out/prompts/motion.remakes.json(변형본 50편, 장면표·소리 큐는 변형본 것 그대로) + .oppadu/<날짜>/remake-upgrade.md
// 그다음 npm run ai:push -- --set motion --sync-remakes 로 올린다(서버는 웹에서 고친 변형본 행을 건너뛰고, 바뀐 행은 백업을 남긴다).
// 병합 규칙: packages/shared/src/ai-hub/remakeUpgrade.ts
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MOTION_CATALOG, checkMotionBundle, hasStyle, isV2, upgradeRemakeTemplate, validateTemplate } from '@mathchois/shared';
import { OPPADU_DIR, hasFlag, promptsFile, remakePromptsFile } from '../volumeLayout.js';
import { latestDownload } from './downloads.js';

type Row = [string, string, string];
type PromptRow = { id: string; prompt: string; ko: string; shots: Row[]; cues: Row[] };

class Stop extends Error {}

const rel = (p: string) => path.relative(process.cwd(), p) || '.';
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function checkArgs(argv: readonly string[]): string | null {
  let motion: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--dry-run') continue;
    if (a === '--motion') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) throw new Stop('--motion 다음에 파일 경로가 필요합니다');
      motion = path.resolve(v);
      i++;
      continue;
    }
    throw new Stop(`알 수 없는 인자: ${a} — 쓸 수 있는 인자: --motion <파일>, --dry-run`);
  }
  return motion;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const explicit = checkArgs(argv);
  const dryRun = hasFlag(argv, '--dry-run');

  const file = explicit ?? (await latestDownload('motion'));
  if (!file || !existsSync(file)) {
    throw new Stop(explicit ? `${rel(explicit)} 이 없습니다` : '~/Downloads 에 oppadu-motion-*.json 이 없습니다 — 로그인 Chrome 에서 모션 북마클릿으로 먼저 받으세요');
  }
  const checked = checkMotionBundle(JSON.parse(await readFile(file, 'utf8')));
  if (!checked.ok) throw new Stop(`${rel(file)}: ${checked.error}`);
  const full = checked.bundle.full.items;

  const source = promptsFile('motion');
  if (!existsSync(source)) throw new Stop(`${rel(source)} 이 없습니다 — 먼저 npm run ai:pull -- --set motion 으로 변형본 틀을 받으세요`);
  const rows = JSON.parse(await readFile(source, 'utf8')) as PromptRow[];
  const remakeIds = new Set(MOTION_CATALOG.filter((m) => m.source === 'chois').map((m) => m.id));
  const remakes = rows.filter((r) => remakeIds.has(r.id));
  if (!remakes.length) throw new Stop(`${rel(source)} 에 변형본(chois) 틀이 없습니다`);

  const out: PromptRow[] = [];
  const lines: string[] = [`# 변형본 틀 올리기 ${today()}`, '', `- 수집본: ${path.basename(file)}`, `- 변형본 틀: ${rel(source)} (${remakes.length}편)`];
  const errors: string[] = [];
  const notes: string[] = [];
  for (const r of remakes) {
    const f = full[r.id];
    if (!f?.v2 || !f.prompt || !f.ko) { errors.push(`${r.id}: 수집본에 옛 틀이나 새 틀이 없습니다`); continue; }
    const en = upgradeRemakeTemplate(f.prompt, r.prompt, f.v2.en);
    const ko = upgradeRemakeTemplate(f.ko, r.ko, f.v2.ko);
    for (const [lang, t] of [['en', en.text], ['ko', ko.text]] as const) {
      const bad = validateTemplate(t);
      if (bad.length) errors.push(`${r.id}.${lang}: ${bad.join('; ')}`);
      if (!isV2(t) || !hasStyle(t)) errors.push(`${r.id}.${lang}: 새 판(옵션·방식) 틀이 아닙니다`);
    }
    const left = [...en.unplaced.map((u) => `en: ${u}`), ...ko.unplaced.map((u) => `ko: ${u}`)];
    if (left.length) notes.push(`### ${r.id}`, ...left.map((u) => `- ${u.replace(/\n/g, ' ⏎ ').slice(0, 300)}`));
    out.push({ id: r.id, prompt: en.text, ko: ko.text, shots: r.shots, cues: r.cues });
  }
  if (errors.length) throw new Stop(`틀을 만들지 못했습니다 — 아무것도 쓰지 않았습니다:\n  ${errors.join('\n  ')}`);

  lines.push(`- 결과: ${out.length}편 → ${rel(remakePromptsFile())}`, '', '## 옮기지 않은 변형본 고침',
    '새 판이 옵션 칸으로 바꾼 줄(채널 이름·한 줄 소개·주제는 기본값만 옮김, 로고 줄은 로고 옵션 글), 10초 기준 시각을 뺀 「첫 1초」 줄,',
    '조사 오타뿐인 첫 문장은 새 판 글을 쓴다. 아래는 그 밖에 남은 것까지 모두 적은 목록이다.', '', ...(notes.length ? notes : ['(없음)']));
  const summary = `변형본 ${out.length}편을 새 판 틀로 올렸습니다 (옮기지 않은 줄이 있는 편 ${notes.filter((n) => n.startsWith('### ')).length}개)`;
  if (dryRun) {
    console.info(`── --dry-run: 아무것도 쓰지 않았습니다 ──\n${summary}`);
    return;
  }
  await writeFile(remakePromptsFile(), JSON.stringify(out, null, 1) + '\n');
  const dayDir = path.join(OPPADU_DIR, today());
  await mkdir(dayDir, { recursive: true });
  const report = path.join(dayDir, 'remake-upgrade.md');
  await writeFile(report, lines.join('\n') + '\n');
  console.info(`${summary}\n보고서: ${rel(report)}\n다음 할 일: npm run ai:push -- --set motion --sync-remakes`);
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Stop ? err.message : err);
  process.exitCode = 1;
}
