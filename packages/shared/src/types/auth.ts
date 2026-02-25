/** JWT Access Token에 포함되는 페이로드 */
export interface TokenPayload {
  sub: string;  // profile.id
  role: 'teacher' | 'student' | null;
  isAdmin: boolean;
  iat?: number;
  exp?: number;
}

/** 프론트엔드에서 사용하는 사용자 프로필 */
export interface Profile {
  id: string;
  googleId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: 'teacher' | 'student' | null;
  isAdmin: boolean;
}

/** 로그인 응답 */
export interface AuthResponse {
  token: string;
  profile: Profile;
}

/** /api/auth/me 응답 */
export interface MeResponse {
  profile: Profile;
}
