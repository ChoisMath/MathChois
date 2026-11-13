import { sql } from 'drizzle-orm';
import { aiHubAbilities, type AiHubAbilities, type TokenPayload } from '@mathchois/shared';
import { db } from '../config/database.js';

/** 학생이 속한 학급 중 AI활용 허브가 켜진 학급 수 */
export async function countAllowedClassrooms(studentId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM classroom_members cm
    JOIN classrooms c ON c.id = cm.classroom_id
    WHERE cm.student_id = ${studentId} AND c.ai_hub_enabled
  `);
  return Number(rows[0]?.n ?? 0);
}

/** 토큰 사용자의 AI활용 허브 권한 (결정표는 shared aiHubAbilities) */
export async function abilitiesFor(user: TokenPayload): Promise<AiHubAbilities> {
  return aiHubAbilities({
    role: user.role ?? null,
    isAdmin: !!user.isAdmin,
    allowedClassroomCount: user.role === 'student' ? await countAllowedClassrooms(user.sub) : 0,
  });
}
