import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

/** SMTP 설정 여부 확인 */
export function isMailConfigured(): boolean {
  return !!(env.SMTP_USER && env.SMTP_PASS);
}

/** Nodemailer transporter (lazy init) */
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    if (!isMailConfigured()) {
      throw new Error('SMTP is not configured (SMTP_USER, SMTP_PASS)');
    }
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER!,
        pass: env.SMTP_PASS!,
      },
    });
  }
  return _transporter;
}

/** 비밀번호 초기화 이메일 전송 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  userName: string | null,
): Promise<void> {
  const transporter = getTransporter();
  const from = env.SMTP_FROM || `ChoisClass <${env.SMTP_USER}>`;
  const displayName = userName || to;

  await transporter.sendMail({
    from,
    to,
    subject: '[ChoisClass] 비밀번호 초기화',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e40af; margin-bottom: 16px;">비밀번호 초기화</h2>
        <p style="color: #374151; line-height: 1.6;">
          안녕하세요, <strong>${displayName}</strong>님.
        </p>
        <p style="color: #374151; line-height: 1.6;">
          비밀번호 초기화가 요청되었습니다. 아래 버튼을 클릭하면 비밀번호가 초기화되고 로그인 페이지로 이동합니다.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; padding: 12px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
            비밀번호 초기화
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          초기화 후 로그인할 때 입력하는 비밀번호가 새 비밀번호로 설정됩니다.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
          본인이 요청하지 않았다면 이 이메일을 무시하세요. 이 링크는 1시간 동안 유효합니다.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          ChoisClass &mdash; 수학 학습 플랫폼
        </p>
      </div>
    `,
  });
}
