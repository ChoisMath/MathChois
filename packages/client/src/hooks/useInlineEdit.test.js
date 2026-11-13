// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useInlineEdit } from './useInlineEdit';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** 훅을 쓰는 최소 화면: 보기 모드는 <p>, 편집 모드는 <textarea> */
function Field({ value, save, allowEmpty, placeholder }) {
  const f = useInlineEdit({ value, save, allowEmpty });
  if (f.editing) {
    return createElement('textarea', {
      value: f.draft, onChange: (e) => f.setDraft(e.target.value), onBlur: f.commit, onKeyDown: f.onKeyDown, disabled: f.saving,
    });
  }
  return createElement('p', { onClick: f.start }, value || placeholder);
}

function mount(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (p) => act(() => { root.render(createElement(Field, p)); });
  render(props);
  return { host, render, unmount: () => { act(() => { root.unmount(); }); host.remove(); } };
}
const key = (el, k, extra = {}) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra })); });
const type = (el, text) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const flush = () => act(async () => { await Promise.resolve(); });

describe('useInlineEdit', () => {
  it('클릭하면 현재 값으로 편집을 시작하고 Enter 로 저장한다', async () => {
    const save = vi.fn(() => Promise.resolve());
    const m = mount({ value: '원래 설명', save, allowEmpty: true, placeholder: '설명 추가' });
    act(() => { m.host.querySelector('p').click(); });
    const ta = m.host.querySelector('textarea');
    expect(ta.value).toBe('원래 설명');
    type(ta, ' 바뀐 설명 ');
    key(ta, 'Enter');
    await flush();
    expect(save).toHaveBeenCalledWith('바뀐 설명');
    expect(m.host.querySelector('textarea')).toBeNull(); // 저장 뒤 보기 모드
    m.unmount();
  });

  it('Shift+Enter 는 저장하지 않고(줄바꿈용), Esc 는 저장 없이 원복한다', async () => {
    const save = vi.fn(() => Promise.resolve());
    const m = mount({ value: '원래', save, allowEmpty: true });
    act(() => { m.host.querySelector('p').click(); });
    const ta = m.host.querySelector('textarea');
    type(ta, '첫 줄');
    key(ta, 'Enter', { shiftKey: true });
    expect(save).not.toHaveBeenCalled();
    expect(m.host.querySelector('textarea')).not.toBeNull();
    key(ta, 'Escape');
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(m.host.querySelector('p').textContent).toBe('원래');
    m.unmount();
  });

  it('바뀌지 않았거나(제목을) 비웠으면 저장을 부르지 않고 닫는다', async () => {
    const save = vi.fn(() => Promise.resolve());
    const m = mount({ value: '제목', save, allowEmpty: false });
    act(() => { m.host.querySelector('p').click(); });
    type(m.host.querySelector('textarea'), '   ');
    key(m.host.querySelector('textarea'), 'Enter');
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(m.host.querySelector('textarea')).toBeNull();
    m.unmount();
  });

  it('비울 수 있는 값을 비우고 포커스를 떼면 null 로 저장한다', async () => {
    const save = vi.fn(() => Promise.resolve());
    const m = mount({ value: '지울 설명', save, allowEmpty: true, placeholder: '설명 추가' });
    act(() => { m.host.querySelector('p').click(); });
    const ta = m.host.querySelector('textarea');
    type(ta, '');
    act(() => { ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); }); // React 의 onBlur 는 focusout
    await flush();
    expect(save).toHaveBeenCalledWith(null);
    m.unmount();
  });

  it('저장이 실패해도 편집을 닫고 값은 그대로 둔다', async () => {
    const save = vi.fn(() => Promise.reject(new Error('network')));
    const m = mount({ value: '원래', save, allowEmpty: true });
    act(() => { m.host.querySelector('p').click(); });
    type(m.host.querySelector('textarea'), '새 값');
    key(m.host.querySelector('textarea'), 'Enter');
    await flush();
    expect(m.host.querySelector('textarea')).toBeNull();
    expect(m.host.querySelector('p').textContent).toBe('원래');
    m.unmount();
  });
});
