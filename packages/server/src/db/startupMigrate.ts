import type { FastifyBaseLogger } from 'fastify';
import { pgClient } from '../config/database.js';

/**
 * 배포 환경(Railway)은 내부 전용 DATABASE_URL 이라 로컬에서 drizzle-kit push 가 불가능하다.
 * 컨테이너 부팅 시점에 멱등 DDL 로 누락 컬럼을 보강해, 새 코드의 SELECT(html_url 포함)가
 * 깨지지 않도록 한다. 모든 문장은 IF NOT EXISTS 로 재실행 안전.
 */
export async function runStartupMigrations(log: FastifyBaseLogger): Promise<void> {
  await pgClient`ALTER TABLE pages ADD COLUMN IF NOT EXISTS html_url text`;
  log.info('startup migration: pages.html_url ensured');

  await pgClient`
    CREATE TABLE IF NOT EXISTS problems (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text,
      problem_latex text NOT NULL,
      figure_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
      original_image_url text,
      figures jsonb NOT NULL DEFAULT '[]'::jsonb,
      subject text, major_unit text, minor_unit text,
      difficulty text, problem_type text, detail_type text,
      keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
      answer text, solution text, solution_source text, markscheme_image_url text,
      ai_model text,
      status text NOT NULL DEFAULT 'ready',
      created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_created_at ON problems (created_at)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_subject ON problems (subject)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_major_unit ON problems (major_unit)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems (difficulty)`;
  await pgClient`CREATE INDEX IF NOT EXISTS idx_problems_created_by ON problems (created_by)`;
  log.info('startup migration: problems table ensured');
}
