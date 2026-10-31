export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// The payload only schedules renewal; Supabase still validates authentication.
export function needsSessionRefresh(token: string | undefined, now = Date.now()) {
  if (!token) return true;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload)) as { exp?: number };
    return typeof exp !== "number" || exp * 1000 <= now + 60000;
  } catch {
    return true;
  }
}
