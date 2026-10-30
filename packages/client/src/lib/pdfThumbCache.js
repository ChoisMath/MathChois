/**
 * PDF 쪽 썸네일(dataURL) LRU 캐시. 같은 쪽을 다시 그리지 않도록 `url#쪽@폭` 별로 보관한다.
 * Map 삽입 순서 = 사용 순서 — get 이 적중하면 맨 뒤로 옮기고, max 를 넘으면 맨 앞(가장 오래 안 쓴 것)을 버린다.
 */
export function createThumbCache(max = 200) {
  const entries = new Map();

  function get(key) {
    if (!entries.has(key)) return undefined;
    const value = entries.get(key);
    entries.delete(key);
    entries.set(key, value);
    return value;
  }

  function set(key, dataUrl) {
    entries.delete(key);
    entries.set(key, dataUrl);
    while (entries.size > max) entries.delete(entries.keys().next().value);
  }

  return { get, set };
}

export function thumbKey(pdfUrl, pageNumber, width) {
  return `${pdfUrl}#${pageNumber}@${width}`;
}

export const pdfThumbCache = createThumbCache(200);
