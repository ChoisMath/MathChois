import { useState } from 'react';
import { X, Save, Lock, Unlock, Eye, EyeOff, LayoutTemplate, Undo2, Eraser, ImageDown, FileDown, Files } from 'lucide-react';
import IconButton from '../common/IconButton';
import GroupAssignmentPanel from './GroupAssignmentPanel';
import TemplatePickerDialog from './TemplatePickerDialog';
import TemplateThumb from './TemplateThumb';
import { getTemplate } from '../../lib/whiteboardTemplates';
import { distributeEvenly } from '../../lib/groupAssign';

function Toggle({ checked, onChange, disabled, label, onIcon, offIcon }) {
  return (
    <button
      type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer disabled:opacity-50 ${checked ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-white border-gray-200 text-gray-700'}`}
    >
      <span className="flex items-center gap-2">{checked ? onIcon : offIcon} {label}</span>
      <span className={`h-5 w-9 rounded-full relative transition-colors ${checked ? 'bg-indigo-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

/**
 * 교사 설정 드로어 — 모둠 배정, 열람 허용, 잠금, 기본 템플릿, 초기화/복원, 내보내기
 */
export default function WhiteboardSettingsDrawer({
  view, selectedGroupId, busy,
  onClose, onSaveGroups, onToggleCross, onToggleLockAll, onToggleGroupLock,
  onTemplateChange, onReset, onRestore, onExportPng, onExportPdf,
}) {
  const toGroups = (v) => v.groups.map((g) => ({ id: g.id, name: g.name, position: g.position, studentIds: g.members.map((m) => m.studentId) }));
  const [groups, setGroups] = useState(() => toGroups(view));
  const [dirty, setDirty] = useState(false);
  const [tplPicker, setTplPicker] = useState(false);

  // view 가 새로 로드되면(저장·토글 후) 편집 중인 배정을 서버 값으로 되돌린다 — 렌더 중 파생 상태 갱신 패턴
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    setGroups(toGroups(view));
    setDirty(false);
  }

  const members = [
    ...view.groups.flatMap((g) => g.members),
    ...view.unassigned,
  ].map((m) => ({ studentId: m.studentId, name: m.name, avatarUrl: m.avatarUrl }));

  const selected = view.groups.find((g) => g.id === selectedGroupId) ?? null;
  const tpl = view.templateKey ? getTemplate(view.templateKey) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-gray-50 w-full max-w-xl h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
          <h2 className="font-bold text-gray-900">화이트보드 설정</h2>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 cursor-pointer" aria-label="닫기"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 space-y-6">
          {/* 페이지 설정 */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">페이지 설정</h3>
            <Toggle
              checked={view.settings.allowCrossGroupView} onChange={onToggleCross} disabled={busy}
              label="다른 모둠 열람 허용 (학생은 읽기 전용)" onIcon={<Eye className="h-4 w-4" />} offIcon={<EyeOff className="h-4 w-4" />}
            />
            <Toggle
              checked={view.settings.lockedAll} onChange={onToggleLockAll} disabled={busy}
              label="전체 편집 잠금 (모든 모둠)" onIcon={<Lock className="h-4 w-4" />} offIcon={<Unlock className="h-4 w-4" />}
            />
          </section>

          {/* 기본 템플릿 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">기본 템플릿</h3>
              {view.isSourceChapter ? (
                <IconButton icon={LayoutTemplate} label="템플릿 변경" onClick={() => setTplPicker(true)} disabled={busy} />
              ) : (
                <span className="text-xs text-gray-400">원본 챕터에서만 변경</span>
              )}
            </div>
            <div className="bg-white border rounded-lg p-3 flex items-center gap-3">
              {tpl ? (
                <>
                  <div className="w-28 border rounded overflow-hidden shrink-0"><TemplateThumb templateKey={tpl.key} /></div>
                  <div className="text-sm text-gray-700">{tpl.name}<p className="text-xs text-gray-400 mt-1">변경 시 비어 있는 모둠 보드에만 적용됩니다.</p></div>
                </>
              ) : (
                <p className="text-sm text-gray-500">없음 — 학생이 빈 보드를 열 때 직접 고릅니다.</p>
              )}
            </div>
          </section>

          {/* 모둠별 관리 */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">모둠별 관리</h3>
            <div className="bg-white border rounded-lg divide-y">
              {view.groups.map((g) => (
                <div key={g.id} className={`flex items-center gap-2 px-3 py-2 ${g.id === selectedGroupId ? 'bg-indigo-50/60' : ''}`}>
                  <span className="text-sm font-medium text-gray-800 flex-1 truncate">{g.name}</span>
                  <span className="text-xs text-gray-400">{g.elementCount}개 요소</span>
                  <button type="button" onClick={() => onToggleGroupLock(g, !g.locked)} disabled={busy}
                    title={g.locked ? '잠금 해제' : '편집 잠금'}
                    className={`p-1.5 rounded-md border cursor-pointer disabled:opacity-50 ${g.locked ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {g.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
            {selected && (
              <div className="bg-white border rounded-lg p-3 space-y-2">
                <p className="text-xs text-gray-500">선택한 모둠: <span className="font-medium text-gray-800">{selected.name}</span></p>
                <div className="flex flex-wrap gap-2">
                  <IconButton icon={ImageDown} label="PNG로 저장" disabled={busy} onClick={() => onExportPng(selected)} />
                  <IconButton icon={FileDown} label="PDF로 저장" disabled={busy} onClick={() => onExportPdf([selected])} />
                  <IconButton icon={Files} label="전체 모둠 PDF로 저장" disabled={busy} onClick={() => onExportPdf(view.groups)} />
                  <IconButton
                    icon={Undo2} disabled={busy || !selected.hasPrevious} onClick={() => onRestore(selected)}
                    label="직전 저장본으로 되돌리기"
                  />
                  <IconButton icon={Eraser} label="초기화" variant="danger" disabled={busy} onClick={() => onReset(selected)} />
                </div>
              </div>
            )}
          </section>

          {/* 모둠 배정 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">이 페이지의 모둠 배정</h3>
              <IconButton icon={Save} label="저장" variant="primary" disabled={!dirty} busy={busy} onClick={() => onSaveGroups(groups)} />
            </div>
            <p className="text-xs text-gray-400">학급 기본 모둠과 별개로 이 페이지에만 적용됩니다. 모둠을 삭제하면 그 보드 내용도 삭제됩니다.</p>
            <GroupAssignmentPanel
              members={members}
              groups={groups}
              onChange={(next) => { setGroups(next); setDirty(true); }}
              onAuto={(count) => {
                const auto = distributeEvenly(members.map((m) => m.studentId), count);
                // 기존 id 를 position 순으로 재사용해 보드 내용을 최대한 보존
                const sorted = [...groups].sort((a, b) => a.position - b.position);
                setGroups(auto.map((g, i) => ({ ...g, id: sorted[i]?.id, name: sorted[i]?.name ?? g.name })));
                setDirty(true);
              }}
              readOnly={busy}
              warnOnRemove="이 모둠의 보드 내용이 삭제됩니다. 계속할까요?"
            />
          </section>
        </div>
      </div>

      {tplPicker && (
        <TemplatePickerDialog
          title="기본 템플릿 변경" allowNone currentKey={view.templateKey}
          onSelect={(key) => { setTplPicker(false); onTemplateChange(key); }}
          onClose={() => setTplPicker(false)}
        />
      )}
    </div>
  );
}
