import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { validateTemplate } from '@mathchois/shared';
import { api } from '../../../lib/api';
import IconButton from '../../common/IconButton';

const SHOT_HEAD = ['시간(초)', '장면', '왜 이렇게'];
const CUE_HEAD = ['시각(초)', '소리', '화면 이벤트'];

/* 틀 문법 요약 6줄 — promptEngine.ts 머리 주석의 요약 */
const SYNTAX = [
  ['{{이름=기본값}}', '고치는 칸(교사가 값을 적는다)'],
  ['{{?이름=…}} · {{-이름=…}}', '선택 칸 — ? 기본 켬, - 기본 끔. 끄면 그 줄이 빠진다'],
  ['{{@키}}', '옵션 글 — len · format · shape · render · lang · sound · files · logo · hook · hold · cues · frames'],
  ['{{#조건}}', '줄 맨 앞에서만 — sound · compose · logo · a · b · hf · remotion, !조건 = 아닐 때'],
  ['## N.', '줄이 빠지면 절 번호를 다시 매긴다'],
  ['\\{{…}}', '글자 그대로'],
];

const copyRows = (rs) => (rs ?? []).map((r) => [r[0] ?? '', r[1] ?? '', r[2] ?? '']);
const fromPrompt = (p) => ({ en: p?.en ?? '', ko: p?.ko ?? '', shots: copyRows(p?.shots), cues: copyRows(p?.cues) });

/** 400 응답 → 화면에 보일 오류 줄. 틀 오류(errors) 와 모양 오류(issues) 둘 다 받는다. */
function errorsOf(err) {
  const body = err?.body ?? {};
  if (Array.isArray(body.errors) && body.errors.length) return body.errors.map(String);
  if (Array.isArray(body.issues) && body.issues.length) {
    return body.issues.map((i) => `${(i.path ?? []).join('.') || '본문'}: ${i.message ?? '형식이 맞지 않아요'}`);
  }
  return [err?.status === 403 ? '관리자만 저장할 수 있어요' : '저장하지 못했어요 — 잠시 뒤 다시 시도하세요'];
}

/** 장면표·소리 큐 편집 — 3열 입력 표, 줄 추가·삭제(순서는 그대로) */
function RowsEditor({ title, head, rows, onChange }) {
  const setCell = (i, c, v) => onChange(rows.map((r, k) => (k === i ? r.map((x, j) => (j === c ? v : x)) : r)));
  return (
    <fieldset className="ai-oe-rows">
      <legend>{title} <span>{rows.length}줄</span></legend>
      {rows.length ? (
        <table className="ai-table ai-table--edit">
          <thead>
            <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}<th scope="col"><span className="sr-only">삭제</span></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, c) => (
                  <td key={c} className={c === 0 ? 'ai-t' : undefined}>
                    <input
                      className="ai-in"
                      value={cell}
                      aria-label={`${title} ${i + 1}행 ${head[c]}`}
                      onChange={(e) => setCell(i, c, e.target.value)}
                    />
                  </td>
                ))}
                <td className="ai-oe-del">
                  <IconButton icon={Trash2} label={`${title} ${i + 1}행 삭제`} variant="danger" size="sm" onClick={() => onChange(rows.filter((_, k) => k !== i))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <button type="button" className="ai-btn ai-oe-add" onClick={() => onChange([...rows, ['', '', '']])}>
        <Plus aria-hidden="true" />줄 추가
      </button>
    </fieldset>
  );
}

/**
 * 원본 편집(관리자) — 영문·국문 틀, 장면표·소리 큐. 저장 전 validateTemplate 로 막고, 서버 400 도 줄 번호와 함께 보인다.
 * 저장하면 reload() 로 목록을 다시 받아 미리보기가 바로 바뀐다. 되돌리기 = 지금 서버 값으로.
 */
export default function OriginalEditor({ id, source, editedAt, prompt, reload, onDirtyChange }) {
  const [draft, setDraft] = useState(() => fromPrompt(prompt));
  const [errors, setErrors] = useState([]);
  const [status, setStatus] = useState(''); // '' | 'saving' | 'saved'
  const [unmarking, setUnmarking] = useState(false);

  // 초안이 서버 값과 다른가 — 편집기가 닫기·이동·편집 끄기 앞에서 묻는 데 쓴다(저장 뒤 reload 로 prompt 가 따라오면 다시 false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(fromPrompt(prompt));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const change = (patch) => { setDraft((d) => ({ ...d, ...patch })); setStatus(''); };

  const save = async () => {
    const local = [
      ...validateTemplate(draft.en).map((e) => `영문 ${e}`),
      ...validateTemplate(draft.ko).map((e) => `국문 ${e}`),
    ];
    if (!draft.en.trim()) local.unshift('영문 틀이 비어 있어요');
    if (!draft.ko.trim()) local.unshift('국문 틀이 비어 있어요');
    if (local.length) { setErrors(local); setStatus(''); return; }
    setErrors([]);
    setStatus('saving');
    try {
      await api.put(`/api/ai/motion/${id}/prompt`, draft);
      setStatus('saved');
      reload();
    } catch (err) {
      setStatus('');
      setErrors(errorsOf(err));
    }
  };

  // 웹에서 고친 오빠두 원본 — 동기화에서 빠져 있다. 되돌리면 다음 동기화가 오빠두 원본으로 덮어쓴다.
  const webEdited = source === 'oppadu' && !!editedAt;
  const unmark = async () => {
    setErrors([]);
    setUnmarking(true);
    try {
      await api.delete(`/api/ai/motion/${id}/edited`);
      reload();
    } catch (err) {
      setErrors(errorsOf(err));
    } finally {
      setUnmarking(false);
    }
  };

  return (
    <div className="ai-oe" data-testid="original-editor" data-dirty={dirty || undefined}>
      {webEdited ? (
        <div className="ai-oe-edited-row">
          <p className="ai-oe-edited" role="note">웹에서 고친 원본 · 오빠두 동기화에서 제외됨</p>
          <button type="button" className="ai-btn" data-testid="original-unmark" disabled={unmarking} onClick={unmark}>
            다음 동기화에서 오빠두 원본 받기
          </button>
        </div>
      ) : null}
      <p className="ai-lead">원본 틀은 모든 학급이 함께 봐요. 저장하면 교사 모두의 편집기에 바로 반영돼요.</p>
      <dl className="ai-oe-syntax" aria-label="틀 문법">
        {SYNTAX.map(([k, v]) => (
          <div key={k}><dt><code>{k}</code></dt><dd>{v}</dd></div>
        ))}
      </dl>
      <label className="ai-oe-l" htmlFor="ai-oe-en">영문 틀</label>
      <textarea id="ai-oe-en" className="ai-in ai-oe-ta" spellCheck={false} value={draft.en} onChange={(e) => change({ en: e.target.value })} />
      <label className="ai-oe-l" htmlFor="ai-oe-ko">국문 틀</label>
      <textarea id="ai-oe-ko" className="ai-in ai-oe-ta" spellCheck={false} value={draft.ko} onChange={(e) => change({ ko: e.target.value })} />
      <RowsEditor title="장면표" head={SHOT_HEAD} rows={draft.shots} onChange={(shots) => change({ shots })} />
      <RowsEditor title="소리 큐" head={CUE_HEAD} rows={draft.cues} onChange={(cues) => change({ cues })} />

      {errors.length ? (
        <div className="ai-oe-errors" role="alert" data-testid="original-errors">
          <p>저장하지 못했어요</p>
          <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      ) : null}
      <div className="ai-acts ai-oe-acts">
        <button type="button" className="ai-btn" onClick={() => { setDraft(fromPrompt(prompt)); setErrors([]); setStatus(''); }}>
          되돌리기
        </button>
        <button type="button" className="ai-btn ai-btn--primary" disabled={status === 'saving'} onClick={save} data-testid="original-save">
          {status === 'saving' ? '저장 중...' : '저장'}
        </button>
        <span className="ai-oe-status" role="status">{status === 'saved' ? '저장됨' : ''}</span>
      </div>
    </div>
  );
}
