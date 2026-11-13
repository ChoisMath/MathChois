import { describe, it, expect } from 'vitest';
import { finalPrompt } from '@mathchois/shared';
import { detailCopyState } from './copyState';

const orig = (over = {}) => ({ source: 'oppadu', secs: 15, prompt: { v2: true }, ...over });

describe('detailCopyState', () => {
  it('원본 v2 편: 방식 a + 편 길이', () => {
    expect(detailCopyState(orig())).toMatchObject({ style: 'a', len: 15 });
  });
  it('secs 없으면 기본 길이 10', () => {
    expect(detailCopyState(orig({ secs: undefined }))).toMatchObject({ style: 'a', len: 10 });
  });
  it('변형본은 null', () => {
    expect(detailCopyState(orig({ source: 'chois' }))).toBeNull();
  });
  it('v2 가 아닌 원본은 null', () => {
    expect(detailCopyState(orig({ prompt: { v2: false } }))).toBeNull();
  });
  it('prompt 없으면 null', () => {
    expect(detailCopyState(orig({ prompt: null }))).toBeNull();
  });
  it('방식 a 로 완성하면 「예시 그대로」 줄만 남는다', () => {
    const out = finalPrompt({ tpl: '{{#a}}EX\n{{#b}}TOPIC {{Topic=}}', st: detailCopyState(orig()), lang: 'en' });
    expect(out).toContain('EX');
    expect(out).not.toContain('TOPIC');
  });
});
