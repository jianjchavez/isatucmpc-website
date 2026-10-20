/** Cloudflare Turnstile siteverify. False on a non-success answer or a network error. */
export async function verifyTurnstile(secret: string, token: string): Promise<boolean> {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
    });
    const json = await res.json<{ success?: boolean }>();
    return json.success === true;
  } catch {
    return false;
  }
}
