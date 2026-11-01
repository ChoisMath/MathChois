import { useCallback, useRef, useState } from 'react';
import { resolveInlineEdit } from '../lib/inlineEdit';

/**
 * 클릭해서 고치는 인라인 편집 상태 (챕터 편집 화면의 제목·설명).
 *
 * - start(): 현재 값으로 입력을 연다.
 * - commit(): 규칙(lib/inlineEdit.js)에 따라 바뀐 값만 save(value) 로 보내고 닫는다. 실패해도 닫는다(값은 그대로).
 * - cancel(): 저장 없이 닫는다.
 * - onKeyDown: Enter 저장(Shift+Enter 는 줄바꿈으로 남김), Esc 취소.
 * blur 와 Enter 가 겹쳐도 한 번만 저장한다(committingRef).
 *
 * @param {{ value: string|null|undefined, save: (value: string|null) => Promise<unknown>, allowEmpty?: boolean }} opts
 */
export function useInlineEdit({ value, save, allowEmpty = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const committingRef = useRef(false);

  const start = useCallback(() => {
    setDraft(value ?? '');
    setEditing(true);
  }, [value]);

  const cancel = useCallback(() => {
    committingRef.current = true; // 닫히면서 오는 blur 가 저장하지 않게
    setEditing(false);
    setTimeout(() => { committingRef.current = false; }, 0);
  }, []);

  const commit = useCallback(async () => {
    if (committingRef.current) return;
    committingRef.current = true;
    const { changed, value: next } = resolveInlineEdit(value, draft, { allowEmpty });
    if (changed) {
      setSaving(true);
      try { await save(next); } catch (err) { console.error('인라인 저장 실패:', err?.message ?? err); }
      setSaving(false);
    }
    setEditing(false);
    committingRef.current = false;
  }, [value, draft, allowEmpty, save]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  }, [commit, cancel]);

  return { editing, draft, setDraft, saving, start, commit, cancel, onKeyDown };
}
