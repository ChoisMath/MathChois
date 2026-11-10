import { sql } from 'drizzle-orm';
import { canUseIbGuide, type TokenPayload } from '@mathchois/shared';
import { db } from '../config/database.js';

/** 학생이 속한 학급 중 IB교육과정 안내가 켜진 학급 수 */
export async function countIbGuideClassrooms(studentId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM classroom_members cm
    JOIN classrooms c ON c.id = cm.classroom_id
    WHERE cm.student_id = ${studentId} AND c.ib_guide_enabled
  `);
  return Number(rows[0]?.n ?? 0);
}

/** 토큰 사용자의 IB교육과정 안내 권한 (결정표는 shared canUseIbGuide). 요청마다 DB 에서 다시 센다. */
export async function ibGuideAccessFor(user: TokenPayload): Promise<{ allowed: boolean }> {
  return {
    allowed: canUseIbGuide({
      role: user.role ?? null,
      isAdmin: !!user.isAdmin,
      allowedClassroomCount: user.role === 'student' ? await countIbGuideClassrooms(user.sub) : 0,
    }),
  };
}
