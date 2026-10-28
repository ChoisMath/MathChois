import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  // Railway Volume 을 쓰면 RAILWAY_VOLUME_MOUNT_PATH 가 자동 주입된다 — VOLUME_PATH 미설정 시 그 경로를 쓴다.
  // (둘 다 없으면 컨테이너 내부 ./local-storage → 재배포 시 파일이 사라지므로 프로덕션에서는 반드시 둘 중 하나가 있어야 한다)
  VOLUME_PATH: z.string().optional(),
  RAILWAY_VOLUME_MOUNT_PATH: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),  // 없으면 AI 기능만 비활성, 서버는 기동
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // SMTP (비밀번호 초기화 이메일 발송용 — 선택)
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),  // 발신자 표시 이름+주소 (없으면 SMTP_USER 사용)
  APP_URL: z.string().optional(),    // 프론트 URL (이메일 링크용, 없으면 자동 감지)
  // HTML 도구(iframe) 를 프레임할 수 있는 앱 origin 목록(공백 구분, 선택).
  // 기본값은 프로덕션 도메인 https://class.chois.pro + APP_URL + localhost:3000.
  FRAME_ANCESTORS: z.string().optional(),
  // AI활용 허브 이전 스크립트용 업로드 토큰(PUT /api/ai/media 등). 없으면(빈 문자열 포함) 업로드 API 가 503.
  AI_MEDIA_UPLOAD_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).optional()),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  const data = result.data;
  const volumePath = data.VOLUME_PATH || data.RAILWAY_VOLUME_MOUNT_PATH || './local-storage';
  if (data.NODE_ENV === 'production' && !data.VOLUME_PATH && !data.RAILWAY_VOLUME_MOUNT_PATH) {
    console.warn('[env] VOLUME_PATH / RAILWAY_VOLUME_MOUNT_PATH 가 없어 ./local-storage 를 사용합니다 — 재배포 시 업로드 파일이 사라집니다!');
  }
  return { ...data, VOLUME_PATH: volumePath, VOLUME_PATH_SOURCE: data.VOLUME_PATH ? 'VOLUME_PATH' : (data.RAILWAY_VOLUME_MOUNT_PATH ? 'RAILWAY_VOLUME_MOUNT_PATH' : 'default') as 'VOLUME_PATH' | 'RAILWAY_VOLUME_MOUNT_PATH' | 'default' };
}

export const env = loadEnv();
export type Env = typeof env;
