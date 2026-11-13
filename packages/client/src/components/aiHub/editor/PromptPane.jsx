import { useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, RotateCcw } from 'lucide-react';
import { DEF, state } from '@mathchois/shared';
import { COPY_FAILED, useCopyFeedback } from '../../../hooks/useCopyFeedback';
import {
  MAIN_KEYS, isDirty, isOff, promptModel, resetStore, setChecked, setValue,
} from '../../../lib/aiHub/editorStore';
import BlankRow from './BlankRow';
import OptionRows, { StyleRow } from './OptionRows';
import PromptPreview from './PromptPreview';

/* 받침이 있으면 「이」, 없으면 「가」 */
const iga = (s) => {
  const c = s.charCodeAt(s.length - 1) - 0xac00;
  return s + (c >= 0 && c < 11172 && c % 28 ? '이' : '가');
};

/**
 * 프롬프트 탭 — 위에서 아래로: 안내문 · (v2) 방식 · 빈칸 줄 · (v2) 길이·화면·렌더링·화면 글자·옵션 / (옛 틀) 세부 설정 접이식 ·
 * 행동 줄(영문/국문 · 기본값으로 · 프롬프트 복사 · 장면표·소리 큐 포함) · 완성 프롬프트.
 * store 는 편집기 전체가 함께 쓰는 한 벌(update 가 localStorage 에도 쓴다).
 */
export default function PromptPane({ item, prompt, store, update }) {
  const { copied, failed, copy } = useCopyFeedback();
  const [note, setNote] = useState('');
  const [resetKey, setResetKey] = useState(0); // 기본값으로 — 길이 칸의 입력 중 글·안내도 지운다
  const lang = store.lang;
  const model = useMemo(() => promptModel({ prompt, store, item, lang }), [prompt, store, item, lang]);
  const { v2, twoWay, st, emptyMode, blanks } = model;

  const onOpt = (patch) => { setNote(''); update({ ...store, opt: state({ ...store.opt, ...patch }) }); };
  const onLen = (len) => update({ ...store, lenOwn: true, opt: state({ ...store.opt, len }) });

  const row = (b, k) => {
    const off = isOff(store, b);
    const u = store.fill.v[b.key];
    const value = emptyMode ? (u || '') : (u != null ? u : b.def);
    return (
      <BlankRow
        key={b.key}
        id={`ai-f-${k}`}
        blank={b}
        value={value}
        off={off}
        emptyMode={emptyMode}
        onValue={(raw) => update(setValue(store, b, raw, v2))}
        onCheck={(checked) => update(setChecked(store, b, checked))}
      />
    );
  };
  const main = [], more = [];
  blanks.forEach((b, k) => (v2 || MAIN_KEYS.includes(b.label) ? main : more).push(row(b, k)));

  const doCopy = async (key) => {
    const ok = await copy(model.copyText, key);
    if (!ok) { setNote(''); return; }
    // 내 주제에 맞게 = 비워 둔 필수 칸을 알린다(프롬프트엔 [칸 이름] 자리로 들어갔다)
    const empties = emptyMode ? blanks.filter((b) => !b.opt && !String(store.fill.v[b.key] ?? '').trim()).map((b) => b.label) : [];
    setNote(empties.length
      ? `${empties.slice(0, -1).concat(iga(empties[empties.length - 1])).join('·')} 비어 있어요 — 채우면 내 주제에 맞춘 프롬프트가 돼요.`
      : '');
  };

  const dirty = isDirty(store, blanks, DEF);
  const copiedMain = copied === 'main';

  return (
    <div className="ai-pane-prompt">
      <p className="ai-lead">빈칸을 내 채널로 바꾸면 프롬프트가 완성돼요. 바꾼 값은 다른 스타일로 넘어가도 그대로예요.</p>
      <div className="ai-fill">
        <div className={`ai-rows${emptyMode ? ' is-mine' : ''}`} data-testid="rows-main">
          {v2 && twoWay ? <StyleRow st={st} onOpt={onOpt} /> : null}
          {main}
          {v2 ? <OptionRows key={resetKey} st={st} onOpt={onOpt} onLen={onLen} /> : null}
        </div>
        {more.length ? (
          <details className="ai-more" data-testid="rows-more">
            <summary>
              <span className="ai-more-l"><ChevronDown aria-hidden="true" />세부 설정</span>
              <span className="ai-more-n">{`${model.total}가지 중 ${model.used}가지 사용`}</span>
            </summary>
            <div className="ai-rows">{more}</div>
          </details>
        ) : null}

        <div className="ai-acts">
          <div className="ai-seg ai-seg--lang" role="group" aria-label="프롬프트 언어">
            {[['en', '영문'], ['ko', '국문']].map(([l, name]) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => { if (lang !== l) { setNote(''); update({ ...store, lang: l }); } }}>
                {name}
              </button>
            ))}
          </div>
          {dirty ? (
            <button type="button" className="ai-reset" onClick={() => { setNote(''); setResetKey((k) => k + 1); update(resetStore(store)); }}>
              <RotateCcw aria-hidden="true" />기본값으로
            </button>
          ) : null}
          <button
            type="button"
            className={`ai-btn ai-btn--primary ai-copy${copiedMain ? ' is-done' : ''}`}
            data-testid="copy-main"
            onClick={() => doCopy('main')}
          >
            {copiedMain ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copiedMain ? '복사됨' : '프롬프트 복사'}
          </button>
          <button
            type="button"
            className="ai-toggle"
            aria-pressed={store.withTables}
            title="복사할 때 프롬프트 뒤에 장면표와 소리 큐를 마크다운 표로 붙입니다"
            onClick={() => update({ ...store, withTables: !store.withTables })}
          >
            <span className="ai-dot" aria-hidden="true" />장면표·소리 큐 포함
          </button>
        </div>
        <p className={`ai-note-l${failed ? ' is-warn' : ''}`} role="status" data-testid="copy-note">
          {failed ? COPY_FAILED : note ? `복사했어요. ${note}` : ''}
        </p>
      </div>

      <PromptPreview model={model} store={store} lang={lang} copied={copied === 'mini'} onCopy={() => doCopy('mini')} />
    </div>
  );
}
