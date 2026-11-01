import { describe, it, expect } from 'vitest';
import { resolveInlineEdit } from './inlineEdit.js';

describe('resolveInlineEdit — 인라인 편집 저장 규칙', () => {
  it('앞뒤 공백을 지우고 바뀐 값만 저장 대상으로 본다', () => {
    expect(resolveInlineEdit('미적분', '  미적분 1단원  ')).toEqual({ changed: true, value: '미적분 1단원' });
    expect(resolveInlineEdit('미적분', ' 미적분 ')).toEqual({ changed: false, value: '미적분' });
  });

  it('필수 값(제목)은 비우면 저장하지 않는다', () => {
    expect(resolveInlineEdit('미적분', '   ')).toEqual({ changed: false, value: '미적분' });
    expect(resolveInlineEdit('미적분', '')).toEqual({ changed: false, value: '미적분' });
  });

  it('비울 수 있는 값(설명)은 비우면 null 로 저장하고, 원래 없던 것을 비운 채 두면 변화 없음', () => {
    expect(resolveInlineEdit('첫 단원 설명', '  ', { allowEmpty: true })).toEqual({ changed: true, value: null });
    expect(resolveInlineEdit(null, '', { allowEmpty: true })).toEqual({ changed: false, value: null });
    expect(resolveInlineEdit(undefined, '   ', { allowEmpty: true })).toEqual({ changed: false, value: null });
    expect(resolveInlineEdit(null, ' 새 설명 ', { allowEmpty: true })).toEqual({ changed: true, value: '새 설명' });
  });

  it('여러 줄 설명은 줄 안의 내용을 유지하고 바깥 공백만 지운다', () => {
    expect(resolveInlineEdit(null, '\n첫 줄\n둘째 줄\n', { allowEmpty: true })).toEqual({ changed: true, value: '첫 줄\n둘째 줄' });
  });
});
