import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { bucketRelPath } from './bucketPath.js';

describe('bucketRelPath', () => {
  const root = path.resolve('/vol');
  it.each([
    [['ib-guide', 'ia/ex26/student/001.webp'], 'ia/ex26/student/001.webp'],
    [['ib-guide'], ''],
    [['x/../ib-guide', 'manifest/ia.json'], 'manifest/ia.json'],
    [['chapter-pages', '../ib-guide/ia/ex01/student/001.webp'], 'ia/ex01/student/001.webp'],
    [['ib-guide-other', 'a'], null],
    [['chapter-pages', 'a.png'], null],
    [['ib-guide', '../../etc/passwd'], null],
  ])('bucketRelPath(%j) = %j', (segs, want) => expect(bucketRelPath(root, 'ib-guide', ...segs)).toBe(want));
});
