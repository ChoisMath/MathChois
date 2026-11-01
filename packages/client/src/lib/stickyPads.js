/**
 * 메모지(포스트잇) 배경 도형 — 모델과 SVG 생성기.
 * 설계: docs/superpowers/specs/2026-11-01-sticky-pads-design.md
 *
 * 메모지 하나 = 잠긴 Excalidraw image 요소 하나. 그림은 서버 파일이 아니라 여기서 규칙으로 만든 SVG data URL 이고,
 * 같은 조합(유형·친구·무늬)은 같은 fileId 를 써서 한 노트 안에서 파일을 공유한다.
 * 유형 4종(tab 모서리 탭 · face 얼굴 메모지 · mark 워터마크 · cut 다이컷) × 친구 6종(도형 친구들, 학급 표지색과 1:1) × 무늬 3종.
 * 그림 규칙 버전 v1 — 그림을 바꾸면 v2 와 새 fileId 접두사를 쓰고 저장된 v1 요소는 그대로 둔다.
 */
import { COLOR_STYLES } from './classroomColor';

export const STICKY_TYPES    = Object.freeze(['tab', 'face', 'mark', 'cut']);
export const STICKY_FRIENDS  = Object.freeze(['circle', 'square', 'triangle', 'star', 'cloud', 'heart']);
export const STICKY_PATTERNS = Object.freeze(['plain', 'ruled', 'grid']);
export const STICKY_ID_PREFIX   = 'sticky_';
export const STICKY_FILE_PREFIX = 'stickyf_v1_';
export const STICKY_DEFAULT = Object.freeze({ type: 'tab', friend: 'circle', pattern: 'plain' });

export const TYPE_LABEL    = Object.freeze({ tab: '모서리 탭', face: '얼굴 메모지', mark: '워터마크', cut: '다이컷' });
export const FRIEND_LABEL  = Object.freeze({ circle: '동글', square: '네모', triangle: '세모', star: '별', cloud: '뭉게', heart: '하티' });
export const PATTERN_LABEL = Object.freeze({ plain: '민무늬', ruled: '줄', grid: '모눈' });

const FRIEND_COLOR = { circle: 'sky', square: 'mustard', triangle: 'coral', star: 'lavender', cloud: 'sage', heart: 'rose' };
const VIEWBOX = { tab: [180, 180], face: [180, 200], mark: [200, 190], cut: [180, 170] };

const INK   = '#1c2b4a';
const PAPER = '#f8fafd';
const BLUSH = '#f6a5a5';

/** 유효한 spec 인지 */
export function isStickySpec(spec) {
  return !!spec && STICKY_TYPES.includes(spec.type) && STICKY_FRIENDS.includes(spec.friend) && STICKY_PATTERNS.includes(spec.pattern);
}

/** 친구의 색 — 학급 표지색 그대로 */
export function friendColor(friend) {
  const { cover, tint, deep } = COLOR_STYLES[FRIEND_COLOR[friend] ?? 'sky'];
  return { cover, tint, deep };
}

/** 높이 / 너비 */
export function stickyAspect(type) {
  const [w, h] = VIEWBOX[type] ?? VIEWBOX.tab;
  return h / w;
}

export function stickyFileId({ type, friend, pattern }) {
  return `${STICKY_FILE_PREFIX}${type}_${friend}_${pattern}`;
}

/* ── 그리기 헬퍼 (모두 문자열) ── */

/** 친구 몸통 — 원점 중심, 반지름 34 기준의 경로. transform 으로 옮기고 키운다. */
const BODY = {
  circle:   'M-34 0a34 34 0 1 0 68 0a34 34 0 1 0-68 0Z',
  square:   'M-22-32H22A10 10 0 0 1 32-22V22A10 10 0 0 1 22 32H-22A10 10 0 0 1-32 22V-22A10 10 0 0 1-22-32Z',
  triangle: 'M0-36L37 30H-37Z',
  star:     'M0-38L10-14 36-11 17 7 22 33 0 20-22 33-17 7-36-11-10-14Z',
  cloud:    'M-19 18a16 16 0 0 1 4-31a18 18 0 0 1 34-4a14 14 0 0 1 8 27a12 12 0 0 1-12 8Z',
  heart:    'M0 30C-25 12-37-2-35-18a17 17 0 0 1 35-6a17 17 0 0 1 35 6c2 16-10 30-35 48Z',
};
/** 몸통 안에서 얼굴이 오는 자리 (원점 기준, 반지름 34 일 때) */
const FACE_DY = { circle: -2, square: -2, triangle: 8, star: -2, cloud: 0, heart: -6 };

const n = (v) => (Math.round(v * 100) / 100).toString();

/** 눈 두 점 · 입 · 볼터치 — (cx, cy) 가 눈높이 중심, s 는 배율 */
function face(cx, cy, s, { blush = true, stroke = INK, opacity } = {}) {
  const op = opacity !== undefined ? ` opacity="${opacity}"` : '';
  const eyes = `<circle cx="${n(cx - 11 * s)}" cy="${n(cy)}" r="${n(2.6 * s)}" fill="${stroke}"/>`
             + `<circle cx="${n(cx + 11 * s)}" cy="${n(cy)}" r="${n(2.6 * s)}" fill="${stroke}"/>`;
  const mouth = `<path d="M${n(cx - 4 * s)} ${n(cy + 8 * s)}q${n(4 * s)} ${n(4 * s)} ${n(8 * s)} 0" fill="none" stroke="${stroke}" stroke-width="${n(2 * s)}" stroke-linecap="round"/>`;
  const cheeks = blush
    ? `<circle cx="${n(cx - 19 * s)}" cy="${n(cy + 7 * s)}" r="${n(4 * s)}" fill="${BLUSH}" opacity=".7"/>`
    + `<circle cx="${n(cx + 19 * s)}" cy="${n(cy + 7 * s)}" r="${n(4 * s)}" fill="${BLUSH}" opacity=".7"/>`
    : '';
  return `<g${op}>${eyes}${mouth}${cheeks}</g>`;
}

/** 친구 몸통 + 얼굴 — (cx, cy) 중심, r 반지름 */
function friendFigure(friend, cx, cy, r, { fill, stroke = INK, strokeWidth = 2, withFace = true, opacity } = {}) {
  const k = r / 34;
  const op = opacity !== undefined ? ` opacity="${opacity}"` : '';
  const body = `<path d="${BODY[friend]}" transform="translate(${n(cx)} ${n(cy)}) scale(${n(k)})" fill="${fill}" stroke="${stroke}" stroke-width="${n(strokeWidth / k)}" stroke-linejoin="round"/>`;
  const f = withFace ? face(cx, cy + FACE_DY[friend] * k, k * 1.05, { stroke, blush: fill !== 'none' }) : '';
  return `<g${op}>${body}${f}</g>`;
}

function patternDefs(pattern, id) {
  if (pattern === 'ruled') {
    return `<pattern id="${id.pat}" patternUnits="userSpaceOnUse" width="22" height="22" data-pattern="ruled"><path d="M0 21.5H22" stroke="${INK}" stroke-opacity=".13" stroke-width="1"/></pattern>`;
  }
  if (pattern === 'grid') {
    return `<pattern id="${id.pat}" patternUnits="userSpaceOnUse" width="14" height="14" data-pattern="grid"><path d="M14 0H0V14" fill="none" stroke="${INK}" stroke-opacity=".13" stroke-width="1"/></pattern>`;
  }
  return '';
}
/** 같은 문서에 SVG 여러 장이 인라인될 때(내보내기) id 가 겹치지 않도록 조합별 id */
const ids = (type, friend, pattern) => ({ clip: `s-${type}-${friend}`, pat: `p-${pattern}` });
const patternRect = (pattern, x, y, w, h, id) =>
  pattern === 'plain' ? '' : `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#${id.pat})" clip-path="url(#${id.clip})"/>`;

/* ── 유형별 ── */

function drawTab(friend, pattern, c, id) {
  const shape = 'M0 0H150V28H180V170Q160 182 130 178L0 180Z';
  return [
    `<clipPath id="${id.clip}"><path d="${shape}"/></clipPath>`,
    `<path d="${shape}" fill="${c.tint}"/>`,
    patternRect(pattern, 0, 0, 180, 180, id),
    friendFigure(friend, 163, 16, 15, { fill: c.cover }),
  ].join('');
}

/** 얼굴 메모지: 몸통 배율(180 폭 안에 들어가게)과 몸통 위 가장자리(y, 반지름 34 기준), 눈높이 추가 내림 */
const FACE_BODY = {
  circle:   { k: 2.4, top: -34, drop: 0 },
  square:   { k: 2.5, top: -32, drop: 0 },
  triangle: { k: 2.3, top: -36, drop: 30 },
  star:     { k: 2.4, top: -38, drop: 14 },
  cloud:    { k: 2.2, top: -21, drop: 0 },
  heart:    { k: 2.4, top: -35, drop: 0 },
};

function drawFace(friend, pattern, c, id) {
  const { k, top, drop } = FACE_BODY[friend];
  const eyeY = 100 + top * k + 26 + drop;
  const body = `<path d="${BODY[friend]}" transform="translate(90 100) scale(${k})"/>`;
  return [
    `<clipPath id="${id.clip}">${body}</clipPath>`,
    `<path d="${BODY[friend]}" transform="translate(90 100) scale(${k})" fill="${c.tint}" stroke="${c.cover}" stroke-opacity=".4" stroke-width="${n(1.2 / k)}" stroke-linejoin="round"/>`,
    patternRect(pattern, 0, eyeY + 26, 180, 200 - eyeY - 26, id),
    face(90, eyeY, 1.1),
  ].join('');
}

function drawMark(friend, pattern, c, id) {
  return [
    `<clipPath id="${id.clip}"><rect width="200" height="190"/></clipPath>`,
    `<rect width="200" height="190" fill="${PAPER}"/>`,
    friendFigure(friend, 100, 105, 66, { fill: 'none', strokeWidth: 3, opacity: '.12' }),
    patternRect(pattern, 0, 0, 200, 190, id),
    `<rect x=".6" y=".6" width="198.8" height="188.8" fill="none" stroke="${c.deep}" stroke-opacity=".5" stroke-width="1.2"/>`,
    `<path d="M0 0H44V20Q44 26 38 26H0Z" fill="${c.deep}"/>`,
  ].join('');
}

/** 물결 테두리 원 (도장) — 중심 (cx, cy), 반지름 r, 물결 m 개 */
function scallop(cx, cy, r, m) {
  const pts = Array.from({ length: m }, (_, i) => {
    const a = (i / m) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const bump = n((Math.PI * r) / m * 0.62);
  return pts.map(([x, y], i) => (i === 0 ? `M${n(x)} ${n(y)}` : `A${bump} ${bump} 0 0 1 ${n(x)} ${n(y)}`)).join('') + `A${bump} ${bump} 0 0 1 ${n(pts[0][0])} ${n(pts[0][1])}Z`;
}

/** 다이컷 외곽 — 친구마다 다른 모양 (180×170 안) */
const CUT_OUTLINE = {
  circle:   'M90 26C120 0 180 10 180 70C180 120 150 170 90 170C30 170 0 120 0 70C0 10 60 0 90 26Z',              // 사과
  square:   'M10 6H170A4 4 0 0 1 174 10V160A4 4 0 0 1 170 164H10A4 4 0 0 1 6 160V10A4 4 0 0 1 10 6Z',           // 우표
  triangle: 'M90 8L174 148Q90 176 6 148Z',                                                                        // 조각 케이크
  star:     scallop(90, 85, 80, 14),                                                                              // 물결 테두리 도장
  cloud:    'M38 162a34 34 0 0 1 2-67a40 40 0 0 1 76-26a36 36 0 0 1 56 20a30 30 0 0 1 2 58a26 26 0 0 1-30 15Z',  // 구름
  heart:    'M0 14q0-14 14-14h152q14 0 14 14v110q0 14-14 14h-90l-30 24l6-24h-38q-14 0-14-14Z',                   // 말풍선
};

function drawCut(friend, pattern, c, id) {
  const shape = CUT_OUTLINE[friend];
  const extra = friend === 'circle'
    ? `<path d="M90 26q-4-20 8-28" fill="none" stroke="${COLOR_STYLES.sage.deep}" stroke-width="3" stroke-linecap="round"/><path d="M96 2q20-4 22 14q-18 4-22-14Z" fill="${COLOR_STYLES.sage.tint}" stroke="${COLOR_STYLES.sage.deep}" stroke-width="1.5"/>`
    : friend === 'square'
      ? `<rect x="6" y="6" width="168" height="158" rx="4" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="8 6"/>`
      : '';
  return [
    `<clipPath id="${id.clip}"><path d="${shape}"/></clipPath>`,
    `<path d="${shape}" fill="${c.tint}" stroke="${c.cover}" stroke-opacity=".4" stroke-width="1.2" stroke-linejoin="round"/>`,
    patternRect(pattern, 0, 0, 180, 170, id),
    extra,
    friendFigure(friend, 150, 138, 17, { fill: c.cover }),
  ].join('');
}

const DRAW = { tab: drawTab, face: drawFace, mark: drawMark, cut: drawCut };

/** 결정적 SVG 문자열 (width/height = viewBox) */
export function stickySvg({ type, friend, pattern }) {
  const [w, h] = VIEWBOX[type];
  const c = friendColor(friend);
  const id = ids(type, friend, pattern);
  /* width/height 는 viewBox 와 같게 — 없으면 브라우저가 300×150 으로 보고 Excalidraw 가 그 크기로 샘플링해 그림이 커지고 잘린다 */
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
       + `<defs>${patternDefs(pattern, id)}</defs>`
       + DRAW[type](friend, pattern, c, id)
       + '</svg>';
}

export function stickyDataUrl(spec) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(stickySvg(spec));
}

/** Excalidraw `addFiles` 에 넘길 파일 */
export function stickyFile(spec, now = Date.now()) {
  return { id: stickyFileId(spec), mimeType: 'image/svg+xml', dataURL: stickyDataUrl(spec), created: now };
}

export function isStickyElement(el) {
  return !!el?.customData?.sticky;
}

/** 내 메모지(교사 창에 내려온 학생 메모지 `__sn_sticky_…` 는 제외) */
export function isOwnSticky(el) {
  return isStickyElement(el) && typeof el.id === 'string' && el.id.startsWith(STICKY_ID_PREFIX);
}

/**
 * 저장 직전 정규화: 내 메모지는 항상 `locked: true` 로 저장한다.
 * 이동 모드 중(잠금 해제 상태)에 페이지를 떠나거나 앱이 닫히면 풀린 채 저장돼 다음에 지우개에 지워지는 것을 막는다.
 * 바꿀 것이 없으면 같은 배열을 그대로 돌려준다.
 */
export function relockOwnStickies(elements) {
  let changed = false;
  const out = elements.map((el) => {
    if (isOwnSticky(el) && el.locked !== true) { changed = true; return { ...el, locked: true }; }
    return el;
  });
  return changed ? out : elements;
}

/** 잠긴 image 요소 하나 — 삽입 이미지와 같은 필드 + locked·customData */
export function buildStickyElement(spec, { x, y, width, opacity = 100, id, now = Date.now(), rand = Math.random } = {}) {
  const { type, friend, pattern } = spec;
  return {
    type: 'image',
    id: id ?? STICKY_ID_PREFIX + rand().toString(36).slice(2, 9),
    fileId: stickyFileId(spec),
    status: 'saved',
    x, y,
    width,
    height: width * stickyAspect(type),
    angle: 0,
    strokeColor: 'transparent', backgroundColor: 'transparent',
    fillStyle: 'solid', strokeWidth: 0, strokeStyle: 'solid',
    roughness: 0, opacity, groupIds: [], frameId: null,
    roundness: null, isDeleted: false, locked: true, link: null,
    version: 1, versionNonce: Math.floor(rand() * 2e9),
    updated: now, seed: Math.floor(rand() * 2e9),
    boundElements: null, scale: [1, 1],
    customData: { sticky: { v: 1, type, friend, pattern } },
  };
}
