// 허용 경로(업로드·서빙 공통). 슬라이드 장 번호는 1–12, 브랜드 상세(brand/<slug>.html)는 index 를 슬러그로 쓰지 않는다.
// `rel` 은 ai-hub 버킷 루트 기준 상대 경로이며 쿼리·`..`·앞 슬래시를 허용하지 않는다.
export const MOTION_FILE = /^motion\/\d{2,3}-[a-z0-9-]+\/(video\.mp4|preview\.mp4|poster\.webp)$/;
export const SLIDE_FILE = /^slide\/\d{2,3}\/(?:[st]\/)?(?:[1-9]|1[0-2])\.webp$/; // 슬라이드는 한 덱에 최대 12장
/**
 * 브랜드 룩북 사본이 갖는 자산(목록·상세 HTML 과 브랜드별 data/hero·detail JSON 말고 전부). 사본 빌더(`ai:oppadu`)·`ai:brand:import`·
 * 서버 허용 경로(`BRAND_FILE`)가 이 목록 하나를 같이 쓴다. 2026-10-29 오빠두 목록의 색 탭·찾기 칸을 그리는 pcf-resources.js/.css·
 * pcf-ui.css 가 1단계 사본(9개)보다 늘었다. base.css(테마 기본 규칙)는 찾기 칸의 숨은 이름표(.screen-reader-text)를 감춘다 —
 * 빼면 「브랜드 디자인에서 찾기」 글자가 칸 위에 겹쳐 보인다(2026-10-29 사본 확인).
 */
export const BRAND_ASSETS: readonly string[] = [
  'assets/app.js', 'assets/ai-hub-static.js', 'assets/shell.js', 'assets/pcf-resources.js',
  'assets/app.css', 'assets/ai-hub.css', 'assets/shell.css', 'assets/tokens.css', 'assets/base.css', 'assets/pcf-resources.css', 'assets/pcf-ui.css',
  'assets/fonts/PretendardVariable.woff2', 'data/brands-index.json',
];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const BRAND_FILE = new RegExp(
  `^brand/(?:index\\.html|brand/(?!index\\.html)[a-z0-9-]+\\.html|data/(?:hero|detail)/[a-z0-9-]+\\.json|${BRAND_ASSETS.map(escapeRe).join('|')})$`,
);
export const MANIFEST_FILE = /^manifest\/(motion|slide|brand)\.json$/;

export function isAiHubFile(rel: string): boolean {
  return MOTION_FILE.test(rel) || SLIDE_FILE.test(rel) || BRAND_FILE.test(rel) || MANIFEST_FILE.test(rel);
}

/**
 * `/api/files/ai-hub/…` 로 공개 서빙해도 되는 파일 — 모션·슬라이드 미디어와 manifest 뿐이다.
 * 브랜드 사본(HTML·JS)은 제3자 스크립트라 앱 origin 에서 열리면 안 되므로 여기서 빠지고 `/api/ai/brand/site/*` 로만 나간다.
 */
export function isAiHubPublicFile(rel: string): boolean {
  return MOTION_FILE.test(rel) || SLIDE_FILE.test(rel) || MANIFEST_FILE.test(rel);
}

/** `brand/` 밑 사본 안에서의 상대 경로(브랜드 사이트 서빙 라우트용). */
export function isBrandSiteFile(rel: string): boolean {
  return BRAND_FILE.test('brand/' + rel);
}

/** 미디어 주소 — manifest 의 sha256 앞 8자를 버전으로 붙여 캐시가 안전하게 오래 간다. */
export function mediaUrl(rel: string, sha256: string): string {
  return `/api/files/ai-hub/${rel}?v=${sha256.slice(0, 8)}`;
}
