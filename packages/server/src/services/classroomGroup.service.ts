import { eq, inArray, asc } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { db } from '../config/database.js';
import { classroomGroups, classroomGroupMembers, classroomMembers } from '../db/schema.js';
import type { ClassroomGroup } from '@mathchois/shared';

export interface GroupInput {
  id?: string;
  name: string;
  position: number;
  studentIds: string[];
}

/** 학급 기본 모둠 목록 (position 순, 구성원 id 포함) */
export async function getClassroomGroups(classroomId: string): Promise<ClassroomGroup[]> {
  const groups = await db.select().from(classroomGroups)
    .where(eq(classroomGroups.classroomId, classroomId))
    .orderBy(asc(classroomGroups.position), asc(classroomGroups.createdAt));
  if (groups.length === 0) return [];

  const members = await db.select({ groupId: classroomGroupMembers.groupId, studentId: classroomGroupMembers.studentId })
    .from(classroomGroupMembers)
    .where(inArray(classroomGroupMembers.groupId, groups.map((g) => g.id)));

  const byGroup = new Map<string, string[]>();
  for (const m of members) {
    const arr = byGroup.get(m.groupId) ?? [];
    arr.push(m.studentId);
    byGroup.set(m.groupId, arr);
  }
  return groups.map((g) => ({
    id: g.id, classroomId: g.classroomId, name: g.name, position: g.position,
    studentIds: byGroup.get(g.id) ?? [],
  }));
}

/**
 * 모둠 전체 교체 (트랜잭션).
 * 전달된 id 는 update, id 없는 항목은 insert, 누락된 기존 id 는 delete.
 * 구성원은 전부 지우고 다시 넣되 학급 구성원이 아닌 학생은 걸러낸다. 한 학생은 한 모둠만(앞선 모둠 우선).
 */
export async function replaceClassroomGroups(classroomId: string, input: GroupInput[]): Promise<ClassroomGroup[]> {
  const memberRows = await db.select({ studentId: classroomMembers.studentId })
    .from(classroomMembers).where(eq(classroomMembers.classroomId, classroomId));
  const validStudents = new Set(memberRows.map((r) => r.studentId));

  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: classroomGroups.id }).from(classroomGroups)
      .where(eq(classroomGroups.classroomId, classroomId));
    const existingIds = new Set(existing.map((e) => e.id));
    const keepIds = new Set(input.map((g) => g.id).filter((id): id is string => !!id && existingIds.has(id)));

    const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
    if (toDelete.length > 0) {
      await tx.delete(classroomGroups).where(inArray(classroomGroups.id, toDelete));
    }

    // 구성원 전체 초기화
    await tx.delete(classroomGroupMembers).where(eq(classroomGroupMembers.classroomId, classroomId));

    const seen = new Set<string>();
    for (const g of input) {
      let groupId: string;
      if (g.id && keepIds.has(g.id)) {
        await tx.update(classroomGroups).set({ name: g.name, position: g.position })
          .where(eq(classroomGroups.id, g.id));
        groupId = g.id;
      } else {
        const [row] = await tx.insert(classroomGroups)
          .values({ classroomId, name: g.name, position: g.position }).returning({ id: classroomGroups.id });
        groupId = row.id;
      }
      const studentIds = g.studentIds.filter((sid) => validStudents.has(sid) && !seen.has(sid));
      studentIds.forEach((sid) => seen.add(sid));
      if (studentIds.length > 0) {
        await tx.insert(classroomGroupMembers)
          .values(studentIds.map((studentId) => ({ classroomId, groupId, studentId })));
      }
    }
  });

  return getClassroomGroups(classroomId);
}

/** 가입순 구성원을 셔플해 count 개 모둠으로 균등 배분 */
export async function autoDistributeClassroomGroups(classroomId: string, count: number): Promise<ClassroomGroup[]> {
  const rows = await db.select({ studentId: classroomMembers.studentId })
    .from(classroomMembers).where(eq(classroomMembers.classroomId, classroomId))
    .orderBy(asc(classroomMembers.joinedAt));
  const ids = rows.map((r) => r.studentId);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const groups: GroupInput[] = Array.from({ length: count }, (_, i) => ({
    name: `${i + 1}모둠`, position: i, studentIds: [],
  }));
  ids.forEach((sid, i) => groups[i % count].studentIds.push(sid));
  return replaceClassroomGroups(classroomId, groups);
}
