import { Link } from 'react-router-dom';
import { BookOpen, PenTool, Monitor, Users, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const features = [
  {
    icon: PenTool,
    title: '디지털 필기',
    description: '학습자료 위에 직접 손글씨로 필기하고 자동 저장됩니다.',
  },
  {
    icon: Monitor,
    title: '실시간 모니터링',
    description: '교사가 학생의 필기 진행 상황을 실시간으로 확인할 수 있습니다.',
  },
  {
    icon: Users,
    title: '클래스룸 관리',
    description: '클래스룸을 만들고 참여 코드로 학생을 초대하세요.',
  },
  {
    icon: FileText,
    title: '과제 및 게시판',
    description: '과제를 출제하고, 게시판으로 학급 소식을 공유하세요.',
  },
];

const Home = () => {
  const { profile, isAuthenticated, signInWithGoogle } = useAuth();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <div className="flex justify-center mb-6">
            <BookOpen className="h-20 w-20 text-blue-600" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-4 tracking-tight">ChoisClass</h1>
          <p className="text-lg text-gray-600 mb-3">
            교사와 학생을 위한 수학 학습 플랫폼
          </p>
          <p className="text-base text-gray-500 mb-10 max-w-lg mx-auto">
            학습자료를 업로드하고, 학생이 직접 손글씨로 필기하며 학습합니다.
            교사는 학생의 진행 상황을 실시간으로 확인할 수 있습니다.
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
                Google 계정으로 로그인하시면 자동으로 가입됩니다.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">주요 기능</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <Icon className="h-8 w-8 text-blue-600 mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-4 py-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
          <span>&copy; {new Date().getFullYear()} ChoisClass</span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-gray-700">개인정보처리방침</Link>
            <Link to="/terms" className="hover:text-gray-700">서비스 이용약관</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
