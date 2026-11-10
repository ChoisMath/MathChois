import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { resolveIbGuideRedirect } from '../../lib/ibGuide/guard';
import { IbGuideDataContext } from '../../hooks/useIbGuideData';

const DENIED = { allowed: false };

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-lg text-gray-500">로딩 중...</p>
    </div>
  );
}

/**
 * /ib/* 가드 + 데이터 공급자. 비로그인 → /, 허락 없음 → /{role}/classrooms (역할이 비어 있으면 학생으로 본다).
 * 하위 화면은 useIbGuideData() 로 { access, examples, status, reload, from } 를 받는다(from = 돌아갈 학급 주소 또는 null).
 */
export default function IbGuideRoute() {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const { pathname, state: navState } = useLocation();
  const role = profile?.role ?? null;
  const ready = !isLoading && isAuthenticated;

  const [access, setAccess] = useState(null);
  const [examples, setExamples] = useState([]);
  const [status, setStatus] = useState('loading');
  const [reloadKey, setReloadKey] = useState(0);
  // 목록은 한 번 받으면 화면 이동 때 다시 받지 않는다(접근 확인만 매번). reload() 가 비운다.
  const examplesLoadedRef = useRef(false);

  // 학급 상세가 navigate('/ib', { state: { from } }) 로 넘긴 돌아갈 주소 — 탭을 옮겨 state 가 사라져도 기억한다.
  const [from, setFrom] = useState(null);
  const stateFrom = typeof navState?.from === 'string' && /^\/(?!\/)/.test(navState.from) ? navState.from : null;
  if (stateFrom && stateFrom !== from) setFrom(stateFrom);

  // 처음·다시 불러오기에는 로딩 화면, 화면 이동 때의 접근 재확인은 조용히 한다(교사가 스위치를 끈 경우를 잡기 위해).
  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const acc = await api.get('/api/ib/access');
        if (cancelled) return;
        if (!acc?.allowed) {
          examplesLoadedRef.current = false;
          setAccess(DENIED);
          setExamples([]);
          setStatus('ready');
          return;
        }
        if (!examplesLoadedRef.current) {
          const res = await api.get('/api/ib/ia');
          if (cancelled) return;
          setExamples(res?.examples ?? []);
          examplesLoadedRef.current = true;
        }
        setAccess({ allowed: true });
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 403) {
          examplesLoadedRef.current = false;
          setAccess(DENIED);
          setExamples([]);
          setStatus('ready');
          return;
        }
        console.error('[IbGuideRoute] 불러오기 오류:', err);
        if (!examplesLoadedRef.current) setStatus('error'); // 이미 보던 화면에서 잠깐 실패한 건 그대로 둔다
      }
    })();
    return () => { cancelled = true; };
  }, [ready, pathname, reloadKey]);

  const reload = useCallback(() => {
    examplesLoadedRef.current = false;
    setStatus('loading');
    setReloadKey((k) => k + 1);
  }, []);

  const value = useMemo(() => ({ access, examples, status, reload, from }), [access, examples, status, reload, from]);

  if (isLoading) return <LoadingScreen />;
  const redirect = resolveIbGuideRedirect({
    isAuthenticated,
    role,
    allowed: access ? access.allowed : null,
  });
  if (redirect) return <Navigate to={redirect} replace />;

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-gray-50 px-4 text-center">
        <p className="text-gray-700" role="alert">IB 안내를 불러오지 못했어요.</p>
        <button
          type="button"
          onClick={reload}
          className="min-h-11 px-4 rounded-md bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (!access) return <LoadingScreen />;

  return (
    <IbGuideDataContext.Provider value={value}>
      <Outlet />
    </IbGuideDataContext.Provider>
  );
}
