import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId) => {
    // Retry logic: trigger 가 아직 profile을 생성하지 않았을 수 있음
    for (let i = 0; i < 3; i++) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) {
        setProfile(data);
        return data;
      }

      if (i < 2) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return null;
  };

  useEffect(() => {
    // 1단계: 앱 시작 시 세션 로드 (5초 타임아웃 적용)
    const initializeAuth = async () => {
      try {
        // getSession()이 응답하지 않을 경우를 대비한 타임아웃 경쟁
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        );
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (err) {
        console.error('[Auth] 초기화 오류 (로그아웃 처리):', err.message);
        // 타임아웃이나 네트워크 오류 시: 만료된 세션 제거 후 로그인 화면으로
        try { await supabase.auth.signOut(); } catch { /* ignore */ }
        setUser(null);
        setProfile(null);
      } finally {
        // 어떤 경우에도 반드시 로딩 해제
        setIsLoading(false);
      }
    };

    initializeAuth();

    // 2단계: 이후 로그인/로그아웃 이벤트만 처리 (isLoading 변경 없음)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] event:', event, '| user:', session?.user?.email ?? 'none');

        if (event === 'SIGNED_IN') {
          setUser(session.user);
          fetchProfile(session.user.id); // await 제거: 로그인 UX 차단하지 않음
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) console.error('Google 로그인 실패:', error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const updateRole = async (role) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      console.error('역할 업데이트 실패:', error.message);
      return null;
    }
    setProfile(data);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAuthenticated: !!user,
        isLoading,
        signInWithGoogle,
        signOut,
        updateRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
