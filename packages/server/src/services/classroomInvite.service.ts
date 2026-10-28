import { eq, and, inArray, sql } from 'drizzle-orm';
import { normalizeEmail } from '@mathchois/shared';
import { db } from '../config/database.js';
import { classroomInvites, classroomMembers, profiles } from '../db/schema.js';

export type InviteSkipReason = 'member' | 'teacher' | 'invited';

export interface AddInvitesResult {
  /** 이미 가입한 학생 계정이 있어 바로 구성원이 된 이메일 */
  joined: string[];
  /** 가입 대기 명단에 올라간 이메일 */
  invited: string[];
  /** 처리하지 않은 이메일과 이유 — member(이미 구성원) · teacher(교사/관리자 계정) · invited(이미 대기 중) */
  skipped: { email: string; reason: InviteSkipReason }[];
}

/** 학급의 사전 등록(가입 대기) 목록 */
export async function listClassroomInvites(classroomId: string) {
  return db
    .select({
      id: classroomInvites.id,
      classroomId: classroomInvites.classroomId,
      email: classroomInvites.email,
      createdAt: classroomInvites.createdAt,
    })
    .from(classroomInvites)
    .where(eq(classroomInvites.classroomId, classroomId))
    .orderBy(classroomInvites.createdAt);
}

/**
 * 학급에 학생 이메일을 사전 등록한다. 입력은 정규화된(소문자) 이메일.
 * - 그 이메일의 학생 계정이 이미 있으면 기다릴 이유가 없으므로 바로 구성원으로 넣는다.
 * - 교사/관리자 계정이면 넣지 않는다.
 * - 계정이 없으면 대기 명단(classroom_invites)에 올린다.
 */
export async function addClassroomInvites(
  classroomId: string,
  emails: readonly string[],
  createdBy: string | null,
): Promise<AddInvitesResult> {
  const result: AddInvitesResult = { joined: [], invited: [], skipped: [] };
  if (emails.length === 0) return result;

  const accounts = await db
    .select({ id: profiles.id, email: sql<string>`lower(${profiles.email})`, role: profiles.role, isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(inArray(sql`lower(${profiles.email})`, [...emails]));
  const accountByEmail = new Map(accounts.map((a) => [a.email, a]));

  const members = await db
    .select({ studentId: classroomMembers.studentId })
    .from(classroomMembers)
    .where(eq(classroomMembers.classroomId, classroomId));
  const memberIds = new Set(members.map((m) => m.studentId));

  for (const email of emails) {
    const account = accountByEmail.get(email);
    if (account) {
      if (account.isAdmin || account.role === 'teacher') {
        result.skipped.push({ email, reason: 'teacher' });
        continue;
      }
      if (memberIds.has(account.id)) {
        result.skipped.push({ email, reason: 'member' });
        continue;
      }
      await db
        .insert(classroomMembers)
        .values({ classroomId, studentId: account.id })
        .onConflictDoNothing();
      memberIds.add(account.id);
      // 혹시 남아 있던 대기 행은 지운다
      await db.delete(classroomInvites).where(and(eq(classroomInvites.classroomId, classroomId), eq(classroomInvites.email, email)));
      result.joined.push(email);
      continue;
    }

    const inserted = await db
      .insert(classroomInvites)
      .values({ classroomId, email, createdBy })
      .onConflictDoNothing({ target: [classroomInvites.classroomId, classroomInvites.email] })
      .returning({ id: classroomInvites.id });
    if (inserted.length > 0) result.invited.push(email);
    else result.skipped.push({ email, reason: 'invited' });
  }
  return result;
}

/** 대기 명단에서 한 줄 삭제(학급 소유 확인은 라우트에서). 없으면 false. */
export async function removeClassroomInvite(classroomId: string, inviteId: string): Promise<boolean> {
  const removed = await db
    .delete(classroomInvites)
    .where(and(eq(classroomInvites.id, inviteId), eq(classroomInvites.classroomId, classroomId)))
    .returning({ id: classroomInvites.id });
  return removed.length > 0;
}

/**
 * 학생이 로그인/가입할 때: 그 이메일로 사전 등록된 모든 학급에 구성원으로 넣고 대기 행을 지운다.
 * 돌려주는 값은 새로 들어간 학급 id 목록.
 */
export async function consumeClassroomInvites(studentId: string, email: string): Promise<string[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  return db.transaction(async (tx) => {
    const invites = await tx
      .select({ id: classroomInvites.id, classroomId: classroomInvites.classroomId })
      .from(classroomInvites)
      .where(eq(classroomInvites.email, normalized));
    if (invites.length === 0) return [];

    const joined: string[] = [];
    for (const invite of invites) {
      const inserted = await tx
        .insert(classroomMembers)
        .values({ classroomId: invite.classroomId, studentId })
        .onConflictDoNothing()
        .returning({ id: classroomMembers.id });
      if (inserted.length > 0) joined.push(invite.classroomId);
    }
    await tx.delete(classroomInvites).where(inArray(classroomInvites.id, invites.map((i) => i.id)));
    return joined;
  });
}
