import { describe, it, expect } from 'vitest';
import {
  canUseIbGuide, iaPageRel, isIbGuideFile, parseIaFileName, planIaFiles,
  validateIbManifest, iaPageCount, diffIbFiles,
} from '@mathchois/shared';

describe('canUseIbGuide', () => {
  it.each([
    [{ role: null, isAdmin: false, allowedClassroomCount: 0 }, false],
    [{ role: 'student', isAdmin: false, allowedClassroomCount: 0 }, false],
    [{ role: 'student', isAdmin: false, allowedClassroomCount: 1 }, true],
    [{ role: 'teacher', isAdmin: false, allowedClassroomCount: 0 }, true],
    [{ role: 'student', isAdmin: true, allowedClassroomCount: 0 }, true],
  ])('%o → %s', (a, ok) => expect(canUseIbGuide(a)).toBe(ok));
});

describe('paths', () => {
  it('builds and accepts page paths', () => {
    expect(iaPageRel('ex26', 'student', 1)).toBe('ia/ex26/student/001.webp');
    expect(isIbGuideFile('ia/ex26/annotated/024.webp')).toBe(true);
    expect(isIbGuideFile('manifest/ia.json')).toBe(true);
  });
  it.each(['ia/ex26/student/000.webp', 'ia/ex26/student/1.webp', 'ia/ex7/student/001.webp', 'ia/ex26/other/001.webp',
    'ia/ex26/student/001.png', '/ia/ex26/student/001.webp', 'ia/ex26/student/../student/001.webp',
    'ia/ex26/student/001.webp?x=1', 'manifest/other.json', 'ia/ex26/student/001.pdf'])('rejects %s', (rel) =>
    expect(isIbGuideFile(rel)).toBe(false));
});

describe('parseIaFileName', () => {
  it.each([
    ['COMMON_1-29__ex26_student.pdf', { exId: 'ex26', no: 26, doc: 'student' }],
    ['COMMON_1-29__ex26_annotated (1).pdf', { exId: 'ex26', no: 26, doc: 'annotated' }],
    ['COMMON_1-29__ex24_comments (1).pdf', { exId: 'ex24', no: 24, doc: 'comments' }],
    ['COMMON_1-29__ex3_comment.pdf', { exId: 'ex03', no: 3, doc: 'comments' }],
    ['common_1-29__EX26_STUDENT.PDF', { exId: 'ex26', no: 26, doc: 'student' }],
  ])('%s', (name, want) => expect(parseIaFileName(name)).toEqual(want));
  it.each(['notes.pdf', 'COMMON_1-29__ex26_student.docx', 'COMMON_1-29__ex0_student.pdf', 'COMMON_1-29__ex126_student.pdf',
    'COMMON_1-29__index26_student.pdf'])('null for %s', (name) => expect(parseIaFileName(name)).toBeNull());
});

it('planIaFiles sorts, skips and reports duplicates', () => {
  const r = planIaFiles(['a__ex02_comments.pdf', 'a__ex10_student.pdf', 'a__ex02_student.pdf', 'a__ex02_student (1).pdf', 'readme.pdf', 'x.txt']);
  expect(r.items.map((i) => `${i.exId}/${i.doc}`)).toEqual(['ex02/student', 'ex02/student', 'ex02/comments', 'ex10/student']);
  expect(r.skipped).toEqual(['readme.pdf']); // non-pdf files are ignored silently
  expect(r.duplicates).toEqual([{ exId: 'ex02', doc: 'student', names: ['a__ex02_student (1).pdf', 'a__ex02_student.pdf'] }]);
});

describe('validateIbManifest', () => {
  const sha = 'a'.repeat(64);
  const ok = () => ({ version: 1,
    examples: [{ id: 'ex26', no: 26, title: '', note: '', docs: { student: { pages: 2 }, comments: { pages: 1 } } }],
    files: { 'ia/ex26/student/001.webp': { sha256: sha, size: 10 }, 'ia/ex26/student/002.webp': { sha256: sha, size: 10 },
      'ia/ex26/comments/001.webp': { sha256: sha, size: 10 } } });
  it('accepts a consistent manifest', () => expect(validateIbManifest(ok())).toEqual([]));
  it('accepts an empty one', () => expect(validateIbManifest({ version: 1, examples: [], files: {} })).toEqual([]));
  it.each([
    ['not an object', () => [], /object/],
    ['wrong version', () => ({ ...ok(), version: 2 }), /version/],
    ['missing page file', () => { const m = ok(); delete m.files['ia/ex26/student/002.webp']; return m; }, /ia\/ex26\/student\/002\.webp/],
    ['file no example claims', () => { const m = ok(); m.files['ia/ex27/student/001.webp'] = { sha256: sha, size: 1 }; return m; }, /ex27/],
    ['path outside the allow-list', () => { const m = ok(); m.files['../x'] = { sha256: sha, size: 1 }; return m; }, /not allowed/],
    ['id/no mismatch', () => { const m = ok(); m.examples[0].no = 5; return m; }, /ex26/],
    ['duplicate id', () => { const m = ok(); m.examples.push(m.examples[0]); return m; }, /duplicate/],
    ['example without docs', () => { const m = ok(); m.examples[0].docs = {}; m.files = {}; return m; }, /docs/],
    ['pages = 0', () => { const m = ok(); m.examples[0].docs.comments.pages = 0; return m; }, /pages/],
    ['bad sha', () => { const m = ok(); m.files['ia/ex26/comments/001.webp'].sha256 = 'zz'; return m; }, /entry/],
    ['title too long', () => { const m = ok(); m.examples[0].title = 'x'.repeat(201); return m; }, /title/],
  ])('rejects %s', (_n, make, re) => expect(validateIbManifest(make()).join('\n')).toMatch(re));
});

it('iaPageCount and diffIbFiles', () => {
  const sha = (c) => c.repeat(64);
  const m = { version: 1, examples: [{ id: 'ex26', no: 26, title: '', note: '', docs: { student: { pages: 3 } } }], files: {} };
  expect(iaPageCount(m, 'ex26', 'student')).toBe(3);
  expect(iaPageCount(m, 'ex26', 'annotated')).toBe(0);
  expect(iaPageCount(null, 'ex26', 'student')).toBe(0);
  expect(diffIbFiles({ b: { sha256: sha('a'), size: 1 }, a: { sha256: sha('b'), size: 1 }, c: { sha256: sha('c'), size: 1 } },
    { a: { sha256: sha('b'), size: 1 }, c: { sha256: sha('d'), size: 1 } })).toEqual(['b', 'c']);
  expect(diffIbFiles({ a: { sha256: sha('a'), size: 1 } }, undefined)).toEqual(['a']);
});
