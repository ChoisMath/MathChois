/**
 * REST API 클라이언트 — supabase.from(...) 직접 호출을 대체
 *
 * - Access Token을 메모리에 저장, 모든 요청에 Bearer 헤더 추가
 * - 401 응답 시 자동으로 POST /api/auth/refresh 호출 후 재시도
 */

import type { Profile } from '@mathchois/shared';

let _accessToken: string | null = null;
let _refreshPromise: Promise<{ token: string; profile: Profile } | null> | null = null;

// AuthContext에서 token 변경 시 호출
export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// ─── Core fetch wrapper ──────────────────────────

async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };

  // JSON body인 경우 Content-Type 자동 설정
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const res = await fetch(url, { ...options, headers, credentials: 'include' });

  // 401 → refresh 시도 후 재시도 (1회, singleton으로 중복 방지)
  if (res.status === 401 && retry) {
    const refreshed = await refreshTokenOnce();
    if (refreshed) {
      return apiFetch<T>(url, options, false);
    }
    // refresh도 실패 → 토큰 제거 (AuthContext에서 logout 처리)
    _accessToken = null;
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Auth endpoints ──────────────────────────────

/** 동시 401 요청들이 refresh를 중복 호출하지 않도록 singleton promise 패턴 */
function refreshTokenOnce(): Promise<{ token: string; profile: Profile } | null> {
  if (!_refreshPromise) {
    _refreshPromise = refreshToken().finally(() => {
      _refreshPromise = null;
    });
  }
  return _refreshPromise;
}

/** 앱 시작 시 refresh token으로 세션 복원 */
export async function refreshToken(): Promise<{
  token: string;
  profile: Profile;
} | null> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    _accessToken = data.token;
    return data;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
  _accessToken = null;
}

export async function getMe(): Promise<{ profile: Profile }> {
  return apiFetch('/api/auth/me');
}

/** 이메일 회원가입 */
export async function signUpWithEmail(email: string, password: string, name: string): Promise<{
  token: string;
  profile: Profile;
}> {
  const result = await apiFetch<{ token: string; profile: Profile }>(
    '/api/auth/signup',
    {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    },
    false, // no retry on 401
  );
  _accessToken = result.token;
  return result;
}

/** 이메일 로그인 */
export async function signInWithEmail(email: string, password: string): Promise<{
  token: string;
  profile: Profile;
  passwordReset?: boolean;
}> {
  const result = await apiFetch<{ token: string; profile: Profile; passwordReset?: boolean }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false, // no retry on 401
  );
  _accessToken = result.token;
  return result;
}

/** 이름 변경 */
export async function updateName(name: string): Promise<{ profile: Profile }> {
  return apiFetch('/api/profiles/name', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

/** 비밀번호 초기화 이메일 요청 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, false);
}

export async function updateRole(role: 'teacher' | 'student'): Promise<{
  token: string;
  profile: Profile;
}> {
  const result = await apiFetch<{ token: string; profile: Profile }>(
    '/api/profiles/role',
    {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    },
  );
  _accessToken = result.token;
  return result;
}

// ─── Generic CRUD helpers ────────────────────────

export const api = {
  get<T>(url: string): Promise<T> {
    return apiFetch<T>(url);
  },

  post<T>(url: string, body?: unknown): Promise<T> {
    return apiFetch<T>(url, {
      method: 'POST',
      body: body != null ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(url: string, body?: unknown): Promise<T> {
    return apiFetch<T>(url, {
      method: 'PUT',
      body: body != null ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(url: string, body?: unknown): Promise<T> {
    return apiFetch<T>(url, {
      method: 'PATCH',
      body: body != null ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(url: string): Promise<T> {
    return apiFetch<T>(url, { method: 'DELETE' });
  },

  /** Multipart 파일 업로드 (FormData) */
  upload<T>(url: string, formData: FormData): Promise<T> {
    return apiFetch<T>(url, {
      method: 'POST',
      body: formData,
      // Content-Type은 browser가 boundary 포함하여 자동 설정
    });
  },
};
