/** Server-side "now" helpers kept outside component bodies. */
export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}
