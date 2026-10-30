/**
 * PDF 페이지 브라우저 E2E 준비: 테스트 교사 1·학생 1 + 학급(학생 등록) + 빈 챕터 1 을 만들고
 * id 를 JSON 으로 출력한다. 스모크(`packages/client/e2e/pdf-pages.smoke.mjs`)가 이 챕터에 PDF 를 등록한다.
 *
 *   npx tsx --env-file=.env scripts/pdf-e2e-setup.ts > /tmp/pdf.json           # (packages/server 에서)
 *   npx tsx --env-file=.env scripts/pdf-e2e-setup.ts --cleanup <chapterId>
 *
 * --cleanup: 챕터 페이지들의 저장소 파일(imageUrl·pdfUrl, 중복 제거)과 빈 업로드 폴더 → 챕터 → 학급 순으로 삭제한다.
 * 사용자는 남긴다.
 */
import { eq } from 'drizzle-orm';
import { db, pgClient } from '../src/config/database.js';
import { profiles, classrooms, classroomMembers, chapters, pages } from '../src/db/schema.js';
import { hashPassword } from '../src/services/auth.service.js';
import { removeFile, removeDirectoryIfEmpty, urlToStoragePath, urlToParentDir } from '../src/services/storage.service.js';
import { collectFileUrls } from '../src/utils/fileUrls.js';

const PASSWORD = 'Test1234!';

async function ensureUser(email: string, name: string, role: 'teacher' | 'student') {
  const existing = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  if (existing[0]) {
    const [u] = await db.update(profiles)
      .set({ passwordHash: await hashPassword(PASSWORD), authMethod: 'email', role, mustResetPassword: false })
      .where(eq(profiles.id, existing[0].id)).returning();
    return u;
  }
  const [row] = await db.insert(profiles)
    .values({ email, name, role, authMethod: 'email', passwordHash: await hashPassword(PASSWORD), isAdmin: false })
    .returning();
  return row;
}

async function cleanup(chapterId: string) {
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  if (!chapter) {
    console.error(`chapter not found: ${chapterId}`);
    return;
  }
  const rows = await db.select({ imageUrl: pages.imageUrl, pdfUrl: pages.pdfUrl }).from(pages).where(eq(pages.chapterId, chapterId));
  const urls = collectFileUrls(rows);
  for (const url of urls) {
    const parsed = urlToStoragePath(url);
    if (parsed) await removeFile(parsed.bucket, parsed.path);
  }
  // 파일 부모 디렉터리 + 편집기 업로드 디렉터리(chapters/<id>) — 페이지를 이미 지운 뒤에도 빈 폴더가 남는다
  const dirs = new Map<string, { bucket: string; dir: string }>();
  for (const bucket of ['chapter-pages', 'chapter-pdfs']) dirs.set(`${bucket}/chapters/${chapterId}`, { bucket, dir: `chapters/${chapterId}` });
  for (const url of urls) {
    const d = urlToParentDir(url);
    if (d) dirs.set(`${d.bucket}/${d.dir}`, d);
  }
  for (const d of dirs.values()) await removeDirectoryIfEmpty(d.bucket, d.dir);
  await db.delete(chapters).where(eq(chapters.id, chapterId));
  await db.delete(classrooms).where(eq(classrooms.id, chapter.classroomId));
  console.log(JSON.stringify({ removedFiles: urls.length, chapterId, classroomId: chapter.classroomId }));
}

async function main() {
  if (process.argv[2] === '--cleanup') {
    if (!process.argv[3]) throw new Error('usage: --cleanup <chapterId>');
    await cleanup(process.argv[3]);
    await pgClient.end();
    return;
  }
  const teacher = await ensureUser('pdf.teacher@chois.test', 'PDF 테스트 교사', 'teacher');
  const student = await ensureUser('pdf.student@chois.test', 'PDF 테스트 학생', 'student');
  const stamp = Date.now();
  const [cls] = await db.insert(classrooms)
    .values({ name: `PDF E2E ${stamp}`, teacherId: teacher.id, classCode: `PDF${String(stamp).slice(-5)}` })
    .returning();
  await db.insert(classroomMembers).values({ classroomId: cls.id, studentId: student.id }).onConflictDoNothing();
  const [chapter] = await db.insert(chapters).values({ classroomId: cls.id, title: `PDF E2E ${stamp}`, position: 0 }).returning();

  console.log(JSON.stringify({
    classroomId: cls.id, chapterId: chapter.id,
    teacher: { id: teacher.id, email: teacher.email }, student: { id: student.id, email: student.email }, password: PASSWORD,
  }));
  await pgClient.end();
}

main().catch(async (err) => { console.error(err); await pgClient.end(); process.exit(1); });
