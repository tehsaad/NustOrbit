/* Popup: pairing, read-and-review, then send. The review step shows the exact
   rows and column mapping before anything is sent to Orbit. */
const $ = (id) => document.getElementById(id);
let extracted = null; // { kind, rows, mapping, ... } from the content script

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "sub " + (cls || "");
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

async function getState() {
  const { token, orbitUrl } = await chrome.storage.local.get(["token", "orbitUrl"]);
  return { token, orbitUrl };
}

async function render() {
  const { token, orbitUrl } = await getState();
  const paired = Boolean(token && orbitUrl);
  $("pairing").classList.toggle("hide", paired);
  $("paired").classList.toggle("hide", !paired);
  $("work").classList.toggle("hide", !paired);
  if (paired) $("pairedUrl").textContent = orbitUrl;
}

$("save").addEventListener("click", async () => {
  const orbitUrl = $("orbitUrl").value.trim();
  const token = $("token").value.trim();
  if (!/^https?:\/\//.test(orbitUrl) || token.indexOf(".") <= 0) {
    setStatus("Enter a valid Orbit URL and the full pairing token.", "err");
    return;
  }
  await chrome.storage.local.set({ orbitUrl, token });
  $("token").value = "";
  setStatus("Pairing saved.", "ok");
  render();
});

$("changePairing").addEventListener("click", async () => {
  await chrome.storage.local.remove(["token", "orbitUrl"]);
  extracted = null;
  $("review").classList.add("hide");
  setStatus("Pairing cleared.");
  render();
});

$("read").addEventListener("click", async () => {
  setStatus("Reading page…");
  $("review").classList.add("hide");
  $("send").disabled = true;
  extracted = null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/qalam\.nust\.edu\.pk\//.test(tab.url || "")) {
    setStatus("Open your Qalam page (qalam.nust.edu.pk) in this tab first.", "warn");
    return;
  }
  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, { type: "extract", kind: $("kind").value });
  } catch {
    setStatus("Couldn't read the page. Reload the Qalam tab and try again.", "err");
    return;
  }
  if (!res || !res.ok) {
    setStatus("Extract failed: " + ((res && res.error) || "unknown"), "err");
    return;
  }
  if (res.loggedIn === false) {
    setStatus("You're not signed into Qalam in this tab. Log in, open the page, then read again.", "warn");
    return;
  }
  if (!res.kind || !res.rows.length) {
    setStatus(`Found ${res.tableCount} table(s) but no ${$("kind").value === "auto" ? "recognizable" : $("kind").value} data. Pick the right type, or share this page's HTML with Orbit to calibrate.`, "warn");
    return;
  }
  extracted = res;
  showReview(res);
});

function showReview(res) {
  $("review").classList.remove("hide");
  $("reviewHead").innerHTML = `Detected <b>${esc(res.kind)}</b> — <b>${res.rows.length}</b> row(s) from table #${res.tableIndex + 1}.`;
  const mapParts = Object.keys(res.mapping).map((c) => `${esc(c)} ← "${esc(res.mapping[c])}"`);
  let mapHtml = "Columns: " + (mapParts.join(", ") || "none");
  if (res.unmatchedHeaders && res.unmatchedHeaders.length) mapHtml += `<br>Ignored: ${res.unmatchedHeaders.map(esc).join(", ")}`;
  $("mapping").innerHTML = mapHtml;

  const cols = Object.keys(res.mapping);
  const head = "<tr>" + cols.map((c) => `<th>${esc(c)}</th>`).join("") + "</tr>";
  const body = res.rows.slice(0, 10).map((r) => "<tr>" + cols.map((c) => `<td>${esc(r[c])}</td>`).join("") + "</tr>").join("");
  const more = res.rows.length > 10 ? `<div class="muted">…and ${res.rows.length - 10} more</div>` : "";
  $("preview").innerHTML = `<table>${head}${body}</table>${more}`;
  $("send").disabled = false;
  setStatus(`Review the ${res.rows.length} row(s) and column mapping, then send.`, "");
}

$("send").addEventListener("click", async () => {
  if (!extracted || !extracted.rows.length) return;
  $("send").disabled = true;
  setStatus("Sending to Orbit…");
  const res = await chrome.runtime.sendMessage({ type: "send", kind: extracted.kind, rows: extracted.rows, extractedAt: new Date().toISOString() });
  if (res && res.ok) {
    const d = res.data || {};
    setStatus(`Imported ${d.imported ?? extracted.rows.length} row(s)${d.skipped && d.skipped.length ? `, skipped ${d.skipped.length}` : ""}.`, "ok");
  } else if (res && res.status === 401) {
    setStatus("Orbit rejected the token. Create a new pairing token in Orbit and re-pair.", "err");
  } else if (res && res.status === 429) {
    setStatus("Too soon after the last import — wait a few seconds and try again.", "warn");
  } else {
    setStatus("Send failed: " + ((res && (res.error || (res.data && res.data.error))) || res.status || "unknown"), "err");
    $("send").disabled = false;
  }
});

render();
