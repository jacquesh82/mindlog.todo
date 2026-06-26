export interface PasswordResetEmailInput {
  resetUrl: string;
  displayName?: string | null;
  /** Human-readable token lifetime, e.g. "1 hour". */
  expiresIn: string;
}

const BRAND = '#db4c3f';

/** Build the password-reset email (MJML source + plain-text fallback). */
export function passwordResetEmail(input: PasswordResetEmailInput): {
  subject: string;
  mjml: string;
  text: string;
} {
  const greeting = input.displayName ? `Hi ${input.displayName},` : 'Hi,';
  const subject = 'Reset your mindlog password';
  const mjml = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Inter, Helvetica, Arial, sans-serif" />
      <mj-text font-size="15px" color="#2b2b2b" line-height="1.6" />
    </mj-attributes>
    <mj-style inline="inline">.btn a { color:#ffffff !important; }</mj-style>
  </mj-head>
  <mj-body background-color="#f5f5f4">
    <mj-section padding="32px 0 8px">
      <mj-column>
        <mj-text align="center" font-size="20px" font-weight="700" color="${BRAND}">mindlog.todo</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" border-radius="12px" padding="32px">
      <mj-column>
        <mj-text font-size="18px" font-weight="600">${greeting}</mj-text>
        <mj-text>We received a request to reset the password for your mindlog account. Choose a new one with the button below.</mj-text>
        <mj-button css-class="btn" background-color="${BRAND}" border-radius="8px" href="${input.resetUrl}" padding="16px 0">Reset my password</mj-button>
        <mj-text color="#6b7280" font-size="13px">This link expires in ${input.expiresIn}. If you didn't request a reset, you can safely ignore this email — your password won't change.</mj-text>
        <mj-text color="#9ca3af" font-size="12px">Or paste this link into your browser:<br />${input.resetUrl}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="16px 0 32px">
      <mj-column>
        <mj-text align="center" color="#9ca3af" font-size="12px">Capture fast. Organize calmly.</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`.trim();
  const text = `${greeting}

Reset your mindlog password with this link (expires in ${input.expiresIn}):
${input.resetUrl}

If you didn't request this, you can ignore this email.`;
  return { subject, mjml, text };
}
