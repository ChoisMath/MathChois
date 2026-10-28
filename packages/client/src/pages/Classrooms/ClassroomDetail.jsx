import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Copy, Check, Trash2, Plus, Hash, LogOut, Loader, X,
} from 'lucide-react';

const BoardTab      = lazy(() => import('../../components/board/BoardTab'));
const AssignmentTab = lazy(() => import('../../components/assignment/AssignmentTab'));
const ClassroomDashboard = lazy(() => import('../../components/dashboard/ClassroomDashboard'));
const ClassroomVideoTab  = lazy(() => import('../../components/videos/ClassroomVideoTab'));
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { refreshSidebar } from '../../lib/sidebarRefresh';
import { getClassroomVideoUnread } from '../../lib/videos';
import { listUnits } from '../../lib/units';
import { resolveClassroomColor, colorVars } from '../../lib/classroomColor';
import ClassroomColorPicker from '../../components/classrooms/ClassroomColorPicker';
import '../../components/classrooms/classroomTabs.css';
import ChapterTab from '../../components/classrooms/ChapterTab';
import StudentsTab from '../../components/classrooms/StudentsTab';
import ClassroomTabs from '../../components/classrooms/ClassroomTabs';
import { resolveTab } from '../../lib/classroomTabs';

/* ─── 메인 컴포넌트 ─── */
const ClassroomDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';

  const [classroom, setClassroom]   = useState(null);
  const [members, setMembers]       = useState([]);
  const [loading, setLoading]       = useState(true);

  const [showCode, setShowCode]     = useState(false);
  const [copied, setCopied]         = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]     = useState('');
  const [savingName, setSavingName]   = useState(false);

  const [savingColor, setSavingColor] = useState(false);
  const [colorError, setColorError]   = useState('');
  const idRef = useRef(id); // 저장이 끝났을 때 아직 같은 학급 화면인지 확인용

  /* 활성 탭은 주소 쿼리(?tab=)에 둔다 — 영상·챕터를 열고 뒤로 가도 같은 탭으로 돌아온다. 알 수 없는 값(학생의 dashboard 포함)은 챕터 */
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = resolveTab(tabParam, isTeacher);
  const selectTab = (key) => {
    const next = new URLSearchParams(searchParams); // unit 등 다른 쿼리는 유지
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };
  /* 보고 있는 단원(?unit= 단원 id | 'none' | 없음=단원 목록). 단원을 열고 닫는 것은 기록을 남겨 뒤로 가기로 단원 목록에 돌아온다 */
  const unitParam = searchParams.get('unit');
  /* 대시보드 선택(?view= ?student=) — unit 은 챕터·영상 탭과 같은 키를 쓴다. 대시보드가 바꾸는 값은 기록을 남기지 않는다(replace) */
  const dashboardSelection = { view: searchParams.get('view'), unit: unitParam, student: searchParams.get('student') };
  const onDashboardSelectionChange = useCallback((patch, { replace = true } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace });
  }, [setSearchParams]);
  const setUnitParam = (nextUnit) => {
    const next = new URLSearchParams(searchParams);
    if (nextUnit) next.set('unit', nextUnit);
    else next.delete('unit');
    setSearchParams(next, { replace: false });
  };

  /* 단원 목록 — 챕터·영상 탭이 함께 쓴다. { cid, list }: 다른 학급의 목록이 잠깐이라도 섞이지 않게 학급 id 와 함께 둔다.
     이 학급 것을 아직 못 읽었으면 탭에 null(불러오는 중)을 넘긴다. 처음 읽기에 실패하면 [] → 기존 평면 격자,
     다시 읽기(탭 전환·visibilitychange)에 실패하면 이전 목록을 그대로 둔다 */
  const [unitsState, setUnitsState] = useState({ cid: null, list: [] });
  const units = unitsState.cid === id ? unitsState.list : null;
  const unitsSeqRef = useRef(0); // 겹친 요청은 마지막 것만 반영
  const reloadUnits = useCallback(async () => {
    const seq = ++unitsSeqRef.current;
    try {
      const list = (await listUnits(id)) || [];
      if (seq === unitsSeqRef.current) setUnitsState({ cid: id, list });
    } catch (err) {
      console.error('[ClassroomDetail] 단원 목록 로드 오류:', err);
      if (seq === unitsSeqRef.current) setUnitsState((prev) => (prev.cid === id ? prev : { cid: id, list: [] }));
    }
  }, [id]);
  const usesUnits = activeTab === 'chapters' || activeTab === 'videos';

  /* 챕터·영상 탭에 들어올 때, 다른 탭/앱에서 돌아왔을 때 다시 읽는다(다른 기기에서 단원을 바꿨을 수 있다) */
  useEffect(() => {
    if (!usesUnits) return undefined;
    const timer = setTimeout(reloadUnits, 0);
    const onVisible = () => { if (document.visibilityState === 'visible') reloadUnits(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [usesUnits, activeTab, reloadUnits]);
  const [deleting, setDeleting]     = useState(false);
  const [showDeleteClassroom, setShowDeleteClassroom] = useState(false);
  const [unsubmittedCount, setUnsubmittedCount] = useState(0);
  const [videoUnreadCount, setVideoUnreadCount] = useState(0); // 영상 탭 미읽음 댓글 배지

  /* ── 구성원만 다시 읽기(학생 사전 등록으로 바로 참여한 학생 반영) ── */
  const reloadMembers = async () => {
    try {
      const mems = await api.get(`/api/classrooms/${id}/members`);
      setMembers(mems || []);
    } catch {
      // 목록은 다음 로드에서 맞춰진다
    }
  };

  /* ── 데이터 로드 ── */
  const fetchData = async () => {
    setLoading(true);
    try {
      const [cls, mems] = await Promise.all([
        api.get(`/api/classrooms/${id}`),
        api.get(`/api/classrooms/${id}/members`),
      ]);

      setClassroom(cls);
      setMembers(mems || []);

      /* 영상 탭 미읽음 댓글 수 (교사·학생 공통, 실패해도 무시) */
      getClassroomVideoUnread(id)
        .then((u) => setVideoUnreadCount(u?.total ?? 0))
        .catch(() => {});

      /* 학생: 미제출 과제 수 (탭 배지용, 페이지 로드 시 즉시 계산) */
      if (!isTeacher && user) {
        const asns = await api.get(`/api/classrooms/${id}/assignments`);
        if (asns?.length > 0) {
          const asnIds = asns.map((a) => a.id).join(',');
          const subs = await api.get(`/api/submissions/student?assignmentIds=${asnIds}`);
          const submittedIds = new Set(
            (subs || []).filter((s) => s.assignmentId && s.status !== 'rejected').map((s) => s.assignmentId)
          );
          setUnsubmittedCount(asns.filter((a) => !submittedIds.has(a.id)).length);
        }
      }
    } catch (err) {
      console.error('[ClassroomDetail] 데이터 로드 오류:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(fetchData, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* 다른 학급으로 이동하면 표지 색 오류와 저장 중 표시를 지운다 */
  useEffect(() => {
    idRef.current = id;
    setColorError('');
    setSavingColor(false);
  }, [id]);

  /* ── 클래스 이름 인라인 편집 ── */
  const handleNameClick = () => {
    if (!isTeacher) return;
    setNameInput(classroom.name);
    setEditingName(true);
  };

  const handleNameSave = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === classroom.name) { setEditingName(false); return; }
    setSavingName(true);
    try {
      await api.patch(`/api/classrooms/${id}`, { name: trimmed });
      setClassroom((prev) => ({ ...prev, name: trimmed }));
      refreshSidebar();
    } catch (err) {
      console.error('[ClassroomDetail] 이름 수정 오류:', err);
    }
    setSavingName(false);
    setEditingName(false);
  };

  /* ── 표지 색 변경: 먼저 바꿔 보이고, 저장에 실패하면 이전 색으로 되돌린다 ── */
  const handleColorChange = async (color) => {
    if (savingColor) return;
    if (color === resolveClassroomColor(classroom)) return;
    const prevColor = classroom.color;
    const targetId = id; // 저장 중에 다른 학급으로 옮겨도 이 학급만 되돌린다
    setSavingColor(true);
    setColorError('');
    setClassroom((prev) => ({ ...prev, color }));
    try {
      await api.patch(`/api/classrooms/${targetId}`, { color });
      refreshSidebar();
    } catch (err) {
      console.error('[ClassroomDetail] 표지 색 변경 오류:', err);
      setClassroom((prev) => (prev?.id === targetId ? { ...prev, color: prevColor } : prev));
      if (idRef.current === targetId) setColorError('표지 색을 바꾸지 못했어요. 다시 시도해 주세요.');
    }
    if (idRef.current === targetId) setSavingColor(false); // 다른 학급으로 옮겼다면 이미 초기화됨
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); handleNameSave(); }
    if (e.key === 'Escape') { setEditingName(false); }
  };

  /* ── 핸들러 ── */
  const handleCopyCode = async () => {
    if (!classroom?.classCode) return;
    await navigator.clipboard.writeText(classroom.classCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = async () => {
    if (!confirm('이 클래스룸에서 나가시겠습니까?')) return;
    try {
      await api.delete(`/api/classrooms/${id}/members/${user.id}`);
      navigate('/student/classrooms', { replace: true });
    } catch (err) {
      console.error('[ClassroomDetail] 나가기 오류:', err);
    }
  };

  const handleDeleteClassroom = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/classrooms/${id}`);
      refreshSidebar();
      navigate('/teacher/classrooms', { replace: true });
    } catch (err) {
      window.alert(`삭제 실패: ${err.message}`);
      setShowDeleteClassroom(false);
    }
    setDeleting(false);
  };

  if (loading) return <p className="text-gray-500">로딩 중...</p>;
  if (!classroom) return <p className="text-gray-500">클래스룸을 찾을 수 없습니다.</p>;

  return (
    <>
      {/* 학급 표지색 변수는 바깥 div 에 두어 헤더와 모든 탭(표 띠·모둠 방)이 함께 쓴다 */}
      <div className="w-full space-y-6 classroom-tabs" style={colorVars(resolveClassroomColor(classroom))}>

        {/* ── 헤더 (학급 색 띠 + 옅은 배경) ── */}
        <div className="classroom-head">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isTeacher && editingName ? (
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={handleNameKeyDown}
                  disabled={savingName}
                  className="text-2xl font-bold text-gray-900 leading-tight border-b-2 border-blue-500 outline-none bg-transparent w-72"
                />
              ) : (
                <h2
                  onClick={isTeacher ? handleNameClick : undefined}
                  title={isTeacher ? '클릭하여 이름 수정' : undefined}
                  className={`text-2xl font-bold text-gray-900 leading-tight ${
                    isTeacher ? 'cursor-text hover:text-blue-600 transition-colors' : ''
                  }`}
                >
                  {classroom.name}
                </h2>
              )}
              {isTeacher && (
                <button
                  onClick={() => setShowCode((v) => !v)}
                  title={showCode ? '코드·표지 색 숨기기' : '클래스 코드·표지 색 보기'}
                  aria-label={showCode ? '코드·표지 색 숨기기' : '클래스 코드·표지 색 보기'}
                  aria-expanded={showCode}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    showCode ? 'bg-blue-100 text-blue-600' : 'text-[#56627c] hover:text-[#1c2b4a]'
                  }`}
                >
                  <Hash className="h-4 w-4" />
                </button>
              )}
            </div>

            {isTeacher && showCode && (
              <div className="flex items-center gap-2 mt-2">
                <span className="font-mono font-bold text-blue-600 text-xl tracking-widest">
                  {classroom.classCode}
                </span>
                <button
                  onClick={handleCopyCode} title="코드 복사"
                  className="p-1.5 text-[#56627c] hover:text-[#1c2b4a] transition-colors cursor-pointer"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
                <span className="text-xs text-[#56627c]">학생에게 공유하세요</span>
              </div>
            )}

          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isTeacher ? (
              <>
                {activeTab === 'board' && (
                  <button
                    onClick={() => navigate('/teacher/board/new')} title="새 게시글"
                    className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
                <button
                  onClick={() => setShowDeleteClassroom(true)} title="클래스룸 삭제"
                  className="p-2 text-[#56627c] hover:text-red-600 rounded-md hover:bg-white/70 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </>
            ) : (
              <button
                onClick={handleLeave} title="나가기"
                className="inline-flex items-center justify-center p-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
              >
                <LogOut className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* 교사: '#'을 누르면 코드와 함께 색 동그라미가 나타나고, 누르면 바로 바뀐다(글자 없음) */}
        {isTeacher && (showCode || colorError) && (
          <div className="mt-1">
            {showCode && (
              <ClassroomColorPicker
                size="sm"
                ariaLabel="표지 색"
                value={resolveClassroomColor(classroom)}
                onChange={handleColorChange}
                disabled={savingColor}
              />
            )}
            {colorError && (
              <p className="text-[14px] text-red-700 mt-1" role="alert">{colorError}</p>
            )}
          </div>
        )}
        </div>

        <ClassroomTabs
          active={activeTab}
          onSelect={selectTab}
          isTeacher={isTeacher}
          badges={{ assignments: !isTeacher ? unsubmittedCount : 0, videos: videoUnreadCount }}
        />

        {/* ── 챕터 탭 ── */}
        {activeTab === 'chapters' && (
          <ChapterTab
            key={id}
            classroomId={id}
            isTeacher={isTeacher}
            units={units}
            unitParam={unitParam}
            onUnitParamChange={setUnitParam}
            onUnitsChanged={reloadUnits}
          />
        )}

        {/* ── 게시판 탭 ── */}
        {activeTab === 'board' && (
          <Suspense fallback={<p className="text-gray-400 text-sm">로딩 중...</p>}>
            <BoardTab classroomId={id} isTeacher={isTeacher} />
          </Suspense>
        )}

        {/* ── 과제 탭 ── */}
        {activeTab === 'assignments' && (
          <Suspense fallback={<p className="text-gray-400 text-sm">로딩 중...</p>}>
            <AssignmentTab
              classroomId={id}
              isTeacher={isTeacher}
              onUnsubmittedCount={!isTeacher ? setUnsubmittedCount : undefined}
            />
          </Suspense>
        )}

        {/* ── 영상 탭 ── */}
        {activeTab === 'videos' && (
          <Suspense fallback={<p className="text-gray-400 text-sm">로딩 중...</p>}>
            <ClassroomVideoTab
              key={id}
              classroomId={id}
              isTeacher={isTeacher}
              units={units}
              unitParam={unitParam}
              onUnitParamChange={setUnitParam}
              onUnitsChanged={reloadUnits}
            />
          </Suspense>
        )}

        {/* ── 학생 탭 ── */}
        {activeTab === 'students' && (
          <StudentsTab classroomId={id} members={members} isTeacher={isTeacher} onMembersChanged={reloadMembers} />
        )}

        {/* ── 대시보드 탭 (교사 전용) ── */}
        {activeTab === 'dashboard' && isTeacher && (
          <Suspense fallback={<p className="text-gray-400 text-sm">로딩 중...</p>}>
            <ClassroomDashboard
              classroomId={id}
              selection={dashboardSelection}
              onSelectionChange={onDashboardSelectionChange}
            />
          </Suspense>
        )}
      </div>

      {/* ── 모달: 클래스룸 삭제 확인 ── */}
      {showDeleteClassroom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">클래스룸 삭제</h2>
            <p className="text-sm text-gray-600 mb-6 whitespace-normal break-keep">
              <span className="font-medium text-gray-900">{classroom.name}</span>을(를) 삭제하면
              모든 챕터·페이지·학생 필기·교사 필기·멤버 정보가 영구 삭제됩니다. 계속하시겠습니까?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteClassroom(false)} disabled={deleting} title="취소"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center disabled:opacity-50"><X className="h-5 w-5" /></button>
              <button onClick={handleDeleteClassroom} disabled={deleting} title={deleting ? '삭제 중...' : '삭제'}
                className="p-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                {deleting ? <Loader className="animate-spin h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ClassroomDetail;
