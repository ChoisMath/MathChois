import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { profiles } from '../db/schema.js';
import type { TokenPayload } from '@mathchois/shared';

const google = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
);

/** 최초 관리자 이메일 — 첫 로그인 시 자동으로 isAdmin = true */
const INITIAL_ADMIN_EMAIL = 'complete860127@gmail.com';

// ─── Google OAuth ──────────────────────────────────

/** Google 인가 URL 생성 */
export function getGoogleAuthUrl(redirectUri: string): string {
  return google.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    redirect_uri: redirectUri,
    prompt: 'select_account',
  });
}

/** Authorization code → Google 사용자 정보 교환 */
export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const { tokens } = await google.getToken({ code, redirect_uri: redirectUri });
  const ticket = await google.verifyIdToken({
    idToken: tokens.id_token!,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload()!;
  return {
    googleId: payload.sub,
    email: payload.email ?? null,
    name: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  };
}

// ─── Profile CRUD ──────────────────────────────────

/** googleId로 프로필 찾기 또는 생성 */
export async function findOrCreateProfile(googleUser: {
  googleId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}) {
  const shouldBeAdmin = googleUser.email === INITIAL_ADMIN_EMAIL;

  // 기존 사용자 조회
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.googleId, googleUser.googleId))
    .limit(1);

  if (existing.length > 0) {
    // 이름/아바타 업데이트 (Google 프로필 변경 시)
    const [updated] = await db
      .update(profiles)
      .set({
        name: googleUser.name,
        email: googleUser.email,
        avatarUrl: googleUser.avatarUrl,
        // 최초 관리자 이메일이면 isAdmin 보장
        ...(shouldBeAdmin && !existing[0].isAdmin ? { isAdmin: true } : {}),
      })
      .where(eq(profiles.id, existing[0].id))
      .returning();
    return updated;
  }

  // 새 사용자 생성
  const [created] = await db
    .insert(profiles)
    .values({
      googleId: googleUser.googleId,
      email: googleUser.email,
      name: googleUser.name,
      avatarUrl: googleUser.avatarUrl,
      isAdmin: shouldBeAdmin,
    })
    .returning();
  return created;
}

/** ID로 프로필 조회 */
export async function getProfileById(id: string) {
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** 역할 업데이트 */
export async function updateProfileRole(id: string, role: 'teacher' | 'student') {
  const [updated] = await db
    .update(profiles)
    .set({ role })
    .where(eq(profiles.id, id))
    .returning();
  return updated ?? null;
}

// ─── JWT ──────────────────────────────────────────

/** Access Token 발급 (15분) */
export function signAccessToken(profile: { id: string; role: string | null; isAdmin: boolean }): string {
  const payload: TokenPayload = {
    sub: profile.id,
    role: profile.role as TokenPayload['role'],
    isAdmin: profile.isAdmin,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
}

/** Refresh Token 발급 (7일) */
export function signRefreshToken(profileId: string): string {
  return jwt.sign({ sub: profileId }, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

/** Refresh Token 검증 → profileId 반환 */
export function verifyRefreshToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}
