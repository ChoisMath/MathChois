import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';

// rehype-katex가 수식 노드를 식별하는 데 쓰는 클래스. sanitize가 지우면 수식이 깨진다.
const MATH_CLASS_NAMES = ['math', 'math-inline', 'math-display'];

// 교사가 직접 작성한 본문의 HTML 태그(<center>, <br> 등)를 허용하되 XSS는 차단한다.
// 순서가 핵심: rehypeRaw로 원본 HTML을 파싱 → rehypeSanitize로 "사용자 HTML만" 정화
// → rehypeKatex. sanitize를 katex 뒤에 두면 katex가 생성한 출력까지 지워 수식이 깨진다.
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'center'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      ['className', ...MATH_CLASS_NAMES],
    ],
  },
};

const REMARK_PLUGINS = [remarkMath];
const REHYPE_PLUGINS = [rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex];

export default function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
      {children}
    </ReactMarkdown>
  );
}
