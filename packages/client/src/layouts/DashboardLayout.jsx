import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Users, LogIn, LayoutList, Loader, BookMarked, History, LayoutTemplate } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { subscribeSidebarRefresh } from '../lib/sidebarRefresh';

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
    try {
      const data = await api.get('/api/classrooms');
      setClassrooms(data || []);
    } catch {
      // ignore
    }
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
    try {
      await api.post('/api/classrooms/join', {
        code: joinCode.trim().toUpperCase(),
      });
      setJoinCode('');
      await fetchClassrooms();
      // re-fetch list page if currently on it
      navigate('/student/classrooms', { replace: true });
    } catch (err) {
      setJoinError(
        err.message === 'Classroom not found' || err.message === '해당 코드의 클래스를 찾을 수 없습니다.'
          ? '클래스룸을 찾을 수 없습니다.'
          : err.message
      );
    }
    setJoining(false);
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
            title="참여하기"
            className="flex items-center justify-center p-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 cursor-pointer"
          >
            {joining ? <Loader className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
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
        <Link
          to="/student/coaching-history"
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors mb-2 ${
            location.pathname.startsWith('/student/coaching-history')
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <History className={`mr-2 h-4 w-4 ${location.pathname.startsWith('/student/coaching-history') ? 'text-blue-500' : 'text-gray-400'}`} />
          내 풀이 기록
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
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => subscribeSidebarRefresh(setRefreshKey), []);

  useEffect(() => {
    if (!user) return;
    api.get('/api/classrooms')
      .then((data) => setClassrooms(data || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, refreshKey]);

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

        {/* 문제은행 */}
        <Link
          to="/teacher/problems"
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors mb-1 ${
            location.pathname.startsWith('/teacher/problems')
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <BookMarked className={`mr-2 h-4 w-4 ${location.pathname.startsWith('/teacher/problems') ? 'text-blue-500' : 'text-gray-400'}`} />
          문제은행
        </Link>

        {/* 시각화자료 */}
        <Link
          to="/teacher/visualizations"
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors mb-1 ${
            location.pathname.startsWith('/teacher/visualizations')
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <LayoutTemplate className={`mr-2 h-4 w-4 ${location.pathname.startsWith('/teacher/visualizations') ? 'text-blue-500' : 'text-gray-400'}`} />
          시각화자료
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
    // eslint-disable-next-line
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <div className="flex flex-1">
        {/* 모바일/데스크톱 공용 사이드바 오버레이 */}
        {sidebarOpen && (
          <>
            {/* 배경 딤 */}
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />
            {/* 사이드바 패널 */}
            <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl overflow-y-auto">
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
