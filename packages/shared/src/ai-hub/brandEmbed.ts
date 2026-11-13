// 사본(오빠두엑셀 브랜드 룩북)은 그쪽 허브 셸 — 왼쪽 메뉴(aside.aih-side)·모바일 메뉴(nav.aih-mnav)·위치 표시(nav.aihx-crumb)·
// 제목 띠(.otl-band--content: 「브랜드 룩북」 제목·사용법·설명) — 를 함께 담고 있다. 우리 허브 머리글이 그 역할을 하므로
// iframe 안에서는 숨기고 필터 토글·필터·결과만 남긴다. 사본 파일은 고치지 않고 응답에 덮어쓰기 스타일만 끼운다(재 import 해도 유지).
// 제목 띠는 목록(body[data-view="index"])에서만 숨긴다 — 브랜드 상세의 띠는 그 브랜드 이름이라 남긴다.
export const BRAND_EMBED_STYLE = `<style data-chois-embed>
.aih-side,.aih-mnav,.aihx-crumb,body[data-view="index"] .otl-band--content{display:none!important}
.aih{display:block!important}
.aih-main{margin:0!important;padding-left:0!important;max-width:none!important;width:100%!important}
</style>`;

export function embedBrandHtml(html: string): string {
  const at = html.indexOf('</head>');
  if (at >= 0) return `${html.slice(0, at)}${BRAND_EMBED_STYLE}\n${html.slice(at)}`;
  // head 가 없는 최소 문서(픽스처 등): body 앞에 둔다.
  const body = html.indexOf('<body');
  return body >= 0 ? `${html.slice(0, body)}${BRAND_EMBED_STYLE}\n${html.slice(body)}` : `${BRAND_EMBED_STYLE}\n${html}`;
}
