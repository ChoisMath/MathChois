import type { FastifyInstance } from 'fastify';
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  findOrCreateProfile,
  getProfileById,
  updateProfileRole,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../services/auth.service.js';
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

export async function authRoutes(app: FastifyInstance) {

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
      profile: {
        id: profile.id,
        googleId: profile.googleId,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        role: profile.role,
      },
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
  }, async (request) => {
    const profile = await getProfileById(request.user.sub);
    if (!profile) {
      throw { statusCode: 404, message: 'Profile not found' };
    }
    return {
      profile: {
        id: profile.id,
        googleId: profile.googleId,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        role: profile.role,
      },
    };
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
      profile: {
        id: updated.id,
        googleId: updated.googleId,
        name: updated.name,
        email: updated.email,
        avatarUrl: updated.avatarUrl,
        role: updated.role,
      },
    };
  });
}

// ─── Helpers ─────────────────────────────────────

function getBaseUrl(request: { hostname: string; protocol: string }) {
  // Production: same origin. Dev: server's own URL
  return `${request.protocol}://${request.hostname}`;
}
