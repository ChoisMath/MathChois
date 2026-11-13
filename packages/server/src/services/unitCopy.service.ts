/**
 * 단원 통째 복사 — 원본 학급의 단원(챕터·영상 배정·필기 챕터 연결)을 대상 학급에 넣는다.
 * 무엇을 만들고/옮기고/합칠지는 shared `planUnitCopy` 가 정하고, 여기서는 대상 학급마다 트랜잭션 하나로 실행한다.
 * 스펙: docs/superpowers/specs/2026-10-28-unit-transfer-design.md
 */
import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import { planUnitCopy, titleKey, type CopySourceUnit, type UnitCopyCounts } from '@mathchois/shared';
import { db } from '../config/database.js';
import { units, chapters, classroomVideos } from '../db/schema.js';
import type { Tx } from './chapter.service.js';

/**
 * 원본 단원을 읽는다(단원 position 순, 각 단원의 챕터·배정 position 순, 배정의 필기 챕터 이름 포함).
 * 하나라도 없으면 404, 여러 학급의 단원이 섞이면 400.
 */
export async function loadCopySources(unitIds: string[]): Promise<
  { classroomId: string; sources: CopySourceUnit[] } | { error: 404 | 400 }
> {
  const unitRows = await db
    .select({ id: units.id, classroomId: units.classroomId, title: units.title, description: units.description, isHidden: units.isHidden })
    .from(units)
    .where(inArray(units.id, unitIds))
    .orderBy(asc(units.position), asc(units.createdAt));
  if (unitRows.length !== unitIds.length) return { error: 404 };
  const classroomIds = new Set(unitRows.map((u) => u.classroomId));
  if (classroomIds.size !== 1) return { error: 400 };

  const chapterRows = await db
    .select({ id: chapters.id, title: chapters.title, description: chapters.description, sourceChapterId: chapters.sourceChapterId, unitId: chapters.unitId })
    .from(chapters)
    .where(inArray(chapters.unitId, unitIds))
    .orderBy(asc(chapters.position), asc(chapters.createdAt));
  const videoRows = await db
    .select({ videoId: classroomVideos.videoId, note: classroomVideos.note, unitId: classroomVideos.unitId, chapterTitle: chapters.title })
    .from(classroomVideos)
    .leftJoin(chapters, eq(classroomVideos.chapterId, chapters.id))
    .where(inArray(classroomVideos.unitId, unitIds))
    .orderBy(asc(classroomVideos.position), asc(classroomVideos.createdAt));

  const sources = unitRows.map((u): CopySourceUnit => ({
    id: u.id,
    title: u.title,
    description: u.description,
    isHidden: u.isHidden,
    chapters: chapterRows.filter((c) => c.unitId === u.id)
      .map(({ id, title, description, sourceChapterId }) => ({ id, title, description, sourceChapterId })),
    videos: videoRows.filter((v) => v.unitId === u.id)
      .map(({ videoId, note, chapterTitle }) => ({ videoId, note, chapterTitle: chapterTitle ?? null })),
  }));
  return { classroomId: unitRows[0].classroomId, sources };
}

/** 대상 학급 하나에 복사한다. 실패하면 이 학급의 변경은 모두 되돌아간다. */
export async function copyUnitsToClassroom(
  sources: CopySourceUnit[],
  targetClassroomId: string,
  addedBy: string,
): Promise<UnitCopyCounts> {
  return db.transaction(async (tx) => {
    // 챕터 가져오기(createChapterUnlessTitleTaken)와 같은 키 — 같은 학급의 같은 이름 챕터가 동시에 생기지 않게
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`chapter-title:${targetClassroomId}`}))`);

    const plan = planUnitCopy(sources, {
      units: await tx.select({ id: units.id, title: units.title }).from(units)
        .where(eq(units.classroomId, targetClassroomId)).orderBy(asc(units.position), asc(units.createdAt)),
      chapters: await tx.select({ id: chapters.id, title: chapters.title }).from(chapters)
        .where(eq(chapters.classroomId, targetClassroomId)).orderBy(asc(chapters.position)),
      videos: await tx.select({ id: classroomVideos.id, videoId: classroomVideos.videoId, note: classroomVideos.note, chapterId: classroomVideos.chapterId })
        .from(classroomVideos).where(eq(classroomVideos.classroomId, targetClassroomId)),
    });

    // 단원: 합칠 단원은 그대로, 새 단원은 맨 뒤에 원본 순서대로
    const unitIds = await resolveUnitIds(tx, targetClassroomId, plan.units);

    for (const m of plan.movedChapters) {
      await tx.update(chapters).set({ unitId: unitIds[m.unitIndex] }).where(eq(chapters.id, m.chapterId));
    }
    if (plan.newChapters.length > 0) {
      // 새 챕터는 맨 앞(0..n-1)에 원본 순서대로, 기존 챕터는 n 칸 뒤로
      await tx.update(chapters)
        .set({ position: sql`${chapters.position} + ${plan.newChapters.length}` })
        .where(eq(chapters.classroomId, targetClassroomId));
      await tx.insert(chapters).values(plan.newChapters.map((c, i) => ({
        classroomId: targetClassroomId,
        title: c.title,
        description: c.description,
        position: i,
        sourceChapterId: c.sourceChapterId,
        unitId: unitIds[c.unitIndex],
      })));
    }

    if (plan.newVideos.length > 0) {
      await tx.update(classroomVideos)
        .set({ position: sql`${classroomVideos.position} + ${plan.newVideos.length}` })
        .where(eq(classroomVideos.classroomId, targetClassroomId));
      await tx.insert(classroomVideos).values(plan.newVideos.map((v, i) => ({
        classroomId: targetClassroomId,
        videoId: v.videoId,
        addedBy,
        note: v.note,
        unitId: unitIds[v.unitIndex],
        position: i,
      })));
    }
    for (const mv of plan.movedVideos) {
      await tx.update(classroomVideos)
        .set({ unitId: unitIds[mv.unitIndex], ...(mv.fillNote != null ? { note: mv.fillNote } : {}) })
        .where(eq(classroomVideos.id, mv.classroomVideoId));
    }

    // 필기 챕터 연결: 대상 학급(이번에 만든 챕터 포함)의 같은 이름 챕터로 잇는다. 못 찾으면 연결 없음(계획이 이미 셌다).
    const chapterIdByKey = new Map<string, string>();
    const targetChapters = await tx.select({ id: chapters.id, title: chapters.title }).from(chapters)
      .where(eq(chapters.classroomId, targetClassroomId)).orderBy(asc(chapters.position));
    for (const c of targetChapters) {
      const key = titleKey(c.title);
      if (!chapterIdByKey.has(key)) chapterIdByKey.set(key, c.id);
    }
    for (const v of plan.newVideos) {
      const chapterId = v.chapterTitle ? chapterIdByKey.get(titleKey(v.chapterTitle)) : undefined;
      if (!chapterId) continue;
      await tx.update(classroomVideos).set({ chapterId })
        .where(and(eq(classroomVideos.classroomId, targetClassroomId), eq(classroomVideos.videoId, v.videoId)));
    }
    for (const mv of plan.movedVideos) {
      const chapterId = mv.linkChapterTitle ? chapterIdByKey.get(titleKey(mv.linkChapterTitle)) : undefined;
      if (!chapterId) continue;
      await tx.update(classroomVideos).set({ chapterId }).where(eq(classroomVideos.id, mv.classroomVideoId));
    }

    return plan.counts;
  });
}

/** 계획의 단원 목록 → 대상 학급 단원 id(합칠 단원은 기존 id, 새 단원은 맨 뒤에 만들어서) */
async function resolveUnitIds(
  tx: Tx,
  classroomId: string,
  planned: { existingUnitId: string | null; title: string; description: string | null; isHidden: boolean }[],
): Promise<string[]> {
  const [{ maxPosition }] = await tx
    .select({ maxPosition: sql<number>`COALESCE(MAX(${units.position}), -1)` })
    .from(units)
    .where(eq(units.classroomId, classroomId));
  let next = Number(maxPosition) + 1;
  const ids: string[] = [];
  for (const u of planned) {
    if (u.existingUnitId) {
      ids.push(u.existingUnitId);
      continue;
    }
    const [created] = await tx.insert(units)
      .values({ classroomId, title: u.title, description: u.description, isHidden: u.isHidden, position: next++ })
      .returning({ id: units.id });
    ids.push(created.id);
  }
  return ids;
}
