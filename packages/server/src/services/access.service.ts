import { eq, sql, and, ne } from 'drizzle-orm';
import { resolveRole, normalizeEmail, type AccessRole } from '@mathchois/shared';
import { db } from '../config/database.js';
import { profiles, allowedTeachers } from '../db/schema.js';
import { consumeClassroomInvites } from './classroomInvite.service.js';

type ProfileRow = typeof profiles.$inferSelect;

// ─── 교사 허용 목록 ─────────────────────────────────

/** 이메일이 교사 허용 목록에 있는지 (소문자 비교) */
export async function isAllowedTeacher(email: string | null | undefined): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const rows = await db
    .select({ id: allowedTeachers.id })
    .from(allowedTeachers)
    .where(eq(allowedTeachers.email, normalized))
    .limit(1);
  return rows.length > 0;
}

/** 허용 목록 전체 — 그 이메일로 가입한 계정이 있으면 함께 돌려준다 */
export async function listAllowedTeachers() {
  const rows = await db
    .select({
      id: allowedTeachers.id,
      email: allowedTeachers.email,
      note: allowedTeachers.note,
      createdAt: allowedTeachers.createdAt,
      profileId: profiles.id,
      profileName: profiles.name,
      profileAvatarUrl: profiles.avatarUrl,
      profileRole: profiles.role,
      profileIsAdmin: profiles.isAdmin,
      profileAuthMethod: profiles.authMethod,
    })
    .from(allowedTeachers)
    .leftJoin(profiles, eq(sql`lower(${profiles.email})`, allowedTeachers.email))
    .orderBy(allowedTeachers.createdAt);

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    note: r.note,
    createdAt: r.createdAt,
    profile: r.profileId
      ? {
          id: r.profileId,
          name: r.profileName,
          avatarUrl: r.profileAvatarUrl,
          role: r.profileRole,
          isAdmin: r.profileIsAdmin,
          authMethod: r.profileAuthMethod,
        }
      : null,
  }));
}

/**
 * 허용 목록에 이메일을 추가한다(이미 있으면 건너뜀). 그 이메일로 이미 가입한 **비관리자** 계정은 즉시 교사로 올린다.
 * 입력은 이미 정규화된(소문자) 이메일이어야 한다.
 */
export async function addAllowedTeachers(emails: readonly string[], createdBy: string | null) {
  const added: string[] = [];
  const existing: string[] = [];
  for (const email of emails) {
    const inserted = await db
      .insert(allowedTeachers)
      .values({ email, createdBy })
      .onConflictDoNothing({ target: allowedTeachers.email })
      .returning({ email: allowedTeachers.email });
    (inserted.length > 0 ? added : existing).push(email);
  }
  if (added.length > 0) {
    for (const email of added) {
      await db
        .update(profiles)
        .set({ role: 'teacher' })
        .where(and(eq(sql`lower(${profiles.email})`, email), eq(profiles.isAdmin, false), ne(profiles.role, 'teacher')));
    }
  }
  return { added, existing };
}

/** 허용 목록에서 한 줄 삭제. 그 이메일의 비관리자 계정은 즉시 학생으로 내린다. 없으면 null. */
export async function removeAllowedTeacher(id: string) {
  const [removed] = await db
    .delete(allowedTeachers)
    .where(eq(allowedTeachers.id, id))
    .returning({ email: allowedTeachers.email });
  if (!removed) return null;
  await db
    .update(profiles)
    .set({ role: 'student' })
    .where(and(eq(sql`lower(${profiles.email})`, removed.email), eq(profiles.isAdmin, false)));
  return removed;
}

export async function getAllowedTeacherById(id: string) {
  const rows = await db.select().from(allowedTeachers).where(eq(allowedTeachers.id, id)).limit(1);
  return rows[0] ?? null;
}

/** 관리자 패널의 "역할 선택"이 쓰는 동기화: teacher → 목록에 넣고, student → 목록에서 뺀다 */
export async function syncAllowedTeacherForRole(email: string | null | undefined, role: AccessRole, byId: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (role === 'teacher') {
    await db.insert(allowedTeachers).values({ email: normalized, createdBy: byId }).onConflictDoNothing({ target: allowedTeachers.email });
  } else {
    await db.delete(allowedTeachers).where(eq(allowedTeachers.email, normalized));
  }
}

// ─── 로그인·갱신 때마다 적용하는 접속 규칙 ───────────

/**
 * 프로필의 역할을 규칙(shared resolveRole)대로 다시 정하고, 학생이면 사전 등록된 학급에 넣는다.
 * Google 콜백·이메일 로그인·가입 확인·토큰 갱신에서 프로필을 돌려주기 직전에 호출한다.
 */
export async function applyAccessRules(profile: ProfileRow): Promise<ProfileRow> {
  const currentRole = profile.role === 'teacher' || profile.role === 'student' ? profile.role : null;
  const role = resolveRole({
    isAdmin: profile.isAdmin,
    currentRole,
    isAllowedTeacher: await isAllowedTeacher(profile.email),
  });

  let current = profile;
  if (role !== profile.role) {
    const [updated] = await db.update(profiles).set({ role }).where(eq(profiles.id, profile.id)).returning();
    if (updated) current = updated;
  }

  if (role === 'student' && current.email) {
    await consumeClassroomInvites(current.id, current.email);
  }
  return current;
}
