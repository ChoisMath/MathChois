import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { watermarkText, buildWatermarkTile, applyWatermark, createTileCache } from './ibWatermark.service.js';

const white = (w = 1600, h = 2263) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } }).webp().toBuffer();

describe('ibWatermark.service', () => {
  it('watermarkText uses the Seoul date', () => {
    expect(watermarkText({ name: '홍길동', email: 'a@b.kr' }, new Date('2026-11-10T16:30:00Z'))).toBe('홍길동 · a@b.kr · 2026-11-11');
  });
  it('watermarkText trims and shortens a long name', () => {
    const t = watermarkText({ name: `  ${'가'.repeat(60)}  `, email: 'a@b.kr' }, new Date('2026-11-10T00:00:00Z'));
    expect(t.startsWith('가'.repeat(40) + '…')).toBe(true);
  });
  it('watermarkText replaces an empty name', () => {
    expect(watermarkText({ name: '  ', email: 'a@b.kr' }, new Date('2026-11-10T00:00:00Z'))).toBe('이름 없음 · a@b.kr · 2026-11-10');
  });
  it('composites onto a page: same size, webp, pixels changed', async () => {
    const page = await white();
    const out = await applyWatermark(page, await buildWatermarkTile('홍길동 · a@b.kr · 2026-11-10'));
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1600, 2263]);
    const { data } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true });
    let min = 255;
    for (let i = 0; i < 400_000; i++) if (data[i] < min) min = data[i];
    expect(min).toBeLessThan(250); // ink landed in the top rows too
  });
  it('marks a black page', async () => {
    // 어두운 영역에서도 보여야 한다: 밝은 글자 줄이 회색을 올린다.
    const page = await sharp({ create: { width: 1600, height: 2263, channels: 3, background: '#000000' } }).webp().toBuffer();
    const out = await applyWatermark(page, await buildWatermarkTile('홍길동 · a@b.kr · 2026-11-10'));
    const { data } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true });
    let max = 0;
    for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
    expect(max).toBeGreaterThan(40);
  });
  it('survives markup characters in the name', async () => {
    const tile = await buildWatermarkTile('A&B <script> "x" · a@b.kr · 2026-11-10');
    expect((await sharp(tile).metadata()).width).toBeGreaterThan(100);
  });
  it('shrinks a tile that is larger than the page', async () => {
    const tile = await buildWatermarkTile(`${'x'.repeat(120)}@example.com`);
    const out = await applyWatermark(await white(400, 300), tile);
    expect((await sharp(out).metadata()).width).toBe(400);
  });
  it('rejects when the font file is missing', async () => {
    await expect(buildWatermarkTile('x', '/nope/font.otf')).rejects.toThrow(/font/i);
  });
  it('renders Korean glyphs from the bundled font, not tofu', async () => {
    // 가 and 힣 must produce different ink; a font without Hangul draws the same box for both.
    const ink = async (ch: string) => (await sharp(await buildWatermarkTile(ch.repeat(8))).raw().toBuffer()).toString('base64');
    expect(await ink('가')).not.toBe(await ink('힣'));
  });
  it('tile cache builds once per key and evicts the oldest', async () => {
    const cache = createTileCache(2);
    let n = 0;
    const build = async () => Buffer.from([++n]);
    const [a1, a2] = await Promise.all([cache.get('a', build), cache.get('a', build)]);
    expect(a1).toBe(a2);
    expect(n).toBe(1);
    await cache.get('b', build);
    await cache.get('a', build);
    await cache.get('c', build); // evicts b
    await cache.get('b', build);
    expect(n).toBe(4);
  });
});
