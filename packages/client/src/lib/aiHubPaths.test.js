import { describe, it, expect } from 'vitest';
import { isAiHubFile, isBrandSiteFile, mediaUrl } from '@mathchois/shared';

describe('ai-hub paths', () => {
  it.each(['motion/01-pixel/video.mp4', 'motion/119-coin-stack-lesson/poster.webp', 'slide/24/1.webp', 'slide/426/s/12.webp', 'slide/24/t/4.webp', 'manifest/motion.json', 'brand/index.html', 'brand/brand/apple.html', 'brand/data/detail/apple.json', 'brand/assets/fonts/PretendardVariable.woff2'])('allows %s', (p) => expect(isAiHubFile(p)).toBe(true));
  it.each(['../motion/01-pixel/video.mp4', '/motion/01-pixel/video.mp4', 'motion/01-pixel/raw.mov', 'slide/24/13.webp', 'slide/24/x/1.webp', 'brand/assets/evil.js', 'brand/../index.html', 'manifest/x.json', 'motion/01-pixel/video.mp4?v=1'])('rejects %s', (p) => expect(isAiHubFile(p)).toBe(false));
  it('brand site paths are relative to brand/', () => {
    expect(isBrandSiteFile('index.html')).toBe(true);
    expect(isBrandSiteFile('brand/index.html')).toBe(false);
  });
  it('mediaUrl', () => expect(mediaUrl('motion/01-pixel/video.mp4', 'abcdef0123456789')).toBe('/api/files/ai-hub/motion/01-pixel/video.mp4?v=abcdef01'));
});
