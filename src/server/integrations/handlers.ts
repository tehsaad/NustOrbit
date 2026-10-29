import "server-only";
import type { SyncHandler } from "./sync";
import { syncLms } from "./providers/lms";
import { syncGmail, syncGoogleCalendar } from "./providers/google";

/** Providers that support background/manual synchronization. */
export const SYNC_HANDLERS: Record<string, SyncHandler> = {
  lms: syncLms,
  "google-calendar": syncGoogleCalendar,
  gmail: syncGmail,
};
