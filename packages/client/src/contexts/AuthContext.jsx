import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  refreshToken,
  logout as apiLogout,
  updateRole as apiUpdateRole,
  signUpWithEmail as apiSignUp,
  signInWithEmail as apiSignIn,
  updateName as apiUpdateName,
  setAccessToken,
} from '../lib/api';
import { connectSocket, disconnectSocket, reconnectWithToken } from '../lib/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // ─── 앱 시작 시 refresh token으로 세션 복원 ────

  useEffect(() => {
    const initAuth = async () => {
      try {
        // hash에서 token 추출 (OAuth callback에서 전달된 경우)
        const hash = window.location.hash;
        if (hash.includes('token=')) {
          const token = hash.split('token=')[1]?.split('&')[0];
          if (token) {
            setAccessToken(token);
            window.history.replaceState(null, '', window.location.pathname);
          }
        }

        // refresh token으로 세션 복원 시도
        const result = await refreshToken();
        if (result) {
          setProfile(result.profile);
          // 세션 복원 성공 → Socket.IO 연결
          try { connectSocket(); } catch { /* 토큰 없으면 무시 */ }
        }
      } catch (err) {
        console.error('[Auth] 초기화 오류:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // ─── Google OAuth 시작 ─────────────────────────

  const signInWithGoogle = useCallback(() => {
    window.location.href = '/api/auth/google';
  }, []);

  // ─── 로그아웃 ──────────────────────────────────

  const signOut = useCallback(async () => {
    disconnectSocket();
    await apiLogout();
    setProfile(null);
  }, []);

  // ─── 이메일 회원가입 (가입확인 이메일 발송) ────

  const signUpWithEmail = useCallback(async (email, password, name) => {
    const result = await apiSignUp(email, password, name);
    // 계정이 바로 생성되지 않음 — 이메일 확인 후 생성됨
    return result;
  }, []);

  // ─── 이메일 로그인 ──────────────────────────

  const signInWithEmail = useCallback(async (email, password) => {
    const result = await apiSignIn(email, password);
    setProfile(result.profile);
    try { connectSocket(); } catch { /* ignore */ }
    return { profile: result.profile, passwordReset: result.passwordReset };
  }, []);

  // ─── 이름 업데이트 ──────────────────────────

  const updateName = useCallback(async (name) => {
    const result = await apiUpdateName(name);
    setProfile(result.profile);
    return result.profile;
  }, []);

  // ─── 역할 업데이트 ────────────────────────────

  const updateRole = useCallback(async (role) => {
    try {
      const result = await apiUpdateRole(role);
      setProfile(result.profile);
      reconnectWithToken(); // 새 토큰으로 소켓 재연결
      return result.profile;
    } catch (err) {
      console.error('역할 업데이트 실패:', err);
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: profile,   // 기존 호환: user는 profile과 동일
        profile,
        isAuthenticated: !!profile,
        isLoading,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        signOut,
        updateRole,
        updateName,
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
