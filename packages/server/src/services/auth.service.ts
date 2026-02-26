import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
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

  // 1) googleId로 기존 사용자 조회
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
        ...(shouldBeAdmin && !existing[0].isAdmin ? { isAdmin: true } : {}),
      })
      .where(eq(profiles.id, existing[0].id))
      .returning();
    return updated;
  }

  // 2) 같은 이메일의 email 계정이 있으면 Google 연동 (authMethod → google)
  if (googleUser.email) {
    const emailAccount = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, googleUser.email))
      .limit(1);

    if (emailAccount.length > 0) {
      const [updated] = await db
        .update(profiles)
        .set({
          googleId: googleUser.googleId,
          name: googleUser.name,
          avatarUrl: googleUser.avatarUrl,
          authMethod: 'google',
          passwordHash: null,
          mustResetPassword: false,
          ...(shouldBeAdmin && !emailAccount[0].isAdmin ? { isAdmin: true } : {}),
        })
        .where(eq(profiles.id, emailAccount[0].id))
        .returning();
      return updated;
    }
  }

  // 3) 새 사용자 생성
  const [created] = await db
    .insert(profiles)
    .values({
      googleId: googleUser.googleId,
      email: googleUser.email,
      name: googleUser.name,
      avatarUrl: googleUser.avatarUrl,
      authMethod: 'google',
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

// ─── Email/Password Auth ─────────────────────────

const BCRYPT_ROUNDS = 10;

/** 비밀번호 해싱 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** 비밀번호 검증 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 이메일로 프로필 조회 (lowercase 정규화) */
export async function getProfileByEmail(email: string) {
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

/** 이메일/비밀번호로 학생 계정 생성 (이메일 lowercase 정규화) */
export async function createEmailProfile(email: string, passwordHash: string, name: string) {
  const normalizedEmail = email.toLowerCase();
  const shouldBeAdmin = normalizedEmail === INITIAL_ADMIN_EMAIL;

  const [created] = await db
    .insert(profiles)
    .values({
      email: normalizedEmail,
      passwordHash,
      name,
      role: 'student',
      authMethod: 'email',
      isAdmin: shouldBeAdmin,
    })
    .returning();
  return created;
}

/** 비밀번호 업데이트 */
export async function updatePassword(userId: string, newPasswordHash: string) {
  const [updated] = await db
    .update(profiles)
    .set({ passwordHash: newPasswordHash, mustResetPassword: false })
    .where(eq(profiles.id, userId))
    .returning();
  return updated ?? null;
}

/** 비밀번호 초기화 플래그 설정 (관리자용) */
export async function setMustResetPassword(userId: string) {
  const [updated] = await db
    .update(profiles)
    .set({ mustResetPassword: true })
    .where(eq(profiles.id, userId))
    .returning();
  return updated ?? null;
}

/** 사용자 이름 변경 */
export async function updateProfileName(userId: string, name: string) {
  const [updated] = await db
    .update(profiles)
    .set({ name })
    .where(eq(profiles.id, userId))
    .returning();
  return updated ?? null;
}

// ─── Password Reset Token ───────────────────────

/** 비밀번호 초기화 토큰 생성 (1시간 유효) */
export function signPasswordResetToken(profileId: string): string {
  return jwt.sign({ sub: profileId, purpose: 'password-reset' }, env.JWT_SECRET, { expiresIn: '1h' });
}

/** 비밀번호 초기화 토큰 검증 → profileId 반환 */
export function verifyPasswordResetToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; purpose?: string };
    if (payload.purpose !== 'password-reset') return null;
    return payload.sub;
  } catch {
    return null;
  }
}

// ─── JWT ──────────────────────────────────────────

/** Access Token 발급 (15분) */
export function signAccessToken(profile: { id: string; role: string | null; isAdmin: boolean; mustResetPassword?: boolean }): string {
  const payload: TokenPayload = {
    sub: profile.id,
    role: profile.role as TokenPayload['role'],
    isAdmin: profile.isAdmin,
    ...(profile.mustResetPassword ? { mustResetPassword: true } : {}),
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
