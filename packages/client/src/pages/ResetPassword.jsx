import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { verifyResetToken } from '../lib/api';

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      navigate('/?reset_error=invalid', { replace: true });
      return;
    }

    let cancelled = false;

    verifyResetToken(token)
      .then(() => {
        if (!cancelled) {
          navigate('/?password_reset=true', { replace: true });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || '초기화 링크가 만료되었거나 올바르지 않습니다.');
        }
      });

    return () => { cancelled = true; };
  }, [token, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">비밀번호 초기화 중...</p>
    </div>
  );
};

export default ResetPassword;
