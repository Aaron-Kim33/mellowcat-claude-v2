interface ResendEmailConfig {
  apiKey: string;
  from: string;
  replyTo?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function getResendEmailConfig(): ResendEmailConfig | undefined {
  const apiKey = process.env.MELLOWCAT_RESEND_API_KEY?.trim();
  const from = process.env.MELLOWCAT_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    return undefined;
  }

  return {
    apiKey,
    from,
    replyTo: process.env.MELLOWCAT_EMAIL_REPLY_TO?.trim() || undefined
  };
}

export async function sendEmail(
  config: ResendEmailConfig,
  input: SendEmailInput
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(config.replyTo ? { reply_to: config.replyTo } : {})
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Email delivery failed (${response.status}): ${text || response.statusText}`);
  }
}
