import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ allowedRole, requireAdmin }) => {
  const { isAuthenticated, isLoading, profile } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-lg text-gray-500">로딩 중...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // 역할은 서버가 로그인·갱신 때 정해 준다(교사 허용 목록). 혹시 비어 있으면 학생으로 본다.
  const role = profile.role ?? 'student';

  // 관리자 전용 라우트 체크
  if (requireAdmin && !profile?.isAdmin) {
    return <Navigate to={`/${role}/classrooms`} replace />;
  }

  if (allowedRole && role !== allowedRole) {
    return <Navigate to={`/${role}/classrooms`} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
