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
