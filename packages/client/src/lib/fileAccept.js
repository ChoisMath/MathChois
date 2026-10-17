/**
 * `<input accept>` 문자열과 같은 규칙으로 File 을 검사한다 (드롭된 파일용 — 드롭은 accept 를 거치지 않는다).
 * 토큰: ".html"(확장자) / "image/*"(MIME 접두) / "text/html"(MIME 정확 일치). accept 가 비면 모두 허용.
 */
export function parseAccept(accept) {
  return String(accept ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function fileMatchesAccept(file, accept) {
  const tokens = parseAccept(accept);
  if (tokens.length === 0) return true;
  const name = String(file?.name ?? '').toLowerCase();
  const type = String(file?.type ?? '').toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith('.')) return name.endsWith(t);
    if (t.endsWith('/*')) return type.startsWith(t.slice(0, -1));
    return type === t;
  });
}

/** 업로드 URL(`/api/files/<bucket>/<dir>/<timestamp>_<name>`)에서 사용자에게 보여줄 파일명만 추출 */
export function fileNameFromUrl(url) {
  if (!url) return '';
  let last = String(url).split('?')[0].split('/').pop() ?? '';
  try { last = decodeURIComponent(last); } catch { /* 그대로 둔다 */ }
  return last.replace(/^\d{10,}_/, '');
}
