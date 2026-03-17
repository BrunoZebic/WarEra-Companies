export function hasValidCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");

  if (!secret) {
    return false;
  }

  return authorization === `Bearer ${secret}`;
}
