// 1회성 아이콘 생성 스크립트
// favicon.svg를 읽어 PWA에 필요한 PNG 3종을 public/ 에 생성한다.
// 실행: npm run generate:pwa-icons (packages/client 디렉터리에서)

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');

const SVG_PATH = resolve(publicDir, 'favicon.svg');
const OUT_192 = resolve(publicDir, 'icon-192.png');
const OUT_512 = resolve(publicDir, 'icon-512.png');
const OUT_MASKABLE = resolve(publicDir, 'icon-maskable-512.png');

async function main() {
  const svgBuffer = await readFile(SVG_PATH);

  // 일반 아이콘: 단순 래스터화
  await sharp(svgBuffer, { density: 512 })
    .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(OUT_192);

  await sharp(svgBuffer, { density: 512 })
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(OUT_512);

  // Maskable 아이콘: 512x512 흰 배경 + 중앙 80% 크기로 SVG 배치 (안전 영역 20% 패딩)
  const INNER = Math.round(512 * 0.8); // 410
  const innerPng = await sharp(svgBuffer, { density: 512 })
    .resize(INNER, INNER, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  const canvas = sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  const offset = Math.round((512 - INNER) / 2);
  await canvas
    .composite([{ input: innerPng, left: offset, top: offset }])
    .png()
    .toFile(OUT_MASKABLE);

  console.log('Generated:');
  console.log('  ', OUT_192);
  console.log('  ', OUT_512);
  console.log('  ', OUT_MASKABLE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
