import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ allowedRole }) => {
  const { isAuthenticated, isLoading, profile } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-lg text-gray-500">로딩 중...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!profile?.role) {
    return <Navigate to="/choose-role" replace />;
  }

  if (allowedRole && profile.role !== allowedRole) {
    return <Navigate to={`/${profile.role}/classrooms`} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
