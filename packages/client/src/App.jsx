import { Component, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Home as HomeIcon } from 'lucide-react';
import MainLayout from './layouts/MainLayout';
import DashboardLayout from './layouts/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
import Home from './pages/Home';
import OAuthCallback from './pages/OAuthCallback';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
const ChooseRole      = lazy(() => import('./pages/ChooseRole'));
const ClassroomList   = lazy(() => import('./pages/Classrooms/ClassroomList'));
const ClassroomDetail = lazy(() => import('./pages/Classrooms/ClassroomDetail'));
const ChapterMonitor  = lazy(() => import('./pages/Monitor/ChapterMonitor'));

/* Excalidraw를 사용하는 페이지는 lazy loading으로 분리
   — 대시보드 진입 시 Excalidraw 번들을 로드하지 않아 초기 속도 향상 */
const ChapterEditor      = lazy(() => import('./pages/Chapters/Editor'));
const StudyPageRouter    = lazy(() => import('./pages/Study/StudyPageRouter'));
const TeacherStudyViewer = lazy(() => import('./pages/Study/TeacherStudyViewer'));
const StudentWorkViewer  = lazy(() => import('./pages/Monitor/StudentWorkViewer'));

/* Phase 5 — 게시판 & 과제 */
const TeacherBoard           = lazy(() => import('./pages/Board/TeacherBoard'));
const BoardPostEditor        = lazy(() => import('./pages/Board/BoardPostEditor'));
const AssignmentEditor       = lazy(() => import('./pages/Assignment/AssignmentEditor'));
const AssignmentMonitor      = lazy(() => import('./pages/Assignment/AssignmentMonitor'));
const AssignmentWorkViewer   = lazy(() => import('./pages/Assignment/AssignmentWorkViewer'));
const AssignmentStudyViewer  = lazy(() => import('./pages/Assignment/AssignmentStudyViewer'));

/* 문제은행 */
const ProblemsPage = lazy(() => import('./pages/Problems/ProblemsPage'));

/* 코칭 기록 */
const MyCoachingHistory     = lazy(() => import('./pages/History/MyCoachingHistory'));
const StudentCoachingHistory = lazy(() => import('./pages/Monitor/StudentCoachingHistory'));

/* 관리자 */
const AdminPanel = lazy(() => import('./pages/Admin/AdminPanel'));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <p className="text-gray-500">로딩 중...</p>
  </div>
);

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('렌더링 오류:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">오류가 발생했습니다</h1>
          <p className="text-gray-600 mb-2">페이지를 새로고침하거나 다시 시도해주세요.</p>
          <p className="text-sm text-gray-400 font-mono mt-4">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.href = '/'}
            title="홈으로 이동"
            className="mt-6 p-2 flex items-center justify-center bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
          >
            <HomeIcon className="w-5 h-5" />
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* OAuth Callback */}
          <Route path="/auth/callback" element={<OAuthCallback />} />

          {/* Public Routes (no layout) */}
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/choose-role" element={<ChooseRole />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
          </Route>

          {/* Teacher Routes */}
          <Route element={<ProtectedRoute allowedRole="teacher" />}>
            <Route element={<DashboardLayout />}>
              <Route path="/teacher/classrooms" element={<ClassroomList />} />
              <Route path="/teacher/classrooms/:id" element={<ClassroomDetail />} />
              <Route path="/teacher/chapters/:id/edit" element={<ChapterEditor />} />
              <Route
                path="/teacher/classrooms/:classroomId/chapters/:chapterId/monitor"
                element={<ChapterMonitor />}
              />
              {/* Phase 5 — 게시판 */}
              <Route path="/teacher/board" element={<TeacherBoard />} />
              <Route path="/teacher/board/new" element={<BoardPostEditor />} />
              <Route path="/teacher/board/:postId/edit" element={<BoardPostEditor />} />
              {/* Phase 5 — 과제 편집·모니터 (DashboardLayout) */}
              <Route
                path="/teacher/classrooms/:classroomId/assignments/:assignmentId/edit"
                element={<AssignmentEditor />}
              />
              <Route
                path="/teacher/classrooms/:classroomId/assignments/:assignmentId/monitor"
                element={<AssignmentMonitor />}
              />
              {/* 문제은행 */}
              <Route path="/teacher/problems" element={<ProblemsPage />} />
              {/* 학생 코칭 기록 */}
              <Route
                path="/teacher/classrooms/:classroomId/students/:studentId/coaching-history"
                element={<StudentCoachingHistory />}
              />
            </Route>
            {/* Fullscreen teacher views — no DashboardLayout */}
            <Route
              path="/teacher/classrooms/:classroomId/chapters/:chapterId/monitor/:studentId"
              element={<StudentWorkViewer />}
            />
            <Route
              path="/teacher/classrooms/:classroomId/chapters/:chapterId/study/page/:pageId"
              element={<TeacherStudyViewer />}
            />
            {/* Phase 5 — 학생 과제 필기 확인 (전체화면) */}
            <Route
              path="/teacher/classrooms/:classroomId/assignments/:assignmentId/monitor/:studentId"
              element={<AssignmentWorkViewer />}
            />
          </Route>

          {/* Admin Routes */}
          <Route element={<ProtectedRoute requireAdmin />}>
            <Route element={<DashboardLayout />}>
              <Route path="/admin" element={<AdminPanel />} />
            </Route>
          </Route>

          {/* Student Routes */}
          <Route element={<ProtectedRoute allowedRole="student" />}>
            <Route element={<DashboardLayout />}>
              <Route path="/student/classrooms" element={<ClassroomList />} />
              <Route path="/student/classrooms/:id" element={<ClassroomDetail />} />
              <Route path="/student/coaching-history" element={<MyCoachingHistory />} />
            </Route>
            {/* StudyViewer: 전체화면 레이아웃, DashboardLayout 제외 */}
            <Route path="/student/study/:chapterId/page/:pageId" element={<StudyPageRouter />} />
            {/* Phase 5 — 학생 과제 필기 (전체화면) */}
            <Route
              path="/student/assignments/:assignmentId/page/:pageId"
              element={<AssignmentStudyViewer />}
            />
          </Route>
        </Routes>
        </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
