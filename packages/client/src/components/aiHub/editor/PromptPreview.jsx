import { Check, Copy } from 'lucide-react';
import IconButton from '../../common/IconButton';
import { isOwn, valueOf } from '../../../lib/aiHub/editorStore';

/** 글 조각 → [{ text, bold, code }] — `**굵게**` 는 줄 안에서 이어지고, `코드` 는 조각 안에서만 */
function inline(piece, boldRef, out) {
  piece.split('**').forEach((p, q) => {
    if (q > 0) boldRef.bold = !boldRef.bold;
    p.split(/(`[^`]+`)/).forEach((x) => {
      if (!x) return;
      const code = x.length > 2 && x.startsWith('`') && x.endsWith('`');
      out.push({ text: code ? x.slice(1, -1) : x, bold: boldRef.bold, code });
    });
  });
}

function Line({ segs, model, store }) {
  if (!segs.length) return <div className="ai-ln ai-ln--gap" />;
  // 줄 종류는 첫 글자 조각으로 — 머리(## …)·목록(- …)·그 밖은 문단. 머리표·목록표는 화면에서만 걷는다(복사 글자엔 그대로)
  const first = segs[0].t != null ? segs[0].t : '';
  let cls = 'ai-ln', strip = 0, m;
  if ((m = first.match(/^#{1,6}\s+/))) { cls += ' ai-ln--h'; strip = m[0].length; }
  else if ((m = first.match(/^\s*[-*]\s+/))) { cls += ' ai-ln--li'; strip = m[0].length; }

  const parts = [];
  const boldRef = { bold: false };
  segs.forEach((s, j) => {
    if (s.t != null) {
      inline(j === 0 && strip ? s.t.slice(strip) : s.t, boldRef, parts);
    } else if (!model.offs[s.b]) {
      const b = model.by[s.b];
      const vv = b ? valueOf(store, b, model.emptyMode) : '';
      parts.push({ mark: true, key: b?.key ?? s.b, own: b ? isOwn(store, b) : false, empty: !vv, text: vv || `[${s.b}]`, bold: boldRef.bold });
    }
  });

  return (
    <div className={cls}>
      {parts.map((p, i) => {
        let node = p.mark
          ? <mark key={i} data-k={p.key} className={`ai-v${p.own ? ' is-own' : ''}${p.empty ? ' is-empty' : ''}`}>{p.text}</mark>
          : p.code ? <code key={i}>{p.text}</code> : p.text;
        if (p.bold) node = <b key={i}>{node}</b>;
        return typeof node === 'string' ? <span key={i}>{node}</span> : node;
      })}
    </div>
  );
}

/**
 * 완성 프롬프트 — rows() 의 줄 목록을 가볍게 그린다(머리·목록·굵게·코드만). 채운 값은 <mark>:
 * 내가 바꾼 값 = is-own(강조), 빈 값 = is-empty(「[칸 이름]」 흐리게). 글자 수와 복사 미니 단추는 복사될 글 기준.
 */
export default function PromptPreview({ model, store, lang, copied, onCopy }) {
  const count = Array.from(model.copyText).length;
  return (
    <section className="ai-out" aria-labelledby="ai-out-h">
      <div className="ai-out-h">
        <h3 id="ai-out-h">완성 프롬프트</h3>
        <span className="ai-len" data-testid="prompt-len">
          {count.toLocaleString('ko-KR')}자{store.withTables ? ' (표 포함)' : ''}
        </span>
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? '복사됨' : '프롬프트 복사'}
          size="sm"
          data-testid="copy-mini"
          onClick={onCopy}
        />
      </div>
      <div className="ai-doc" data-testid="prompt-preview" lang={lang}>
        {model.rows.map((segs, i) => <Line key={i} segs={segs} model={model} store={store} />)}
      </div>
    </section>
  );
}
