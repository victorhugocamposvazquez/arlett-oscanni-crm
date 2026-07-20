/** Autoriza cron/webhook internos vía CRON_SECRET o Authorization Bearer. */
export function authorizeCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // En desarrollo sin secret, permitir (solo local)
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const header = req.headers.get("x-cron-secret");
  if (header === secret) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

export function authorizeWebhookSecret(req: Request, envName: string): boolean {
  const secret = process.env[envName]?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const header = req.headers.get("x-webhook-secret") ?? req.headers.get("authorization");
  if (header === secret || header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}
