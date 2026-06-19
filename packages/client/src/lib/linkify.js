const URL_RE = /(?:https?:\/\/|www\.)[^\s<]+/gi;

// 문장 끝 구두점은 URL에 포함하지 않는다.
const TRAILING_PUNCT = /[.,;:!?'"]+$/;

function trimUrl(raw) {
  let url = raw.replace(TRAILING_PUNCT, '');
  // "(https://...)" 처럼 URL을 감싼 닫는 괄호 제거 — URL 스스로 연 괄호는 보존한다.
  while (/[)\]]$/.test(url)) {
    const close = url.slice(-1);
    const open = close === ')' ? '(' : '[';
    if (url.split(open).length - 1 >= url.split(close).length - 1) break;
    url = url.slice(0, -1);
  }
  return url;
}

/** plain text를 text/link 세그먼트 배열로 분해. link.href는 클릭 가능한 절대 URL. */
export function splitLinkSegments(text) {
  if (!text) return [];
  const segments = [];
  let lastIndex = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const url = trimUrl(m[0]);
    if (!url) continue;
    const start = m.index;
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({
      type: 'link',
      value: url,
      href: url.startsWith('www.') ? `https://${url}` : url,
    });
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}
