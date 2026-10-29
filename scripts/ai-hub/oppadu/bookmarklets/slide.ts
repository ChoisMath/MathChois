/// <reference lib="dom" />
// [오빠두 슬라이드 받기] 북마클릿 — 로그인한 Chrome 의 오빠두 슬라이드 스타일 페이지에서 눌러 프롬프트가 든 JSON 을 받는다.
// 손님 화면에는 styles[i].prompt 가 없으므로 checkSlideBundle 이 막는다.
import { checkSlideBundle } from '@mathchois/shared';

type Win = Window & { OPD_SLIDE_STYLES?: { img?: string; styles?: unknown[] }; OPD_SLS_TAGS?: unknown };

const pad = (n: number) => String(n).padStart(2, '0');

function saveJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function run() {
  if (!/^\/ai\/slide-styles(\/|$)/.test(location.pathname)) {
    alert('오빠두 슬라이드 스타일 페이지에서 눌러 주세요');
    return;
  }
  const w = window as Win;
  const s = w.OPD_SLIDE_STYLES;
  if (!s || !Array.isArray(s.styles)) {
    alert('페이지가 다 열린 뒤 다시 눌러 주세요');
    return;
  }
  const now = new Date();
  const checked = checkSlideBundle({
    kind: 'oppadu-slide',
    fetchedAt: now.toISOString(),
    page: location.href,
    img: s.img,
    styles: s.styles,
    tags: w.OPD_SLS_TAGS,
  });
  if (!checked.ok) {
    alert(checked.error);
    return;
  }
  saveJson(`oppadu-slide-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`, checked.bundle);
  alert(`${checked.bundle.styles.length}개 저장했어요`);
}

try {
  run();
} catch (e) {
  alert(`받지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
}
