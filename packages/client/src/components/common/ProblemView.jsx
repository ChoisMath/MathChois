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
    <div className="prose prose-sm max-w-none break-normal">
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <Markdown key={i}>{seg.value}</Markdown>;
        const fig = byIdx.get(seg.idx);
        return fig?.imageUrl
          ? <img key={i} src={fig.imageUrl} alt={fig.alt || `그림 ${seg.idx}`} className="my-2 max-w-full" />
          : <span key={i} className="inline-block px-2 py-1 my-1 text-xs bg-amber-50 text-amber-700 rounded">[그림 {seg.idx} 미삽입]</span>;
      })}
    </div>
  );
}
