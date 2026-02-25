import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { chapters, pages } from '../db/schema.js';

/** 교실의 챕터 목록 (페이지 수 포함) */
export async function getChaptersByClassroom(classroomId: string) {
  const chapRows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.classroomId, classroomId))
    .orderBy(chapters.position);

  // 각 챕터의 페이지 목록 가져오기
  const result = await Promise.all(
    chapRows.map(async (ch) => {
      const pageRows = await db
        .select({ id: pages.id, position: pages.position })
        .from(pages)
        .where(eq(pages.chapterId, ch.id))
        .orderBy(pages.position);

      return {
        ...ch,
        pages: pageRows,
      };
    }),
  );

  return result;
}

/** 단일 챕터 조회 */
export async function getChapterById(id: string) {
  const rows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** 챕터 생성 */
export async function createChapter(data: {
  classroomId: string;
  title: string;
  description?: string | null;
  position?: number;
}) {
  // position 자동 계산: 기존 최대값 + 1
  let position = data.position;
  if (position === undefined) {
    const maxRows = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${chapters.position}), -1)` })
      .from(chapters)
      .where(eq(chapters.classroomId, data.classroomId));
    position = (maxRows[0]?.maxPos ?? -1) + 1;
  }

  const [created] = await db
    .insert(chapters)
    .values({
      classroomId: data.classroomId,
      title: data.title,
      description: data.description ?? null,
      position,
    })
    .returning();
  return created;
}

/** 챕터 수정 */
export async function updateChapter(id: string, data: {
  title?: string;
  description?: string | null;
}) {
  const [updated] = await db
    .update(chapters)
    .set(data)
    .where(eq(chapters.id, id))
    .returning();
  return updated ?? null;
}

/** 챕터 삭제 (CASCADE로 pages도 삭제됨) */
export async function deleteChapter(id: string) {
  await db.delete(chapters).where(eq(chapters.id, id));
}

/** 챕터 순서 일괄 업데이트 */
export async function reorderChapters(items: { id: string; position: number }[]) {
  await Promise.all(
    items.map(({ id, position }) =>
      db.update(chapters).set({ position }).where(eq(chapters.id, id)),
    ),
  );
}

/** 교실의 최대 챕터 position */
export async function getMaxChapterPosition(classroomId: string): Promise<number> {
  const rows = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${chapters.position}), -1)` })
    .from(chapters)
    .where(eq(chapters.classroomId, classroomId));
  return rows[0]?.maxPos ?? -1;
}

/** 챕터 소속 교실 확인 */
export async function getChapterClassroomId(chapterId: string): Promise<string | null> {
  const rows = await db
    .select({ classroomId: chapters.classroomId })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  return rows[0]?.classroomId ?? null;
}
