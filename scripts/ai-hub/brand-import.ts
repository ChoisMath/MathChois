// 브랜드 룩북 사본(BRAND_SRC = motion/brand, 그쪽 build.cjs 산출물)을 .media-out/ai-hub/brand/ 에 서버와 같은 구조로 옮기고 manifest 를 만든다.
// 내용은 고치지 않는다. iframe 안에서 깨지는 두 가지만 손본다: 사본 밖을 가리키는 상대 링크, 외부 사이트로 가는 링크(새 창).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { writeManifest } from './manifest.js';
import { AI_DIR } from './volumeLayout.js';

const SRC = process.env.BRAND_SRC ?? '/Volumes/Chois_SD2/dev/motion/brand';
const DEST = path.join(AI_DIR, 'brand');
const SLUG_FILE = /^[a-z0-9-]+\.(?:json|html)$/;
const ASSETS = ['assets/app.js', 'assets/ai-hub-static.js', 'assets/shell.js', 'assets/app.css', 'assets/ai-hub.css', 'assets/shell.css', 'assets/tokens.css', 'assets/fonts/PretendardVariable.woff2', 'data/brands-index.json'];

// 원본 사이트(X-Frame-Options)는 iframe 안에서 열리지 않으므로 다른 출처로 가는 링크는 새 창으로 연다.
const EXTERNAL_LINKS_IN_NEW_TAB = `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(a&&a.origin!==location.origin&&!a.target){a.target='_blank';a.rel='noopener'}},true)</script>`;
// motion/brand 의 build.cjs 가 형제 사본(모션·슬라이드)으로 돌려 둔 주소를 원본 사이트로 되돌린다.
const SIBLING_LINKS: [string, string][] = [
  ['"../index.html"', '"https://www.oppadu.com/ai/motion-styles/"'],
  ['"../slide/index.html"', '"https://www.oppadu.com/ai/slide-styles/"'],
];

function writeHtml(rel: string, html: string) {
  if (!html.includes('</body>')) throw new Error(`${rel}: </body> not found`);
  const out = path.join(DEST, rel);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, html.replace('</body>', `${EXTERNAL_LINKS_IN_NEW_TAB}\n</body>`));
}

function copy(rel: string) {
  const from = path.join(SRC, rel);
  if (!existsSync(from)) throw new Error(`${from} missing — run node brand/scripts/build.cjs in motion/ first`);
  const to = path.join(DEST, rel);
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}

if (!existsSync(path.join(SRC, 'index.html'))) throw new Error(`${SRC}/index.html not found — set BRAND_SRC to the motion/brand folder`);
rmSync(DEST, { recursive: true, force: true });
let index = readFileSync(path.join(SRC, 'index.html'), 'utf8');
for (const [from, to] of SIBLING_LINKS) index = index.split(from).join(to);
writeHtml('index.html', index);
for (const rel of ASSETS) copy(rel);
for (const dir of ['data/hero', 'data/detail', 'brand']) {
  // brand/index.html 은 서버 허용 경로가 아니다(상세 페이지 슬러그는 index 를 쓰지 않는다) — 복사하지 않는다.
  for (const name of readdirSync(path.join(SRC, dir)).filter((n) => SLUG_FILE.test(n) && !(dir === 'brand' && n === 'index.html'))) {
    if (dir === 'brand') writeHtml(`${dir}/${name}`, readFileSync(path.join(SRC, dir, name), 'utf8'));
    else copy(`${dir}/${name}`);
  }
}
const manifest = await writeManifest('brand');
console.info(`brand: ${Object.keys(manifest).length} files → ${path.relative(process.cwd(), DEST)}`);
