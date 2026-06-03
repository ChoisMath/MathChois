import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const ERROR_LABELS = {
  conceptual: '개념', computational: '계산', logical: '논리',
  notational: '표기', strategic: '전략', condition: '조건',
};

/** AI 코칭 결과 표시. attempt: coaching_attempts row (또는 review 반환값) */
export default function CoachingPanel({ attempt, showTeacherNotes = false }) {
  if (!attempt) return null;
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
          attempt.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {attempt.isCorrect ? '정답' : '오답'}
        </span>
        {(attempt.errorTags || []).map((t) => (
          <span key={t} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
            {ERROR_LABELS[t] || t}
          </span>
        ))}
        {(attempt.conceptTags || []).map((c) => (
          <span key={c} className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 whitespace-nowrap">
            {c}
          </span>
        ))}
      </div>
      <div className="prose prose-sm max-w-none leading-7">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {attempt.commentMarkdown || ''}
        </ReactMarkdown>
      </div>
      {attempt.coachingSvg && (
        // data: URI 로 로드된 SVG 는 스크립트가 실행되지 않아 안전(XSS 방지)
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(attempt.coachingSvg)}`}
          alt="코칭 그림"
          className="mx-auto mt-2 max-h-72 w-auto rounded border bg-white"
        />
      )}
      {showTeacherNotes && attempt.strengthNotes && (
        <p className="mt-2 text-sm text-emerald-700">강점: {attempt.strengthNotes}</p>
      )}
      {attempt.weaknessNotes && (
        <p className="mt-2 text-sm text-gray-500">보완: {attempt.weaknessNotes}</p>
      )}
    </div>
  );
}
