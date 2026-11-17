// Staff alert to the coop's Telegram group (bot @isatucmpc_alerts_bot). Off unless both secrets are set.
// Send-only: the group's Apps Script owns the bot's updates, so this never reads or sets a webhook.
export type TelegramEnv = { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string };

export async function notifyTelegram(env: TelegramEnv, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
  } catch {
    // Never log or rethrow: the request URL carries the bot token.
  }
}

/**
 * First name for a staff alert. The name is typed by the public, so only a plain word of
 * letters gets through; anything Telegram could turn into a link falls back to "Applicant".
 */
export function alertFirstName(fullName: string): string {
  const word = fullName.trim().split(/\s+/)[0] ?? '';
  return /^\p{L}[\p{L}'-]{0,29}$/u.test(word) ? word : 'Applicant';
}
