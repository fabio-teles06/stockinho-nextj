/** Usa uma origem configurada, sem confiar em cabeçalhos encaminhados pelo cliente. */
export function isAllowedOrigin(request: Request, applicationUrl?: string): boolean {
  const supplied = request.headers.get('origin');
  if (!supplied) return true;
  try {
    const allowed = new URL(applicationUrl || request.url).origin;
    return supplied === allowed;
  } catch {
    return false;
  }
}
