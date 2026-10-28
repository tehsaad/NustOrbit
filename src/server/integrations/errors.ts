/** Authorization was revoked or expired: sync pauses and the user is asked to reconnect. */
export class ProviderAuthError extends Error {
  readonly kind = "auth";
}

/** Provider unreachable / 5xx / timeout: transient, retried on the next run. */
export class ProviderUnavailableError extends Error {
  readonly kind = "unavailable";
}

/** The user's configuration is invalid (bad URL, wrong file). Not retried until changed. */
export class ProviderConfigError extends Error {
  readonly kind = "config";
}

export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 500);
  return "Unknown error";
}
