import { useEffect, useId, useRef, useState } from 'react';
import { FolderInput, FolderOutput, X } from 'lucide-react';
import IconButton from '../common/IconButton';
import { api } from '../../lib/api';
import { listUnits, copyUnits, COPY_LIST_MAX } from '../../lib/units';

/**
 * 단원 불러오기·내보내기 — 단원(챕터·영상 배정·필기 챕터 연결)을 통째로 다른 학급과 주고받는다(`POST /api/units/copy`).
 * - 내보내기: 이 학급 단원 체크 + 대상 학급 체크
 * - 불러오기: 학급 선택 → 그 학급 단원 체크, 대상은 이 학급
 * 같은 이름 단원·챕터, 같은 영상은 서버가 합치거나 옮긴다. 결과는 학급마다 한 줄.
 * 배경을 눌러도 닫히지 않고 X(또는 Esc, 실행 중이 아닐 때)로만 닫는다.
 * 스펙: docs/superpowers/specs/2026-10-28-unit-transfer-design.md
 *
 * @param {object} props
 * @param {'import'|'export'} props.mode
 * @param {string} props.classroomId 이 학급
 * @param {object[]} props.units 이 학급 단원(내보내기 목록, `chapterCount`·`videoCount` 포함)
 * @param {(result: { results: object[] }) => void} props.onDone 복사가 끝나면(하나라도 성공) 부른다
 * @param {() => void} props.onClose
 */
export default function UnitTransferModal({ mode, classroomId, units, onDone, onClose }) {
  const isExport = mode === 'export';
  const uid = useId();
  const [classrooms, setClassrooms] = useState(null);     // 다른 학급 { id, name } (null = 읽는 중)
  const [sourceCid, setSourceCid] = useState('');          // 불러오기: 고른 학급
  const [sourceUnits, setSourceUnits] = useState(null);    // 불러오기: 그 학급 단원(null = 아직 안 고름/읽는 중)
  const latestSourceCid = useRef('');                       // 학급을 빨리 바꿀 때 늦게 온 이전 응답을 버린다
  const [unitIds, setUnitIds] = useState(() => new Set());
  const [targetIds, setTargetIds] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    api.get(`/api/classrooms/other/${classroomId}`)
      .then((list) => setClassrooms(list || []))
      .catch(() => { setClassrooms([]); setError('다른 학급 목록을 불러오지 못했습니다.'); });
  }, [classroomId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const handleSourceChange = async (cid) => {
    setSourceCid(cid);
    latestSourceCid.current = cid;
    setUnitIds(new Set());
    setSourceUnits(null);
    setError('');
    if (!cid) return;
    try {
      const list = await listUnits(cid);
      if (latestSourceCid.current === cid) setSourceUnits(list);
    } catch (err) {
      if (latestSourceCid.current === cid) setError(err?.message || '단원 목록을 불러오지 못했습니다.');
    }
  };

  const unitList = isExport ? units : (sourceUnits ?? []);
  const chosenUnits = unitList.filter((u) => unitIds.has(u.id)).map((u) => u.id);
  const chosenTargets = isExport ? (classrooms ?? []).filter((c) => targetIds.has(c.id)).map((c) => c.id) : [classroomId];
  const tooMany = chosenUnits.length > COPY_LIST_MAX || chosenTargets.length > COPY_LIST_MAX;
  const canRun = !busy && !tooMany && chosenUnits.length > 0 && chosenTargets.length > 0;

  const handleRun = async () => {
    if (!canRun) return;
    setBusy(true);
    setError('');
    try {
      const result = await copyUnits(chosenUnits, chosenTargets);
      setResults(result.results);
      if (result.results.some((r) => r.ok)) onDone(result);
    } catch (err) {
      setError(err?.message || '복사하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const classroomName = (cid) => (cid === classroomId ? '이 학급' : classrooms?.find((c) => c.id === cid)?.name ?? '학급');
  const Icon = isExport ? FolderOutput : FolderInput;
  const actionLabel = isExport ? '내보내기' : '불러오기';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        className="bg-white rounded-xl shadow-xl p-5 w-full max-w-md max-h-[90dvh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 id={`${uid}-heading`} className="text-lg font-bold text-gray-900 pt-2">단원 {actionLabel}</h2>
          <IconButton icon={X} label="닫기" onClick={onClose} disabled={busy} className="-mr-2" />
        </div>

        {results ? (
          <ul className="flex flex-col gap-2 text-sm text-gray-700 break-keep [overflow-wrap:anywhere]">
            {results.map((r) => (
              <li key={r.classroomId} className={r.ok ? '' : 'text-red-500'}>
                {r.ok ? resultLine(classroomName(r.classroomId), r) : `${classroomName(r.classroomId)}: ${r.error}`}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
            {!isExport && (
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
                불러올 학급
                <select
                  value={sourceCid}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  disabled={busy || classrooms == null}
                  className="min-h-11 px-3 border border-gray-300 rounded-md text-sm text-gray-800"
                >
                  <option value="">{classrooms == null ? '불러오는 중…' : '학급을 선택하세요'}</option>
                  {(classrooms ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}

            {(isExport || sourceUnits) && (
              <CheckList
                title={isExport ? '내보낼 단원' : '불러올 단원'}
                allLabel="단원 전체 선택"
                empty="단원이 없습니다"
                items={unitList}
                selected={unitIds}
                onChange={setUnitIds}
                disabled={busy}
                renderLabel={(u) => (
                  <>
                    <span>{u.title}</span>
                    <span className="ml-2 text-xs text-gray-400">챕터 {u.chapterCount ?? 0} · 영상 {u.videoCount ?? 0}</span>
                  </>
                )}
              />
            )}

            {isExport && (
              <CheckList
                title="보낼 학급"
                allLabel="학급 전체 선택"
                empty="내보낼 수 있는 다른 학급이 없습니다"
                items={classrooms}
                selected={targetIds}
                onChange={setTargetIds}
                disabled={busy}
                renderLabel={(c) => c.name}
              />
            )}
          </div>
        )}

        {tooMany && !results && (
          <p className="text-sm text-amber-700 mt-3" role="alert">단원·학급은 한 번에 {COPY_LIST_MAX}개까지 고를 수 있습니다.</p>
        )}
        {error && <p className="text-sm text-red-600 mt-3" role="alert">{error}</p>}

        {!results && (
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={handleRun}
              disabled={!canRun}
              aria-busy={busy || undefined}
              className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-[#1c2b4a] text-white text-sm font-medium hover:bg-[#142039] disabled:opacity-50 disabled:cursor-default cursor-pointer focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#2453a6]"
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {busy ? `${actionLabel} 중...` : actionLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** `{학급}: 단원 새로 a · 합침 b / 챕터 추가 c · 옮김 d / 영상 추가 e · 옮김 f[ · 필기 챕터 연결 못 함 g]` */
function resultLine(name, r) {
  const line = `${name}: 단원 새로 ${r.unitsCreated} · 합침 ${r.unitsMerged} / 챕터 추가 ${r.chaptersCreated} · 옮김 ${r.chaptersMoved}`
    + ` / 영상 추가 ${r.videosCreated} · 옮김 ${r.videosMoved}`;
  return r.linksUnresolved > 0 ? `${line} · 필기 챕터 연결 못 함 ${r.linksUnresolved}` : line;
}

/** 전체 선택이 붙은 체크 목록. items 가 null 이면 읽는 중, disabled 면 체크 잠금(복사 중) */
function CheckList({ title, allLabel, empty, items, selected, onChange, renderLabel, disabled = false }) {
  if (items == null) {
    return (
      <section>
        <h3 className="text-xs font-medium text-gray-500 mb-1">{title}</h3>
        <p className="text-sm text-gray-400 py-4 text-center" aria-busy="true">불러오는 중…</p>
      </section>
    );
  }
  const allChecked = items.length > 0 && items.every((it) => selected.has(it.id));
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  return (
    <section>
      <h3 className="text-xs font-medium text-gray-500 mb-1">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">{empty}</p>
      ) : (
        <div className="border border-gray-200 rounded-md">
          <label className="flex items-center gap-3 min-h-11 px-3 text-sm text-gray-600 border-b border-gray-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => onChange(allChecked ? new Set() : new Set(items.map((it) => it.id)))}
              disabled={disabled}
              className="h-4 w-4 shrink-0"
            />
            {allLabel}
          </label>
          <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100">
            {items.map((item) => (
              <li key={item.id}>
                <label className="flex items-center gap-3 min-h-11 px-3 py-1.5 text-sm text-gray-800 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} disabled={disabled} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 break-keep [overflow-wrap:anywhere]">{renderLabel(item)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
