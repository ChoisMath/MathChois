import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const { profile, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    if (!profile?.role) {
      navigate('/choose-role', { replace: true });
    } else {
      navigate(`/${profile.role}/classrooms`, { replace: true });
    }
  }, [isLoading, isAuthenticated, profile, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-lg text-gray-600">로그인 처리 중...</p>
    </div>
  );
};

export default OAuthCallback;
