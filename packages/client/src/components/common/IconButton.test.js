import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Trash2 } from 'lucide-react';
import IconButton from './IconButton.jsx';

const render = (props) => renderToStaticMarkup(createElement(IconButton, { icon: Trash2, label: '삭제', ...props }));

describe('IconButton', () => {
  it('label 을 title 과 aria-label 로 함께 붙이고 기본은 type=button ghost', () => {
    const html = render();
    expect(html).toContain('title="삭제"');
    expect(html).toContain('aria-label="삭제"');
    expect(html).toContain('type="button"');
    expect(html).toContain('icon-btn--ghost');
  });

  it('variant·size 를 클래스로 반영하고 type 을 덮어쓸 수 있다', () => {
    const html = render({ variant: 'primary', size: 'sm', type: 'submit' });
    expect(html).toContain('icon-btn--primary');
    expect(html).toContain('icon-btn--sm');
    expect(html).toContain('type="submit"');
  });

  it('busy 면 busyLabel 로 이름을 바꾸고 누름을 막는다', () => {
    const html = render({ busy: true, busyLabel: '삭제 중...' });
    expect(html).toContain('aria-label="삭제 중..."');
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/disabled=""/);
    expect(html).toContain('icon-btn-spin');
  });

  it('as 로 다른 요소를 쓰면 type 대신 aria-disabled 를 쓴다', () => {
    const html = render({ as: 'a', href: '/x', disabled: true });
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/x"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('type=');
  });
});
