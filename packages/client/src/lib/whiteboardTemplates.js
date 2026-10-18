/**
 * 화이트보드 템플릿 34종 — 흰 바탕 + 검은 구분선.
 *
 * 각 템플릿의 build(ox, oy) 는 Excalidraw `convertToExcalidrawElements` 가 받는
 * skeleton 배열을 반환한다 (순수 데이터 — 이 파일은 Excalidraw 를 import 하지 않는다).
 * 실제 요소 변환은 `whiteboardTemplateBuild.js`, SVG 미리보기는 `TemplateThumb.jsx`.
 *
 * 기준 영역(발표 영역)은 3200×1800. 모든 skeleton 은 이 안에 들어간다.
 */

export const BOARD_W = 3200;
export const BOARD_H = 1800;

const INK = '#1e1e1e';
const BASE = {
  strokeColor: INK, backgroundColor: 'transparent', fillStyle: 'solid',
  strokeWidth: 3, roughness: 0, roundness: null, opacity: 100,
};

/* ─── skeleton 헬퍼 ─── */
const rect = (x, y, w, h, extra = {}) => ({ type: 'rectangle', x, y, width: w, height: h, ...BASE, ...extra });
const ellipse = (x, y, w, h, extra = {}) => ({ type: 'ellipse', x, y, width: w, height: h, ...BASE, ...extra });
const diamond = (x, y, w, h, extra = {}) => ({ type: 'diamond', x, y, width: w, height: h, ...BASE, ...extra });
const line = (x1, y1, x2, y2, { dashed = false, width = 3 } = {}) => ({
  type: 'line', x: x1, y: y1, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
  points: [[0, 0], [x2 - x1, y2 - y1]], ...BASE, strokeWidth: width, strokeStyle: dashed ? 'dashed' : 'solid',
});
const arrow = (x1, y1, x2, y2, { both = false } = {}) => ({
  type: 'arrow', x: x1, y: y1, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
  points: [[0, 0], [x2 - x1, y2 - y1]], ...BASE,
  startArrowhead: both ? 'arrow' : null, endArrowhead: 'arrow',
});
const text = (x, y, t, size = 48, extra = {}) => ({
  type: 'text', x, y, text: t, fontSize: size, fontFamily: 2, textAlign: 'left', strokeColor: INK, ...extra,
});
/** 라벨이 가운데 들어가는 상자 */
const box = (x, y, w, h, label, size = 44, extra = {}) =>
  rect(x, y, w, h, { label: { text: label, fontSize: size, fontFamily: 2, strokeColor: INK }, ...extra });
const bubble = (x, y, w, h, label, size = 40) =>
  ellipse(x, y, w, h, { label: { text: label, fontSize: size, fontFamily: 2, strokeColor: INK } });

const frame = () => rect(0, 0, BOARD_W, BOARD_H, { strokeWidth: 4 });

/** n 열. labels 가 있으면 상단 160px 머리글 행과 라벨 */
function columns(n, labels = [], { dashed = false, header = labels.some(Boolean) } = {}) {
  const out = [frame()];
  const cw = BOARD_W / n;
  for (let i = 1; i < n; i++) out.push(line(cw * i, 0, cw * i, BOARD_H, { dashed }));
  if (header) {
    out.push(line(0, 160, BOARD_W, 160));
    labels.forEach((l, i) => { if (l) out.push(text(cw * i + 40, 40, l, 56)); });
  }
  return out;
}

/** n 행. labels 가 있으면 좌측 360px 라벨 열 */
function rows(n, labels = [], { dashed = false, labelCol = labels.some(Boolean) } = {}) {
  const out = [frame()];
  const rh = BOARD_H / n;
  for (let i = 1; i < n; i++) out.push(line(0, rh * i, BOARD_W, rh * i, { dashed }));
  if (labelCol) {
    out.push(line(360, 0, 360, BOARD_H));
    labels.forEach((l, i) => { if (l) out.push(text(40, rh * i + rh / 2 - 30, l, 52)); });
  }
  return out;
}

/** 4분할 (+ 사분면 라벨) */
function quadrants(labels = [], size = 56) {
  const out = [frame(), line(BOARD_W / 2, 0, BOARD_W / 2, BOARD_H), line(0, BOARD_H / 2, BOARD_W, BOARD_H / 2)];
  const pos = [[40, 40], [BOARD_W / 2 + 40, 40], [40, BOARD_H / 2 + 40], [BOARD_W / 2 + 40, BOARD_H / 2 + 40]];
  labels.forEach((l, i) => { if (l) out.push(text(pos[i][0], pos[i][1], l, size)); });
  return out;
}

/** 쓰기 안내선 (점선) */
function writingLines(x, y, w, count, gap) {
  const out = [];
  for (let i = 1; i <= count; i++) out.push(line(x, y + gap * i, x + w, y + gap * i, { dashed: true, width: 2 }));
  return out;
}

/** c×r 격자 칸 */
function gridCells(c, r, { pad = 60, caption = 0 } = {}) {
  const out = [frame()];
  const cw = (BOARD_W - pad * (c + 1)) / c;
  const ch = (BOARD_H - pad * (r + 1)) / r;
  for (let j = 0; j < r; j++) {
    for (let i = 0; i < c; i++) {
      const x = pad + i * (cw + pad);
      const y = pad + j * (ch + pad);
      out.push(rect(x, y, cw, ch));
      if (caption) out.push(line(x, y + ch - caption, x + cw, y + ch - caption));
    }
  }
  return out;
}

/* ─── 템플릿 정의 ─── */
const W = BOARD_W, H = BOARD_H, CX = W / 2, CY = H / 2;

const ORGANIZER = [
  { key: 't-chart', name: 'T차트', build: () => columns(2, ['', ''], { header: true }) },
  { key: 'venn', name: '벤 다이어그램', build: () => [
    frame(), ellipse(500, 300, 1400, 1200), ellipse(1300, 300, 1400, 1200),
  ] },
  { key: 'brainstorm-web', name: '브레인스토밍 웹', build: () => {
    const c = box(1300, 750, 600, 300, '중심 주제', 48);
    const spots = [[300, 200], [1300, 150], [2300, 200], [300, 1300], [1300, 1400], [2300, 1300]];
    const out = [frame(), c];
    for (const [x, y] of spots) {
      out.push(rect(x, y, 600, 250));
      out.push(line(x + 300, y < CY ? y + 250 : y, CX, y < CY ? 750 : 1050));
    }
    return out;
  } },
  { key: 'cause-effect', name: '원인과 결과', build: () => {
    const out = columns(3, ['원인', '', '결과'], { header: true });
    for (let i = 0; i < 3; i++) {
      const y = 160 + (H - 160) / 3 * i + (H - 160) / 6;
      out.push(arrow(1200, y, 2000, y));
    }
    out.push(line(0, 160 + (H - 160) / 3, W, 160 + (H - 160) / 3));
    out.push(line(0, 160 + (H - 160) / 3 * 2, W, 160 + (H - 160) / 3 * 2));
    return out;
  } },
  { key: 'timeline', name: '타임라인', build: () => {
    const out = [frame(), line(200, 900, 3000, 900, { width: 4 })];
    for (let i = 0; i < 6; i++) {
      const cx = 400 + i * 480;
      out.push(ellipse(cx - 30, 870, 60, 60));
      out.push(line(cx, 930, cx, 1100, { dashed: true, width: 2 }));
      out.push(rect(cx - 200, 1100, 400, 400));
      out.push(line(cx, 700, cx, 870, { dashed: true, width: 2 }));
      out.push(rect(cx - 200, 500, 400, 200));
    }
    return out;
  } },
  { key: 'number-line', name: '수직선', build: () => {
    const out = [frame(), arrow(200, 900, 3000, 900, { both: true })];
    for (let i = 0; i <= 10; i++) {
      const x = 400 + i * 240;
      out.push(line(x, 860, x, 940));
      out.push(text(x - (i - 5 < 0 ? 40 : 16), 980, String(i - 5), 48));
    }
    return out;
  } },
  { key: 'fishbone', name: '피시본 다이어그램', build: () => {
    const out = [frame(), arrow(300, 900, 2650, 900), box(2700, 750, 400, 300, '결과', 44)];
    for (let i = 0; i < 3; i++) {
      const sx = 700 + i * 700;
      out.push(line(sx, 900, sx - 250, 350));
      out.push(rect(sx - 550, 200, 600, 150));
      out.push(line(sx, 900, sx - 250, 1450));
      out.push(rect(sx - 550, 1450, 600, 150));
    }
    return out;
  } },
  { key: 'cycle', name: '순환도', build: () => {
    const out = [frame()];
    const n = 5, R = 560, rw = 420, rh = 240;
    const pts = Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
    });
    pts.forEach(([x, y]) => out.push(ellipse(x - rw / 2, y - rh / 2, rw, rh)));
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % n];
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
      const t0 = 230 / d, t1 = 1 - 230 / d;
      out.push(arrow(x1 + dx * t0, y1 + dy * t0, x1 + dx * t1, y1 + dy * t1));
    }
    return out;
  } },
  { key: 'problem-solution', name: '문제와 해결책', build: () => {
    const out = columns(3, ['문제', '', '해결책'], { header: true });
    const rh = (H - 160) / 3;
    for (let i = 0; i < 3; i++) {
      out.push(arrow(1200, 160 + rh * i + rh / 2, 2000, 160 + rh * i + rh / 2));
      if (i > 0) out.push(line(0, 160 + rh * i, W, 160 + rh * i));
    }
    return out;
  } },
  { key: 'concept-map', name: '개념 지도', build: () => {
    const c = bubble(1300, 750, 600, 300, '개념', 48);
    const around = [[1300, 150], [2400, 750], [1300, 1350], [200, 750]];
    const out = [frame(), c];
    for (const [x, y] of around) {
      out.push(ellipse(x, y, 600, 300));
      const [ex, ey] = [x + 300, y + 150];
      const dx = ex - CX, dy = ey - CY;
      const sign = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (sign === 'h') out.push(line(dx > 0 ? 1900 : 1300, CY, dx > 0 ? 2400 : 800, CY));
      else out.push(line(CX, dy > 0 ? 1050 : 750, CX, dy > 0 ? 1350 : 450));
    }
    return out;
  } },
  { key: 'flowchart', name: '순서도', build: () => [
    frame(),
    box(200, 750, 500, 300, '시작', 44), arrow(700, 900, 1000, 900),
    diamond(1000, 650, 700, 500, { label: { text: '판단', fontSize: 44, fontFamily: 2, strokeColor: INK } }),
    arrow(1700, 900, 2000, 900), text(1750, 820, '예', 40),
    box(2000, 750, 600, 300, '결과 A', 44),
    arrow(1350, 1150, 1350, 1450), text(1400, 1250, '아니오', 40),
    box(1050, 1450, 600, 250, '결과 B', 44),
    arrow(2600, 900, 2900, 900), ellipse(2900, 800, 200, 200),
  ] },
  { key: 'storyboard', name: '스토리보드', build: () => gridCells(3, 2, { pad: 80, caption: 140 }) },
  { key: 'comic', name: '만화', build: () => {
    const out = gridCells(4, 2, { pad: 60 });
    out.push(ellipse(160, 140, 380, 220), line(300, 360, 260, 460, { width: 2 }));
    return out;
  } },
  { key: 'double-bubble', name: '이중 버블 지도', build: () => {
    const out = [frame(), bubble(500, 700, 600, 400, 'A', 56), bubble(2100, 700, 600, 400, 'B', 56)];
    const mid = [[1400, 150], [1400, 700], [1400, 1250]];
    for (const [x, y] of mid) {
      out.push(ellipse(x, y, 400, 300));
      out.push(line(1100, 900, x, y + 150));
      out.push(line(2100, 900, x + 400, y + 150));
    }
    const left = [[100, 150], [100, 1250]], right = [[2700, 150], [2700, 1250]];
    for (const [x, y] of left) { out.push(ellipse(x, y, 400, 300)); out.push(line(500, 900, x + 400, y + 150)); }
    for (const [x, y] of right) { out.push(ellipse(x, y, 400, 300)); out.push(line(2700, 900, x, y + 150)); }
    return out;
  } },
  { key: 'hierarchy', name: '계층도', build: () => {
    const out = [frame(), rect(1300, 150, 600, 250)];
    const l2 = [500, 1300, 2100];
    l2.forEach((x) => { out.push(rect(x, 700, 600, 250)); out.push(line(CX, 400, x + 300, 700)); });
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const x = l2[i] - 50 + j * 400;
        out.push(rect(x, 1300, 300, 250));
        out.push(line(l2[i] + 300, 950, x + 150, 1300));
      }
    }
    return out;
  } },
  { key: 'mood-board', name: '무드 보드', build: () => [
    frame(),
    rect(80, 80, 1400, 1640),
    rect(1560, 80, 760, 780), rect(2400, 80, 720, 780),
    rect(1560, 940, 1560, 780),
  ] },
];

const ANALYSIS = [
  { key: 'scientific-method', name: '과학적 방법', build: () => rows(6, ['질문', '가설', '실험', '관찰', '분석', '결론']) },
  { key: 'story-map', name: '스토리 지도', build: () => rows(5, ['배경', '인물', '문제', '사건', '해결']) },
  { key: 'frayer', name: '프레이어 모델', build: () => {
    const out = quadrants(['정의', '특징', '예', '비예'], 52);
    out.push(bubble(1300, 700, 600, 400, '개념', 52));
    return out;
  } },
  { key: 'character-analysis', name: '인물 분석', build: () => {
    const out = [frame(), bubble(1250, 700, 700, 400, '인물', 52)];
    const spots = [['외모', 300, 200], ['성격', 2200, 200], ['행동', 300, 1300], ['관계', 2200, 1300]];
    for (const [l, x, y] of spots) {
      out.push(box(x, y, 700, 300, l, 44));
      out.push(line(x + 350, y < CY ? y + 300 : y, CX, y < CY ? 700 : 1100));
    }
    return out;
  } },
  { key: 'plot-diagram', name: '플롯 다이어그램', build: () => [
    frame(),
    line(200, 1500, 900, 1500, { width: 4 }), line(900, 1500, 1800, 400, { width: 4 }),
    line(1800, 400, 2500, 1500, { width: 4 }), line(2500, 1500, 3000, 1500, { width: 4 }),
    text(400, 1540, '발단', 48), text(1150, 900, '전개', 48), text(1720, 300, '절정', 48),
    text(2200, 900, '하강', 48), text(2650, 1540, '결말', 48),
  ] },
  { key: 'main-idea-details', name: '중심 생각 및 세부 내용', build: () => {
    const out = [frame(), box(200, 100, 2800, 400, '중심 생각', 56)];
    for (let i = 0; i < 3; i++) {
      const x = 200 + i * 960;
      out.push(arrow(x + 440, 500, x + 440, 700));
      out.push(rect(x, 700, 880, 1000));
      out.push(text(x + 40, 720, '세부 내용', 40));
    }
    return out;
  } },
  { key: 'swot', name: 'SWOT 분석', build: () => {
    const out = quadrants(['S', 'W', 'O', 'T'], 120);
    out.push(text(160, 60, '강점 (Strengths)', 40), text(CX + 160, 60, '약점 (Weaknesses)', 40));
    out.push(text(160, CY + 60, '기회 (Opportunities)', 40), text(CX + 160, CY + 60, '위협 (Threats)', 40));
    return out;
  } },
  { key: 'peel', name: 'PEEL 문단 작성 도구', build: () => {
    const out = rows(4, ['P 주장', 'E 설명', 'E 근거', 'L 연결']);
    for (let i = 0; i < 4; i++) out.push(...writingLines(400, 450 * i + 40, 2760, 3, 100));
    return out;
  } },
  { key: 'compare-contrast', name: '비교 및 대조', build: () => {
    const out = columns(3, ['A', '공통점 / 차이점', 'B'], { header: true });
    out.push(arrow(1600, 300, 1600, 1600, { both: true }));
    return out;
  } },
  { key: 'five-w', name: '5가지 핵심 질문', build: () => columns(6, ['누가', '언제', '어디서', '무엇을', '왜', '어떻게'], { dashed: true, header: true }) },
  { key: 'claim-evidence-reasoning', name: '주장-증거-추론', build: () => {
    const out = rows(3, ['주장', '증거', '추론']);
    for (let i = 0; i < 3; i++) out.push(...writingLines(400, 600 * i + 60, 2760, 4, 120));
    return out;
  } },
  { key: 'observe-respond', name: '관찰 / 반응', build: () => {
    const out = columns(2, ['관찰', '반응'], { header: true });
    out.push(...writingLines(40, 200, 1520, 8, 180), ...writingLines(1640, 200, 1520, 8, 180));
    return out;
  } },
  { key: 'matrix-2d', name: '2차원 행렬', build: () => [
    frame(), arrow(200, CY, 3000, CY, { both: true }), arrow(CX, 1650, CX, 150, { both: true }),
    text(2900, CY - 80, '+', 72), text(220, CY - 80, '−', 72), text(CX + 30, 120, '+', 72), text(CX + 30, 1600, '−', 72),
  ] },
  { key: 'xy-graph', name: 'X-Y 그래프', build: () => {
    const out = [frame()];
    for (let x = 200; x <= 3000; x += 200) out.push(line(x, 100, x, 1700, { dashed: true, width: 1 }));
    for (let y = 100; y <= 1700; y += 200) out.push(line(200, y, 3000, y, { dashed: true, width: 1 }));
    out.push(arrow(200, 900, 3000, 900, { both: true }), arrow(1600, 1700, 1600, 100, { both: true }));
    out.push(text(2940, 920, 'x', 48), text(1620, 110, 'y', 48));
    return out;
  } },
];

const ACTIVITY = [
  { key: 'pros-cons', name: '장단점', build: () => columns(2, ['장점  :)', '단점  :('], { header: true }) },
  { key: 'agree-disagree', name: '동의 또는 반대', build: () => {
    const out = quadrants(['✓✓ 강하게 동의', '✗✗ 강하게 반대', '✓ 동의', '✗ 반대'], 44);
    out.push(box(1300, 750, 600, 300, '주제', 48, { backgroundColor: '#ffffff' }));
    return out;
  } },
  { key: 'think-pair-share', name: '생각하고, 짝과 나누고, 공유하기', build: () => columns(3, ['T  생각하기', 'P  짝과 나누기', 'S  공유하기'], { header: true }) },
  { key: 'which-side', name: '어느 쪽을 선택하시겠어요?', build: () => [
    frame(), line(CX, 320, CX, H, { dashed: true }),
    box(800, 80, 1600, 200, '어느 쪽을 선택하시겠어요?', 52),
    text(40, 360, 'A', 72), text(CX + 40, 360, 'B', 72),
  ] },
];

export const TEMPLATE_CATEGORIES = [
  { key: 'organizer', name: '그래픽 오거나이저' },
  { key: 'analysis', name: '분석' },
  { key: 'activity', name: '활동' },
];

export const TEMPLATES = [
  ...ORGANIZER.map((t) => ({ ...t, category: 'organizer' })),
  ...ANALYSIS.map((t) => ({ ...t, category: 'analysis' })),
  ...ACTIVITY.map((t) => ({ ...t, category: 'activity' })),
];

export function getTemplate(key) {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

/** skeleton 좌표를 (ox, oy) 만큼 이동 */
export function offsetSkeletons(skeletons, ox, oy) {
  if (!ox && !oy) return skeletons;
  return skeletons.map((s) => ({ ...s, x: s.x + ox, y: s.y + oy }));
}

/** 템플릿의 skeleton 배열 (원점 (ox, oy)) */
export function buildTemplateSkeletons(key, ox = 0, oy = 0) {
  const t = getTemplate(key);
  if (!t) return [];
  return offsetSkeletons(t.build(), ox, oy);
}
