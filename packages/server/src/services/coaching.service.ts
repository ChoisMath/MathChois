import { eq, and, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { coachingAttempts } from '../db/schema.js';

export type CoachingAttemptInsert = typeof coachingAttempts.$inferInsert;

export async function createAttempt(values: CoachingAttemptInsert) {
  const [row] = await db.insert(coachingAttempts).values(values).returning();
  return row;
}

export async function listAttempts(pageId: string, studentId: string) {
  return db
    .select()
    .from(coachingAttempts)
    .where(and(eq(coachingAttempts.pageId, pageId), eq(coachingAttempts.studentId, studentId)))
    .orderBy(desc(coachingAttempts.createdAt));
}
