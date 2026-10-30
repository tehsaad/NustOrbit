/**
 * Source of the Qalam export bookmarklet. It runs inside the student's own
 * logged-in Qalam tab, reads the data tables already rendered on the page, and
 * downloads them as CSV. It makes no network requests, stores nothing, and uses
 * no credentials — it only reads what the page is already showing the signed-in
 * user. The readable source is shown to the user before they use it.
 */
export const QALAM_BOOKMARKLET_SOURCE = `(function () {
  if (!/qalam\\.nust\\.edu\\.pk$/.test(location.hostname)) {
    alert("Open your Qalam page (marks, attendance, result, etc.) first, then run this.");
    return;
  }
  var tables = [].slice.call(document.querySelectorAll("table")).filter(function (t) { return t.rows.length > 1; });
  if (!tables.length) { alert("No data tables found on this page. Open a page that shows a table (marks, attendance...)."); return; }
  var esc = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""').replace(/\\s+/g, " ").trim() + '"'; };
  var csv = "\\ufeff";
  tables.forEach(function (t, i) {
    csv += "# Table " + (i + 1) + " — " + (document.title || location.pathname) + "\\n";
    [].slice.call(t.rows).forEach(function (r) {
      csv += [].slice.call(r.cells).map(function (c) { return esc(c.innerText); }).join(",") + "\\n";
    });
    csv += "\\n";
  });
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "qalam-export-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
})();`;

/** The javascript: URL form, for creating a bookmark. */
export const QALAM_BOOKMARKLET = "javascript:" + encodeURIComponent(QALAM_BOOKMARKLET_SOURCE);
