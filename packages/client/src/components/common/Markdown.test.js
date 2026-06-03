import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from './Markdown.jsx';

const render = (md) => renderToStaticMarkup(createElement(Markdown, null, md));

describe('Markdown', () => {
  it('renders allowed raw HTML tags (<center>, <br>)', () => {
    const html = render('<center>가운데<br/>정렬</center>');
    expect(html).toContain('<center>');
    expect(html).toContain('<br');
  });

  it('keeps KaTeX math rendering', () => {
    const html = render('수식 $x^2$ 끝');
    expect(html).toContain('katex');
  });

  it('strips dangerous tags', () => {
    const html = render('<script>alert(1)</script><img src=x onerror=alert(1)>안전');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror');
  });
});
