import { useState, useEffect, useMemo } from 'react';
import { CARD_GRID } from '../../lib/layout';
import { Plus, Users, ArrowRight, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import '@fontsource/gaegu/400.css';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { refreshSidebar } from '../../lib/sidebarRefresh';
import { assignClassroomColors, resolveClassroomColor, colorVars, pickLeastUsedColor } from '../../lib/classroomColor';
import ClassroomColorPicker from '../../components/classrooms/ClassroomColorPicker';
import IconButton from '../../components/common/IconButton';
import '../../components/classrooms/classrooms.css';

const ClassroomList = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const isTeacher = profile?.role === 'teacher';
  const prefix = isTeacher ? '/teacher' : '/student';

  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchClassrooms = async () => {
    setLoading(true);
    try {
      // GET /api/classrooms returns classrooms with memberCount already included
      const data = await api.get('/api/classrooms');
      setClassrooms(data || []);
    } catch (err) {
      console.error('[ClassroomList] 목록 조회 오류:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchClassrooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // 창을 열 때마다 이 교사가 가장 적게 쓴 색으로 시작한다
  const openCreateModal = () => {
    setNewName('');
    setNewColor(pickLeastUsedColor(classrooms));
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      await api.post('/api/classrooms', { name: newName.trim(), color: newColor ?? undefined });
      setNewName('');
      setShowCreateModal(false);
      fetchClassrooms();
      refreshSidebar();
    } catch (err) {
      console.error('[ClassroomList] 클래스룸 생성 오류:', err);
      setCreateError(err.message);
    }
    setCreating(false);
  };

  const auto = useMemo(() => assignClassroomColors(classrooms), [classrooms]);

  const getMemberCount = (classroom) => {
    return classroom.memberCount ?? 0;
  };

  if (loading) {
    return <p className="text-gray-500">로딩 중...</p>;
  }

  return (
    <div className="classrooms w-full">
      <div className="flex flex-wrap justify-between items-end gap-3 mb-6">
        <div>
          <p className="kicker">오늘도 같이 풀어 봐요</p>
          <h1 className="title">내 클래스룸</h1>
        </div>
        {isTeacher && (
          <IconButton icon={Plus} label="새 학급" variant="primary" onClick={openCreateModal} />
        )}
      </div>

      {classrooms.length === 0 ? (
        <div className="notebook-empty">
          <Users className="h-10 w-10 text-[#9aa8c4]" aria-hidden="true" />
          <span className="hand">아직 공책이 없어요</span>
          <p>
            {isTeacher
              ? '새 학급을 만들면 여기에 공책이 한 권씩 생깁니다.'
              : '왼쪽 메뉴에서 선생님께 받은 참여 코드를 입력하세요.'}
          </p>
          {isTeacher && (
            <button type="button" onClick={openCreateModal} className="new-btn mt-2 cursor-pointer">
              <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
              첫 학급 만들기
            </button>
          )}
        </div>
      ) : (
        <div className={`${CARD_GRID} !gap-5`}>
          {classrooms.map((classroom) => (
            <Link
              key={classroom.id}
              to={`${prefix}/classrooms/${classroom.id}`}
              className="notebook-link"
              style={colorVars(resolveClassroomColor(classroom, auto))}
            >
              <div className="notebook">
                <div className="notebook-label">
                  <span className="sub">수학 노트</span>
                  <span className="name">{classroom.name}</span>
                  {isTeacher && <span className="code">참여 코드 <b>{classroom.classCode}</b></span>}
                </div>
                <div className="notebook-meta">
                  <span className="notebook-count">
                    <Users className="h-4 w-4" aria-hidden="true" />
                    학생 {getMemberCount(classroom)}명
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 생성 모달 */}
      {showCreateModal && (
        <div className="classroom-modal fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <p className="hand text-[18px] leading-none text-[#2453a6]">새 공책 한 권</p>
            <h2 className="text-[18px] font-bold mt-1 mb-4">새 학급 만들기</h2>
            <label htmlFor="new-classroom-name" className="block text-[14px] text-[#56627c] mb-1">학급 이름</label>
            <input
              id="new-classroom-name"
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 2학년 3반 수학"
              className="field w-full px-4 py-2.5 rounded-lg mb-4"
            />
            <p id="new-classroom-color-label" className="text-[14px] text-[#56627c] mb-2">표지 색</p>
            <div className="mb-4">
              <ClassroomColorPicker
                value={newColor}
                onChange={setNewColor}
                disabled={creating}
                labelId="new-classroom-color-label"
              />
            </div>
            {createError && (
              <p className="text-[14px] text-red-600 mb-3" role="alert">{createError}</p>
            )}
            <div className="flex justify-end gap-2">
              <IconButton
                icon={X}
                label="취소"
                onClick={() => { setShowCreateModal(false); setCreateError(''); }}
              />
              <IconButton
                icon={Plus}
                label="만들기"
                variant="primary"
                type="submit"
                disabled={!newName.trim()}
                busy={creating}
                busyLabel="만드는 중..."
              />
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ClassroomList;
