import { eq, and, inArray, asc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  whiteboardGroups, whiteboardGroupMembers, whiteboardPageSettings,
  classroomGroups, classroomGroupMembers, classroomMembers, profiles, pages,
} from '../db/schema.js';
import { countLiveElements } from '@mathchois/shared';
import type {
  TokenPayload, WhiteboardGroup, WhiteboardMember, WhiteboardPageSettings, WhiteboardPageView, WhiteboardSceneData,
} from '@mathchois/shared';
import { isClassroomMember } from './classroom.service.js';
import { canTeacherAccessPageClassroom, isPageSourceOwnedBy } from './pageAccess.service.js';

export const EMPTY_SCENE: WhiteboardSceneData = { elements: [], files: {} };

export interface PageGroupInput {
  id?: string;
  name: string;
  position: number;
  studentIds: string[];
}

/* ─── 설정 ─── */

async function getSettings(pageId: string, classroomId: string): Promise<WhiteboardPageSettings> {
  const rows = await db.select().from(whiteboardPageSettings)
    .where(and(eq(whiteboardPageSettings.pageId, pageId), eq(whiteboardPageSettings.classroomId, classroomId)))
    .limit(1);
  return rows[0]
    ? { allowCrossGroupView: rows[0].allowCrossGroupView, lockedAll: rows[0].lockedAll }
    : { allowCrossGroupView: false, lockedAll: false };
}

/**
 * (페이지, 학급) 보드 지연 생성.
 * settings 행이 없으면 만들고, 보드가 0개면 학급 기본 모둠을 복사한다.
 * 학급 기본 모둠이 없으면 "1모둠" 에 학급 구성원 전원을 넣는다.
 */
export async function ensurePageBoards(pageId: string, classroomId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(whiteboardPageSettings)
      .values({ pageId, classroomId })
      .onConflictDoNothing();

    const existing = await tx.select({ id: whiteboardGroups.id }).from(whiteboardGroups)
      .where(and(eq(whiteboardGroups.pageId, pageId), eq(whiteboardGroups.classroomId, classroomId)))
      .limit(1);
    if (existing.length > 0) return;

    const base = await tx.select().from(classroomGroups)
      .where(eq(classroomGroups.classroomId, classroomId))
      .orderBy(asc(classroomGroups.position), asc(classroomGroups.createdAt));

    let groupsToCreate: { name: string; position: number; studentIds: string[] }[];
    if (base.length > 0) {
      const members = await tx.select({ groupId: classroomGroupMembers.groupId, studentId: classroomGroupMembers.studentId })
        .from(classroomGroupMembers)
        .where(inArray(classroomGroupMembers.groupId, base.map((g) => g.id)));
      groupsToCreate = base.map((g) => ({
        name: g.name, position: g.position,
        studentIds: members.filter((m) => m.groupId === g.id).map((m) => m.studentId),
      }));
    } else {
      const all = await tx.select({ studentId: classroomMembers.studentId }).from(classroomMembers)
        .where(eq(classroomMembers.classroomId, classroomId));
      groupsToCreate = [{ name: '1모둠', position: 0, studentIds: all.map((m) => m.studentId) }];
    }

    for (const g of groupsToCreate) {
      const [row] = await tx.insert(whiteboardGroups)
        .values({ pageId, classroomId, name: g.name, position: g.position, excalidrawData: EMPTY_SCENE })
        .returning({ id: whiteboardGroups.id });
      if (g.studentIds.length > 0) {
        await tx.insert(whiteboardGroupMembers)
          .values(g.studentIds.map((studentId) => ({ groupId: row.id, studentId })));
      }
    }
  });
}

/* ─── 조회 ─── */

async function loadGroups(pageId: string, classroomId: string): Promise<WhiteboardGroup[]> {
  const rows = await db.select({
    id: whiteboardGroups.id, pageId: whiteboardGroups.pageId, classroomId: whiteboardGroups.classroomId,
    name: whiteboardGroups.name, position: whiteboardGroups.position, locked: whiteboardGroups.locked,
    backgroundColor: whiteboardGroups.backgroundColor, sceneVersion: whiteboardGroups.sceneVersion,
    updatedAt: whiteboardGroups.updatedAt, excalidrawData: whiteboardGroups.excalidrawData,
    hasPrevious: sql<boolean>`(${whiteboardGroups.prevExcalidrawData} IS NOT NULL)`,
  }).from(whiteboardGroups)
    .where(and(eq(whiteboardGroups.pageId, pageId), eq(whiteboardGroups.classroomId, classroomId)))
    .orderBy(asc(whiteboardGroups.position), asc(whiteboardGroups.name));
  if (rows.length === 0) return [];

  const members = await db.select({
    groupId: whiteboardGroupMembers.groupId, studentId: whiteboardGroupMembers.studentId,
    name: profiles.name, avatarUrl: profiles.avatarUrl,
  }).from(whiteboardGroupMembers)
    .innerJoin(profiles, eq(whiteboardGroupMembers.studentId, profiles.id))
    .where(inArray(whiteboardGroupMembers.groupId, rows.map((r) => r.id)));

  return rows.map((r) => ({
    id: r.id, pageId: r.pageId, classroomId: r.classroomId, name: r.name, position: r.position,
    locked: r.locked, backgroundColor: r.backgroundColor, sceneVersion: r.sceneVersion,
    elementCount: countLiveElements((r.excalidrawData?.elements ?? []) as any),
    hasPrevious: !!r.hasPrevious,
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    members: members.filter((m) => m.groupId === r.id)
      .map((m) => ({ studentId: m.studentId, name: m.name ?? '', avatarUrl: m.avatarUrl ?? null })),
  }));
}

export async function getPageView(pageId: string, classroomId: string, viewer: TokenPayload): Promise<WhiteboardPageView> {
  const [settings, groups, pageRow] = await Promise.all([
    getSettings(pageId, classroomId),
    loadGroups(pageId, classroomId),
    db.select({ whiteboardTemplate: pages.whiteboardTemplate }).from(pages).where(eq(pages.id, pageId)).limit(1),
  ]);

  let myGroupId: string | null = null;
  let unassigned: WhiteboardMember[] = [];
  let isSourceChapter = false;

  if (viewer.role === 'student') {
    myGroupId = groups.find((g) => g.members.some((m) => m.studentId === viewer.sub))?.id ?? null;
  } else if (viewer.role === 'teacher') {
    isSourceChapter = await isPageSourceOwnedBy(viewer.sub, pageId);
    const assigned = new Set(groups.flatMap((g) => g.members.map((m) => m.studentId)));
    const all = await db.select({ studentId: classroomMembers.studentId, name: profiles.name, avatarUrl: profiles.avatarUrl })
      .from(classroomMembers)
      .innerJoin(profiles, eq(classroomMembers.studentId, profiles.id))
      .where(eq(classroomMembers.classroomId, classroomId));
    unassigned = all.filter((m) => !assigned.has(m.studentId))
      .map((m) => ({ studentId: m.studentId, name: m.name ?? '', avatarUrl: m.avatarUrl ?? null }));
  }

  return {
    pageId, classroomId,
    templateKey: pageRow[0]?.whiteboardTemplate ?? null,
    isSourceChapter, settings, groups, myGroupId, unassigned,
  };
}

/* ─── 배정 / 설정 ─── */

/** 페이지별 모둠 교체. 유지된 id 의 보드 내용은 보존, 제거된 모둠의 보드는 삭제. 삭제된 보드 id 를 반환. */
export async function replacePageGroups(pageId: string, classroomId: string, input: PageGroupInput[]): Promise<string[]> {
  const memberRows = await db.select({ studentId: classroomMembers.studentId })
    .from(classroomMembers).where(eq(classroomMembers.classroomId, classroomId));
  const valid = new Set(memberRows.map((r) => r.studentId));

  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: whiteboardGroups.id }).from(whiteboardGroups)
      .where(and(eq(whiteboardGroups.pageId, pageId), eq(whiteboardGroups.classroomId, classroomId)));
    const existingIds = new Set(existing.map((e) => e.id));
    const keepIds = new Set(input.map((g) => g.id).filter((id): id is string => !!id && existingIds.has(id)));
    const removed = [...existingIds].filter((id) => !keepIds.has(id));
    if (removed.length > 0) {
      await tx.delete(whiteboardGroups).where(inArray(whiteboardGroups.id, removed));
    }
    if (keepIds.size > 0) {
      await tx.delete(whiteboardGroupMembers).where(inArray(whiteboardGroupMembers.groupId, [...keepIds]));
    }

    const seen = new Set<string>();
    for (const g of input) {
      let groupId: string;
      if (g.id && keepIds.has(g.id)) {
        await tx.update(whiteboardGroups).set({ name: g.name, position: g.position })
          .where(eq(whiteboardGroups.id, g.id));
        groupId = g.id;
      } else {
        const [row] = await tx.insert(whiteboardGroups)
          .values({ pageId, classroomId, name: g.name, position: g.position, excalidrawData: EMPTY_SCENE })
          .returning({ id: whiteboardGroups.id });
        groupId = row.id;
      }
      const studentIds = g.studentIds.filter((sid) => valid.has(sid) && !seen.has(sid));
      studentIds.forEach((sid) => seen.add(sid));
      if (studentIds.length > 0) {
        await tx.insert(whiteboardGroupMembers).values(studentIds.map((studentId) => ({ groupId, studentId })));
      }
    }
    return removed;
  });
}

export async function updatePageSettings(
  pageId: string, classroomId: string, patch: Partial<WhiteboardPageSettings>,
): Promise<WhiteboardPageSettings> {
  await db.insert(whiteboardPageSettings).values({ pageId, classroomId, ...patch })
    .onConflictDoUpdate({
      target: [whiteboardPageSettings.pageId, whiteboardPageSettings.classroomId],
      set: patch,
    });
  return getSettings(pageId, classroomId);
}

export async function updateGroup(
  groupId: string, patch: { name?: string; locked?: boolean; backgroundColor?: string },
) {
  const [row] = await db.update(whiteboardGroups).set(patch).where(eq(whiteboardGroups.id, groupId)).returning();
  return row ?? null;
}

/* ─── 장면 ─── */

export interface BoardRow {
  id: string; pageId: string; classroomId: string; name: string; locked: boolean;
  backgroundColor: string; sceneVersion: number;
  scene: WhiteboardSceneData; hasPrevious: boolean;
}

export async function getBoardRow(groupId: string): Promise<BoardRow | null> {
  const rows = await db.select().from(whiteboardGroups).where(eq(whiteboardGroups.id, groupId)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, pageId: r.pageId, classroomId: r.classroomId, name: r.name, locked: r.locked,
    backgroundColor: r.backgroundColor, sceneVersion: r.sceneVersion,
    scene: normalizeScene(r.excalidrawData), hasPrevious: r.prevExcalidrawData != null,
  };
}

function normalizeScene(data: WhiteboardSceneData | null | undefined): WhiteboardSceneData {
  return {
    elements: Array.isArray(data?.elements) ? data!.elements : [],
    files: data?.files && typeof data.files === 'object' ? data.files : {},
  };
}

/**
 * 장면 저장. 직전본(prev)은 마지막 저장이 30초 이전일 때만 현재본으로 갱신한다
 * (연속 저장 중에 "직전" 이 너무 잘게 쪼개지지 않도록).
 */
export async function saveBoardScene(groupId: string, scene: WhiteboardSceneData, sceneVersion: number): Promise<void> {
  await db.update(whiteboardGroups).set({
    prevExcalidrawData: sql`CASE WHEN ${whiteboardGroups.updatedAt} < now() - interval '30 seconds' THEN ${whiteboardGroups.excalidrawData} ELSE ${whiteboardGroups.prevExcalidrawData} END`,
    excalidrawData: scene,
    sceneVersion,
    updatedAt: sql`now()`,
  }).where(eq(whiteboardGroups.id, groupId));
}

/** 비우기 — 현재본을 prev 로 보관 */
export async function resetBoard(groupId: string): Promise<BoardRow | null> {
  await db.update(whiteboardGroups).set({
    prevExcalidrawData: sql`${whiteboardGroups.excalidrawData}`,
    excalidrawData: EMPTY_SCENE,
    sceneVersion: sql`${whiteboardGroups.sceneVersion} + 1`,
    updatedAt: sql`now()`,
  }).where(eq(whiteboardGroups.id, groupId));
  return getBoardRow(groupId);
}

/** 직전본 ↔ 현재본 교체 */
export async function restorePrevious(groupId: string): Promise<BoardRow | null> {
  await db.update(whiteboardGroups).set({
    excalidrawData: sql`${whiteboardGroups.prevExcalidrawData}`,
    prevExcalidrawData: sql`${whiteboardGroups.excalidrawData}`,
    sceneVersion: sql`${whiteboardGroups.sceneVersion} + 1`,
    updatedAt: sql`now()`,
  }).where(and(eq(whiteboardGroups.id, groupId), sql`${whiteboardGroups.prevExcalidrawData} IS NOT NULL`));
  return getBoardRow(groupId);
}

/* ─── 권한 ─── */

export interface BoardAccess {
  boardId: string;
  pageId: string;
  classroomId: string;
  canRead: boolean;
  canWrite: boolean;
  locked: boolean;
  lockedAll: boolean;
  allowCrossGroupView: boolean;
  isTeacher: boolean;
}

export async function getBoardAccess(groupId: string, user: TokenPayload): Promise<BoardAccess | null> {
  const row = await getBoardRow(groupId);
  if (!row) return null;
  const settings = await getSettings(row.pageId, row.classroomId);
  const base = {
    boardId: row.id, pageId: row.pageId, classroomId: row.classroomId,
    locked: row.locked, lockedAll: settings.lockedAll, allowCrossGroupView: settings.allowCrossGroupView,
  };

  if (user.role === 'teacher') {
    const ok = await canTeacherAccessPageClassroom(user.sub, row.pageId, row.classroomId);
    return { ...base, canRead: ok, canWrite: ok, isTeacher: true };
  }
  if (user.role === 'student') {
    const member = await db.select({ id: whiteboardGroupMembers.id }).from(whiteboardGroupMembers)
      .where(and(eq(whiteboardGroupMembers.groupId, groupId), eq(whiteboardGroupMembers.studentId, user.sub)))
      .limit(1);
    if (member.length > 0) {
      const writable = !row.locked && !settings.lockedAll;
      return { ...base, canRead: true, canWrite: writable, isTeacher: false };
    }
    if (settings.allowCrossGroupView && await isClassroomMember(row.classroomId, user.sub)) {
      return { ...base, canRead: true, canWrite: false, isTeacher: false };
    }
  }
  return { ...base, canRead: false, canWrite: false, isTeacher: false };
}

/** 페이지×학급의 보드 id 목록 (전체 잠금 브로드캐스트용) */
export async function getBoardIdsForPage(pageId: string, classroomId: string): Promise<string[]> {
  const rows = await db.select({ id: whiteboardGroups.id }).from(whiteboardGroups)
    .where(and(eq(whiteboardGroups.pageId, pageId), eq(whiteboardGroups.classroomId, classroomId)));
  return rows.map((r) => r.id);
}

export async function getProfileName(userId: string): Promise<string> {
  const rows = await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, userId)).limit(1);
  return rows[0]?.name ?? '';
}
