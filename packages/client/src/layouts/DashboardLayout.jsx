import { useState, useEffect, useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Users, BookMarked, History, LayoutTemplate, Clapperboard, LayoutList, X, ArrowRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import BrandMark from '../components/shell/BrandMark';
import { SideTab, ClassTab } from '../components/shell/SideTab';
import IconButton from '../components/common/IconButton';
import '../components/shell/shell.css';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { subscribeSidebarRefresh } from '../lib/sidebarRefresh';
import { getVideoUnreadTotals } from '../lib/videos';
import { assignClassroomColors, resolveClassroomColor } from '../lib/classroomColor';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DESKTOP_MEDIA_QUERY, SIDEBAR_COLLAPSED_KEY } from '../lib/layout';

const EMPTY_UNREAD = { byClassroom: {}, total: 0 };

/** 사이드바 공용 미읽음 배지 (영상 댓글) */
function UnreadBadge({ count, title }) {
  if (!(count > 0)) return null;
  return (
    <span className="shell-badge" title={title ?? `새 영상 댓글 ${count}개`}>
      {count}
    </span>
  );
}

/** 학급 탭 목록 — 목록 전체로 자동 색을 배정하고, 저장된 색이 있으면 그것을 쓴다. */
function ClassTabList({ classrooms, basePath, pathname, videoUnread }) {
  const autoColors = useMemo(() => assignClassroomColors(classrooms), [classrooms]);
  return (
    <ul className="shell-side-list">
      {classrooms.map((cls) => {
        const to = `${basePath}/${cls.id}`;
        return (
          <li key={cls.id}>
            <ClassTab
              to={to}
              classroom={cls}
              color={resolveClassroomColor(cls, autoColors)}
              active={pathname.startsWith(to)}
              badge={<UnreadBadge count={videoUnread.byClassroom?.[cls.id]} />}
            />
          </li>
        );
      })}
    </ul>
  );
}

/* ── 학생 전용 사이드바 ── */
function StudentSidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [joinCode, setJoinCode]     = useState('');
  const [joining, setJoining]       = useState(false);
  const [joinError, setJoinError]   = useState('');
  const [classrooms, setClassrooms] = useState([]);
  const [videoUnread, setVideoUnread] = useState(EMPTY_UNREAD);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => subscribeSidebarRefresh(setRefreshKey), []);

  const fetchClassrooms = async () => {
    if (!user) return;
    try {
      const data = await api.get('/api/classrooms');
      setClassrooms(data || []);
    } catch {
      // ignore
    }
    // 영상 댓글 미읽음 배지 — 실패해도 무시
    getVideoUnreadTotals().then((u) => setVideoUnread(u || EMPTY_UNREAD)).catch(() => {});
  };

  useEffect(() => {
    fetchClassrooms();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, refreshKey]);

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
    <div className="shell-side-inner">
      <h2 className="shell-side-title">학생 워크스페이스</h2>

      {/* ① 클래스 참여 폼 */}
      <form onSubmit={handleJoin} className="shell-join">
        <label htmlFor="join-code" className="shell-join-label">선생님께 받은 참여 코드</label>
        <div className="shell-join-row">
          <input
            id="join-code"
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="코드 6자리"
            maxLength={6}
            autoComplete="off"
            className="shell-join-input"
          />
          <IconButton
            icon={ArrowRight}
            label="참여"
            variant="primary"
            type="submit"
            disabled={joinCode.length < 6}
            busy={joining}
            busyLabel="참여 중"
          />
        </div>
        {joinError && (
          <p className="shell-join-error" role="alert">{joinError}</p>
        )}
      </form>

      {/* ② 메뉴 + 참여 중인 클래스 목록 */}
      <SideTab to="/student/classrooms" icon={Users} active={location.pathname === '/student/classrooms'}>
        내 클래스룸
      </SideTab>
      <SideTab to="/student/coaching-history" icon={History} active={location.pathname.startsWith('/student/coaching-history')}>
        내 풀이 기록
      </SideTab>

      <h2 className="shell-side-title is-sub">학급</h2>
      {classrooms.length === 0 ? (
        <p className="shell-side-empty">참여한 클래스가 없습니다.</p>
      ) : (
        <ClassTabList
          classrooms={classrooms}
          basePath="/student/classrooms"
          pathname={location.pathname}
          videoUnread={videoUnread}
        />
      )}
    </div>
  );
}

/* ── 교사 전용 사이드바 ── */
function TeacherSidebar() {
  const { user } = useAuth();
  const location = useLocation();

  const [classrooms, setClassrooms] = useState([]);
  const [videoUnread, setVideoUnread] = useState(EMPTY_UNREAD);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => subscribeSidebarRefresh(setRefreshKey), []);

  useEffect(() => {
    if (!user) return;
    api.get('/api/classrooms')
      .then((data) => setClassrooms(data || []))
      .catch(() => {});
    // 영상 댓글 미읽음 배지 — 실패해도 무시
    getVideoUnreadTotals().then((u) => setVideoUnread(u || EMPTY_UNREAD)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, refreshKey]);

  return (
    <div className="shell-side-inner">
      <h2 className="shell-side-title">교사 워크스페이스</h2>

      <SideTab to="/teacher/board" icon={LayoutList} active={location.pathname.startsWith('/teacher/board')}>
        게시판
      </SideTab>
      <SideTab to="/teacher/problems" icon={BookMarked} active={location.pathname.startsWith('/teacher/problems')}>
        문제은행
      </SideTab>
      <SideTab to="/teacher/visualizations" icon={LayoutTemplate} active={location.pathname.startsWith('/teacher/visualizations')}>
        시각화자료
      </SideTab>
      <SideTab
        to="/teacher/videos"
        icon={Clapperboard}
        active={location.pathname.startsWith('/teacher/videos')}
        badge={<UnreadBadge count={videoUnread.total} title={`학급 영상에 새 댓글 ${videoUnread.total}개`} />}
      >
        영상자료
      </SideTab>
      <SideTab to="/teacher/classrooms" icon={Users} active={location.pathname === '/teacher/classrooms'}>
        내 클래스룸
      </SideTab>

      <h2 className="shell-side-title is-sub">학급</h2>
      {classrooms.length === 0 ? (
        <p className="shell-side-empty">생성한 클래스가 없습니다.</p>
      ) : (
        <ClassTabList
          classrooms={classrooms}
          basePath="/teacher/classrooms"
          pathname={location.pathname}
          videoUnread={videoUnread}
        />
      )}
    </div>
  );
}

function loadCollapsed() {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
}

/* ── 메인 레이아웃 ──
 * 데스크톱(≥1024px): 사이드바가 왼쪽에 고정(docked)되고 햄버거로 접었다 펼친다(접힘 상태는 localStorage 유지).
 * 태블릿/모바일(<1024px): 햄버거로 오버레이 사이드바를 연다. 본문은 남은 폭을 전부 사용(유동).
 */
const DashboardLayout = () => {
  const { profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';
  const location = useLocation();
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  const [overlayOpen, setOverlayOpen] = useState(false);          // 태블릿/모바일 오버레이
  const [collapsed, setCollapsed] = useState(loadCollapsed);      // 데스크톱 고정 사이드바 접힘

  const toggleSidebar = useCallback(() => {
    if (isDesktop) {
      setCollapsed((v) => {
        const next = !v;
        try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
        return next;
      });
    } else {
      setOverlayOpen((v) => !v);
    }
  }, [isDesktop]);

  /* 페이지 이동 시 오버레이 자동 닫기 */
  useEffect(() => {
    // eslint-disable-next-line
    setOverlayOpen(false);
  }, [location.pathname]);

  const showDocked = isDesktop && !collapsed;
  const sidebar = isTeacher ? <TeacherSidebar /> : <StudentSidebar />;

  return (
    <div className="min-h-screen bg-[#f8fafd] flex flex-col">
      <Navbar onToggleSidebar={toggleSidebar} sidebarOpen={isDesktop ? showDocked : overlayOpen} />
      <div className="flex flex-1 min-h-0">
        {/* 데스크톱 고정 사이드바 — 바깥은 본문 높이만큼 늘어나(배경이 바닥까지), 안쪽이 화면에 붙어 스크롤된다(상단 바 64px 제외 높이). 폭은 px — 루트 글자 크기(12/14/18px)에 따라 변하지 않게 */}
        {showDocked && (
          <aside className="shell-side w-[280px] shrink-0">
            <div className="sticky top-0 max-h-[calc(100dvh-64px)] overflow-y-auto">
              {sidebar}
            </div>
          </aside>
        )}

        {/* 태블릿/모바일 오버레이 사이드바 — 데스크톱 폭에서는 렌더하지 않는다(고정 사이드바가 대신 보임) */}
        {!isDesktop && overlayOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setOverlayOpen(false)}
            />
            <aside className="shell-side fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] shadow-xl overflow-y-auto">
              <div className="shell-overlay-head">
                <span className="shell-overlay-title">
                  <BrandMark className="h-6 w-6" onDark />
                  메뉴
                </span>
                <button
                  onClick={() => setOverlayOpen(false)}
                  className="shell-iconbtn"
                  aria-label="메뉴 닫기"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {sidebar}
            </aside>
          </>
        )}

        {/* 본문 — 종이색, 유동 폭. min-w-0 으로 그리드/표가 부모를 밀어내지 않게 한다. 여백: 모바일 1 · 태블릿 1.5 · 데스크톱 2rem(shell.css, 기존 p-4/p-6/p-8 과 같음).
            flex 컬럼으로 만들지 않는다: 자식 페이지의 `mx-auto max-w-*` 가 내용 폭으로 줄어들기 때문. 남는 높이는 --shell-main-fill 로 채운다. */}
        <main className="shell-main flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
