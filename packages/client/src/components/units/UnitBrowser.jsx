import { useMemo, useState } from 'react';
import { FolderPlus, Library } from 'lucide-react';
import UnitGrid from './UnitGrid';
import UnitHeader from './UnitHeader';
import UnitFormModal from './UnitFormModal';
import UnitDeleteModal from './UnitDeleteModal';
import IconButton from '../common/IconButton';
import { createUnit, updateUnit, deleteUnit, reorderUnits } from '../../lib/units';
import { resolveUnitView, applyUnitOrder, firstCover } from '../../lib/unitBrowser';

const NOT_FOUND = '단원을 찾을 수 없습니다';

/**
 * 챕터 탭·영상 탭이 함께 쓰는 단원 화면 상태 기계 (규칙: lib/unitBrowser.js `resolveUnitView`).
 *
 * - 단원 0개 → `renderItems(items, { unitId: null, unit: null, flat: true })` 그대로 + 교사 툴바에 [+ 새 단원].
 *   (학생은 이 탭에 보일 단원이 하나도 없을 때도 같은 flat 화면.)
 * - 주소의 unit 이 보이는 단원/미분류가 아님 → 단원 목록(UnitGrid).
 * - 단원 안 → UnitHeader(오른쪽에 `toolbar(ctx)`) + `renderItems(그 단원 항목, ctx)`. 항목 0개면 빈 안내.
 *
 * `ctx = { unitId: string|null (null = 미분류), unit: object|null, flat: boolean, unassignedItems: object[] }`
 * — `unassignedItems` 는 이 탭의 미분류 항목(기존 항목 가져오기 창에 쓴다).
 *
 * 탭은 항목을 다 불러온 뒤에 이 컴포넌트를 그려야 한다(불러오는 중 빈 목록이면 잠깐 단원 목록이 보인다).
 *
 * @param {object} props
 * @param {string} props.classroomId 단원 만들기·순서 변경에 쓴다
 * @param {'chapters'|'videos'} props.tab
 * @param {object[]} props.units `GET /api/classrooms/:cid/units` 응답
 * @param {{ id: string, unitId?: string|null }[]} props.items 이 탭의 항목(화면 순서대로)
 * @param {boolean} props.isTeacher
 * @param {string|null} props.unitParam 주소의 unit 값
 * @param {(next: string|null) => void} props.onUnitParamChange 단원 id | 'none' | null(단원 목록)
 * @param {(item: object) => string|null} [props.coverOfItem] 단원 카드 그림
 * @param {() => void} props.onUnitsChanged 단원 목록을 다시 읽게 한다
 * @param {(items: object[], ctx: object) => import('react').ReactNode} props.renderItems
 * @param {(ctx: object) => import('react').ReactNode} [props.toolbar] 보일 것이 없으면 null 을 돌려준다
 */
export default function UnitBrowser({
  classroomId, tab, units, items, isTeacher, unitParam, onUnitParamChange,
  coverOfItem, onUnitsChanged, renderItems, toolbar,
}) {
  // 드래그한 순서 — 다음 단원 목록(units 새 배열)이 올 때까지만 쓴다
  const [pendingOrder, setPendingOrder] = useState(null); // { base: units, ids }
  const [form, setForm] = useState(null);                 // null | { unit?: object }
  const [deleteTarget, setDeleteTarget] = useState(null);

  const orderedUnits = useMemo(
    () => applyUnitOrder(units, pendingOrder?.base === units ? pendingOrder.ids : null),
    [units, pendingOrder],
  );
  const view = useMemo(
    () => resolveUnitView({ units: orderedUnits, items, isTeacher, unitParam }),
    [orderedUnits, items, isTeacher, unitParam],
  );

  /* 다른 기기에서 지운 단원을 수정·삭제하려 함 → 알리고 목록 새로고침 */
  const handleUnitGone = () => {
    window.alert(NOT_FOUND);
    setForm(null);
    setDeleteTarget(null);
    onUnitsChanged();
  };

  const handleSubmitForm = async (body) => {
    const editing = form?.unit;
    try {
      if (editing) await updateUnit(editing.id, body);
      else await createUnit(classroomId, body);
    } catch (err) {
      if (editing && err?.status === 404) { handleUnitGone(); return; }
      throw err; // 창에 오류 문구
    }
    setForm(null);
    // 단원 0개 화면(평면 격자)에서 첫 단원을 만들면 단원 목록으로 — 옛 주소의 unit=none 이 남아 미분류 화면으로 가지 않게
    if (!editing && units.length === 0 && unitParam != null) onUnitParamChange(null);
    onUnitsChanged();
  };

  const handleDelete = async () => {
    try {
      await deleteUnit(deleteTarget.id);
    } catch (err) {
      if (err?.status === 404) { handleUnitGone(); return; }
      throw err;
    }
    setDeleteTarget(null);
    onUnitsChanged();
  };

  const handleReorder = async (ids) => {
    // 서버는 그 학급 단원 전부의 순서를 받는다 — 교사에게는 전부 보이지만 혹시 빠진 단원은 뒤에 붙인다
    const rest = [...orderedUnits]
      .filter((u) => !ids.includes(u.id))
      .sort((a, b) => a.position - b.position)
      .map((u) => u.id);
    const next = [...ids, ...rest];
    setPendingOrder({ base: units, ids: next });
    try {
      await reorderUnits(classroomId, next);
    } catch {
      setPendingOrder(null);
    }
    onUnitsChanged();
  };

  const modals = (
    <>
      {form && (
        <UnitFormModal
          initial={form.unit}
          onSubmit={handleSubmitForm}
          onClose={() => setForm(null)}
        />
      )}
      {deleteTarget && (
        <UnitDeleteModal
          unit={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );

  /* ── 단원 없음: 기존 화면 그대로 ── */
  if (view.mode === 'flat') {
    const ctx = { unitId: null, unit: null, flat: true, unassignedItems: view.items };
    const tools = toolbar?.(ctx);
    const showNewUnit = isTeacher && units.length === 0;
    return (
      <>
        {(tools || showNewUnit) && (
          <div className="flex items-center justify-end gap-3 mb-3 flex-wrap">
            {showNewUnit && <IconButton icon={FolderPlus} label="새 단원" onClick={() => setForm({})} />}
            {tools}
          </div>
        )}
        {renderItems(view.items, ctx)}
        {modals}
      </>
    );
  }

  /* ── 단원 목록 ── */
  if (view.mode === 'grid') {
    return (
      <>
        <UnitGrid
          units={view.shown}
          tab={tab}
          isTeacher={isTeacher}
          countOf={(u) => view.counts.get(u.id) ?? 0}
          coverOf={(u) => firstCover(view.byUnit.get(u.id) ?? [], coverOfItem)}
          unassignedCount={view.unassigned.length}
          unassignedCover={firstCover(view.unassigned, coverOfItem)}
          onOpen={onUnitParamChange}
          onCreate={isTeacher ? () => setForm({}) : undefined}
          onEdit={isTeacher ? (u) => setForm({ unit: u }) : undefined}
          onDelete={isTeacher ? setDeleteTarget : undefined}
          onReorder={isTeacher ? handleReorder : undefined}
        />
        {modals}
      </>
    );
  }

  /* ── 단원(또는 미분류) 안 ── */
  const ctx = { unitId: view.unitId, unit: view.unit ?? null, flat: false, unassignedItems: view.unassigned };
  const title = view.unit ? view.unit.title : isTeacher ? '미분류' : '기타 자료';
  return (
    <>
      <UnitHeader title={title} description={view.unit?.description} onBack={() => onUnitParamChange(null)}>
        {toolbar?.(ctx)}
      </UnitHeader>
      {view.items.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
          <Library className="h-8 w-8" aria-hidden="true" />
          <span>{tab === 'chapters' ? '이 단원에 챕터가 없습니다' : '이 단원에 영상이 없습니다'}</span>
        </div>
      ) : (
        renderItems(view.items, ctx)
      )}
      {modals}
    </>
  );
}
