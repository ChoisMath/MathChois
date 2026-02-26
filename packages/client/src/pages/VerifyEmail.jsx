import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { verifyEmail } from '../lib/api';

const VerifyEmail = () => {
  const { token } = useParams();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('인증 링크가 올바르지 않습니다.');
      return;
    }

    let cancelled = false;

    verifyEmail(token)
      .then(() => {
        if (!cancelled) {
          // 계정 생성 + refresh cookie 설정 완료 → 전체 새로고침으로 세션 복원
          window.location.href = '/';
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || '인증 링크가 만료되었거나 올바르지 않습니다.');
        }
      });

    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">가입 처리 중...</p>
    </div>
  );
};

export default VerifyEmail;
