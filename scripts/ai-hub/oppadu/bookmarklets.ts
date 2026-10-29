// 북마클릿 소스(bookmarklets/*.ts)를 esbuild 로 한 덩어리 IIFE 로 묶어 `javascript:` URL 로 만들고,
// 즐겨찾기 막대로 끌어 놓을 링크 둘이 든 `.oppadu/bookmarklets.html` 을 쓴다.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
/** 주소창·즐겨찾기 저장 한도를 넉넉히 밑도는 길이(브라우저마다 다르나 수만 자까지는 안전). */
const MAX_URL_LENGTH = 60_000;

async function bundle(entry: string): Promise<string> {
  const result = await build({
    entryPoints: [path.join(HERE, 'bookmarklets', entry)],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    platform: 'browser',
    target: 'chrome120',
    logLevel: 'silent',
    // esbuild 는 tsconfig paths 를 쓰지 않으므로 shared 소스를 직접 가리킨다. 북마클릿이 쓰는 건 점검 함수뿐이라 index(교육과정 표 등
    // 부수 효과 있는 모듈까지 딸려 들어와 주소가 두 배로 길어진다) 대신 oppaduSync.ts 만 가리킨다.
    alias: { '@mathchois/shared': path.join(REPO, 'packages/shared/src/ai-hub/oppaduSync.ts') },
  });
  const url = `javascript:${encodeURIComponent(result.outputFiles[0].text.trim())}`;
  if (url.length >= MAX_URL_LENGTH) throw new Error(`${entry}: 북마클릿 주소가 너무 깁니다 (${url.length} >= ${MAX_URL_LENGTH})`);
  return url;
}

export async function buildBookmarklets(): Promise<{ motion: string; slide: string }> {
  const [motion, slide] = await Promise.all([bundle('motion.ts'), bundle('slide.ts')]);
  return { motion, slide };
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function writeBookmarkletsPage(file: string): Promise<void> {
  const { motion, slide } = await buildBookmarklets();
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>오빠두 받기 북마클릿</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px}a.bm{display:inline-block;margin:8px 12px 8px 0;padding:10px 18px;border:1px solid #888;border-radius:8px;text-decoration:none;color:#111;background:#f4f4f4}</style>
</head>
<body>
<h1>오빠두 회원 자료 받기</h1>
<p>아래 두 링크를 즐겨찾기 막대로 끌어 놓으세요. 로그인한 오빠두 해당 페이지에서 누르면 JSON 이 내려받아집니다.</p>
<p><a class="bm" href="${attr(motion)}">오빠두 모션 받기</a><a class="bm" href="${attr(slide)}">오빠두 슬라이드 받기</a></p>
</body>
</html>
`;
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(file, html);
}
