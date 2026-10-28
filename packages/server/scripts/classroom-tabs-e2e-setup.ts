/**
 * 학급 상세 탭(게시판 표·모둠 보드·학생 표·대시보드) 브라우저 E2E 준비 — units-e2e-setup.ts 가 만든 학급 TEST0001 위에
 * 학생 3명, 챕터마다 페이지 4장, 필기·AI 풀이·시청 기록, 게시글 3개(첨부 2·1·0)를 올린다. 여러 번 실행해도 된다.
 *
 *   cd packages/server
 *   npx tsx --env-file=.env scripts/units-e2e-setup.ts > "$SCRATCH/units.json"
 *   npx tsx --env-file=.env scripts/classroom-tabs-e2e-setup.ts "$SCRATCH/units.json" > "$SCRATCH/tabs.json"
 */
import { readFileSync } from 'node:fs';
import { eq, inArray, like } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import {
  profiles, classroomMembers, pages, chapters, studentNotes, coachingAttempts, videos, videoProgress,
  posts, postFiles, postClassrooms, problems,
} from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';

const u = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const cid = u.classroomId as string;
const PW = 'Test1234!';

async function student(email: string, name: string) {
  const [ex] = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  const row = ex ?? (await db.insert(profiles).values({ email, name, role: 'student', authMethod: 'email', passwordHash: await hashPassword(PW), isAdmin: false }).returning())[0];
  await db.insert(classroomMembers).values({ classroomId: cid, studentId: row.id }).onConflictDoNothing();
  return row;
}
const s1 = (await db.select().from(profiles).where(eq(profiles.email, u.student.email)).limit(1))[0];
const s2 = await student('dash.s2@chois.test', '이서연');
const s3 = await student('dash.s3@chois.test', '박지호');
const s4 = await student('dash.s4@chois.test', '최하늘');
const students = [s1, s2, s3, s4];

// 챕터마다 페이지를 4장으로
const chIds = Object.values(u.chapters) as string[];
for (const chId of chIds) {
  const have = await db.select({ id: pages.id }).from(pages).where(eq(pages.chapterId, chId));
  for (let i = have.length; i < 4; i++) await db.insert(pages).values({ chapterId: chId, position: i });
}
const allPages = await db.select({ id: pages.id, chapterId: pages.chapterId }).from(pages).where(inArray(pages.chapterId, chIds));

// AI 코칭 페이지: 문제 1개를 만들어 챕터마다 앞 2장에 붙인다(시도는 이런 페이지에서만 생긴다)
let [prob] = await db.select({ id: problems.id }).from(problems).where(eq(problems.title, 'DASH E2E 문제')).limit(1);
if (!prob) [prob] = await db.insert(problems).values({ createdBy: u.teacher.id, title: 'DASH E2E 문제', problemLatex: 'x+1=2' }).returning({ id: problems.id });
const aiPageIds: string[] = [];
for (const chId of chIds) {
  const [a, b] = allPages.filter((p) => p.chapterId === chId);
  for (const p of [a, b]) if (p) aiPageIds.push(p.id);
}
await db.update(pages).set({ aiProblemId: null }).where(inArray(pages.id, allPages.map((p) => p.id)));
await db.update(pages).set({ aiProblemId: prob.id }).where(inArray(pages.id, aiPageIds));
const aiPages = new Set(aiPageIds);

// 필기·AI 풀이: 학생마다 다른 양
await db.delete(studentNotes).where(inArray(studentNotes.pageId, allPages.map((p) => p.id)));
await db.delete(coachingAttempts).where(inArray(coachingAttempts.pageId, allPages.map((p) => p.id)));
const noteRows: any[] = []; const attRows: any[] = [];
students.forEach((s, si) => {
  allPages.forEach((p, pi) => {
    if (pi % (si + 1) === 0) noteRows.push({ studentId: s.id, pageId: p.id, excalidrawData: { elements: [], appState: {} } });
    if (aiPages.has(p.id) && pi % 3 === si % 3) {
      attRows.push({ studentId: s.id, pageId: p.id, isCorrect: (pi + si) % 2 === 0 });
      attRows.push({ studentId: s.id, pageId: p.id, isCorrect: si === 0 });
    }
  });
});
if (noteRows.length) await db.insert(studentNotes).values(noteRows);
if (attRows.length) await db.insert(coachingAttempts).values(attRows);

// 영상 길이 300초, 시청 기록
await db.update(videos).set({ durationSec: 300 }).where(eq(videos.id, u.videoId));
await db.delete(videoProgress).where(eq(videoProgress.classroomVideoId, u.classroomVideoId));
await db.insert(videoProgress).values([
  { classroomVideoId: u.classroomVideoId, studentId: s1.id, positionSec: 290, maxPositionSec: 295, completed: true },
  { classroomVideoId: u.classroomVideoId, studentId: s2.id, positionSec: 120, maxPositionSec: 150, completed: false },
  { classroomVideoId: u.classroomVideoId, studentId: s3.id, positionSec: 10, maxPositionSec: 30, completed: false },
]);

// 게시글 3개(첨부 2·1·0)
const old = await db.select({ id: posts.id }).from(posts).where(like(posts.title, 'DASH E2E %'));
if (old.length) await db.delete(posts).where(inArray(posts.id, old.map((p) => p.id)));
const mk = async (title: string, content: string, files: number, daysAgo: number) => {
  const [p] = await db.insert(posts).values({ teacherId: u.teacher.id, title, content, createdAt: new Date(Date.now() - daysAgo * 86400000) }).returning();
  await db.insert(postClassrooms).values({ postId: p.id, classroomId: cid });
  for (let i = 0; i < files; i++) await db.insert(postFiles).values({ postId: p.id, fileName: `자료${i + 1}.pdf`, fileUrl: `/api/files/post-files/none-${i}.pdf`, fileSize: 1200 * (i + 1) * 1024 });
};
await mk('DASH E2E 중간고사 범위 안내', '다항식 1단원 전체입니다. 참고: https://class.chois.pro', 2, 1);
await mk('DASH E2E 수행평가 일정', '다음 주 화요일 3교시', 1, 5);
await mk('DASH E2E 학습 안내 — 긴 제목이 표에서 어떻게 줄어드는지 확인하기 위한 아주 긴 게시글 제목입니다', '', 0, 12);

console.log(JSON.stringify({ students: students.map((s) => ({ id: s.id, name: s.name, email: s.email })), pages: allPages.length, aiPages: aiPageIds.length }));
await pgClient.end();
