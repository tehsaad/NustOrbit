import { NextResponse, type NextRequest } from "next/server";
import { getUserOrNull } from "@/server/auth/session";
import { completeGoogleAuth, consumeOAuthState } from "@/server/integrations/providers/google";
import { runSync } from "@/server/integrations/sync";
import { SYNC_HANDLERS } from "@/server/integrations/handlers";
import { describeError } from "@/server/integrations/errors";
import { recordAudit } from "@/server/audit";
import { log } from "@/server/log";

export async function GET(request: NextRequest) {
  const back = (params: Record<string, string>) => NextResponse.redirect(new URL(`/integrations?${new URLSearchParams(params)}`, request.url));
  const user = await getUserOrNull();
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.url));
  const sp = request.nextUrl.searchParams;
  const error = sp.get("error");
  try {
    const state = await consumeOAuthState(sp.get("state"), user.id);
    if (error) return back({ error: error === "access_denied" ? "You declined the Google permission request." : "Google returned an error." });
    const code = sp.get("code");
    if (!code) return back({ error: "Google did not return an authorization code." });
    const connection = await completeGoogleAuth(state, code);
    await recordAudit({ userId: user.id, action: "integration.connected", targetType: "integration", targetId: state.provider, metadata: { scopes: connection.grantedScopes } });
    if (connection.status === "CONNECTED") await runSync(connection, "connect", SYNC_HANDLERS[state.provider]);
    return back(connection.status === "CONNECTED" ? { connected: state.provider } : { error: "A required permission was not granted. Connect again and allow access." });
  } catch (e) {
    log.warn("oauth.callback_failed", { error: e });
    return back({ error: describeError(e) });
  }
}
