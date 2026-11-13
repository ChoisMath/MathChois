import { access, constants } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// src/services 와 dist/services 모두 두 단계 위에 assets/ 가 있다.
export const WATERMARK_FONT_FILE = fileURLToPath(
  new URL('../../assets/fonts/Pretendard-Regular.otf', import.meta.url),
);

const MAX_NAME_LENGTH = 40;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const seoulDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 워터마크 문구: 이름 · 이메일 · 서울 기준 날짜. 이름은 다듬고 40자로 줄인다. */
export function watermarkText(who: { name: string; email: string }, now: Date): string {
  let name = who.name.trim();
  if (!name) name = '이름 없음';
  const chars = Array.from(name);
  if (chars.length > MAX_NAME_LENGTH) name = chars.slice(0, MAX_NAME_LENGTH).join('') + '…';
  return `${name} · ${who.email} · ${seoulDate.format(now)}`;
}

// Pango 마크업에 들어가므로 이름/이메일의 특수문자를 이스케이프한다.
function escapeMarkup(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 대각선 반복용 타일(PNG, 알파 포함). 글꼴 파일이 없으면 거부한다. */
export async function buildWatermarkTile(text: string, fontFile: string = WATERMARK_FONT_FILE): Promise<Buffer> {
  // sharp 는 fontfile 이 없어도 던지지 않고 다른 글꼴로 대체하므로(한글이 두부로 나옴) 직접 확인한다.
  try {
    await access(fontFile, constants.R_OK);
  } catch {
    throw new Error(`watermark font missing: ${fontFile}`);
  }
  // 어두운 줄은 흰 배경, 밝은 줄은 검은/어두운 배경에서 읽힌다. 한 색만 쓰면 어두운 영역에서 사라진다.
  const t = escapeMarkup(text);
  const markup = `<span foreground="#000000" alpha="14%">${t}</span>\n<span foreground="#ffffff" alpha="28%">${t}</span>`;
  const padded = await sharp({
    text: { text: markup, font: 'Pretendard 18', fontfile: fontFile, rgba: true, dpi: 144, spacing: 18 },
  })
    .extend({ top: 36, bottom: 36, left: 24, right: 24, background: TRANSPARENT })
    .png()
    .toBuffer();
  // extend 와 rotate 는 한 파이프라인에서 sharp 고정 순서로 실행되므로 둘로 나눈다.
  return sharp(padded).rotate(-30, { background: TRANSPARENT }).png().toBuffer();
}

/** 페이지 전체에 타일을 깔아 WebP 로 합성한다. 크기는 원본과 같다. */
export async function applyWatermark(page: Buffer, tile: Buffer): Promise<Buffer> {
  const pageMeta = await sharp(page).metadata();
  const tileMeta = await sharp(tile).metadata();
  const pw = pageMeta.width ?? 0;
  const ph = pageMeta.height ?? 0;
  let input = tile;
  // 타일이 페이지보다 크면 composite 가 실패하므로 먼저 줄인다.
  if ((tileMeta.width ?? 0) > pw || (tileMeta.height ?? 0) > ph) {
    input = await sharp(tile).resize({ width: pw, height: ph, fit: 'inside' }).png().toBuffer();
  }
  return sharp(page)
    .composite([{ input, tile: true }])
    .webp({ quality: 80, effort: 2 })
    .toBuffer();
}

/** 사용자별 타일 LRU 캐시. 같은 키의 동시 요청은 한 번만 만든다. */
export function createTileCache(max = 200) {
  const done = new Map<string, Buffer>();
  const pending = new Map<string, Promise<Buffer>>();
  return {
    async get(key: string, build: () => Promise<Buffer>): Promise<Buffer> {
      const hit = done.get(key);
      if (hit) {
        done.delete(key);
        done.set(key, hit); // 최근 사용으로 갱신
        return hit;
      }
      const inflight = pending.get(key);
      if (inflight) return inflight;
      const p = build()
        .then((buf) => {
          done.set(key, buf);
          while (done.size > max) done.delete(done.keys().next().value as string);
          return buf;
        })
        .finally(() => pending.delete(key));
      pending.set(key, p);
      return p;
    },
  };
}
