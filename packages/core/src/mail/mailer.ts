import mjml2html from 'mjml';
import nodemailer, { type Transporter } from 'nodemailer';
import { config, mailEnabled } from '../config.js';

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  /** MJML source — compiled to responsive HTML before sending. */
  mjml: string;
  /** Plain-text fallback for clients that don't render HTML. */
  text?: string;
}

/**
 * Render MJML → HTML and send it over SMTP. When SMTP is unconfigured (dev),
 * the message is logged instead of thrown so flows still complete locally.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const { html, errors } = mjml2html(message.mjml, { validationLevel: 'soft', minify: true });
  if (errors.length) {
    console.warn('[mail] MJML warnings:', errors.map((e) => e.formattedMessage).join('; '));
  }
  if (!mailEnabled()) {
    console.log(`[mail] (SMTP disabled) would send "${message.subject}" to ${message.to}`);
    return;
  }
  await getTransport().sendMail({
    from: config.smtp.from,
    to: message.to,
    subject: message.subject,
    html,
    text: message.text,
  });
}
