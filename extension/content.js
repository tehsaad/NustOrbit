/**
 * Content script: runs only on qalam.nust.edu.pk pages the student opens. It
 * reads the DOM of the current page (no navigation, no fetching, no crawling)
 * and, when the popup asks, returns the tables normalized by extractor.js.
 * `QalamExtractor` is provided by extractor.js, loaded before this file.
 */
(function () {
  function cellText(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  /** Turn every <table> on the page into { headers, rows } for the extractor. */
  function tablesFromDocument(doc) {
    const out = [];
    doc.querySelectorAll("table").forEach((t) => {
      const trs = Array.from(t.querySelectorAll("tr"));
      if (!trs.length) return;
      // Header row = first row containing <th>, else the first row.
      let headerIdx = trs.findIndex((tr) => tr.querySelector("th"));
      if (headerIdx < 0) headerIdx = 0;
      const headers = Array.from(trs[headerIdx].children).map(cellText);
      const rows = trs.slice(headerIdx + 1).map((tr) => Array.from(tr.children).map(cellText));
      if (headers.length && rows.length) out.push({ headers, rows });
    });
    return out;
  }

  /** The page is a usable (logged-in) Qalam page if it isn't a login screen. */
  function isLoggedIn() {
    const url = location.href.toLowerCase();
    if (/\/login|signin|sign-in|\/web\/login/.test(url)) return false;
    if (document.querySelector('input[type="password"]')) return false;
    return true;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "extract") return;
    try {
      const tables = tablesFromDocument(document);
      const kind = msg.kind && msg.kind !== "auto" ? msg.kind : QalamExtractor.detectKind(tables);
      const result = kind ? QalamExtractor.normalizeTables(tables, kind) : { kind: null, rows: [], mapping: {}, unmatchedHeaders: [], matchedColumns: [] };
      sendResponse({ ok: true, loggedIn: isLoggedIn(), url: location.href, tableCount: tables.length, ...result });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
    return true; // responding synchronously, but keep the channel tidy
  });
})();
