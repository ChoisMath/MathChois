import { describe, it, expect } from 'vitest';
import { isRateLimitExempt } from './rateLimitExempt.js';

describe('isRateLimitExempt', () => {
  it('keeps the existing exemptions', () => {
    expect(isRateLimitExempt('GET', '/assets/index-abc.js')).toBe(true);
    expect(isRateLimitExempt('GET', '/socket.io/?EIO=4')).toBe(true);
    expect(isRateLimitExempt('GET', '/api/health')).toBe(true);
    expect(isRateLimitExempt('GET', '/favicon.svg')).toBe(true);
  });
  it('exempts reading AI hub media (slide thumbnails, motion posters, manifests)', () => {
    expect(isRateLimitExempt('GET', '/api/files/ai-hub/slide/1237/t/1.webp?v=84ef8d3e')).toBe(true);
    expect(isRateLimitExempt('HEAD', '/api/files/ai-hub/motion/01-pixel/poster.webp?v=1')).toBe(true);
    expect(isRateLimitExempt('GET', '/api/files/ai-hub/manifest/slide.json')).toBe(true);
  });
  it('still counts writes, other buckets, the API and traversal attempts', () => {
    expect(isRateLimitExempt('PUT', '/api/files/ai-hub/slide/1/1.webp')).toBe(false);
    expect(isRateLimitExempt('GET', '/api/files/videos/a.mp4')).toBe(false);
    expect(isRateLimitExempt('GET', '/api/ai/slide')).toBe(false);
    expect(isRateLimitExempt('PUT', '/api/ai/media?path=slide/1/1.webp')).toBe(false);
    expect(isRateLimitExempt('GET', '/api/files/ai-hub/../videos/a.mp4')).toBe(false);
    expect(isRateLimitExempt('GET', '/api/files/ai-hub/%2e%2e/videos/a.mp4')).toBe(false);
    expect(isRateLimitExempt('GET', '/api/files/ai-hub/slide%2F..%2Fx')).toBe(false);
  });
});
