import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, Send } from 'lucide-react';
import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import '@fontsource/gaegu/400.css';
import '@fontsource/gaegu/700.css';
import { useAuth } from '../contexts/AuthContext';
import { requestPasswordReset } from '../lib/api';
import { claimHomeIntro } from '../lib/homeIntro';
import BrandMark from '../components/shell/BrandMark';
import LessonScene, { SCENE_COLS } from '../components/home/LessonScene';
import '../components/home/home.css';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

// 장면이 보이는 화면(태블릿 이상)에서만, 페이지를 처음 그릴 때 한 번 결정한다 — SPA 안에서 다시 돌아와도 재생하지 않는다
let introDecision;
function shouldPlayIntro() {
  if (introDecision !== undefined) return introDecision;
  let storage = null;
  try { storage = window.localStorage; } catch { /* 저장소 차단 */ }
  const media = (q) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  introDecision = media('(min-width: 768px)')
    && claimHomeIntro(storage, { reducedMotion: media('(prefers-reduced-motion: reduce)') });
  return introDecision;
}

const fieldClass = 'field w-full pl-10 pr-4 py-3 rounded-lg text-sm';
const fieldIconClass = 'absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#7c89a3]';
const linkClass = 'text-[#56627c] hover:text-[#1c2b4a] cursor-pointer';

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
  const [playIntro] = useState(shouldPlayIntro);

  const rootRef = useRef(null);
  const sceneRef = useRef(null);

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
    navigate(`/${profile?.role ?? 'student'}/classrooms`, { replace: true });
  }, [isAuthenticated, isLoading, profile, navigate]);

  // 페이지 모눈을 장면의 칸 크기·위치에 맞춰 좌표평면이 모눈 위에 그려진 것처럼 보이게 한다
  useLayoutEffect(() => {
    const root = rootRef.current;
    const scene = sceneRef.current;
    if (!root || !scene) return undefined;
    const align = () => {
      const s = scene.getBoundingClientRect();
      if (!s.width) {
        root.style.removeProperty('--cell');
        root.style.removeProperty('--gx');
        root.style.removeProperty('--gy');
        return;
      }
      const r = root.getBoundingClientRect();
      const cell = s.width / SCENE_COLS;
      root.style.setProperty('--cell', `${cell}px`);
      root.style.setProperty('--gx', `${(s.left - r.left) % cell}px`);
      root.style.setProperty('--gy', `${(s.top - r.top) % cell}px`);
    };
    align();
    const ro = new ResizeObserver(align);
    ro.observe(root);
    ro.observe(scene);
    return () => ro.disconnect();
  }, [mode]);

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
    setInfoMsg('');
    setSubmitting(true);
    try {
      const result = await signUpWithEmail(email, password, name);
      setInfoMsg(result.message || '가입확인 이메일을 전송했습니다.');
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

  // ─── 로그인 영역 (왼쪽 아래) ─────────────────

  const renderAuthSection = () => {
    if (isAuthenticated) {
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-lg">
            환영합니다, <span className="font-bold">{profile?.name || '사용자'}</span>님!
          </p>
          <Link
            to={`/${profile?.role ?? 'student'}/classrooms`}
            className="primary-btn inline-flex items-center h-12 px-6 rounded-full font-medium"
          >
            클래스룸으로 가기
          </Link>
        </div>
      );
    }

    if (mode === 'main') {
      return (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={signInWithGoogle}
            className="google-btn inline-flex items-center gap-3 h-13 pl-5 pr-7 rounded-full text-[16px] font-medium cursor-pointer"
          >
            <GoogleIcon />
            Google 계정으로 로그인
          </button>
          <p className="text-[13px] text-[#56627c] leading-snug max-w-[34ch]">
            교사는 관리자가 등록한 계정으로만 로그인할 수 있습니다. 그 외 계정은 학생으로 시작합니다.
          </p>
          <button
            type="button"
            onClick={() => { resetForm(); setMode('email-login'); }}
            className="inline-flex items-center gap-1.5 min-h-11 px-1 text-[14px] text-[#56627c] underline underline-offset-4 decoration-[#b9c6da] hover:text-[#1c2b4a] cursor-pointer"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            이메일로 로그인
          </button>
        </div>
      );
    }

    const card = 'w-full max-w-sm bg-white/95 border border-[#dde6f2] rounded-2xl p-5 shadow-sm';

    if (mode === 'email-login') {
      return (
        <div className={card}>
          <form onSubmit={handleEmailLogin} className="space-y-3">
            <div className="relative">
              <Mail className={fieldIconClass} aria-hidden="true" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" aria-label="이메일" autoComplete="email" required
                className={fieldClass} />
            </div>
            <div className="relative">
              <Lock className={fieldIconClass} aria-hidden="true" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" aria-label="비밀번호" autoComplete="current-password" required
                className={fieldClass} />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            {infoMsg && <p className="text-sm text-green-700">{infoMsg}</p>}
            <button type="submit" disabled={submitting}
              className="primary-btn w-full py-3 text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer">
              {submitting ? '로그인 중...' : '로그인'}
            </button>
          </form>
          <div className="mt-4 flex justify-between items-center text-sm">
            <button type="button" onClick={() => { resetForm(); setMode('main'); }} className={`flex items-center gap-1 ${linkClass}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 뒤로
            </button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { setError(''); setInfoMsg(''); setMode('forgot-password'); }} className={linkClass}>
                비밀번호 분실
              </button>
              <button type="button" onClick={() => { resetForm(); setMode('signup'); }} className="text-[#2453a6] hover:text-[#1c2b4a] font-medium cursor-pointer">
                학생 회원가입
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (mode === 'forgot-password') {
      return (
        <div className={card}>
          <p className="text-sm text-[#56627c] mb-4">
            가입할 때 사용한 이메일 주소를 입력하면 비밀번호 초기화 링크를 보내드립니다.
          </p>
          <form onSubmit={handleForgotPassword} className="space-y-3">
            <div className="relative">
              <Mail className={fieldIconClass} aria-hidden="true" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" aria-label="이메일" autoComplete="email" required
                className={fieldClass} />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            {infoMsg && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700">{infoMsg}</p>
                <p className="text-xs text-green-700 mt-1">이메일의 초기화 버튼을 클릭한 후 새 비밀번호로 로그인하세요.</p>
              </div>
            )}
            <button type="submit" disabled={submitting || !!infoMsg}
              className="primary-btn w-full py-3 text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitting ? '전송 중...' : '초기화 이메일 전송'}
            </button>
          </form>
          <div className="mt-4 text-sm">
            <button type="button" onClick={() => { resetForm(); setMode('email-login'); }} className={`flex items-center gap-1 ${linkClass}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 로그인으로 돌아가기
            </button>
          </div>
        </div>
      );
    }

    if (mode === 'signup') {
      return (
        <div className={card}>
          <form onSubmit={handleSignUp} className="space-y-3">
            <div className="relative">
              <User className={fieldIconClass} aria-hidden="true" />
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="이름 (성명)" aria-label="이름" autoComplete="name" required
                className={fieldClass} />
            </div>
            <div className="relative">
              <Mail className={fieldIconClass} aria-hidden="true" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" aria-label="이메일" autoComplete="email" required
                className={fieldClass} />
            </div>
            <div className="relative">
              <Lock className={fieldIconClass} aria-hidden="true" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 (4자 이상)" aria-label="비밀번호" autoComplete="new-password" required minLength={4}
                className={fieldClass} />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            {infoMsg && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700">{infoMsg}</p>
                <p className="text-xs text-green-700 mt-1">이메일의 가입확인 버튼을 클릭하면 가입이 완료됩니다.</p>
              </div>
            )}
            <button type="submit" disabled={submitting || !!infoMsg}
              className="primary-btn w-full py-3 text-sm font-medium rounded-lg disabled:opacity-50 cursor-pointer">
              {submitting ? '전송 중...' : '학생으로 가입하기'}
            </button>
          </form>
          <p className="text-xs text-[#56627c] mt-3">가입확인 이메일이 전송되며, 확인 후 학생 계정이 생성됩니다.</p>
          <div className="mt-4 flex justify-between items-center text-sm">
            <button type="button" onClick={() => { resetForm(); setMode('main'); }} className={`flex items-center gap-1 ${linkClass}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 뒤로
            </button>
            <button type="button" onClick={() => { resetForm(); setMode('email-login'); }} className="text-[#2453a6] hover:text-[#1c2b4a] font-medium cursor-pointer">
              로그인
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div ref={rootRef} className="home min-h-dvh flex flex-col">
      <header className="px-6 sm:px-10 lg:px-16 pt-6">
        <div className="max-w-7xl mx-auto flex items-center gap-2 text-lg font-bold tracking-tight">
          <BrandMark />
          ChoisClass
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-10 grid gap-12 lg:grid-cols-[1.05fr_1fr] items-center">
        <section className="flex flex-col items-start gap-5">
          <p className="hand text-2xl text-[#2453a6] leading-none">오늘의 수학 노트</p>
          <h1 className="text-[clamp(2.1rem,4.4vw,3.5rem)] font-bold leading-[1.22] tracking-tight [text-wrap:balance]">
            학습지 위에 바로 풀고,
            <br />
            <span className="relative whitespace-nowrap">
              바로 피드백 받기
              <svg className="absolute -left-[2%] -bottom-3 w-[104%] h-4 overflow-visible" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
                <path d="M2 8 C 50 3, 120 11, 198 5" stroke="#d9372b" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="max-w-[34em] text-[16px] lg:text-[18px] text-[#56627c] leading-relaxed">
            선생님이 올린 자료에 손글씨로 필기하면 자동 저장되고, 선생님은 그 위에 실시간으로 코멘트를 남깁니다.
          </p>
          <div className="mt-3 w-full">{renderAuthSection()}</div>
        </section>

        <div ref={sceneRef} className="hidden md:block w-full max-w-xl justify-self-center">
          <LessonScene play={playIntro} />
        </div>
      </main>

      <footer className="px-6 sm:px-10 lg:px-16 pb-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[13px] text-[#56627c]">
          <span>&copy; {new Date().getFullYear()} ChoisClass</span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-[#1c2b4a]">개인정보처리방침</Link>
            <Link to="/terms" className="hover:text-[#1c2b4a]">서비스 이용약관</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
