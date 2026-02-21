import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const Home = () => {
  const { profile, isAuthenticated, signInWithGoogle } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50 p-4">
      <div className="text-center max-w-2xl mx-auto">
        <div className="flex justify-center mb-6">
          <BookOpen className="h-20 w-20 text-blue-600" />
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-6 tracking-tight">ClassChois</h1>
        <p className="text-xl text-gray-600 mb-12">
          미래 교육의 시작. 선생님과 학생이 함께 성장하는 공간입니다.<br/>
          지금 바로 시작해보세요.
        </p>

        {isAuthenticated ? (
          <div className="flex flex-col items-center space-y-4">
            <p className="text-lg text-gray-700">
              환영합니다, <span className="font-semibold">{profile?.name || '사용자'}</span>님!
            </p>
            <div className="flex gap-4">
              {profile?.role ? (
                <Link
                  to={`/${profile.role}/classrooms`}
                  className="px-6 py-3 bg-blue-600 text-white rounded-full shadow-sm hover:bg-blue-700 transition-all text-base font-medium"
                >
                  클래스룸
                </Link>
              ) : (
                <Link
                  to="/choose-role"
                  className="px-6 py-3 bg-blue-600 text-white rounded-full shadow-sm hover:bg-blue-700 transition-all text-base font-medium"
                >
                  역할 선택
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <button
              onClick={signInWithGoogle}
              className="flex items-center gap-3 px-6 py-3 bg-white border border-gray-300 rounded-full shadow-sm hover:shadow-md hover:bg-gray-50 transition-all text-base font-medium text-gray-700 cursor-pointer"
            >
              <GoogleIcon />
              Google로 계속하기
            </button>
            <p className="text-sm text-gray-500 mt-4">
              계정이 없으신가요? Google 계정으로 로그인하시면 자동으로 가입됩니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
