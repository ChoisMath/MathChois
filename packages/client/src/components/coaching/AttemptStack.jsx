import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import ProblemView from '../common/ProblemView';
import CoachingPanel from '../common/CoachingPanel';

/**
 * 코칭 시도 누적 표시. 최신(attempts[0])은 항상 펼침, 이전 시도는 접힌 카드(클릭 토글).
 * 각 카드: 전달 이미지 + 변환 수식 + 코칭 내용.
 * @param {{ attempts: object[], showTeacherNotes?: boolean }} props  attempts는 최신순(createdAt desc)
 */
export default function AttemptStack({ attempts, showTeacherNotes = false }) {
  const [openIds, setOpenIds] = useState(() => new Set());
  if (!attempts?.length) return null;
  const total = attempts.length;

  const toggle = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-2">
      {attempts.map((a, i) => {
        const isLatest = i === 0;
        const open = isLatest || openIds.has(a.id);
        const round = total - i; // 회차: 가장 오래된 게 1, 최신이 total
        return (
          <div key={a.id} className="rounded-xl border bg-white">
            <button
              onClick={() => !isLatest && toggle(a.id)}
              disabled={isLatest}
              aria-expanded={open}
              className={`flex w-full flex-wrap items-center gap-2 p-2 text-left ${isLatest ? 'cursor-default' : ''}`}
            >
              {!isLatest && (
                <ChevronRight size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
              )}
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 whitespace-nowrap">
                {round}회차
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
                a.isCorrect === true ? 'bg-emerald-100 text-emerald-700'
                  : a.isCorrect === false ? 'bg-rose-100 text-rose-700'
                  : 'bg-gray-100 text-gray-500'}`}>
                {a.isCorrect === true ? '정답' : a.isCorrect === false ? '오답' : '미채점'}
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">{(a.createdAt || '').slice(0, 10)}</span>
              {isLatest && (
                <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 whitespace-nowrap">최신</span>
              )}
            </button>

            {open && (
              <div className="flex flex-col gap-2 border-t p-2">
                {a.workImageUrl && (
                  <img src={a.workImageUrl} alt="전달 이미지" className="w-full rounded-lg border" />
                )}
                {a.solutionLatex && (
                  <div>
                    <p className="mb-1 text-xs text-gray-400">변환된 풀이</p>
                    <div className="rounded-lg border p-2"><ProblemView latex={a.solutionLatex} figures={[]} /></div>
                  </div>
                )}
                <CoachingPanel attempt={a} showTeacherNotes={showTeacherNotes} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
