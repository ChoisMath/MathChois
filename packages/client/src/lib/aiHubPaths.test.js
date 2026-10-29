import { describe, it, expect } from 'vitest';
import { isAiHubFile, isAiHubPublicFile, isBrandSiteFile, mediaUrl, BRAND_ASSETS } from '@mathchois/shared';

describe('ai-hub paths', () => {
  it.each(['motion/01-pixel/video.mp4', 'motion/119-coin-stack-lesson/poster.webp', 'slide/24/1.webp', 'slide/426/s/12.webp', 'slide/24/t/4.webp', 'manifest/motion.json', 'brand/index.html', 'brand/brand/apple.html', 'brand/data/detail/apple.json', 'brand/assets/fonts/PretendardVariable.woff2', 'brand/assets/pcf-resources.js', 'brand/assets/pcf-resources.css', 'brand/assets/pcf-ui.css', 'brand/assets/base.css'])('allows %s', (p) => expect(isAiHubFile(p)).toBe(true));
  it.each(['../motion/01-pixel/video.mp4', '/motion/01-pixel/video.mp4', 'motion/01-pixel/raw.mov', 'slide/24/13.webp', 'slide/24/x/1.webp', 'brand/assets/evil.js', 'brand/assets/pcf.js', 'brand/assets/pcf-ui.js', 'brand/assets/base-dynamic.css', 'brand/assets/style.css', 'brand/assets/appXjs', 'brand/../index.html', 'manifest/x.json', 'motion/01-pixel/video.mp4?v=1'])('rejects %s', (p) => expect(isAiHubFile(p)).toBe(false));
  it('every BRAND_ASSETS entry is an allowed brand file', () => {
    expect(BRAND_ASSETS.length).toBe(13);
    expect(BRAND_ASSETS.every((a) => isAiHubFile('brand/' + a))).toBe(true);
    expect(isAiHubFile('brand/assets/pcf.js')).toBe(false);
  });
  it('brand site paths are relative to brand/', () => {
    expect(isBrandSiteFile('index.html')).toBe(true);
    expect(isBrandSiteFile('brand/index.html')).toBe(false);
  });
  it.each(['motion/01-pixel/video.mp4', 'slide/24/s/3.webp', 'manifest/brand.json'])('serves %s publicly', (p) => expect(isAiHubPublicFile(p)).toBe(true));
  it.each(['brand/index.html', 'brand/brand/apple.html', 'brand/assets/app.js', 'brand/data/brands-index.json', 'motion/../brand/index.html', 'manifest/x.json'])('does not serve %s publicly', (p) => expect(isAiHubPublicFile(p)).toBe(false));
  it('mediaUrl', () => expect(mediaUrl('motion/01-pixel/video.mp4', 'abcdef0123456789')).toBe('/api/files/ai-hub/motion/01-pixel/video.mp4?v=abcdef01'));
});
