import { activeCues } from '@mathchois/shared';

/** 글자 크기 — 플레이어 폭(cqw)에 비례하고 너무 작거나 크지 않게 고정 범위를 둔다 */
const FONT_SIZE = {
  sm: 'clamp(12px, 2.6cqw, 22px)',
  md: 'clamp(14px, 3.4cqw, 30px)',
  lg: 'clamp(16px, 4.4cqw, 40px)',
};

/**
 * 영상 위 자막 오버레이 (VideoPlayer 전용).
 * - cues/time: 현재 시각에 걸친 문장들을 하단 중앙에 표시(겹치면 시작 순으로 여러 줄)
 * - size: 'sm' | 'md' | 'lg'
 * - raised: 컨트롤 바가 보이는 동안 그 위로 비켜 선다
 * 탭·제스처를 막지 않도록 pointer-events-none. 문장은 React 텍스트로 넣어 HTML 로 해석되지 않는다.
 */
export default function SubtitleOverlay({ cues, time, size = 'md', raised = false }) {
  if (!cues?.length) return null;
  const lines = activeCues(cues, time);
  if (!lines.length) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-1 px-[5%] transition-[bottom] duration-200"
      style={{ bottom: raised ? '4.5rem' : '0.75rem', fontSize: FONT_SIZE[size] ?? FONT_SIZE.md }}
      aria-live="off"
    >
      {lines.map((c, i) => (
        <span
          key={`${i}-${c.start}-${c.end}`} // 같은 시각에 같은 문장이 겹쳐도 키가 겹치지 않게 index 포함
          className="max-w-[90%] rounded bg-black/75 px-2 py-0.5 text-center leading-snug text-white whitespace-pre-line"
        >
          {c.text}
        </span>
      ))}
    </div>
  );
}
