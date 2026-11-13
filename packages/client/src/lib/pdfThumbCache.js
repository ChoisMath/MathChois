/**
 * PDF 쪽 썸네일(dataURL) LRU 캐시. 같은 쪽을 다시 그리지 않도록 `url#쪽@폭` 별로 보관한다.
 * Map 삽입 순서 = 사용 순서 — get 이 적중하면 맨 뒤로 옮기고, 개수(maxEntries)나
 * 바이트(maxBytes, dataURL 문자열 길이 합) 한도를 넘으면 맨 앞(가장 오래 안 쓴 것)부터 버린다.
 * 편집기 미리보기는 한 장에 수백 KB 라 개수만으로는 태블릿 메모리를 지킬 수 없다.
 *
 * @param {number | { maxEntries?: number, maxBytes?: number }} [options] 숫자면 maxEntries(이전 시그니처)
 */
export function createThumbCache(options = {}) {
  const { maxEntries = 200, maxBytes = 24 * 1024 * 1024 } =
    typeof options === 'number' ? { maxEntries: options } : options;
  const entries = new Map();
  let bytes = 0;

  function remove(key) {
    if (!entries.has(key)) return;
    bytes -= entries.get(key).length;
    entries.delete(key);
  }

  function get(key) {
    if (!entries.has(key)) return undefined;
    const value = entries.get(key);
    entries.delete(key);
    entries.set(key, value);
    return value;
  }

  function set(key, dataUrl) {
    remove(key);
    entries.set(key, dataUrl);
    bytes += dataUrl.length;
    while (entries.size > 0 && (entries.size > maxEntries || bytes > maxBytes)) {
      remove(entries.keys().next().value);
    }
  }

  return { get, set, get size() { return entries.size; }, get bytes() { return bytes; } };
}

/** 표시 폭을 120px 단위로 올린다 — 미리보기 크기가 조금씩 바뀔 때마다 새 썸네일 키가 생기지 않게. */
export function bucketWidth(width) {
  return Math.ceil(width / 120) * 120;
}

export function thumbKey(pdfUrl, pageNumber, width) {
  return `${pdfUrl}#${pageNumber}@${width}`;
}

export const pdfThumbCache = createThumbCache();
