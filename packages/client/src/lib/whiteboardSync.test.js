import { describe, it, expect } from 'vitest';
import {
  shouldAcceptRemote, mergeElements, diffChangedElements, markVersions, pruneDeleted, countLiveElements,
} from '@mathchois/shared';

const el = (id, version, versionNonce, extra = {}) => ({ id, version, versionNonce, type: 'rectangle', ...extra });

describe('shouldAcceptRemote', () => {
  it('로컬이 없으면 받아들인다', () => {
    expect(shouldAcceptRemote(undefined, el('a', 1, 5))).toBe(true);
  });
  it('원격 version 이 크면 받아들인다', () => {
    expect(shouldAcceptRemote(el('a', 1, 5), el('a', 2, 9))).toBe(true);
  });
  it('원격 version 이 작으면 거부한다', () => {
    expect(shouldAcceptRemote(el('a', 3, 5), el('a', 2, 1))).toBe(false);
  });
  it('version 이 같으면 versionNonce 가 작은 쪽이 이긴다', () => {
    expect(shouldAcceptRemote(el('a', 2, 5), el('a', 2, 1))).toBe(true);
    expect(shouldAcceptRemote(el('a', 2, 1), el('a', 2, 5))).toBe(false);
    expect(shouldAcceptRemote(el('a', 2, 5), el('a', 2, 5))).toBe(false);
  });
});

describe('mergeElements', () => {
  const student = { authorId: 's1', authorName: '학생1', isStudent: true };
  const teacher = { authorId: 't1', authorName: '교사', isStudent: false };

  it('학생이 보낸 신규 요소는 작성자가 본인으로 강제된다', () => {
    const scene = new Map();
    const accepted = mergeElements(scene, [el('a', 1, 1, { customData: { authorId: 'hacker', authorName: 'x' } })], student);
    expect(accepted).toHaveLength(1);
    expect(scene.get('a').customData).toEqual({ authorId: 's1', authorName: '학생1' });
  });

  it('학생이 수정한 기존 요소는 원 작성자가 보존된다', () => {
    const scene = new Map([['a', el('a', 1, 1, { customData: { authorId: 's2', authorName: '학생2' } })]]);
    mergeElements(scene, [el('a', 2, 1, { customData: { authorId: 's1', authorName: '학생1' } })], student);
    expect(scene.get('a').version).toBe(2);
    expect(scene.get('a').customData).toEqual({ authorId: 's2', authorName: '학생2' });
  });

  it('교사는 보낸 작성자 값을 유지하고 없으면 본인이 된다', () => {
    const scene = new Map();
    mergeElements(scene, [
      el('a', 1, 1, { customData: { authorId: 's9', authorName: '학생9' } }),
      el('b', 1, 1),
    ], teacher);
    expect(scene.get('a').customData.authorId).toBe('s9');
    expect(scene.get('b').customData).toEqual({ authorId: 't1', authorName: '교사' });
  });

  it('오래된 version 은 반영되지 않고 반환에도 없다', () => {
    const scene = new Map([['a', el('a', 5, 1)]]);
    const accepted = mergeElements(scene, [el('a', 3, 1)], teacher);
    expect(accepted).toEqual([]);
    expect(scene.get('a').version).toBe(5);
  });

  it('id/version 이 없는 쓰레기 입력은 무시한다', () => {
    const scene = new Map();
    const accepted = mergeElements(scene, [{ foo: 1 }, null, el('ok', 1, 1)], teacher);
    expect(accepted.map((e) => e.id)).toEqual(['ok']);
  });

  it('기존 요소의 customData 다른 키는 유지하면서 작성자만 덮어쓴다', () => {
    const scene = new Map();
    mergeElements(scene, [el('a', 1, 1, { customData: { note: 'x' } })], student);
    expect(scene.get('a').customData).toEqual({ note: 'x', authorId: 's1', authorName: '학생1' });
  });
});

describe('diffChangedElements / markVersions', () => {
  it('version 이 바뀐 요소만 반환하고 기록을 갱신한다', () => {
    const last = new Map();
    const a1 = el('a', 1, 1); const b1 = el('b', 1, 1);
    expect(diffChangedElements([a1, b1], last).map((e) => e.id)).toEqual(['a', 'b']);
    expect(diffChangedElements([a1, b1], last)).toEqual([]);
    const a2 = el('a', 2, 7);
    expect(diffChangedElements([a2, b1], last).map((e) => e.id)).toEqual(['a']);
    expect(last.get('a')).toBe(2);
  });

  it('markVersions 는 전송 없이 기록만 한다', () => {
    const last = new Map();
    markVersions([el('a', 3, 1)], last);
    expect(diffChangedElements([el('a', 3, 1)], last)).toEqual([]);
    expect(diffChangedElements([el('a', 4, 1)], last)).toHaveLength(1);
  });
});

describe('pruneDeleted', () => {
  it('오래된 삭제 요소만 제거한다', () => {
    const now = 1_000_000;
    const els = [
      el('live', 1, 1, { isDeleted: false, updated: 0 }),
      el('old-del', 1, 1, { isDeleted: true, updated: now - 20_000 }),
      el('new-del', 1, 1, { isDeleted: true, updated: now - 1_000 }),
      el('no-updated-del', 1, 1, { isDeleted: true }),
    ];
    expect(pruneDeleted(els, 10_000, now).map((e) => e.id)).toEqual(['live', 'new-del']);
  });
});

describe('countLiveElements', () => {
  it('삭제되지 않은 요소만 센다', () => {
    expect(countLiveElements([el('a', 1, 1), el('b', 1, 1, { isDeleted: true })])).toBe(1);
    expect(countLiveElements(null)).toBe(0);
  });
});
