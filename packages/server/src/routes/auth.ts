import type { FastifyInstance } from 'fastify';
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  findOrCreateProfile,
  getProfileById,
  getProfileByEmail,
  createEmailProfile,
  hashPassword,
  verifyPassword,
  updatePassword,
  setMustResetPassword,
  updateProfileRole,
  updateProfileName,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
} from '../services/auth.service.js';
import { isMailConfigured, sendPasswordResetEmail } from '../services/mail.service.js';
import { authenticate } from '../middleware/auth.js';
import { env } from '../config/env.js';

/** Refresh token cookie 옵션 */
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

/** DB profile → API 응답용 profile 변환 */
function toProfileResponse(p: NonNullable<Awaited<ReturnType<typeof getProfileById>>>) {
  return {
    id: p.id,
    googleId: p.googleId,
    name: p.name,
    email: p.email,
    avatarUrl: p.avatarUrl,
    role: p.role,
    isAdmin: p.isAdmin,
    authMethod: p.authMethod,
    mustResetPassword: p.mustResetPassword,
  };
}

export async function authRoutes(app: FastifyInstance) {

  // ─── POST /api/auth/signup — 이메일/비밀번호 회원가입 ────

  app.post<{
    Body: { email: string; password: string; name: string };
  }>('/api/auth/signup', async (request, reply) => {
    const { email, password, name } = request.body ?? {};

    if (!email || !password || !name) {
      return reply.status(400).send({ error: '이메일, 비밀번호, 이름을 모두 입력해 주세요.' });
    }

    // 이메일 형식 검증
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({ error: '올바른 이메일 형식이 아닙니다.' });
    }

    // 비밀번호 길이 검증
    if (password.length < 4) {
      return reply.status(400).send({ error: '비밀번호는 4자 이상이어야 합니다.' });
    }

    // 이메일 정규화
    const normalizedEmail = email.toLowerCase().trim();

    // 이메일 중복 확인
    const existing = await getProfileByEmail(normalizedEmail);
    if (existing) {
      return reply.status(409).send({ error: '이미 등록된 이메일입니다.' });
    }

    try {
      const passwordHashed = await hashPassword(password);
      const profile = await createEmailProfile(normalizedEmail, passwordHashed, name.trim());

      const accessToken = signAccessToken(profile);
      const refreshToken = signRefreshToken(profile.id);
      reply.setCookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);

      return { token: accessToken, profile: toProfileResponse(profile) };
    } catch (err: any) {
      // DB unique 제약 위반 (race condition)
      if (err?.code === '23505' || err?.message?.includes('unique')) {
        return reply.status(409).send({ error: '이미 등록된 이메일입니다.' });
      }
      app.log.error(err, 'Email signup failed');
      return reply.status(500).send({ error: '회원가입 처리 중 오류가 발생했습니다.' });
    }
  });

  // ─── POST /api/auth/login — 이메일/비밀번호 로그인 ────

  app.post<{
    Body: { email: string; password: string };
  }>('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body ?? {};

    if (!email || !password) {
      return reply.status(400).send({ error: '이메일과 비밀번호를 입력해 주세요.' });
    }

    const profile = await getProfileByEmail(email.toLowerCase().trim());
    if (!profile || profile.authMethod !== 'email' || !profile.passwordHash) {
      return reply.status(401).send({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    // mustResetPassword 상태: 입력한 비밀번호가 새 비밀번호가 됨
    if (profile.mustResetPassword) {
      const newHash = await hashPassword(password);
      const updated = await updatePassword(profile.id, newHash);
      if (updated) {
        const accessToken = signAccessToken(updated);
        const refreshToken = signRefreshToken(updated.id);
        reply.setCookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);
        return { token: accessToken, profile: toProfileResponse(updated), passwordReset: true };
      }
    }

    const valid = await verifyPassword(password, profile.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const accessToken = signAccessToken(profile);
    const refreshToken = signRefreshToken(profile.id);
    reply.setCookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);

    return { token: accessToken, profile: toProfileResponse(profile) };
  });

  // ─── PATCH /api/profiles/name — 이름 변경 ────────

  app.patch<{
    Body: { name: string };
  }>('/api/profiles/name', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { name } = request.body ?? {};
    if (!name || !name.trim()) {
      return reply.status(400).send({ error: '이름을 입력해 주세요.' });
    }

    const updated = await updateProfileName(request.user.sub, name.trim());
    if (!updated) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    return { profile: toProfileResponse(updated) };
  });

  // ─── POST /api/auth/forgot-password — 비밀번호 초기화 이메일 발송 ────

  app.post<{
    Body: { email: string };
  }>('/api/auth/forgot-password', async (request, reply) => {
    const { email } = request.body ?? {};

    if (!email) {
      return reply.status(400).send({ error: '이메일을 입력해 주세요.' });
    }

    if (!isMailConfigured()) {
      return reply.status(503).send({ error: '이메일 발송이 설정되지 않았습니다. 관리자에게 문의해 주세요.' });
    }

    const profile = await getProfileByEmail(email.toLowerCase().trim());

    // 보안: 이메일 존재 여부를 노출하지 않음 (항상 같은 응답)
    if (!profile || profile.authMethod !== 'email') {
      return { success: true, message: '해당 이메일로 초기화 링크를 전송했습니다.' };
    }

    try {
      const token = signPasswordResetToken(profile.id);
      const baseUrl = env.APP_URL || `${request.protocol}://${request.hostname}`;
      const resetUrl = `${baseUrl}/api/auth/reset-password/${token}`;

      await sendPasswordResetEmail(profile.email!, resetUrl, profile.name);

      return { success: true, message: '해당 이메일로 초기화 링크를 전송했습니다.' };
    } catch (err) {
      app.log.error(err, 'Failed to send password reset email');
      return reply.status(500).send({ error: '이메일 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  });

  // ─── GET /api/auth/reset-password/:token — 비밀번호 초기화 실행 ────

  app.get<{
    Params: { token: string };
  }>('/api/auth/reset-password/:token', async (request, reply) => {
    const profileId = verifyPasswordResetToken(request.params.token);

    const clientUrl = env.APP_URL || (env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');

    if (!profileId) {
      return reply.redirect(`${clientUrl}/?reset_error=invalid`);
    }

    const profile = await getProfileById(profileId);
    if (!profile || profile.authMethod !== 'email') {
      return reply.redirect(`${clientUrl}/?reset_error=invalid`);
    }

    // mustResetPassword 설정
    await setMustResetPassword(profileId);

    // 로그인 페이지로 리다이렉트 (새 창에서 열림)
    return reply.redirect(`${clientUrl}/?password_reset=true`);
  });

  // ─── GET /api/auth/google — Google OAuth 시작 ────

  app.get('/api/auth/google', async (request, reply) => {
    const redirectUri = `${getBaseUrl(request)}/api/auth/google/callback`;
    const url = getGoogleAuthUrl(redirectUri);
    return reply.redirect(url);
  });

  // ─── GET /api/auth/google/callback — OAuth 콜백 ──

  app.get<{
    Querystring: { code?: string; error?: string };
  }>('/api/auth/google/callback', async (request, reply) => {
    const { code, error } = request.query;

    if (error || !code) {
      app.log.warn({ error }, 'Google OAuth denied or missing code');
      return reply.redirect('/?auth_error=denied');
    }

    try {
      const redirectUri = `${getBaseUrl(request)}/api/auth/google/callback`;
      const googleUser = await exchangeGoogleCode(code, redirectUri);
      const profile = await findOrCreateProfile(googleUser);

      const accessToken = signAccessToken(profile);
      const refreshToken = signRefreshToken(profile.id);

      reply.setCookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);

      // 프론트엔드로 리다이렉트 — access token은 hash fragment로 전달 (서버 로그 미기록)
      const clientUrl = env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
      return reply.redirect(`${clientUrl}/auth/callback#token=${accessToken}`);
    } catch (err) {
      app.log.error(err, 'Google OAuth callback failed');
      return reply.redirect('/?auth_error=server');
    }
  });

  // ─── POST /api/auth/refresh — 토큰 갱신 ─────────

  app.post('/api/auth/refresh', async (request, reply) => {
    const token = request.cookies.refresh_token;
    if (!token) {
      return reply.status(401).send({ error: 'No refresh token' });
    }

    const profileId = verifyRefreshToken(token);
    if (!profileId) {
      reply.clearCookie('refresh_token', { path: '/api/auth' });
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    const profile = await getProfileById(profileId);
    if (!profile) {
      reply.clearCookie('refresh_token', { path: '/api/auth' });
      return reply.status(401).send({ error: 'User not found' });
    }

    // 토큰 로테이션: 새 refresh token 발급
    const newAccessToken = signAccessToken(profile);
    const newRefreshToken = signRefreshToken(profile.id);

    reply.setCookie('refresh_token', newRefreshToken, REFRESH_COOKIE_OPTIONS);

    return {
      token: newAccessToken,
      profile: toProfileResponse(profile),
    };
  });

  // ─── POST /api/auth/logout — 로그아웃 ───────────

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('refresh_token', { path: '/api/auth' });
    return { ok: true };
  });

  // ─── GET /api/auth/me — 현재 사용자 프로필 ──────

  app.get('/api/auth/me', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const profile = await getProfileById(request.user.sub);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }
    return { profile: toProfileResponse(profile) };
  });

  // ─── GET /api/profiles/:id — 특정 사용자 프로필 조회

  app.get<{ Params: { id: string } }>('/api/profiles/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const profile = await getProfileById(request.params.id);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }
    return { id: profile.id, name: profile.name, avatarUrl: profile.avatarUrl };
  });

  // ─── PATCH /api/profiles/role — 역할 설정 ───────

  app.patch<{
    Body: { role: 'teacher' | 'student' };
  }>('/api/profiles/role', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { role } = request.body;
    if (role !== 'teacher' && role !== 'student') {
      return reply.status(400).send({ error: 'Invalid role' });
    }

    const updated = await updateProfileRole(request.user.sub, role);
    if (!updated) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    // 새 access token 발급 (role이 변경되었으므로)
    const newAccessToken = signAccessToken(updated);
    const newRefreshToken = signRefreshToken(updated.id);
    reply.setCookie('refresh_token', newRefreshToken, REFRESH_COOKIE_OPTIONS);

    return {
      token: newAccessToken,
      profile: toProfileResponse(updated),
    };
  });
}

// ─── Helpers ─────────────────────────────────────

function getBaseUrl(request: { hostname: string; protocol: string }) {
  // Production: same origin. Dev: server's own URL
  return `${request.protocol}://${request.hostname}`;
}
