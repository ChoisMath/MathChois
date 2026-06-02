import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { splitFigureSegments } from '../../lib/problemContent';

function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {children}
    </ReactMarkdown>
  );
}

/**
 * 문제/해설 본문 렌더: Markdown+LaTeX, [FIGURE:n] 자리에 figures[idx] 이미지 삽입
 * @param {{ latex: string, figures?: {idx:number, imageUrl:string, alt:string}[] }} props
 */
export default function ProblemView({ latex, figures = [] }) {
  const byIdx = new Map(figures.map((f) => [f.idx, f]));
  const segments = splitFigureSegments(latex || '');

  return (
    <div className="prose prose-sm max-w-none break-normal overflow-x-auto">
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <Markdown key={i}>{seg.value}</Markdown>;
        const fig = byIdx.get(seg.idx);
        return fig?.imageUrl
          ? <img key={i} src={fig.imageUrl} alt={fig.alt || `그림 ${seg.idx}`} className="my-2 max-w-full" />
          : (
            <div key={i} className="my-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-center text-sm text-gray-500">
              🖼️ <span className="font-medium text-gray-600">[그림 {seg.idx}]</span>{' '}
              {fig?.alt || '그림 설명 없음'}
            </div>
          );
      })}
    </div>
  );
}
