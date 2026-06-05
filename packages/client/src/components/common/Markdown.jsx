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

const NBSP = String.fromCharCode(160);
const FENCE_RE = /^(```|~~~)/;
const LEADING_INDENT_RE = /^([ \t]+)/;
const TAB_RE = /\t/g;

// Markdown 은 줄 앞 공백 4칸(또는 탭)을 코드 블록으로 해석해 본문·수식이 <pre> 로 깨진다.
// 펜스 코드 블록(``` ~~~)은 그대로 두고, 그 밖의 줄 앞 들여쓰기는 nbsp 로 바꿔 코드 블록 변환만 막는다(들여쓰기 모양은 유지).
function neutralizeIndentedCode(text) {
  if (!text || (!text.includes('\t') && !text.includes('    '))) return text;
  let inFence = false;
  return text
    .split('\n')
    .map((line) => {
      if (FENCE_RE.test(line.trimStart())) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(LEADING_INDENT_RE, (m) => NBSP.repeat(m.replace(TAB_RE, '    ').length));
    })
    .join('\n');
}

export default function Markdown({ children }) {
  const source = typeof children === 'string' ? neutralizeIndentedCode(children) : children;
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
      {source}
    </ReactMarkdown>
  );
}
