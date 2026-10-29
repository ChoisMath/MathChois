/// <reference lib="dom" />
// [오빠두 모션 받기] 북마클릿 — 로그인한 Chrome 의 오빠두 모션 스타일 페이지에서 눌러 회원 전문까지 담은 JSON 을 받는다.
// esbuild 가 `javascript:` URL 한 줄로 묶는다(bookmarklets.ts). 점검은 shared 의 checkMotionBundle 을 그대로 쓴다.
import { checkMotionBundle, motionUpstream } from '@mathchois/shared';

type Win = Window & {
  OPD_MOTION_L?: { a?: string; mv?: string | number; data?: string; member?: boolean; add?: unknown[]; groups?: unknown; rest?: string; nonce?: string };
  GALLERY?: { items?: unknown[]; v2opts?: unknown };
};

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

async function run() {
  if (!/^\/ai\/motion-styles(\/|$)/.test(location.pathname)) {
    alert('오빠두 모션 스타일 페이지에서 눌러 주세요');
    return;
  }
  const w = window as Win;
  const c = w.OPD_MOTION_L;
  if (!c?.member || !c.rest || !c.nonce) {
    alert('로그인·멤버십 확인 — 회원 전문을 받지 못했습니다');
    return;
  }
  if (!w.GALLERY?.items) {
    alert('페이지가 다 열린 뒤 다시 눌러 주세요');
    return;
  }
  const res = await fetch(c.rest, { credentials: 'same-origin', headers: { 'X-WP-Nonce': c.nonce } });
  if (!res.ok) {
    alert(`로그인·멤버십 확인 — 회원 전문을 받지 못했습니다 (HTTP ${res.status})`);
    return;
  }
  const full = (await res.json()) as unknown;
  const now = new Date();
  const checked = checkMotionBundle({
    kind: 'oppadu-motion',
    fetchedAt: now.toISOString(),
    page: location.href,
    config: { a: c.a, mv: c.mv, data: c.data, member: c.member, add: c.add ?? [], groups: c.groups },
    gallery: { items: w.GALLERY.items, v2opts: w.GALLERY.v2opts },
    full,
  });
  if (!checked.ok) {
    alert(checked.error);
    return;
  }
  saveJson(`oppadu-motion-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`, checked.bundle);
  alert(`${motionUpstream(checked.bundle).length}편 저장했어요`);
}

run().catch((e) => alert(`받지 못했습니다: ${e instanceof Error ? e.message : String(e)}`));
