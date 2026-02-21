import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Users, LogIn, LayoutList } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/* ── 학생 전용 사이드바 ── */
function StudentSidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [joinCode, setJoinCode]     = useState('');
  const [joining, setJoining]       = useState(false);
  const [joinError, setJoinError]   = useState('');
  const [classrooms, setClassrooms] = useState([]);

  const fetchClassrooms = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('classroom_members')
      .select('classroom:classrooms(id, name)')
      .eq('student_id', user.id);
    if (!error) setClassrooms(data?.map((d) => d.classroom) || []);
  };

  useEffect(() => {
    fetchClassrooms();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError('');
    const { error } = await supabase.rpc('join_classroom_by_code', {
      code: joinCode.trim().toUpperCase(),
    });
    setJoining(false);
    if (error) {
      setJoinError(
        error.message === 'Classroom not found'
          ? '클래스룸을 찾을 수 없습니다.'
          : error.message
      );
    } else {
      setJoinCode('');
      await fetchClassrooms();
      // re-fetch list page if currently on it
      navigate('/student/classrooms', { replace: true });
    }
  };

  return (
    <div className="p-4 flex flex-col gap-5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        학생 워크스페이스
      </h2>

      {/* ① 클래스 참여 폼 */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">클래스 참여</p>
        <form onSubmit={handleJoin} className="flex flex-col gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="클래스 코드 6자리"
            maxLength={6}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 font-mono tracking-widest"
          />
          <button
            type="submit"
            disabled={joining || joinCode.length < 6}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 cursor-pointer"
          >
            <LogIn className="h-3.5 w-3.5" />
            {joining ? '참여 중...' : '참여하기'}
          </button>
          {joinError && (
            <p className="text-xs text-red-600">{joinError}</p>
          )}
        </form>
      </div>

      <div className="w-full h-px bg-gray-100" />

      {/* ② 참여 중인 클래스 목록 */}
      <div>
        <Link
          to="/student/classrooms"
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors mb-2 ${
            location.pathname === '/student/classrooms'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Users className={`mr-2 h-4 w-4 ${location.pathname === '/student/classrooms' ? 'text-blue-500' : 'text-gray-400'}`} />
          내 클래스룸
        </Link>

        {classrooms.length === 0 ? (
          <p className="text-xs text-gray-400 px-3">참여한 클래스가 없습니다.</p>
        ) : (
          <ul className="space-y-0.5">
            {classrooms.map((cls) => {
              const to = `/student/classrooms/${cls.id}`;
              const isActive = location.pathname.startsWith(to);
              return (
                <li key={cls.id}>
                  <Link
                    to={to}
                    className={`block px-3 py-2 text-sm rounded-md transition-colors truncate ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {cls.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── 교사 전용 사이드바 ── */
function TeacherSidebar() {
  const { user } = useAuth();
  const location = useLocation();

  const [classrooms, setClassrooms] = useState([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('classrooms')
      .select('id, name')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setClassrooms(data || []));
  }, [user?.id, location.pathname]); // pathname 변경 시 재조회 (이름 수정 후 갱신)

  return (
    <div className="p-4 flex flex-col gap-5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        교사 워크스페이스
      </h2>

      <div>
        {/* 게시판 */}
        <Link
          to="/teacher/board"
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors mb-1 ${
            location.pathname.startsWith('/teacher/board')
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <LayoutList className={`mr-2 h-4 w-4 ${location.pathname.startsWith('/teacher/board') ? 'text-blue-500' : 'text-gray-400'}`} />
          게시판
        </Link>

        <Link
          to="/teacher/classrooms"
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors mb-2 ${
            location.pathname === '/teacher/classrooms'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Users className={`mr-2 h-4 w-4 ${location.pathname === '/teacher/classrooms' ? 'text-blue-500' : 'text-gray-400'}`} />
          내 클래스룸
        </Link>

        {classrooms.length === 0 ? (
          <p className="text-xs text-gray-400 px-3">생성한 클래스가 없습니다.</p>
        ) : (
          <ul className="space-y-0.5">
            {classrooms.map((cls) => {
              const to = `/teacher/classrooms/${cls.id}`;
              const isActive = location.pathname.startsWith(to);
              return (
                <li key={cls.id}>
                  <Link
                    to={to}
                    className={`block px-3 py-2 text-sm rounded-md transition-colors truncate ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {cls.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── 메인 레이아웃 ── */
const DashboardLayout = () => {
  const { profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* 페이지 이동 시 모바일 사이드바 자동 닫기 */
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <div className="flex flex-1">
        {/* 데스크톱 사이드바 (md 이상) */}
        <aside className="w-64 bg-white shadow-sm hidden md:block flex-shrink-0">
          {isTeacher ? <TeacherSidebar /> : <StudentSidebar />}
        </aside>

        {/* 모바일 사이드바 오버레이 (md 미만) */}
        {sidebarOpen && (
          <>
            {/* 배경 딤 */}
            <div
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            {/* 사이드바 패널 */}
            <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl md:hidden overflow-y-auto">
              <div className="flex items-center justify-between px-4 h-16 border-b border-gray-200">
                <span className="text-lg font-bold text-gray-900">메뉴</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-md cursor-pointer"
                  aria-label="메뉴 닫기"
                >
                  ✕
                </button>
              </div>
              {isTeacher ? <TeacherSidebar /> : <StudentSidebar />}
            </aside>
          </>
        )}

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
