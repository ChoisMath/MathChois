#!/usr/bin/env node
/*
 * 교사 필기(teacher_notes.excalidraw_data)를 DB 에서 읽어 JSON 파일로 저장한다 (읽기 전용 SELECT 하나).
 * freedraw-precision-check.mjs 의 입력을 psql 없이 만들기 위한 스크립트.
 *
 * 사용법 (저장소 루트에서):
 *   DATABASE_PUBLIC_URL='postgresql://…' node packages/client/scripts/freedraw-precision-export.mjs [챕터 제목 일부] [출력 파일]
 *   기본값: 챕터 제목 'AA20_0', 출력 notes.json
 *
 * 접속 URL 은 Railway Postgres 서비스의 DATABASE_PUBLIC_URL (또는 DATABASE_URL 중 외부 접속 가능한 것).
 * 출력 파일은 필기 데이터이므로 커밋하지 말 것.
 */
import fs from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_PUBLIC_URL 환경 변수가 비어 있습니다. 예) DATABASE_PUBLIC_URL=\'postgresql://…\' node packages/client/scripts/freedraw-precision-export.mjs');
  process.exit(1);
}
const titlePart = process.argv[2] || 'AA20_0';
const outFile = process.argv[3] || 'notes.json';
const sslMode = process.env.PGSSL === 'off' ? false : process.env.PGSSL === 'insecure' ? { rejectUnauthorized: false } : 'require';

const sql = postgres(url, { ssl: sslMode, max: 1, connect_timeout: 15 });
try {
  const rows = await sql`
    select c.title as chapter, p.position as page_position, n.updated_at, n.excalidraw_data
    from teacher_notes n
    join pages p on p.id = n.page_id
    join chapters c on c.id = p.chapter_id
    where c.title like ${'%' + titlePart + '%'}
    order by p.position`;
  fs.writeFileSync(outFile, JSON.stringify(rows));
  for (const r of rows) {
    const els = r.excalidraw_data?.elements || [];
    console.log(`${r.chapter} / 페이지 ${r.page_position + 1} / 저장 ${new Date(r.updated_at).toLocaleString()} / 요소 ${els.length}개 (freedraw ${els.filter((e) => e.type === 'freedraw').length}개)`);
  }
  console.log(`${rows.length}개 페이지 → ${outFile}`);
  if (rows.length === 0) console.log(`챕터 제목에 '${titlePart}' 가 들어가는 교사 필기가 없습니다. 제목 일부를 첫 인자로 바꿔 보세요.`);
} finally {
  await sql.end();
}
