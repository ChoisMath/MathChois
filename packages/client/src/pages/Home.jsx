import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, PenTool, Monitor, Users, FileText, Mail, Lock, User, ArrowLeft, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { requestPasswordReset } from '../lib/api';

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
  const { profile, isAuthenticated, isLoading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 'main' | 'email-login' | 'signup' | 'forgot-password'
  const [mode, setMode] = useState('main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // URL 파라미터 처리 (비밀번호 초기화 리다이렉트)
  useEffect(() => {
    if (searchParams.get('password_reset') === 'true') {
      setMode('email-login');
      setInfoMsg('비밀번호가 초기화되었습니다. 새 비밀번호로 로그인해 주세요.');
      setSearchParams({}, { replace: true });
    }
    if (searchParams.get('reset_error') === 'invalid') {
      setMode('email-login');
      setError('초기화 링크가 만료되었거나 올바르지 않습니다.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 인증 후 자동 이동
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (profile?.role) {
      navigate(`/${profile.role}/classrooms`, { replace: true });
    } else {
      navigate('/choose-role', { replace: true });
    }
  }, [isAuthenticated, isLoading, profile, navigate]);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setError('');
    setInfoMsg('');
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setSubmitting(true);
    try {
      const result = await signInWithEmail(email, password);
      if (result.passwordReset) {
        setInfoMsg('비밀번호가 새로 설정되었습니다.');
      }
    } catch (err) {
      setError(err.message || '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signUpWithEmail(email, password, name);
    } catch (err) {
      setError(err.message || '회원가입에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setSubmitting(true);
    try {
      const result = await requestPasswordReset(email);
      setInfoMsg(result.message || '초기화 이메일을 전송했습니다.');
    } catch (err) {
      setError(err.message || '이메일 전송에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 비인증 상태의 Hero 섹션 ─────────────────

  const renderAuthSection = () => {
    if (mode === 'main') {
      return (
        <div className="flex flex-col items-center space-y-4">
          <button
            onClick={signInWithGoogle}
            className="flex items-center gap-3 w-full max-w-xs justify-center px-6 py-3 bg-white border border-gray-300 rounded-full shadow-sm hover:shadow-md hover:bg-gray-50 transition-all text-base font-medium text-gray-700 cursor-pointer"
          >
            <GoogleIcon />
            Google로 계속하기
          </button>

          <div className="relative w-full max-w-xs">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">또는</span>
            </div>
          </div>

          <button
            onClick={() => { resetForm(); setMode('email-login'); }}
            className="flex items-center gap-3 w-full max-w-xs justify-center px-6 py-3 bg-white border border-gray-300 rounded-full shadow-sm hover:shadow-md hover:bg-gray-50 transition-all text-base font-medium text-gray-700 cursor-pointer"
          >
            <Mail className="h-5 w-5 text-gray-500" />
            이메일로 로그인
          </button>

          <p className="text-sm text-gray-500">
            아직 계정이 없나요?{' '}
            <button
              onClick={() => { resetForm(); setMode('signup'); }}
              className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              학생 회원가입
            </button>
          </p>
        </div>
      );
    }

    if (mode === 'email-login') {
      return (
        <div className="w-full max-w-xs mx-auto">
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {infoMsg && <p className="text-sm text-green-600">{infoMsg}</p>}
            <button type="submit" disabled={submitting}
              className="w-full py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors">
              {submitting ? '로그인 중...' : '로그인'}
            </button>
          </form>
          <div className="mt-4 flex justify-between items-center text-sm">
            <button onClick={() => { resetForm(); setMode('main'); }} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 cursor-pointer">
              <ArrowLeft className="h-4 w-4" /> 뒤로
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => { setError(''); setInfoMsg(''); setMode('forgot-password'); }} className="text-gray-500 hover:text-gray-700 cursor-pointer">
                비밀번호 분실
              </button>
              <button onClick={() => { resetForm(); setMode('signup'); }} className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
                회원가입
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (mode === 'forgot-password') {
      return (
        <div className="w-full max-w-xs mx-auto">
          <p className="text-sm text-gray-600 mb-4 text-left">
            가입할 때 사용한 이메일 주소를 입력하면 비밀번호 초기화 링크를 보내드립니다.
          </p>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {infoMsg && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700">{infoMsg}</p>
                <p className="text-xs text-green-600 mt-1">이메일의 초기화 버튼을 클릭한 후 새 비밀번호로 로그인하세요.</p>
              </div>
            )}
            <button type="submit" disabled={submitting || !!infoMsg}
              className="w-full py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors flex items-center justify-center gap-2">
              <Send className="h-4 w-4" />
              {submitting ? '전송 중...' : '초기화 이메일 전송'}
            </button>
          </form>
          <div className="mt-4 text-sm">
            <button onClick={() => { resetForm(); setMode('email-login'); }} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 cursor-pointer">
              <ArrowLeft className="h-4 w-4" /> 로그인으로 돌아가기
            </button>
          </div>
        </div>
      );
    }

    if (mode === 'signup') {
      return (
        <div className="w-full max-w-xs mx-auto">
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="이름 (성명)" required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" required
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 (4자 이상)" required minLength={4}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={submitting}
              className="w-full py-3 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer transition-colors">
              {submitting ? '가입 중...' : '학생으로 가입하기'}
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-3">가입 시 자동으로 학생 역할이 설정됩니다.</p>
          <div className="mt-4 flex justify-between items-center text-sm">
            <button onClick={() => { resetForm(); setMode('main'); }} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 cursor-pointer">
              <ArrowLeft className="h-4 w-4" /> 뒤로
            </button>
            <button onClick={() => { resetForm(); setMode('email-login'); }} className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
              로그인
            </button>
          </div>
        </div>
      );
    }
  };

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
          {mode === 'main' && (
            <p className="text-base text-gray-500 mb-10 max-w-lg mx-auto">
              학습자료를 업로드하고, 학생이 직접 손글씨로 필기하며 학습합니다.
              교사는 학생의 진행 상황을 실시간으로 확인할 수 있습니다.
            </p>
          )}
          {mode !== 'main' && <div className="mb-8" />}

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
            renderAuthSection()
          )}
        </div>
      </section>

      {/* Features — 메인 모드에서만 표시 */}
      {mode === 'main' && (
        <section className="px-4 pb-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">주요 기능</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {features.map(({ icon: Icon, title, description }) => (
                <div key={title} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="h-7 w-7 text-blue-600 shrink-0" />
                    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                  </div>
                  <p className="text-sm text-gray-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
