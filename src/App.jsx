import { Component } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import MainLayout from './layouts/MainLayout';
import DashboardLayout from './layouts/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import OAuthCallback from './pages/OAuthCallback';
import ChooseRole from './pages/ChooseRole';
import ClassroomList from './pages/Classrooms/ClassroomList';
import ClassroomDetail from './pages/Classrooms/ClassroomDetail';
import ChapterEditor from './pages/Chapters/Editor';
import StudyViewer from './pages/Study/StudyViewer';
import ChapterMonitor from './pages/Monitor/ChapterMonitor';
import StudentWorkViewer from './pages/Monitor/StudentWorkViewer';
import TeacherStudyViewer from './pages/Study/TeacherStudyViewer';

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
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
          >
            홈으로 이동
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
        <Routes>
          {/* OAuth Callback */}
          <Route path="/auth/callback" element={<OAuthCallback />} />

          {/* Public Routes */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/choose-role" element={<ChooseRole />} />
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
          </Route>

          {/* Student Routes */}
          <Route element={<ProtectedRoute allowedRole="student" />}>
            <Route element={<DashboardLayout />}>
              <Route path="/student/classrooms" element={<ClassroomList />} />
              <Route path="/student/classrooms/:id" element={<ClassroomDetail />} />
            </Route>
            {/* StudyViewer: 전체화면 레이아웃, DashboardLayout 제외 */}
            <Route path="/student/study/:chapterId/page/:pageId" element={<StudyViewer />} />
          </Route>
        </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
