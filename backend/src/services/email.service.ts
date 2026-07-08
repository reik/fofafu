import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

interface VerificationParams {
  to: string;
  name: string;
  token: string;
}

// In test mode we collect emails in-memory so tests can assert on them.
export const testInbox: { to: string; subject: string; url: string }[] = [];

function shouldUseFakeMailer(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  // No SMTP creds → dev/CI fallback: log the link to stdout instead of crashing.
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return true;
  return false;
}

export async function sendVerificationEmail({ to, name, token }: VerificationParams): Promise<void> {
  const url = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/verify-email?token=${token}`;
  const subject = 'Welcome to fofafu — verify your email';

  if (shouldUseFakeMailer()) {
    testInbox.push({ to, subject, url });
    if (process.env.NODE_ENV !== 'test') {
      logger.info({ msg: 'email:fake verify', to, name, url });
    }
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"fofafu" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: auto; color:#1F1B18;">
        <h1 style="font-weight: 540;">Welcome to fofafu, ${escapeHtml(name)}</h1>
        <p>Thanks for joining. Tap the button below to confirm your email and finish setting up your family.</p>
        <p>
          <a href="${url}" style="display:inline-block;padding:12px 20px;background:#4D9463;color:#fff;border-radius:9999px;text-decoration:none;font-weight:600;">
            Verify my email
          </a>
        </p>
        <p style="color:#5E534B;font-size:13px;">Link expires in 24 hours. If you didn't sign up, ignore this email.</p>
      </div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' :
                '&#39;'
  );
}

interface ResetParams {
  to: string;
  name: string;
  token: string;
}

export async function sendPasswordResetEmail({ to, name, token }: ResetParams): Promise<void> {
  const url = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/reset-password?token=${token}`;
  const subject = 'fofafu — reset your password';

  if (shouldUseFakeMailer()) {
    testInbox.push({ to, subject, url });
    if (process.env.NODE_ENV !== 'test') {
      logger.info({ msg: 'email:fake reset', to, name, url });
    }
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"fofafu" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: auto; color:#1F1B18;">
        <h1 style="font-weight: 540;">Reset your fofafu password</h1>
        <p>Hi ${escapeHtml(name)}, we got a request to reset your password. Tap the button below if it was you.</p>
        <p>
          <a href="${url}" style="display:inline-block;padding:12px 20px;background:#4D9463;color:#fff;border-radius:9999px;text-decoration:none;font-weight:600;">
            Set a new password
          </a>
        </p>
        <p style="color:#5E534B;font-size:13px;">Link expires in 1 hour. If you didn't ask for this, ignore this email — your password stays unchanged.</p>
      </div>
    `,
  });
}
