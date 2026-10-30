/**
 * Service worker: the only place that holds the pairing token and talks to
 * Orbit. The content script never sees the token, and POSTing from here (not a
 * content script) avoids page CORS. Only normalized rows are sent — never
 * cookies, never Qalam credentials.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "send") return;
  (async () => {
    const { token, orbitUrl } = await chrome.storage.local.get(["token", "orbitUrl"]);
    if (!token || !orbitUrl) {
      sendResponse({ ok: false, error: "Not paired yet. Add your Orbit URL and pairing token in the extension, then try again." });
      return;
    }
    const endpoint = String(orbitUrl).replace(/\/+$/, "") + "/api/integrations/qalam/ingest";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ kind: msg.kind, rows: msg.rows, extractedAt: msg.extractedAt || new Date().toISOString() }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON error page */
      }
      sendResponse({ ok: res.ok, status: res.status, data });
    } catch (e) {
      sendResponse({ ok: false, error: "Could not reach Orbit: " + String((e && e.message) || e) });
    }
  })();
  return true; // async response
});
