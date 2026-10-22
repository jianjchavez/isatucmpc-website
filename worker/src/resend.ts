export type ResendMessage = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  reply_to?: string;
  attachments?: { filename: string; content: string }[]; // content is base64
};

/** POSTs one message to Resend. Resolves false on a non-2xx or a thrown fetch; never throws. */
export async function resend(env: { RESEND_API_KEY: string }, message: ResendMessage): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}
