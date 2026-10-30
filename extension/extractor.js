/**
 * Pure, DOM-free normalization for Qalam tables. Loaded as a classic content
 * script (sets `self.QalamExtractor`) and imported directly by the unit tests
 * (CommonJS). No network, no credentials, no DOM here — the content script
 * reads the DOM and hands this module plain `{ headers, rows }` tables.
 *
 * CALIBRATION: the header aliases below are best-effort guesses. Qalam's real
 * column names are unknown until a student shares redacted page HTML; several
 * are marked TODO(calibrate). The popup shows the detected mapping for review
 * before anything is sent, so a wrong guess is visible, never silent.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.QalamExtractor = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  /** Canonical columns Orbit expects per kind (must match QALAM_TEMPLATES server-side). */
  const COLUMNS = {
    marks: ["course", "assessment", "category", "obtained", "max", "weight", "class_average"],
    attendance: ["course", "date", "time", "status", "sessions"],
    timetable: ["course", "day", "start", "end", "room", "instructor", "kind"],
    results: ["term", "course", "credit_hours", "grade", "grade_points"],
    deadlines: ["course", "title", "due", "max", "weight", "url"],
  };

  /** Header text aliases (normalized) → canonical column. */
  const ALIASES = {
    course: ["course", "subject", "course code", "course title", "course name", "code"],
    assessment: ["assessment", "item", "activity", "component", "quiz", "exam", "name", "title"],
    category: ["category", "type", "kind", "assessment type"],
    obtained: ["obtained", "obtained marks", "marks obtained", "score", "secured", "achieved", "your marks"],
    max: ["max", "max marks", "total", "total marks", "out of"],
    weight: ["weight", "weightage", "absolute weightage", "percentage", "wtg"],
    class_average: ["class average", "average", "avg", "class avg"],
    date: ["date", "class date", "lecture date"],
    time: ["time", "slot", "start time"],
    status: ["status", "attendance", "remarks", "present absent"],
    sessions: ["sessions", "contact hours", "credit hour", "duration", "hours"],
    day: ["day", "weekday"],
    start: ["start", "from", "start time"],
    end: ["end", "to", "end time"],
    room: ["room", "venue", "location", "class room"],
    instructor: ["instructor", "teacher", "faculty"],
    term: ["term", "semester", "session"],
    credit_hours: ["credit hours", "credits", "cr hrs", "ch"],
    grade: ["grade", "letter grade", "gr"],
    grade_points: ["grade points", "gp", "points", "quality points"],
    title: ["title", "assignment", "task", "name"],
    due: ["due", "due date", "deadline", "submission date"],
    url: ["url", "link"],
  };

  /** Lowercase, strip punctuation to single spaces. */
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  }

  /** Does a normalized header match a canonical column? Exact alias > startsWith > includes. */
  function headerMatchesColumn(header, column) {
    const aliases = ALIASES[column] || [column];
    const h = norm(header);
    if (!h) return 0;
    for (const a of aliases) if (h === a) return 3;
    // Fuzzy tiers only for aliases/headers of 3+ chars, so short codes ("ch",
    // "gr", "to") and single-letter headers ("P"/"A") can't false-match.
    for (const a of aliases) if (a.length >= 3 && h.length >= 3 && (h.startsWith(a) || a.startsWith(h))) return 2;
    for (const a of aliases) if (a.length >= 3 && h.length >= 3 && h.includes(a)) return 1;
    return 0;
  }

  /** Map each canonical column for `kind` to the best-matching header index in `headers`. */
  function mapColumns(headers, kind) {
    const cols = COLUMNS[kind];
    const indexByCol = {};
    const used = new Set();
    for (const col of cols) {
      let best = -1;
      let bestScore = 0;
      headers.forEach((h, i) => {
        if (used.has(i)) return;
        const s = headerMatchesColumn(h, col);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      if (best >= 0) {
        indexByCol[col] = best;
        used.add(best);
      }
    }
    return indexByCol;
  }

  /**
   * Normalize the best table for `kind` into Orbit rows.
   * @param tables array of { headers: string[], rows: string[][] }
   * @returns { kind, rows, mapping, unmatchedHeaders, tableIndex, matchedColumns }
   */
  function normalizeTables(tables, kind) {
    const cols = COLUMNS[kind];
    if (!cols) throw new Error("Unknown kind: " + kind);
    let chosen = -1;
    let chosenMap = {};
    let chosenScore = -1;
    (tables || []).forEach((t, i) => {
      if (!t || !Array.isArray(t.headers) || !Array.isArray(t.rows) || !t.rows.length) return;
      const map = mapColumns(t.headers, kind);
      const score = Object.keys(map).length;
      // Must at least identify the course (or term, for results) to be a candidate.
      const hasAnchor = "course" in map || (kind === "results" && "term" in map);
      if (hasAnchor && score > chosenScore) {
        chosenScore = score;
        chosen = i;
        chosenMap = map;
      }
    });
    if (chosen < 0) return { kind, rows: [], mapping: {}, unmatchedHeaders: [], tableIndex: -1, matchedColumns: [] };

    const table = tables[chosen];
    const mapping = {};
    for (const col of Object.keys(chosenMap)) mapping[col] = table.headers[chosenMap[col]];
    const matchedIdx = new Set(Object.values(chosenMap));
    const unmatchedHeaders = table.headers.filter((_, i) => !matchedIdx.has(i)).map((h) => String(h).trim()).filter(Boolean);

    const rows = [];
    for (const r of table.rows) {
      if (!r || !r.some((c) => String(c).trim() !== "")) continue;
      const out = {};
      for (const col of Object.keys(chosenMap)) {
        const v = r[chosenMap[col]];
        out[col] = v == null ? "" : String(v).trim();
      }
      rows.push(out);
    }
    return { kind, rows, mapping, unmatchedHeaders, tableIndex: chosen, matchedColumns: Object.keys(chosenMap) };
  }

  /** Guess which kind a page's tables represent, by best match score. Returns null if weak. */
  function detectKind(tables) {
    let best = null;
    let bestScore = 1; // require at least 2 matched columns
    for (const kind of Object.keys(COLUMNS)) {
      const res = normalizeTables(tables, kind);
      if (res.matchedColumns.length > bestScore) {
        bestScore = res.matchedColumns.length;
        best = kind;
      }
    }
    return best;
  }

  return { COLUMNS, ALIASES, norm, mapColumns, normalizeTables, detectKind };
});
