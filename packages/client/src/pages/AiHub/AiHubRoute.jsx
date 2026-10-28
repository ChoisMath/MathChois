import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { getAiHubCache, setAiHubCache, invalidateAiHubCache } from '../../lib/dataCache';
import { resolveAiHubRedirect } from '../../lib/aiHub/guard';
import { AiHubDataContext } from '../../hooks/useAiHubData';

const DENIED = { allowed: false, canEdit: false, canEditOriginal: false };

/**
 * 접근 확인 + 목록 읽기. access 는 매번 새로 확인하고(교사가 스위치를 끈 경우를 잡기 위해),
 * 모션·슬라이드 목록은 브라우저 세션 동안 캐시한다. 403 은 allowed:false 로 본다.
 */
async function fetchHubData() {
  try {
    const access = await api.get('/api/ai/access');
    if (!access?.allowed) {
      invalidateAiHubCache();
      return { access: { ...DENIED, ...access, allowed: false }, motion: [], slide: [] };
    }
    const cached = getAiHubCache();
    if (cached) {
      const next = { ...cached, access };
      setAiHubCache(next);
      return next;
    }
    const [motion, slide] = await Promise.all([api.get('/api/ai/motion'), api.get('/api/ai/slide')]);
    const next = { access, motion: motion ?? [], slide: slide ?? [] };
    setAiHubCache(next);
    return next;
  } catch (err) {
    if (err?.status === 403) {
      invalidateAiHubCache();
      return { access: DENIED, motion: [], slide: [] };
    }
    throw err;
  }
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-lg text-gray-500">로딩 중...</p>
    </div>
  );
}

/**
 * /ai/* 가드 + 데이터 공급자. 비로그인 → /, 역할 없음 → /choose-role, 허락 없음 → /{role}/classrooms.
 * 하위 화면은 useAiHubData() 로 { access, motion, slide, status, reload, from } 를 받는다(from = 돌아갈 학급 주소 또는 null).
 */
export default function AiHubRoute() {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const { pathname, state: navState } = useLocation();
  const role = profile?.role ?? null;
  const ready = !isLoading && isAuthenticated && !!role;

  const [data, setData] = useState({ access: null, motion: [], slide: [] });
  const [status, setStatus] = useState('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const loadedRef = useRef(false);

  // 학급 상세가 navigate('/ai', { state: { from } }) 로 넘긴 돌아갈 주소 — 탭을 옮겨 state 가 사라져도 기억한다.
  const [from, setFrom] = useState(null);
  const stateFrom = typeof navState?.from === 'string' && /^\/(?!\/)/.test(navState.from) ? navState.from : null;
  if (stateFrom && stateFrom !== from) setFrom(stateFrom);

  // 처음·다시 불러오기(reload 가 status 를 loading 으로)에는 로딩 화면, 화면(탭) 이동 때의 접근 재확인은 조용히 한다.
  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    fetchHubData().then(
      (next) => {
        if (cancelled) return;
        loadedRef.current = true;
        setData(next);
        setStatus('ready');
      },
      (err) => {
        if (cancelled) return;
        console.error('[AiHubRoute] 불러오기 오류:', err);
        if (!loadedRef.current) setStatus('error'); // 이미 보던 화면에서 잠깐 실패한 건 그대로 둔다
      },
    );
    return () => { cancelled = true; };
  }, [ready, pathname, reloadKey]);

  const reload = useCallback(() => {
    invalidateAiHubCache();
    loadedRef.current = false;
    setStatus('loading');
    setReloadKey((k) => k + 1);
  }, []);

  const value = useMemo(() => ({ ...data, status, reload, from }), [data, status, reload, from]);

  if (isLoading) return <LoadingScreen />;
  const redirect = resolveAiHubRedirect({
    isAuthenticated,
    role,
    allowed: data.access ? data.access.allowed : null,
  });
  if (redirect) return <Navigate to={redirect} replace />;

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-gray-50 px-4 text-center">
        <p className="text-gray-700" role="alert">AI활용을 불러오지 못했어요.</p>
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
  if (!data.access) return <LoadingScreen />;

  return (
    <AiHubDataContext.Provider value={value}>
      <Outlet />
    </AiHubDataContext.Provider>
  );
}
