import { it, expect } from 'vitest';
import { stepZoom, pagesToLoad, availableDocs, resolveDoc, carryPage, neighbours } from './viewer';

it('stepZoom', () => { expect(stepZoom(100, 1)).toBe(125); expect(stepZoom(200, 1)).toBe(200); expect(stepZoom(50, -1)).toBe(50); expect(stepZoom(110, -1)).toBe(100); });
it('pagesToLoad', () => {
  expect(pagesToLoad([3, 4], 24)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(pagesToLoad([1], 2)).toEqual([1, 2]);
  expect(pagesToLoad([], 24)).toEqual([]);
  expect(pagesToLoad([24], 24, 1)).toEqual([23, 24]);
});
const ex = { id: 'ex26', no: 26, docs: { student: { pages: 24 }, annotated: { pages: 22 }, comments: { pages: 2 } } };
it('docs', () => {
  expect(availableDocs({ docs: { comments: { pages: 1 }, student: { pages: 2 } } })).toEqual(['student', 'comments']);
  expect(resolveDoc(ex, 'annotated')).toBe('annotated');
  expect(resolveDoc({ docs: { comments: { pages: 1 } } }, 'student')).toBe('comments');
  expect(resolveDoc({ docs: {} }, 'student')).toBeNull();
  expect(resolveDoc(ex, 'bogus')).toBe('student');
});
it('carryPage', () => {
  const counts = { student: 24, annotated: 22, comments: 2 };
  expect(carryPage({ from: 'student', to: 'annotated', page: 7, counts, remembered: {} })).toBe(7);
  expect(carryPage({ from: 'student', to: 'annotated', page: 24, counts, remembered: {} })).toBe(22);
  expect(carryPage({ from: 'student', to: 'comments', page: 7, counts, remembered: {} })).toBe(1);
  expect(carryPage({ from: 'comments', to: 'student', page: 2, counts, remembered: { student: 7 } })).toBe(7);
  expect(carryPage({ from: 'comments', to: 'annotated', page: 2, counts, remembered: {} })).toBe(1);
});
it('neighbours', () => {
  const list = [{ id: 'ex03', no: 3 }, { id: 'ex01', no: 1 }, { id: 'ex10', no: 10 }];
  expect(neighbours(list, 'ex03')).toEqual({ prev: 'ex01', next: 'ex10' });
  expect(neighbours(list, 'ex01')).toEqual({ prev: null, next: 'ex03' });
  expect(neighbours(list, 'ex99')).toEqual({ prev: null, next: null });
});
