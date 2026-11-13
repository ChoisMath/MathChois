/**
 * 같은 목록을 여러 번 다시 읽을 때 마지막에 시작한 요청의 응답만 쓰게 한다(늦게 도착한 이전 응답은 버림).
 *   const gate = createRequestGate();
 *   const token = gate.next(); const data = await load(); if (gate.isLatest(token)) setData(data);
 */
export function createRequestGate() {
  let latest = 0;
  return {
    next: () => ++latest,
    isLatest: (token) => token === latest,
  };
}
